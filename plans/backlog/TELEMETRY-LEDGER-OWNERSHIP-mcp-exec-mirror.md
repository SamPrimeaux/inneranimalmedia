# [Telemetry] Ledger ownership — `scheduleRecordMcpToolExecution` mirror writes

## Product
Agent Sam / platform ops ledger

## Status
Phase A implemented (pending ship). Phase B blocked on Finding #3 labeling fix scoped separately. Phase C (rename) deferred to TELEMETRY-003.

## Problem (one architectural gap)

`scheduleRecordMcpToolExecution` always inserts `agentsam_mcp_tool_execution`, then **optionally** mirrors into `agentsam_tool_call_log` via `scheduleToolCallLog` unless `skip_tool_call_log` / `skipToolCallLog` is set.

Nothing enforces that callers declare ownership. TELEMETRY-001 found this on the chat spine; the same gap appears wherever a primary writer also calls the mirror without the skip flag.

Default mirror `source_tool` is `'mcp_proxy'` (misleading — not external MCP traffic). TELEMETRY-003: rename to `mcp_exec_mirror`.

## Three distinct findings (do not fold)

| # | Finding | What it breaks | Fix |
|---|---------|----------------|-----|
| **1** | **Duplicate row** — mirror writes `agentsam_tool_call_log` when another writer already owns it | COUNT>1 per call; polluted GROUP BY | `skip_tool_call_log: true` when a primary writer exists |
| **2** | **Orphan mirror** — mirror writes when primary never ran (parse-error path) | Ledger row from mirror only; no intentional primary | Add primary writer **and** skip, or skip alone |
| **3** | **Wrong status value** — callers pass `success: false` for in-flight `awaiting_approval` / `pending`; mirror maps that to `status: 'error'` | Any query/dashboard counting `status = 'error'` quietly includes normal in-flight approvals/dispatches as failures | Stop passing `success: false` for non-terminal states; map pending → ledger `pending` (not `error`). **Independent of skip-flag.** Skip removes the duplicate; without this, one clean row can still lie about state. |

Finding #3 is **not** a side effect of Phase A/B ownership patches. If someone later asks “why did pending approvals show as errors in Q3,” point here — not at the double-write ticket narrative.

## Full-repo grep (2026-07-11)

```bash
grep -rn "scheduleRecordMcpToolExecution" --include="*.js" .
```

| # | File | Line(s) | Spine | Primary ledger writer | `skip_tool_call_log` | Risk |
|---|------|---------|-------|----------------------|----------------------|------|
| — | `mcp-tool-execution.js` | 369 | definition | — | honors flag | SSOT |
| 1 | `agent-tool-loop.js` | ~1007 | chat | `scheduleAgentsamToolCallLog` error (Phase A3) | **yes** (Phase A) | patched |
| 2 | `agent-tool-loop.js` | 1038+ | chat | `scheduleAgentsamToolCallLog` blocked | **yes** | patched |
| 3 | `agent-tool-loop.js` | 1106+ | chat | `scheduleAgentsamToolCallLog` guardrail | **yes** | patched |
| 4 | `agent-tool-loop.js` | 1874+ | chat | `scheduleAgentsamToolCallLog` success | **yes** | patched (TELEMETRY-001 gate) |
| 5 | `agent.js` | 5093, 5121 | execute-approved-tool | catalog `insertToolCallLog` | **yes** | patched |
| 6 | `command-run-telemetry.js` | 1523 | slash / `completeCommand` | direct `scheduleToolCallLog` same function | **yes** (Phase A) | patched |
| 7 | `agent-terminal-run.js` | 226 | `/api/agent/terminal/run` | `scheduleTerminalToolCallLog` | **yes** (Phase A) | patched |
| 8 | `agent-approval-gate.js` | 84 | approval pending | `scheduleAgentsamToolCallLog` pending | **no** | Phase B + Finding #3 |
| 9 | `mcp.js` | 780 | dashboard MCP agents dispatch | `scheduleDispatchToolCallLog` pending | **no** | Phase B + Finding #3 |
| 10 | `mcp.js` | 1103 | dashboard MCP dispatch (auth) | `scheduleDispatchToolCallLog` pending | **no** | Phase B + Finding #3 |

### Related (bypasses wrapper)

| File | Line | Pattern |
|------|------|---------|
| `tools/db.js` | 64–88 | direct `recordMcpToolExecution` + `scheduleToolCallLog` — no skip contract |

### Not in main worker grep

- `inneranimalmedia-mcp-server` — OAuth `tools/call` logging (separate repo; separate follow-up).

---

## Phase A — terminal / orphan doubles (implemented)

**A1–A2 (`completeCommand`, `agent-terminal-run`):** two writers both claimed a **terminal** success/error for the same call → classic success-success (or error-error) double. Fix: `skip_tool_call_log: true` on mcp-exec; primary `scheduleToolCallLog` / `scheduleTerminalToolCallLog` keeps ownership.

**A3 (loop parse-error orphan):** **not** the same as loop success. On `__parse_error`, the primary writer **never ran**; the mirror still INSERTed. Fix: add `scheduleAgentsamToolCallLog` status `error` (intentional primary) **and** `skip_tool_call_log: true` on mcp-exec — same pattern as blocked/guardrail, different trigger condition.

---

## Phase B — pending pairs (lifecycle check — done; patch after Finding #3 scoped)

**Question:** does the pending row get **updated** to success, or does completion **insert a second row**?

**Answer: insert-alongside.** Repo-wide: **zero** `UPDATE agentsam_tool_call_log` statements. Completion always INSERTs a new row (catalog / loop / dispatch).

| Site | At create | At completion | Verdict |
|------|-----------|---------------|---------|
| `createApprovalRequest` | mcp-exec mirror INSERT (`success:false` → mirror status **`error`**, not pending) **plus** `scheduleAgentsamToolCallLog` status **`pending`** | `execute-approved-tool` → catalog `insertToolCallLog` **new** success row (pending never updated) | Dual INSERT at start + third INSERT on complete. Finding #1 (duplicate) + Finding #3 (wrong status on mirror). |
| `mcp.js` ×2 | mcp-exec mirror INSERT (`success:false` → mirror **`error`**) **plus** `scheduleDispatchToolCallLog` INSERT status **`pending`** | No UPDATE of either row | Dual INSERT at dispatch start. Finding #1 + Finding #3. |

**Phase B ownership fix:** `skip_tool_call_log: true` on #8–10 (or drop redundant `scheduleDispatchToolCallLog`).

**Phase B must also address Finding #3** (or a sibling patch in the same PR): do not leave one “clean” pending row that still has `status: 'error'` because `success: false` was passed for an in-flight state. Labeling fix is explicit — not “comes free with skip.”

---

## Phase C (TELEMETRY-003)

Rename default `mcp_proxy` → `mcp_exec_mirror`; optional CI grep that every `scheduleRecordMcpToolExecution` call either sets `skip_tool_call_log` or documents sole ownership.

---

## Recommended shape

**Single ticket**, phased A → B (+ Finding #3) → C. Do not split by spine.

## Verification

Per spine after patch: one `agentsam_tool_call_log` row per logical tool invocation where `agent_run_id` exists (same COUNT gate as TELEMETRY-001). Pending/in-flight rows must use `status: 'pending'` (or equivalent), never `error`, until terminal outcome.
