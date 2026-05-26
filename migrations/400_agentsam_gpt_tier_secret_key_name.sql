-- 400: Opt-in OpenAI Codex / GPT-5.5 tier → AGENTSAMGPT_SERVICEKEY (additive; OPENAI_API_KEY unchanged for other keys).
-- Apply remote:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/400_agentsam_gpt_tier_secret_key_name.sql
-- Wrangler: npx wrangler secret put AGENTSAMGPT_SERVICEKEY --config wrangler.production.toml

UPDATE agentsam_ai
SET secret_key_name = 'AGENTSAMGPT_SERVICEKEY',
    updated_at = unixepoch()
WHERE mode = 'model'
  AND LOWER(TRIM(provider)) = 'openai'
  AND (
    LOWER(TRIM(model_key)) LIKE 'gpt-5.5%'
    OR LOWER(TRIM(model_key)) LIKE '%codex%'
  );
