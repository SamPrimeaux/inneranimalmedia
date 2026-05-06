PRAGMA foreign_keys = OFF;

CREATE TABLE agentsam_todo_new (
  id                TEXT    PRIMARY KEY,
  tenant_id         TEXT    NOT NULL,
  workspace_id      TEXT,
  title             TEXT    NOT NULL,
  description       TEXT,
  status            TEXT    NOT NULL DEFAULT 'open',
  priority          TEXT    NOT NULL DEFAULT 'medium',
  category          TEXT,
  tags              TEXT    DEFAULT '[]',
  due_date          TEXT,
  completed_at      TEXT,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  created_by        TEXT    NOT NULL DEFAULT 'agentsam',
  notes             TEXT,
  linked_commit     TEXT,
  linked_route      TEXT,
  linked_table      TEXT,
  sort_order        INTEGER DEFAULT 50,
  plan_id           TEXT,
  project_key       TEXT,
  task_type         TEXT    NOT NULL DEFAULT 'execute',
  execution_status  TEXT    NOT NULL DEFAULT 'queued',
  assigned_to       TEXT    DEFAULT 'agentsam',
  depends_on        TEXT    DEFAULT '[]',
  retry_count       INTEGER NOT NULL DEFAULT 0,
  max_retries       INTEGER NOT NULL DEFAULT 2,
  timeout_seconds   INTEGER DEFAULT 300,
  context_snapshot  TEXT    DEFAULT '{}',
  output_summary    TEXT,
  error_trace       TEXT,
  token_budget      INTEGER DEFAULT NULL,
  tokens_used       INTEGER NOT NULL DEFAULT 0,
  cost_usd          REAL    NOT NULL DEFAULT 0,
  requires_approval INTEGER NOT NULL DEFAULT 0,
  approved_by       TEXT,
  approved_at       TEXT,
  started_at        TEXT
);

INSERT INTO agentsam_todo_new SELECT
  id, tenant_id, workspace_id, title, description,
  status, priority, category, tags, due_date, completed_at,
  created_at, updated_at, created_by, notes,
  linked_commit, linked_route, linked_table, sort_order,
  plan_id, project_key, task_type, execution_status,
  assigned_to, depends_on, retry_count, max_retries,
  timeout_seconds, context_snapshot, output_summary, error_trace,
  token_budget, tokens_used, cost_usd, requires_approval,
  approved_by, approved_at, started_at
FROM agentsam_todo;

DROP TABLE agentsam_todo;
ALTER TABLE agentsam_todo_new RENAME TO agentsam_todo;

CREATE INDEX idx_todo_tenant_status    ON agentsam_todo(tenant_id, status);
CREATE INDEX idx_todo_workspace_status ON agentsam_todo(workspace_id, status);
CREATE INDEX idx_todo_plan             ON agentsam_todo(plan_id);
CREATE INDEX idx_todo_execution_status ON agentsam_todo(execution_status);
CREATE INDEX idx_todo_requires_approval ON agentsam_todo(requires_approval, status);

PRAGMA foreign_keys = ON;
