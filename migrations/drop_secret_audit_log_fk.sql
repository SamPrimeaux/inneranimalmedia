-- secret_audit_log: drop FK to env_secrets(id), add secret_source for user vs platform auditing.
-- Database: inneranimalmedia-business (D1)
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/drop_secret_audit_log_fk.sql

PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

CREATE TABLE secret_audit_log__new (
  id TEXT PRIMARY KEY NOT NULL,
  secret_id TEXT NOT NULL,
  tenant_id TEXT,
  user_id TEXT,
  event_type TEXT,
  triggered_by TEXT,
  previous_last4 TEXT,
  new_last4 TEXT,
  notes TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  secret_source TEXT DEFAULT 'user_secrets'
);

INSERT INTO secret_audit_log__new (
  id, secret_id, tenant_id, user_id, event_type,
  triggered_by, previous_last4, new_last4, notes,
  ip_address, user_agent, created_at, secret_source
)
SELECT
  id,
  secret_id,
  tenant_id,
  user_id,
  event_type,
  triggered_by,
  previous_last4,
  new_last4,
  notes,
  ip_address,
  user_agent,
  COALESCE(created_at, unixepoch()),
  'user_secrets'
FROM secret_audit_log;

DROP TABLE secret_audit_log;
ALTER TABLE secret_audit_log__new RENAME TO secret_audit_log;

CREATE INDEX IF NOT EXISTS idx_secret_audit_log_secret_id ON secret_audit_log (secret_id);
CREATE INDEX IF NOT EXISTS idx_secret_audit_log_created_at ON secret_audit_log (created_at);

COMMIT;

PRAGMA foreign_keys = ON;
