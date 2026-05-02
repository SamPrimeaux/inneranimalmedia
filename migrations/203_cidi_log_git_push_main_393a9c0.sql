-- 203: Log git push main 393a9c0 in cicd_runs, cidi_activity_log, cidi_pipeline_runs, cidi_run_results.
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/203_cidi_log_git_push_main_393a9c0.sql

INSERT OR REPLACE INTO cicd_runs (
  id,
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
  actor,
  cloudflare_deployment_id,
  webhook_event_id,
  started_at,
  completed_at
) VALUES (
  'run_manual_20260331_393a9c0',
  'gh_manual_push_main_20260331_393a9c0',
  'inneranimalmedia-agentsam-dashboard',
  'CIDI-IAM-AGENTSAM-20260322',
  'SamPrimeaux/inneranimalmedia-agentsam-dashboard',
  'main',
  '393a9c0766551eaca9a3b4eb7a39e4bc4e177646',
  'feat: IAM workspace shell, tools/code runbooks, sandbox shell R2, monaco+cors, migrations (v=212)',
  'manual_git_push',
  'success',
  'success',
  'sam_primeaux',
  NULL,
  NULL,
  datetime('now'),
  datetime('now')
);

INSERT INTO cidi_activity_log (
  cidi_id,
  workflow_id,
  action_type,
  field_changed,
  old_value,
  new_value,
  change_description,
  changed_by,
  metadata_json
) VALUES (
  4,
  'CIDI-IAM-AGENTSAM-20260322',
  'updated',
  'git',
  NULL,
  '393a9c0766551eaca9a3b4eb7a39e4bc4e177646',
  'Pushed main: IAM workspace shell, tools/code, deploy-sandbox shell upload, monaco+cors scripts, migrations 184-202, dashboard v=212.',
  'sam_primeaux',
  '{"repo":"inneranimalmedia-agentsam-dashboard","branch":"main","commit_sha":"393a9c0766551eaca9a3b4eb7a39e4bc4e177646","trigger":"manual_git_push"}'
);

INSERT OR REPLACE INTO cidi_pipeline_runs (
  run_id,
  commit_hash,
  branch,
  env,
  status,
  notes
) VALUES (
  'pip_cidi_20260331_393a9c0',
  '393a9c0766551eaca9a3b4eb7a39e4bc4e177646',
  'main',
  'sandbox',
  'pending',
  'main pushed 393a9c0; next: deploy-sandbox.sh + benchmark-full.sh sandbox before promote.'
);

INSERT OR REPLACE INTO cidi_run_results (id, run_id, tool_name, test_type, status, response_preview) VALUES
('crr_393a9c0_git', 'pip_cidi_20260331_393a9c0', 'git_push', 'route', 'pass', 'origin/main at 393a9c0766551eaca9a3b4eb7a39e4bc4e177646'),
('crr_393a9c0_sandbox', 'pip_cidi_20260331_393a9c0', 'sandbox_deploy', 'invoke', 'skip', 'awaiting ./scripts/deploy-sandbox.sh'),
('crr_393a9c0_benchmark', 'pip_cidi_20260331_393a9c0', 'benchmark_full', 'agent_chat', 'skip', 'awaiting post-sandbox benchmark gate');
