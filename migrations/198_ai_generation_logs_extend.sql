-- 198: ai_generation_logs — extend for IAM platform seeds (not only LMS).
-- Run once; if columns already exist, comment out ALTERs and re-run INSERT-only file 199.
--
-- Apply prod:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/198_ai_generation_logs_extend.sql

ALTER TABLE ai_generation_logs ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE ai_generation_logs ADD COLUMN source_kind TEXT DEFAULT 'unknown'
  CHECK(source_kind IN ('unknown','lms','migration_seed','worker','cursor_agent','api_batch'));
ALTER TABLE ai_generation_logs ADD COLUMN workspace_id TEXT;
ALTER TABLE ai_generation_logs ADD COLUMN related_ids_json TEXT;
