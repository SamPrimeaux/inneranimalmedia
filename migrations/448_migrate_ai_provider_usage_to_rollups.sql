-- 448: Deprecate ai_provider_usage — canonical daily rollup is agentsam_usage_rollups_daily.
-- Runtime: src/core/agentsam-usage-rollups-daily.js (writeTelemetry increment).
--
-- Apply (direct file — avoids wrangler migrations backlog):
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/448_migrate_ai_provider_usage_to_rollups.sql
--
-- Tracking for 446/447: scripts/sql/d1_migrations_stub_446_447.sql (manual prod drops).

-- Backfill historical provider/day rows into a platform rollup bucket (does not overwrite live telemetry rows).
INSERT OR IGNORE INTO agentsam_usage_rollups_daily (
  tenant_id,
  workspace_id,
  day,
  ai_calls,
  tokens_in,
  tokens_out,
  cost_usd,
  provider_breakdown_json,
  rollup_source,
  rolled_up_at
)
SELECT
  'migrated_ai_provider_usage',
  'platform',
  u.date,
  COALESCE(SUM(u.requests), 0),
  COALESCE(SUM(u.tokens_input), 0),
  COALESCE(SUM(u.tokens_output), 0),
  COALESCE(SUM(u.cost_usd), 0),
  COALESCE(
    (
      SELECT json_group_object(
        provider,
        json_object(
          'requests', requests,
          'tokens_in', tokens_input,
          'tokens_out', tokens_output,
          'cost_usd', cost_usd
        )
      )
      FROM ai_provider_usage sub
      WHERE sub.date = u.date
    ),
    '{}'
  ),
  'migration_448_ai_provider_usage',
  unixepoch()
FROM ai_provider_usage u
WHERE u.date IS NOT NULL AND trim(u.date) != ''
GROUP BY u.date;
