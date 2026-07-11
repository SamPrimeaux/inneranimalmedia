# [Telemetry] Tool cost ledger SSOT + single writer (chat path)

## Product
Agent Sam

## Status
**Closed — chat path green** (sha `d3a68a3e`, live gate `arun_785f879bb57d` → COUNT=1).

## Before metrics (prod D1, 2026-07-11)

| Metric | Value |
|--------|------:|
| Total `agentsam_tool_call_log` rows | 426 |
| Success + duration>0 + cost=0 | 403 |
| Any nonzero `cost_usd` | 0 |
| Rows with `agent_run_id` | 45 |
| Duplicate buckets (`agent_run_id`+tool+2s window) | 15 buckets / 42 rows |
| Near-duplicate pairs (same run+tool, ≤2s) | 79 |

## Contract: `skipToolCallLog`

Set by **agent-tool-loop** on the runContext object passed into
`dispatchToolCallWithBudget` → `dispatchToolCall` → `dispatchByToolCode` →
`executeCatalogTool`:

```js
skipToolCallLog: true,
ledgerOwner: 'tool_loop',
```

Catalog `finalizeTelemetry` / cache-hit path call `shouldSkipCatalogToolCallLog(runContext)`
and skip `insertToolCallLog` when true. Loop owns the row via
`scheduleAgentsamToolCallLog`.

Approved-tool path in `agent.js` does **not** set the flag — catalog still writes
(that path does not call `scheduleAgentsamToolCallLog`).

## Files

- `src/core/tool-exec-telemetry.js` (new) — SSOT `extractToolExecUsage`
- `src/core/catalog-tool-executor.js` — import SSOT; honor skip
- `src/core/agent-tool-loop.js` — set flag; extract; pass costs
- `src/core/agent-prompt-builder.js` — pass through `inputCostUsd`/`outputCostUsd`

## Verified: `scheduleToolCallLog`

Accepts `inputCostUsd` / `input_cost_usd` and `outputCostUsd` / `output_cost_usd`
(ops-ledger.js ~273–280).

## Approval-path write ownership (verified before promote)

ChatAssistant non-plan approve:

1. `createApprovalRequest` → `scheduleAgentsamToolCallLog` status **`pending`** (duration 0)  
2. UI → `POST /api/agent/chat/execute-approved-tool` → `dispatchToolCallWithBudget` **without** `skipToolCallLog`  
3. Catalog `insertToolCallLog` owns the **success** row  
4. `execute-approved-tool` does **not** call `scheduleAgentsamToolCallLog`

Plan-terminal approve uses `/api/agent/plan-task/resume` (separate spine) — out of TELEMETRY-001.

Prod snapshot: `status='pending'` rows = 0; `approval_id` populated rows = 0 — no historical approval sample to score for success-success doubles. Code path does not double-write success for the same call.

True success-success doubles (catalog + loop) are the 4 buckets / 39 rows with `statuses='success'` among agent_run_id groups — what Layer 2 fixes for the chat loop path.

Verified pre-deploy timestamps (all historical, before TELEMETRY-001 ship):

| agent_run_id | tool | n | first_iso (UTC) | last_iso |
|--------------|------|---|-----------------|----------|
| arun_90897b271b71 | agentsam_github_tree | 9 | 2026-07-11 00:22:06 | 00:22:21 |
| arun_90897b271b71 | agentsam_github_read_many | 6 | 2026-07-11 00:22:13 | 00:22:32 |
| arun_4e5ce57c087b | agentsam_d1_query | 18 | 2026-07-11 01:57:27 | 01:58:15 |
| arun_99a8b3235c15 | agentsam_terminal_sandbox | 6 | 2026-07-11 02:21:10 | 02:21:25 |

These predate the fix; forward chat-loop path cannot double-write once `skipToolCallLog` is set.

## Alias debt

`export const extractUsageMetrics = extractToolExecUsage` in `tool-exec-telemetry.js` is an intentional transitional shim so catalog can keep the local name during import. **Removal condition:** delete the alias once nothing outside `tool-exec-telemetry.js` imports `extractUsageMetrics` by name (catalog should import `extractToolExecUsage` directly).

## Live single-row gate

Requires this commit on a Worker before D1 can prove one row. Local SSOT acceptance: `node scripts/telemetry-001-acceptance.mjs` (PASS). After sandbox/prod worker deploy: one free-tool chat turn → count `agentsam_tool_call_log` for that `agent_run_id` = 1.

**First live attempt (sha 65b4edb7):** `arun_f0872f39b56b` → **COUNT=2**. Catalog skip worked (`source_tool=agent` + `input_summary` present). Second row was `source_tool=mcp_proxy` from `scheduleRecordMcpToolExecution` → `scheduleToolCallLog` — a third writer not in the original catalog+loop spine. Fix: `skip_tool_call_log: true` from the loop (and execute-approved-tool) into `scheduleRecordMcpToolExecution`.

**Second live attempt (sha d3a68a3e):** `arun_785f879bb57d` → **COUNT=1** (`agentsam_d1_query`, `source_tool=agent`, `cost_usd=0`, `duration_ms=175`).

## D1 framing correction: `source_tool = mcp_proxy`

Early source-mix analysis treated **`mcp_proxy` counts as external-client / MCP-traffic signal**. That was wrong.

`mcp_proxy` is **not** a traffic-source label. It is the **default fallback** on `scheduleRecordMcpToolExecution` → `scheduleToolCallLog` when the caller does not pass `source_tool` — an internal mirror write, produced routinely by in-app dispatch (chat loop, slash commands, terminal run, approval pending, dashboard MCP panel). It is **unrelated** to catalog `dispatch_target = 'mcp_proxy'` (CF Bindings MCP routing).

The bug still affects real traffic (`claude: 368` and other non-mirror sources establish dashboard impact). Do **not** interpret historical `mcp_proxy: N` in GROUP BY source_tool as external MCP OAuth volume.

**TELEMETRY-003:** rename default `mcp_proxy` → `mcp_exec_mirror` (or require explicit `source_tool` on every caller).

## Follow-up (out of TELEMETRY-001 scope)

Architectural gap: nothing requires `scheduleRecordMcpToolExecution` callers to declare ledger ownership. Full-repo enumeration → `plans/backlog/TELEMETRY-LEDGER-OWNERSHIP-mcp-exec-mirror.md`.

Paid tool usage/cost (image gen first) → `plans/active/TELEMETRY-002-paid-tool-usage-cost.md`.

Model attribution columns (orchestrator vs tool-executor) → `plans/backlog/TELEMETRY-MODEL-ATTRIBUTION-tool-call-log.md`.
