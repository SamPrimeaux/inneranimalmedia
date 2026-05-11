-- Canonical dispatch: agentsam_model_catalog.api_platform mirrors agentsam_ai semantics.
-- Safe to apply once per database; re-run fails on duplicate ADD COLUMN (expected).

ALTER TABLE agentsam_model_catalog ADD COLUMN api_platform TEXT;

-- OpenAI: prefer agentsam_ai when it explicitly selects Responses API; else chat completions.
UPDATE agentsam_model_catalog
SET api_platform = (
  SELECT CASE
    WHEN LOWER(TRIM(COALESCE(a.api_platform, ''))) IN ('openai_responses', 'responses')
      THEN 'openai_responses'
    ELSE 'openai_chat_completions'
  END
  FROM agentsam_ai AS a
  WHERE TRIM(a.model_key) = TRIM(agentsam_model_catalog.model_key)
    AND a.mode = 'model'
    AND COALESCE(a.status, '') = 'active'
  LIMIT 1
)
WHERE LOWER(TRIM(COALESCE(agentsam_model_catalog.provider, ''))) = 'openai'
  AND (
    agentsam_model_catalog.api_platform IS NULL
    OR TRIM(agentsam_model_catalog.api_platform) = ''
  )
  AND EXISTS (
    SELECT 1
    FROM agentsam_ai AS a2
    WHERE TRIM(a2.model_key) = TRIM(agentsam_model_catalog.model_key)
      AND a2.mode = 'model'
      AND COALESCE(a2.status, '') = 'active'
  );

UPDATE agentsam_model_catalog
SET api_platform = 'openai_chat_completions'
WHERE LOWER(TRIM(COALESCE(provider, ''))) = 'openai'
  AND (api_platform IS NULL OR TRIM(api_platform) = '');

UPDATE agentsam_model_catalog
SET api_platform = 'anthropic'
WHERE LOWER(TRIM(COALESCE(provider, ''))) = 'anthropic'
  AND (api_platform IS NULL OR TRIM(api_platform) = '');

UPDATE agentsam_model_catalog
SET api_platform = 'gemini_api'
WHERE LOWER(TRIM(COALESCE(provider, ''))) IN ('google', 'gemini')
  AND (api_platform IS NULL OR TRIM(api_platform) = '');

UPDATE agentsam_model_catalog
SET api_platform = 'workers_ai'
WHERE LOWER(TRIM(COALESCE(provider, ''))) IN ('workers_ai', 'cloudflare')
  AND (api_platform IS NULL OR TRIM(api_platform) = '');

UPDATE agentsam_model_catalog
SET api_platform = 'vertex'
WHERE LOWER(TRIM(COALESCE(provider, ''))) = 'vertex'
  AND (api_platform IS NULL OR TRIM(api_platform) = '');

UPDATE agentsam_model_catalog
SET api_platform = 'ollama'
WHERE LOWER(TRIM(COALESCE(provider, ''))) = 'ollama'
  AND (api_platform IS NULL OR TRIM(api_platform) = '');
