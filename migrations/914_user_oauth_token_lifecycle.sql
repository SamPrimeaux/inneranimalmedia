-- OAuth credential lifecycle and refresh telemetry.
-- Database: inneranimalmedia-business (D1)
-- Apply through the repository migration runner; ALTER failures are handled per statement.

ALTER TABLE user_oauth_tokens ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE user_oauth_tokens ADD COLUMN revoked_at INTEGER;
ALTER TABLE user_oauth_tokens ADD COLUMN revoked_by TEXT;
ALTER TABLE user_oauth_tokens ADD COLUMN last_refresh_at INTEGER;
ALTER TABLE user_oauth_tokens ADD COLUMN last_refresh_error_code TEXT;
ALTER TABLE user_oauth_tokens ADD COLUMN refresh_failure_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_user_oauth_tokens_active_lookup
  ON user_oauth_tokens (user_id, provider, account_identifier, updated_at DESC)
  WHERE is_active = 1 AND revoked_at IS NULL;
