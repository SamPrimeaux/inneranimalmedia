# mcp_tool_calls and terminal_history logging — where it happens and why it might not fire

**Purpose:** Explain where tool and terminal runs are logged in worker.js, and why inventory can show 0 rows even when tools/terminal execute.

---

## 1. mcp_tool_calls — where logging should happen

### Path A: `recordMcpToolCall(env, opts)` (canonical for chat + execute-approved-tool)

- **Location:** worker.js ~4461.
- **Called from:** `invokeMcpToolFromChat` on every return path (builtin tools and MCP remote). So every tool run from:
  - POST `/api/agent/chat/execute-approved-tool`
  - Tool execution inside streaming/non-streaming chat (when tools are invoked via `invokeMcpToolFromChat`)

- **Condition that prevents logging:**
  - **`if (!env.DB) return;`** (line 4463). If `env.DB` is falsy, the function returns without writing anything.

- **INSERT used:** Lines 4472–4475:
  - Table: `mcp_tool_calls`
  - Columns: `id`, `tenant_id`, `session_id`, `tool_name`, `tool_category`, `input_schema`, `output`, `status`, `invoked_by`, `invoked_at`, `completed_at`, `created_at`, `updated_at`

- **On failure:** The INSERT is inside `try/catch`; on error it only `console.warn('[recordMcpToolCall] mcp_tool_calls', e?.message ?? e)`. So tools still execute but no row is written, and the only trace is a warning in logs.

### Path B: `runToolLoop` (streaming/non-streaming chat tool loop)

- **Location:** worker.js ~1640–1650.
- **Condition:** `if (!BUILTIN_TOOLS.has(toolName) && env.DB)`. So it only logs **non-builtin** tools (e.g. MCP remote tools). Builtins like `terminal_execute`, `d1_query`, `r2_read`, `knowledge_search`, `playwright_screenshot`, `browser_screenshot`, `d1_write`, `r2_list`, `generate_execution_plan` are **not** logged here.
- So for builtin tools (including terminal_execute), the **only** logging path is `recordMcpToolCall` inside `invokeMcpToolFromChat`.

### Path C: POST `/api/mcp/invoke`

- **Location:** worker.js ~4401, 4409, 4449.
- **INSERT used:** Different schema: `tool_name`, `input_json`, `output_json`, `session_id`, `status`, `created_at` (no `id`, `tenant_id`, `tool_category`, `input_schema`, `output`, `invoked_by`, `invoked_at`, `completed_at`, `updated_at`).
- So the codebase has **two different INSERT shapes** for `mcp_tool_calls`. If the table was created for one shape, the other will fail with column errors.

---

## 2. Why mcp_tool_calls might stay at 0 rows

1. **Table missing or wrong schema**  
   There is **no migration in this repo that creates `mcp_tool_calls`**. Migrations create `mcp_usage_log`, `mcp_agent_sessions`, `mcp_services`, etc., but not `mcp_tool_calls`. If the table does not exist, or exists only with the old 6-column schema (`tool_name`, `input_json`, `output_json`, `session_id`, `status`, `created_at`), then `recordMcpToolCall`’s INSERT (13 columns) will throw and the catch will only log a warning. Tools execute; no rows are written.

2. **`env.DB` falsy**  
   If for some reason `env.DB` is not set on the request that runs `invokeMcpToolFromChat` (e.g. execute-approved-tool), `recordMcpToolCall` returns immediately and no INSERT runs. In normal deployment the fetch handler receives the same `env` (including D1 binding `DB`), so this is less likely if other DB reads/writes work.

3. **Errors swallowed**  
   Any INSERT failure (e.g. “no such table”, “no such column”) is caught and only reported via `console.warn`. So logging “should” happen but doesn’t surface as an HTTP error.

---

## 3. terminal_history — where logging should happen

- **Location:** worker.js ~1730–1755, inside `runTerminalCommand`.
- **Condition:** **`if (env.DB)`** (line 1730). If `env.DB` is falsy, the whole block is skipped and no INSERT runs.
- **First try:** INSERT with columns `id`, `direction`, `content`, `triggered_by`, `terminal_session_id`, `agent_session_id`, `recorded_at` (migration 136).
- **On failure:** Catch runs a **legacy** INSERT with `id`, `direction`, `content`, `triggered_by`, `session_id`, `created_at` (schema from migration 117).
- So if the table exists with at least the legacy columns, one of the two INSERTs should succeed unless both fail (e.g. table missing).

---

## 4. Why terminal_history might stay at 0 rows

1. **`env.DB` falsy**  
   Same as above: if `env.DB` is not set when `runTerminalCommand` runs, the `if (env.DB)` block is skipped and nothing is written.

2. **Table missing**  
   Table is created in migration 117; columns extended in 136. If 117 was never run, there is no `terminal_history` table and both INSERTs would throw (and the second catch only logs).

3. **Both INSERTs failing**  
   Unlikely if the table exists with the 117 schema (legacy INSERT should work). Possible if the table was recreated with a different schema.

---

## 5. Summary: what to check

| Table               | Logging should happen in                         | Stops logging when                          |
|---------------------|---------------------------------------------------|----------------------------------------------|
| **mcp_tool_calls**  | `recordMcpToolCall()` from `invokeMcpToolFromChat`; also runToolLoop for non-builtin tools; also `/api/mcp/invoke` | `!env.DB`; table missing or wrong schema; INSERT throws (catch only warns) |
| **terminal_history** | `runTerminalCommand()` inside `if (env.DB)`      | `!env.DB`; table missing; both INSERTs throw |

**Recommended next steps:**

1. **Ensure `mcp_tool_calls` exists with the full schema** used by `recordMcpToolCall` (see migration below). Apply the migration in your D1 (e.g. `wrangler d1 execute ... --file=...`) after approval.
2. **Confirm migrations 117 and 136** for `terminal_history` have been run on the same DB.
3. **Inspect worker logs** after a tool run and a terminal run: look for `[recordMcpToolCall] mcp_tool_calls` or `[runTerminalCommand] terminal_history` warnings to confirm INSERT failures.

---

## 6. Proposed migration: create mcp_tool_calls (full schema)

Create a new migration file that defines `mcp_tool_calls` with all columns used by `recordMcpToolCall` and optionally by the legacy `/api/mcp/invoke` path (so both can write). Example:

```sql
-- Create mcp_tool_calls so recordMcpToolCall() and /api/mcp/invoke can log tool runs.
-- Columns match worker.js recordMcpToolCall (id, tenant_id, session_id, tool_name, tool_category, input_schema, output, status, invoked_by, invoked_at, completed_at, created_at, updated_at).

CREATE TABLE IF NOT EXISTS mcp_tool_calls (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux',
  session_id TEXT NOT NULL DEFAULT '',
  tool_name TEXT NOT NULL,
  tool_category TEXT NOT NULL DEFAULT 'mcp',
  input_schema TEXT NOT NULL DEFAULT '{}',
  output TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'completed',
  invoked_by TEXT NOT NULL DEFAULT 'agent_sam',
  invoked_at TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mcp_tool_calls_session ON mcp_tool_calls(session_id);
CREATE INDEX IF NOT EXISTS idx_mcp_tool_calls_tool_name ON mcp_tool_calls(tool_name);
CREATE INDEX IF NOT EXISTS idx_mcp_tool_calls_created ON mcp_tool_calls(created_at DESC);
```

After this migration is applied, run a tool (e.g. approve a terminal_execute or d1_query) and query `SELECT * FROM mcp_tool_calls ORDER BY created_at DESC LIMIT 5` to confirm rows appear.
