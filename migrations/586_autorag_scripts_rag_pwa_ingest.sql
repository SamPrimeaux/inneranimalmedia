-- 586: Register RAG ingest + PWA manifest tier scripts on autorag R2.
-- Upload bytes first: ./scripts/upload-agentsam-scripts-r2.sh
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/586_autorag_scripts_rag_pwa_ingest.sql

INSERT OR REPLACE INTO agentsam_scripts (
  id, tenant_id, workspace_id, slug, name, path, body, description, purpose,
  runner, language, script_hash, is_global, is_active, requires_env, owner_only,
  safe_to_run, approval_required, risk_level, preferred_for, notes, source_stored,
  created_at_epoch, updated_at_epoch
) VALUES
(
  'script_reindex_codebase_dashboard_agent',
  'tenant_sam_primeaux', 'ws_inneranimalmedia',
  'reindex_codebase_dashboard_agent', 'Reindex dashboard agent codebase RAG',
  'scripts/ingest/reindex_codebase_dashboard_agent.mjs', '',
  'Targeted reindex of dashboard/agent files into Supabase + Vectorize agentsam-codebase-oai3large-1536.',
  'ingest', 'node', 'javascript', '', 0, 1, 1, 1, 0, 1, 'medium',
  'rag,codebase,vectorize',
  'One D1 vectorize_sync_log row per run (run:reindex_codebase_dashboard_agent).',
  'r2:inneranimalmedia-autorag/scripts/ingest/reindex_codebase_dashboard_agent.mjs',
  unixepoch(), unixepoch()
),
(
  'script_ingest_r2_to_rag',
  'tenant_sam_primeaux', 'ws_inneranimalmedia',
  'ingest_r2_to_rag', 'Ingest autorag R2 docs to Vectorize',
  'scripts/ingest/ingest_r2_to_rag.mjs', '',
  'Ingest knowledge/, recipes/, skills/cloudflare/references/ from autorag R2 into documents index.',
  'ingest', 'node', 'javascript', '', 0, 1, 1, 1, 0, 1, 'medium',
  'rag,documents,vectorize',
  'One D1 vectorize_sync_log row per R2 file (r2:<key>).',
  'r2:inneranimalmedia-autorag/scripts/ingest/ingest_r2_to_rag.mjs',
  unixepoch(), unixepoch()
),
(
  'script_pwa_sw_manifest_tiers',
  'tenant_sam_primeaux', 'ws_inneranimalmedia',
  'pwa_sw_manifest_tiers', 'PWA SW tiered manifest builder',
  'scripts/deploy/pwa-sw-manifest-tiers.mjs', '',
  'Build tier-0/1/2 precache manifest from dashboard/dist; used by r2-dashboard-manifest-reconcile.',
  'deploy', 'node', 'javascript', '', 0, 1, 0, 1, 1, 0, 'low',
  'pwa,deploy,cache',
  'Canonical repo path: scripts/lib/pwa-sw-manifest-tiers.mjs',
  'r2:inneranimalmedia-autorag/scripts/deploy/pwa-sw-manifest-tiers.mjs',
  unixepoch(), unixepoch()
);
