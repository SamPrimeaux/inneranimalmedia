-- 838: Re-activate workspace FS search/edit for code-develop profile + WORKSPACE-001.
-- These rows were deactivated during catalog remasters but handlers still exist.

UPDATE agentsam_tools
SET is_active = 1,
    oauth_visible = 1,
    updated_at = unixepoch()
WHERE tool_key IN ('fs_search_files', 'fs_edit_file')
   OR tool_name IN ('fs_search_files', 'fs_edit_file');
