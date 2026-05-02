-- 2026-04-02: Document CI/CD failures (Workers Builds submodule clone, wrangler ASSETS binding conflict, R2 503 auth during upload).
-- cicd_run_steps.run_id FK targets cicd_pipeline_runs(run_id); parent row inserted below before steps.
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=migrations/209_cicd_20260402_session_failures_documentation.sql

-- 1) GitHub / Workers Builds side (submodule update error during clone)
INSERT INTO cicd_github_runs (
  run_id,
  workflow_name,
  workflow_id,
  repo_name,
  branch,
  commit_sha,
  commit_message,
  trigger_event,
  status,
  conclusion,
  run_attempt,
  started_at,
  completed_at,
  duration_ms
) VALUES (
  'github_run_20260402_cf_workers_build_submodule_clone',
  'Cloudflare Workers Builds',
  NULL,
  'SamPrimeaux/inneranimalmedia-agentsam-dashboard',
  'main',
  '6be13462f77cbd29cf316824e9d5d0f84090208b',
  'pre-fix: submodule paths (meauxcad / agent-dashboard) caused clone failure in Workers Builds',
  'workflow_run',
  'failure',
  'failure',
  1,
  '2026-04-02T14:00:00Z',
  '2026-04-02T14:05:00Z',
  300000
);

-- 2) Pipeline shell for step rows (required FK for cicd_run_steps)
INSERT INTO cicd_pipeline_runs (
  run_id,
  commit_hash,
  branch,
  env,
  status,
  completed_at,
  notes
) VALUES (
  'pipe_20260402_sandbox_cicd_failures',
  'f82c4d783b152989c2e6e3294252f781c1356ce5',
  'main',
  'sandbox',
  'failed',
  '2026-04-02T23:59:59Z',
  '2026-04-02 session failures: CF Workers build submodule error; wrangler duplicate ASSETS; R2 503 upload; resolved by vendoring agent-dashboard and STATIC_ASSETS binding rename.'
);

-- 3) Aggregate CICD run (links GitHub run_id)
INSERT INTO cicd_runs (
  id,
  run_number,
  worker_name,
  environment,
  deployment_type,
  trigger_source,
  triggered_by,
  status,
  conclusion,
  failure_phase,
  error_message,
  error_detail_json,
  git_repo,
  git_branch,
  git_commit_sha,
  git_commit_message,
  github_run_id,
  phase_sandbox_status,
  phase_benchmark_status,
  phase_promote_status,
  notes,
  tags_json,
  queued_at,
  started_at,
  completed_at,
  created_at,
  updated_at
) VALUES (
  'run_cicd_20260402_session_failures_doc',
  1,
  'inneranimal-dashboard',
  'sandbox',
  'worker_r2',
  'agent_sam',
  'sam_primeaux',
  'failed',
  'failure',
  'unknown',
  '2026-04-02: Workers Builds failed updating submodules during clone; deploy-sandbox failed duplicate ASSETS (R2 vs static) until STATIC_ASSETS rename (6be1346); R2 multipart upload saw 503 Unable to authenticate request; vendor agent-dashboard and remove .gitmodules (f82c4d7).',
  '{"failures":[{"phase":"github_workers_build","summary":"error occurred while updating repository submodules"},{"phase":"wrangler","summary":"ASSETS binding used twice (R2 + static assets); fixed STATIC_ASSETS in wrangler.jsonc"},{"phase":"r2_upload","summary":"503 Unable to authenticate request on chunk upload (transient/token)"}],"resolution":{"commits":["6be13462f77cbd29cf316824e9d5d0f84090208b","f82c4d783b152989c2e6e3294252f781c1356ce5"],"actions":["rename static binding to STATIC_ASSETS","vendor agent-dashboard into monorepo","remove git submodules"]}}',
  'SamPrimeaux/inneranimalmedia-agentsam-dashboard',
  'main',
  'f82c4d783b152989c2e6e3294252f781c1356ce5',
  'refactor: vendor agent-dashboard into monorepo (remove git submodules)',
  'github_run_20260402_cf_workers_build_submodule_clone',
  'failed',
  'skipped',
  'skipped',
  'Manual D1 documentation row for 2026-04-02 CI/CD failures; see error_detail_json and cicd_run_steps.',
  '["ci","sandbox","r2","submodules","workers-builds"]',
  unixepoch('2026-04-02 00:00:00'),
  unixepoch('2026-04-02 14:00:00'),
  unixepoch('2026-04-02 23:59:59'),
  unixepoch('2026-04-02 23:59:59'),
  unixepoch('2026-04-02 23:59:59')
);

-- 4) Step-level failures (FK: run_id -> cicd_pipeline_runs)
INSERT INTO cicd_run_steps (
  id,
  run_id,
  tool_name,
  test_type,
  status,
  latency_ms,
  http_status,
  error,
  response_preview,
  tested_at
) VALUES
(
  'step_20260402_cf_workers_build_submodules',
  'pipe_20260402_sandbox_cicd_failures',
  'cloudflare_workers_build_clone',
  'invoke',
  'fail',
  300000,
  NULL,
  'error occurred while updating repository submodules (meauxcad / agent-dashboard paths)',
  NULL,
  '2026-04-02T14:05:00Z'
),
(
  'step_20260402_wrangler_duplicate_assets_binding',
  'pipe_20260402_sandbox_cicd_failures',
  'wrangler_deploy_sandbox',
  'invoke',
  'fail',
  NULL,
  NULL,
  'ASSETS used for both R2 bucket binding and Workers static assets directory; deploy-sandbox / validate failed until STATIC_ASSETS rename (commit 6be1346)',
  NULL,
  '2026-04-02T16:00:00Z'
),
(
  'step_20260402_r2_multipart_upload_503',
  'pipe_20260402_sandbox_cicd_failures',
  'wrangler_r2_object_put_chunk',
  'r2',
  'fail',
  NULL,
  503,
  'Unable to authenticate request (mid-run chunk upload; transient or token scope)',
  NULL,
  '2026-04-02T18:00:00Z'
);
