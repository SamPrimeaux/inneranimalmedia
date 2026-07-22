-- 641: Pinned Design Studio sprint router.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/641_designstudio_sprint_memory_router.sql

INSERT INTO agentsam_memory (
  id, tenant_id, user_id, workspace_id, memory_type, key, value, title, summary,
  source, tags, confidence, importance, is_pinned, sync_key, updated_at
) VALUES (
  'mem_designstudio_sprint_router_v1',
  'tenant_sam_primeaux', 'au_871d920d1233cbd1', 'ws_inneranimalmedia',
  'decision', 'designstudio_sprint_router_v1',
  'START HERE for Design Studio + Agent Sam CAD work (2026-06-15). Route: /dashboard/designstudio. E2E: blueprint → POST /api/cad/openscad/generate → agentsam_cad_jobs → execute → GLB R2 → VoxelEngine.',
  'Design Studio sprint context router',
  'Router: designstudio-sprint-plan → cad APIs → runner → viewport spawn.',
  'migration_641_designstudio_sprint_router',
  '["inneranimalmedia","designstudio","cad","agentsam","sprint","router"]',
  1.0, 9, 1,
  'tenant_sam_primeaux:au_871d920d1233cbd1:designstudio_sprint_router_v1',
  unixepoch()
)
ON CONFLICT(id) DO UPDATE SET
  value = excluded.value, title = excluded.title, summary = excluded.summary,
  workspace_id = excluded.workspace_id, memory_type = excluded.memory_type,
  source = excluded.source, tags = excluded.tags, confidence = excluded.confidence,
  importance = excluded.importance, is_pinned = excluded.is_pinned,
  sync_key = excluded.sync_key, updated_at = unixepoch();

UPDATE agentsam_project_context
SET notes = COALESCE(notes, '') || ' Design Studio sprint: agentsam_memory.key=designstudio_sprint_router_v1.',
    updated_at = unixepoch()
WHERE id = 'ctx_inneranimalmedia'
  AND COALESCE(notes, '') NOT LIKE '%designstudio_sprint_router_v1%';
