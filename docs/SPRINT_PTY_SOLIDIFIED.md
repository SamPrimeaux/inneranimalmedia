# Agent Sam Sprint Plan — Solidified PTY
**Date:** May 11, 2026  
**Status:** In Progress  
**Scope:** Multi-tenant terminal, security hardening, Ollama integration, Connor onboarding  
**Stack:** Cloudflare Workers + D1 + Tunnel → GCP VM → iam-pty (Node.js/PM2)

---

## What Was Accomplished This Sprint

### 1. Schema — terminal_* tables rebuilt + aligned

**terminal_sessions** — rebuilt from scratch
- Removed hardcoded `DEFAULT 'ws_inneranimalmedia'`
- `workspace_id` is now `NOT NULL` — every session must be explicitly scoped
- Added `connection_id TEXT REFERENCES terminal_connections(id)` — the critical missing FK

**terminal_connections** — rebuilt with full multi-tenant support
- Added: `workspace_id NOT NULL`, `tenant_id NOT NULL`
- Added: `shell` (which shell to spawn), `platform` (linux/macos/windows)
- Added: `auth_mode` CHECK('secret_name','bridge','token_mint') — formalizes how PTY auth works
- Added: `token_verify_endpoint` — for token_mint mode, PTY calls Worker to validate
- Added: `user_id` (NULL = workspace-shared, set = user-scoped)
- Added: `description`, `port`, `cf_tunnel_id`, `supports_agent`, `supports_ollama`
- Added: `updated_at`

**terminal_sessions** — additional column
- Added `connection_id TEXT REFERENCES terminal_connections(id) ON DELETE SET NULL`

**Current rows in terminal_connections:**

| id | workspace | user | shell | platform | auth_mode | notes |
|---|---|---|---|---|---|---|
| conn_mac_local | ws_inneranimalmedia | au_871d9... | /bin/zsh | macos | secret_name | Sam's Mac, is_default=1 |
| conn_mac_shell2 | ws_inneranimalmedia | NULL | /bin/bash | linux | secret_name | GCP VM shared |
| conn_connor_pwsh | ws_connor_mcneely | (pending) | pwsh | linux | token_mint | Connor's PowerShell on GCP |

### 2. Schema — security tables wired to terminal

```sql
ALTER TABLE security_findings ADD COLUMN terminal_history_id TEXT REFERENCES terminal_history(id) ON DELETE SET NULL;
ALTER TABLE security_findings ADD COLUMN terminal_session_id TEXT REFERENCES terminal_sessions(id) ON DELETE SET NULL;
ALTER TABLE secret_audit_log ADD COLUMN terminal_session_id TEXT REFERENCES terminal_sessions(id) ON DELETE SET NULL;
ALTER TABLE mcp_workspace_tokens ADD COLUMN last_used_at INTEGER;
ALTER TABLE mcp_workspace_tokens ADD COLUMN rotated_from TEXT REFERENCES mcp_workspace_tokens(id);
```

Existing `security_findings.source_type` values confirmed in D1:
- `worker_bundle`, `terminal_session`, `chat_session`, `env_secrets`, `agentsam_memory:val...`, `terminal_capture`
- **Gap:** `terminal_history` is not yet a source_type — scanner doesn't sweep history content

### 3. Security — token rotation + git history cleanup

**What was leaked in public GitHub history (`iam-pty` repo):**
- `AGENTSAM_BRIDGE_KEY` — full value in plaintext ⚠️ ROTATED
- `PTY_AUTH_TOKEN` — multiple old values ⚠️ ROTATED
- `CLOUDFLARE_API_TOKEN` — old value (was previously rotated)

**Actions taken:**
- Generated new `iam-bridge-*` prefixed AGENTSAM_BRIDGE_KEY
- Generated new `iam-pty-*` prefixed PTY_AUTH_TOKEN
- Both pushed to Wrangler secrets (main worker + mcp-server worker)
- `ecosystem.config.cjs` added to `.gitignore`
- `.env*` added to `.gitignore`
- Global gitignore set: `~/.gitignore_global` includes `.secrets`
- `~/.secrets` created (chmod 600) as single local secrets store
- Sourced from `~/.zshrc`

**Git history BFG cleanup — STILL PENDING:**
```bash
brew install bfg
cd ~/iam-pty
bfg --replace-text /tmp/secrets-to-purge.txt
git reflog expire --expire=now --all
git gc --prune=now --aggressive
git push origin main --force
```

### 4. Infrastructure — verified healthy

| Component | Status | Detail |
|---|---|---|
| CF Tunnel | ✅ Healthy | 2 replicas, 4 routes, 3 days uptime |
| GCP VM replica | ✅ Online | linux_amd64, pid confirmed, --update-env applied |
| Mac replica | ✅ Online | darwin_arm64, MCP filesystem ready |
| PTY local health | ✅ `ok` | http://localhost:3099/health |
| PTY tunnel health | ✅ `ok` | https://terminal.inneranimalmedia.com/health |
| MCP server | ✅ 66 tools | https://mcp.inneranimalmedia.com/mcp |
| Worker health | ✅ All bindings | db, r2, browser, queue, ai, hyperdrive |
| Ollama local | ✅ Both models | mxbai-embed-large + qwen2.5-coder:7b |
| Ollama tunnel | ✅ CF Access 403 | Correctly protected |
| gcloud CLI | ✅ Updated | 562 → 567, CVE-2024-9979 patched |

### 5. Local dev environment secured

```bash
# ~/.secrets (chmod 600, gitignored globally)
export PTY_AUTH_TOKEN="iam-pty-..."
export AGENTSAM_BRIDGE_KEY="iam-bridge-..."
export GCP_PROJECT_ID="..."
export GCP_ZONE="us-central1-f"
export LOCAL_PTY="http://localhost:3099"
export LOCAL_WORKER="http://127.0.0.1:8787"
export LOCAL_DASHBOARD="http://localhost:5173"
export OLLAMA_LOCAL="http://localhost:11434"
```

---

## What's Still Needed (Ordered by Priority)

### P0 — Blocking terminal end-to-end

**1. `getDefaultTerminalConnection()` — resolve by workspace/user**
File: `src/core/terminal.js`

Current (broken for multi-user):
```js
WHERE is_default = 1 AND is_active = 1 LIMIT 1
```

Required (priority fallback chain):
```js
// Priority 1: user-scoped connection
SELECT * FROM terminal_connections
WHERE user_id = ? AND workspace_id = ? AND is_active = 1 LIMIT 1

// Priority 2: workspace default
SELECT * FROM terminal_connections  
WHERE workspace_id = ? AND user_id IS NULL AND is_active = 1 LIMIT 1

// Priority 3: global fallback
SELECT * FROM terminal_connections
WHERE is_default = 1 AND is_active = 1 LIMIT 1
```
Also add to SELECT: `shell`, `platform`, `auth_mode`, `token_verify_endpoint`, `user_id`

**2. `connectPty()` — pass userId + workspaceId, read shell**
File: `src/do/AgentChat.js`
- Pass `(userId, workspaceId)` into `getDefaultTerminalConnection()`
- Read `shell` from connection row → send in spawn request to PTY
- Set `connection_id` on terminal_sessions INSERT after minting token

**3. `upsertTerminalSessionRow()` — add missing fields**
File: `src/do/AgentChat.js`
- Add `connection_id` (from resolved connection row)
- Add `agent_session_id` (from `this.state.id`)

**4. `POST /api/terminal/session/verify` — make auth_token_hash do real work**
File: `src/api/terminal.js`
```
Accepts: { token, session_id }
Looks up: terminal_sessions WHERE id = session_id
Validates: SHA256(token) === auth_token_hash
Returns: 200 { valid: true, tenant_id, user_id, workspace_id } | 401
```
This is what makes per-user PTY auth real. Without it, auth_token_hash is audit-only.

**5. iam-pty — read shell from spawn request**
File: `~/iam-pty/server.js`
- PTY currently hardcodes shell candidates internally
- Must read `shell` from WebSocket query params or session payload
- Critical for Connor's `pwsh` to work

### P1 — Multi-user correctness

**6. `/health` endpoint — upgrade to JSON**
File: `~/iam-pty/server.js` (line ~392)

Current: returns plain text `ok`

Target:
```json
{
  "status": "ok",
  "version": "1.0.0",
  "token_set": true,
  "workspaces_root": "/workspace",
  "allowed_tenants": ["tenant_sam_primeaux", "tenant_connor_mcneely"],
  "ollama_reachable": true,
  "active_sessions": 0,
  "uptime_seconds": 3600
}
```

**7. `generateUserBridgeKey()` — wire to provisioning**
File: `src/api/provisioning.js`
- Currently inserts with `is_active = 0` — invisible to all runtime queries
- Fix: `is_active = 1` on insert
- Wire to signup/workspace creation flow
- For `token_mint` users (Connor): skip bridge_key_hash, set `token_verify_endpoint`

**8. `hub.js` — fix ORDER BY column name**
File: `src/api/hub.js`
- Query uses `ORDER BY created_at` on terminal_history
- Column is `recorded_at` — fix the ORDER BY

### P2 — Ollama integration

**9. Ollama Worker proxy endpoint**
```
GET/POST /api/ollama/generate → proxies to localhost:11434 via VPC
GET      /api/ollama/models   → returns available models per workspace
```
Worker uses VPC internal route (not public tunnel) → fastest path, no CF Access bypass needed.

Per-workspace Ollama access controlled by `agentsam_user_policy.allow_platform_fallback`
or a new `ollama_enabled` column.

**10. `qwen2.5-coder:7b` — wire to Agent Sam terminal assist**
- Already responding inline in terminal panel (confirmed April 2026)
- Ensure `api_platform = 'ollama'` filter works in `/api/agent/models`
- Start `OLLAMA_ORIGINS="*" OLLAMA_HOST="0.0.0.0:11434"`

### P3 — Connor onboarding

**11. Connor IAM account**
- Create `auth_users` row for Connor
- Set `workspace_id = ws_connor_mcneely`, `tenant_id = tenant_connor_mcneely`
- Backfill `user_id` into `conn_connor_pwsh` in terminal_connections
- Verify `ALLOWED_TENANTS` in iam-pty `.env` includes `tenant_connor_mcneely`
- Test PowerShell spawn: `pwsh` must be installed on GCP VM

```bash
# Verify pwsh on GCP VM
gcloud compute ssh iam-tunnel --zone=us-central1-f --project=$GCP_PROJECT_ID \
  --command "which pwsh || echo 'NOT INSTALLED'"
```

**12. Connor MCP token**
- Mint token, hash it, insert into `mcp_workspace_tokens`
- `allowed_tools`: d1_query, r2_read, r2_list, r2_search, knowledge_search,
  agent_memory_search, platform_info, telemetry_query
- NO terminal_execute, NO r2_write, NO d1_write

---

## agentsam_* Table Inventory for This Sprint

### ✅ Directly relevant — wire in this sprint

| Table | Why |
|---|---|
| `agentsam_tool_chain` | Has `terminal_session_id` + `command_execution_id` FKs — already partially wired |
| `agentsam_tools` | `handler_type = 'terminal'` — dispatches terminal tool calls |
| `agentsam_tool_call_log` | Logs all tool calls including terminal_execute |
| `agentsam_user_policy` | Controls terminal access: `legacy_terminal_tool`, `terminal_hint`, `terminal_preview_box`, `tool_risk_level_max` |
| `agentsam_guardrails` | `applies_to = 'terminal'`, category `browser_terminal` — blocks/warns on risky commands |
| `agentsam_mcp_allowlist` | Gates which tools a user can run — terminal_execute must be in allowlist |
| `agentsam_commands` | Maps slash commands to terminal commands |
| `agentsam_command_run` | Execution log with `exit_code`, `duration_ms`, approval flow |
| `agentsam_workflow_nodes` | `node_type = 'terminal'` — terminal as a workflow step |
| `agentsam_scripts` | Scripts executable via terminal |
| `agentsam_script_runs` | Audit log for script executions |
| `agentsam_error_log` | Captures terminal tool call failures |

### ⚠️ Relevant but has hardcoded ws_* — fix before multi-user

| Table | Problem | Fix |
|---|---|---|
| `agentsam_tools` | `workspace_scope DEFAULT '["ws_inneranimalmedia"]'` | Remove default, require explicit value |
| `agentsam_scripts` | `workspace_id NOT NULL DEFAULT 'ws_inneranimalmedia'` | Remove default |
| `agentsam_script_runs` | `workspace_id NOT NULL DEFAULT 'ws_inneranimalmedia'` | Remove default |
| `agentsam_mcp_tool_execution` | `tenant_id DEFAULT 'tenant_sam_primeaux'` | Remove default |
| `agentsam_webhook_events` | `tenant_id DEFAULT 'tenant_sam_primeaux'` | Remove default |
| `agentsam_mcp_tools` | `workspace_scope DEFAULT '["ws_inneranimalmedia"]'` | Remove default |

### 📋 Relevant later — not blocking PTY sprint

| Table | Notes |
|---|---|
| `agentsam_mcp_servers` | Ollama MCP server registration when we add Ollama MCP |
| `agentsam_skill` | Terminal skills/shortcuts — post-PTY |
| `agentsam_skill_invocation` | Keep — good observability once skills are used |
| `agentsam_guardrail_rulesets` | Grouping guardrails — post-PTY |
| `agentsam_workflows` + `agentsam_workflow_runs` | Workflow engine — post-PTY |
| `agentsam_plans` | Planning system — post-PTY |
| `agentsam_prompt_cache_keys` | Cache tracking — post-PTY |

### ❌ Not relevant to this sprint

| Table | Notes |
|---|---|
| `agentsam_eval_*` | Evaluation system — separate sprint |
| `agentsam_fetch_domain_allowlist` | Domain allowlist — browser agent sprint |
| `agentsam_ignore_pattern` | File ignore patterns — code editor sprint |
| `agentsam_mcp_workflows` | MCP-specific workflows — post-PTY |

---

## Tunnel Route Map (Reference)

```
terminal.inneranimalmedia.com → http://127.0.0.1:3099   (PTY: HTTP + WebSocket)
ollama.inneranimalmedia.com   → http://localhost:11434   (Ollama: CF Access protected)
0.0.0.0/0                    → Private CIDR             (VPC internal routing)
iam-vpc                      → localhost:3099            (Worker VPC direct)
```

Two replicas:
- `linux_amd64` — GCP VM, 3 days uptime — **production**
- `darwin_arm64` — Sam's Mac — **dev only**

CF load-balances between them. Production traffic should only hit GCP VM.
Todo: add a CF Access policy or origin rule to route non-dev traffic to GCP replica only.

---

## Auth Token Reference

| Token | Header | Validated by | Scope | In D1? |
|---|---|---|---|---|
| `MCP_AUTH_TOKEN` (iam-mcp-*) | `Authorization: Bearer` | MCP Worker SHA-256 → `mcp_workspace_tokens` | Per-workspace tool allowlist | Hash only |
| `PTY_AUTH_TOKEN` (iam-pty-*) | `?token=` query param | iam-pty direct comparison | Terminal session auth | No — Wrangler secret |
| `AGENTSAM_BRIDGE_KEY` (iam-bridge-*) | `X-Bridge-Key` | Internal workers | Worker-to-Worker | Hash in `terminal_connections.bridge_key_hash` |
| Per-session minted token | `auth_token_hash` | `POST /api/terminal/session/verify` (P0) | Per-session isolation | Hash in `terminal_sessions` |

---

## Key Rules — Never Violate

1. Deploy: always `npm run deploy:full` — never `npm run deploy` alone
2. No hardcoded `ws_*` or `tenant_*` defaults in any table DDL
3. Never commit `ecosystem.config.cjs`, `.env`, `.env.local`, `.secrets` to any repo
4. `PTY_AUTH_TOKEN` and `AGENTSAM_BRIDGE_KEY` never go in D1 — Wrangler secrets only
5. `X-Bridge-Key` header for Worker-to-Worker — never `Authorization: Bearer`
6. `terminal_execute` is allowlist-gated — Connor's token does not include it
7. Every terminal session must have `workspace_id`, `tenant_id`, `connection_id` set on INSERT
8. Wrangler commands against prod D1 require `--remote -c wrangler.production.toml`
9. Verify before claiming success — always curl/log confirm after any config change
10. BFG git history purge still pending on `iam-pty` repo — do before next public push

---

## Next Immediate Action

```bash
# 1. Confirm new PTY token is on GCP VM
gcloud compute ssh iam-tunnel --zone=us-central1-f --project=$GCP_PROJECT_ID \
  --command "grep PTY_AUTH_TOKEN ~/iam-pty/.env | cut -c1-20"

# 2. Deploy Worker with all new secrets
cd /Users/samprimeaux/inneranimalmedia && npm run deploy:full

# 3. Test full WebSocket terminal connection from dashboard
# Open terminal panel → watch pm2 logs iam-pty --lines 0 for connection event

# 4. Then: patch getDefaultTerminalConnection() in src/core/terminal.js (P0 item 1)
```
