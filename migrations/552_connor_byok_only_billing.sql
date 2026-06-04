-- =============================================================================
-- Migration 552: Connor McNeely — BYOK-only billing plan + spend caps
-- =============================================================================
-- Touches: billing_plans, billing_subscriptions, workspace_limits,
--          agentsam_user_policy, workspaces, agentsam_workspace, tenants
-- Safe to re-run (INSERT OR REPLACE / INSERT OR IGNORE / UPDATE WHERE)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. BILLING PLAN: byok_only
-- -----------------------------------------------------------------------------
INSERT OR REPLACE INTO billing_plans (
  id,
  name,
  display_name,
  tagline,
  stripe_price_id,
  monthly_token_limit,
  daily_request_limit,
  max_concurrency,
  allows_byok,
  allows_usage_billing,
  free_tier_models_json,
  billing_period,
  trial_days,
  sort_order,
  features_json,
  is_active
) VALUES (
  'byok_only',
  'byok_only',
  'BYOK Collaborator',
  'Bring your own keys — zero platform billing exposure',
  'stripe_price_byok_only',
  5000000,
  500,
  2,
  1,
  0,
  '[]',
  'monthly',
  0,
  20,
  '{
    "can_run_pty": false,
    "max_model_tier": 2,
    "allow_platform_fallback": false,
    "allow_subagent_spawn": false,
    "tool_risk_level_max": "medium",
    "note": "Collaborator BYOK plan. No platform key fallback. Free tier: Workers AI + nano only until BYOK connected."
  }',
  1
);

-- -----------------------------------------------------------------------------
-- 2. BILLING SUBSCRIPTION: assign Connor to byok_only plan
-- -----------------------------------------------------------------------------
INSERT OR REPLACE INTO billing_subscriptions (
  tenant_id,
  stripe_subscription_id,
  stripe_customer_id,
  plan_id,
  status,
  workspace_id,
  seats,
  billing_period,
  amount_cents,
  current_period_start,
  current_period_end
) VALUES (
  'tenant_connor_mcneely',
  'sub_byok_connor_mcneely',
  'cus_byok_connor_mcneely',
  'byok_only',
  'active',
  'ws_connor_mcneely',
  1,
  'monthly',
  0,
  date('now', 'start of month'),
  date('now', 'start of month', '+1 month', '-1 day')
);

-- -----------------------------------------------------------------------------
-- 3. WORKSPACE LIMITS: Connor primary workspace
-- -----------------------------------------------------------------------------
INSERT OR REPLACE INTO workspace_limits (
  workspace_id,
  max_daily_cost_usd,
  max_requests_per_min,
  limits_json,
  updated_at
) VALUES (
  'ws_connor_mcneely',
  5.00,
  60,
  '{
    "max_monthly_cost_usd": 50.00,
    "byok_required": true,
    "allow_platform_fallback": false,
    "spend_alerts": [
      {
        "id": "salert_connor_daily_warn",
        "label": "Connor daily $3 warning",
        "threshold_usd": 3.00,
        "period": "daily",
        "notify_via": ["email"],
        "severity": "warning",
        "enabled": true,
        "notify_email": "sam@inneranimalmedia.com"
      },
      {
        "id": "salert_connor_daily_hard",
        "label": "Connor daily $5 hard stop",
        "threshold_usd": 5.00,
        "period": "daily",
        "notify_via": ["email"],
        "severity": "critical",
        "action": "block",
        "enabled": true,
        "notify_email": "sam@inneranimalmedia.com"
      }
    ]
  }',
  unixepoch()
);

-- -----------------------------------------------------------------------------
-- 4. WORKSPACE LIMITS: playground
-- -----------------------------------------------------------------------------
INSERT OR IGNORE INTO workspace_limits (
  workspace_id,
  max_daily_cost_usd,
  max_requests_per_min,
  limits_json,
  updated_at
) VALUES (
  'ws_connor_playground',
  1.00,
  30,
  '{
    "max_monthly_cost_usd": 10.00,
    "byok_required": true,
    "allow_platform_fallback": false,
    "can_run_pty": false,
    "tool_risk_level_max": "low",
    "spend_alerts": [
      {
        "id": "salert_connor_playground_hard",
        "label": "Connor playground $1 hard stop",
        "threshold_usd": 1.00,
        "period": "daily",
        "notify_via": ["email"],
        "severity": "critical",
        "action": "block",
        "enabled": true,
        "notify_email": "sam@inneranimalmedia.com"
      }
    ]
  }',
  unixepoch()
);

-- If playground limits row already existed with defaults, tighten it.
UPDATE workspace_limits
SET
  max_daily_cost_usd = 1.00,
  max_requests_per_min = 30,
  limits_json = '{
    "max_monthly_cost_usd": 10.00,
    "byok_required": true,
    "allow_platform_fallback": false,
    "can_run_pty": false,
    "tool_risk_level_max": "low",
    "spend_alerts": [
      {
        "id": "salert_connor_playground_hard",
        "label": "Connor playground $1 hard stop",
        "threshold_usd": 1.00,
        "period": "daily",
        "notify_via": ["email"],
        "severity": "critical",
        "action": "block",
        "enabled": true,
        "notify_email": "sam@inneranimalmedia.com"
      }
    ]
  }',
  updated_at = unixepoch()
WHERE workspace_id = 'ws_connor_playground';

-- -----------------------------------------------------------------------------
-- 5. USER POLICY: Connor primary workspace
-- -----------------------------------------------------------------------------
INSERT OR REPLACE INTO agentsam_user_policy (
  user_id,
  workspace_id,
  tenant_id,
  allow_platform_fallback,
  max_cost_per_session_usd,
  max_cost_per_call_usd,
  allowed_model_tier_max,
  tool_risk_level_max,
  can_run_pty,
  terminal_ai_enabled,
  allow_subagent_spawn,
  max_spawn_depth,
  max_tool_chain_depth,
  require_allowlist_for_mcp,
  allow_fanout_execution,
  auto_run_mode,
  updated_at
) VALUES (
  'au_5d17673408aaebc7',
  'ws_connor_mcneely',
  'tenant_connor_mcneely',
  0,
  2.50,
  0.50,
  2,
  'medium',
  0,
  0,
  0,
  1,
  6,
  1,
  0,
  'allowlist',
  datetime('now')
);

-- -----------------------------------------------------------------------------
-- 6. USER POLICY: Connor playground
-- -----------------------------------------------------------------------------
INSERT OR REPLACE INTO agentsam_user_policy (
  user_id,
  workspace_id,
  tenant_id,
  allow_platform_fallback,
  max_cost_per_session_usd,
  max_cost_per_call_usd,
  allowed_model_tier_max,
  tool_risk_level_max,
  can_run_pty,
  terminal_ai_enabled,
  allow_subagent_spawn,
  max_spawn_depth,
  max_tool_chain_depth,
  require_allowlist_for_mcp,
  allow_fanout_execution,
  auto_run_mode,
  updated_at
) VALUES (
  'au_5d17673408aaebc7',
  'ws_connor_playground',
  'tenant_connor_mcneely',
  0,
  1.00,
  0.25,
  1,
  'low',
  0,
  0,
  0,
  0,
  4,
  1,
  0,
  'allowlist',
  datetime('now')
);

-- -----------------------------------------------------------------------------
-- 7. WORKSPACES: ensure ws_connor_playground anchor row (category NOT NULL)
-- -----------------------------------------------------------------------------
INSERT OR IGNORE INTO workspaces (
  id,
  tenant_id,
  name,
  slug,
  description,
  category,
  status,
  created_at,
  updated_at
) VALUES (
  'ws_connor_playground',
  'tenant_connor_mcneely',
  'Connor Playground',
  'connor-playground',
  'Low-risk sandbox workspace for Connor — no PTY, nano models only, $1/day cap',
  'client',
  'active',
  datetime('now'),
  datetime('now')
);

UPDATE workspaces
SET
  tenant_id = 'tenant_connor_mcneely',
  name = 'Connor Playground',
  slug = 'connor-playground',
  description = 'Low-risk sandbox workspace for Connor — no PTY, nano models only, $1/day cap',
  category = 'client',
  status = 'active',
  updated_at = datetime('now')
WHERE id = 'ws_connor_playground';

-- -----------------------------------------------------------------------------
-- 8. AGENTSAM_WORKSPACE: reactivate playground runtime profile
-- -----------------------------------------------------------------------------
INSERT OR REPLACE INTO agentsam_workspace (
  id,
  workspace_slug,
  tenant_id,
  name,
  description,
  r2_bucket,
  default_model_id,
  status,
  created_at,
  updated_at
) VALUES (
  'ws_connor_playground',
  'connor-playground',
  'tenant_connor_mcneely',
  'Connor Playground',
  'Low-risk sandbox — nano only, $1/day cap',
  'leadership-legacy',
  'wai-qwen-coder-32b',
  'active',
  unixepoch(),
  unixepoch()
);

-- -----------------------------------------------------------------------------
-- 9. TENANTS: spend cap flags (supersedes migration 550 $1/$10 with $5/$50)
-- -----------------------------------------------------------------------------
UPDATE tenants
SET
  meta_json = json_patch(COALESCE(meta_json, '{}'), json('{
    "spend_cap": {
      "daily_usd": 5.00,
      "monthly_usd": 50.00,
      "hard_stop": true,
      "byok_required": true,
      "allow_platform_fallback": false,
      "max_model_tier": 2,
      "note": "BYOK-only collaborator. No platform key fallback ever.",
      "updated_at": "2026-06-03"
    }
  }')),
  settings = json_patch(COALESCE(settings, '{}'), json('{
    "byok_required": true,
    "byok_status": "pending",
    "max_model_tier": "mini",
    "spend_cap_daily_usd": 5.00,
    "spend_cap_monthly_usd": 50.00,
    "spend_hard_stop": true,
    "allow_platform_fallback": false
  }')),
  updated_at = unixepoch()
WHERE id = 'tenant_connor_mcneely';
