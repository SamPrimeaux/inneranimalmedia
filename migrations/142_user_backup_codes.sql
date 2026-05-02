-- Backup codes for account recovery. Hashed codes stored in D1; plain codes emailed once via Resend.
-- Database: inneranimalmedia-business (D1)
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/142_user_backup_codes.sql

CREATE TABLE IF NOT EXISTS user_backup_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  used_at INTEGER,
  created_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_user_backup_codes_user ON user_backup_codes (user_id);
CREATE INDEX IF NOT EXISTS idx_user_backup_codes_hash ON user_backup_codes (code_hash);
