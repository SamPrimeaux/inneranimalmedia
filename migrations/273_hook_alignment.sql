PRAGMA foreign_keys = OFF;

-- ─── agentsam_hook ────────────────────────────────────────────────────────────
CREATE TABLE agentsam_hook_new (
  id            TEXT    PRIMARY KEY,
  tenant_id     TEXT,
  workspace_id  TEXT,
  user_id       TEXT    NOT NULL,
  provider      TEXT    NOT NULL DEFAULT 'system',
  external_id   TEXT,
  trigger       TEXT    NOT NULL
                        CHECK(trigger IN ('start','stop','pre_deploy','post_deploy',
                                          'pre_commit','error','imessage_reply','email_reply')),
  command       TEXT    NOT NULL DEFAULT '',
  target_id     TEXT    NOT NULL DEFAULT '',
  metadata      TEXT    DEFAULT '{}',
  is_active     INTEGER NOT NULL DEFAULT 1,
  run_count     INTEGER DEFAULT 0,
  last_run_at   TEXT,
  workflow_id   TEXT    REFERENCES agentsam_mcp_workflows(id) ON DELETE SET NULL,
  subagent_slug TEXT,
  person_uuid   TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO agentsam_hook_new SELECT
  id,
  NULL,
  -- normalize: '' → NULL, 'inneranimalmedia' → 'ws_inneranimalmedia'
  CASE
    WHEN workspace_id = '' OR workspace_id IS NULL THEN NULL
    WHEN workspace_id = 'inneranimalmedia' THEN 'ws_inneranimalmedia'
    ELSE workspace_id
  END,
  user_id, provider,
  NULLIF(TRIM(external_id), ''),
  trigger, command, target_id, metadata, is_active,
  run_count, last_run_at, workflow_id, subagent_slug,
  person_uuid, created_at
FROM agentsam_hook;

DROP TABLE agentsam_hook;
ALTER TABLE agentsam_hook_new RENAME TO agentsam_hook;

CREATE INDEX idx_hook_user_ws   ON agentsam_hook(user_id, workspace_id);
CREATE INDEX idx_hook_provider  ON agentsam_hook(provider);
CREATE INDEX idx_hook_trigger   ON agentsam_hook(trigger, is_active);
CREATE INDEX idx_hook_tenant    ON agentsam_hook(tenant_id);
CREATE INDEX idx_hook_external  ON agentsam_hook(external_id, provider);

-- ─── agentsam_hook_execution ─────────────────────────────────────────────────
CREATE TABLE agentsam_hook_execution_new (
  id             TEXT    PRIMARY KEY DEFAULT ('hexec_' || lower(hex(randomblob(6)))),
  tenant_id      TEXT,
  workspace_id   TEXT,
  hook_id        TEXT    NOT NULL REFERENCES agentsam_hook(id) ON DELETE CASCADE,
  user_id        TEXT    NOT NULL,
  agent_id       TEXT,
  session_id     TEXT,
  plan_id        TEXT    REFERENCES agentsam_plans(id)       ON DELETE SET NULL,
  todo_id        TEXT    REFERENCES agentsam_todo(id)         ON DELETE SET NULL,
  command_run_id TEXT    REFERENCES agentsam_command_run(id) ON DELETE SET NULL,
  source         TEXT,
  event_type     TEXT,
  action         TEXT,
  actor          TEXT,
  target_type    TEXT,
  target_id      TEXT,
  payload_json   TEXT    DEFAULT '{}',
  metadata_json  TEXT    DEFAULT '{}',
  status         TEXT    NOT NULL CHECK(status IN ('success','fail','timeout')),
  duration_ms    INTEGER,
  output         TEXT,
  error          TEXT,
  person_uuid    TEXT,
  ran_at         TEXT    NOT NULL DEFAULT (datetime('now')),
  created_at     INTEGER DEFAULT (unixepoch())
);

INSERT INTO agentsam_hook_execution_new SELECT
  id, tenant_id, workspace_id, hook_id, user_id,
  agent_id, session_id,
  NULL, NULL, NULL,
  source, event_type, action, actor, target_type, target_id,
  payload_json, metadata_json,
  status, duration_ms, output, error, person_uuid,
  ran_at, created_at
FROM agentsam_hook_execution;

DROP TABLE agentsam_hook_execution;
ALTER TABLE agentsam_hook_execution_new RENAME TO agentsam_hook_execution;

CREATE INDEX idx_hexec_hook_ran    ON agentsam_hook_execution(hook_id, ran_at);
CREATE INDEX idx_hexec_tenant      ON agentsam_hook_execution(tenant_id);
CREATE INDEX idx_hexec_workspace   ON agentsam_hook_execution(workspace_id);
CREATE INDEX idx_hexec_status      ON agentsam_hook_execution(status);
CREATE INDEX idx_hexec_todo        ON agentsam_hook_execution(todo_id);
CREATE INDEX idx_hexec_command_run ON agentsam_hook_execution(command_run_id);
CREATE INDEX idx_hexec_plan        ON agentsam_hook_execution(plan_id);
CREATE INDEX idx_hexec_event_type  ON agentsam_hook_execution(event_type);

PRAGMA foreign_keys = ON;
