-- 825: Pause all Workers AI GLM 4.7 Flash routing arms.
-- Reason: quality eval window for newer catalog models (Sol/Luna/Sonnet 5 / GPT-5.6 / DeepSeek).
-- GLM was winning chat/plan/tool/emergency paths and even showed up on intent_classification
-- via ask-task emergency fallback — polluting quality signal.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/825_pause_wai_glm_47_flash_arms.sql

UPDATE agentsam_routing_arms SET
  is_paused = 1,
  pause_reason = 'quality_eval_newer_models_pause_glm_flash_2026-07-11',
  updated_at = unixepoch()
WHERE model_key = '@cf/zai-org/glm-4.7-flash'
  AND COALESCE(is_paused, 0) = 0;
