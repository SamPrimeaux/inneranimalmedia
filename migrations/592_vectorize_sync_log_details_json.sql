-- 592: Extend vectorize_sync_log with structured ingest/reindex receipts (details_json).
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/592_vectorize_sync_log_details_json.sql

ALTER TABLE vectorize_sync_log ADD COLUMN details_json TEXT;
