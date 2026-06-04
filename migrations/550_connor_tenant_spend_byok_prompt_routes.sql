-- Connor tenant: BYOK-only spend caps (meta_json + settings).
-- Prompt routes: see 551_connor_prompt_routes_tenant_unique.sql (route_key was globally UNIQUE).

UPDATE tenants
SET
  meta_json = json_patch(COALESCE(meta_json, '{}'), json('{
    "spend_cap": {
      "daily_usd": 1.00,
      "monthly_usd": 10.00,
      "hard_stop": true,
      "byok_required": true,
      "note": "BYOK required — no platform API keys until Connor adds his own",
      "updated_at": "2026-06-03"
    }
  }')),
  settings = json_patch(COALESCE(settings, '{}'), json('{
    "byok_required": true,
    "byok_status": "pending",
    "max_model_tier": "mini",
    "spend_cap_daily_usd": 1.00,
    "spend_cap_monthly_usd": 10.00,
    "spend_hard_stop": true
  }')),
  updated_at = unixepoch()
WHERE id = 'tenant_connor_mcneely';
