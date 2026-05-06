PRAGMA foreign_keys = OFF;

CREATE TABLE agentsam_escalation_new (
  id             TEXT    PRIMARY KEY DEFAULT ('esc_' || lower(hex(randomblob(8)))),
  tenant_id      TEXT    NOT NULL,
  workspace_id   TEXT    NOT NULL,
  plan_id        TEXT    REFERENCES agentsam_plans(id)        ON DELETE SET NULL,
  todo_id        TEXT    REFERENCES agentsam_todo(id)          ON DELETE SET NULL,
  command_run_id TEXT    NOT NULL REFERENCES agentsam_command_run(id) ON DELETE CASCADE,
  from_tier      INTEGER NOT NULL,
  from_model     TEXT,
  to_tier        INTEGER NOT NULL,
  to_model       TEXT    NOT NULL,
  reason         TEXT    NOT NULL CHECK(reason IN ('low_confidence','execution_failure','timeout','complexity','user_requested','recovery')),
  context_tokens INTEGER DEFAULT 0,
  success        INTEGER,
  agent_id       TEXT,
  created_at     INTEGER NOT NULL DEFAULT (unixepoch())
);
INSERT INTO agentsam_escalation_new SELECT
  id, 'unknown', workspace_id, NULL, NULL,
  command_run_id, from_tier, from_model,
  to_tier, to_model, reason, context_tokens,
  success, agent_id, created_at
FROM agentsam_escalation;
DROP TABLE agentsam_escalation;
ALTER TABLE agentsam_escalation_new RENAME TO agentsam_escalation;
CREATE INDEX idx_esc_command_run ON agentsam_escalation(command_run_id);
CREATE INDEX idx_esc_workspace   ON agentsam_escalation(workspace_id);
CREATE INDEX idx_esc_tenant      ON agentsam_escalation(tenant_id);
CREATE INDEX idx_esc_todo        ON agentsam_escalation(todo_id);
CREATE INDEX idx_esc_plan        ON agentsam_escalation(plan_id);

CREATE TABLE agentsam_execution_context_new (
  id             TEXT    PRIMARY KEY DEFAULT ('ctx_' || lower(hex(randomblob(8)))),
  tenant_id      TEXT,
  workspace_id   TEXT,
  command_run_id TEXT    NOT NULL REFERENCES agentsam_command_run(id) ON DELETE CASCADE,
  todo_id        TEXT    REFERENCES agentsam_todo(id) ON DELETE SET NULL,
  cwd            TEXT,
  files_json     TEXT    DEFAULT '[]',
  recent_error   TEXT,
  goal           TEXT,
  extra_json     TEXT    DEFAULT '{}',
  context_tokens INTEGER DEFAULT 0,
  created_at     INTEGER NOT NULL DEFAULT (unixepoch())
);
INSERT INTO agentsam_execution_context_new SELECT
  id, NULL, NULL, command_run_id, NULL,
  cwd, files_json, recent_error, goal,
  extra_json, context_tokens, created_at
FROM agentsam_execution_context;
DROP TABLE agentsam_execution_context;
ALTER TABLE agentsam_execution_context_new RENAME TO agentsam_execution_context;
CREATE INDEX idx_ctx_command_run ON agentsam_execution_context(command_run_id);
CREATE INDEX idx_ctx_tenant      ON agentsam_execution_context(tenant_id);
CREATE INDEX idx_ctx_todo        ON agentsam_execution_context(todo_id);

CREATE TABLE agentsam_executions_new (
  id              TEXT    PRIMARY KEY,
  tenant_id       TEXT,
  workspace_id    TEXT    REFERENCES agentsam_workspace(id)   ON DELETE SET NULL,
  user_id         TEXT,
  plan_id         TEXT    REFERENCES agentsam_plans(id)       ON DELETE SET NULL,
  todo_id         TEXT    REFERENCES agentsam_todo(id)         ON DELETE SET NULL,
  command_run_id  TEXT    REFERENCES agentsam_command_run(id) ON DELETE SET NULL,
  task_id         TEXT    NOT NULL,
  subagent_id     TEXT,
  agent_id        TEXT,
  work_session_id TEXT,
  execution_type  TEXT    NOT NULL,
  command         TEXT,
  file_path       TEXT,
  output          TEXT,
  error           TEXT,
  duration_ms     INTEGER,
  timed_out       INTEGER DEFAULT 0,
  sla_breach      INTEGER DEFAULT 0,
  timeout_ms      INTEGER DEFAULT 120000,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch())
);
INSERT INTO agentsam_executions_new SELECT
  id, tenant_id, workspace_id, user_id,
  NULL, NULL, NULL,
  task_id, subagent_id, agent_id, work_session_id,
  execution_type, command, file_path, output, error,
  duration_ms, timed_out, sla_breach, timeout_ms, created_at
FROM agentsam_executions;
DROP TABLE agentsam_executions;
ALTER TABLE agentsam_executions_new RENAME TO agentsam_executions;
CREATE INDEX idx_exe_task        ON agentsam_executions(task_id);
CREATE INDEX idx_exe_tenant      ON agentsam_executions(tenant_id);
CREATE INDEX idx_exe_workspace   ON agentsam_executions(workspace_id);
CREATE INDEX idx_exe_todo        ON agentsam_executions(todo_id);
CREATE INDEX idx_exe_command_run ON agentsam_executions(command_run_id);
CREATE INDEX idx_exe_plan        ON agentsam_executions(plan_id);
CREATE INDEX idx_exe_timed_out   ON agentsam_executions(timed_out);

PRAGMA foreign_keys = ON;
