-- M3 CMS editor activation: project_id TEXT alignment + cms tool handler wiring
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/630_cms_m3_activation.sql

-- 5.6 project_id schema: add TEXT column for cms_page_overrides (idempotent)
ALTER TABLE cms_page_overrides ADD COLUMN project_id_text TEXT;
UPDATE cms_page_overrides
SET project_id_text = COALESCE(NULLIF(trim(project_slug), ''), CAST(project_id AS TEXT))
WHERE project_id_text IS NULL OR trim(project_id_text) = '';

CREATE INDEX IF NOT EXISTS idx_cms_page_overrides_slug_path
  ON cms_page_overrides(project_slug, path, section);

-- 5.3 Agent cms_edit tool bridge — route catalog tools through builtin cms handlers
UPDATE agentsam_tools
SET
  handler_type = 'cms',
  handler_config = json_object(
    'handler', COALESCE(NULLIF(trim(handler_key), ''), tool_key),
    'module', 'tools/builtin/cms.js'
  ),
  updated_at = unixepoch()
WHERE tool_key IN ('agentsam_cms_read', 'agentsam_cms_write', 'agentsam_cms_publish')
  AND is_active = 1;
