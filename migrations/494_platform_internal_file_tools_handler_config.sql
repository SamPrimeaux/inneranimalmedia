-- P0 file evidence tools: platform auth without Wrangler secrets (Worker-internal dispatch).

UPDATE agentsam_tools
SET
  handler_config = json_patch(
    CASE
      WHEN handler_config IS NULL OR trim(handler_config) = '' OR handler_config = '{}' THEN '{}'
      ELSE handler_config
    END,
    '{"auth_source":"platform","binding":"internal","platform_bindingless":true}'
  ),
  updated_at = unixepoch()
WHERE is_active = 1
  AND tool_key IN ('fs_read_file', 'fs_write_file', 'fs_edit_file', 'fs_search_files', 'workspace_read_file', 'workspace_list_files', 'workspace_search');
