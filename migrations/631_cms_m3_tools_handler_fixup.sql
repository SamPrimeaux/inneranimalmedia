-- M3 follow-up: idempotent tool handler wiring (630 may have failed on duplicate project_id_text)
UPDATE cms_page_overrides
SET project_id_text = COALESCE(NULLIF(trim(project_slug), ''), CAST(project_id AS TEXT))
WHERE project_id_text IS NULL OR trim(project_id_text) = '';

CREATE INDEX IF NOT EXISTS idx_cms_page_overrides_slug_path
  ON cms_page_overrides(project_slug, path, section);

UPDATE agentsam_tools
SET
  handler_type = 'agent',
  handler_config = json_object(
    'handler', COALESCE(NULLIF(trim(handler_key), ''), tool_key),
    'module', 'tools/builtin/cms.js'
  ),
  updated_at = unixepoch()
WHERE tool_key IN ('agentsam_cms_read', 'agentsam_cms_write', 'agentsam_cms_publish')
  AND is_active = 1;
