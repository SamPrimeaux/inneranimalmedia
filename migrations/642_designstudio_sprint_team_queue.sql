-- 642: Design Studio sprint team queue + cross-tool pipeline memory.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/642_designstudio_sprint_team_queue.sql

INSERT INTO agentsam_memory (
  id, tenant_id, user_id, workspace_id, memory_type, key, value, title, summary,
  source, tags, confidence, importance, is_pinned, sync_key, updated_at
) VALUES (
  'mem_team_pipeline_cross_tool_v1',
  'tenant_sam_primeaux', 'au_871d920d1233cbd1', 'ws_inneranimalmedia',
  'policy', 'team_pipeline_cross_tool_v1',
  'Cross-tool sprint coordination (Claude + Cursor + Agent Sam + Connor). SSOT task queue: D1 agentsam_todo. Design Studio sprint todos: todo_ds_sprint_*.',
  'Team pipeline — cross-tool sprint coordination',
  'agentsam_todo = task queue; sprint routers + doc chunks = retrieval compass.',
  'migration_642_team_pipeline',
  '["inneranimalmedia","team","pipeline","agentsam_todo","designstudio"]',
  1.0, 8, 1,
  'tenant_sam_primeaux:au_871d920d1233cbd1:team_pipeline_cross_tool_v1',
  unixepoch()
)
ON CONFLICT(id) DO UPDATE SET
  value=excluded.value, title=excluded.title, summary=excluded.summary, updated_at=unixepoch();

INSERT INTO agentsam_todo (
  id, tenant_id, workspace_id, title, description, status, priority, category, tags,
  sort_order, project_key, task_type, execution_status, assigned_to, linked_route, notes
) VALUES
('todo_ds_sprint_env','tenant_sam_primeaux','ws_inneranimalmedia','DS Sprint Block 0: Toolchain + runner online','Run npm run designstudio:check and designstudio:smoke. Start npm run designstudio:runner on operator Mac.','open','high','designstudio','["designstudio","sprint","block-0","runner"]',10,'inneranimalmedia','execute','queued','sam','/dashboard/designstudio','See docs/platform/designstudio-sprint-plan.md'),
('todo_ds_sprint_agent_tools','tenant_sam_primeaux','ws_inneranimalmedia','DS Sprint Block 1: Agent tool E2E (blueprint → OpenSCAD → execute → done)','Verify designstudio_blueprint_create, designstudio_openscad_generate, designstudio_cad_execute via catalog.','open','high','designstudio','["designstudio","sprint","block-1","agentsam"]',20,'inneranimalmedia','execute','queued','cursor','/dashboard/designstudio','Depends on todo_ds_sprint_env'),
('todo_ds_sprint_ui_wire','tenant_sam_primeaux','ws_inneranimalmedia','DS Sprint Block 2: DesignStudioPage UI wire (blueprints, SSE, spawn GLB)','Wire DesignStudioPage.tsx: blueprint list, run/job poll or SSE, spawn GLB in VoxelEngine.','open','high','designstudio','["designstudio","sprint","block-2","ui"]',30,'inneranimalmedia','execute','queued','cursor','/dashboard/designstudio','Depends on todo_ds_sprint_agent_tools'),
('todo_ds_sprint_runner_proof','tenant_sam_primeaux','ws_inneranimalmedia','DS Sprint Block 3: Runner proof (chess-board.scad → viewport)','Fixture scripts/designstudio/fixtures/chess-board.scad through full pipeline.','open','medium','designstudio','["designstudio","sprint","block-3","runner"]',40,'inneranimalmedia','execute','queued','sam','/dashboard/designstudio',NULL),
('todo_ds_sprint_ship','tenant_sam_primeaux','ws_inneranimalmedia','DS Sprint Block 4: Ship criteria (iPhone chat-only CAD)','Safari on /dashboard/designstudio: Agent Sam creates parametric model without toolbar clicks.','open','medium','designstudio','["designstudio","sprint","block-4","ship"]',50,'inneranimalmedia','execute','queued','team','/dashboard/designstudio','Definition of done in designstudio-sprint-plan.md')
ON CONFLICT(id) DO UPDATE SET
  title=excluded.title, description=excluded.description, status=excluded.status,
  priority=excluded.priority, category=excluded.category, tags=excluded.tags,
  sort_order=excluded.sort_order, linked_route=excluded.linked_route,
  notes=excluded.notes, updated_at=datetime('now');
