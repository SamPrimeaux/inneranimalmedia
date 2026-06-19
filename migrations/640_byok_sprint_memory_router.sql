-- 640: Pinned BYOK sprint router — tells agents WHERE to look for Keys & Secrets sprint work.
-- Pairs with docs/platform/byok-sprint-plan.md vector chunks + ctx_inneranimalmedia.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/640_byok_sprint_memory_router.sql

INSERT INTO agentsam_memory (
  id, tenant_id, user_id, workspace_id, memory_type, key, value, title, summary,
  source, tags, confidence, importance, is_pinned, sync_key, updated_at
) VALUES (
  'mem_byok_sprint_router_v1',
  'tenant_sam_primeaux',
  'au_871d920d1233cbd1',
  'ws_inneranimalmedia',
  'decision',
  'byok_sprint_router_v1',
  'START HERE for BYOK / Keys & Secrets sprint (2026-06). Dashboard: /dashboard/settings/keys. (1) Semantic: docs_knowledge_search "BYOK sprint plan" OR source_ref platform/inneranimalmedia/byok-sprint-plan#* in agentsam_documents_oai3large_1536 + AGENTSAM_VECTORIZE_DOCUMENTS; git SSOT docs/platform/byok-sprint-plan.md; re-ingest npm run run:ingest_byok_sprint_plan; sync memory npm run run:sync_byok_sprint_memory_vector. (2) Tables: user_api_keys + user_secrets (provider keys); user_storage_access_keys (R2 BYOK); agentsam_workspace (byok_r2_bucket, cloudflare_account_id, d1_database_id); secret_audit_log + security_findings + security_shield_rules. (3) API: src/api/settings-api-keys.js /api/settings/keys*; R2 test /api/storage/byok/test. (4) Runtime: resolve-credential.js, workspace-cloudflare-credentials.js, mcp-user-credentials.js — superadmin only via user.role; never tenant ID strings in code. (5) Blockers: MCP customer pgvector BYOK E2E not proven; Connor BYOK-only tenant pattern (migration 601). (6) Platform compass still: agentsam_memory.key=iam_platform_context_router_v1 + ctx_inneranimalmedia for non-BYOK work.',
  'BYOK sprint context router',
  'Router: byok-sprint-plan vector chunks → settings-api-keys.js → credential resolvers → E2E proof.',
  'migration_640_byok_sprint_router',
  '["inneranimalmedia","byok","keys","secrets","user_api_keys","user_secrets","r2","sprint","router"]',
  1.0,
  9,
  1,
  'tenant_sam_primeaux:au_871d920d1233cbd1:byok_sprint_router_v1',
  unixepoch()
)
ON CONFLICT(tenant_id, user_id, key) DO UPDATE SET
  value = excluded.value,
  title = excluded.title,
  summary = excluded.summary,
  workspace_id = excluded.workspace_id,
  memory_type = excluded.memory_type,
  source = excluded.source,
  tags = excluded.tags,
  confidence = excluded.confidence,
  importance = excluded.importance,
  is_pinned = excluded.is_pinned,
  sync_key = excluded.sync_key,
  updated_at = unixepoch();

UPDATE agentsam_project_context
SET
  notes = COALESCE(notes, '') || ' BYOK sprint: agentsam_memory.key=byok_sprint_router_v1; docs/platform/byok-sprint-plan.md; npm run run:ingest_byok_sprint_plan.',
  updated_at = unixepoch()
WHERE id = 'ctx_inneranimalmedia'
  AND COALESCE(notes, '') NOT LIKE '%byok_sprint_router_v1%';
