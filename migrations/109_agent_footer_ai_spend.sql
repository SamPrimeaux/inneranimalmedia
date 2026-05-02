-- Record deploy: Agent footer chat pane + ai-spend summary/rows
-- Run after worker deploy and R2 upload of dashboard/agent.html

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
  'agent-footer-2026-03-02',
  'inneranimalmedia',
  'inneranimalmedia',
  'worker_and_r2',
  'production',
  'success',
  'https://inneranimalmedia.com',
  'https://www.inneranimalmedia.com/dashboard/agent',
  'manual',
  datetime('now'),
  datetime('now')
);

UPDATE projects
SET updated_at = datetime('now'),
    metadata_json = json_set(COALESCE(NULLIF(metadata_json,''), '{}'), '$.last_deployment_id', 'agent-footer-2026-03-02', '$.last_deployment_at', datetime('now'), '$.last_deployment_note', 'Agent: footer chat pane (context gauge, $ gauge, scrollable messages). Finance: ai-spend returns summary.total_this_month and rows[].')
WHERE id = 'inneranimalmedia';
