-- Add created_at to secret_audit_log for consistent audit timestamps. Run only if the column is missing.
-- Database: inneranimalmedia-business (D1)
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/143_secret_audit_log_created_at.sql

ALTER TABLE secret_audit_log ADD COLUMN created_at INTEGER DEFAULT (unixepoch());
