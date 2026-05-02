-- Migration 160 (git history name): mcp_workflow_runs + indexes — idempotent IF NOT EXISTS
-- Applied remotely; safe to re-run. Canonical duplicate of workflow_runs section from 159_mcp_workflows_tables.sql + index from 160_mcp_workflows_workflow_id_fk.sql

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
CREATE INDEX IF NOT EXISTS idx_mcp_workflow_runs_workflow_started ON mcp_workflow_runs(workflow_id, started_at DESC);
