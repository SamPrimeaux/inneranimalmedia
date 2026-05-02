-- Multi-account OAuth: allow multiple GitHub (and future multi-account) tokens per user via account_identifier.
-- Google Drive remains single (account_identifier ''). GitHub uses account_identifier = GitHub username (login).
-- Database: inneranimalmedia-business (D1)
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/144_user_oauth_tokens_multi_github.sql
-- Note: If run fails with "error in view cidi_client_metrics: no such column: cl.company_name", run DROP VIEW IF EXISTS cidi_client_metrics; then run the four statements in this file manually (CREATE; INSERT; DROP TABLE user_oauth_tokens; RENAME).

CREATE TABLE IF NOT EXISTS user_oauth_tokens_new (
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  account_identifier TEXT NOT NULL DEFAULT '',
  access_token TEXT,
  refresh_token TEXT,
  expires_at INTEGER,
  scope TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, provider, account_identifier)
);

INSERT INTO user_oauth_tokens_new (user_id, provider, account_identifier, access_token, refresh_token, expires_at, scope, created_at, updated_at)
SELECT user_id, provider, '', access_token, refresh_token, expires_at, scope, created_at, updated_at FROM user_oauth_tokens;

DROP TABLE user_oauth_tokens;

ALTER TABLE user_oauth_tokens_new RENAME TO user_oauth_tokens;
