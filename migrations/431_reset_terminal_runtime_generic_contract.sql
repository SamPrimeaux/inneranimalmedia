-- 431_reset_terminal_runtime_generic_contract.sql
-- DESTRUCTIVE GENERIC TERMINAL RUNTIME RESET
--
-- Purpose:
-- - Archive polluted terminal runtime state.
-- - Drop/rebuild terminal_sessions, terminal_history, pty_health_events.
-- - Rebuild security_findings to remove stale terminal_sessions_v2_old FK.
-- - Do NOT hardcode or seed individual users.
-- - Future user terminal config must be created dynamically by provisioning/runtime code.

PRAGMA foreign_keys = OFF;


----------------------------------------------------------------------
-- 0) Archive current runtime tables before reset.
----------------------------------------------------------------------

DROP TABLE IF EXISTS terminal_sessions_archive_431;
DROP TABLE IF EXISTS terminal_history_archive_431;
DROP TABLE IF EXISTS pty_health_events_archive_431;
DROP TABLE IF EXISTS security_findings_archive_431;

CREATE TABLE terminal_sessions_archive_431 AS SELECT * FROM terminal_sessions;
CREATE TABLE terminal_history_archive_431 AS SELECT * FROM terminal_history;
CREATE TABLE pty_health_events_archive_431 AS SELECT * FROM pty_health_events;
CREATE TABLE security_findings_archive_431 AS SELECT * FROM security_findings;

----------------------------------------------------------------------
-- 1) Drop runtime tables in dependency order.
----------------------------------------------------------------------

DROP TABLE IF EXISTS terminal_history;
DROP TABLE IF EXISTS pty_health_events;
DROP TABLE IF EXISTS terminal_sessions;

----------------------------------------------------------------------
-- 2) Recreate terminal_sessions clean.
----------------------------------------------------------------------

CREATE TABLE terminal_sessions (
  id                TEXT    PRIMARY KEY DEFAULT ('term_' || lower(hex(randomblob(8)))),
  workspace_id      TEXT    NOT NULL,
  tenant_id         TEXT    NOT NULL,
  user_id           TEXT    NOT NULL,
  person_uuid       TEXT,
  agent_session_id  TEXT,
  label             TEXT,
  status            TEXT    NOT NULL DEFAULT 'active'
                            CHECK(status IN ('active','idle','closed','error')),
  shell             TEXT    NOT NULL DEFAULT '/bin/zsh',
  cwd               TEXT    DEFAULT '/',
  tunnel_url        TEXT,
  auth_token_hash   TEXT    NOT NULL,
  cols              INTEGER DEFAULT 220,
  rows              INTEGER DEFAULT 50,
  last_input_at     INTEGER,
  last_output_at    INTEGER,
  last_command      TEXT,
  last_exit_code    INTEGER,
  bytes_sent        INTEGER DEFAULT 0,
  bytes_received    INTEGER DEFAULT 0,
  created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  closed_at         INTEGER,
  connection_id     TEXT REFERENCES terminal_connections(id) ON DELETE SET NULL
);

----------------------------------------------------------------------
-- 3) Recreate terminal_history clean.
----------------------------------------------------------------------

CREATE TABLE terminal_history (
  id TEXT PRIMARY KEY DEFAULT ('th_' || lower(hex(randomblob(8)))),
  terminal_session_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('input','output','system')),
  content TEXT NOT NULL,
  exit_code INTEGER,
  duration_ms INTEGER,
  triggered_by TEXT CHECK(triggered_by IN ('user','agent','system')),
  agent_session_id TEXT,
  command_execution_id TEXT,
  recorded_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (terminal_session_id) REFERENCES terminal_sessions(id) ON DELETE CASCADE
);

----------------------------------------------------------------------
-- 4) Recreate pty_health_events clean with correct FK.
----------------------------------------------------------------------

CREATE TABLE pty_health_events (
  id TEXT PRIMARY KEY DEFAULT ('phe_' || lower(hex(randomblob(8)))),
  workspace_id TEXT NOT NULL,
  terminal_session_id TEXT REFERENCES terminal_sessions(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK(event_type IN (
    'connected','disconnected','reconnected',
    'grace_started','grace_expired','killed',
    'tunnel_up','tunnel_down','tunnel_restart',
    'pm2_start','pm2_crash','health_check'
  )),
  session_pid INTEGER,
  client_count INTEGER DEFAULT 0,
  tunnel_url TEXT,
  tunnel_connections INTEGER,
  error_message TEXT,
  duration_since_connect_ms INTEGER,
  recorded_at INTEGER NOT NULL DEFAULT (unixepoch()),
  created_at INTEGER DEFAULT (unixepoch())
);

----------------------------------------------------------------------
-- 5) Rebuild security_findings with correct FK.
--    Preserve security findings, but detach terminal runtime pointers
--    because terminal runtime has intentionally been reset.
----------------------------------------------------------------------

DROP TABLE IF EXISTS security_findings_new;

CREATE TABLE security_findings_new (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  finding_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  fingerprint TEXT,
  snippet_redacted TEXT,
  rule_id TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','triaged','false_positive','fixed')),
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  metadata_json TEXT DEFAULT '{}',
  user_id TEXT,
  workspace_id TEXT,
  secret_id TEXT REFERENCES env_secrets(id),
  assigned_to TEXT,
  resolved_at INTEGER,
  notification_sent_at INTEGER,
  suppressed_until INTEGER,
  terminal_history_id TEXT REFERENCES terminal_history(id) ON DELETE SET NULL,
  terminal_session_id TEXT REFERENCES terminal_sessions(id) ON DELETE SET NULL
);

INSERT INTO security_findings_new (
  id,
  tenant_id,
  source_type,
  source_ref,
  finding_type,
  severity,
  fingerprint,
  snippet_redacted,
  rule_id,
  status,
  created_by,
  created_at,
  updated_at,
  metadata_json,
  user_id,
  workspace_id,
  secret_id,
  assigned_to,
  resolved_at,
  notification_sent_at,
  suppressed_until,
  terminal_history_id,
  terminal_session_id
)
SELECT
  id,
  tenant_id,
  source_type,
  source_ref,
  finding_type,
  severity,
  fingerprint,
  snippet_redacted,
  rule_id,
  status,
  created_by,
  created_at,
  updated_at,
  metadata_json,
  user_id,
  workspace_id,
  secret_id,
  assigned_to,
  resolved_at,
  notification_sent_at,
  suppressed_until,
  NULL AS terminal_history_id,
  NULL AS terminal_session_id
FROM security_findings_archive_431;

DROP TABLE security_findings;
ALTER TABLE security_findings_new RENAME TO security_findings;

----------------------------------------------------------------------
-- 6) Runtime lookup indexes.
----------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_terminal_connections_default
  ON terminal_connections(workspace_id, tenant_id, user_id, is_default, is_active);

CREATE INDEX IF NOT EXISTS idx_terminal_sessions_active_lookup
  ON terminal_sessions(workspace_id, tenant_id, user_id, status, connection_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_terminal_sessions_connection
  ON terminal_sessions(connection_id);

CREATE INDEX IF NOT EXISTS idx_terminal_history_session_sequence
  ON terminal_history(terminal_session_id, sequence);

CREATE INDEX IF NOT EXISTS idx_pty_health_terminal_session
  ON pty_health_events(terminal_session_id, recorded_at);

CREATE INDEX IF NOT EXISTS idx_security_findings_terminal_session
  ON security_findings(terminal_session_id, created_at);


PRAGMA foreign_keys = ON;
