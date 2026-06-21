---
title: Sprint 1B — Inference Gateway Lite (TTFT-aware routing)
project_key: inneranimalmedia
topic: agentic_edge_sprint
sprint_id: agentic_edge_1b
sprint_status: planned
lane_key: docs_knowledge_search
updated: 2026-06-20
---

# Sprint 1B — Inference Gateway Lite

**Duration:** 2 days  
**Parent:** [agentic-edge-sprint-plan.md](./agentic-edge-sprint-plan.md)  
**Google analog:** GKE Inference Gateway predictive latency boost (−70% TTFT)

## Problem

Model routing today optimizes Thompson sampling / cost — not **live time-to-first-token**. Interactive Agent Sam chat and MCP tool loops need the fastest arm when multiple models qualify.

Existing pieces:

- `src/core/routing.js` — Thompson arms, `agentsam_model_routing_memory`
- `src/core/agent-model-resolver.js` — `resolveModelForTask`, cache rate fields
- `src/api/health/queries.js` — reads `time_to_first_token_ms` from runs
- MCP `index.js` — partial TTFT in tool call logging

## Target architecture

```text
agentsam_agent_run (TTFT per dispatch)
        │
        ▼
agentsam_model_health (p50/p95 TTFT, error_rate)  ← migration 650
        │
        ├──► CORE agent-model-resolver (deprioritize slow arms)
        └──► MCP tools/call metadata (surface latency to client)
```

## D1 schema — `agentsam_model_health`

Migration: `migrations/650_agentsam_model_health.sql`

| Column | Type | Notes |
|--------|------|-------|
| model_key | TEXT PK | e.g. `@cf/meta/llama-3.1-8b-instruct` |
| workspace_id | TEXT | nullable = global aggregate |
| p50_ttft_ms | INTEGER | rolling window |
| p95_ttft_ms | INTEGER | rolling window |
| error_rate | REAL | 0.0–1.0 |
| sample_count | INTEGER | runs in window |
| updated_at | INTEGER | unixepoch |

## Tasks

### 1. Apply migration 650

```bash
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
  --remote -c wrangler.production.toml \
  --file=./migrations/650_agentsam_model_health.sql
```

### 2. Rollup cron — populate health from runs

**File:** extend `src/cron/jobs/agent-run-daily-rollup.js` or new `agent-model-health-rollup.js`

SQL sketch:

```sql
INSERT INTO agentsam_model_health (model_key, workspace_id, p50_ttft_ms, p95_ttft_ms, error_rate, sample_count, updated_at)
SELECT
  model_key,
  workspace_id,
  ... percentiles from agentsam_agent_run WHERE created_at > unixepoch()-86400*7
ON CONFLICT(model_key, workspace_id) DO UPDATE ...
```

Schedule: daily cron (existing `0 3 * * *` slot) or piggyback on hourly rollup.

### 3. CORE routing — TTFT deprioritization

**File:** `src/core/agent-model-resolver.js` + `src/core/routing.js`

Logic (interactive `mode=agent` only):

```javascript
const TTFT_P95_THRESHOLD_MS = 4000;
// When picking among Thompson arms, multiply score by health factor:
// healthFactor = p95_ttft_ms > threshold ? 0.5 : 1.0
// error_rate > 0.1 → exclude arm
```

Do **not** change terminal_execution or batch modes in 1B.

### 4. MCP telemetry

**Repo:** inneranimalmedia-mcp-server `src/index.js`

On every `tools/call` completion:

- Record `latency_ms` (wall clock)
- If tool invokes model (handler_type ai/workers_ai), record `time_to_first_token_ms`
- Upsert lightweight row or enqueue to `MY_QUEUE` for async D1 write

### 5. ExecOS latency_ms

**Repo:** ExecOS `server.js` `runOwnerExec()`

Add to JSON response:

```json
{ "ok": true, "stdout": "...", "exit_code": 0, "latency_ms": 142, "target": "gcp" }
```

MCP terminal tools can aggregate shell + model latency in run metadata.

## Verification

```bash
# Health table populated
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
  --remote -c wrangler.production.toml \
  --command "SELECT model_key, p95_ttft_ms, error_rate FROM agentsam_model_health LIMIT 5"

# MCP tool with timing
curl -sS -X POST https://mcp.inneranimalmedia.com/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"platform_health","arguments":{}}}' \
  | jq '.result.content[0].text | fromjson | .latency_ms'

# ExecOS /run timing (after ExecOS deploy)
curl -sS -X POST https://terminal.inneranimalmedia.com/run \
  -H "X-ExecOS-Key: $EXECOS_KEY" -H "Content-Type: application/json" \
  -d '{"command":"echo ok","target":"gcp"}' | jq .latency_ms
```

## Success criteria

| Metric | Target |
|--------|--------|
| Health rows for top 5 models | Present within 24h of rollup |
| Interactive chat TTFT p95 | ↓ 30% vs prior week (manual compare) |
| MCP tools/call logs latency | 100% of catalog tool calls |

## Not in 1B

- Separate ML model for routing (heuristic TTFT priors only)
- Auto-failover to Workers AI when all arms slow (Week 2)
