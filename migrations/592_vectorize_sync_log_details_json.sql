-- 592: Extend vectorize_sync_log with structured ingest/reindex receipts (details_json).
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/592_vectorize_sync_log_details_json.sql
--
-- Idempotent: if details_json was applied manually (or pre-ledger), deploy runner
-- (scripts/d1-apply-pending.mjs → runD1MigrationFile) verifies PRAGMA table_info and
-- registers this row when SQLite returns "duplicate column name: details_json".
-- Register-only without SQL: node scripts/d1-apply-pending.mjs --register-only --from 592 --to 592

ALTER TABLE vectorize_sync_log ADD COLUMN details_json TEXT;
