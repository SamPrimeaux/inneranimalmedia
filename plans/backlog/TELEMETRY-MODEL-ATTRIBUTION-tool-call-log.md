# [Telemetry] Model attribution on `agentsam_tool_call_log`

## Product
Agent Sam / platform ops ledger

## Status
**Backlog** — join decision made (2026-07-11). Deprioritized behind **TELEMETRY-002** (paid tool usage/cost). No migration SQL in this doc.

## Problem

`agentsam_tool_call_log` has no `model_used` / `provider` columns and the chat loop success writer does not pass model fields from `extractToolExecUsage` even when the extractor returns them. Attribution was **never wired**, not broken by TELEMETRY-001.

Before scoping a migration, we checked whether existing `routing_arm_id` can substitute for columns.

---

## Join decision (2026-07-11) — **columns + write required**

| Approach | Verdict |
|----------|---------|
| View/join on `routing_arm_id → agentsam_routing_arms.model_key` | **Insufficient** — sparse (~4% populated), pre-fallback semantics, chat-spine only |
| View/join on `agent_run_id → agentsam_agent_run.model_key` | **Optional reporting** for orchestrator context only; not tool-served model |
| Migration + write at log time | **Required** for accurate served-model attribution (especially TELEMETRY-002 paid tools) |

### Prod population (2026-07-11)

| Metric | Value |
|--------|------:|
| Total `agentsam_tool_call_log` rows | 430 |
| Rows with non-null `routing_arm_id` | 17 (~4%) |
| Rows with non-null `agent_run_id` | 49 (~11%) |
| Gate row `arun_785f879bb57d` | `routing_arm_id = null`; `agentsam_agent_run.model_key = gpt-4.1-mini` |

`routing_arm_id` on tool rows is the **chat turn dispatch-spine arm** (set once at loop start via `attributedRoutingArmId()`), not per-tool routing and not tool-internal model selection (`pickImageModelFromDb`, sub-LLM handlers, etc.).

### Fallback blindness (platform-wide — flag for later)

In `resolveModel.js`, Thompson fallback returns `loadModelRecord(..., arm.fallback_model_key, 'thompson_fallback', **arm.id**, ...)`: **`routing_arm_id` stays the primary arm id while `model_key` on the resolved record is the fallback model.** The `agentsam_routing_arms` row still shows the primary `model_key`.

**Any code that reads `agentsam_routing_arms.model_key` (or joins `routing_arm_id` → arm) to answer “what model did this arm serve?” is potentially wrong after a fallback** — not only ledger attribution. No action in this ticket; document so it is not rediscovered as a surprise.

---

## Two different facts — do not merge into one column

These answer **different questions**. A single undifferentiated `model_used` column will produce another `mcp_proxy`-style misread.

| Fact | Source | Question answered |
|------|--------|-------------------|
| **Orchestrator model** | `agent_run_id → agentsam_agent_run.model_key` / `provider` | Which chat LLM decided to invoke tools this turn? |
| **Tool-executor model** | `toolUsage.modelUsed` / `provider` from `extractToolExecUsage(execResult)` at log time | Which model actually ran **inside** this tool call (image gen via `pickImageModelFromDb`, sub-LLM tools, etc.)? |

Recommended column names (when migration lands — not in this doc):

- `orchestrator_model_key` + `orchestrator_provider` **or** rely on join view only (no denorm)
- `tool_model_key` + `tool_provider` (written from exec result — **required for billing attribution**)

Do **not** name a lone column `model_used` without documenting which fact it carries.

---

## Recommended implementation shape (when promoted)

1. **Migration:** add `tool_model_key`, `tool_provider` (and optionally `orchestrator_model_key` if denorm desired; else document join view).
2. **Write path:** thread `toolUsage.modelUsed` / `toolUsage.provider` from loop + catalog `scheduleToolCallLog` / `scheduleAgentsamToolCallLog`.
3. **Optional view:** `agentsam_tool_call_log` LEFT JOIN `agentsam_agent_run` for orchestrator context in dashboards (no substitute for tool columns).
4. **Backfill:** not required for forward-only gate; historical rows stay null.

---

## Verification (when implemented)

- Image tool success row: `tool_model_key` matches `result.model` from `runImageGenerationForTool`, not chat `agentsam_agent_run.model_key`.
- Free tool (`agentsam_d1_query`): `tool_model_key` null; orchestrator join optional.
- Post-fallback chat run: `agentsam_agent_run.model_key` reflects served model; tool row `routing_arm_id` join to arm primary model **must not** be used as served-model proof.

---

## Sequencing

| Priority | Item |
|----------|------|
| 1 | **TELEMETRY-002** — paid tools stop hard-zeroing (usage/cost on exec result) |
| 2 | TELEMETRY-LEDGER-OWNERSHIP Phase B (blocked on Finding #3 status mislabel) |
| 3 | **This ticket** — schema + write for tool-executor attribution |
| 4 | TELEMETRY-003 — rename `mcp_proxy` → `mcp_exec_mirror` |

## Related

- `plans/active/TELEMETRY-001-tool-cost-ledger-ssot.md` — chat path closed; extractor returns `modelUsed` but loop does not persist it yet.
- `plans/backlog/TELEMETRY-LEDGER-OWNERSHIP-mcp-exec-mirror.md` — separate ledger ownership gap.
