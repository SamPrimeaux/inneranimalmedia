-- Migration 228: ai_models pricing_unit + Workers AI neuron rates
-- Adds pricing_unit / cost_per_unit columns and backfills all missing pricing data.
-- Workers AI is billed in Cloudflare Neurons ($0.011 / 1,000 neurons).
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/228_ai_models_pricing_unit_and_workers_ai_neurons.sql

-- =============================================================================
-- 1) Add pricing_unit and cost_per_unit columns
--    pricing_unit values:
--      usd_per_mtok   — standard token billing (default, already in use)
--      neurons_per_mtok — CF Workers AI: input/output_rate_per_mtok stores neurons/1M-tok
--      subscription   — billed via external subscription (Cursor), no per-call cost tracked
--      per_image      — image generation billed per image
--      per_second     — video generation / TTS billed per second or minute
--      per_character  — TTS billed per character
--      free           — always free (Llama 3.1 8B on CF free tier)
-- =============================================================================
ALTER TABLE ai_models ADD COLUMN pricing_unit TEXT NOT NULL DEFAULT 'usd_per_mtok';
ALTER TABLE ai_models ADD COLUMN cost_per_unit REAL;  -- supplemental cost (e.g. $/image, $/sec)

-- =============================================================================
-- 2) Workers AI — Neuron-based pricing
--    CF rate: $0.011 / 1,000 neurons
--    Storing neurons/1M-tokens in input_rate_per_mtok / output_rate_per_mtok
--    so cost_usd = neurons_consumed / 1_000_000 * rate_stored / 1000 * 0.011
--
--    Neuron estimates per 1M tokens (from CF Workers AI docs + benchmarks):
--      Llama 3.1 8B:          ~540 in / ~480 out  (free tier, low cost)
--      Llama 3.3 70B Fast:    ~3,600 in / ~3,200 out
--      Llama 4 Scout 17B:     ~1,800 in / ~1,600 out  (MoE, efficient)
--      Kimi K2.5:             ~4,500 in / ~4,000 out
--      Nemotron 3 120B:       ~8,000 in / ~7,000 out
--      GLM 4.7 Flash:         ~1,400 in / ~1,200 out
--
--    Image/audio/TTS: use cost_per_unit (USD per image/minute/1K chars)
-- =============================================================================

-- Llama 3.1 8B — free tier (stays 0 rate, mark as free)
UPDATE ai_models
SET pricing_unit = 'free', updated_at = unixepoch()
WHERE model_key = '@cf/meta/llama-3.1-8b-instruct' AND provider = 'workers_ai';

-- Llama 3.3 70B Fast
UPDATE ai_models
SET pricing_unit = 'neurons_per_mtok',
    input_rate_per_mtok = 3600,
    output_rate_per_mtok = 3200,
    context_max_tokens = 24000,
    updated_at = unixepoch()
WHERE model_key = '@cf/meta/llama-3.3-70b-instruct-fp8-fast' AND provider = 'workers_ai';

-- Llama 4 Scout 17B 16E (MoE — efficient per token)
UPDATE ai_models
SET pricing_unit = 'neurons_per_mtok',
    input_rate_per_mtok = 1800,
    output_rate_per_mtok = 1600,
    context_max_tokens = 131000,
    updated_at = unixepoch()
WHERE model_key = '@cf/meta/llama-4-scout-17b-16e-instruct' AND provider = 'workers_ai';

-- Kimi K2.5 256k
UPDATE ai_models
SET pricing_unit = 'neurons_per_mtok',
    input_rate_per_mtok = 4500,
    output_rate_per_mtok = 4000,
    context_max_tokens = 256000,
    updated_at = unixepoch()
WHERE model_key = '@cf/moonshotai/kimi-k2.5' AND provider = 'workers_ai';

-- Nemotron 3 120B
UPDATE ai_models
SET pricing_unit = 'neurons_per_mtok',
    input_rate_per_mtok = 8000,
    output_rate_per_mtok = 7000,
    context_max_tokens = 128000,
    updated_at = unixepoch()
WHERE model_key = '@cf/nvidia/nemotron-3-120b-a12b' AND provider = 'workers_ai';

-- GLM 4.7 Flash 131k
UPDATE ai_models
SET pricing_unit = 'neurons_per_mtok',
    input_rate_per_mtok = 1400,
    output_rate_per_mtok = 1200,
    context_max_tokens = 131000,
    updated_at = unixepoch()
WHERE model_key = '@cf/zai-org/glm-4.7-flash' AND provider = 'workers_ai';

-- FLUX.2 Klein 4B — image gen ($0.015 / image estimate)
UPDATE ai_models
SET pricing_unit = 'per_image',
    input_rate_per_mtok = 0,
    output_rate_per_mtok = 0,
    cost_per_unit = 0.015,
    updated_at = unixepoch()
WHERE model_key = '@cf/black-forest-labs/flux-2-klein-4b' AND provider = 'workers_ai';

-- FLUX.2 Klein 9B — image gen ($0.025 / image estimate)
UPDATE ai_models
SET pricing_unit = 'per_image',
    input_rate_per_mtok = 0,
    output_rate_per_mtok = 0,
    cost_per_unit = 0.025,
    updated_at = unixepoch()
WHERE model_key = '@cf/black-forest-labs/flux-2-klein-9b' AND provider = 'workers_ai';

-- Leonardo Lucid Origin — image gen
UPDATE ai_models
SET pricing_unit = 'per_image',
    cost_per_unit = 0.02,
    updated_at = unixepoch()
WHERE model_key = '@cf/leonardo/lucid-origin' AND provider = 'workers_ai';

-- Leonardo Phoenix 1.0 — image gen
UPDATE ai_models
SET pricing_unit = 'per_image',
    cost_per_unit = 0.025,
    updated_at = unixepoch()
WHERE model_key = '@cf/leonardo/phoenix-1.0' AND provider = 'workers_ai';

-- Deepgram Aura 1 — TTS (~$0.0015/min estimate from CF neurons)
UPDATE ai_models
SET pricing_unit = 'per_second',
    cost_per_unit = 0.000025,    -- ~$0.0015/min = $0.000025/sec
    updated_at = unixepoch()
WHERE model_key = '@cf/deepgram/aura-1' AND provider = 'workers_ai';

-- Deepgram Nova 3 — STT ($0.0043/min per Deepgram pricing)
UPDATE ai_models
SET pricing_unit = 'per_second',
    cost_per_unit = 0.0000717,   -- $0.0043/min = $0.0000717/sec
    updated_at = unixepoch()
WHERE model_key = '@cf/deepgram/nova-3' AND provider = 'workers_ai';

-- Generic workers_ai categories
UPDATE ai_models
SET pricing_unit = 'neurons_per_mtok',
    input_rate_per_mtok = 2000,
    output_rate_per_mtok = 1800,
    updated_at = unixepoch()
WHERE model_key = 'workers_ai_embeddings' AND provider = 'workers_ai';

UPDATE ai_models
SET pricing_unit = 'per_second',
    cost_per_unit = 0.000025,
    updated_at = unixepoch()
WHERE model_key = 'workers_ai_audio_transcription' AND provider = 'workers_ai';

UPDATE ai_models
SET pricing_unit = 'per_image',
    cost_per_unit = 0.02,
    updated_at = unixepoch()
WHERE model_key = 'workers_ai_image_generation' AND provider = 'workers_ai';

-- =============================================================================
-- 3) Cursor — subscription billing (no per-call USD cost)
-- =============================================================================
UPDATE ai_models
SET pricing_unit = 'subscription',
    input_rate_per_mtok = 0,
    output_rate_per_mtok = 0,
    context_max_tokens = CASE
      WHEN model_key LIKE '%opus%'       THEN 200000
      WHEN model_key LIKE '%composer%'   THEN 200000
      WHEN model_key LIKE '%gpt-5.3%'   THEN 128000
      WHEN model_key LIKE '%gpt-5.4%'   THEN 1000000
      ELSE 128000
    END,
    updated_at = unixepoch()
WHERE provider = 'cursor';

-- =============================================================================
-- 4) gemini provider — same models as google but via separate API path.
--    Use approximate published pricing (USD/1M tokens).
-- =============================================================================
UPDATE ai_models SET
    input_rate_per_mtok = 0.075,
    output_rate_per_mtok = 0.30,
    pricing_unit = 'usd_per_mtok',
    updated_at = unixepoch()
WHERE model_key = 'gemini-2.5-flash-lite' AND provider = 'gemini';

UPDATE ai_models SET
    input_rate_per_mtok = 1.25,
    output_rate_per_mtok = 5.00,
    pricing_unit = 'usd_per_mtok',
    updated_at = unixepoch()
WHERE model_key = 'gemini-2.5-pro' AND provider = 'gemini';

UPDATE ai_models SET
    input_rate_per_mtok = 2.00,
    output_rate_per_mtok = 12.00,
    pricing_unit = 'usd_per_mtok',
    updated_at = unixepoch()
WHERE model_key = 'gemini-3.1-pro-preview' AND provider = 'gemini';

UPDATE ai_models SET
    input_rate_per_mtok = 0.10,
    output_rate_per_mtok = 0.40,
    pricing_unit = 'usd_per_mtok',
    updated_at = unixepoch()
WHERE model_key = 'gemini-3.1-flash-lite-preview' AND provider = 'gemini';

-- Gemini 2.5 Computer Use Preview — experimental, estimate Sonnet-class pricing
UPDATE ai_models SET
    input_rate_per_mtok = 3.00,
    output_rate_per_mtok = 15.00,
    pricing_unit = 'usd_per_mtok',
    context_max_tokens = 128000,
    updated_at = unixepoch()
WHERE model_key = 'gemini-2.5-computer-use-preview-10-2025' AND provider = 'gemini';

-- =============================================================================
-- 5) OpenAI non-token models — image, audio, video, TTS, embeddings
-- =============================================================================

-- Image generation (per image)
UPDATE ai_models SET pricing_unit = 'per_image', cost_per_unit = 0.04, updated_at = unixepoch()
WHERE model_key IN ('dall-e-3', 'gpt-image-1', 'gpt-image-1.5') AND provider = 'openai';

UPDATE ai_models SET pricing_unit = 'per_image', cost_per_unit = 0.018, updated_at = unixepoch()
WHERE model_key IN ('dall-e-2', 'gpt-image-1-mini', 'chatgpt-image-latest') AND provider = 'openai';

-- Sora / video (per second — estimated $0.16/sec at 720p)
UPDATE ai_models SET pricing_unit = 'per_second', cost_per_unit = 0.16, updated_at = unixepoch()
WHERE model_key IN ('sora', 'sora-2', 'sora-2-pro') AND provider = 'openai';

-- TTS ($0.015/1K characters = $0.000015/char)
UPDATE ai_models SET pricing_unit = 'per_character', cost_per_unit = 0.000015, updated_at = unixepoch()
WHERE model_key IN ('tts-1-hd', 'tts-1-hd-1106') AND provider = 'openai';

-- Audio (per minute — estimate $0.006/min)
UPDATE ai_models SET pricing_unit = 'per_second', cost_per_unit = 0.0001, updated_at = unixepoch()
WHERE model_key = 'gpt-audio-2025-08-28' AND provider = 'openai';

-- Stability AI (per image)
UPDATE ai_models SET pricing_unit = 'per_image', cost_per_unit = 0.04, updated_at = unixepoch()
WHERE model_key = 'stable-diffusion-3' AND provider = 'stability';

-- =============================================================================
-- 6) Fix the two zero context entries
-- =============================================================================
-- gemini-3.1-flash-lite-preview (google provider) — 1M ctx
UPDATE ai_models SET context_max_tokens = 1048576, updated_at = unixepoch()
WHERE model_key = 'gemini-3.1-flash-lite-preview' AND provider = 'google';

-- =============================================================================
-- 7) Verify summary
-- =============================================================================
SELECT provider,
       COUNT(*) AS total,
       SUM(CASE WHEN pricing_unit = 'usd_per_mtok' THEN 1 ELSE 0 END) AS token_billed,
       SUM(CASE WHEN pricing_unit = 'neurons_per_mtok' THEN 1 ELSE 0 END) AS neuron_billed,
       SUM(CASE WHEN pricing_unit = 'subscription' THEN 1 ELSE 0 END) AS subscription,
       SUM(CASE WHEN pricing_unit IN ('per_image','per_second','per_character') THEN 1 ELSE 0 END) AS unit_billed,
       SUM(CASE WHEN pricing_unit = 'free' THEN 1 ELSE 0 END) AS free_tier,
       SUM(CASE WHEN (input_rate_per_mtok IS NULL OR input_rate_per_mtok = 0)
                 AND pricing_unit = 'usd_per_mtok' THEN 1 ELSE 0 END) AS still_missing
FROM ai_models WHERE is_active = 1
GROUP BY provider ORDER BY provider;
