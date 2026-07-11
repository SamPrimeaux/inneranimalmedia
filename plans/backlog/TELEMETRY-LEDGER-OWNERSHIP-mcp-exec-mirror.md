# [Telemetry] Ledger ownership — `scheduleRecordMcpToolExecution` mirror writes

## Product
Agent Sam / platform ops ledger

## Status
Backlog — full grep done 2026-07-11; Phase B lifecycle check done (insert-alongside, not update-in-place).

## Problem (one architectural gap)

`scheduleRecordMcpToolExecution` always inserts `agentsam_mcp_tool_execution`, then **optionally** mirrors into `agentsam_tool_call_log` via `scheduleToolCallLog` unless `skip_tool_call_log` / `skipToolCallLog` is set.

Nothing enforces that callers declare ownership. TELEMETRY-001 found this on the chat spine; the same gap appears wherever a primary writer also calls the mirror without the skip flag.

Default mirror `source_tool` is `'mcp_proxy'` (misleading — not external MCP traffic). TELEMETRY-003: rename to `mcp_exec_mirror`.

## Full-repo grep (2026-07-11)

```bash
grep -rn "scheduleRecordMcpToolExecution" --include="*.js" .
```

| # | File | Line(s) | Spine | Primary ledger writer | `skip_tool_call_log` | Risk |
|---|------|---------|-------|----------------------|----------------------|------|
| — | `mcp-tool-execution.js` | 369 | definition | — | honors flag | SSOT |
| 1 | `agent-tool-loop.js` | 1007 | chat | **none** (parse failure — primary never runs) | **no** | orphan mirror only (Phase A) |
| 2 | `agent-tool-loop.js` | 1038 | chat | `scheduleAgentsamToolCallLog` blocked | **yes** | patched |
| 3 | `agent-tool-loop.js` | 1106 | chat | `scheduleAgentsamToolCallLog` guardrail | **yes** | patched |
| 4 | `agent-tool-loop.js` | 1874 | chat | `scheduleAgentsamToolCallLog` success | **yes** | patched (TELEMETRY-001 gate) |
| 5 | `agent.js` | 5093, 5121 | execute-approved-tool | catalog `insertToolCallLog` | **yes** | patched |
| 6 | `command-run-telemetry.js` | 1523 | slash / `completeCommand` | direct `scheduleToolCallLog` same function | **no** | **success-success double** (Phase A) |
| 7 | `agent-terminal-run.js` | 226 | `/api/agent/terminal/run` | `scheduleTerminalToolCallLog` | **no** | **success-success double** (Phase A) |
| 8 | `agent-approval-gate.js` | 84 | approval pending | `scheduleAgentsamToolCallLog` pending | **no** | insert-alongside (Phase B) |
| 9 | `mcp.js` | 780 | dashboard MCP agents dispatch | `scheduleDispatchToolCallLog` pending | **no** | insert-alongside (Phase B) |
| 10 | `mcp.js` | 1103 | dashboard MCP dispatch (auth) | `scheduleDispatchToolCallLog` pending | **no** | insert-alongside (Phase B) |

### Related (bypasses wrapper)

| File | Line | Pattern |
|------|------|---------|
| `tools/db.js` | 64–88 | direct `recordMcpToolExecution` + `scheduleToolCallLog` — no skip contract |

### Not in main worker grep

- `inneranimalmedia-mcp-server` — OAuth `tools/call` logging (separate repo; separate follow-up).

---

## Phase A — terminal / orphan doubles (same skip flag; two failure modes)

**A1–A2 (`completeCommand`, `agent-terminal-run`):** two writers both claim a **terminal** success/error for the same call → classic success-success (or error-error) double.

**A3 (loop line 1007 — parse-error orphan):** **not** the same as loop success. On `__parse_error`, the primary writer (`scheduleAgentsamToolCallLog`) **never runs**. The mirror still INSERTs into `agentsam_tool_call_log` (default `source_tool=mcp_proxy`). Same fix (`skip_tool_call_log: true`, or add a matching primary writer), **different trigger**: mirror fires on a path with no primary ownership at all — do not file this as “same as loop success.”

Patch order for A: #6, #7, then #1 (explicit skip or intentional primary blocked/error row).

---

## Phase B — pending pairs (lifecycle check — done)

**Question:** does the pending row get **updated** to success, or does completion **insert a second row**?

**Answer: insert-alongside.** Repo-wide: **zero** `UPDATE agentsam_tool_call_log` statements. Completion always INSERTs a new row (catalog / loop / dispatch).

| Site | At create | At completion | Verdict |
|------|-----------|---------------|---------|
| `createApprovalRequest` | mcp-exec mirror INSERT (`success:false` → mirror status **`error`**, not pending) **plus** `scheduleAgentsamToolCallLog` status **`pending`** | `execute-approved-tool` → catalog `insertToolCallLog` **new** success row (pending never updated) | Same class as A: dual INSERT at start + third INSERT on complete. Not update-in-place lifecycle. |
| `mcp.js` ×2 | mcp-exec mirror INSERT (`success:false` → mirror **`error`**) **plus** `scheduleDispatchToolCallLog` INSERT status **`pending`** | No UPDATE of either `agentsam_tool_call_log` row found; zone spine continues elsewhere | Dual INSERT at dispatch start; not update-in-place. |

So Phase B **is** the same mechanism as Phase A (skip when another writer owns the ledger row), with an extra quirk: mirror maps `success: false` → `status: 'error'` even when mcp-exec `status` is `awaiting_approval` / `pending`, so one of the “pending pair” rows is often mis-labeled `error`.

**Phase B scope:** apply `skip_tool_call_log: true` on #8–10 (or drop redundant `scheduleDispatchToolCallLog` and keep a single writer). Do not treat as intentional status-field lifecycle unless a future design adds UPDATE-in-place.

---

## Phase C (TELEMETRY-003)

Rename default `mcp_proxy` → `mcp_exec_mirror`; optional CI grep that every `scheduleRecordMcpToolExecution` call either sets `skip_tool_call_log` or documents sole ownership.

---

## Recommended shape

**Single ticket**, phased A → B → C. Do not split by spine.

## Verification

Per spine after patch: one `agentsam_tool_call_log` row per logical tool invocation where `agent_run_id` exists (same COUNT gate as TELEMETRY-001).
