-- Add email verification columns to auth_users
ALTER TABLE auth_users ADD COLUMN is_verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE auth_users ADD COLUMN verified_at INTEGER;

-- Verification + password reset tokens table
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id           TEXT    PRIMARY KEY,
  auth_user_id TEXT    NOT NULL,
  token        TEXT    NOT NULL UNIQUE,
  token_type   TEXT    NOT NULL DEFAULT 'verify', -- 'verify' | 'reset'
  expires_at   INTEGER NOT NULL,
  used_at      INTEGER,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_evt_token ON email_verification_tokens(token);
CREATE INDEX IF NOT EXISTS idx_evt_user  ON email_verification_tokens(auth_user_id);
