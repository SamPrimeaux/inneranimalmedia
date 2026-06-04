-- Connor: $5 total platform AI/API allowance (not $5/day). After exhausted → BYOK required.
-- Safe to re-run.

UPDATE tenants
SET
  meta_json = json_patch(COALESCE(meta_json, '{}'), json('{
    "spend_cap": {
      "platform_total_usd": 5.00,
      "hard_stop": true,
      "require_byok_after_exhausted": true,
      "allow_platform_fallback": false,
      "max_model_tier": 2,
      "note": "$5 lifetime platform AI allowance — then BYOK required to continue",
      "updated_at": "2026-06-03"
    }
  }')),
  settings = json_patch(COALESCE(settings, '{}'), json('{
    "byok_required": false,
    "byok_required_after_allowance": true,
    "byok_status": "pending",
    "platform_allowance_usd": 5.00,
    "max_model_tier": "mini",
    "spend_hard_stop": true,
    "allow_platform_fallback": false
  }')),
  updated_at = unixepoch()
WHERE id = 'tenant_connor_mcneely';

UPDATE workspace_limits
SET
  max_daily_cost_usd = 50.0,
  limits_json = '{
    "platform_total_cap_usd": 5.00,
    "byok_required_after_allowance": true,
    "allow_platform_fallback": false,
    "spend_alerts": [
      {
        "id": "salert_connor_total_warn",
        "label": "Connor platform $3 of $5 used",
        "threshold_usd": 3.00,
        "period": "total",
        "notify_via": ["email"],
        "severity": "warning",
        "enabled": true,
        "notify_email": "sam@inneranimalmedia.com"
      },
      {
        "id": "salert_connor_total_hard",
        "label": "Connor platform $5 allowance exhausted — BYOK required",
        "threshold_usd": 5.00,
        "period": "total",
        "notify_via": ["email"],
        "severity": "critical",
        "action": "require_byok",
        "enabled": true,
        "notify_email": "sam@inneranimalmedia.com"
      }
    ]
  }',
  updated_at = unixepoch()
WHERE workspace_id = 'ws_connor_mcneely';

UPDATE workspace_limits
SET
  max_daily_cost_usd = 50.0,
  limits_json = '{
    "platform_total_cap_usd": 5.00,
    "byok_required_after_allowance": true,
    "allow_platform_fallback": false,
    "can_run_pty": false,
    "tool_risk_level_max": "low",
    "spend_alerts": [
      {
        "id": "salert_connor_playground_total_warn",
        "label": "Connor playground approaching shared $5 platform cap",
        "threshold_usd": 4.00,
        "period": "total",
        "notify_via": ["email"],
        "severity": "warning",
        "enabled": true,
        "notify_email": "sam@inneranimalmedia.com"
      }
    ]
  }',
  updated_at = unixepoch()
WHERE workspace_id = 'ws_connor_playground';

UPDATE billing_plans
SET features_json = '{
    "can_run_pty": false,
    "max_model_tier": 2,
    "allow_platform_fallback": false,
    "allow_subagent_spawn": false,
    "tool_risk_level_max": "medium",
    "platform_allowance_usd": 5.00,
    "note": "Collaborator BYOK plan. $5 total platform AI allowance then BYOK required."
  }',
  updated_at = datetime('now')
WHERE id = 'byok_only';
