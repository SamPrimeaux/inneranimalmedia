-- 338: Replace stale gpt-4.1-nano model_preference strings in agent_mode_configs (column stores model_key, not agentsam_ai.id).
-- Remote:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/338_agent_mode_configs_refresh_stale_model_pref.sql

UPDATE agent_mode_configs
SET model_preference = 'gpt-5.4-mini'
WHERE lower(trim(COALESCE(model_preference, ''))) = 'gpt-4.1-nano';
