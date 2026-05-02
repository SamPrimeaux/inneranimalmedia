-- 207: CIDI audit — AITestSuite (SamPrimeaux/meauxcad) shell v1.2.0, Worker aitestsuite, cache ?v=semver-timestamp.
-- Git: main @ a8854e309cefa830aecda03d3f522a49da15770a
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/207_cidi_aitestsuite_shell_v1_2_0.sql
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
  'run_manual_20260401_aitestsuite_shell_v120',
  'gh_manual_meauxcad_v1_2_0_a8854e3',
  'meauxcad',
  'CIDI-IAM-AGENTSAM-20260322',
  'SamPrimeaux/meauxcad',
  'main',
  'a8854e309cefa830aecda03d3f522a49da15770a',
  'chore: shell v1.2.0 — SHELL_VERSION, package.json, cache ?v=semver-timestamp, CIDI-ready',
  'manual_aitestsuite_deploy',
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
  'aitestsuite_shell_version',
  '1.1.0',
  '1.2.0',
  'AITestSuite Worker (meauxcad repo): src/shellVersion.ts SHELL_VERSION=1.2.0; package.json 1.2.0; scripts/bump-cache.js ?v=<semver>-<timestamp>; StatusBar + Worker VERSION; README versioning section.',
  'cursor_agent',
  '{"migration":"207","shell_version":"1.2.0","worker_name":"aitestsuite","url":"https://aitestsuite.meauxbility.workers.dev/","commit":"a8854e309cefa830aecda03d3f522a49da15770a","tables":["cicd_runs","cidi_activity_log","cidi_pipeline_runs","cidi_run_results"]}'
);

INSERT OR REPLACE INTO cidi_pipeline_runs (
  run_id,
  commit_hash,
  branch,
  env,
  status,
  notes
) VALUES (
  'pip_cidi_20260401_aitestsuite_v120',
  'a8854e309cefa830aecda03d3f522a49da15770a',
  'main',
  'sandbox',
  'passed',
  'AITestSuite lab deploy: aitestsuite.meauxbility.workers.dev shell v1.2.0; parallel track to inneranimal-dashboard CIDI sandbox; index.html asset query v=1.2.0-<timestamp> on npm run deploy.'
);

INSERT OR REPLACE INTO cidi_run_results (id, run_id, tool_name, test_type, status, response_preview) VALUES
('crr_207_shell_version', 'pip_cidi_20260401_aitestsuite_v120', 'shell_version_bump', 'route', 'pass', 'SHELL_VERSION 1.2.0 in src/shellVersion.ts; package.json 1.2.0'),
('crr_207_cache_bust', 'pip_cidi_20260401_aitestsuite_v120', 'bump_cache_js', 'route', 'pass', 'scripts/bump-cache.js writes ?v=semver-ms to index.html entrypoints'),
('crr_207_worker_json', 'pip_cidi_20260401_aitestsuite_v120', 'worker_version_endpoint', 'invoke', 'skip', 'verify GET /api/version or equivalent on Worker after Cloudflare deploy');
