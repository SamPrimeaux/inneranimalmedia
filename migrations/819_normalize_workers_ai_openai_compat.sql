-- 819: Normalize workers_ai_openai_compat catalog rows (idempotent with live UPDATE).
UPDATE agentsam_model_catalog
SET api_platform = 'workers_ai',
    updated_at = unixepoch()
WHERE api_platform = 'workers_ai_openai_compat';
