-- 560: Normalize agentsam_scripts purpose → 8 lane names; tier-1 R2 registry (body purge).
-- Upload bytes first: ./scripts/upload-agentsam-scripts-r2.sh
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/560_autorag_scripts_tier1_purpose_lanes.sql

-- ── Purpose → lane normalization (8 lanes + archive) ───────────────────────

UPDATE agentsam_scripts SET purpose = 'deploy', updated_at_epoch = unixepoch()
WHERE purpose = 'build';

UPDATE agentsam_scripts SET purpose = 'ingest', updated_at_epoch = unixepoch()
WHERE purpose = 'embed';

UPDATE agentsam_scripts SET purpose = 'maintenance', updated_at_epoch = unixepoch()
WHERE purpose = 'd1';

UPDATE agentsam_scripts SET purpose = 'infra', updated_at_epoch = unixepoch()
WHERE purpose = 'dangerous';

UPDATE agentsam_scripts SET purpose = 'audit', updated_at_epoch = unixepoch()
WHERE purpose = 'documentation';

UPDATE agentsam_scripts SET purpose = 'cicd', updated_at_epoch = unixepoch()
WHERE purpose = 'dev' AND COALESCE(is_active, 1) = 1;

UPDATE agentsam_scripts SET purpose = 'archive', updated_at_epoch = unixepoch()
WHERE purpose = 'dev' AND COALESCE(is_active, 1) = 0;

-- Align infra password scripts (558 used purpose=infra)
UPDATE agentsam_scripts SET purpose = 'infra', updated_at_epoch = unixepoch()
WHERE slug IN ('rotate_supabase_db_password', 'sync_supabase_db_password');

-- ── Tier-1: point at autorag R2, empty body ────────────────────────────────
-- script_hash filled on next upload-agentsam-scripts-r2.sh run (or operator refresh)

UPDATE agentsam_scripts SET
  purpose = 'deploy',
  path = 'scripts/deploy/deploy-gate.sh',
  body = '',
  source_stored = 'r2:inneranimalmedia-autorag/scripts/deploy/deploy-gate.sh',
  updated_at_epoch = unixepoch()
WHERE slug = 'deploy_gate';

UPDATE agentsam_scripts SET
  purpose = 'deploy',
  path = 'scripts/deploy/deploy-full.sh',
  body = '',
  source_stored = 'r2:inneranimalmedia-autorag/scripts/deploy/deploy-full.sh',
  updated_at_epoch = unixepoch()
WHERE slug = 'deploy_full';

UPDATE agentsam_scripts SET
  purpose = 'deploy',
  path = 'scripts/deploy/deploy-with-record.sh',
  body = '',
  source_stored = 'r2:inneranimalmedia-autorag/scripts/deploy/deploy-with-record.sh',
  updated_at_epoch = unixepoch()
WHERE slug = 'deploy_with_record';

UPDATE agentsam_scripts SET
  purpose = 'deploy',
  path = 'scripts/deploy/deploy-sandbox.sh',
  body = '',
  source_stored = 'r2:inneranimalmedia-autorag/scripts/deploy/deploy-sandbox.sh',
  updated_at_epoch = unixepoch()
WHERE slug = 'deploy_sandbox';

UPDATE agentsam_scripts SET
  purpose = 'deploy',
  path = 'scripts/deploy/deploy-frontend.sh',
  body = '',
  source_stored = 'r2:inneranimalmedia-autorag/scripts/deploy/deploy-frontend.sh',
  updated_at_epoch = unixepoch()
WHERE slug = 'deploy_frontend';

UPDATE agentsam_scripts SET
  purpose = 'deploy',
  path = 'scripts/deploy/deploy-cf-builds-prod.sh',
  body = '',
  source_stored = 'r2:inneranimalmedia-autorag/scripts/deploy/deploy-cf-builds-prod.sh',
  updated_at_epoch = unixepoch()
WHERE slug IN ('deploy_cf_builds', 'adeploy_cf_builds_prod');

UPDATE agentsam_scripts SET
  purpose = 'deploy',
  path = 'scripts/deploy/deploy-test-promote.sh',
  body = '',
  source_stored = 'r2:inneranimalmedia-autorag/scripts/deploy/deploy-test-promote.sh',
  updated_at_epoch = unixepoch()
WHERE slug = 'deploy_test_promote';

UPDATE agentsam_scripts SET
  purpose = 'deploy',
  path = 'scripts/deploy/post-deploy-record.sh',
  body = '',
  source_stored = 'r2:inneranimalmedia-autorag/scripts/deploy/post-deploy-record.sh',
  updated_at_epoch = unixepoch()
WHERE slug = 'post_deploy_record';

UPDATE agentsam_scripts SET
  purpose = 'maintenance',
  path = 'scripts/maintenance/with-cloudflare-env.sh',
  body = '',
  source_stored = 'r2:inneranimalmedia-autorag/scripts/maintenance/with-cloudflare-env.sh',
  updated_at_epoch = unixepoch()
WHERE slug = 'with_cloudflare_env';

UPDATE agentsam_scripts SET
  purpose = 'maintenance',
  path = 'scripts/maintenance/populate-autorag.sh',
  body = '',
  source_stored = 'r2:inneranimalmedia-autorag/scripts/maintenance/populate-autorag.sh',
  updated_at_epoch = unixepoch()
WHERE slug = 'populate_autorag';

UPDATE agentsam_scripts SET
  purpose = 'maintenance',
  path = 'scripts/maintenance/validate_agentsam_ops_ledger.sh',
  body = '',
  source_stored = 'r2:inneranimalmedia-autorag/scripts/maintenance/validate_agentsam_ops_ledger.sh',
  updated_at_epoch = unixepoch()
WHERE slug = 'validate_agentsam_ops_ledger';

UPDATE agentsam_scripts SET
  purpose = 'maintenance',
  path = 'scripts/maintenance/upload-agentsam-scripts-r2.sh',
  body = '',
  source_stored = 'r2:inneranimalmedia-autorag/scripts/maintenance/upload-agentsam-scripts-r2.sh',
  updated_at_epoch = unixepoch()
WHERE slug = 'upload_agentsam_scripts_r2';

UPDATE agentsam_scripts SET
  purpose = 'infra',
  path = 'scripts/maintenance/rotate-supabase-db-password.sh',
  body = '',
  source_stored = 'r2:inneranimalmedia-autorag/scripts/maintenance/rotate-supabase-db-password.sh',
  updated_at_epoch = unixepoch()
WHERE slug = 'rotate_supabase_db_password';

UPDATE agentsam_scripts SET
  purpose = 'infra',
  path = 'scripts/maintenance/sync-supabase-db-password.sh',
  body = '',
  source_stored = 'r2:inneranimalmedia-autorag/scripts/maintenance/sync-supabase-db-password.sh',
  updated_at_epoch = unixepoch()
WHERE slug = 'sync_supabase_db_password';

UPDATE agentsam_scripts SET
  purpose = 'audit',
  path = 'scripts/maintenance/verify-supabase-pg.mjs',
  body = '',
  source_stored = 'r2:inneranimalmedia-autorag/scripts/maintenance/verify-supabase-pg.mjs',
  updated_at_epoch = unixepoch()
WHERE slug = 'verify_supabase_pg';

UPDATE agentsam_scripts SET
  purpose = 'infra',
  path = 'scripts/infra/install-terminal-tunnel-env.sh',
  body = '',
  source_stored = 'r2:inneranimalmedia-autorag/scripts/infra/install-terminal-tunnel-env.sh',
  updated_at_epoch = unixepoch()
WHERE slug = 'install_terminal_tunnel_env';

UPDATE agentsam_scripts SET
  purpose = 'infra',
  path = 'scripts/infra/sync-vm-env-cloudflare.sh',
  body = '',
  source_stored = 'r2:inneranimalmedia-autorag/scripts/infra/sync-vm-env-cloudflare.sh',
  updated_at_epoch = unixepoch()
WHERE slug = 'sync_vm_env_cloudflare';

UPDATE agentsam_scripts SET
  purpose = 'infra',
  path = 'scripts/infra/sync-cloudflare-env-from-zshrc.sh',
  body = '',
  source_stored = 'r2:inneranimalmedia-autorag/scripts/infra/sync-cloudflare-env-from-zshrc.sh',
  updated_at_epoch = unixepoch()
WHERE slug = 'sync_cloudflare_env_from_zshrc';

UPDATE agentsam_scripts SET
  purpose = 'test',
  path = 'scripts/test/mcp-smoke.mjs',
  body = '',
  source_stored = 'r2:inneranimalmedia-autorag/scripts/test/mcp-smoke.mjs',
  updated_at_epoch = unixepoch()
WHERE slug = 'smoke_mcp';

-- Tier-1 rows that may not exist yet (INSERT OR IGNORE)
INSERT OR IGNORE INTO agentsam_scripts (
  id, tenant_id, workspace_id, slug, name, path, body, description, purpose,
  runner, language, is_global, is_active, requires_env, owner_only,
  safe_to_run, approval_required, risk_level, source_stored, created_at_epoch, updated_at_epoch
) VALUES
(
  'script_upload_auth_pages',
  'tenant_sam_primeaux', 'ws_inneranimalmedia',
  'upload_auth_pages', 'Upload auth HTML pages to R2',
  'scripts/deploy/upload-auth-pages.sh', '',
  'Upload static/pages/auth/*.html to R2 — no Worker redeploy.',
  'deploy', 'bash', 'bash', 0, 1, 1, 1, 0, 0, 'medium',
  'r2:inneranimalmedia-autorag/scripts/deploy/upload-auth-pages.sh',
  unixepoch(), unixepoch()
),
(
  'script_deploy_stack',
  'tenant_sam_primeaux', 'ws_inneranimalmedia',
  'deploy_stack', 'Deploy stack orchestrator',
  'scripts/deploy/deploy-stack.sh', '',
  'Multi-component stack deploy script.',
  'deploy', 'bash', 'bash', 0, 1, 1, 1, 0, 1, 'high',
  'r2:inneranimalmedia-autorag/scripts/deploy/deploy-stack.sh',
  unixepoch(), unixepoch()
),
(
  'script_verify_supabase_documents',
  'tenant_sam_primeaux', 'ws_inneranimalmedia',
  'verify_supabase_documents', 'Verify Supabase documents REST lane',
  'scripts/maintenance/verify-supabase-documents.mjs', '',
  'Read-only verify for Supabase documents API.',
  'audit', 'node', 'javascript', 0, 1, 1, 1, 1, 0, 'low',
  'r2:inneranimalmedia-autorag/scripts/maintenance/verify-supabase-documents.mjs',
  unixepoch(), unixepoch()
),
(
  'script_d1_bloat_audit',
  'tenant_sam_primeaux', 'ws_inneranimalmedia',
  'd1_bloat_audit', 'D1 bloat audit',
  'scripts/maintenance/d1_bloat_audit.py', '',
  'Table row counts and bloat signals for inneranimalmedia-business D1.',
  'maintenance', 'python', 'python', 0, 1, 1, 1, 1, 0, 'low',
  'r2:inneranimalmedia-autorag/scripts/maintenance/d1_bloat_audit.py',
  unixepoch(), unixepoch()
),
(
  'script_upload_iam_skills_autorag',
  'tenant_sam_primeaux', 'ws_inneranimalmedia',
  'upload_iam_skills_autorag', 'Upload IAM skills to autorag R2',
  'scripts/maintenance/upload-iam-skills-autorag.sh', '',
  'Sync skills/*/SKILL.md to inneranimalmedia-autorag/skills/.',
  'maintenance', 'bash', 'bash', 0, 1, 1, 1, 1, 0, 'low',
  'r2:inneranimalmedia-autorag/scripts/maintenance/upload-iam-skills-autorag.sh',
  unixepoch(), unixepoch()
),
(
  'script_d1_dump_deploy_metrics',
  'tenant_sam_primeaux', 'ws_inneranimalmedia',
  'd1_dump_deploy_metrics_last2', 'D1 deploy metrics snapshot dump',
  'scripts/maintenance/d1-dump-deploy-metrics-last2.sh', '',
  'Export deploy/metrics table snapshots from D1.',
  'maintenance', 'bash', 'bash', 0, 1, 1, 1, 1, 0, 'low',
  'r2:inneranimalmedia-autorag/scripts/maintenance/d1-dump-deploy-metrics-last2.sh',
  unixepoch(), unixepoch()
),
(
  'script_d1_apply_pending',
  'tenant_sam_primeaux', 'ws_inneranimalmedia',
  'd1_apply_pending', 'Apply pending D1 migrations',
  'scripts/cicd/d1-apply-pending.mjs', '',
  'Apply idempotent migrations from migrations/ to remote D1.',
  'cicd', 'node', 'javascript', 0, 1, 1, 1, 0, 1, 'high',
  'r2:inneranimalmedia-autorag/scripts/cicd/d1-apply-pending.mjs',
  unixepoch(), unixepoch()
),
(
  'script_verify_wrangler_production',
  'tenant_sam_primeaux', 'ws_inneranimalmedia',
  'verify_wrangler_production', 'Verify wrangler production config',
  'scripts/cicd/verify-wrangler-production.sh', '',
  'Compare wrangler.production.toml bindings to production expectations.',
  'cicd', 'bash', 'bash', 0, 1, 1, 1, 1, 0, 'low',
  'r2:inneranimalmedia-autorag/scripts/cicd/verify-wrangler-production.sh',
  unixepoch(), unixepoch()
),
(
  'script_guard_no_hardcoded_identity',
  'tenant_sam_primeaux', 'ws_inneranimalmedia',
  'guard_no_hardcoded_identity', 'Guard against hardcoded identity in src',
  'scripts/cicd/guard-no-hardcoded-identity.sh', '',
  'npm run guard:identity — fail on au_/ws_/tenant_ in hot paths.',
  'cicd', 'bash', 'bash', 0, 1, 0, 1, 1, 0, 'low',
  'r2:inneranimalmedia-autorag/scripts/cicd/guard-no-hardcoded-identity.sh',
  unixepoch(), unixepoch()
),
(
  'script_agentsam_tools_catalog_smoke',
  'tenant_sam_primeaux', 'ws_inneranimalmedia',
  'agentsam_tools_catalog_smoke', 'Agentsam tools catalog smoke',
  'scripts/test/agentsam-tools-catalog-smoke.mjs', '',
  'Smoke test agentsam_tools catalog resolution paths.',
  'test', 'node', 'javascript', 0, 1, 1, 1, 1, 0, 'low',
  'r2:inneranimalmedia-autorag/scripts/test/agentsam-tools-catalog-smoke.mjs',
  unixepoch(), unixepoch()
);

-- Null body for any tier-1 slug now on R2 (idempotent)
UPDATE agentsam_scripts SET
  body = '',
  updated_at_epoch = unixepoch()
WHERE source_stored LIKE 'r2:inneranimalmedia-autorag/scripts/%'
  AND COALESCE(body, '') != '';
