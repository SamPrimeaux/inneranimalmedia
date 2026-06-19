-- 641: Pinned Design Studio sprint router — Agent Sam CAD creation on /dashboard/designstudio.
-- Pairs with docs/platform/designstudio-sprint-plan.md vector chunks + ctx_inneranimalmedia.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/641_designstudio_sprint_memory_router.sql

INSERT INTO agentsam_memory (
  id, tenant_id, user_id, workspace_id, memory_type, key, value, title, summary,
  source, tags, confidence, importance, is_pinned, sync_key, updated_at
) VALUES (
  'mem_designstudio_sprint_router_v1',
  'tenant_sam_primeaux',
  'au_871d920d1233cbd1',
  'ws_inneranimalmedia',
  'decision',
  'designstudio_sprint_router_v1',
  'START HERE for Design Studio + Agent Sam CAD work (2026-06-15). Route: /dashboard/designstudio. Subagent: cadcreator. (1) Semantic: docs_knowledge_search "Design Studio sprint plan" OR source_ref platform/inneranimalmedia/designstudio-sprint-plan#* in agentsam_documents_oai3large_1536 + AGENTSAM_VECTORIZE_DOCUMENTS; git SSOT docs/platform/designstudio-sprint-plan.md; re-ingest npm run run:ingest_designstudio_sprint_plan; sync npm run run:sync_designstudio_sprint_memory_vector. (2) E2E loop: blueprint → POST /api/cad/openscad/generate → agentsam_cad_jobs pending → POST /api/cad/jobs/:id/execute → Mac npm run designstudio:runner → GLB R2 → spawn VoxelEngine. (3) APIs: src/api/designstudio/, src/api/cad.js; UI gap: DesignStudioPage.tsx needs blueprints/runs/SSE wire. (4) Tables: designstudio_design_blueprints, agentsam_cad_jobs, scene_snapshots, cms_assets. (5) Deep spec: docs/inneranimalmedia/product/designstudio/E2E-COMPLETE-PLAN-2026-06.md. (6) OpenSCAD/Blender on Mac only — never Worker isolate.',
  'Design Studio sprint context router',
  'Router: designstudio-sprint-plan → cad APIs → runner → viewport spawn.',
  'migration_641_designstudio_sprint_router',
  '["inneranimalmedia","designstudio","cad","agentsam","cadcreator","voxelengine","openscad","runner","sprint","router"]',
  1.0,
  9,
  1,
  'tenant_sam_primeaux:au_871d920d1233cbd1:designstudio_sprint_router_v1',
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
  notes = COALESCE(notes, '') || ' Design Studio sprint: agentsam_memory.key=designstudio_sprint_router_v1; docs/platform/designstudio-sprint-plan.md; npm run run:ingest_designstudio_sprint_plan.',
  updated_at = unixepoch()
WHERE id = 'ctx_inneranimalmedia'
  AND COALESCE(notes, '') NOT LIKE '%designstudio_sprint_router_v1%';
