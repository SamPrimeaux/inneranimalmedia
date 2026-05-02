-- 127: agent_configs table for default model (Agent Sam)
-- Run: npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/127_agent_configs_default_model.sql
-- Purpose: Boot returns default_model_id; React selects Sonnet 4.6 on load while showing all models in picker.

CREATE TABLE IF NOT EXISTS agent_configs (
  id TEXT PRIMARY KEY,
  default_model_id TEXT,
  updated_at TEXT
);

INSERT OR IGNORE INTO agent_configs (id, default_model_id, updated_at)
VALUES ('agent-sam-primary', 'claude-sonnet-4-6', datetime('now'));
