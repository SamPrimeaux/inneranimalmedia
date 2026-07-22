-- 992: OpenAI Realtime voice — catalog capability + feature flag (tkt_oai_realtime_secret)
-- Runtime gates on supports_realtime + flag openai_realtime_voice (fail-closed).
-- Never hardcode model ids in Worker JS — catalog column is SSOT.
-- Meet/RealtimeKit: unchanged. This is the Agent Sam Voice lane only.

-- ── 1. Catalog capability column ──────────────────────────────────────────────
ALTER TABLE agentsam_model_catalog ADD COLUMN supports_realtime INTEGER NOT NULL DEFAULT 0;

-- Ensure default realtime model exists so pattern seed has a row (catalog SSOT).
INSERT INTO agentsam_model_catalog (
  id, model_key, display_name, provider, tier, openai_model_id, api_platform,
  routing_lane, context_window, max_output_tokens,
  cost_per_1k_in, cost_per_1k_out, supports_tools, supports_vision,
  supports_streaming, supports_json_mode, supports_reasoning, supports_realtime,
  cost_notes, is_active, updated_at
) VALUES (
  'mdl_gpt4o_realtime_preview',
  'gpt-4o-realtime-preview',
  'GPT-4o Realtime Preview',
  'openai', 'power', 'gpt-4o-realtime-preview', 'openai_realtime',
  'voice', 128000, 4096, 0.005, 0.02, 1, 0, 1, 0, 0, 1,
  'supports_realtime=1', 1, unixepoch()
)
ON CONFLICT(model_key) DO UPDATE SET
  openai_model_id = excluded.openai_model_id,
  api_platform = excluded.api_platform,
  routing_lane = excluded.routing_lane,
  supports_realtime = 1,
  is_active = 1,
  cost_notes = CASE
    WHEN cost_notes IS NULL OR trim(cost_notes) = '' THEN 'supports_realtime=1'
    WHEN instr(cost_notes, 'supports_realtime=') > 0 THEN cost_notes
    ELSE cost_notes || ';supports_realtime=1'
  END,
  updated_at = unixepoch();

-- Seed: gpt-4o-realtime-preview and any future gpt-*-realtime-* family rows.
-- Uses model_key pattern match; never hardcodes provider_model_id here.
UPDATE agentsam_model_catalog
SET supports_realtime = 1,
    cost_notes = CASE
      WHEN cost_notes IS NULL OR trim(cost_notes) = '' THEN 'supports_realtime=1'
      WHEN instr(cost_notes, 'supports_realtime=') > 0 THEN cost_notes
      ELSE cost_notes || ';supports_realtime=1'
    END,
    updated_at = unixepoch()
WHERE provider = 'openai'
  AND COALESCE(is_active, 0) = 1
  AND (
    lower(model_key) LIKE '%realtime%'
    OR lower(COALESCE(openai_model_id, '')) LIKE '%realtime%'
  );

-- Explicit off for non-realtime rows that might pattern-match otherwise (safety net).
UPDATE agentsam_model_catalog
SET supports_realtime = 0,
    updated_at = unixepoch()
WHERE provider = 'openai'
  AND COALESCE(is_active, 0) = 1
  AND supports_realtime = 1
  AND (
    lower(model_key) LIKE '%transcribe%'
    OR lower(model_key) LIKE '%embedding%'
    OR lower(model_key) LIKE '%tts%'
    OR lower(model_key) LIKE '%whisper%'
    OR lower(model_key) LIKE '%image%'
  );

-- ── 2. Feature flag ────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO agentsam_feature_flag (
  flag_key,
  description,
  enabled_globally,
  enabled_for_users,
  rollout_pct,
  environment,
  flag_type,
  created_by,
  is_archived,
  config_json
) VALUES (
  'openai_realtime_voice',
  'OpenAI Realtime voice (Agent Sam Voice lane) — Sam soak; gated by agentsam_model_catalog.supports_realtime. Meet/RealtimeKit unchanged.',
  0,
  '["au_871d920d1233cbd1"]',
  0,
  'all',
  'boolean',
  'sam_primeaux',
  0,
  '{"capability_column":"supports_realtime","lane":"agent_sam_voice","meet_engine":"realtimekit_unchanged","default_model":"gpt-4o-realtime-preview","default_voice":"alloy","reasoning_effort":"low"}'
);

-- Upsert in case the flag was pre-inserted manually.
UPDATE agentsam_feature_flag
SET description         = 'OpenAI Realtime voice (Agent Sam Voice lane) — Sam soak; gated by agentsam_model_catalog.supports_realtime. Meet/RealtimeKit unchanged.',
    enabled_for_users   = '["au_871d920d1233cbd1"]',
    config_json         = '{"capability_column":"supports_realtime","lane":"agent_sam_voice","meet_engine":"realtimekit_unchanged","default_model":"gpt-4o-realtime-preview","default_voice":"alloy","reasoning_effort":"low"}'
WHERE flag_key = 'openai_realtime_voice';
