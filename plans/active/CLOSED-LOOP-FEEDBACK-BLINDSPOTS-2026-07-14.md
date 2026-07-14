# CLOSED-LOOP — Wire blind telemetry into routing + briefing

**Ticket:** `tkt_closed_loop_feedback_blindspots_2026_07_14`  
**Status:** `active` · **Priority:** P0  
**Project:** `inneranimalmedia` · **Subsystem:** `telemetry`  
**Tags:** `closed-loop`, `thompson`, `otlp`, `escalation`, `learning`  
**Required passes:** 2 (dual-pass E2E before `shipped`)

## Problem

Execution and failure data already exists in D1, but the learning / briefing / routing surfaces do not read it — so Thompson, daily briefings, and “things went wrong” stay dark.

| Store | Approx rows (2026-07) | Blind spot |
|-------|----------------------:|------------|
| `agentsam_mcp_tool_execution` | 2,313 | Actual MCP execution record unused by routing |
| `agentsam_tool_call_log` | 362 | Tool outcomes unused before model/tool select |
| `context_search_log` | 1,152 | Search feedback unused |
| `agentsam_tool_stats_compacted` | 223 | Reward/compact stats idle |
| Thompson / routing arms | ~547 with reward data | Arms never consume feedback before pick |
| `otlp_traces` | 5,785 | Latency/error spans unread by briefing + observability UI |
| `agentsam_escalation` | 413 | Escalations not alerted, not in daily summary, not a routing signal |

## Outcome (when done)

1. **Pre-select feedback:** Before choosing model/tool, routing reads aggregated stats from tool execution / call log / compacted rewards (fail-soft if empty).
2. **OTLP consumers:** At least one daily briefing section + one dashboard/API path that summarizes recent `otlp_traces` (latency p50/p95, error rate by operation).
3. **Escalation surfacing:** Escalations appear in daily briefing + optional alert hook; count/trend exposed via existing ops API where natural.
4. **Proof:** Two independent E2E passes showing (a) a routing decision cites reward/stats input in logs or decision metadata, (b) briefing includes OTLP + escalation sections with non-zero when data exists.

## Non-goals

- Replacing D1 execution logs with Supabase-only.
- Full Wave 3 UUID/RLS.
- Perfect Thompson math — wire the read path first; refine sampling later (`tkt_thompson_*` backlog can deepen).

## Related tickets

- `tkt_arm_cost_mean_loop`, `tkt_reward_events_tenant`, `tkt_consolidate_arm_writers` — reward writers
- `tkt_closed_loop_code_rag_2026_07_14` — CODE RAG / memory closed loop (parallel)
- Cursor plan: `supabase_closed_loop_4918b9c6`

## Dual-pass close

```bash
npm run record:ticket-e2e-pass -- --ticket=tkt_closed_loop_feedback_blindspots_2026_07_14 --detail='PASS1: …'
npm run record:ticket-e2e-pass -- --ticket=tkt_closed_loop_feedback_blindspots_2026_07_14 --detail='PASS2: …'
npm run assert:ticket-shippable -- --ticket=tkt_closed_loop_feedback_blindspots_2026_07_14 --set-shipped
```
