# IAM Runtime Architecture — Both Repos

Applies to:

- `/Users/samprimeaux/inneranimalmedia` (main worker)
- `/Users/samprimeaux/inneranimalmedia-mcp-server` (MCP worker)

Last verified against remote D1 + both codebases: **2026-06-02**  
Post migrations: **502, 498, 508, 509, 510**

Related: [tenant credential lanes](./tenant-credential-lanes-2026-06.md) · BYOK gate: `.scratch/d1-byok-alignment-audit.sql`

---

## Two Repos. One Catalog. Two Surfaces.

| | Main Worker | MCP Worker |
|--|-------------|------------|
| Repo | `/Users/samprimeaux/inneranimalmedia` | `/Users/samprimeaux/inneranimalmedia-mcp-server` |
| URL | `inneranimalmedia.com` | `mcp.inneranimalmedia.com` |
| Deploy | `npm run deploy:full` | `cd .../inneranimalmedia-mcp-server && npm run deploy:full` |
| Surface | Dashboard / in-app Agent Sam | External OAuth clients (Claude.ai, ChatGPT, Cursor) |
| Catalog | reads `agentsam_tools` | reads `agentsam_tools` (same D1) |
| Executor | `catalog-tool-executor.js` | `dispatchTool()` in `index.js` |
| Credential resolver | `src/core/resolve-credential.js` | `mcp-user-credentials.js` |

Never `npm run deploy` alone. Always `npm run deploy:full`.  
Never mix code, config, or deploy commands between repos.  
Every Cursor prompt must name which repo is being edited.

---

## Surface Routing — Where Each Request Goes

### In-App (Dashboard)

```
User action in dashboard
  → main IAM worker (src/index.js)
  → auth: getAuthUser() → user_id, tenant_id, workspace_id, role
  → loadAgentsamToolRow() reads agentsam_tools WHERE tool_name = ?
  → dispatchByToolCode() → catalog-tool-executor.js
  → resolveCredential() → user_api_keys + user_secrets (or superadmin bypass)
  → tool executes on main worker
  → result returned to dashboard
```

### External MCP (Claude.ai / ChatGPT / Cursor)

```
External client connects to mcp.inneranimalmedia.com
  → OAuth PKCE flow
  → agentsam_mcp_oauth_external_client_registry matches redirect host → client_key
  → oauth_clients validates client_id → issues access token
  → agentsam_mcp_oauth_tool_allowlist gates which tools this surface can call
  → agentsam_mcp_oauth_user_client_allowlist confirms user ↔ surface grant
  → mcp-oauth-guards.js risk/scope checks
  → MCP worker dispatchTool() executes tool LOCALLY on MCP worker
  → proxyToMainWorker() only for unimplemented fallback handlers
  → result returned to external client
```

---

## The Golden Rule: In-App Agent Never Routes Through MCP Server

`src/api/agent.js` goes through `dispatchByToolCode` only — no `/api/mcp/invoke` calls.

```
CORRECT:   Dashboard agent → main worker → catalog-tool-executor → done
WRONG:     Dashboard agent → main worker → mcp.inneranimalmedia.com → back to main
```

Reasons: extra Worker hop latency, `AGENTSAM_BRIDGE_KEY` overhead, doubled failure surface, token burn on bridge serialization.

- `AGENTSAM_BRIDGE_KEY` flows MCP worker → main worker only. Never the reverse.
- If you find main worker → MCP server calls in agent/tool paths: flag and remove them.

**Note on `/api/mcp/invoke`:** This route exists on the main worker (`src/api/mcp.js`) as a session-authenticated dashboard RPC proxy used by `dashboard/mcp.html` and `MCPPanel.tsx` to exercise the external MCP surface directly from the dashboard UI. This is NOT the agent tool execution path and is NOT a regression. Do not remove it. Do not call it from `agent.js` or any tool executor.

`proxyToMainWorker()` in the MCP server (MCP → main) is correct and expected.

---

## Single Catalog: agentsam_tools

`agentsam_tools` is the ONE source of truth for tool definitions in both repos.  
`agentsam_mcp_tools` was dropped in migration 498. It does not exist. Never reference it.

All tool keys use the `agentsam_*` prefix in D1 (e.g. `agentsam_d1_query`, not `d1_query`).

### Tool available on MCP surface when ALL are true

1. `agentsam_tools.is_active = 1`
2. `agentsam_tools.oauth_visible = 1`
3. Row in `agentsam_mcp_oauth_tool_allowlist`: `client_id = 'iam_mcp_inneranimalmedia'` + `tool_key` + `is_active = 1`
4. `agentsam_mcp_oauth_user_client_allowlist`: user ↔ surface grant
5. OAuth token `allowed_tools` snapshot ∪ live allowlist merge passes
6. `mcp-oauth-guards.js` risk/guardrail checks pass
7. OAuth scopes: `mcp:tools` required; `iam:agent` required for write-class tools

Tool existence in `agentsam_tools` alone does NOT grant MCP access.

---

## Handler Type + Provider — Canonical Pairs

Both repos branch on `handler_type`. Both read the same `handler_config` fields from D1.

| handler_type | provider | Credential needed | Operations |
|-------------|----------|------------------|------------|
| `cf` | `cloudflare` | `CLOUDFLARE_API_TOKEN` (CF account API) | `d1.query`, `d1.write`, `d1.migrate`, `r2.read`, `r2.write`, `r2.delete`, `kv.manage` |
| `hyperdrive` | `supabase` | `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | `supabase.query`, `supabase.write`, `vector.search`, `autorag.search` |
| `github` | `github` | `user_oauth_tokens` | `list_repos`, `get_file`, `update_file`, `create_issue`, `create_pr` |
| `memory` | null | tenant-scoped internal | `memory.manage` |
| `notify` | `resend` | platform Resend (`platform_scoped`) | `send_email` |
| `terminal` | null | `PTY_AUTH_TOKEN` | operator-gated |
| `deploy` | null | operator-gated | `deploy` |

**`cf` + `cloudflare` always travel together** — CF account API operations (D1/R2/KV).  
**`hyperdrive` + `supabase` always travel together** — Postgres/pgvector via Supabase keys.  
Hyperdrive is a CF product but a different executor branch, different credential, different protocol.  
Never use `cf` for Supabase tools. Never use `hyperdrive` for CF account ops.

Sub-operation routing uses `handler_config.operation` only.  
Do NOT create new `handler_type` values for CF or Supabase sub-operations.  
`handler_type: d1` in production = bug. Fix to `cf`.

---

## handler_config Field Rules (enforced in both repos)

### binding — OPERATOR ONLY, never on oauth_visible tools

| binding | Meaning | Allowed on oauth_visible = 1? |
|---------|---------|------------------------------|
| `DB` | Platform D1 Worker binding | NO |
| `ASSETS` | Platform R2 Worker binding | NO |
| `HYPERDRIVE` | Platform CF Hyperdrive binding | NO |
| `internal` | Platform-internal dispatch | NO |
| `null` | Resolve from user_api_keys | YES — required |

### auth_source

| Value | Credential source |
|-------|------------------|
| `workspace` / `api_key` | `user_api_keys` + `user_secrets` — scoped to user+tenant+workspace |
| `user_oauth_tokens` | OAuth token table (GitHub, Google) |
| `platform_scoped` | `env.*` Worker secrets — operator tools only |
| `null` / missing | Bug — treat as `workspace`, never platform |

### data_plane

| Value | Resolves to |
|-------|-------------|
| `user` | User's BYOK credentials from `user_api_keys` |
| `platform` | Platform Worker binding — superadmin only |

### operation strings (canonical, both repos must match)

```
cf lane:         d1.query, d1.write, d1.migrate
                 r2.read, r2.write, r2.delete
                 kv.manage
hyperdrive lane: supabase.query → run_readonly_sql (SELECT/EXPLAIN only, rejects mutations)
                 supabase.write → run_write_sql (mutations, never through readonly path)
                 vector.search  → pgvector semantic search
                 autorag.search → RAG search path
```

---

## Credential Resolution (both repos, identical policy, two implementations)

Both repos use the same D1 tables and must implement the same policy.  
When you change one resolver, update the other.

| | Main worker | MCP worker |
|--|-------------|------------|
| File | `src/core/resolve-credential.js` | `mcp-user-credentials.js` |
| Supporting | `workspace-cloudflare-credentials.js` | `mcp-user-credentials.js` local helpers |
| Tables | `user_api_keys` + `user_secrets` | same |
| Bypass gate | `user.role === 'superadmin'` or `user.is_superadmin` | same |

### Superadmin bypass — role flag only, never tenant ID strings

```javascript
// CORRECT
if (user.role === 'superadmin' || user.is_superadmin) {
  return getPlatformCredential(provider, env);
}

// WRONG — never in application code
if (tenantId === 'tenant_sam_primeaux') { ... }
```

Tenant ID strings belong only in D1 data rows. Never in application code.

### BYOK resolution (all non-superadmin users)

Production resolvers use one `user_api_keys` row per provider. The `key_hash` or `vault_secret_id` points to the encrypted material in `user_secrets`. Additional context (CF `account_id`, Supabase `project_ref`) lives in `metadata_json` on the key row.

```javascript
// One row per provider, scoped to user + workspace
loadUserApiKeyRow(provider, userId, workspaceId)
  → decrypt via vault_secret_id → user_secrets.secret_value_encrypted (VAULT_KEY)
  → read metadata_json for account_id / project_ref
  → build credential object for tool call

// No rows → CredentialNotConfiguredError
// Never silent fallthrough to platform bindings
```

MCP resolver (`mcp-user-credentials.js`) filters on `status = 'active'`.  
Main resolver also checks `is_active`. Both must stay in sync on filter logic.

### What each user needs in user_api_keys per lane

| Lane | provider | Required |
|------|----------|---------|
| CF D1/R2/KV | `cloudflare` | API token + `metadata_json.account_id` |
| Supabase query/write/vector | `supabase` | Service role key + `metadata_json.project_ref` |
| GitHub | OAuth flow | `user_oauth_tokens` row (not `user_api_keys`) |
| Memory / Email | none | internal / platform_scoped |

Superadmin resolves from `env.*` Workers secrets — no `user_api_keys` rows needed.  
All other users get a clean `CredentialNotConfiguredError` if not configured.  
Never Sam's bindings for any other tenant's session.

---

## Internal Auth Keys — One Purpose Each

| Secret | Purpose | Direction |
|--------|---------|-----------|
| `VAULT_KEY` | AES encryption for `user_secrets` | vault ops only, never in headers |
| `VAULT_MASTER_KEY` | Derives per-tenant KEKs | vault key derivation only |
| `MCP_AUTH_TOKEN` | Bearer gate on MCP worker endpoint | External clients → MCP worker |
| `AGENTSAM_BRIDGE_KEY` | Service trust token | MCP worker → main worker only |
| `PTY_AUTH_TOKEN` | PTY terminal WebSocket | terminal lane only |

Never swap these. Never use `VAULT_*` as auth tokens.  
`AGENTSAM_BRIDGE_KEY` flows one direction: MCP → main. Never main → MCP.

---

## Deploy Rules

- Always `npm run deploy:full` — never `npm run deploy` alone
- Tests never run automatically on deploy
- MCP unit tests opt-in only: `RUN_MCP_DEPLOY_TESTS=1 npm run deploy:full`
- After deploy: lightweight health check only (`/api/health`, `/health`)
- No Playwright, no E2E smoke suite before deploy unless explicitly requested

---

## Current Production State (2026-06-02, post 508/509/510)

23 active `oauth_visible` tools — 0 with `binding: ASSETS/DB/HYPERDRIVE`, 0 with `auth_source: platform` on customer tools, 0 with `handler_type: d1`.

| handler_type | tool_key |
|-------------|---------|
| `cf` (×7) | `agentsam_d1_query`, `agentsam_d1_write`, `agentsam_d1_migrate`, `agentsam_r2_get`, `agentsam_r2_put`, `agentsam_r2_delete`, `agentsam_kv_manage` |
| `hyperdrive` (×4) | `agentsam_supabase_query`, `agentsam_supabase_write`, `agentsam_supabase_vector`, `agentsam_autorag` |
| `github` (×5) | `agentsam_github_read`, `agentsam_github_write`, `agentsam_github_issue`, `agentsam_github_pr`, `agentsam_github_repo_list` |
| `memory` (×1) | `agentsam_memory_manager` |
| `notify` (×1) | `agentsam_send_email` |
| `terminal` (×3) | `agentsam_terminal_local`, `agentsam_terminal_remote`, `agentsam_terminal_sandbox` |
| `deploy` (×2) | `agentsam_stack_deploy`, `agentsam_worker_deploy` |

### Outstanding gaps (next sprint)

- `agentsam_supabase_vector` / `agentsam_autorag`: customer pgvector BYOK not fully wired end-to-end on MCP
- `agentsam_memory_manager`: platform Hyperdrive fallback still used for OAuth users — needs user pgvector path
- Non-superadmin BYOK E2E: not yet proven in automation (`.scratch/d1-byok-alignment-audit.sql` is the gate)
- MCP and main worker credential resolvers: behavioral parity maintained manually until unified
