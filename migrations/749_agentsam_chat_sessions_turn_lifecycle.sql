-- 749: Turn lifecycle on agentsam_chat_sessions — failed/interrupted vs silent tokens_out:0
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/749_agentsam_chat_sessions_turn_lifecycle.sql

ALTER TABLE agentsam_chat_sessions ADD COLUMN last_turn_status TEXT;
ALTER TABLE agentsam_chat_sessions ADD COLUMN last_turn_error TEXT;
ALTER TABLE agentsam_chat_sessions ADD COLUMN last_turn_at INTEGER;
