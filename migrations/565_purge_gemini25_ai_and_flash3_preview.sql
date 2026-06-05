-- 565: Remove deprecated Gemini 2.x from agentsam_ai; retire gemini-3-flash-preview (ambiguous vs 3.5 Flash).
-- Apply prod:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/565_purge_gemini25_ai_and_flash3_preview.sql

DELETE FROM agentsam_ai
WHERE mode = 'model'
  AND model_key IN (
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite'
  );

UPDATE agentsam_model_catalog
SET is_active = 0, is_degraded = 1,
    degraded_reason = 'superseded_by_gemini-3.5-flash',
    deprecated_after = '2026-06-04',
    updated_at = unixepoch()
WHERE model_key = 'gemini-3-flash-preview';

-- Pause any routing arms still pointing at removed picker rows.
UPDATE agentsam_routing_arms
SET is_paused = 1, pause_reason = 'model_purged_565', updated_at = unixepoch()
WHERE model_key IN ('gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3-flash-preview')
  AND COALESCE(is_active, 1) = 1;
