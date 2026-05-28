# Chunk 21 — Model routing and costs

**Status:** Draft (live paths verified; `/agentsam` slash commands **planned**, not found in repo)

## Purpose

Document how **live** `/dashboard/agent` chat selects models, surfaces cost/spend, and how we will govern routing and budgets — including future **`/agentsam`** operator commands (never `/buddy`).

## Live production scope

Every model invocation from agent chat on **inneranimalmedia.com/dashboard/agent** flows through Worker **`POST /api/agent/chat`** and D1-backed catalog — not client-hardcoded provider strings (per `.cursorrules`).

## Existing live code paths

| Kind | Path |
|------|------|
| Chat UI model picker | `dashboard/components/ChatAssistant/ChatAssistant.tsx` — Auto toggle, model/agent pickers |
| Stream | `dashboard/components/ChatAssistant/hooks/useAgentChatStream.ts` |
| Chat API | `src/api/agent.js` — `/api/agent/chat` |
| Model catalog | D1 `agentsam_model_catalog` (resolved in Worker; rule: no hardcoded models in hot paths) |
| Routing | D1 `agentsam_routing_arms`, `agentsam_prompt_routes`, `agentsam_route_requirements` |
| Policy | `src/core/agent-policy.js`, `agentsam_user_policy` |
| Spend UI | Context/$ gauges referenced in legacy UI plans; grep `total_cost`, `spend` in ChatAssistant |
| Config | `GET /api/agentsam/config` — `XTermShell.tsx` ~335 |
| Workflows cost fields | `agentsam_workflow_runs` — `cost_usd`, tokens (alignment rules) |

### Planned — NOT in live `/dashboard/agent` UI yet

Slash commands (product spec for this chunk):

| Command | Intent |
|---------|--------|
| `/agentsam models` | List allowed models for workspace |
| `/agentsam model <key>` | Set session model |
| `/agentsam effort <tier>` | Effort / reasoning tier |
| `/agentsam budget` | Show spend caps and remaining |
| `/agentsam local status` | Ollama / local inference status |
| `/agentsam bridge` | AgentSamBridgeKey / local connector status |

**Verification:** `rg '/agentsam ' dashboard src` — expect no composer slash router until implemented.


### Provider lanes (live Worker — not slash commands)

| Lane | Role on `/dashboard/agent` |
|------|------------------------------|
| **D1 `agentsam_model_catalog`** | Canonical provider + model_key resolution (no hardcoded hot-path strings) |
| **GPT / Anthropic / Google APIs** | Routed via catalog + `agentsam_routing_arms` / prompt routes |
| **Workers AI** | `@cf/` and Workers AI bindings when catalog row points there |
| **Local Ollama** | Intended via bridge/local connector — **not** full composer UX until B14-002 + `/agentsam local status` |
| **Tier gating** | `agentsam_model_tier` / workspace cost tier — free / test / pro exposure in UI TBD (B21-002) |

### Effort, budgets, runaway prevention (partial)

- **Effort / reasoning:** D1 `agentsam_ai.effort`, gate fields in `src/api/agent.js` (`gate_reasoning_effort`) — not exposed as `/agentsam effort` in UI yet.
- **Cost ceilings:** `agentsam_user_policy.max_cost_per_call_usd`, `max_cost_per_session_usd` — enforcement must surface in SSE errors (B21-002).
- **Tool budgets:** `dispatchToolCallWithBudget` wall-clock race in `src/api/agent.js`; browser/terminal spend should roll into session totals.
- **Premium model tracking:** `agentsam_agent_run`, workflow run `cost_usd` / token fields — observability exists; operator dashboard on agent page incomplete.

**Do NOT use `/buddy`.** All future slash commands: **`/agentsam` namespace only.**

## What is ALREADY engineered

- Server-side model resolution from D1 catalog (Worker), not fixed strings in dashboard bundle.
- Chat streaming with tool loops and telemetry hooks (chunk 09).
- Workspace-scoped policy tables exist in D1 (terminal `can_run_pty`, etc.).
- Workflow run rows track `cost_usd`, token fields for observability mirrors.

## What is PARTIALLY engineered

- **Visible cost confidence on mobile** — gauges not operator-grade.
- **Runaway spend prevention** — policy exists in places; not unified “budget ceiling” UX on agent page.
- **Local Ollama** — not documented here as live on `/dashboard/agent` until Worker route + UI wired.
- **Workers AI vs GPT vs Anthropic** — routed in Worker; operator cannot always see *why* a model was picked.

## What is BROKEN

| Gap | Note |
|-----|------|
| B21-001 | No `/agentsam` command namespace in composer | Planned |
| B21-002 | No single place for budget ceilings / quota enforcement UX on agent | Partial policy only |
| Hardcoded model strings in hot paths | Quality flag `HARDCODED_PROVIDER_MODEL` if found in `src/` on agent path |

## UX reality today

Operator picks **Auto** or a model from chat chrome. Cost visibility is secondary to chat. No slash-command governance. Failures show as stream errors, not always as “budget exceeded” with clear remediation.

## Data / event / execution flow

```text
/dashboard/agent ChatAssistant
  → POST /api/agent/chat (multipart: message, workspace, active file fields)
  → Worker: resolve route / model from D1 (agentsam_model_catalog, routing arms)
  → Provider API call
  → SSE: tokens, tool_*, context (may include agent_run_id)
  → Optional: D1 telemetry / agentsam_agent_run / cost fields
```

## Validation commands

```bash
rg -n "agentsam_model_catalog|routing_arms|resolveModel" src --glob '*.js' | head -30
rg -n "api/agent/chat" src/api/agent.js | head -5
rg -n "model|Auto|spend|cost" dashboard/components/ChatAssistant/ChatAssistant.tsx | head -40
rg -n "'/agentsam|/agentsam " dashboard src
```

## Acceptance criteria

- [ ] No new hardcoded model IDs in `dashboard/` request paths.
- [ ] `/agentsam` spec documented with NO `/buddy` naming.
- [ ] B21-001/002 on master backlog with owner.
- [ ] Free/test/pro gating rules written in D1 terms before UI exposes models.

## Repair backlog IDs

| ID | Title | Paths | Expected | Validation |
|----|-------|-------|----------|------------|
| B21-001 | `/agentsam` command namespace | `ChatAssistant.tsx`, `src/api/agent.js` | Parser + help text in composer | Type `/agentsam models` works |
| B21-002 | Cost ceilings and quota enforcement | D1 policy + chat SSE errors | Hard stop + user message before runaway | Integration test |

## Immediate next implementation step

Implement **`/agentsam models`** read-only: composer parses slash, Worker returns allowed models from `agentsam_model_catalog` for workspace — no model change yet.
