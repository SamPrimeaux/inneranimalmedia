-- 558: Supabase DB password ops — agentsam_scripts metadata + AutoRAG R2 script bodies.
-- Canonical bytes: R2 inneranimalmedia-autorag/scripts/{maintenance,...}/*
-- D1: empty body, one-line invocation, source_stored=r2:…, script_hash for drift detect.
--
-- Upload R2:
--   ./scripts/upload-agentsam-scripts-r2.sh
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/558_supabase_db_password_scripts_registry.sql

INSERT OR IGNORE INTO agentsam_scripts (
  id, tenant_id, workspace_id, slug, name, path, body, description, purpose,
  runner, language, script_hash, is_global, is_active, requires_env, owner_only,
  safe_to_run, approval_required, risk_level, preferred_for, notes, source_stored,
  created_at_epoch, updated_at_epoch
) VALUES
(
  'script_rotate_supabase_db_password',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'rotate_supabase_db_password',
  'Rotate Supabase DB password (generate → Supabase → sync all)',
  'scripts/rotate-supabase-db-password.sh',
  '',
  'Foolproof password rotation: openssl rand -hex 32, paste in Supabase Database settings, Y to sync .env.cloudflare SUPABASE_DB_URL (5432 session pooler) + Cloudflare Hyperdrive 08183bb9…. Retries pooler propagation.',
  'infra',
  'bash',
  'bash',
  '0099746aeaaf4fdd07800626e67fec7d23c86ab3d5cf600a2d845a55981e570f',
  0,
  1,
  1,
  1,
  0,
  1,
  'high',
  'supabase,hyperdrive,postgres,password,env,operator',
  'Rotates DB password — updates Supabase + .env.cloudflare + Hyperdrive. Requires CLOUDFLARE_API_TOKEN in .env.cloudflare. Do not paste password in shell history; script prompts Y after Supabase save.',
  'r2:inneranimalmedia-autorag/scripts/maintenance/rotate-supabase-db-password.sh',
  unixepoch(),
  unixepoch()
),
(
  'script_sync_supabase_db_password',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'sync_supabase_db_password',
  'Sync Supabase DB password (.env + Hyperdrive, manual entry)',
  'scripts/sync-supabase-db-password.sh',
  '',
  'Hidden double-entry of DB password → writes SUPABASE_DB_URL (session pooler :5432) → verify-supabase-pg → wrangler hyperdrive update. Use when password already set in Supabase.',
  'infra',
  'bash',
  'bash',
  '4517ec88788a9e2961a69f8006b6ac5a6a34c997e04b16b6249f0e36ef329baf',
  0,
  1,
  1,
  1,
  0,
  1,
  'high',
  'supabase,hyperdrive,postgres,password,env,operator',
  'Same one-password rule: Supabase dashboard = Hyperdrive origin = SUPABASE_DB_URL. Prefer --connection-string over --origin-password only.',
  'r2:inneranimalmedia-autorag/scripts/maintenance/sync-supabase-db-password.sh',
  unixepoch(),
  unixepoch()
),
(
  'script_verify_supabase_pg',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'verify_supabase_pg',
  'Verify Supabase Postgres + agentsam RAG lane tables',
  'scripts/verify-supabase-pg.mjs',
  '',
  'Tests SUPABASE_DB_URL auth and row counts for agentsam_memory_oai3large_1536, deep_archive, documents, agentsam_memory. Does not use legacy public.documents.',
  'audit',
  'node',
  'javascript',
  'c5f7614312364f085c447e0b52e0376ac755aa0aa65c161534b5355d1a66e84d',
  0,
  1,
  1,
  1,
  1,
  0,
  'low',
  'supabase,postgres,verify,rag,agentsam',
  'Read-only. Run after password sync. REST lane (SUPABASE_SERVICE_ROLE_KEY) can work even when this fails.',
  'r2:inneranimalmedia-autorag/scripts/maintenance/verify-supabase-pg.mjs',
  unixepoch(),
  unixepoch()
),
(
  'script_upload_agentsam_scripts_r2',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'upload_agentsam_scripts_r2',
  'Upload agentsam script bodies to R2 inneranimalmedia/scripts/',
  'scripts/upload-agentsam-scripts-r2.sh',
  './scripts/upload-agentsam-scripts-r2.sh',
  'Pushes repo script files to R2 bucket inneranimalmedia under scripts/ prefix. Pair with agentsam_scripts rows (source_stored=r2:…, empty body). Update script_hash in D1 after content changes.',
  'maintenance',
  'bash',
  'bash',
  '',
  0,
  1,
  1,
  1,
  1,
  0,
  'low',
  'r2,agentsam_scripts,registry,operator',
  'Run after editing registered scripts. Default set: rotate/sync/verify-supabase-pg. Pass extra paths as args.',
  'repo:scripts/upload-agentsam-scripts-r2.sh',
  unixepoch(),
  unixepoch()
);

UPDATE agentsam_scripts SET
  name = 'Rotate Supabase DB password (generate → Supabase → sync all)',
  path = 'scripts/rotate-supabase-db-password.sh',
  body = '',
  description = 'Foolproof password rotation: openssl rand -hex 32, paste in Supabase Database settings, Y to sync .env.cloudflare SUPABASE_DB_URL (5432 session pooler) + Cloudflare Hyperdrive 08183bb9…. Retries pooler propagation.',
  purpose = 'infra',
  runner = 'bash',
  language = 'bash',
  script_hash = '0099746aeaaf4fdd07800626e67fec7d23c86ab3d5cf600a2d845a55981e570f',
  requires_env = 1,
  owner_only = 1,
  safe_to_run = 0,
  approval_required = 1,
  risk_level = 'high',
  preferred_for = 'supabase,hyperdrive,postgres,password,env,operator',
  notes = 'Rotates DB password — updates Supabase + .env.cloudflare + Hyperdrive. Requires CLOUDFLARE_API_TOKEN in .env.cloudflare.',
  source_stored = 'r2:inneranimalmedia/scripts/rotate-supabase-db-password.sh',
  updated_at_epoch = unixepoch()
WHERE slug = 'rotate_supabase_db_password'
  AND tenant_id = 'tenant_sam_primeaux'
  AND workspace_id = 'ws_inneranimalmedia';

UPDATE agentsam_scripts SET
  name = 'Sync Supabase DB password (.env + Hyperdrive, manual entry)',
  path = 'scripts/sync-supabase-db-password.sh',
  body = '',
  description = 'Hidden double-entry of DB password → writes SUPABASE_DB_URL (session pooler :5432) → verify-supabase-pg → wrangler hyperdrive update.',
  purpose = 'infra',
  runner = 'bash',
  language = 'bash',
  script_hash = '4517ec88788a9e2961a69f8006b6ac5a6a34c997e04b16b6249f0e36ef329baf',
  requires_env = 1,
  owner_only = 1,
  safe_to_run = 0,
  approval_required = 1,
  risk_level = 'high',
  preferred_for = 'supabase,hyperdrive,postgres,password,env,operator',
  notes = 'Same one-password rule: Supabase dashboard = Hyperdrive origin = SUPABASE_DB_URL.',
  source_stored = 'r2:inneranimalmedia/scripts/sync-supabase-db-password.sh',
  updated_at_epoch = unixepoch()
WHERE slug = 'sync_supabase_db_password'
  AND tenant_id = 'tenant_sam_primeaux'
  AND workspace_id = 'ws_inneranimalmedia';

UPDATE agentsam_scripts SET
  name = 'Verify Supabase Postgres + agentsam RAG lane tables',
  path = 'scripts/verify-supabase-pg.mjs',
  body = '',
  description = 'Tests SUPABASE_DB_URL auth and row counts for agentsam RAG lane tables (not public.documents).',
  purpose = 'audit',
  runner = 'node',
  language = 'javascript',
  script_hash = 'c5f7614312364f085c447e0b52e0376ac755aa0aa65c161534b5355d1a66e84d',
  requires_env = 1,
  owner_only = 1,
  safe_to_run = 1,
  approval_required = 0,
  risk_level = 'low',
  preferred_for = 'supabase,postgres,verify,rag,agentsam',
  notes = 'Read-only. Run after password sync.',
  source_stored = 'r2:inneranimalmedia/scripts/verify-supabase-pg.mjs',
  updated_at_epoch = unixepoch()
WHERE slug = 'verify_supabase_pg'
  AND tenant_id = 'tenant_sam_primeaux'
  AND workspace_id = 'ws_inneranimalmedia';
