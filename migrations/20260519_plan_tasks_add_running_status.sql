-- Migration: add 'running' to agentsam_plan_tasks.status CHECK constraint
-- Apply: wrangler d1 migrations apply inneranimalmedia-business --remote
-- Date: 2026-05-19

PRAGMA foreign_keys = OFF;

CREATE TABLE agentsam_plan_tasks_new (
  id                TEXT    PRIMARY KEY DEFAULT ('task_' || lower(hex(randomblob(8)))),
  tenant_id         TEXT,
  workspace_id      TEXT,
  plan_id           TEXT    NOT NULL REFERENCES agentsam_plans(id) ON DELETE CASCADE,
  todo_id           TEXT    REFERENCES agentsam_todo(id) ON DELETE SET NULL,
  command_run_id    TEXT    REFERENCES agentsam_command_run(id) ON DELETE SET NULL,
  agent_id          TEXT,
  assigned_model    TEXT,
  order_index       INTEGER NOT NULL,
  title             TEXT    NOT NULL,
  description       TEXT,
  priority          TEXT    NOT NULL DEFAULT 'P1'
                            CHECK(priority IN ('P0','P1','P2','P3')),
  category          TEXT    DEFAULT 'backend'
                            CHECK(category IN ('frontend','backend','db','infra','ux','research','other')),
  status            TEXT    NOT NULL DEFAULT 'todo'
                            CHECK(status IN ('todo','running','in_progress','done','blocked','skipped','carried')),
  files_involved    TEXT    DEFAULT '[]',
  tables_involved   TEXT    DEFAULT '[]',
  routes_involved   TEXT    DEFAULT '[]',
  depends_on        TEXT    DEFAULT '[]',
  estimated_minutes INTEGER,
  actual_minutes    INTEGER,
  blocked_reason    TEXT,
  notes             TEXT,
  output_summary    TEXT,
  error_trace       TEXT,
  tokens_used       INTEGER DEFAULT 0,
  cost_usd          REAL    DEFAULT 0,
  started_at        INTEGER,
  completed_at      INTEGER,
  created_at        INTEGER DEFAULT (unixepoch()),
  node_key          TEXT    DEFAULT NULL,
  execution_step_id TEXT    REFERENCES agentsam_execution_steps(id) ON DELETE SET NULL,
  workflow_run_id   TEXT    REFERENCES agentsam_workflow_runs(id) ON DELETE SET NULL,
  handler_key       TEXT    DEFAULT NULL,
  handler_type      TEXT    DEFAULT NULL
                            CHECK(handler_type IS NULL OR handler_type IN (
                              'agent','db_query','terminal','mcp_tool','script',
                              'eval','branch','webhook','approval_gate','retry','parallel','join'
                            )),
  risk_level        TEXT    DEFAULT 'low'
                            CHECK(risk_level IN ('low','medium','high','critical')),
  requires_approval INTEGER DEFAULT 0,
  quality_gate_json TEXT    DEFAULT '{}',
  edge_taken        TEXT    DEFAULT NULL
);

INSERT INTO agentsam_plan_tasks_new SELECT * FROM agentsam_plan_tasks;

DROP TABLE agentsam_plan_tasks;

ALTER TABLE agentsam_plan_tasks_new RENAME TO agentsam_plan_tasks;

PRAGMA foreign_keys = ON;
