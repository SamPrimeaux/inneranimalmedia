PRAGMA foreign_keys = OFF;

CREATE TABLE agentsam_project_context_new (
  id                    TEXT    PRIMARY KEY DEFAULT ('ctx_' || lower(hex(randomblob(8)))),
  tenant_id             TEXT    NOT NULL,
  workspace_id          TEXT,
  project_key           TEXT    NOT NULL,
  project_name          TEXT    NOT NULL,
  project_type          TEXT,
  status                TEXT    DEFAULT 'active',
  priority              INTEGER DEFAULT 50,
  description           TEXT    NOT NULL,
  goals                 TEXT,
  constraints           TEXT,
  current_blockers      TEXT,
  primary_tables        TEXT,
  secondary_tables      TEXT,
  workers_involved      TEXT,
  r2_buckets_involved   TEXT,
  domains_involved      TEXT,
  mcp_services_involved TEXT,
  key_files             TEXT,
  related_routes        TEXT,
  cursor_usage_percent  REAL    DEFAULT 0,
  tokens_budgeted       INTEGER,
  tokens_used           INTEGER DEFAULT 0,
  cost_usd              REAL    NOT NULL DEFAULT 0,
  linked_plan_id        TEXT    REFERENCES agentsam_plans(id),
  linked_todo_ids       TEXT    DEFAULT '[]',
  agent_id              TEXT,
  client_id             TEXT,
  session_id            TEXT,
  created_by            TEXT,
  notes                 TEXT,
  last_cursor_session   TEXT,
  started_at            INTEGER,
  target_completion     INTEGER,
  completed_at          INTEGER,
  created_at            INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at            INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT INTO agentsam_project_context_new SELECT
  id, tenant_id, workspace_id, project_key, project_name,
  project_type, status, priority, description, goals,
  constraints, current_blockers, primary_tables, secondary_tables,
  workers_involved, r2_buckets_involved, domains_involved,
  mcp_services_involved, key_files, related_routes,
  cursor_usage_percent, tokens_budgeted, tokens_used, cost_usd,
  linked_plan_id, linked_todo_ids, agent_id, client_id, session_id,
  -- strip 'sam_primeaux' literal — store NULL, resolve from auth at write time
  NULLIF(created_by, 'sam_primeaux'),
  notes, last_cursor_session, started_at, target_completion,
  completed_at, created_at, updated_at
FROM agentsam_project_context;

DROP TABLE agentsam_project_context;
ALTER TABLE agentsam_project_context_new RENAME TO agentsam_project_context;

CREATE INDEX idx_pctx_tenant_status ON agentsam_project_context(tenant_id, status);
CREATE INDEX idx_pctx_project_key   ON agentsam_project_context(project_key);
CREATE INDEX idx_pctx_workspace     ON agentsam_project_context(workspace_id);
CREATE INDEX idx_pctx_agent         ON agentsam_project_context(agent_id);
CREATE INDEX idx_pctx_client        ON agentsam_project_context(client_id);
CREATE INDEX idx_pctx_plan          ON agentsam_project_context(linked_plan_id);

PRAGMA foreign_keys = ON;
