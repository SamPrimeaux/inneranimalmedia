-- 2026-04-02 (morning, America/Chicago): Document main-branch churn, Workers Builds esbuild/npm ci failures,
-- user-reported app regression, and remediation commit dd6cb24. Requires cicd_pipeline_runs parent for cicd_run_steps.
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=migrations/210_cicd_20260402_morning_github_churn_and_incidents.sql

-- GitHub / Workers Builds: repeated failure while main had wrangler + vite dual esbuild (npm ci postinstall validate)
INSERT INTO cicd_github_runs (
  run_id,
  workflow_name,
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
  'github_run_20260402_workers_builds_esbuild_mismatch',
  'Cloudflare Workers Builds',
  'SamPrimeaux/inneranimalmedia-agentsam-dashboard',
  'main',
  'f82c4d783b152989c2e6e3294252f781c1356ce5',
  'State on main before dd6cb24: vendor agent-dashboard; wrangler in workspace pulled esbuild 0.27.3 alongside vite esbuild 0.25.12',
  'workflow_run',
  'failure',
  'failure',
  1,
  '2026-04-02T16:46:52Z',
  '2026-04-02T16:53:22Z',
  390000
);

INSERT INTO cicd_pipeline_runs (
  run_id,
  commit_hash,
  branch,
  env,
  status,
  completed_at,
  notes
) VALUES (
  'pipe_20260402_morning_churn_incidents',
  'dd6cb2465b8a5dd4cafb14792f3aa4e75aaf0ac0',
  'main',
  'sandbox',
  'promoted',
  '2026-04-02T17:30:00Z',
  'Morning 2026-04-02: 17 commits on main (00:21-11:55 CT). CI: Workers Builds failed npm ci (esbuild 0.25.12 vs 0.27.3). Prior session doc: migration 209 (submodules, ASSETS clash, R2 503). Remediation: dd6cb24 remove wrangler from workspace; user reported app regression after churn — verify sandbox/prod assets and benchmarks.'
);

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
  metadata_json,
  queued_at,
  started_at,
  completed_at,
  created_at,
  updated_at
) VALUES (
  'run_cicd_20260402_morning_main_churn_incident_log',
  2,
  'inneranimal-dashboard',
  'sandbox',
  'worker_r2',
  'agent_sam',
  'sam_primeaux',
  'failed',
  'failure',
  'sandbox',
  'User reported full app regression after rapid main changes 2026-04-02 AM. CI: Workers Builds failed at npm ci (esbuild install.js expected 0.25.12, binary reported 0.27.3) until wrangler removed from agent-dashboard workspace (dd6cb24). Correlate with assets path / submodule / vendor sequence; run benchmark and manual /dashboard/agent verification.',
  '{"ci_failures":[{"name":"workers_builds_npm_ci","detail":"Error: Expected 0.25.12 but got 0.27.3 at node_modules/esbuild/install.js validateBinaryVersion","log_windows_utc":["2026-04-02T16:47:22Z","2026-04-02T16:53:21Z"],"remediation":{"commit":"dd6cb2465b8a5dd4cafb14792f3aa4e75aaf0ac0","summary":"Remove wrangler from agent-dashboard devDependencies; regenerate package-lock.json; single hoisted esbuild 0.25.12"}}],"prior_documentation_migration":"209_cicd_20260402_session_failures_documentation.sql","user_reported_incident":{"severity":"high","summary":"App reported broken after agent-led changes; treat as production/sandbox regression until verified"}}',
  'SamPrimeaux/inneranimalmedia-agentsam-dashboard',
  'main',
  'dd6cb2465b8a5dd4cafb14792f3aa4e75aaf0ac0',
  'fix(agent-dashboard): drop wrangler from workspace; single esbuild for Workers Builds',
  'github_run_20260402_workers_builds_esbuild_mismatch',
  'failed',
  'pending',
  'pending',
  'D1 incident log 210: charts 17 commits (00:21-11:55 CT) in metadata_json.commits_chronological. Links github_run esbuild failure row; remediation dd6cb24.',
  '["2026-04-02","esbuild","workers-builds","regression","main-churn","agent_sam"]',
  '{"timezone":"America/Chicago","documentation_generated_at_utc":"2026-04-02T18:00:00Z","commits_chronological":[{"sha":"9c1e3a06095483a6a233ddb0db19bcc54c422972","time":"2026-04-02T00:21:21-05:00","subject":"fix: resolve all merge conflicts — protect sandbox pipeline, take upstream docs/vite config"},{"sha":"c1e3fa4eb9b60bb0377b2724c487558d6db223e6","time":"2026-04-02T00:23:48-05:00","subject":"fix: protect static/dashboard/agent/* keys from deploy-sandbox.sh — managed by meauxcad pipeline"},{"sha":"6b02e20f865a05af49201e4be3d41b54488ef1af","time":"2026-04-02T00:24:17-05:00","subject":"merge: agentsam-clean into main — resolve conflicts, protected deploy-sandbox.sh locked in"},{"sha":"8c4b34630537ea6a60d377ef7fe106c9428a1ffb","time":"2026-04-02T00:27:46-05:00","subject":"fix: clean up deploy-sandbox.sh protected key skip syntax — remove dangling --file args"},{"sha":"fdf2804cc21707af533bc960438faf9facbbfd49","time":"2026-04-02T08:34:12-05:00","subject":"feat: IAM route standardization complete — meauxcad src replaces agent-dashboard, worker.ts pruned to CAD-only"},{"sha":"83d8a9039771f541f2be881474576937c5b7252e","time":"2026-04-02T09:13:03-05:00","subject":"merge: agentsam-clean into main — take meauxcad package.json"},{"sha":"732b3b977f3d92e0dc20751bdd661be60d9b1939","time":"2026-04-02T09:15:22-05:00","subject":"fix: regenerate package-lock.json for meauxcad dependencies"},{"sha":"31223b9cdc67b333d9b94bded62cbe1935739843","time":"2026-04-02T10:07:30-05:00","subject":"fix: remove duplicate assets block"},{"sha":"3867f4dda341a268e36e95b0488e3959ebc71e1c","time":"2026-04-02T11:11:07-05:00","subject":"fix: sandbox agent assets + shell.css same-origin; cicd bucket scripts; wrangler/worker alignment"},{"sha":"7962d23298df79cf929dc7b5c2e2d94d1f428598","time":"2026-04-02T11:15:30-05:00","subject":"chore: add meauxcad as git submodule (canonical lab source in monorepo)"},{"sha":"4584b299c9ac8862d807284ea5583c37d706e2f1","time":"2026-04-02T11:15:42-05:00","subject":"docs: session log — meauxcad submodule"},{"sha":"a538cf0d793e3c9ec851b1777e038dd19f1f2d1c","time":"2026-04-02T11:24:26-05:00","subject":"chore(submodule): bump agent-dashboard (wrangler ^4.80.0)"},{"sha":"9e03a932e627676ddbb1f4c03432a5a08d2b1fce","time":"2026-04-02T11:30:20-05:00","subject":"fix(sandbox): Workers assets + deploy scripts use nested workspace dist"},{"sha":"6be13462f77cbd29cf316824e9d5d0f84090208b","time":"2026-04-02T11:36:14-05:00","subject":"fix(sandbox): rename Workers assets binding to STATIC_ASSETS (avoid R2 ASSETS clash)"},{"sha":"f82c4d783b152989c2e6e3294252f781c1356ce5","time":"2026-04-02T11:46:10-05:00","subject":"refactor: vendor agent-dashboard into monorepo (remove git submodules)"},{"sha":"dd6cb2465b8a5dd4cafb14792f3aa4e75aaf0ac0","time":"2026-04-02T11:55:34-05:00","subject":"fix(agent-dashboard): drop wrangler from workspace; single esbuild for Workers Builds"}]}',
  unixepoch('2026-04-02 00:00:00'),
  unixepoch('2026-04-02 00:21:00'),
  unixepoch('2026-04-02 12:00:00'),
  unixepoch('2026-04-02 12:00:00'),
  unixepoch('2026-04-02 12:00:00')
);

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
  'step_20260402_workers_builds_esbuild_npm_ci',
  'pipe_20260402_morning_churn_incidents',
  'npm_ci_esbuild_postinstall',
  'invoke',
  'fail',
  NULL,
  NULL,
  'Expected 0.25.12 but got 0.27.3 (validateBinaryVersion in esbuild/install.js). Caused by wrangler nested esbuild vs vite hoisted esbuild; fixed by dd6cb24 removing wrangler from workspace.',
  NULL,
  '2026-04-02T16:53:21Z'
),
(
  'step_20260402_user_reported_app_regression',
  'pipe_20260402_morning_churn_incidents',
  'user_reported_full_app_regression',
  'route',
  'fail',
  NULL,
  NULL,
  'Operator reported app crashed / unusable after agent-led main churn 2026-04-02 AM. Requires verification: sandbox and prod /dashboard/agent, R2 keys, benchmark gate.',
  NULL,
  '2026-04-02T17:00:00Z'
),
(
  'step_20260402_remediation_dd6cb24_lockfile',
  'pipe_20260402_morning_churn_incidents',
  'git_push_dd6cb24_agent_dashboard',
  'invoke',
  'pass',
  NULL,
  NULL,
  NULL,
  'dd6cb24 pushed to main: remove wrangler from agent-dashboard workspace; regenerate package-lock.json',
  '2026-04-02T11:55:34Z'
);
