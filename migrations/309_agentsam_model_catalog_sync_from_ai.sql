-- Align agentsam_model_catalog pricing with agentsam_ai ($/Mt → $/1k tokens).
-- Safe to re-run on inneranimalmedia-business.

UPDATE agentsam_model_catalog AS mc
SET
  cost_per_1k_in = COALESCE(a.input_rate_per_mtok, mc.cost_per_1k_in, 0) / 1000.0,
  cost_per_1k_out = COALESCE(a.output_rate_per_mtok, mc.cost_per_1k_out, 0) / 1000.0,
  display_name = COALESCE(NULLIF(trim(mc.display_name), ''), NULLIF(trim(a.name), ''), mc.display_name),
  provider = COALESCE(NULLIF(trim(mc.provider), ''), NULLIF(trim(a.provider), ''), mc.provider),
  supports_tools = COALESCE(a.supports_tools, mc.supports_tools),
  context_window = COALESCE(a.context_max_tokens, mc.context_window),
  max_output_tokens = COALESCE(a.output_max_tokens, mc.max_output_tokens)
FROM agentsam_ai AS a
WHERE trim(mc.model_key) = trim(a.model_key)
  AND a.mode = 'model'
  AND COALESCE(a.status, '') = 'active';
