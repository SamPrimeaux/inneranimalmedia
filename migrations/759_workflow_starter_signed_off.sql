-- 759: Starters are structural truth — ship signed-off with no blanket deploy/terminal approval gates.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=migrations/759_workflow_starter_signed_off.sql

UPDATE agentsam_workflows
SET
  requires_approval = 0,
  metadata_json = json_set(
    COALESCE(NULLIF(metadata_json, ''), '{}'),
    '$.signed_off', 1,
    '$.signed_off_at', datetime('now'),
    '$.signed_off_source', 'migrations/759_workflow_starter_signed_off.sql'
  ),
  updated_at = datetime('now')
WHERE workflow_key IN ('cf_deploy_starter', 'github_repo_starter');

UPDATE agentsam_workflow_nodes
SET requires_approval = 0, updated_at = datetime('now')
WHERE workflow_id IN ('wf_cf_deploy_starter', 'wf_github_repo_starter')
  AND node_key IN ('deploy', 'push_deploy');
