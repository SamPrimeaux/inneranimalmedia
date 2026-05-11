-- Read-only verification: compare agentsam_model_catalog vs agentsam_ai for one model_key.
-- Edit the literal in `params` before running (e.g. wrangler d1 execute ... --file=...).
-- Surfaces split-brain when provider or api_platform disagree between catalog and legacy ai rows.

WITH params AS (
  SELECT 'REPLACE_ME_MODEL_KEY' AS mk
)
SELECT
  p.mk AS selected_model_key,
  mc.id AS catalog_row_id,
  mc.provider AS catalog_provider,
  mc.api_platform AS catalog_api_platform,
  mc.openai_model_id,
  mc.anthropic_model_id,
  mc.google_model_id,
  mc.workers_ai_model_id,
  mc.is_active AS catalog_is_active,
  mc.is_degraded AS catalog_is_degraded,
  ai.id AS agentsam_ai_id,
  ai.provider AS agentsam_ai_provider,
  ai.api_platform AS agentsam_ai_api_platform,
  ai.model_key AS agentsam_ai_model_key,
  ai.status AS agentsam_ai_status,
  CASE
    WHEN mc.model_key IS NULL AND ai.model_key IS NOT NULL THEN 'catalog_missing_ai_present'
    WHEN mc.model_key IS NOT NULL AND ai.model_key IS NULL THEN 'catalog_present_ai_missing'
    WHEN mc.model_key IS NULL AND ai.model_key IS NULL THEN 'missing_both'
    WHEN LOWER(TRIM(COALESCE(mc.provider, ''))) != LOWER(TRIM(COALESCE(ai.provider, '')))
      THEN 'split_brain_provider'
    WHEN LOWER(TRIM(COALESCE(mc.api_platform, ''))) != LOWER(TRIM(COALESCE(ai.api_platform, '')))
      THEN 'split_brain_api_platform'
    ELSE 'aligned_or_empty_platform'
  END AS split_brain_flag
FROM params AS p
LEFT JOIN agentsam_model_catalog AS mc
  ON TRIM(mc.model_key) = TRIM(p.mk)
  AND mc.is_active = 1
  AND COALESCE(mc.tenant_id, '') = ''
  AND COALESCE(mc.workspace_id, '') = ''
LEFT JOIN agentsam_ai AS ai
  ON ai.mode = 'model'
  AND TRIM(ai.model_key) = TRIM(p.mk)
  AND COALESCE(ai.status, '') = 'active';

-- Optional: see routing arms referencing the same key (may be multiple rows).
WITH params AS (
  SELECT 'REPLACE_ME_MODEL_KEY' AS mk
)
SELECT
  ra.id AS routing_arm_id,
  ra.task_type,
  ra.mode,
  ra.model_key,
  ra.provider AS arm_provider,
  ra.is_active AS arm_is_active,
  ra.is_paused AS arm_is_paused
FROM agentsam_routing_arms AS ra
CROSS JOIN params AS p
WHERE TRIM(ra.model_key) = TRIM(p.mk)
ORDER BY ra.task_type, ra.mode
LIMIT 20;
