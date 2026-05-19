-- 343: Consolidate browser sessions into auth_sessions; drop legacy `sessions` table.
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/343_auth_sessions_absorb_sessions.sql

ALTER TABLE auth_sessions ADD COLUMN email TEXT;
ALTER TABLE auth_sessions ADD COLUMN provider TEXT DEFAULT 'email';
ALTER TABLE auth_sessions ADD COLUMN display_name TEXT;
ALTER TABLE auth_sessions ADD COLUMN avatar_url TEXT;
ALTER TABLE auth_sessions ADD COLUMN revoked_at TEXT;
ALTER TABLE auth_sessions ADD COLUMN revoke_reason TEXT;
ALTER TABLE auth_sessions ADD COLUMN provider_subject TEXT;
ALTER TABLE auth_sessions ADD COLUMN workspace_id TEXT;
ALTER TABLE auth_sessions ADD COLUMN person_uuid TEXT;
-- Operational columns previously on `sessions` only:
ALTER TABLE auth_sessions ADD COLUMN work_session_id TEXT;
ALTER TABLE auth_sessions ADD COLUMN last_active_at INTEGER;

-- Enrich existing auth_sessions rows from legacy sessions (same id).
UPDATE auth_sessions
SET
  email = COALESCE((SELECT s.email FROM sessions s WHERE s.id = auth_sessions.id), email),
  provider = COALESCE((SELECT s.provider FROM sessions s WHERE s.id = auth_sessions.id), provider, 'email'),
  display_name = COALESCE((SELECT s.display_name FROM sessions s WHERE s.id = auth_sessions.id), display_name),
  avatar_url = COALESCE((SELECT s.avatar_url FROM sessions s WHERE s.id = auth_sessions.id), avatar_url),
  provider_subject = COALESCE((SELECT s.provider_subject FROM sessions s WHERE s.id = auth_sessions.id), provider_subject),
  workspace_id = COALESCE((SELECT s.workspace_id FROM sessions s WHERE s.id = auth_sessions.id), workspace_id),
  person_uuid = COALESCE((SELECT s.person_uuid FROM sessions s WHERE s.id = auth_sessions.id), person_uuid),
  last_active_at = COALESCE((SELECT s.last_active_at FROM sessions s WHERE s.id = auth_sessions.id), last_active_at),
  ip_address = COALESCE((SELECT s.ip_address FROM sessions s WHERE s.id = auth_sessions.id), ip_address),
  user_agent = COALESCE((SELECT s.user_agent FROM sessions s WHERE s.id = auth_sessions.id), user_agent),
  tenant_id = COALESCE((SELECT s.tenant_id FROM sessions s WHERE s.id = auth_sessions.id), tenant_id),
  revoked_at = CASE
    WHEN (SELECT s.revoked_at FROM sessions s WHERE s.id = auth_sessions.id) IS NOT NULL
    THEN datetime(CAST((SELECT s.revoked_at FROM sessions s WHERE s.id = auth_sessions.id) AS INTEGER) / 1000, 'unixepoch')
    ELSE revoked_at
  END,
  revoke_reason = COALESCE((SELECT s.revoke_reason FROM sessions s WHERE s.id = auth_sessions.id), revoke_reason)
WHERE EXISTS (SELECT 1 FROM sessions s WHERE s.id = auth_sessions.id);

-- Insert sessions-only rows (no matching auth_sessions).
INSERT INTO auth_sessions (
  id, user_id, tenant_id, person_uuid, email, provider, provider_subject,
  display_name, avatar_url, workspace_id,
  ip_address, user_agent, last_active_at, expires_at, created_at, revoked_at, revoke_reason
)
SELECT
  s.id,
  s.user_id,
  s.tenant_id,
  s.person_uuid,
  s.email,
  COALESCE(s.provider, 'email'),
  s.provider_subject,
  s.display_name,
  s.avatar_url,
  s.workspace_id,
  s.ip_address,
  s.user_agent,
  s.last_active_at,
  CASE
    WHEN s.expires_at IS NOT NULL AND typeof(s.expires_at) IN ('integer', 'real')
    THEN datetime(CAST(s.expires_at AS INTEGER) / 1000, 'unixepoch')
    ELSE COALESCE(CAST(s.expires_at AS TEXT), datetime('now', '+30 days'))
  END,
  CASE
    WHEN s.created_at IS NOT NULL AND typeof(s.created_at) IN ('integer', 'real')
    THEN datetime(CAST(s.created_at AS INTEGER) / 1000, 'unixepoch')
    ELSE datetime('now')
  END,
  CASE
    WHEN s.revoked_at IS NOT NULL
    THEN datetime(CAST(s.revoked_at AS INTEGER) / 1000, 'unixepoch')
    ELSE NULL
  END,
  s.revoke_reason
FROM sessions s
WHERE s.id NOT IN (SELECT id FROM auth_sessions);

DROP TABLE IF EXISTS sessions;

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_revoked ON auth_sessions(user_id, revoked_at);
