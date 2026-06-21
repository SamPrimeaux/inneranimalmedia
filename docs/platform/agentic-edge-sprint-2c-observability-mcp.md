---
title: Sprint 2C — Observability & MCP Modularization
project_key: inneranimalmedia
topic: agentic_edge_sprint
sprint_id: agentic_edge_2c
sprint_status: planned
lane_key: docs_knowledge_search
updated: 2026-06-21
---

# Sprint 2C — Observability & MCP Modularization

**Duration:** 3–4 days  
**Parent:** [agentic-edge-sprint-plan.md](./agentic-edge-sprint-plan.md)  
**Repos:** inneranimalmedia, inneranimalmedia-mcp-server, ExecOS  
**Google analog:** Unified telemetry plane — trace coverage on agent + MCP + exec fabric  
**Week 2 priority:** **#3 — after 2A/2B**; start ingest cron in parallel with 2A

## Problem

Live data exists but is hard to query: `mcp_audit_log` (~6k rows, queryable via `agentsam_mcp_audit` after 1C), `worker_analytics_daily` schema exists but CF Observability API ingest is incomplete, deployment health smoke writes wrong columns (partially fixed 1B), and MCP `index.js` dispatch monolith grows with each handler lane.

**Why 2C follows 2A:** `agentsam_build_status` and `agentsam_worker_analytics` depend on the Observability ingest cron populating `worker_analytics_events` / daily rollups at least once. Seed that cron while 2A ships against tables that already have rows (`agentsam_agent_run`, `agentsam_spawn_job`).

## Goal

Operator-grade observability MCP tools + automated CF analytics ingest + thin dispatch modules — **no new tables** where existing schemas suffice.

## Tasks

### 1. MCP observability tools (extend 1C audit)

**Migrations:** `654_agentic_edge_2c_observability_tools.sql`  
**MCP handlers:** new modules under `src/handlers/obs/`

| Tool | Source | Params |
|------|--------|--------|
| `agentsam_mcp_audit` | ✅ shipped 1C | — |
| `agentsam_deployment_health` | `agentsam_deployment_health` + deploy tables | `workspace_id`, `since_hours`, `limit` |
| `agentsam_build_status` | CF Builds API + `deployments` join | `worker_name`, `limit` |
| `agentsam_worker_analytics` | `worker_analytics_daily` / hourly | `worker_name`, `since_days` |

All read-only, `handler_type: telemetry`, OAuth allowlist `read`.

### 2. CF Observability → D1 ingest (seed early — parallel with 2A)

**Files:** `src/core/worker-analytics-rollup.js`, new `scripts/ingest-cf-worker-analytics.mjs`

- **Start this cron/seed job while Sprint 2A is in progress** so 2C tools have data when handlers land
- Cron or manual script: CF GraphQL/Observability API → `worker_analytics_events` (existing)
- Ensure rollup cron populates `worker_analytics_daily` (rollup exists; wire scheduled trigger if missing)
- Fix `scripts/record-d1-deployment-health.mjs` remaining column drift (verify against live schema)

### 3. MCP dispatch modularization

**Repo:** inneranimalmedia-mcp-server

Extract from `index.js` into focused modules (no behavior change):

| Module | Handlers moved |
|--------|----------------|
| `src/dispatch/telemetry-dispatch.js` | audit, deployment_health, worker_analytics |
| `src/dispatch/terminal-dispatch.js` | terminal, deploy, git |
| `src/dispatch/cf-dispatch.js` | cf, vectorize, kv, r2 |

`dispatchTool()` becomes router-only; target ≤ 200 lines in switch by end of 2C.

### 4. Browser fetch tool (stretch)

**Tool:** `agentsam_browser_fetch`  
**Route:** MYBROWSER binding or CF Browser Rendering API proxy  
**Risk:** medium — requires approval flag in catalog  
Defer to 2C+ if MYBROWSER quota blocks; document in backlog section.

### 5. Trace linkage (agent ↔ MCP)

**Files:** `src/core/agentsam-ops-ledger.js`, MCP `writeAudit()`

- Pass `agent_run_id` / `session_id` from CORE → MCP via `X-Agent-Run-Id` on internal proxy calls
- `mcp_audit_log.session_id` populated on OAuth tools/call when dashboard initiates
- Dashboard `/dashboard/agent` “View MCP audit” deep link filtered by run

## Verification

```bash
# Audit (1C)
MCP_AUDIT_SMOKE=1 node scripts/mcp-smoke.mjs

# Deployment health tool
# tools/call agentsam_deployment_health { since_hours: 48, limit: 10 }

# Analytics ingest
node scripts/ingest-cf-worker-analytics.mjs --since-days 7
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
  --remote -c wrangler.production.toml \
  --command "SELECT COUNT(*) FROM worker_analytics_daily WHERE day_timestamp > unixepoch('now','-7 days')"

# Rollup
curl -sS https://inneranimalmedia.com/api/internal/cron/worker-analytics-rollup \
  -H "X-Cron-Secret: …" | jq .
```

## Success criteria

- [ ] `agentsam_deployment_health` + `agentsam_worker_analytics` callable from MCP OAuth
- [ ] `worker_analytics_daily` rows increase after ingest script run
- [ ] MCP `index.js` dispatch switch reduced by ≥ 30% LOC via modules
- [ ] Agent run ID appears on ≥ 80% dashboard-originated MCP audit rows

## Rollback

- Observability tools are read-only — disable via `is_active=0` in catalog
- Ingest script is idempotent upsert — safe to re-run

## Out of scope (2C)

- Full OpenTelemetry export (tail worker → otlp_traces exists; wire later)
- Customer-facing analytics dashboards (operator tools only)
- ExecOS VM metrics (GCP side — separate runbook)

## Related docs

- [agentic-edge-sprint-1c-exec-fabric.md](./agentic-edge-sprint-1c-exec-fabric.md) (`agentsam_mcp_audit`)
- `src/core/worker-analytics-rollup.js`
- `scripts/record-d1-deployment-health.mjs`
