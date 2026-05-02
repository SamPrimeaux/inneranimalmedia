-- Migration 159 (git history name): mcp_workflows only — idempotent IF NOT EXISTS
-- Applied remotely; safe to re-run. Canonical duplicate of 159_mcp_workflows_tables.sql workflows section.

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
