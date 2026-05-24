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

## OAuth allowlist (migration 403)

**Client:** `iam_mcp_inneranimalmedia`  
**Count:** 35 tools (25 read, 10 write)

### Read (discovery-safe)

| Tool | Purpose |
|------|---------|
| `d1_query`, `d1_explain`, `d1_schema_introspect` | Read D1 / schema |
| `r2_read`, `r2_list`, `r2_search`, `r2_bucket_summary` | Read storage |
| `github_repos`, `github_file`, `github_list_directory`, `github_get_tree`, `github_list_issues`, `github_get_issue`, `github_compare_refs`, `github_list_branches` | Read GitHub |
| `web_fetch` | Fetch allowed URLs |
| `knowledge_search`, `rag_search`, `context_search` | Search / RAG |
| `agent_memory_search` | Memory read |
| `agentsam_list_agents`, `agentsam_get_agent` | Agent metadata |
| `workspace_search`, `human_context_list` | Workspace context |
| `ai_embed` | Embeddings only |

### Write (Sam + Connor — Claude / ChatGPT)

| Tool | Purpose |
|------|---------|
| `agentsam_run_agent` | Run Agent Sam (registry `requires_approval` still applies) |
| `agentsam_plan_create`, `agentsam_todo_create`, `agentsam_todo_update` | Planning / todos |
| `agent_memory_write` | Persist memory |
| `github_create_file`, `github_create_branch`, `github_create_pr` | GitHub write |
| `r2_write` | Write objects |
| `ai_complete` | LLM completion |

### Explicitly excluded from external OAuth

- `terminal_execute`, `terminal_run`, `terminal_wrangler`
- `d1_write` (destructive SQL)
- `github_delete_*`, `github_bulk_update_files`, `github_merge_pr` (expand via migration if needed)
- Deploy / wrangler / bulk admin tools

Personal MCP bearer tokens (Cursor `/auth/connect`) keep **full** scoped catalog unless `allowed_tools` is set on the token row.

## Enforcement

1. **Token issue** (`src/api/oauth.js`) — sets `mcp_workspace_tokens.allowed_tools` JSON from allowlist.
2. **MCP server** (`tools/list` + `tools/call`) — `token_type = oauth` or non-null `allowed_tools` filters to the list.

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

## Sam vs Connor

Same allowlist for both users today. Workspace isolation comes from the OAuth token’s `workspace_id` (auto-bound at consent). To give Connor a smaller set later, add `user_id` to the allowlist table or a second `client_id` policy row.
