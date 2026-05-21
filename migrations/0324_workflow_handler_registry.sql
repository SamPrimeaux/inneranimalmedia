-- 0324_workflow_handler_registry.sql
-- Consolidates agentsam_workflow_node_handlers (8 rows, migration 368)
-- into agentsam_workflow_handlers (CHECK on executor_kind + 4 indexes).
-- Migrates existing rows, drops old table.
-- Also adds handler_config_json to agentsam_workflow_nodes.

CREATE TABLE IF NOT EXISTS agentsam_workflow_handlers (
  handler_key           TEXT PRIMARY KEY,
  node_type             TEXT NOT NULL,
  executor_kind         TEXT NOT NULL CHECK(executor_kind IN (
                          'd1_sql','d1_write','agent_llm','mcp_tool',
                          'builtin_tool','http','ui_emit','eval',
                          'terminal','approval','passthrough')),
  title                 TEXT,
  description           TEXT,
  handler_config_json   TEXT NOT NULL DEFAULT '{}',
  input_schema_json     TEXT NOT NULL DEFAULT '{}',
  quality_gate_json     TEXT NOT NULL DEFAULT '{}',
  risk_level            TEXT NOT NULL DEFAULT 'low',
  requires_approval     INTEGER NOT NULL DEFAULT 0,
  is_active             INTEGER NOT NULL DEFAULT 1,
  tenant_id             TEXT,
  workspace_id          TEXT,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_awh_node_type     ON agentsam_workflow_handlers(node_type);
CREATE INDEX IF NOT EXISTS idx_awh_executor_kind ON agentsam_workflow_handlers(executor_kind);
CREATE INDEX IF NOT EXISTS idx_awh_active        ON agentsam_workflow_handlers(is_active);
CREATE INDEX IF NOT EXISTS idx_awh_tenant        ON agentsam_workflow_handlers(tenant_id);

-- Migrate 8 existing rows from agentsam_workflow_node_handlers (all valid passthrough)
INSERT OR IGNORE INTO agentsam_workflow_handlers
  (handler_key, node_type, executor_kind, title, description,
   handler_config_json, input_schema_json, quality_gate_json,
   risk_level, requires_approval, is_active, tenant_id, workspace_id,
   created_at, updated_at)
SELECT
  handler_key, node_type, executor_kind, title, description,
  COALESCE(handler_config_json, '{}'), COALESCE(input_schema_json, '{}'),
  COALESCE(quality_gate_json, '{}'), COALESCE(risk_level, 'low'),
  COALESCE(requires_approval, 0), COALESCE(is_active, 1),
  tenant_id, workspace_id,
  COALESCE(created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  COALESCE(updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
FROM agentsam_workflow_node_handlers;

-- Drop old table — Worker references agentsam_workflow_handlers only from now on
DROP TABLE IF EXISTS agentsam_workflow_node_handlers;


-- Add handler_config_json to nodes (safe if already exists — SQLite ignores duplicate ADD COLUMN)
ALTER TABLE agentsam_workflow_nodes ADD COLUMN handler_config_json TEXT DEFAULT '{}';
