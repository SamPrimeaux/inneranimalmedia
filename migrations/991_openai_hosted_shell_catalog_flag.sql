-- 991: OpenAI Responses hosted shell — catalog capability + feature flag (tkt_oai_hosted_shell)
-- Runtime gates on supports_hosted_shell + flag openai_hosted_shell (see src/core/openai-hosted-shell.js).
-- Never hardcode model ids in Worker JS — only this column (and cost_notes backup).
-- Hosted mode: environment.type=container_auto (OpenAI runs commands). Local shell executor is out of scope.
-- Network: default off (no network_policy). Org dashboard allowlist required before request allowlist domains.

ALTER TABLE agentsam_model_catalog ADD COLUMN supports_hosted_shell INTEGER NOT NULL DEFAULT 0;

-- GPT-5.2+ Responses models (OpenAI: shell trained for 5.2+; examples use 5.6).
UPDATE agentsam_model_catalog
SET supports_hosted_shell = 1,
    cost_notes = CASE
      WHEN cost_notes IS NULL OR trim(cost_notes) = '' THEN 'supports_hosted_shell=1'
      WHEN instr(cost_notes, 'supports_hosted_shell=') > 0 THEN cost_notes
      ELSE cost_notes || ';supports_hosted_shell=1'
    END,
    updated_at = unixepoch()
WHERE provider = 'openai'
  AND COALESCE(is_active, 0) = 1
  AND lower(COALESCE(api_platform, '')) IN ('openai_responses', 'responses')
  AND (
    lower(model_key) LIKE 'gpt-5.2%'
    OR lower(model_key) LIKE 'gpt-5.4%'
    OR lower(model_key) LIKE 'gpt-5.5%'
    OR lower(model_key) LIKE 'gpt-5.6%'
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

UPDATE agentsam_model_catalog
SET supports_hosted_shell = 0,
    updated_at = unixepoch()
WHERE provider = 'openai'
  AND (
    lower(model_key) IN ('gpt-5', 'gpt-5-mini', 'gpt-5-nano')
    OR lower(model_key) LIKE 'gpt-5.1%'
  );

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
  'openai_hosted_shell',
  'OpenAI Responses hosted shell (container_auto) — Sam soak; gated by agentsam_model_catalog.supports_hosted_shell. Hybrid: IAM terminal_* for platform/repo; hosted shell for isolated /mnt/data. No network_policy until org allowlist + config allowed_domains.',
  0,
  '["au_871d920d1233cbd1"]',
  0,
  'all',
  'boolean',
  'sam_primeaux',
  0,
  '{"depends_on":["tkt_repair_remote_terminal","openai_responses_ws","tkt_oai_apply_patch"],"tool_type":"shell","environment":"container_auto","capability_column":"supports_hosted_shell","allowed_domains":[],"hybrid":{"platform":"agentsam_terminal_remote","isolated":"openai_hosted_shell"}}'
);

UPDATE agentsam_feature_flag
SET description = 'OpenAI Responses hosted shell (container_auto) — Sam soak; gated by agentsam_model_catalog.supports_hosted_shell. Hybrid: IAM terminal_* for platform/repo; hosted shell for isolated /mnt/data. No network_policy until org allowlist + config allowed_domains.',
    enabled_for_users = '["au_871d920d1233cbd1"]',
    config_json = '{"depends_on":["tkt_repair_remote_terminal","openai_responses_ws","tkt_oai_apply_patch"],"tool_type":"shell","environment":"container_auto","capability_column":"supports_hosted_shell","allowed_domains":[],"hybrid":{"platform":"agentsam_terminal_remote","isolated":"openai_hosted_shell"}}'
WHERE flag_key = 'openai_hosted_shell';
