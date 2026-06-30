-- ================================================================
-- SPINE MIGRATION: Project link + CAD cleanup + workspace fixes
-- Run via: CF Dashboard → D1 → cf87b717 → Console → paste + Execute
-- Or: wrangler d1 execute inneranimalmedia --file=migrations/spine_project_link.sql --remote
-- ================================================================

-- ---------------------------------------------------------------
-- BREAK 1: Add project_id to kanban_tasks
-- ---------------------------------------------------------------
ALTER TABLE kanban_tasks ADD COLUMN project_id TEXT;

-- Back-fill from the board's project_id
UPDATE kanban_tasks
SET project_id = (
  SELECT kb.project_id
  FROM kanban_boards kb
  WHERE kb.id = kanban_tasks.board_id
)
WHERE project_id IS NULL;

-- ---------------------------------------------------------------
-- BREAK 2: Add project_id to agentsam_todo
-- ---------------------------------------------------------------
ALTER TABLE agentsam_todo ADD COLUMN project_id TEXT;

-- Back-fill: map known project_key slugs → canonical projects.id
UPDATE agentsam_todo SET project_id = 'inneranimalmedia'        WHERE project_key IN ('inneranimalmedia','inneranimalmedia-mcp-server','mcp_server','mcp-dispatch','mcp','dashboard_agent_go_no_go','designstudio','designstudio-games-2026-06') AND project_id IS NULL;
UPDATE agentsam_todo SET project_id = 'proj_mqaxampl_ri9bkq'   WHERE project_key = 'companionscpas'  AND project_id IS NULL;
UPDATE agentsam_todo SET project_id = 'proj_fuelnfreetime'      WHERE project_key = 'fuelnfreetime'   AND project_id IS NULL;

-- ---------------------------------------------------------------
-- BREAK 3: Fix kanban_boards — wire IAM + CPAS boards to projects
-- ---------------------------------------------------------------
UPDATE kanban_boards
SET project_id   = 'inneranimalmedia',
    workspace_id = 'ws_inneranimalmedia',
    updated_at   = unixepoch()
WHERE id = 'kb_28b68f4f506e46f2';

UPDATE kanban_boards
SET project_id   = 'proj_mqaxampl_ri9bkq',
    workspace_id = 'ws_companionscpas',
    updated_at   = unixepoch()
WHERE id = 'board_companionscpas';

-- ---------------------------------------------------------------
-- BREAK 3b: Fix workspace_projects — move CPAS to correct workspace
-- ---------------------------------------------------------------
UPDATE workspace_projects
SET workspace_id  = 'ws_companionscpas',
    metadata_json = json_patch(
      metadata_json,
      '{"projects_table_id":"proj_mqaxampl_ri9bkq","project_id":"proj_mqaxampl_ri9bkq"}'
    ),
    updated_at    = CURRENT_TIMESTAMP
WHERE id = 'wp_companions_cpas_001';

-- ---------------------------------------------------------------
-- CLEANUP: Archive all CAD failure spam todos
-- ---------------------------------------------------------------
UPDATE agentsam_todo
SET status     = 'done',
    updated_at = datetime('now')
WHERE category = 'designstudio'
  AND title LIKE 'CAD job failed%'
  AND workspace_id = 'ws_inneranimalmedia';
