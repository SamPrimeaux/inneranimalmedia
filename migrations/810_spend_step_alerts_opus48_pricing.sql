-- Spend stabilization: $1 step alerts + Opus 4.8 pricing row.
-- Auto routing skips Opus in resolveModel.js (explicit picker still allowed).

INSERT INTO agentsam_model_pricing (
  id, provider, model_key, pricing_kind, currency,
  input_rate_per_mtok, output_rate_per_mtok,
  is_active, source_label, notes, created_at, updated_at
)
SELECT
  'amp_claude_opus_4_8',
  'anthropic',
  'claude-opus-4-8',
  'standard',
  'USD',
  COALESCE(
    (SELECT input_rate_per_mtok FROM agentsam_model_pricing
      WHERE model_key IN ('claude-opus-4-7', 'claude-opus-4-6') AND is_active = 1
      ORDER BY model_key DESC LIMIT 1),
    15.0
  ),
  COALESCE(
    (SELECT output_rate_per_mtok FROM agentsam_model_pricing
      WHERE model_key IN ('claude-opus-4-7', 'claude-opus-4-6') AND is_active = 1
      ORDER BY model_key DESC LIMIT 1),
    75.0
  ),
  1,
  'migration_810',
  'Opus 4.8 pricing for agentsam_usage_events cost capture',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM agentsam_model_pricing WHERE model_key = 'claude-opus-4-8' AND provider = 'anthropic'
);

-- Seed $1-every daily spend alert when none configured for platform workspace.
UPDATE workspace_limits
SET
  limits_json = json_set(
    COALESCE(NULLIF(TRIM(limits_json), ''), '{}'),
    '$.spend_alerts',
    json('[
      {
        "id": "iam_daily_every_1usd",
        "enabled": true,
        "every_usd": 1,
        "period": "daily",
        "severity": "warning",
        "action": "warn",
        "notify_email": "sam@inneranimalmedia.com",
        "notify_via": ["email"],
        "label": "IAM daily spend +$1"
      }
    ]')
  ),
  updated_at = datetime('now')
WHERE workspace_id = 'ws_inneranimalmedia'
  AND (
    limits_json IS NULL
    OR TRIM(limits_json) = ''
    OR json_extract(limits_json, '$.spend_alerts') IS NULL
    OR json_array_length(json_extract(limits_json, '$.spend_alerts')) = 0
  );

UPDATE agentsam_user_policy
SET
  max_cost_per_call_usd = CASE
    WHEN max_cost_per_call_usd IS NULL OR max_cost_per_call_usd > 5 THEN 2.0
    ELSE max_cost_per_call_usd
  END,
  max_cost_per_session_usd = CASE
    WHEN max_cost_per_session_usd IS NULL OR max_cost_per_session_usd > 50 THEN 25.0
    ELSE max_cost_per_session_usd
  END
WHERE user_id IN (
  SELECT id FROM auth_users WHERE lower(email) = 'sam@inneranimalmedia.com' LIMIT 1
);
