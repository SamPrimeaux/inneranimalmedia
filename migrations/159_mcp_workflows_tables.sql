-- Migration 159: MCP workflows + runs (IF NOT EXISTS for remote-first apply)
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/159_mcp_workflows_tables.sql

CREATE TABLE IF NOT EXISTS mcp_workflows (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  trigger_type TEXT,
  trigger_config_json TEXT NOT NULL DEFAULT '{}',
  steps_json TEXT NOT NULL,
  timeout_seconds INTEGER NOT NULL DEFAULT 300,
  requires_approval INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  run_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  last_run_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_mcp_workflows_tenant ON mcp_workflows(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mcp_workflows_tenant_status ON mcp_workflows(tenant_id, status);

CREATE TABLE IF NOT EXISTS mcp_workflow_runs (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  workflow_id TEXT NOT NULL,
  session_id TEXT,
  tenant_id TEXT NOT NULL,
  status TEXT NOT NULL,
  triggered_by TEXT,
  started_at INTEGER,
  completed_at INTEGER,
  cost_usd REAL NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  error_message TEXT,
  step_results_json TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_mcp_workflow_runs_workflow ON mcp_workflow_runs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_mcp_workflow_runs_tenant ON mcp_workflow_runs(tenant_id);
