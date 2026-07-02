-- 765: project_execution_audit still referenced dropped agent_configs / agent_command_executions (417).
-- Apply: D1_APPLY_PENDING=apply npm run deploy:full  OR  wrangler d1 execute --remote --file=...

PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS project_execution_audit_v765 (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  goal_id TEXT,
  execution_id TEXT,
  agent_config_id TEXT,
  action_type TEXT NOT NULL,
  action_description TEXT,
  action_parameters_json TEXT DEFAULT '{}',
  result_json TEXT,
  success INTEGER,
  error_message TEXT,
  tokens_used INTEGER DEFAULT 0,
  cost_cents REAL DEFAULT 0,
  ai_confidence_score REAL,
  human_feedback INTEGER,
  human_feedback_reason TEXT,
  learning_applied INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (goal_id) REFERENCES project_goals(id) ON DELETE SET NULL
);

INSERT OR IGNORE INTO project_execution_audit_v765 (
  id, project_id, tenant_id, goal_id, execution_id, agent_config_id,
  action_type, action_description, action_parameters_json, result_json,
  success, error_message, tokens_used, cost_cents, ai_confidence_score,
  human_feedback, human_feedback_reason, learning_applied, created_at
)
SELECT
  id, project_id, tenant_id, goal_id, execution_id, agent_config_id,
  action_type, action_description, action_parameters_json, result_json,
  success, error_message, tokens_used, cost_cents, ai_confidence_score,
  human_feedback, human_feedback_reason, learning_applied, created_at
FROM project_execution_audit;

DROP TABLE IF EXISTS project_execution_audit;

ALTER TABLE project_execution_audit_v765 RENAME TO project_execution_audit;

PRAGMA foreign_keys = ON;
