-- 110: Record agent dashboard integration deploy (2026-03-03)
-- Run: CLOUDFLARE_API_TOKEN=... npx wrangler d1 execute inneranimalmedia-business --remote --config wrangler.production.toml --file=./migrations/110_agent_dashboard_integration_deploy.sql
-- Purpose: Document deploy that added React AgentDashboard in main content, /api/agent/* routes, queue consumer, nodejs_compat.

INSERT INTO cloudflare_deployments (
  deployment_id,
  worker_name,
  project_name,
  deployment_type,
  environment,
  status,
  deployment_url,
  preview_url,
  triggered_by,
  deployed_at,
  created_at
) VALUES (
  '8ff17d1c-92ab-4a90-84d3-037cbb3a21ad',
  'inneranimalmedia',
  'inneranimalmedia',
  'worker',
  'production',
  'success',
  'https://inneranimalmedia.meauxbility.workers.dev',
  'https://www.inneranimalmedia.com/dashboard/agent',
  'wrangler_deploy_cursor',
  datetime('now'),
  datetime('now')
);

UPDATE projects
SET updated_at = datetime('now'),
    metadata_json = json_set(COALESCE(NULLIF(metadata_json,''), '{}'), '$.last_deployment_id', '8ff17d1c-92ab-4a90-84d3-037cbb3a21ad', '$.last_deployment_at', datetime('now'), '$.last_deployment_note', 'Agent dashboard integration: React AgentDashboard.jsx in main.main-content only; /api/agent/* (boot, chat, models, sessions, playwright, mcp, cidi, telemetry, workspace); queue consumer for Puppeteer screenshot/render; nodejs_compat; assets at static/dashboard/agent/.')
WHERE id = 'inneranimalmedia';
