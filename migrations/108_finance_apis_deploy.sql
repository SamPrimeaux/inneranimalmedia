-- Record deploy: Finance APIs (version cd65febd-ad81-4967-b5e7-73336485e490)
-- Run: npx wrangler d1 execute inneranimalmedia-business --remote --config wrangler.production.toml --file=migrations/108_finance_apis_deploy.sql

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
  'cd65febd-ad81-4967-b5e7-73336485e490',
  'inneranimalmedia',
  'inneranimalmedia',
  'worker',
  'production',
  'success',
  'https://inneranimalmedia.meauxbility.workers.dev',
  'https://www.inneranimalmedia.com',
  'wrangler_deploy',
  datetime('now'),
  datetime('now')
);

UPDATE projects
SET updated_at = datetime('now'),
    metadata_json = json_set(COALESCE(NULLIF(metadata_json,''), '{}'), '$.last_deployment_id', 'cd65febd-ad81-4967-b5e7-73336485e490', '$.last_deployment_at', datetime('now'), '$.last_deployment_note', 'Finance APIs: /api/colors/all, /api/finance/summary, transactions, health, breakdown, categories, accounts, mrr, ai-spend.')
WHERE id = 'inneranimalmedia';
