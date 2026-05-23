# PTY multi-tenant isolation (Worker + iam-pty)

**Status:** Production (May 2026)  
**Canonical Sam user:** `au_871d920d1233cbd1` (info@inneranimals.com) — **never** `au_77a622faf006c9e4` (purged; not in D1).

## Working directory law

PTY sessions must land in the authenticated user's isolated path:

```
/workspace/{active_tenant_id}/{user_id}/
```

Implemented in Worker via:

- `resolvePtyTenantIdForUser()` — `auth_users.active_tenant_id` → `tenant_id`; **no workspace lookup**
- `buildPtySessionWorkingDir()` — `/workspace/{tenant}/{user}/`

## Auth provisioning (login/signup)

`ensureUserTerminalConnection()` in `src/api/provisioning.js`:

1. `terminal_connections` row per `(user_id, workspace_id)` with `auth_mode=token_mint`, `is_active=1`
2. `INSERT OR IGNORE agentsam_user_policy (…, can_run_pty=1)`

## Control-plane paths

| Route | Tenant source | cwd |
|---|---|---|
| `/api/agent/terminal/ws` | `resolvePtyTenantIdForUser` | `buildPtySessionWorkingDir` → DO `cwd` param |
| AgentChat DO `connectPty` | same (never `mcp_workspace_tokens.repo_path`) | `ptyWorkingDir` |
| `/api/terminal/session/register` | same | default cwd on insert |

## Common failure: Connor sees Sam's files

Cause: `tenant_id` derived from `resolveTenantIdForWorkspace(workspace_id)` instead of user's `active_tenant_id`.

Fix: redeploy Worker after this batch; Connor re-login to provision connection + policy.

## Deploy checklist

1. `npm run deploy:full` (Worker only — not dashboard-only deploy)
2. Verify terminal WS returns 101 + session lands in correct `/workspace/…/` path
3. D1: `terminal_connections` has Connor row with his `user_id`
4. D1: `agentsam_user_policy.can_run_pty = 1` for Connor `(user_id, workspace_id)`
