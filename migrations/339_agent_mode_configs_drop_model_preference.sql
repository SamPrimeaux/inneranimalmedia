-- 339: Remove model_preference from agent_mode_configs — chat model choice lives in agentsam_routing_arms + Thompson / fallbacks only.
-- Deploy Worker that no longer reads this column BEFORE applying. Remote:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/339_agent_mode_configs_drop_model_preference.sql

ALTER TABLE agent_mode_configs DROP COLUMN model_preference;
