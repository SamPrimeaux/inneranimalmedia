-- 741: Project spine columns + backfill (run before 740 archive cleanup that references project_id).
-- Idempotent note: ALTER ADD COLUMN fails if column already exists — safe to skip that statement in console if re-running.

ALTER TABLE kanban_tasks ADD COLUMN project_id TEXT;

UPDATE kanban_tasks
SET project_id = (
  SELECT kb.project_id
  FROM kanban_boards kb
  WHERE kb.id = kanban_tasks.board_id
)
WHERE project_id IS NULL;

ALTER TABLE agentsam_todo ADD COLUMN project_id TEXT;

UPDATE agentsam_todo SET project_id = 'inneranimalmedia'
WHERE project_key IN (
  'inneranimalmedia','inneranimalmedia-mcp-server','mcp_server','mcp-dispatch','mcp',
  'dashboard_agent_go_no_go','designstudio','designstudio-games-2026-06'
) AND (project_id IS NULL OR TRIM(project_id) = '');

UPDATE agentsam_todo SET project_id = 'proj_mqaxampl_ri9bkq'
WHERE project_key = 'companionscpas' AND (project_id IS NULL OR TRIM(project_id) = '');

UPDATE agentsam_todo SET project_id = 'proj_fuelnfreetime'
WHERE project_key = 'fuelnfreetime' AND (project_id IS NULL OR TRIM(project_id) = '');

UPDATE kanban_boards
SET project_id = 'inneranimalmedia',
    workspace_id = 'ws_inneranimalmedia',
    updated_at = unixepoch()
WHERE id = 'kb_28b68f4f506e46f2';

UPDATE kanban_boards
SET project_id = 'proj_mqaxampl_ri9bkq',
    workspace_id = 'ws_companionscpas',
    updated_at = unixepoch()
WHERE id = 'board_companionscpas';

UPDATE workspace_projects
SET workspace_id = 'ws_companionscpas',
    metadata_json = json_patch(
      metadata_json,
      '{"projects_table_id":"proj_mqaxampl_ri9bkq","project_id":"proj_mqaxampl_ri9bkq"}'
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'wp_companions_cpas_001';

UPDATE agentsam_todo
SET status = 'done',
    execution_status = 'done',
    completed_at = COALESCE(completed_at, datetime('now')),
    updated_at = datetime('now')
WHERE category = 'designstudio'
  AND title LIKE 'CAD job failed%'
  AND workspace_id = 'ws_inneranimalmedia'
  AND LOWER(COALESCE(status, '')) NOT IN ('done', 'completed', 'cancelled');
