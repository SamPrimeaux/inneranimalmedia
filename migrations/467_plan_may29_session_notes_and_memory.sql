-- 467: May 29 2026 session plan + project memory (Cursor/Worker infra milestones).
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/467_plan_may29_session_notes_and_memory.sql

INSERT INTO agentsam_plans (
  id,
  tenant_id,
  workspace_id,
  plan_date,
  plan_type,
  title,
  status,
  session_notes,
  carry_over_from,
  tasks_total,
  tasks_done,
  linked_project_keys,
  created_at,
  updated_at
) VALUES (
  'plan_may29_agentsam_session_notes',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  '2026-05-29',
  'daily',
  'May 29 2026 — Agent Sam Cursor/Worker infra + lane spine session',
  'active',
  '[2026-05-29] Daily session plan. ~30 commits May 28–29. HEAD 56b4a7e (R2 get/put/delete). Deploy abe10380.

WORKER PLATFORM: MCP catalog D1 SSOT (450); Thompson agent_run loop + codemode bridge (453/95b70a0); terminal platform_vm vs tunnel + slash /agentsam /models (431/444/449); codebase reindex script; production cron/telemetry/cache fixes.

CURSOR INTEGRATION: infra activation (454) cursor_sdk + hook-dispatcher + webhook-workflow-dispatch + cursor webhooks; ACP bridge /api/cursor/acp + shell guard hooks + MCP health cron; cloud agent spawn + external_agent_id; wf_on_* webhook graphs (456); mcp.json untracked + CF skills/rules (461); prompt_route mcp_template tool merge.

AGENT LANES: Tavily open_web_search + execution_lane metadata (453–457); fs_search_files/workspace_grep + active-file envelope + mode tool policy; Monaco bypass for read-only repo search; lane-aware retrieval (no unified RAG on chat); semantic+DB assistant tools (462); customer data plane security — no platform DB fallback (464/465, c75e529); R2 agent CRUD only (466, 56b4a7e).

MIGRATIONS APPLIED REMOTE: 450–466. Prior sprint: plan_may22_2026_agent_sam.',
  'plan_may22_2026_agent_sam',
  0,
  0,
  '["agent_sam","cursor_parity","data_plane"]',
  unixepoch(),
  unixepoch()
)
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  status = excluded.status,
  session_notes = excluded.session_notes,
  carry_over_from = excluded.carry_over_from,
  linked_project_keys = excluded.linked_project_keys,
  updated_at = unixepoch();

INSERT INTO agentsam_memory (
  id,
  tenant_id,
  user_id,
  workspace_id,
  memory_type,
  key,
  value,
  session_id,
  source,
  confidence,
  tags,
  created_at,
  updated_at
) VALUES (
  'mem_may29_cursor_worker_milestones',
  'tenant_sam_primeaux',
  'au_871d920d1233cbd1',
  'ws_inneranimalmedia',
  'project',
  'project_may29_2026_cursor_worker_milestones',
  '{"plan_id":"plan_may29_agentsam_session_notes","parent_plan":"plan_may22_2026_agent_sam","session_date":"2026-05-29","commit_head":"56b4a7e","worker_version":"abe10380-cf1c-4fc8-9264-79f0074bc195","commit_range":"5e4ee43..56b4a7e","migrations":["450","451","452","453","454","455","456","457","458","459","460","461","462","463","464","465","466"],"milestones":{"worker_platform":["MCP D1 SSOT agentsam_tools (450)","agent_run Thompson routing + codemode bridge (95b70a0)","terminal target routing platform_vm vs tunnel (5e4ee43)","cron/telemetry/tool cache/production fixes (1b5be56)","codebase reindex Vectorize script"],"cursor_integration":["infra activation cursor_sdk hooks webhooks RAG (e08b593)","ACP JSON-RPC /api/cursor/acp + shell guard + MCP health cron (06a6ed7)","cloud agent spawn webhooks external_agent_id (baba1c7/91cfc20)","wf_on_* webhook workflow graphs all providers (3de53fe)","CF skills MCP servers cursor rules (2fc0e3b/6c4b952)","mcp.json local overlay only (2a3746c)","prompt_route mcp_template tool merge (a2d086b)"],"agent_execution":["Tavily open_web_search lanes + tool cache (a8c20c3)","fs_search_files workspace_grep active-file envelope (ca478c0)","Monaco bypass read-only repo search (6862add/4c43906)","lane-aware retrieval no unified RAG (68a0e60)","semantic+DB assistant D1 tools (7de984b)","customer data plane BYO no platform fallback (c75e529)","R2 get put delete only degrade list (56b4a7e/466)"]},"deploys":[{"sha":"c75e529","worker":"1f1f34a9-0e34-47df-8d83-161b05b30973","note":"data plane security"},{"sha":"56b4a7e","worker":"abe10380-cf1c-4fc8-9264-79f0074bc195","note":"R2 CRUD + migration 466"}]}',
  'session_20260529',
  'cursor_session_sync',
  1.0,
  '["may29","cursor","worker","milestones","infra"]',
  unixepoch(),
  unixepoch()
)
ON CONFLICT(tenant_id, user_id, key) DO UPDATE SET
  value = excluded.value,
  session_id = excluded.session_id,
  source = excluded.source,
  tags = excluded.tags,
  updated_at = unixepoch();
