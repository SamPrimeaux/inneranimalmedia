-- One-time Supabase backfill: agentsam_eval_runs.provider + model_key (pre-deriveProvider rows).
-- Run in SQL editor for project inneranimalmedia-business-supabase (dpmuvynqixblxsilnlut).
-- Mirrors deriveProvider() in src/core/memory.js.

UPDATE public.agentsam_eval_runs
SET
  provider = CASE
    WHEN lower(coalesce(model_key, '')) ~ '^(gpt-|o1|o3|o4)' THEN 'openai'
    WHEN lower(coalesce(model_key, '')) LIKE 'claude-%' THEN 'anthropic'
    WHEN lower(coalesce(model_key, '')) LIKE 'gemini-%' THEN 'google'
    WHEN lower(coalesce(model_key, '')) ~ '^(llama|wai-|@cf/)' THEN 'workers_ai'
    WHEN lower(coalesce(model_key, '')) LIKE 'qwen%' OR lower(coalesce(model_key, '')) LIKE '%deepseek%' THEN 'ollama'
    ELSE coalesce(provider, 'unknown')
  END
WHERE (provider IS NULL OR trim(provider) = '')
  AND model_key IS NOT NULL
  AND trim(model_key) <> '';

-- Sanity check (expect null_provider → 0 after backfill):
-- SELECT COUNT(*) FILTER (WHERE provider IS NULL OR provider = '') AS null_provider,
--        COUNT(*) FILTER (WHERE model_key IS NULL OR model_key = '') AS null_model_key
-- FROM public.agentsam_eval_runs;
