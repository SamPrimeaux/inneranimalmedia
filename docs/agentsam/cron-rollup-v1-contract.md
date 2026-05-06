# Agent Sam — Cron + rollups V1 contract (spec)

Last updated: 2026-05-06

This document defines the **V1 production contract** for scheduled/background work: entrypoints, schedule buckets, canonical writers, rollup table contracts, and verification gates.

If code and schema drift from this document, **this document wins** and code must be corrected back to contract.

## Production scheduled entrypoint (hard contract)

- **One production scheduled entrypoint:** `src/index.js`
- `src/index.js` delegates **scheduled** handling to: `src/cron/scheduled.js`
- `src/cron/scheduled.js` dispatches to **canonical job modules**
- Every job module uses the same ledger + rollup primitives:
  - `src/core/cron-run-ledger.js` (canonical cron execution ledger)
  - `src/core/usage-rollups.js` (canonical daily usage writer)
  - `src/core/tool-stats-rollup.js` (canonical tool reliability writer)
  - `src/core/webhook-rollups.js` (canonical webhook rollup writer)

**Non-goals / constraints:**

- Do **not** add a second scheduled entrypoint.
- Do **not** add “silent defaults” for tenant/workspace (see [Multi-tenant contract](#multi-tenant-contract-no-silent-defaults)).
- Do **not** change `worker.js` as part of V1 contract authoring.

## Current cron matrix (as-is inventory)

This section is an inventory target (what exists today and must be reconciled during patches).

Known current failures (must be fixed in V1 patches):

- **Webhook weekly rollup schema mismatch**: the `agentsam_webhook_weekly` writer and the table schema are out of alignment.
- **Duplicate tool stats writers**: multiple modules write to the same rollup/analytics targets.
- **Reserved / no-op hourly cron**: schedule exists but does nothing (or does something ambiguous).
- **Hardcoded Sam/IAM paths**:
  - `writeDailySnapshot` uses hardcoded tenant/workspace assumptions
  - deployments weekly rollup uses hardcoded tenant/workspace assumptions

## V1 schedule buckets (canonical)

All scheduled jobs MUST be dispatched via `src/cron/scheduled.js` and MUST write a ledger row in `agentsam_cron_runs`.

### Every 5 minutes

- expire approvals
- cleanup stale terminals
- mark timed-out runs/tools
- process stuck webhooks

### Hourly

- compact tool stats
- update MCP server health
- optional short-window metrics

### Daily

- usage rollups by tenant/workspace/day
- retention purge
- health snapshot
- digest/plan email (if enabled)

### Weekly

- webhook weekly rollup
- analytics weekly rows
- deployments weekly rollup (only if still needed)

### Monthly

- spend ledger rollup

## Canonical table contracts (V1)

These are the **only** allowed “owner outputs” for the corresponding job families. If any other module writes these tables, it is a contract violation.

### `agentsam_usage_rollups_daily`

- **Purpose**: daily operational usage, keyed by tenant/workspace/day
- **Canonical writer**: `src/core/usage-rollups.js`
- **Key**: \(`tenant_id`, `workspace_id`, `day`\)
- **Scope rule**: must be written with explicit tenant/workspace scope (see multi-tenant contract)

### `agentsam_tool_stats_compacted`

- **Purpose**: current compacted tool reliability score (dashboard-friendly “now” state)
- **Canonical writer**: `src/core/tool-stats-rollup.js`
- **Notes**:
  - only one compaction writer exists in V1
  - other modules may *read* but must not *write*

### `agentsam_webhook_weekly`

- **Purpose**: weekly webhook rollup; currently broken and must be fixed
- **Canonical writer**: `src/core/webhook-rollups.js`
- **Hard rule**: writer schema MUST match table schema exactly (no “best effort” inserts)

### `agentsam_analytics`

- **Purpose**: dashboard-friendly aggregates fed from rollups
- **Canonical writers**: “analytics weekly rows” job module(s) only
- **Hard rule**: analytics is **derived**; it must not become a second canonical source of truth for rollup correctness

### `agentsam_cron_runs` (new)

- **Purpose**: ledger for all scheduled jobs (what ran, scope, what changed, and why it failed)
- **Canonical writer**: `src/core/cron-run-ledger.js`
- **Minimum row semantics**:
  - row is created at job start (status = `running`)
  - row is finalized at job end (status = `success` / `error`)
  - row records: job key, schedule bucket, scope (tenant/workspace), timing, rows read/written, error text, and metadata

## Multi-tenant contract (no silent defaults)

V1 forbids runtime reliance on any hardcoded defaults like:

- tenant: `tenant_sam_primeaux`
- workspace: `ws_inneranimalmedia`
- “fake” workspace bucket: `workspace_id = 'unknown'`

### Workspace scoping rule

- **Do not** add `workspace_id TEXT NOT NULL DEFAULT 'unknown'` anywhere.
- `workspace_id` should be **nullable** where a “platform/global” scope is valid.

When a job is truly global/platform-scoped:

- prefer `workspace_id = NULL` and set `metadata_json.scope = "platform"`
- only use `workspace_id = 'platform'` if a real platform workspace is created/registered and treated as first-class (not a fake bucket)

### Tenant scoping rule

- Jobs must resolve tenant scope explicitly:
  - either a concrete tenant/workspace pair, or
  - a platform/global scope recorded in metadata (never silently coerced)

### Enforcement expectations

- Jobs should fail loudly (ledger `status = error`) if required scope is missing for a non-platform job.
- Any read/write path that “falls back” to Sam/IAM defaults is a ship-blocking bug in V1.

## Duplicate writers to remove (V1 cleanup list)

V1 requires **one job → one owner module → one output table**.

Remove/consolidate:

- any non-canonical writers targeting `agentsam_tool_stats_compacted`
- any non-canonical writers targeting `agentsam_webhook_weekly`
- any jobs that directly write `agentsam_analytics` from raw tables in a way that conflicts with rollups

## Migration plan (261–264)

This is the patch-series contract for migrations `261` through `264` (exact filenames may differ; this is the intent contract).

- **261**: introduce `agentsam_cron_runs` ledger table (+ indexes)
- **262**: fix `agentsam_webhook_weekly` table schema to match V1 writer contract (or vice versa; the end state must match)
- **263**: remove/disable duplicate tool stats writers and ensure only canonical compactor remains
- **264**: scope fixes: remove Sam/IAM hardcoding from `writeDailySnapshot` + deployments weekly rollup; enforce explicit tenant/workspace resolution

## Patch order (do not reorder without updating this doc)

1. Add `agentsam_cron_runs` ledger + minimal writer (`src/core/cron-run-ledger.js`)
2. Fix `agentsam_webhook_weekly` schema/job mismatch
3. Consolidate tool stats to **one** writer for `agentsam_tool_stats_compacted`
4. Fix `writeDailySnapshot` hardcoding (no Sam/IAM defaults)
5. Normalize V1 cron schedule buckets and job dispatch
6. Add verification queries + manual scheduled test flow (documented below)

## Verification commands (D1 + runtime)

All verification must run from repo root and use production config unless explicitly stated otherwise.

### Schema sanity (ledger + rollups exist)

Use D1 execute to verify tables + columns:

```bash
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business -c wrangler.production.toml --remote --command "SELECT name, sql FROM sqlite_master WHERE type='table' AND name IN ('agentsam_cron_runs','agentsam_usage_rollups_daily','agentsam_tool_stats_compacted','agentsam_webhook_weekly','agentsam_analytics');"
```

### Ledger correctness (recent runs)

```bash
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business -c wrangler.production.toml --remote --command "SELECT id, job_key, status, tenant_id, workspace_id, started_at, finished_at, rows_read, rows_written, substr(error_text,1,200) AS error_preview FROM agentsam_cron_runs ORDER BY started_at DESC LIMIT 25;"
```

### No-defaults audit (ship gate)

These should return **zero** for V1-compliant writes (except where explicitly allowed by this contract).

```bash
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business -c wrangler.production.toml --remote --command "SELECT COUNT(*) AS c FROM agentsam_cron_runs WHERE workspace_id = 'unknown';"
```

```bash
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business -c wrangler.production.toml --remote --command "SELECT COUNT(*) AS c FROM agentsam_usage_rollups_daily WHERE workspace_id = 'unknown';"
```

## Manual scheduled test flow (V1)

V1 requires a safe, explicit way to trigger scheduled jobs for validation without relying on hidden defaults.

Contract expectations for the manual flow (implementation must follow):

- caller supplies:
  - job key
  - schedule bucket
  - explicit scope: tenant/workspace OR platform metadata scope
- system creates `agentsam_cron_runs` row first
- job executes
- system finalizes ledger row with rows read/written and any error text

## Ship gates (must pass)

- **Single entrypoint**: only `src/index.js` handles scheduled; it delegates to `src/cron/scheduled.js`
- **One writer per rollup table**:
  - only `src/core/usage-rollups.js` writes `agentsam_usage_rollups_daily`
  - only `src/core/tool-stats-rollup.js` writes `agentsam_tool_stats_compacted`
  - only `src/core/webhook-rollups.js` writes `agentsam_webhook_weekly`
- **Ledger required**: every scheduled job writes exactly one `agentsam_cron_runs` row per run
- **No silent defaults**: no code path relies on `tenant_sam_primeaux` / `ws_inneranimalmedia` defaults
- **No fake workspace buckets**: no `workspace_id = 'unknown'` defaults; platform scope uses NULL + metadata
- **Schema/writer match**: webhook weekly rollup schema matches writer and produces non-empty weekly rows in real traffic

## References (target modules)

- Production entry: `src/index.js`
- Scheduled dispatcher: `src/cron/scheduled.js`
- Ledger: `src/core/cron-run-ledger.js`
- Daily usage rollups: `src/core/usage-rollups.js`
- Tool stats rollup: `src/core/tool-stats-rollup.js`
- Webhook rollups: `src/core/webhook-rollups.js`

