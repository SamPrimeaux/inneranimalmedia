-- Migration 156: Set canonical MCP health to healthy
-- Purpose: Mark inneranimalmedia-mcp healthy after successful auth/initialize checks
-- Date: 2026-03-19
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/156_mcp_health_status_healthy.sql

UPDATE mcp_services
SET
  health_status = 'healthy',
  last_health_check = unixepoch(),
  metadata = json_set(
    COALESCE(metadata, '{}'),
    '$.monitoring.last_health_check_method',
    'initialize+tools-list',
    '$.monitoring.last_health_error',
    NULL
  ),
  metadata_updated_at = unixepoch(),
  updated_at = unixepoch()
WHERE id = 'inneranimalmedia-mcp'
  AND endpoint_url = 'https://mcp.inneranimalmedia.com/mcp';

SELECT id, service_name, health_status, last_health_check, updated_at
FROM mcp_services
WHERE id = 'inneranimalmedia-mcp';
