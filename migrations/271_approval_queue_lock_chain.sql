PRAGMA foreign_keys = OFF;

CREATE TABLE agentsam_approval_queue_new (
  id              TEXT    PRIMARY KEY DEFAULT ('appr_' || lower(hex(randomblob(8)))),
  tenant_id       TEXT    NOT NULL,
  workspace_id    TEXT,
  user_id         TEXT    NOT NULL,
  session_id      TEXT,

  -- Chain linkage — all three locked with FKs
  plan_id         TEXT    REFERENCES agentsam_plans(id)          ON DELETE SET NULL,
  todo_id         TEXT    REFERENCES agentsam_todo(id)            ON DELETE CASCADE,
  workflow_run_id TEXT    REFERENCES agentsam_workflow_runs(id)   ON DELETE SET NULL,
  command_run_id  TEXT    REFERENCES agentsam_command_run(id)     ON DELETE SET NULL,

  -- What needs approval
  tool_name       TEXT    NOT NULL,
  tool_id         TEXT,
  tool_key        TEXT,
  action_summary  TEXT    NOT NULL,
  input_json      TEXT    DEFAULT '{}',
  risk_level      TEXT    DEFAULT 'medium',
  approval_type   TEXT    DEFAULT 'tool',

  -- Resolution
  status          TEXT    DEFAULT 'pending'
                          CHECK (status IN ('pending','approved','denied','expired')),
  approved_by     TEXT,
  decided_at      INTEGER,
  expires_at      INTEGER DEFAULT (unixepoch() + 300),

  -- Meta
  person_uuid     TEXT,
  created_at      INTEGER DEFAULT (unixepoch())
);

INSERT INTO agentsam_approval_queue_new SELECT
  id, tenant_id, workspace_id, user_id, session_id,
  NULL,           -- plan_id (new column, backfill not possible from existing data)
  todo_id, workflow_run_id, command_run_id,
  tool_name, tool_id, tool_key, action_summary, input_json,
  risk_level, approval_type, status, approved_by, decided_at,
  expires_at, person_uuid, created_at
FROM agentsam_approval_queue;

DROP TABLE agentsam_approval_queue;
ALTER TABLE agentsam_approval_queue_new RENAME TO agentsam_approval_queue;

-- Status sweep (most common query — pending items)
CREATE INDEX idx_appr_status          ON agentsam_approval_queue(status, expires_at);
-- Chain lookups — walk from any node
CREATE INDEX idx_appr_todo            ON agentsam_approval_queue(todo_id);
CREATE INDEX idx_appr_plan            ON agentsam_approval_queue(plan_id);
CREATE INDEX idx_appr_workflow        ON agentsam_approval_queue(workflow_run_id);
CREATE INDEX idx_appr_command_run     ON agentsam_approval_queue(command_run_id);
-- Tenant/workspace scope
CREATE INDEX idx_appr_tenant_status   ON agentsam_approval_queue(tenant_id, status);
CREATE INDEX idx_appr_user_status     ON agentsam_approval_queue(user_id, status);

PRAGMA foreign_keys = ON;
