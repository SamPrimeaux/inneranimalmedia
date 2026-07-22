-- 467: May 29 2026 session plan + project memory (Cursor/Worker infra milestones).
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/467_plan_may29_session_notes_and_memory.sql

INSERT INTO agentsam_plans (
  id, tenant_id, workspace_id, plan_date, plan_type, title, status,
  session_notes, carry_over_from, tasks_total, tasks_done, linked_project_keys, created_at, updated_at
) VALUES (
  'plan_may29_agentsam_session_notes', 'tenant_sam_primeaux', 'ws_inneranimalmedia',
  '2026-05-29', 'daily', 'May 29 2026 — Agent Sam Cursor/Worker infra + lane spine session', 'active',
  '[2026-05-29] Daily session plan. HEAD 56b4a7e (R2 get/put/delete). Deploy abe10380.',
  'plan_may22_2026_agent_sam', 0, 0,
  '["agent_sam","cursor_parity","data_plane"]', unixepoch(), unixepoch()
)
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title, status = excluded.status,
  session_notes = excluded.session_notes, carry_over_from = excluded.carry_over_from,
  linked_project_keys = excluded.linked_project_keys, updated_at = unixepoch();

INSERT INTO agentsam_memory (
  id, tenant_id, user_id, workspace_id, memory_type, key, value,
  session_id, source, confidence, tags, created_at, updated_at
) VALUES (
  'mem_may29_cursor_worker_milestones', 'tenant_sam_primeaux', 'au_871d920d1233cbd1',
  'ws_inneranimalmedia', 'project', 'project_may29_2026_cursor_worker_milestones',
  '{"plan_id":"plan_may29_agentsam_session_notes","commit_head":"56b4a7e","worker_version":"abe10380"}',
  'session_20260529', 'cursor_session_sync', 1.0,
  '["may29","cursor","worker","milestones","infra"]',
  unixepoch(), unixepoch()
)
ON CONFLICT(id) DO UPDATE SET
  value = excluded.value, session_id = excluded.session_id,
  source = excluded.source, tags = excluded.tags, updated_at = unixepoch();
