-- 205: CIDI audit trail — repo sync (overnight suite, morning-plan metrics, INTERNAL_API_SECRET handoff, CIDI docs).
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/205_cidi_cursor_sync_overnight_docs_20260401.sql
-- Tables: cicd_runs, cidi_activity_log, cidi_pipeline_runs, cidi_run_results (see docs/CICD_TABLES_AND_MIGRATIONS.md).

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
  'run_manual_20260401_cursor_cidi_sync',
  'gh_manual_cursor_cidi_sync_20260401',
  'inneranimalmedia-agentsam-dashboard',
  'CIDI-IAM-AGENTSAM-20260322',
  'SamPrimeaux/inneranimalmedia-agentsam-dashboard',
  'main',
  NULL,
  'chore: CIDI D1 205 — overnight suite, daily-plan telemetry prompt, CIDI_TABLES_AND_MIGRATIONS, handoff docs',
  'manual_cursor_sync',
  'success',
  'success',
  'cursor_agent',
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
  'documentation',
  NULL,
  '205_cidi_cursor_sync_overnight_docs_20260401',
  'Logged: scripts/overnight-api-suite.mjs (Tier B/C/D, WRITE_OVERNIGHT_TO_D1, OVERNIGHT_TIER_C_PROD); worker sendDailyPlanEmail overnight + telemetry; docs CLAUDE_CODE_OVERNIGHT_HANDOFF, OVERNIGHT_EMAIL_AND_METRICS, OVERNIGHT_BATCH_API_TEST_BRIEF; CIDI_TABLES_AND_MIGRATIONS.md.',
  'cursor_agent',
  '{"migration":"205","tables":["cicd_runs","cidi_activity_log","cidi_pipeline_runs","cidi_run_results"],"refs":["docs/CIDI_TABLES_AND_MIGRATIONS.md","migrations/203_cidi_log_git_push_main_393a9c0.sql","migrations/204_project_memory_cidi_three_step_and_plan_steps.sql"]}'
);

INSERT OR REPLACE INTO cidi_pipeline_runs (
  run_id,
  commit_hash,
  branch,
  env,
  status,
  notes
) VALUES (
  'pip_cidi_20260401_cursor_sync',
  NULL,
  'main',
  'sandbox',
  'pending',
  '2026-04-01 repo sync: overnight HTTP canary + morning email metrics wiring (worker deploy pending Sam); D1 migration 205; INTERNAL_API_SECRET documented for .env.cloudflare + Wrangler secret.'
);

INSERT OR REPLACE INTO cidi_run_results (id, run_id, tool_name, test_type, status, response_preview) VALUES
('crr_20260401_docs', 'pip_cidi_20260401_cursor_sync', 'documentation_sync', 'route', 'pass', 'migrations/205 + docs/CIDI_TABLES_AND_MIGRATIONS.md committed to main'),
('crr_20260401_overnight', 'pip_cidi_20260401_cursor_sync', 'overnight_api_suite', 'route', 'skip', 'local/CI runner; see reports/ and project_memory OVERNIGHT_API_SUITE_LAST when WRITE_OVERNIGHT_TO_D1=1'),
('crr_20260401_worker', 'pip_cidi_20260401_cursor_sync', 'sendDailyPlanEmail', 'invoke', 'skip', 'worker.js change requires CIDI promote; not live until deploy');
