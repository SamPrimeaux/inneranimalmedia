-- Canvas layout coordinates on agentsam_workflow_nodes (Workflow Studio drag/save).
-- Production note: pos_x was added earlier on remote D1; pos_y was added 2026-05-20.
-- If pos_x already exists, run only the pos_y line (or skip if both exist).

-- ALTER TABLE agentsam_workflow_nodes ADD COLUMN pos_x REAL;  -- skip if duplicate
ALTER TABLE agentsam_workflow_nodes ADD COLUMN pos_y REAL;
