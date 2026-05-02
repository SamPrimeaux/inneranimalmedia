-- 111: Ensure agent_telemetry exists + record latest deploy (observability, cache headers)
-- Run: npx wrangler d1 execute inneranimalmedia-business --remote --config wrangler.production.toml --file=./migrations/111_agent_telemetry_and_latest_deploy.sql

-- Ensure agent_telemetry table exists (worker writes on every /api/agent/chat, reads in /api/agent/telemetry and overview)
CREATE TABLE IF NOT EXISTS agent_telemetry (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  session_id TEXT,
  metric_type TEXT,
  metric_name TEXT,
  metric_value REAL,
  provider TEXT,
  model_used TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  created_at INTEGER,
  updated_at INTEGER
);

-- Record latest worker deploy (observability logs+traces, agent static no-cache)
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
  '49102542-dcaf-457b-8b83-46ca7efaba33',
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
    metadata_json = json_set(COALESCE(NULLIF(metadata_json,''), '{}'), '$.last_deployment_id', '49102542-dcaf-457b-8b83-46ca7efaba33', '$.last_deployment_at', datetime('now'), '$.last_deployment_note', 'Observability: logs (meauxbility-central-analytics) + traces (inneranimalmedia-selfhosted) enabled; agent dashboard static no-cache; agent_telemetry written on every /api/agent/chat.')
WHERE id = 'inneranimalmedia';
