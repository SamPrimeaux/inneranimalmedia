-- 750: Repair gpt-5.4-nano dispatch — api_platform must not be 'unknown' in production.
UPDATE agentsam_model_catalog
SET api_platform = 'openai_responses',
    provider = COALESCE(NULLIF(TRIM(provider), ''), 'openai'),
    openai_model_id = COALESCE(NULLIF(TRIM(openai_model_id), ''), 'gpt-5.4-nano'),
    supports_tools = COALESCE(supports_tools, 1),
    supports_streaming = COALESCE(supports_streaming, 1),
    is_active = 1,
    updated_at = unixepoch()
WHERE lower(trim(model_key)) = 'gpt-5.4-nano'
  AND (
    api_platform IS NULL
    OR trim(api_platform) = ''
    OR lower(trim(api_platform)) = 'unknown'
  );
