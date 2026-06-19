-- 643: Activate catalog-wired Workers AI lanes in agentsam_ai picker.
-- Cleans duplicate Gemma 4 row; adds missing BGE Large embedding picker row.
--
-- Curated tiers (all 14 catalog-wired @cf models except already-live Gemma + MiniMax):
--   Tier 1 — daily lanes (sort 300–329): GLM 4.7 Flash, Granite, GPT-OSS 20B, Qwen3 30B,
--            Qwen Coder 32B, DeepSeek R1, QwQ 32B, Mistral Small 3.1
--   Tier 2 — heavy frontier (sort 340–349): GPT-OSS 120B, Llama 3.3 70B, Llama 4 Scout,
--            Kimi K2.6, Nemotron 120B
--   Tier 3 — embeddings (sort 360): BGE Large EN v1.5
--
-- To activate Tier 1 only, comment out the "Tier 2" UPDATE block below.
--
-- Apply prod:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/643_activate_workers_ai_catalog_lanes.sql

-- ── 0) Remove duplicate inactive Gemma row (keep canonical wai_gemma4_26b) ───
DELETE FROM agentsam_ai
WHERE id = '@cf/google/gemma-4-26b-a4b-it'
  AND model_key = '@cf/google/gemma-4-26b-a4b-it'
  AND status = 'inactive';

UPDATE agentsam_ai
SET status = 'active',
    show_in_picker = 1,
    picker_eligible = 1,
    sort_order = 370,
    picker_group = 'Workers AI / Efficient',
    description = 'Workers AI Gemma 4 26B — canonical picker row (duplicate @cf id removed).',
    updated_at = unixepoch()
WHERE id = 'wai_gemma4_26b'
  AND model_key = '@cf/google/gemma-4-26b-a4b-it'
  AND mode = 'model';

-- ── 1) Missing picker row: BGE Large (catalog active, agentsam_ai absent) ──
INSERT INTO agentsam_ai (
  id, tenant_id, name, role_name, description, status, mode,
  model_key, provider, api_platform, secret_key_name,
  show_in_picker, picker_eligible, requires_human_approval, sort_order, picker_group, is_global,
  supports_tools, supports_vision, input_rate_per_mtok, output_rate_per_mtok, neurons_usd_per_1k,
  updated_at
)
SELECT
  'wai_bge_large_en_v15',
  '',
  'BGE Large EN v1.5',
  'bge_large_en_v15',
  'Workers AI embeddings lane — pairs with AGENTSAMVECTORIZE 768/1024-dim codebase index.',
  'active',
  'model',
  '@cf/baai/bge-large-en-v1.5',
  'workers_ai',
  'workers_ai',
  NULL,
  1,
  1,
  0,
  360,
  'Workers AI / Embeddings',
  1,
  0,
  0,
  0.012,
  0,
  0.012,
  unixepoch()
WHERE NOT EXISTS (
  SELECT 1 FROM agentsam_ai
  WHERE model_key = '@cf/baai/bge-large-en-v1.5' AND mode = 'model'
);

-- ── 2) Tier 1 — core daily Workers AI chat/code/reasoning lanes ──────────────
UPDATE agentsam_ai
SET status = 'active',
    show_in_picker = 1,
    picker_eligible = 1,
    updated_at = unixepoch(),
    sort_order = CASE model_key
      WHEN '@cf/zai-org/glm-4.7-flash' THEN 301
      WHEN '@cf/ibm-granite/granite-4.0-h-micro' THEN 302
      WHEN '@cf/openai/gpt-oss-20b' THEN 310
      WHEN '@cf/qwen/qwen3-30b-a3b-fp8' THEN 311
      WHEN '@cf/mistralai/mistral-small-3.1-24b-instruct' THEN 312
      WHEN '@cf/qwen/qwen2.5-coder-32b-instruct' THEN 320
      WHEN '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b' THEN 321
      WHEN '@cf/qwen/qwq-32b' THEN 322
      ELSE sort_order
    END,
    picker_group = CASE model_key
      WHEN '@cf/zai-org/glm-4.7-flash' THEN 'Workers AI / Fast'
      WHEN '@cf/ibm-granite/granite-4.0-h-micro' THEN 'Workers AI / Router'
      WHEN '@cf/openai/gpt-oss-20b' THEN 'Workers AI / Fallback'
      WHEN '@cf/qwen/qwen3-30b-a3b-fp8' THEN 'Workers AI / Fallback'
      WHEN '@cf/mistralai/mistral-small-3.1-24b-instruct' THEN 'Workers AI / Efficient'
      WHEN '@cf/qwen/qwen2.5-coder-32b-instruct' THEN 'Workers AI / Code'
      WHEN '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b' THEN 'Workers AI / Reasoning'
      WHEN '@cf/qwen/qwq-32b' THEN 'Workers AI / Reasoning'
      ELSE picker_group
    END
WHERE mode = 'model'
  AND provider = 'workers_ai'
  AND model_key IN (
    '@cf/zai-org/glm-4.7-flash',
    '@cf/ibm-granite/granite-4.0-h-micro',
    '@cf/openai/gpt-oss-20b',
    '@cf/qwen/qwen3-30b-a3b-fp8',
    '@cf/mistralai/mistral-small-3.1-24b-instruct',
    '@cf/qwen/qwen2.5-coder-32b-instruct',
    '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
    '@cf/qwen/qwq-32b'
  );

-- ── 3) Tier 2 — heavy frontier lanes (comment out block to skip) ─────────────
UPDATE agentsam_ai
SET status = 'active',
    show_in_picker = 1,
    picker_eligible = 1,
    updated_at = unixepoch(),
    sort_order = CASE model_key
      WHEN '@cf/openai/gpt-oss-120b' THEN 340
      WHEN '@cf/meta/llama-3.3-70b-instruct-fp8-fast' THEN 341
      WHEN '@cf/meta/llama-4-scout-17b-16e-instruct' THEN 342
      WHEN '@cf/moonshotai/kimi-k2.6' THEN 343
      WHEN '@cf/nvidia/nemotron-3-120b-a12b' THEN 344
      ELSE sort_order
    END,
    picker_group = CASE model_key
      WHEN '@cf/openai/gpt-oss-120b' THEN 'Workers AI / Reasoning'
      WHEN '@cf/meta/llama-3.3-70b-instruct-fp8-fast' THEN 'Workers AI / Frontier'
      WHEN '@cf/meta/llama-4-scout-17b-16e-instruct' THEN 'Workers AI / Vision'
      WHEN '@cf/moonshotai/kimi-k2.6' THEN 'Workers AI / Frontier'
      WHEN '@cf/nvidia/nemotron-3-120b-a12b' THEN 'Workers AI / Frontier'
      ELSE picker_group
    END
WHERE mode = 'model'
  AND provider = 'workers_ai'
  AND model_key IN (
    '@cf/openai/gpt-oss-120b',
    '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    '@cf/meta/llama-4-scout-17b-16e-instruct',
    '@cf/moonshotai/kimi-k2.6',
    '@cf/nvidia/nemotron-3-120b-a12b'
  );

-- ── 4) Catalog hygiene — confirm active bindings + ExecOS routing hints ─────
UPDATE agentsam_model_catalog
SET is_active = 1,
    is_degraded = 0,
    degraded_reason = NULL,
    updated_at = unixepoch()
WHERE provider = 'workers_ai'
  AND workers_ai_model_id IS NOT NULL
  AND workers_ai_model_id IN (
    '@cf/baai/bge-large-en-v1.5',
    '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
    '@cf/google/gemma-4-26b-a4b-it',
    '@cf/ibm-granite/granite-4.0-h-micro',
    '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    '@cf/meta/llama-4-scout-17b-16e-instruct',
    '@cf/minimax/m3',
    '@cf/mistralai/mistral-small-3.1-24b-instruct',
    '@cf/moonshotai/kimi-k2.6',
    '@cf/nvidia/nemotron-3-120b-a12b',
    '@cf/openai/gpt-oss-120b',
    '@cf/openai/gpt-oss-20b',
    '@cf/qwen/qwen2.5-coder-32b-instruct',
    '@cf/qwen/qwen3-30b-a3b-fp8',
    '@cf/qwen/qwq-32b',
    '@cf/zai-org/glm-4.7-flash'
  );

UPDATE agentsam_model_catalog
SET cost_notes = 'role=execos_fallback_primary;p=930|643 picker active.'
WHERE model_key = '@cf/zai-org/glm-4.7-flash';

UPDATE agentsam_model_catalog
SET cost_notes = 'role=embedding_primary;p=995|643 picker active;768/1024 vector lane.'
WHERE model_key = '@cf/baai/bge-large-en-v1.5';

-- ── 5) Keep deprecated CF llama 3.1 rows off picker (640 guardrail) ─────────
UPDATE agentsam_ai
SET status = 'deprecated',
    show_in_picker = 0,
    picker_eligible = 0,
    updated_at = unixepoch()
WHERE provider = 'workers_ai'
  AND model_key IN (
    SELECT model_key FROM agentsam_model_catalog
    WHERE workers_ai_model_id IN (
      '@cf/meta/llama-3.1-8b-instruct',
      '@cf/meta/llama-3.1-8b-instruct-fp8',
      '@cf/meta/llama-3-8b-instruct'
    )
  );
