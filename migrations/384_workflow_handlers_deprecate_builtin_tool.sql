-- 384_workflow_handlers_deprecate_builtin_tool.sql
-- Relabel 12 active (17 total) builtin_tool rows → agent_step | script.
-- Extend executor_kind CHECK: drop builtin_tool; add agent_step, script.
-- Backfill empty handler_config_json: agent_step → handler_key; script → script_slug.
-- Fix cms.* registry node_type db_query → process (handlers table only).
--
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/384_workflow_handlers_deprecate_builtin_tool.sql
--
-- Requires Worker support for executor_kind agent_step + script (workflow-executor.js).

PRAGMA foreign_keys = OFF;

CREATE TABLE agentsam_workflow_handlers_v384 (
  handler_key           TEXT PRIMARY KEY,
  node_type             TEXT NOT NULL,
  executor_kind         TEXT NOT NULL CHECK(executor_kind IN (
                          'd1_sql','d1_write','agent_llm','mcp_tool',
                          'agent_step','script','catalog_tool',
                          'http','ui_emit','eval',
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

INSERT INTO agentsam_workflow_handlers_v384 (
  handler_key,
  node_type,
  executor_kind,
  title,
  description,
  handler_config_json,
  input_schema_json,
  quality_gate_json,
  risk_level,
  requires_approval,
  is_active,
  tenant_id,
  workspace_id,
  created_at,
  updated_at
)
SELECT
  handler_key,
  CASE
    WHEN executor_kind = 'builtin_tool'
      AND handler_key LIKE 'cms.%'
      AND node_type = 'db_query'
      THEN 'process'
    ELSE node_type
  END,
  CASE
    WHEN executor_kind != 'builtin_tool' THEN executor_kind
    WHEN handler_key = 'browser.capture_context'
      OR handler_key LIKE 'cms.%'
      THEN 'agent_step'
    WHEN handler_key = 'script.r2_put_artifact'
      THEN 'catalog_tool'
    WHEN handler_key LIKE 'script.%'
      OR handler_key LIKE 'script_%'
      THEN 'script'
    ELSE 'agent_step'
  END,
  title,
  description,
  CASE
    WHEN executor_kind = 'builtin_tool' AND handler_key = 'script.r2_put_artifact'
      THEN json_object('tool_key', 'r2_write')
    WHEN executor_kind = 'builtin_tool'
      AND (handler_key LIKE 'script.%' OR handler_key LIKE 'script_%')
      AND (
        handler_config_json IS NULL
        OR trim(handler_config_json) IN ('', '{}', 'null')
      )
      THEN json_object(
        'script_slug',
        CASE
          WHEN handler_key = 'script.audit_hyperdrive_bindings' THEN 'wf_r2_verify_bindings'
          WHEN handler_key = 'script_write_cms_live_editor_dev_artifacts' THEN 'wf_cms_live_editor_r2'
          WHEN handler_key LIKE 'script.%' THEN replace(handler_key, 'script.', 'wf_')
          ELSE handler_key
        END
      )
    WHEN executor_kind = 'builtin_tool'
      AND (
        handler_config_json IS NULL
        OR trim(handler_config_json) IN ('', '{}', 'null')
      )
      THEN json_object('handler_key', handler_key)
    ELSE handler_config_json
  END,
  input_schema_json,
  quality_gate_json,
  risk_level,
  requires_approval,
  is_active,
  tenant_id,
  workspace_id,
  created_at,
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM agentsam_workflow_handlers;

DROP TABLE agentsam_workflow_handlers;

ALTER TABLE agentsam_workflow_handlers_v384 RENAME TO agentsam_workflow_handlers;

CREATE INDEX IF NOT EXISTS idx_awh_node_type     ON agentsam_workflow_handlers(node_type);
CREATE INDEX IF NOT EXISTS idx_awh_executor_kind ON agentsam_workflow_handlers(executor_kind);
CREATE INDEX IF NOT EXISTS idx_awh_active        ON agentsam_workflow_handlers(is_active);
CREATE INDEX IF NOT EXISTS idx_awh_tenant        ON agentsam_workflow_handlers(tenant_id);

PRAGMA foreign_keys = ON;

-- ── Post-migrate spot checks (informational; wrangler may not surface SELECT) ──
-- SELECT executor_kind, COUNT(*) FROM agentsam_workflow_handlers GROUP BY executor_kind;
-- SELECT handler_key, node_type, executor_kind, handler_config_json
--   FROM agentsam_workflow_handlers
--   WHERE handler_key IN (
--     'browser.capture_context','cms.claimTheme','script.r2_put_artifact',
--     'script_write_cms_live_editor_dev_artifacts'
--   );
