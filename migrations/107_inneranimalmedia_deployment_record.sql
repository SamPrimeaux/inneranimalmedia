-- 107: Record inneranimalmedia worker deployment (2026-03-02)
-- Run: npx wrangler d1 execute inneranimalmedia-business --remote --file=./migrations/107_inneranimalmedia_deployment_record.sql
-- Purpose: Document the first deploy from this repo in cloudflare_deployments and project metadata.

-- Deployment record (Version ID from wrangler deploy: 1e4fce97-fe9d-4ee6-a58e-eb12d094d79a)
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
  '1e4fce97-fe9d-4ee6-a58e-eb12d094d79a',
  'inneranimalmedia',
  'inneranimalmedia',
  'worker',
  'production',
  'success',
  'https://inneranimalmedia.meauxbility.workers.dev',
  'https://www.inneranimalmedia.com',
  'wrangler_deploy_cursor',
  datetime('now'),
  datetime('now')
);

-- Update project metadata: last deployment id and note (for projects that have metadata_json)
UPDATE projects
SET updated_at = datetime('now'),
    metadata_json = json_set(COALESCE(NULLIF(metadata_json,''), '{}'), '$.last_deployment_id', '1e4fce97-fe9d-4ee6-a58e-eb12d094d79a', '$.last_deployment_at', datetime('now'), '$.last_deployment_note', 'First deploy from march1st-inneranimalmedia repo: ASSETS homepage, DASHBOARD auth/dashboard, DO stubs, queue consumer.')
WHERE id = 'inneranimalmedia';
