# Ship trail SSOT — `deployments`

**Status:** LOCKED intent (2026-07-24)  
**Table:** D1 `inneranimalmedia-business.deployments`  
**Writer:** `scripts/post-deploy-record.sh` (sole INSERT path for success ledger rows)

## Why this table

Cross-app identity in one row: `tenant_id`, `workspace_id`, `project_id`, `worker_name`, `environment`, full `git_hash` (40-char), `run_group_id`.

Not SSOT candidates:

- `deployment_tracking` — dead since May 2026 (backfill only)
- `deployment_notifications` — side-effect log (`phone_loop_*` ids); no join key to `deployments.id`

## Required columns (Law 1–5)

| Column | Rule |
|--------|------|
| `git_hash` | Full 40-char SHA or INSERT fails |
| `timestamp_unix` / `created_at_unix` | INTEGER unixepoch seconds (UTC) — Law 2 |
| `timestamp` / `created_at` | Dual-write UTC ISO TEXT for legacy UI only; never filter on these |
| `changed_files` | Non-empty JSON array, capped (`CHANGED_FILES_MAX` default 50) |
| `error_message` / `failure_reason` | Set on failed deploys; NULL on success |
| `worker_name` | Real worker (`inneranimalmedia`, `inneranimalmedia-mcp-server`, …) |

## Every app must write

| App / script | How |
|--------------|-----|
| Main Mac `deploy:fast` / `deploy:full` | Already calls `post-deploy-record.sh` |
| MCP `deploy-mcp-worker.sh` | Calls IAM `post-deploy-record.sh` with `DEPLOY_GIT_ROOT=<mcp-repo>`, `WORKER_NAME=inneranimalmedia-mcp-server`, `SKIP_DASHBOARD_VERSIONS=1` |
| Future client workers | Same recorder + overrides for tenant/workspace/project/worker |

## Overflow (WAE)

Large file/event streams → Workers Analytics Engine (`env.WAE`). Do not stuff unbounded trees into `changed_files`. Cap stays in D1; failure detail can land in WAE later.

## Gate

`scripts/deploy-trail-gate.mjs` requires `timestamp_unix` + full SHA + non-empty `changed_files` before ship is considered trail-complete.
