-- 209: Document AITestSuite (meauxcad) /api/chat + ai_api_test_runs D1 logging, migration 208, builds row.
-- Git: meauxcad main @ 6b18e705b54ec5e84d5462e6fcccc046342250c9
--      inneranimalmedia-agentsam-dashboard main @ 329fd84ce546bbd9acdc900c25c2b6cc599a2c0b
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/209_cidi_meauxcad_chat_log_builds_activity.sql

INSERT INTO builds (
  id,
  project_id,
  tenant_id,
  branch,
  commit_hash,
  commit_message,
  commit_author,
  build_number,
  status,
  build_log,
  build_time_ms,
  environment,
  deployment_url,
  deployment_id,
  triggered_by,
  started_at,
  completed_at,
  created_at
) VALUES (
  'iam-build-meauxcad-aitestsuite-chatlog-6b18e70',
  'proj_inneranimalmedia_main_prod_013',
  'tenant_sam_primeaux',
  'main',
  '6b18e705b54ec5e84d5462e6fcccc046342250c9',
  'feat: log /api/chat to ai_api_test_runs (D1 harness schema); pass model id',
  'sam_primeaux',
  116,
  'success',
  'SamPrimeaux/meauxcad Worker aitestsuite: POST /api/chat streams Gemini; waitUntil INSERT into ai_api_test_runs (harness schema: test_suite=aitestsuite, test_name=chat_stream, structured_output_json for output_file/context chars, response_text cap 12k). ChatAssistant passes model id (gemini-3-flash-preview default). Redeploy aitestsuite Worker to activate.',
  NULL,
  'aitestsuite',
  'https://aitestsuite.meauxbility.workers.dev/',
  NULL,
  'cursor_agent',
  unixepoch(),
  unixepoch(),
  unixepoch()
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
  changed_at,
  metadata_json
) VALUES (
  4,
  'CIDI-IAM-AGENTSAM-20260322',
  'updated',
  'git',
  '5655a1e5e0070bb59d2fdbb4e33d244a872a2fdd',
  '6b18e705b54ec5e84d5462e6fcccc046342250c9',
  'Push main SamPrimeaux/meauxcad: POST /api/chat logs each completed stream to ai_api_test_runs (insertAiApiTestRunChat); Gemini usageMetadata tokens; model selector sends model id; optional output_file guess from first code fence.',
  'cursor_agent',
  datetime('now'),
  '{"repo":"SamPrimeaux/meauxcad","branch":"main","commit_sha":"6b18e705b54ec5e84d5462e6fcccc046342250c9","worker":"aitestsuite","tables_touched":["ai_api_test_runs"]}'
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
  changed_at,
  metadata_json
) VALUES (
  4,
  'CIDI-IAM-AGENTSAM-20260322',
  'note_added',
  'migration',
  NULL,
  '208_ai_api_test_runs.sql',
  'Chore migration 208: no-op SELECT 1; prod ai_api_test_runs already matches batch harness schema; documents D1 apply + chat logging source in meauxcad worker.ts.',
  'cursor_agent',
  datetime('now'),
  '{"repo":"SamPrimeaux/inneranimalmedia-agentsam-dashboard","branch":"main","commit_sha":"329fd84ce546bbd9acdc900c25c2b6cc599a2c0b","migration_file":"migrations/208_ai_api_test_runs.sql"}'
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
  changed_at,
  metadata_json
) VALUES (
  4,
  'CIDI-IAM-AGENTSAM-20260322',
  'created',
  'builds',
  NULL,
  'iam-build-meauxcad-aitestsuite-chatlog-6b18e70',
  'D1 builds row documents AITestSuite lab deploy lineage (build_number 116, environment aitestsuite, deployment_url aitestsuite.meauxbility.workers.dev) tied to meauxcad commit 6b18e70.',
  'cursor_agent',
  datetime('now'),
  '{"builds_id":"iam-build-meauxcad-aitestsuite-chatlog-6b18e70","project_id":"proj_inneranimalmedia_main_prod_013","build_number":116}'
);
