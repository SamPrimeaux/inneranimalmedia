PRAGMA foreign_keys = OFF;

CREATE TABLE agentsam_mcp_workflows_new (
  id                      TEXT    PRIMARY KEY,
  workflow_key            TEXT    NOT NULL UNIQUE,
  display_name            TEXT    NOT NULL,
  description             TEXT,
  status                  TEXT    NOT NULL DEFAULT 'ready',
  priority                TEXT    NOT NULL DEFAULT 'medium',
  steps_json              TEXT    NOT NULL DEFAULT '[]',
  tools_json              TEXT    NOT NULL DEFAULT '[]',
  acceptance_criteria_json TEXT   NOT NULL DEFAULT '[]',
  notes                   TEXT,
  created_at              TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT    NOT NULL DEFAULT (datetime('now')),
  tenant_id               TEXT    NOT NULL,
  workspace_id            TEXT,
  trigger_type            TEXT    DEFAULT 'manual',
  trigger_config_json     TEXT    DEFAULT '{}',
  input_schema_json       TEXT    DEFAULT '{}',
  output_schema_json      TEXT    DEFAULT '{}',
  requires_approval       INTEGER DEFAULT 0,
  risk_level              TEXT    DEFAULT 'low',
  run_count               INTEGER DEFAULT 0,
  success_count           INTEGER DEFAULT 0,
  last_run_at             TEXT,
  last_run_status         TEXT,
  avg_duration_ms         REAL    DEFAULT 0,
  total_cost_usd          REAL    DEFAULT 0,
  version                 INTEGER DEFAULT 1,
  is_active               INTEGER DEFAULT 1,
  subagent_slug           TEXT,
  model_id                TEXT,
  timeout_seconds         INTEGER DEFAULT 300,
  category                TEXT    DEFAULT 'general',
  parent_workflow_id      TEXT    DEFAULT NULL,
  tags_json               TEXT    DEFAULT '[]',
  retry_policy_json       TEXT    DEFAULT '{"max_retries":2,"backoff":"exponential","delay_ms":2000,"retry_on":["timeout","network_error"]}',
  on_failure_json         TEXT    DEFAULT '{"action":"notify","notify_channel":"resend"}',
  max_concurrent_runs     INTEGER DEFAULT 1,
  environment             TEXT    DEFAULT 'production',
  visibility              TEXT    DEFAULT 'workspace',
  input_defaults_json     TEXT    DEFAULT '{}',
  last_error              TEXT    DEFAULT NULL,
  task_type               TEXT    DEFAULT 'agent_workflow'
);

INSERT INTO agentsam_mcp_workflows_new SELECT
  id, workflow_key, display_name, description, status, priority,
  steps_json, tools_json, acceptance_criteria_json, notes,
  created_at, updated_at, tenant_id, workspace_id,
  trigger_type, trigger_config_json, input_schema_json, output_schema_json,
  requires_approval, risk_level, run_count, success_count,
  last_run_at, last_run_status, avg_duration_ms, total_cost_usd,
  version, is_active, subagent_slug, model_id, timeout_seconds,
  category, parent_workflow_id, tags_json, retry_policy_json,
  on_failure_json, max_concurrent_runs, environment, visibility,
  input_defaults_json, last_error, task_type
FROM agentsam_mcp_workflows;

DROP TABLE agentsam_mcp_workflows;
ALTER TABLE agentsam_mcp_workflows_new RENAME TO agentsam_mcp_workflows;

CREATE INDEX idx_agentsam_mcp_workflows_tenant_workspace_status
  ON agentsam_mcp_workflows(tenant_id, workspace_id, status);
CREATE INDEX idx_agentsam_mcp_workflows_active_category
  ON agentsam_mcp_workflows(is_active, category);
CREATE INDEX idx_agentsam_mcp_workflows_trigger
  ON agentsam_mcp_workflows(trigger_type);
CREATE INDEX idx_agentsam_mcp_workflows_subagent
  ON agentsam_mcp_workflows(subagent_slug);
CREATE INDEX idx_agentsam_mcp_workflows_updated
  ON agentsam_mcp_workflows(updated_at);
CREATE INDEX idx_agentsam_mcp_workflows_parent
  ON agentsam_mcp_workflows(parent_workflow_id);
CREATE INDEX idx_agentsam_mcp_workflows_task_type
  ON agentsam_mcp_workflows(task_type);

PRAGMA foreign_keys = ON;
