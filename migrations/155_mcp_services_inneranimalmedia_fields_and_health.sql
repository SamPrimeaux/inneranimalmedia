-- Migration 155: Fill canonical MCP service fields + health metadata
-- Purpose: Configure inneranimalmedia-mcp with worker/buckets/hyperdrive/role/client access and monitoring metadata
-- Date: 2026-03-19
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/155_mcp_services_inneranimalmedia_fields_and_health.sql

-- 1) Create dedicated role for MCP service ownership/routing
INSERT OR IGNORE INTO agent_roles (
  id,
  name,
  purpose,
  agent_id,
  agent_type,
  tier,
  scope,
  mcp_service_id,
  is_active,
  is_admin,
  description,
  created_at,
  updated_at
) VALUES (
  'ar_inneranimalmedia_mcp_orchestrator_v1',
  'role_inneranimalmedia_mcp_orchestrator',
  'Own and orchestrate canonical MCP service execution, routing, and health verification.',
  'agent_sam_primeaux_admin',
  'mcp_gateway',
  'platform',
  'single_tenant',
  'inneranimalmedia-mcp',
  1,
  1,
  'Canonical MCP orchestrator role for mcp.inneranimalmedia.com with service-level governance and health monitoring responsibilities.',
  datetime('now'),
  datetime('now')
);

-- 2) Ensure referenced worker exists (mcp_services.worker_id FK -> worker_registry.id)
INSERT OR IGNORE INTO worker_registry (
  id,
  worker_name,
  worker_type,
  script_name,
  deployment_status,
  git_repo,
  notes,
  created_at,
  updated_at
) VALUES (
  'inneranimalmedia-mcp-server',
  'inneranimalmedia-mcp-server',
  'production',
  'inneranimalmedia-mcp-server',
  'active',
  'SamPrimeaux/inneranimalmedia-mcp-server',
  'Canonical MCP worker for mcp.inneranimalmedia.com',
  unixepoch(),
  unixepoch()
);

-- 3) Fill required service fields for canonical MCP row
UPDATE mcp_services
SET
  worker_id = 'inneranimalmedia-mcp-server',
  r2_buckets = '["inneranimalmedia-assets","iam-platform"]',
  allowed_clients = '["cursor","agent_sam_dashboard","trusted_mcp_clients"]',
  agent_role_id = 'ar_inneranimalmedia_mcp_orchestrator_v1',
  hyperdrive_id = '08183bb9d2914e87ac8395d7e4ecff60',
  authentication_type = 'token',
  token_secret_name = 'MCP_AUTH_TOKEN',
  health_status = 'configured',
  last_health_check = unixepoch(),
  metadata = json_set(
    COALESCE(metadata, '{}'),
    '$.custom_domain', 'mcp.inneranimalmedia.com',
    '$.github_repo', 'SamPrimeaux/inneranimalmedia-mcp-server',
    '$.monitoring.logs_enabled', true,
    '$.monitoring.traces_enabled', true,
    '$.monitoring.log_destination', 'meauxbility-central-analytics',
    '$.monitoring.trace_destination', 'inneranimalmedia-selfhosted',
    '$.monitoring.mcp_health_method', 'initialize+tools-list'
  ),
  metadata_updated_at = unixepoch(),
  updated_at = unixepoch()
WHERE id = 'inneranimalmedia-mcp';
