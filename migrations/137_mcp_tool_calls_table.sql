-- 137: Create mcp_tool_calls so recordMcpToolCall() and chat/execute-approved-tool can log tool runs.
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/137_mcp_tool_calls_table.sql
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
