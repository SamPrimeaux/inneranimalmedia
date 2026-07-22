-- 990: OpenAI hosted apply_patch — catalog capability + feature flag (tkt_oai_apply_patch)
-- Runtime gates on supports_apply_patch + flag openai_apply_patch (never src/core/openai-apply-patch.js).
-- Never hardcode model ids in Worker JS — only this column (and cost_notes backup).

ALTER TABLE agentsam_model_catalog ADD COLUMN supports_apply_patch INTEGER NOT NULL DEFAULT 0;

-- Seed GPT-5.1+ OpenAI Responses families present in catalog (OpenAI docs: 5.1 / 5.2 / 5.4 / 5.5; 5.6 used in examples).
UPDATE agentsam_model_catalog
SET supports_apply_patch = 1,
    cost_notes = CASE
      WHEN cost_notes IS NULL OR trim(cost_notes) = '' THEN 'supports_apply_patch=1'
      WHEN instr(cost_notes, 'supports_apply_patch=') > 0 THEN cost_notes
      ELSE cost_notes || ';supports_apply_patch=1'
    END,
    updated_at = unixepoch()
WHERE provider = 'openai'
  AND COALESCE(is_active, 0) = 1
  AND lower(COALESCE(api_platform, '')) IN ('openai_responses', 'responses')
  AND (
    lower(model_key) LIKE 'gpt-5.1%'
    OR lower(model_key) LIKE 'gpt-5.2%'
    OR lower(model_key) LIKE 'gpt-5.4%'
    OR lower(model_key) LIKE 'gpt-5.5%'
    OR lower(model_key) LIKE 'gpt-5.6%'
    OR lower(COALESCE(openai_model_id, '')) LIKE 'gpt-5.1%'
    OR lower(COALESCE(openai_model_id, '')) LIKE 'gpt-5.2%'
    OR lower(COALESCE(openai_model_id, '')) LIKE 'gpt-5.4%'
    OR lower(COALESCE(openai_model_id, '')) LIKE 'gpt-5.5%'
    OR lower(COALESCE(openai_model_id, '')) LIKE 'gpt-5.6%'
  )
  AND lower(model_key) NOT LIKE '%transcribe%'
  AND lower(model_key) NOT LIKE '%image%'
  AND lower(model_key) NOT LIKE '%embedding%'
  AND lower(model_key) NOT LIKE '%tts%'
  AND lower(model_key) NOT LIKE '%whisper%';

-- Explicit off for pre-5.1 GPT-5 base / mini / nano (Responses but not apply_patch per OpenAI).
UPDATE agentsam_model_catalog
SET supports_apply_patch = 0,
    updated_at = unixepoch()
WHERE provider = 'openai'
  AND lower(model_key) IN ('gpt-5', 'gpt-5-mini', 'gpt-5-nano');

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
  'openai_apply_patch',
  'OpenAI Responses hosted apply_patch — Sam soak; gated by agentsam_model_catalog.supports_apply_patch',
  0,
  '["au_871d920d1233cbd1"]',
  0,
  'all',
  'boolean',
  'sam_primeaux',
  0,
  '{"depends_on":["tkt_repair_remote_terminal","openai_responses_ws"],"tool_type":"apply_patch","fallback_tools":["fs_edit_file","fs_write_file"],"capability_column":"supports_apply_patch"}'
);

UPDATE agentsam_feature_flag
SET description = 'OpenAI Responses hosted apply_patch — Sam soak; gated by agentsam_model_catalog.supports_apply_patch',
    enabled_for_users = '["au_871d920d1233cbd1"]',
    config_json = '{"depends_on":["tkt_repair_remote_terminal","openai_responses_ws"],"tool_type":"apply_patch","fallback_tools":["fs_edit_file","fs_write_file"],"capability_column":"supports_apply_patch"}'
WHERE flag_key = 'openai_apply_patch';
