-- 385_workflow_script_slug_and_catalog_tool.sql
-- Wire script executor_kind rows to agentsam_scripts.slug; R2 inline step → catalog_tool.
-- Extend agentsam_workflow_handlers CHECK with catalog_tool (rebuild if 384 already applied).
--
-- Run after 384:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/385_workflow_script_slug_and_catalog_tool.sql

-- ── Seed agentsam_scripts for workflow slugs (idempotent) ─────────────────────

INSERT OR IGNORE INTO agentsam_scripts (
  id, tenant_id, workspace_id, slug, name, path, body, description, purpose,
  runner, language, script_hash, is_global, is_active, requires_env, owner_only,
  safe_to_run, approval_required, risk_level, notes, created_at_epoch, updated_at_epoch
) VALUES
(
  'script_wf_r2_verify_bindings',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'wf_r2_verify_bindings',
  'Workflow: verify Cloudflare bindings',
  'scripts/verify-cloudflare-cli.sh',
  '',
  'Non-secret Worker binding audit for hyperdrive repair workflow.',
  'audit',
  'bash',
  'bash',
  '',
  1,
  1,
  1,
  1,
  1,
  0,
  'low',
  'migration 385 — replaces script.audit_hyperdrive_bindings inline handler',
  strftime('%s','now'),
  strftime('%s','now')
),
(
  'script_wf_cms_live_editor_r2',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'wf_cms_live_editor_r2',
  'Workflow: CMS live editor R2 sync',
  'scripts/cms/theme-r2-upload.sh',
  '',
  'Upload CMS live editor dev artifacts to R2 (path from registry).',
  'deploy',
  'bash',
  'bash',
  '',
  1,
  1,
  1,
  1,
  1,
  0,
  'medium',
  'migration 385 — script_write_cms_live_editor_dev_artifacts',
  strftime('%s','now'),
  strftime('%s','now')
);

-- ── Rebuild handlers table CHECK to add catalog_tool (if 384 omitted it) ───────

PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS agentsam_workflow_handlers_v385 (
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

INSERT OR IGNORE INTO agentsam_workflow_handlers_v385
SELECT * FROM agentsam_workflow_handlers;

DROP TABLE IF EXISTS agentsam_workflow_handlers;
ALTER TABLE agentsam_workflow_handlers_v385 RENAME TO agentsam_workflow_handlers;

CREATE INDEX IF NOT EXISTS idx_awh_node_type     ON agentsam_workflow_handlers(node_type);
CREATE INDEX IF NOT EXISTS idx_awh_executor_kind ON agentsam_workflow_handlers(executor_kind);
CREATE INDEX IF NOT EXISTS idx_awh_active        ON agentsam_workflow_handlers(is_active);
CREATE INDEX IF NOT EXISTS idx_awh_tenant        ON agentsam_workflow_handlers(tenant_id);

PRAGMA foreign_keys = ON;

-- ── script executor_kind → script_slug in handler_config_json ─────────────────

UPDATE agentsam_workflow_handlers
SET
  handler_config_json = json_object('script_slug', 'wf_r2_verify_bindings'),
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE handler_key = 'script.audit_hyperdrive_bindings'
  AND executor_kind = 'script';

UPDATE agentsam_workflow_handlers
SET
  executor_kind = 'catalog_tool',
  handler_config_json = json_object('tool_key', 'r2_write'),
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE handler_key = 'script.r2_put_artifact';

UPDATE agentsam_workflow_handlers
SET
  handler_config_json = json_object('script_slug', 'wf_cms_live_editor_r2'),
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE handler_key = 'script_write_cms_live_editor_dev_artifacts'
  AND executor_kind = 'script';

-- Legacy handler_key-only script rows (pre-384 backfill)
UPDATE agentsam_workflow_handlers
SET
  handler_config_json = json_object('script_slug', handler_key),
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE executor_kind = 'script'
  AND (
    json_extract(handler_config_json, '$.script_slug') IS NULL
    AND json_extract(handler_config_json, '$.handler_key') IS NOT NULL
  );

UPDATE agentsam_workflow_handlers
SET
  handler_config_json = json_replace(
    handler_config_json,
    '$.script_slug',
    json_extract(handler_config_json, '$.handler_key')
  ),
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE executor_kind = 'script'
  AND json_extract(handler_config_json, '$.script_slug') IS NULL
  AND json_extract(handler_config_json, '$.handler_key') IS NOT NULL;
