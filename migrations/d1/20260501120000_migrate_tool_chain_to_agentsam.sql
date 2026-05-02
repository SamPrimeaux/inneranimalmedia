-- D1: agentsam_tool_chain — canonical schema in repo (table already exists on prod inneranimalmedia-business).
-- Do NOT drop agent_tool_chain — leave it for audit/legacy reads.
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/d1/20260501120000_migrate_tool_chain_to_agentsam.sql

CREATE TABLE IF NOT EXISTS agentsam_tool_chain (
  id TEXT PRIMARY KEY DEFAULT ('atc_' || lower(hex(randomblob(8)))),
  plan_id TEXT REFERENCES agentsam_plans(id),
  todo_id TEXT,
  workspace_id TEXT NOT NULL DEFAULT 'ws_inneranimalmedia',
  subagent_profile_id TEXT,
  agent_session_id TEXT,
  agent_message_id TEXT,
  tool_name TEXT NOT NULL,
  tool_id TEXT REFERENCES agentsam_tools(id),
  mcp_tool_call_id TEXT,
  terminal_session_id TEXT,
  command_execution_id TEXT,
  parent_chain_id TEXT REFERENCES agentsam_tool_chain(id),
  depth INTEGER NOT NULL DEFAULT 0,
  tool_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (tool_status IN ('pending','running','completed','failed','skipped','cancelled','timeout')),
  input_json TEXT DEFAULT '{}',
  output_summary TEXT,
  result_json TEXT,
  error_message TEXT,
  error_type TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 2,
  duration_ms INTEGER,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  requires_approval INTEGER NOT NULL DEFAULT 0,
  approved_by TEXT,
  approved_at INTEGER,
  started_at INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_atc_plan_id ON agentsam_tool_chain(plan_id);
CREATE INDEX IF NOT EXISTS idx_atc_tool_status ON agentsam_tool_chain(tool_status);
CREATE INDEX IF NOT EXISTS idx_atc_agent_session ON agentsam_tool_chain(agent_session_id);
