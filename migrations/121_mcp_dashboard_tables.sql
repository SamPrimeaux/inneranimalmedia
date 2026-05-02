-- 121: MCP dashboard tables for /api/mcp/* (agents, commands, dispatch, services)
-- Run: npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/121_mcp_dashboard_tables.sql
-- Purpose: GET /api/mcp/agents (join session), GET /api/mcp/commands, POST /api/mcp/dispatch (intent routing + session), GET/POST /api/mcp/services (mcp_services already exists).

-- Sessions for MCP agents (Architect, Builder, Tester, Operator)
CREATE TABLE IF NOT EXISTS mcp_agent_sessions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT 'iam',
  status TEXT NOT NULL DEFAULT 'idle',
  current_task TEXT,
  progress_pct INTEGER NOT NULL DEFAULT 0,
  stage TEXT,
  logs_json TEXT NOT NULL DEFAULT '[]',
  active_tools_json TEXT NOT NULL DEFAULT '[]',
  cost_usd REAL NOT NULL DEFAULT 0,
  messages_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mcp_agent_sessions_agent_created ON mcp_agent_sessions(agent_id, created_at);

-- Command suggestions for the MCP command bar (pinned chips + list)
CREATE TABLE IF NOT EXISTS mcp_command_suggestions (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  example_prompt TEXT NOT NULL,
  routed_to_agent TEXT NOT NULL,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_mcp_command_suggestions_pinned_order ON mcp_command_suggestions(is_pinned, sort_order);

-- Intent routing: match prompt keywords to agent (first match wins)
CREATE TABLE IF NOT EXISTS agent_intent_patterns (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  triggers_json TEXT NOT NULL DEFAULT '[]',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_agent_intent_patterns_active ON agent_intent_patterns(is_active);

-- Seeds: run 121_mcp_dashboard_tables_part2.sql after this.
