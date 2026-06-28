-- Site shell chrome tools for Agent Sam (header/footer R2 draft + publish).
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/728_cms_site_shell_agent_tools.sql

INSERT OR REPLACE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type, handler_key,
  description, input_schema, handler_config, risk_level, requires_approval, requires_confirmation,
  is_active, is_degraded, workspace_scope, sort_priority, is_global, updated_at
) VALUES
(
  'ast_agentsam_cms_save_site_shell',
  'agentsam_cms_save_site_shell',
  'agentsam_cms_save_site_shell',
  'CMS Save Site Shell',
  'cms',
  'agent',
  'agentsam_cms_save_site_shell',
  'Write marketing chrome HTML to R2 draft keys (iam-header / iam-footer). Same as CMS editor Site Shell panel save.',
  '{"type":"object","properties":{"part_id":{"type":"string","enum":["header","footer"],"description":"Site chrome part"},"html":{"type":"string","description":"Full HTML fragment for header or footer"},"project_slug":{"type":"string","description":"CMS project slug (default inneranimalmedia)"}},"required":["part_id","html"]}',
  '{"handler":"agentsam_cms_save_site_shell","module":"tools/builtin/cms.js"}',
  'medium', 0, 0, 1, 0, '["*"]', 14, 1, unixepoch()
),
(
  'ast_agentsam_cms_publish_site_shell',
  'agentsam_cms_publish_site_shell',
  'agentsam_cms_publish_site_shell',
  'CMS Publish Site Shell',
  'cms',
  'agent',
  'agentsam_cms_publish_site_shell',
  'Copy site shell draft R2 → published (src/components/iam-header.html or iam-footer.html). Run after agentsam_cms_save_site_shell.',
  '{"type":"object","properties":{"part_id":{"type":"string","enum":["header","footer"]},"project_slug":{"type":"string"}},"required":["part_id"]}',
  '{"handler":"agentsam_cms_publish_site_shell","module":"tools/builtin/cms.js"}',
  'medium', 0, 0, 1, 0, '["*"]', 15, 1, unixepoch()
);
