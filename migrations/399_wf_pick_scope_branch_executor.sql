-- 399: Add branch executor_kind + point pick_scope at it (emits output.branch for graph edges).
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/399_wf_pick_scope_branch_executor.sql

PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS agentsam_workflow_handlers_v399 (
  handler_key           TEXT PRIMARY KEY,
  node_type             TEXT NOT NULL,
  executor_kind         TEXT NOT NULL CHECK(executor_kind IN (
                          'd1_sql','d1_write','agent_llm','mcp_tool',
                          'agent_step','script','catalog_tool',
                          'http','ui_emit','eval',
                          'terminal','approval','passthrough','branch')),
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

INSERT OR IGNORE INTO agentsam_workflow_handlers_v399
SELECT * FROM agentsam_workflow_handlers;

DROP TABLE IF EXISTS agentsam_workflow_handlers;
ALTER TABLE agentsam_workflow_handlers_v399 RENAME TO agentsam_workflow_handlers;

CREATE INDEX IF NOT EXISTS idx_awh_node_type     ON agentsam_workflow_handlers(node_type);
CREATE INDEX IF NOT EXISTS idx_awh_executor_kind ON agentsam_workflow_handlers(executor_kind);
CREATE INDEX IF NOT EXISTS idx_awh_active        ON agentsam_workflow_handlers(is_active);
CREATE INDEX IF NOT EXISTS idx_awh_tenant        ON agentsam_workflow_handlers(tenant_id);

PRAGMA foreign_keys = ON;

UPDATE agentsam_workflow_handlers
SET executor_kind = 'branch',
    description = 'Branches on embed_scope from run input (merged with prior step output). Emits output.branch for graph edges.',
    handler_config_json = '{"branch_field":"embed_scope"}',
    quality_gate_json = '{"branch_field":"embed_scope"}',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE handler_key = 'agentsam.embed.pick_scope';
