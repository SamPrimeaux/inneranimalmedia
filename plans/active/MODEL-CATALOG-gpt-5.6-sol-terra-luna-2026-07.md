# Agent Sam — Model Catalog Update (2026-07-11)

**Handoff for Cursor / Agent Sam.** GPT-5.6 family (Sol, Terra, Luna) is live in D1. Verified remote `agentsam_model_catalog` + `agentsam_routing_arms` 2026-07-11.

**Law:** Do **not** hardcode model strings in hot paths. Resolve via `agentsam_model_catalog` / Thompson `agentsam_routing_arms` / `resolveModelForTask` only. Bare alias `gpt-5.6` routes to **Sol** — always use explicit IDs: `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`.

---

## Summary

OpenAI GPT-5.6 Sol / Terra / Luna are in catalog (`is_active=1`) with routing arms seeded. API account has confirmed access to all three. Dispatch: `api_platform=openai_responses`.

Related cost-guard context (same day, migration 820):

| Model | Auto / Thompson |
|---|---|
| `claude-sonnet-5` | **Active** builder (code / search_code / …) |
| `claude-opus-4-8` | Catalog ready; **all arms `is_paused=1`** until routing proven cheap |
| `claude-fable-5` | Catalog ready; Fable arms **`is_active=0`** until proven |
| Jul-23 Codex set + Sora | Retired |

---

## Catalog entries (verified live)

| model_key | openai_model_id | tier | routing_lane | $/1K in | $/1K out | api_platform |
|---|---|---|---|---|---|---|
| `gpt-5.6-sol` | `gpt-5.6-sol` | power | reasoning | 0.005 | 0.030 | openai_responses |
| `gpt-5.6-terra` | `gpt-5.6-terra` | standard | standard | 0.0025 | 0.015 | openai_responses |
| `gpt-5.6-luna` | `gpt-5.6-luna` | micro | fast | 0.001 | 0.006 | openai_responses |

Shared profile (catalog):

- Context: **1.05M** (confirm `context_window` on row if needed)
- Max output: **128K**
- Knowledge cutoff: **2026-02-16**
- All `is_active=1`

### Caching (gpt-5.6+)

New cost behavior for long system prompts:

- **Cache writes** = **1.25×** input rate (not free)
- **Cache reads** = **90% off**
- **Minimum cache life** = **30 minutes**

Factor into cost estimates and `agentsam_tool_call_log` / run cost ledgers when attributing GPT-5.6 turns.

---

## Routing arms (verified live)

Uniform Thompson start; `is_eligible=1`, `is_active=1`, `is_paused=0`.

### Sol (`gpt-5.6-sol`) — effort=high, fallback=`gpt-5.6-terra`

Live priorities are **55** (briefing draft said 50; D1 wins).

| arm id | task_type | mode |
|---|---|---|
| `ra_gpt56sol_workflow` | workflow_orchestration | agent |
| `ra_gpt56sol_reasoning` | reasoning | agent |
| `ra_gpt56sol_tool_use` | tool_use | agent |
| `ra_gpt56sol_subagent_master` | subagent_master | agent |
| `ra_gpt56sol_code_gen` | code_gen | agent |

### Terra (`gpt-5.6-terra`) — effort=medium

| arm id | task_type | mode | fallback |
|---|---|---|---|
| `ra_gpt56terra_chat_agent` | chat | agent | — |
| `ra_gpt56terra_chat_auto` | chat | auto | — |
| `ra_gpt56terra_tool_use` | tool_use | agent | `gpt-5.6-luna` |
| `ra_gpt56terra_subagent_worker` | subagent_worker | agent | `gpt-5.6-luna` |

### Luna (`gpt-5.6-luna`) — effort=low

| arm id | task_type | mode | priority | fallback |
|---|---|---|---|---|
| `ra_gpt56luna_gate` | gate | auto | **80** | `gpt-5.6-terra` |
| `ra_gpt56luna_chat_agent` | chat | agent | 50 | — |
| `ra_gpt56luna_chat_auto` | chat | auto | 50 | — |
| `ra_gpt56luna_subagent_worker` | subagent_worker | agent | 50 | — |

**Note:** Sol/Terra do **not** yet have dedicated `code` / `search_code` arms — those remain on Sonnet 5 / DeepSeek / others after migration 820. Do not assume GPT-5.6 wins code routes until arms exist.

---

## Authority-tier fit (Agent Sam)

| Authority | GPT-5.6 | Role |
|---|---|---|
| T1 Utility | **Luna** | gate, cheap chat, subagent_worker |
| T2 Executor | **Terra** | default chat/tool_use/worker |
| T3–T4 Builder / Engineer | **Sol** | code_gen, tool_use, subagent_master, workflow, reasoning |
| T5 Orchestrator | — | Still Fable / Opus when **unpaused** — not GPT-5.6 |

---

## Responses API features (awareness — not yet wired unless catalog/handlers say so)

1. **Programmatic Tool Calling (PTC)** — model writes/runs JS in hosted V8 to orchestrate tools in-memory (parallel, loops, conditionals); one structured result; ZDR-compatible. Candidate to simplify Agent Sam multi-turn tool dispatch.
2. **Multi-agent (beta)** — Sol can spawn concurrent subagents in one request. Relevant to `subagent_master` / `subagent_worker` architecture.

Do not invent JS PTC/multi-agent paths without D1 tool/handler rows and a ticket.

---

## Verify / test

```sql
-- Catalog
SELECT model_key, tier, routing_lane, api_platform, is_active
FROM agentsam_model_catalog WHERE model_key LIKE 'gpt-5.6%';

-- Arms
SELECT id, model_key, task_type, mode, priority, reasoning_effort, fallback_model_key
FROM agentsam_routing_arms WHERE model_key LIKE 'gpt-5.6%'
ORDER BY model_key, priority DESC;
```

Runtime proof (throwaway Agent chat + wrangler tail):

- `[resolveModel]` → `gpt-5.6-terra` / `luna` / `sol` as expected for task
- Never assume bare `gpt-5.6` in logs as a stable id — prefer explicit Sol/Terra/Luna

Pin test (when UI allows): request `gpt-5.6-luna` for a tiny gate/chat; confirm Path B / catalog load, not a hardcoded string.

---

## Cursor do / don’t

**Do**

- Route through catalog + arms only
- Use explicit `gpt-5.6-sol|terra|luna`
- Account for 1.25× cache-write cost on long system prompts
- Keep Opus 4.8 / Fable 5 paused until cheap routing is proven

**Don’t**

- Hardcode `gpt-5.6` or Sol/Terra/Luna in `src/` hot paths
- Treat Sol as daily default Agent chat (Terra/Luna + Sonnet 5 are cheaper defaults)
- Enable PTC / native multi-agent without a ticket + D1 SSOT
- Re-activate Opus/Fable arms casually after a single happy path

---

## Follow-ups (optional)

1. Seed `code` / `search_code` arms for Terra (T2) and/or Sol (T3) if OpenAI should share those lanes with Sonnet 5.
2. Ticket: PTC + multi-agent beta evaluation against `agent-tool-loop` / RWS spawn.
3. Cost ledger: confirm cache write/read fields for `openai_responses` gpt-5.6+ in telemetry SSOT.
