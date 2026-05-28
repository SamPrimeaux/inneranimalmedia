---
title: "Dashboard Agent — Model Routing and Costs"
category: agentsam
updated: 2026-05-28
importance: high
surface: /dashboard/agent
---

# Model routing and costs

## Resolution (no hardcoded providers in hot path)

| Function | File |
|----------|------|
| `resolveModelForTask` | `src/core/resolveModel.js` |
| `resolveModelMeta` / `dispatchStream` | `src/core/provider.js` |
| Chat assembly | `src/api/agent.js` imports above |

Canonical catalog: **`agentsam_model_catalog`** (`model_key`, `provider`, `is_active`).

Routing arms / tiers: **`agentsam_routing_arms`**, **`agentsam_prompt_routes`** (selected by task/mode — not enumerated here).

## Chat request pins

From `ChatAssistant` FormData: `model`, optional `provider`, `task_type`, `route_key`, `mode` / `agent_mode`.

Worker merges with D1 resolution before `runAgentToolLoop`.

## Cost accounting

Tool loop accumulates `totalUsage` (`input_tokens`, `output_tokens`, cache fields) — `agent.js` ~3988–5075.

Persisted on agent run / command run rows (`cost_usd`, `input_tokens`, …) via ledger inserts in chat handler.

**UI visibility:** partial — gauges in `ChatAssistant`; full run cost may require analytics routes (not agent shell primary).

## Budget / enforcement

Inspect minimally:

- `agentsam_route_requirements` — capability gates before tools loaded  
- Mode policy on chat — `auto_run`, approval skips  
- `max_tool_calls` → SSE `tool_blocked`  

Do not audit full command table — only **execution implications** when a route denies tools or models.

## Failure modes

| Symptom | Cause |
|---------|--------|
| `All providers exhausted` | SSE `error` after retries |
| Wrong model | Stale UI picker vs D1 inactive catalog row |
| Zero cost shown | Run row not updated on early abort |
| 400 on model | Hallucinated `model_key` not in catalog |

## Cursor gap

Cost and model should be **per-turn visible and tied to tool runs**; production splits cost across tables with weak workbench surfacing.

## Files

`resolveModel.js`, `provider.js`, `agent.js` (usage totals), `ChatAssistant.tsx` (model picker)
