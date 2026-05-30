# MCP OAuth external tool allowlist

External AI clients (Claude, ChatGPT) connect via OAuth (`token_type = oauth` on `mcp_workspace_tokens`). They should **not** receive the full `agentsam_mcp_tools` catalog (~250 keys after scope resolution).

## Canonical tables

| Table | Role |
|-------|------|
| `agentsam_mcp_tools` | Full registry (global + workspace/user rows) |
| `agentsam_mcp_oauth_tool_allowlist` | Curated subset per OAuth `client_id` |

Legacy `mcp_registered_tools` was dropped in migration 402.

## Why tools looked “duplicated”

Many `tool_key` values appear twice in D1 because there is a **global** row (`mal_sync_*`) and a **workspace** row (`amt_*` / user-scoped). That is intentional multitenant data, not bad inserts.

**Fix:** MCP `tools/list` resolves **one row per `tool_key`** for the token’s workspace (workspace → user → tenant → global). Do not `DELETE` workspace rows to “dedupe.”

## Tool identity (MCP server v2.6.0+)

| Layer | Field | Example |
|-------|--------|---------|
| D1 registry | `agentsam_mcp_tools.tool_key` | `d1_query` |
| Client-facing name | `display_name` (also in allowlist) | `agentsam_db_query` |
| Alias table | `agentsam_capability_aliases.abstract_capability` → `match_value` | `agentsam_db_query` → `d1_query` |

**`tools/list`** returns `display_name` as MCP `name`. **`tools/call`** accepts that name, resolves to `tool_key`, then dispatches. Reconnect external clients after deploy to refresh the catalog.

Migration **406** (script: `scripts/migration_406.py`) backfills display names, OAuth allowlist keys, and capability aliases.

## OAuth allowlist (migration 403 + 406)

**Client:** `iam_mcp_inneranimalmedia`  
**Count:** 46 curated tools after migration **407** (canonical **`agentsam_*`** names in `agentsam_mcp_oauth_tool_allowlist.tool_key`)

### Discovery (read-only, migration 407)

| Tool | Purpose |
|------|---------|
| `agentsam_health_check` | Server version + workspace/token binding + binding flags (no secrets) |
| `agentsam_workspace_context` | `workspaces` + `workspace_settings` + default model |
| `agentsam_recent_errors` | Last N rows from `agentsam_error_log` for this workspace |
| `agentsam_search_tools` | Search `agentsam_mcp_tools` by name / lane / description |

### Read (discovery-safe)

| Tool (MCP `name`) | Purpose |
|------|---------|
| `agentsam_db_query`, `agentsam_db_explain`, `agentsam_db_schema` | Read D1 / schema |
| `agentsam_r2_read`, `agentsam_r2_list`, `agentsam_r2_search`, `agentsam_r2_summary` | Read storage |
| `agentsam_github_repo_list`, `agentsam_github_file`, … | Read GitHub |
| `agentsam_web_fetch` | Fetch allowed URLs |
| `agentsam_knowledge_search`, `agentsam_rag_search`, `agentsam_context_search` | Search / RAG |
| `agentsam_memory_search` | Memory read |
| `agentsam_list_agents`, `agentsam_get_agent` | Agent metadata |
| `agentsam_workspace_search`, `agentsam_human_context_list` | Workspace context |
| `agentsam_ai_embed` | Embeddings only |

### Write (Sam + Connor — Claude / ChatGPT)

| Tool (MCP `name`) | Purpose |
|------|---------|
| `agentsam_run` | Run Agent Sam (handler: `agentsam_run_agent`; approval flags in registry) |
| `agentsam_plan`, `agentsam_todo_add`, `agentsam_todo_update` | Planning / todos |
| `agentsam_memory_save` | Private managed memory (D1 + `agentsam.agentsam_memory`); types include **policy** / **state** |
| `agentsam_memory_write` | **Vectorize semantic** write only — not operational KV (see `docs/agentsam_knowledge/mcp_memory_schema_refresh.md`) |
| `agentsam_github_create_file`, `agentsam_github_create_branch`, `agentsam_github_create_pr`, `agentsam_github_merge_pr` | GitHub write (repo-bound) |
| `agentsam_github_create_repo` | Create repo on **your** GitHub account |
| `agentsam_db_write` | D1 mutations — SQL must include your `tenant_id` or `workspace_id` |
| `agentsam_r2_write` | Write objects under workspace `r2_prefix` |
| `agentsam_ai_complete` | LLM completion |

### Explicitly excluded from external OAuth

- `terminal_execute`, `terminal_run`, `terminal_wrangler`
- `d1_write` (destructive SQL)
- `github_delete_*`, `github_bulk_update_files`, `github_merge_pr` (expand via migration if needed)
- Deploy / wrangler / bulk admin tools

Personal MCP bearer tokens (Cursor `/auth/connect`) keep **full** scoped catalog unless `allowed_tools` is set on the token row.

## Enforcement (OAuth external clients)

Order on **`tools/call`** (`inneranimalmedia-mcp-server` `mcp-oauth-guards.js`):

1. OAuth **scopes** + client `access_class` (`agentsam_mcp_oauth_tool_allowlist`)
2. **Personal allowlist** — `agentsam_mcp_allowlist` when `agentsam_user_policy.require_allowlist_for_mcp = 1` (IAM Settings → Network)
3. **Policy risk cap** — `tool_risk_level_max` vs `agentsam_mcp_tools.risk_level`
4. **Guardrails** — `agentsam_guardrails` / `agentsam_guardrail_rulesets` with `applies_to = mcp_tool` → `agentsam_guardrail_events`
5. Tool **`requires_approval`** + privileged handler patterns
6. **Browser trust** — `agentsam_browser_trusted_origin` for browser/playwright tools

**Token issue** (`src/api/oauth.js` + `mcp-oauth-shared.js`):

- `allowed_tools` = intersection of `agentsam_mcp_oauth_tool_allowlist` and user allowlist (when policy requires it)
- `allowed_domains_json` carries `require_allowlist_for_mcp` + `tool_risk_level_max` for runtime policy refresh

**MCP server** (`tools/list` + `tools/call`) — `token_type = oauth` filters to `allowed_tools`; runtime re-checks allowlist + guardrails even if token was minted earlier.

## Adjusting the list

```sql
INSERT OR IGNORE INTO agentsam_mcp_oauth_tool_allowlist
  (client_id, tool_key, access_class, sort_order, notes)
VALUES
  ('iam_mcp_inneranimalmedia', 'my_new_tool', 'read', 200, 'reason');

-- Disable without delete:
UPDATE agentsam_mcp_oauth_tool_allowlist
SET is_active = 0, updated_at = unixepoch()
WHERE client_id = 'iam_mcp_inneranimalmedia' AND tool_key = 'r2_write';
```

Re-connect Claude/ChatGPT after changes (or update existing OAuth rows’ `allowed_tools`).

## Workspace isolation (Connor vs Sam)

Same **tool names** for both users; **data access** is isolated:

| Surface | Enforcement |
|---------|-------------|
| **GitHub** | Uses **your** `user_oauth_tokens` GitHub OAuth — not the platform `GITHUB_TOKEN`. Repo mutating tools are limited to `workspaces.github_repo` for your token’s workspace. `github_repos` lists only repos your GitHub user can see. |
| **R2** | Keys are prefixed with `workspaces.r2_prefix` (`inneranimalmedia/` vs `leadership-legacy/`). |
| **D1** | `d1_query` / `d1_write` require SQL containing your `tenant_id` or `workspace_id`. |

OAuth tokens store `workspace_id`, `tenant_id`, `user_id`, `github_repo`, and `allowed_tools` at issue time (consent-bound workspace).

**Reconnect** Claude/ChatGPT after deploy so tokens pick up new allowlist + bindings.

## Sam vs Connor

Same allowlist catalog; isolation is per workspace + per-user GitHub OAuth. To shrink Connor’s tool surface further, disable rows in `agentsam_mcp_oauth_tool_allowlist` or add a second policy `client_id`.
