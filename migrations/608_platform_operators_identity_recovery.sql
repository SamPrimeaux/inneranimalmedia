-- Phase 2: platform operator registry (person_uuid SSOT) + identity recovery audit trail

CREATE TABLE IF NOT EXISTS platform_operators (
  id                   TEXT PRIMARY KEY,
  person_uuid          TEXT NOT NULL UNIQUE,
  display_name         TEXT,
  default_tenant_id    TEXT,
  default_workspace_id TEXT,
  is_active            INTEGER NOT NULL DEFAULT 1,
  created_at           INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at           INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_platform_operators_active
  ON platform_operators (is_active, person_uuid);

INSERT OR IGNORE INTO platform_operators (
  id, person_uuid, display_name, default_tenant_id, default_workspace_id, is_active
) VALUES (
  'pop_sam_primeaux',
  '550e8400-e29b-41d4-a716-446655440001',
  'Sam Primeaux',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  1
);

CREATE TABLE IF NOT EXISTS identity_recovery_attempts (
  id            TEXT PRIMARY KEY,
  user_id       TEXT,
  email         TEXT NOT NULL,
  channel       TEXT NOT NULL,
  purpose       TEXT NOT NULL,
  code_hash     TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  expires_at    INTEGER,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_identity_recovery_email
  ON identity_recovery_attempts (email, purpose, status);
CREATE INDEX IF NOT EXISTS idx_identity_recovery_user
  ON identity_recovery_attempts (user_id, created_at);
