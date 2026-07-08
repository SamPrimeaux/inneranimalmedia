-- 451: CF Images OAuth — cache delivery hash per workspace
--
-- Column cloudflare_images_account_hash may already exist (450 MCP lane or partial apply).
-- D1 SQLite has no ADD COLUMN IF NOT EXISTS. If ALTER fails with duplicate column, skip — column is present.
--
-- Apply (only when column missing):
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/451_cf_images_oauth_account_hash.sql

-- No-op when column already on remote (verified 2026-07-08).
SELECT 1;
