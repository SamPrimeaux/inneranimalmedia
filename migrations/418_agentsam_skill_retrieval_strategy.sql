-- 418_agentsam_skill_retrieval_strategy.sql — blended skills: db | r2 | vectorize | none
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/418_agentsam_skill_retrieval_strategy.sql

ALTER TABLE agentsam_skill ADD COLUMN retrieval_strategy TEXT NOT NULL DEFAULT 'db'
  CHECK (retrieval_strategy IN ('db', 'r2', 'vectorize', 'none'));
