-- Dashboard bundle sprint follow-ups (post c38c31c perf commit)
-- plan_id: plan_may14_2026_repair
-- Gate: no chunk/CSS cuts until ANALYZE=1 treemap (bundle-stats.html) exists.

INSERT OR REPLACE INTO agentsam_todo (
  id, tenant_id, workspace_id, title, description, status, priority,
  plan_id, project_key, task_type, execution_status, sort_order,
  linked_route, context_snapshot, tags, notes, created_by, updated_at
) VALUES (
  'todo_iam_dashboard_bundle_subset_shared',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'Split subset-shared.chunk.js after bundle treemap',
  'Bundle miss after perf(dashboard) c38c31c: subset-shared.chunk.js ~737KB gzip (target <200KB). Required first step: ANALYZE=1 npm run build:vite-only → dashboard/dist/bundle-stats.html; screenshot treemap; then split. Do not split without visualizer output.',
  'open',
  'high',
  'plan_may14_2026_repair',
  'dashboard_bundle_perf',
  'execute',
  'queued',
  72,
  '/static/dashboard/app/subset-shared.chunk.js',
  '{"surface":"dashboard","plan_id":"plan_may14_2026_repair","commits":["c38c31c"],"files":["dashboard/vite.config.ts","dashboard/dist/bundle-stats.html"],"api":[],"risk_flags":["BLOCKED_UNTIL_BUNDLE_VISUALIZER"]}',
  '["dashboard","bundle","perf","subset-shared"]',
  'Gate: ANALYZE=1 build + bundle-stats.html treemap screenshot before any split.',
  'cursor_session_sync',
  datetime('now')
);

INSERT OR REPLACE INTO agentsam_todo (
  id, tenant_id, workspace_id, title, description, status, priority,
  plan_id, project_key, task_type, execution_status, sort_order,
  linked_route, context_snapshot, tags, notes, created_by, updated_at
) VALUES (
  'todo_iam_dashboard_bundle_css_routes',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'Route-scoped dashboard.css under 30KB gzip',
  'Bundle miss after perf(dashboard) c38c31c: merged dashboard.css ~59KB gzip (target <30KB). Purge-only is insufficient; needs route-scoped CSS. Defer until ANALYZE visualizer pass reveals CSS surface contributors.',
  'open',
  'medium',
  'plan_may14_2026_repair',
  'dashboard_bundle_perf',
  'execute',
  'queued',
  73,
  '/static/dashboard/app/dashboard.css',
  '{"surface":"dashboard","plan_id":"plan_may14_2026_repair","commits":["c38c31c"],"files":["dashboard/vite.config.ts","dashboard/index.css","dashboard/tailwind.config.js","dashboard/dist/bundle-stats.html"],"api":[],"risk_flags":["BLOCKED_UNTIL_BUNDLE_VISUALIZER","ROUTE_SCOPED_CSS_REQUIRED"]}',
  '["dashboard","bundle","perf","css"]',
  'Gate: defer until bundle-stats.html maps CSS contributors; then route-scoped CSS (not tighter purge alone).',
  'cursor_session_sync',
  datetime('now')
);

INSERT OR REPLACE INTO agentsam_plan_tasks (
  id, tenant_id, workspace_id, plan_id, todo_id, order_index, title,
  description, priority, category, status, files_involved, tables_involved,
  routes_involved, notes, blocked_reason
) VALUES (
  'task_iam_dashboard_bundle_subset_shared_analyze',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'plan_may14_2026_repair',
  'todo_iam_dashboard_bundle_subset_shared',
  72,
  'Analyze and split subset-shared.chunk.js',
  'Run ANALYZE=1 npm run build:vite-only; open dashboard/dist/bundle-stats.html; attach treemap screenshot; then manual-chunk or lazy split to <200KB gzip. Excalidraw-related; lazy route only.',
  'P1',
  'frontend',
  'todo',
  '["dashboard/vite.config.ts","dashboard/dist/bundle-stats.html","dashboard/components/MeetPage.tsx"]',
  '[]',
  '["/static/dashboard/app/subset-shared.chunk.js"]',
  'Parent commit c38c31c met dashboard.js target; subset-shared remains ~737KB gzip.',
  'Requires bundle-stats.html treemap evidence before code changes.'
);

INSERT OR REPLACE INTO agentsam_plan_tasks (
  id, tenant_id, workspace_id, plan_id, todo_id, order_index, title,
  description, priority, category, status, files_involved, tables_involved,
  routes_involved, notes, blocked_reason
) VALUES (
  'task_iam_dashboard_bundle_css_route_scope',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'plan_may14_2026_repair',
  'todo_iam_dashboard_bundle_css_routes',
  73,
  'Route-scoped dashboard CSS to 30KB gzip target',
  'After visualizer maps CSS contributors, split global dashboard.css into route-scoped bundles (overview shell vs full app). Target <30KB gzip on critical path; do not rely on purge-only.',
  'P2',
  'frontend',
  'todo',
  '["dashboard/vite.config.ts","dashboard/index.css","dashboard/tailwind.config.js","dashboard/App.tsx"]',
  '[]',
  '["/static/dashboard/app/dashboard.css"]',
  'Current merged dashboard.css ~59KB gzip post-purge; 30KB needs architectural CSS split.',
  'Defer until ANALYZE=1 bundle-stats.html visualizer pass completes.'
);

UPDATE agentsam_plans
SET
  tasks_total = tasks_total + 2,
  session_notes = COALESCE(session_notes, '') || char(10) || '[2026-05-20] Registered bundle miss follow-ups: todo_iam_dashboard_bundle_subset_shared + todo_iam_dashboard_bundle_css_routes (visualizer gate; no cuts yet)',
  updated_at = unixepoch()
WHERE id = 'plan_may14_2026_repair';

INSERT INTO agentsam_memory (
  id, tenant_id, user_id, workspace_id, memory_type, key, value, session_id, source, confidence
) VALUES (
  'mem_bundle_miss_followups_20260520',
  'tenant_sam_primeaux',
  'au_044647024b047493',
  'ws_inneranimalmedia',
  'project',
  'work_item_dashboard_bundle_miss_followups',
  '{"plan_id":"plan_may14_2026_repair","todos":["todo_iam_dashboard_bundle_subset_shared","todo_iam_dashboard_bundle_css_routes"],"plan_tasks":["task_iam_dashboard_bundle_subset_shared_analyze","task_iam_dashboard_bundle_css_route_scope"],"gate":"ANALYZE=1 bundle-stats.html before cuts","parent_commit":"c38c31c"}',
  'session_20260520',
  'cursor_session_sync',
  1.0
)
ON CONFLICT(tenant_id, user_id, key) DO UPDATE SET
  value = excluded.value,
  session_id = excluded.session_id,
  source = excluded.source,
  updated_at = unixepoch();
