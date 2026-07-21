-- 979: Retire discontinued Gemini 2.5 pricing rows (catalog already nuked in 564).
-- Keep rows for historical cost reconstruction; mark inactive + close effective_to.
-- Successors: gemini-3.6-flash / gemini-3.5-flash-lite / gemini-3.5-flash.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/979_retire_gemini_25_model_pricing.sql

UPDATE agentsam_model_pricing
SET
  is_active = 0,
  effective_to = COALESCE(NULLIF(effective_to, ''), '2026-07-21 00:00:00'),
  notes = TRIM(
    COALESCE(notes, '') ||
    CASE WHEN COALESCE(notes, '') = '' THEN '' ELSE ' ' END ||
    'Retired 2026-07-21 — Gemini 2.5 discontinued; use gemini-3.6-flash / gemini-3.5-flash-lite.'
  ),
  updated_at = datetime('now')
WHERE model_key IN (
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-pro',
  'gemini-2.5-flash-image',
  'gemini-2.5-flash-preview-tts',
  'gemini-2.5-pro-preview-tts',
  'gemini-2.5-flash-preview-05-20',
  'gemini-2.5-flash-preview-04-17'
)
AND COALESCE(is_active, 1) = 1;

-- Belt-and-suspenders: catalog / picker / arms (idempotent if 564 already applied).
UPDATE agentsam_model_catalog
SET
  is_active = 0,
  is_degraded = 1,
  degraded_reason = COALESCE(
    NULLIF(degraded_reason, ''),
    'google_discontinued_use_gemini-3.6-flash_or_gemini-3.5-flash-lite'
  ),
  updated_at = unixepoch()
WHERE model_key LIKE 'gemini-2.5%'
  AND COALESCE(is_active, 1) = 1;

UPDATE agentsam_ai
SET
  status = 'inactive',
  show_in_picker = 0,
  picker_eligible = 0,
  updated_at = unixepoch()
WHERE model_key LIKE 'gemini-2.5%'
  AND status = 'active';

UPDATE agentsam_routing_arms
SET
  is_paused = 1,
  pause_reason = 'gemini_2_5_discontinued_2026-07-21',
  updated_at = unixepoch()
WHERE model_key LIKE 'gemini-2.5%'
  AND COALESCE(is_paused, 0) = 0;
