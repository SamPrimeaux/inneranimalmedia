-- Register 446/447 in d1_migrations after manual prod execution (Option A).
-- Run once:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./scripts/sql/d1_migrations_stub_446_447.sql

INSERT OR IGNORE INTO d1_migrations (name) VALUES ('446_drop_extinct_ai_zero_row_tables.sql');
INSERT OR IGNORE INTO d1_migrations (name) VALUES ('447_drop_legacy_ai_data_tables.sql');
