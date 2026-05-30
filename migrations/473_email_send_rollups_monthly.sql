-- 473: Monthly email send rollups (paired with spend_ledger_monthly_rollup @ 0 0 1 * *).
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/473_email_send_rollups_monthly.sql

CREATE TABLE IF NOT EXISTS email_send_rollups_monthly (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  send_count INTEGER NOT NULL DEFAULT 0,
  source_deleted INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(month, status)
);

CREATE INDEX IF NOT EXISTS idx_email_send_rollups_monthly_month
  ON email_send_rollups_monthly(month);
