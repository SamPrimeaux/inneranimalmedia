-- 127 add column: agent_configs may already exist without default_model_id (e.g. from older deploy)
-- Run if table already existed with different schema. Skip if default_model_id already exists.
-- npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/127_agent_configs_add_columns.sql

ALTER TABLE agent_configs ADD COLUMN default_model_id TEXT;
UPDATE agent_configs SET default_model_id = 'claude-sonnet-4-6' WHERE id = 'agent-sam-primary';
INSERT OR IGNORE INTO agent_configs (id, default_model_id) VALUES ('agent-sam-primary', 'claude-sonnet-4-6');
