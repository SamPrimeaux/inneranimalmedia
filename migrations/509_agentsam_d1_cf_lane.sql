-- 509: Cloudflare D1 tools use handler_type=cf (not a separate d1 lane).
-- Supersedes migration 506 D1 handler_type section.
--
-- Policy: anything that is a Cloudflare account operation (D1, R2, KV, …) is handler_type cf;
-- handler_config.operation uses d1.query | d1.write | d1.migrate with provider=cloudflare.
--
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml \
--     --file=migrations/509_agentsam_d1_cf_lane.sql

UPDATE agentsam_tools
SET handler_type = 'cf',
    handler_config = '{"operation":"d1.query","auth_source":"workspace","provider":"cloudflare","resource":"d1"}',
    updated_at = unixepoch()
WHERE tool_key IN ('agentsam_d1_query', 'd1_query');

UPDATE agentsam_tools
SET handler_type = 'cf',
    handler_config = '{"operation":"d1.write","auth_source":"workspace","provider":"cloudflare","resource":"d1"}',
    updated_at = unixepoch()
WHERE tool_key IN ('agentsam_d1_write', 'd1_write');

UPDATE agentsam_tools
SET handler_type = 'cf',
    handler_config = '{"operation":"d1.migrate","auth_source":"workspace","provider":"cloudflare","resource":"d1"}',
    updated_at = unixepoch()
WHERE tool_key IN ('agentsam_d1_migrate', 'd1_migrations_draft', 'wrangler_d1_migrate');

-- Any remaining active rows still on legacy d1 handler_type
UPDATE agentsam_tools
SET handler_type = 'cf',
    handler_config = json_set(
      COALESCE(handler_config, '{}'),
      '$.resource', 'd1',
      '$.provider', 'cloudflare',
      '$.auth_source', COALESCE(json_extract(handler_config, '$.auth_source'), 'workspace')
    ),
    updated_at = unixepoch()
WHERE handler_type = 'd1'
  AND COALESCE(is_active, 1) = 1;
