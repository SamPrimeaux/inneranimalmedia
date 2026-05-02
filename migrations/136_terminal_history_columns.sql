-- 136: terminal_history — add terminal_session_id, agent_session_id, recorded_at for runTerminalCommand (agent) writes
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/136_terminal_history_columns.sql

ALTER TABLE terminal_history ADD COLUMN terminal_session_id TEXT;
ALTER TABLE terminal_history ADD COLUMN agent_session_id TEXT;
ALTER TABLE terminal_history ADD COLUMN recorded_at INTEGER;
