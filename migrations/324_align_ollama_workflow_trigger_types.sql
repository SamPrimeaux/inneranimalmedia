-- =============================================================================
-- migrations/324_align_ollama_workflow_trigger_types.sql
--
-- Follow-up to 323: agentsam_workflows.trigger_type for ollama_code_review was
-- seeded as 'event', which is not in src/core/workflow-executor.js TRIGGER_TYPES_SAFE
-- (manual, agent, cursor, github_push, scheduled, cicd, deploy, api, smoke).
-- Normalize to 'api' for CI/deploy/chat-tool triggers. Registry rows remain is_active=0.
--
-- Also backfills migration_ref on seed agentsam_workflow_runs from 323 when missing.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml \
--     --file=./migrations/324_align_ollama_workflow_trigger_types.sql
-- =============================================================================

UPDATE agentsam_workflows
SET trigger_type = 'api',
    updated_at = datetime('now')
WHERE workflow_key = 'ollama_code_review'
  AND trigger_type = 'event';

UPDATE agentsam_workflow_runs
SET metadata_json = json_patch(
  metadata_json,
  '{"migration_ref":"migrations/323_agentsam_ollama_embed_pipeline_workflows.sql"}'
)
WHERE id IN (
  'wrun_eir_smoke_001',
  'wrun_eir_smoke_002',
  'wrun_lcr_smoke_001',
  'wrun_rag_smoke_001',
  'wrun_rag_smoke_002',
  'wrun_ncc_smoke_001'
)
AND (
  json_extract(metadata_json, '$.migration_ref') IS NULL
  OR json_extract(metadata_json, '$.migration_ref') = ''
);
