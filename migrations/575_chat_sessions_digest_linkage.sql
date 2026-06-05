-- 575: agentsam_chat_sessions — R2 digest linkage for compaction lookup.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/575_chat_sessions_digest_linkage.sql

ALTER TABLE agentsam_chat_sessions ADD COLUMN latest_digest_r2_key TEXT;
ALTER TABLE agentsam_chat_sessions ADD COLUMN digest_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agentsam_chat_sessions ADD COLUMN last_compacted_at INTEGER;
