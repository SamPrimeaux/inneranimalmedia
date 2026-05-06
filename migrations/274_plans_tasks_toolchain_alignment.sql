PRAGMA foreign_keys = OFF;

-- Drop view that depends on agentsam_tool_chain
DROP VIEW IF EXISTS v_mcp_tool_execution;

-- ─── agentsam_plans ───────────────────────────────────────────────────────────
CREATE TABLE agentsam_plans_new (
  id                   TEXT    PRIMARY KEY,
  tenant_id            TEXT    NOT NULL,
  workspace_id         TEXT,
  session_id           TEXT,
  agent_id             TEXT,
  client_id            TEXT,
  client_name          TEXT,
  plan_date            TEXT    NOT NULL,
  plan_type            TEXT    DEFAULT 'daily'
                               CHECK(plan_type IN ('daily','sprint','incident','feature','refactor')),
  title                TEXT    NOT NULL,
  status               TEXT    NOT NULL DEFAULT 'active'
                               CHECK(status IN ('draft','active','complete','abandoned')),
  morning_brief        TEXT,
  session_notes        TEXT,
  eod_summary          TEXT,
  available_providers  TEXT    DEFAULT '["anthropic","openai","google","workers_ai"]',
  blocked_providers    TEXT    DEFAULT '[]',
  budget_snapshot      TEXT    DEFAULT '{}',
  default_model        TEXT,
  token_budget         INTEGER DEFAULT NULL,
  tokens_used          INTEGER NOT NULL DEFAULT 0,
  cost_usd             REAL    NOT NULL DEFAULT 0,
  carry_over_from      TEXT,
  carry_over_count     INTEGER DEFAULT 0,
  tasks_total          INTEGER DEFAULT 0,
  tasks_done           INTEGER DEFAULT 0,
  tasks_blocked        INTEGER DEFAULT 0,
  linked_project_keys  TEXT    DEFAULT '[]',
  linked_todo_ids      TEXT    DEFAULT '[]',
  linked_context_ids   TEXT    DEFAULT '[]',
  created_at           INTEGER DEFAULT (unixepoch()),
  updated_at           INTEGER DEFAULT (unixepoch())
);

INSERT INTO agentsam_plans_new SELECT
  id, tenant_id, workspace_id, session_id, agent_id,
  client_id, client_name, plan_date, plan_type, title, status,
  morning_brief, session_notes, eod_summary,
  available_providers, blocked_providers, budget_snapshot,
  NULLIF(default_model, 'gpt-5.4'),
  token_budget, tokens_used, cost_usd,
  carry_over_from, carry_over_count,
  tasks_total, tasks_done, tasks_blocked,
  linked_project_keys, linked_todo_ids, linked_context_ids,
  created_at, updated_at
FROM agentsam_plans;

DROP TABLE agentsam_plans;
ALTER TABLE agentsam_plans_new RENAME TO agentsam_plans;

CREATE INDEX idx_aplans_tenant_status ON agentsam_plans(tenant_id, status);
CREATE INDEX idx_aplans_tenant_date   ON agentsam_plans(tenant_id, plan_date);
CREATE INDEX idx_aplans_date          ON agentsam_plans(plan_date);
CREATE INDEX idx_aplans_agent         ON agentsam_plans(agent_id);
CREATE INDEX idx_aplans_workspace     ON agentsam_plans(workspace_id);
CREATE INDEX idx_aplans_type_status   ON agentsam_plans(plan_type, status);

-- ─── agentsam_plan_tasks ─────────────────────────────────────────────────────
CREATE TABLE agentsam_plan_tasks_new (
  id                TEXT    PRIMARY KEY DEFAULT ('task_' || lower(hex(randomblob(8)))),
  tenant_id         TEXT,
  workspace_id      TEXT,
  plan_id           TEXT    NOT NULL REFERENCES agentsam_plans(id)       ON DELETE CASCADE,
  todo_id           TEXT    REFERENCES agentsam_todo(id)                  ON DELETE SET NULL,
  command_run_id    TEXT    REFERENCES agentsam_command_run(id)           ON DELETE SET NULL,
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
                            CHECK(status IN ('todo','in_progress','done','blocked','skipped','carried')),
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
  created_at        INTEGER DEFAULT (unixepoch())
);

INSERT INTO agentsam_plan_tasks_new SELECT
  id, tenant_id, workspace_id, plan_id, NULL, NULL,
  agent_id, assigned_model, order_index, title, description,
  priority, category, status,
  files_involved, tables_involved, routes_involved, depends_on,
  estimated_minutes, actual_minutes, blocked_reason, notes,
  output_summary, error_trace, tokens_used, cost_usd,
  started_at, completed_at, created_at
FROM agentsam_plan_tasks;

DROP TABLE agentsam_plan_tasks;
ALTER TABLE agentsam_plan_tasks_new RENAME TO agentsam_plan_tasks;

CREATE INDEX idx_aptasks_plan        ON agentsam_plan_tasks(plan_id);
CREATE INDEX idx_aptasks_tenant      ON agentsam_plan_tasks(tenant_id);
CREATE INDEX idx_aptasks_workspace   ON agentsam_plan_tasks(workspace_id);
CREATE INDEX idx_aptasks_status      ON agentsam_plan_tasks(status);
CREATE INDEX idx_aptasks_todo        ON agentsam_plan_tasks(todo_id);
CREATE INDEX idx_aptasks_command_run ON agentsam_plan_tasks(command_run_id);
CREATE INDEX idx_aptasks_priority    ON agentsam_plan_tasks(priority, status);

-- ─── agentsam_tool_chain ─────────────────────────────────────────────────────
CREATE TABLE agentsam_tool_chain_new (
  id                   TEXT    PRIMARY KEY DEFAULT ('atc_' || lower(hex(randomblob(8)))),
  tenant_id            TEXT,
  workspace_id         TEXT,
  user_id              TEXT,
  agent_id             TEXT,
  work_session_id      TEXT,
  plan_id              TEXT    REFERENCES agentsam_plans(id)        ON DELETE SET NULL,
  todo_id              TEXT    REFERENCES agentsam_todo(id)          ON DELETE SET NULL,
  command_run_id       TEXT    REFERENCES agentsam_command_run(id)  ON DELETE SET NULL,
  subagent_profile_id  TEXT,
  agent_session_id     TEXT,
  agent_message_id     TEXT,
  parent_chain_id      TEXT    REFERENCES agentsam_tool_chain(id),
  depth                INTEGER NOT NULL DEFAULT 0,
  tool_name            TEXT    NOT NULL,
  tool_id              TEXT    REFERENCES agentsam_tools(id),
  mcp_tool_ref         TEXT,
  mcp_tool_call_id     TEXT,
  terminal_session_id  TEXT,
  command_execution_id TEXT,
  tool_status          TEXT    NOT NULL DEFAULT 'pending'
                               CHECK(tool_status IN ('pending','running','completed',
                                                      'failed','skipped','cancelled','timeout')),
  input_json           TEXT    DEFAULT '{}',
  output_summary       TEXT,
  result_json          TEXT,
  error_message        TEXT,
  error_type           TEXT,
  retry_count          INTEGER NOT NULL DEFAULT 0,
  max_retries          INTEGER NOT NULL DEFAULT 2,
  duration_ms          INTEGER,
  input_tokens         INTEGER NOT NULL DEFAULT 0,
  output_tokens        INTEGER NOT NULL DEFAULT 0,
  cost_usd             REAL    NOT NULL DEFAULT 0,
  timed_out            INTEGER DEFAULT 0,
  sla_breach           INTEGER DEFAULT 0,
  timeout_ms           INTEGER DEFAULT 30000,
  requires_approval    INTEGER NOT NULL DEFAULT 0,
  approved_by          TEXT,
  approved_at          INTEGER,
  started_at           INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at         INTEGER
);

INSERT INTO agentsam_tool_chain_new SELECT
  id, tenant_id, workspace_id, user_id, agent_id, work_session_id,
  plan_id, todo_id, NULL,
  subagent_profile_id, agent_session_id, agent_message_id,
  parent_chain_id, depth, tool_name, tool_id,
  mcp_tool_ref, mcp_tool_call_id, terminal_session_id, command_execution_id,
  tool_status, input_json, output_summary, result_json,
  error_message, error_type, retry_count, max_retries,
  duration_ms, input_tokens, output_tokens, cost_usd,
  timed_out, sla_breach, timeout_ms,
  requires_approval, approved_by, approved_at,
  started_at, completed_at
FROM agentsam_tool_chain;

DROP TABLE agentsam_tool_chain;
ALTER TABLE agentsam_tool_chain_new RENAME TO agentsam_tool_chain;

CREATE INDEX idx_atc_plan_id       ON agentsam_tool_chain(plan_id);
CREATE INDEX idx_atc_todo          ON agentsam_tool_chain(todo_id);
CREATE INDEX idx_atc_command_run   ON agentsam_tool_chain(command_run_id);
CREATE INDEX idx_atc_tool_status   ON agentsam_tool_chain(tool_status);
CREATE INDEX idx_atc_agent_session ON agentsam_tool_chain(agent_session_id);
CREATE INDEX idx_atc_tenant        ON agentsam_tool_chain(tenant_id);
CREATE INDEX idx_atc_workspace     ON agentsam_tool_chain(workspace_id);
CREATE INDEX idx_atc_parent        ON agentsam_tool_chain(parent_chain_id);

-- Recreate view on clean table
CREATE VIEW v_mcp_tool_execution AS
SELECT
  tc.id,
  tc.tool_id              AS tool_id,
  tc.tool_name,
  tc.input_tokens,
  tc.output_tokens,
  tc.duration_ms,
  tc.cost_usd,
  CASE WHEN tc.tool_status = 'completed' THEN 1 ELSE 0 END AS success,
  tc.error_message,
  datetime(tc.started_at, 'unixepoch') AS created_at,
  tc.agent_session_id     AS session_id,
  NULL                    AS workflow_id,
  tc.input_json,
  tc.requires_approval,
  tc.retry_count,
  tc.result_json          AS output_json
FROM agentsam_tool_chain tc
WHERE tc.tool_id IN (SELECT id FROM agentsam_tools WHERE handler_type = 'mcp');

PRAGMA foreign_keys = ON;
