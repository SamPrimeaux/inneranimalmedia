-- Optional: register wf_dashboard_deploy + wf_code_review in ai_workflow_pipelines (documentation / tooling).
-- Runtime stages are defined in worker.js AGENT_BUILTIN_WORKFLOW_STEPS + executeAgentWorkflowSteps.
-- Run only after Sam approves, e.g.:
-- ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote --file=scripts/d1-wf-dashboard-deploy-code-review-pipelines.sql -c wrangler.production.toml

INSERT OR IGNORE INTO ai_workflow_pipelines (id, tenant_id, name, status, stages_json, created_at, updated_at)
VALUES (
  'wf_dashboard_deploy',
  'tenant_sam_primeaux',
  'Dashboard sandbox to production',
  'active',
  '[{"stage":"sandbox_build_deploy","requires_approval":false},{"stage":"sandbox_health","requires_approval":false,"require_approval_when_failed":true,"url":"https://sandbox.inneranimalmedia.com/api/health"},{"stage":"production_deploy","requires_approval":false}]',
  unixepoch(),
  unixepoch()
);

INSERT OR IGNORE INTO ai_workflow_pipelines (id, tenant_id, name, status, stages_json, created_at, updated_at)
VALUES (
  'wf_code_review',
  'tenant_sam_primeaux',
  'Code review (Architect + Tester)',
  'active',
  '[{"stage":"architect_github_diff","requires_approval":false,"role":"architect"},{"stage":"tester_sandbox_health","requires_approval":false,"url":"https://sandbox.inneranimalmedia.com/api/health"}]',
  unixepoch(),
  unixepoch()
);

UPDATE ai_workflow_pipelines
SET
  name = 'Dashboard sandbox to production',
  status = 'active',
  stages_json = '[{"stage":"sandbox_build_deploy","requires_approval":false},{"stage":"sandbox_health","requires_approval":false,"require_approval_when_failed":true,"url":"https://sandbox.inneranimalmedia.com/api/health"},{"stage":"production_deploy","requires_approval":false}]',
  updated_at = unixepoch()
WHERE id = 'wf_dashboard_deploy';

UPDATE ai_workflow_pipelines
SET
  name = 'Code review (Architect + Tester)',
  status = 'active',
  stages_json = '[{"stage":"architect_github_diff","requires_approval":false,"role":"architect"},{"stage":"tester_sandbox_health","requires_approval":false,"url":"https://sandbox.inneranimalmedia.com/api/health"}]',
  updated_at = unixepoch()
WHERE id = 'wf_code_review';
