---
title: Sprint 2B — Cold Start & Warm Path
project_key: inneranimalmedia
topic: agentic_edge_sprint
sprint_id: agentic_edge_2b
sprint_status: planned
lane_key: docs_knowledge_search
updated: 2026-06-21
---

# Sprint 2B — Cold Start & Warm Path

**Duration:** 2–3 days  
**Parent:** [agentic-edge-sprint-plan.md](./agentic-edge-sprint-plan.md)  
**Google analog:** GKE fast pod/model load — reduce time-to-first-tool-call and dashboard tab TTFP

## Problem

First MCP `tools/call` after OAuth token cold-start pays D1 catalog + KV miss latency. Dashboard agent tab lazy-loads heavy chunks (Monaco, Excalidraw) on first navigation. Model routing cold-starts without KV-warmed arm priors.

## Goal

↓ 40% session resume latency (plan metric) via KV hot paths for catalog, routing priors, and SW chunk warm — without new tables.

## Tasks

### 1. MCP catalog KV warm path

**Repo:** inneranimalmedia-mcp-server  
**Files:** `src/agentsam-tools-catalog.js`, `src/index.js`

| Change | Done when |
|--------|-----------|
| On deploy/cron: `MCP_CATALOG_KV` snapshot of active `agentsam_tools` rows (tool_key, handler_type, input_schema hash) | Key `catalog:v2:{client_id}` TTL 15m |
| `tools/list` reads KV first; D1 fallback on miss or `X-MCP-Refresh: true` | p95 tools/list ↓ vs baseline |
| OAuth allowlist merged into snapshot (no per-token D1 join on hot path) | Verified in observability |

### 2. Routing priors KV cache (CORE)

**Files:** `src/core/routing.js`, `src/core/memory.js`

- Cache `agentsam_model_routing_memory` top-N arms per `(workspace_id, mode)` in KV `ROUTING_PRIORS:{ws}:{mode}` TTL 5m
- Invalidate on `scheduleAgentsamChatAgentRunInsert` finalize (fire-and-forget)
- Skip for `plan` / `multitask` modes (unchanged from 1B TTFT penalty scope)

### 3. Dashboard chunk warm expansion

**Files:** `dashboard/src/pwa/warmAgentChunks.ts`, `dashboard/App.tsx`

| Tab | Warm on agent panel open |
|-----|--------------------------|
| `code` | Monaco + vendor-editor (existing) |
| `agent` | Agent chat panel chunk + MCP tool picker lazy bundle |
| `deploy` | Deploy status widget chunk (feeds 2C build status tool) |

PostMessage `IAM_WARM_CHUNKS` — extend services manifest `tier2_tabs.agent` entry.

### 4. ExecOS session warm hint (optional)

**Repo:** ExecOS  
**File:** `context-manager.js`

- On MCP bridge `initialize`, optional HEAD to `execos.inneranimalmedia.com/health` from MCP worker (rate-limited per token_hash)
- Document only if latency win > 100ms in smoke — otherwise defer

### 5. Smoke + metrics

**File:** `scripts/mcp-smoke.mjs`

- Add `MCP_COLD_WARM_SMOKE=1`: two sequential `tools/list`, assert second `wall_ms` < first × 0.6
- Record baseline in `reports/mcp-smoke/<runId>/warm-path.json`

## Verification

```bash
cd ~/inneranimalmedia
MCP_COLD_WARM_SMOKE=1 node scripts/mcp-smoke.mjs

# KV catalog present
# wrangler kv key get --binding MCP_TOKENS catalog:v2:iam_mcp_inneranimalmedia
```

## Success criteria

- [ ] Second `tools/list` p95 ↓ ≥ 30% vs cold (7-day observability sample)
- [ ] Routing pick does not add > 20ms KV read on hot path
- [ ] Agent tab first paint ↓ with warm chunks enabled (manual Lighthouse or SW log)

## Out of scope (2B)

- Workers AI model warm pools
- D1 read replicas / Hyperdrive for catalog (KV snapshot sufficient for 2B)
- Full CDN edge cache of tool schemas (future)

## Related docs

- [agentic-edge-sprint-1b-inference-gateway.md](./agentic-edge-sprint-1b-inference-gateway.md)
- `dashboard/src/pwa/warmAgentChunks.ts`
