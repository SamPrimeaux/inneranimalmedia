-- 218: ai_generation_logs — per-turn token/cost + code artifact columns for assistant_code_block rows
-- Run (remote):
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/218_ai_generation_logs_tokens.sql

ALTER TABLE ai_generation_logs ADD COLUMN input_tokens INTEGER DEFAULT 0;
ALTER TABLE ai_generation_logs ADD COLUMN output_tokens INTEGER DEFAULT 0;
ALTER TABLE ai_generation_logs ADD COLUMN computed_cost_usd REAL DEFAULT 0;
ALTER TABLE ai_generation_logs ADD COLUMN provider TEXT DEFAULT NULL;
ALTER TABLE ai_generation_logs ADD COLUMN conversation_id TEXT DEFAULT NULL;
ALTER TABLE ai_generation_logs ADD COLUMN code_language TEXT DEFAULT NULL;
ALTER TABLE ai_generation_logs ADD COLUMN code_char_count INTEGER DEFAULT 0;
