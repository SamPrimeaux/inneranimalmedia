-- 821: Anthropic catalog corrections (2026-07-11 handoff)
-- Pin Sonnet 5 dated API id; adaptive thinking; retire Opus 4.7 (removed 2026-07-24).
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/821_anthropic_sonnet5_pin_opus47_retire.sql

UPDATE agentsam_model_catalog SET
  anthropic_model_id = 'claude-sonnet-5-20260630',
  thinking_policy = 'adaptive',
  supports_reasoning = 1,
  supports_adaptive_thinking = 1,
  supports_effort_scaling = 1,
  updated_at = unixepoch()
WHERE model_key = 'claude-sonnet-5';

UPDATE agentsam_model_catalog SET
  is_active = 0,
  is_degraded = 1,
  degraded_reason = 'opus_4_7_removed_2026-07-24_prefer_opus_4_8',
  deprecated_after = '2026-07-24',
  cost_notes = TRIM(COALESCE(cost_notes, '') || ' | RETIRE 2026-07-24 — prefer claude-opus-4-8 (fast mode 2x not 6x)'),
  updated_at = unixepoch()
WHERE model_key = 'claude-opus-4-7';

UPDATE agentsam_routing_arms SET
  is_active = 0,
  is_paused = 1,
  pause_reason = 'opus_4_7_catalog_retired_2026-07-24',
  updated_at = unixepoch()
WHERE model_key = 'claude-opus-4-7';
