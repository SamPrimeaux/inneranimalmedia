-- Workers AI fallback catalog + OpenAI active pricing set.
-- Schema matches production agentsam_model_catalog (cost_per_1k_in/out, tier, is_active, workers_ai_model_id, openai_model_id, …).
-- Routing metadata (role, priority, cached $/1k) lives in cost_notes until optional columns are added.
-- Provider for Workers AI rows is workers_ai (matches telemetry + existing catalog rows); cost_notes references Cloudflare neuron/token-equivalent docs.

-- ─── Sync pricing on existing Workers AI rows (same @cf binding, canonical model_key) ───
UPDATE agentsam_model_catalog SET
  cost_per_1k_in = 0.000660,
  cost_per_1k_out = 0.001000,
  cost_notes = 'role=code_fallback;p=980|Cloudflare Workers AI token-equivalent; verify vs pricing table.'
WHERE model_key = 'wai-qwen-coder-32b';

UPDATE agentsam_model_catalog SET
  cost_per_1k_in = 0.000270,
  cost_per_1k_out = 0.000850,
  context_window = COALESCE(context_window, 131072),
  max_output_tokens = COALESCE(max_output_tokens, 8192),
  supports_vision = 1,
  cost_notes = 'role=vision_fallback;p=960|Cloudflare Workers AI token-equivalent; verify vs pricing table.'
WHERE model_key = 'wai-llama-4-scout';

-- ─── New Workers AI bindings (INSERT OR IGNORE on model_key) ───
INSERT OR IGNORE INTO agentsam_model_catalog
  (id, model_key, display_name, provider, tier,
   workers_ai_model_id, openai_model_id,
   context_window, max_output_tokens,
   cost_per_1k_in, cost_per_1k_out, cost_per_tool_call,
   supports_tools, supports_vision, supports_streaming, supports_json_mode, supports_reasoning,
   is_active, is_degraded, budget_exhausted, total_calls, cost_notes)
VALUES
  ('mdl_wai_granite_4h','wai-granite-4-h-micro','Granite 4.0 H Micro',
   'workers_ai','flash',
   '@cf/ibm-granite/granite-4.0-h-micro', NULL,
   131072, 8192,
   0.000017, 0.000112, 0,
   1, 0, 1, 1, 0,
   1, 0, 0, 0,
   'role=router;p=910|CF Workers AI token-equivalent ($/1k); verify periodically.'),

  ('mdl_wai_qwen3_30b','wai-qwen3-30b-a3b-fp8','Qwen3 30B A3B FP8',
   'workers_ai','standard',
   '@cf/qwen/qwen3-30b-a3b-fp8', NULL,
   131072, 8192,
   0.000051, 0.000335, 0,
   1, 0, 1, 1, 0,
   1, 0, 0, 0,
   'role=cheap_reasoning;p=920|CF Workers AI token-equivalent; verify periodically.'),

  ('mdl_wai_glm_47','wai-glm-4-7-flash','GLM 4.7 Flash',
   'workers_ai','flash',
   '@cf/zai-org/glm-4.7-flash', NULL,
   131072, 8192,
   0.000150, 0.000500, 0,
   1, 0, 1, 1, 0,
   1, 0, 0, 0,
   'role=cheap_tool_calling;p=930|estimate until exact CF table; verify before billing.'),

  ('mdl_wai_gpt_oss_20','wai-gpt-oss-20b','GPT-OSS 20B',
   'workers_ai','standard',
   '@cf/openai/gpt-oss-20b', NULL,
   131072, 8192,
   0.000200, 0.000300, 0,
   1, 0, 1, 1, 0,
   1, 0, 0, 0,
   'role=fast_reasoning_fallback;p=940|CF Workers AI token-equivalent; verify periodically.'),

  ('mdl_wai_gpt_oss_120','wai-gpt-oss-120b','GPT-OSS 120B',
   'workers_ai','standard',
   '@cf/openai/gpt-oss-120b', NULL,
   131072, 8192,
   0.000350, 0.000750, 0,
   1, 0, 1, 1, 0,
   1, 0, 0, 0,
   'role=reasoning_fallback;p=950|CF Workers AI token-equivalent; verify periodically.'),

  ('mdl_wai_mistral_sm','wai-mistral-small-3-1-24b','Mistral Small 3.1 24B',
   'workers_ai','standard',
   '@cf/mistralai/mistral-small-3.1-24b-instruct', NULL,
   128000, 8192,
   0.000351, 0.000555, 0,
   1, 1, 1, 1, 0,
   1, 0, 0, 0,
   'role=vision_general_fallback;p=970|CF Workers AI token-equivalent; verify periodically.'),

  ('mdl_wai_qwq_32b','wai-qwq-32b','QwQ 32B',
   'workers_ai','standard',
   '@cf/qwen/qwq-32b', NULL,
   131072, 8192,
   0.000660, 0.001000, 0,
   0, 0, 1, 0, 1,
   1, 0, 0, 0,
   'role=deep_reasoning_fallback;p=990|CF Workers AI token-equivalent; verify periodically.'),

  ('mdl_wai_bge_m3','wai-bge-m3','BGE M3 Embeddings',
   'workers_ai','micro',
   '@cf/baai/bge-m3', NULL,
   8192, 512,
   0.000012, 0, 0,
   0, 0, 0, 0, 0,
   1, 0, 0, 0,
   'role=embedding_fallback;p=995|CF Workers AI embedding lane; output N/A for embed.');

-- ─── OpenAI: refresh pricing on existing 5.4-family keys (keeps routing arms stable) ───
UPDATE agentsam_model_catalog SET
  cost_per_1k_in = 0.000750,
  cost_per_1k_out = 0.004500,
  context_window = 400000,
  max_output_tokens = 128000,
  cost_notes = 'cached_in_per_1k=0.000075|OpenAI $/1M→$/1k 2026-05-08; default mini / subagents.'
WHERE model_key = 'gpt-5.4-mini';

UPDATE agentsam_model_catalog SET
  cost_per_1k_in = 0.000200,
  cost_per_1k_out = 0.001250,
  context_window = 400000,
  max_output_tokens = 128000,
  cost_notes = 'cached_in_per_1k=0.000020|OpenAI $/1M→$/1k 2026-05-08; cheap router/summarizer.'
WHERE model_key = 'gpt-5.4-nano';

-- ─── OpenAI: new catalog keys (INSERT OR IGNORE) ───
INSERT OR IGNORE INTO agentsam_model_catalog
  (id, model_key, display_name, provider, tier,
   workers_ai_model_id, openai_model_id,
   context_window, max_output_tokens,
   cost_per_1k_in, cost_per_1k_out, cost_per_tool_call,
   supports_tools, supports_vision, supports_streaming, supports_json_mode, supports_reasoning,
   is_active, is_degraded, budget_exhausted, total_calls, cost_notes)
VALUES
  ('mdl_gpt55_main','gpt-55-main','GPT-5.5 (disabled)',
   'openai','frontier',
   NULL, 'gpt-5.5',
   1000000, 128000,
   0.005000, 0.030000, 0,
   1, 1, 1, 1, 1,
   0, 0, 0, 0,
   'future_frontier|cached_in_per_1k=0.000500|DISABLED until API access; is_active=0.'),

  ('mdl_gpt54_main','gpt-54-main','GPT-5.4',
   'openai','power',
   NULL, 'gpt-5.4',
   1000000, 128000,
   0.002500, 0.015000, 0,
   1, 1, 1, 1, 1,
   1, 0, 0, 0,
   'role=premium_agent;p=10|cached_in_per_1k=0.000250|OpenAI 2026-05-08.'),

  ('mdl_gpt53_codex','gpt-53-codex','GPT-5.3 Codex',
   'openai','power',
   NULL, 'gpt-5.3-codex',
   400000, 128000,
   0.001750, 0.014000, 0,
   1, 1, 1, 1, 1,
   1, 0, 0, 0,
   'role=agentic_code;p=15|cached_in_per_1k=0.000175|OpenAI 2026-05-08.'),

  ('mdl_gpt_rt_mini','gpt-realtime-mini','GPT Realtime Mini',
   'openai','flash',
   NULL, 'gpt-realtime-mini',
   32000, 4096,
   0.000600, 0.002400, 0,
   1, 1, 1, 0, 0,
   1, 0, 0, 0,
   'role=realtime_voice;p=60|cached_in_per_1k=0.000060|text tokens only; audio separate.'),

  ('mdl_gpt_img2','gpt-image-2','GPT Image 2',
   'openai','standard',
   NULL, 'gpt-image-2',
   0, 0,
   0.005000, 0.030000, 0,
   0, 1, 0, 0, 0,
   1, 0, 0, 0,
   'role=image_generation;p=70|tokenized image pricing; refine for production billing.'),

  ('mdl_emb_lg','text-embedding-3-large','Text Embedding 3 Large',
   'openai','micro',
   NULL, 'text-embedding-3-large',
   8192, 0,
   0.000130, 0, 0,
   0, 0, 0, 0, 0,
   1, 0, 0, 0,
   'role=embedding_primary;p=80|input-only pricing per 1k tokens.'),

  ('mdl_emb_sm','text-embedding-3-small','Text Embedding 3 Small',
   'openai','micro',
   NULL, 'text-embedding-3-small',
   8192, 0,
   0.000020, 0, 0,
   0, 0, 0, 0, 0,
   1, 0, 0, 0,
   'role=embedding_cheap;p=90|input-only pricing per 1k tokens.');
