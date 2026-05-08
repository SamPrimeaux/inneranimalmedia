ALTER TABLE secret_audit_log RENAME TO secret_audit_log_old;

CREATE TABLE secret_audit_log (
  id             TEXT PRIMARY KEY DEFAULT ('saudit_' || lower(hex(randomblob(8)))),
  secret_id      TEXT NOT NULL,
  secret_source  TEXT NOT NULL DEFAULT 'user_secrets'
    CHECK (secret_source IN (
      'user_secrets',
      'env_secrets',
      'user_api_keys',
      'user_oauth_tokens',
      'mcp_service_credentials',
      'integration_connections'
    )),
  tenant_id      TEXT NOT NULL,
  user_id        TEXT,
  event_type     TEXT NOT NULL CHECK (event_type IN (
    'created', 'viewed', 'copied', 'rotated', 'edited',
    'revoked', 'expired', 'test_passed', 'test_failed',
    'exposure_detected', 'resolution_failed', 'refresh_attempted'
  )),
  triggered_by   TEXT,
  previous_last4 TEXT,
  new_last4      TEXT,
  notes          TEXT,
  ip_address     TEXT,
  user_agent     TEXT,
  created_at     INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT INTO secret_audit_log
  SELECT
    id, secret_id, secret_source, tenant_id, user_id, event_type,
    triggered_by, previous_last4, new_last4, notes, ip_address, user_agent, created_at
  FROM secret_audit_log_old;

DROP TABLE secret_audit_log_old;
