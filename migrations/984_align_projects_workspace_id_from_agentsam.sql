-- 984: Align projects.workspace_id to agentsam_workspace (SSOT for project→workspace).
-- Drift symptom: proj_companions_cpas_web.workspace_id = ws_inneranimalmedia while
-- agentsam_workspace.project_id correctly points at ws_companionscpas.
-- Also heal IAM agentsam_workspace.project_id → projects.id = inneranimalmedia.

-- 1) projects.workspace_id ← active agentsam_workspace.id when linked by project_id
UPDATE projects
SET workspace_id = (
      SELECT aw.id
        FROM agentsam_workspace aw
       WHERE aw.project_id = projects.id
         AND aw.status = 'active'
       ORDER BY aw.updated_at DESC
       LIMIT 1
    ),
    updated_at = datetime('now')
WHERE id IN (
  SELECT p.id
    FROM projects p
    INNER JOIN agentsam_workspace aw
      ON aw.project_id = p.id
     AND aw.status = 'active'
   WHERE COALESCE(p.workspace_id, '') != aw.id
);

-- Explicit Companions pin (idempotent) — primary customer workspace under test.
UPDATE projects
SET workspace_id = 'ws_companionscpas',
    updated_at = datetime('now')
WHERE id = 'proj_companions_cpas_web'
  AND COALESCE(workspace_id, '') != 'ws_companionscpas';

-- 2) IAM platform project id is `inneranimalmedia` (not proj_inneranimalmedia).
UPDATE agentsam_workspace
SET project_id = 'inneranimalmedia',
    updated_at = unixepoch()
WHERE id = 'ws_inneranimalmedia'
  AND COALESCE(project_id, '') IN ('proj_inneranimalmedia', '')
  AND EXISTS (SELECT 1 FROM projects WHERE id = 'inneranimalmedia');

UPDATE projects
SET workspace_id = 'ws_inneranimalmedia',
    updated_at = datetime('now')
WHERE id = 'inneranimalmedia'
  AND COALESCE(workspace_id, '') != 'ws_inneranimalmedia';
