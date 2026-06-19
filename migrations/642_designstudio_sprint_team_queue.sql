-- 642: Design Studio sprint team queue + cross-tool pipeline memory.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/642_designstudio_sprint_team_queue.sql

INSERT INTO agentsam_memory (
  id, tenant_id, user_id, workspace_id, memory_type, key, value, title, summary,
  source, tags, confidence, importance, is_pinned, sync_key, updated_at
) VALUES (
  'mem_team_pipeline_cross_tool_v1',
  'tenant_sam_primeaux',
  'au_871d920d1233cbd1',
  'ws_inneranimalmedia',
  'policy',
  'team_pipeline_cross_tool_v1',
  'Cross-tool sprint coordination (Claude + Cursor + Agent Sam + Connor). SSOT task queue: D1 agentsam_todo (readable via GET /api/agent/todo). Design Studio sprint todos: todo_ds_sprint_* (migration 642). Retrieval: docs_knowledge_search "Design Studio sprint plan" for full spec; agentsam_memory.key=designstudio_sprint_router_v1 for fast compass; memory_manager exact key read for routers. Before CAD work: npm run designstudio:check && npm run designstudio:smoke; keep npm run designstudio:runner alive on operator Mac. Re-sync memory routers after router edits: npm run run:sync_sprint_memory_routers.',
  'Team pipeline — cross-tool sprint coordination',
  'agentsam_todo = task queue; sprint routers + doc chunks = retrieval compass.',
  'migration_642_team_pipeline',
  '["inneranimalmedia","team","pipeline","agentsam_todo","designstudio","cursor","claude"]',
  1.0,
  8,
  1,
  'tenant_sam_primeaux:au_871d920d1233cbd1:team_pipeline_cross_tool_v1',
  unixepoch()
)
ON CONFLICT(tenant_id, user_id, key) DO UPDATE SET
  value = excluded.value,
  title = excluded.title,
  summary = excluded.summary,
  updated_at = unixepoch();

INSERT INTO agentsam_todo (
  id, tenant_id, workspace_id, title, description, status, priority, category, tags,
  sort_order, project_key, task_type, execution_status, assigned_to, linked_route, notes
) VALUES
(
  'todo_ds_sprint_env',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'DS Sprint Block 0: Toolchain + runner online',
  'Run npm run designstudio:check and designstudio:smoke. Start npm run designstudio:runner on operator Mac (OPENSCAD_BIN, BLENDER_BIN, INTERNAL_API_SECRET). Verify /api/cad/jobs/:id/execute returns pending.',
  'open',
  'high',
  'designstudio',
  '["designstudio","sprint","block-0","runner"]',
  10,
  'inneranimalmedia',
  'execute',
  'queued',
  'sam',
  '/dashboard/designstudio',
  'See docs/platform/designstudio-sprint-plan.md § Tomorrow execution checklist'
),
(
  'todo_ds_sprint_agent_tools',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'DS Sprint Block 1: Agent tool E2E (blueprint → OpenSCAD → execute → done)',
  'Verify designstudio_blueprint_create, designstudio_openscad_generate, designstudio_cad_execute via catalog. Chat test: parametric chess board → agentsam_cad_jobs done with GLB on R2.',
  'open',
  'high',
  'designstudio',
  '["designstudio","sprint","block-1","agentsam","cadcreator"]',
  20,
  'inneranimalmedia',
  'execute',
  'queued',
  'cursor',
  '/dashboard/designstudio',
  'Depends on todo_ds_sprint_env'
),
(
  'todo_ds_sprint_ui_wire',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'DS Sprint Block 2: DesignStudioPage UI wire (blueprints, SSE, spawn GLB)',
  'Wire DesignStudioPage.tsx: blueprint list, run/job poll or SSE on /api/designstudio/runs/:id/events, spawn GLB in VoxelEngine on cad_glb_ready. ProjectType.CAD panel uses API not hardcoded.',
  'open',
  'high',
  'designstudio',
  '["designstudio","sprint","block-2","ui","voxelengine"]',
  30,
  'inneranimalmedia',
  'execute',
  'queued',
  'cursor',
  '/dashboard/designstudio',
  'Depends on todo_ds_sprint_agent_tools'
),
(
  'todo_ds_sprint_runner_proof',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'DS Sprint Block 3: Runner proof (chess-board.scad → viewport)',
  'Fixture scripts/designstudio/fixtures/chess-board.scad through full pipeline. Confirm job-complete writes cms_assets and scene link.',
  'open',
  'medium',
  'designstudio',
  '["designstudio","sprint","block-3","runner","openscad"]',
  40,
  'inneranimalmedia',
  'execute',
  'queued',
  'sam',
  '/dashboard/designstudio',
  NULL
),
(
  'todo_ds_sprint_ship',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'DS Sprint Block 4: Ship criteria (iPhone chat-only CAD)',
  'Safari on /dashboard/designstudio: Agent Sam creates parametric model without toolbar clicks. Scene save links GLB. Document runner requirement in UI if pending > 2min.',
  'open',
  'medium',
  'designstudio',
  '["designstudio","sprint","block-4","ship","iphone"]',
  50,
  'inneranimalmedia',
  'execute',
  'queued',
  'team',
  '/dashboard/designstudio',
  'Definition of done in designstudio-sprint-plan.md'
)
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  description = excluded.description,
  status = excluded.status,
  priority = excluded.priority,
  category = excluded.category,
  tags = excluded.tags,
  sort_order = excluded.sort_order,
  linked_route = excluded.linked_route,
  notes = excluded.notes,
  updated_at = datetime('now');
