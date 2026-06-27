-- PrimeTech CMS agent loop: save HTML, verify live, fix tool schemas, surface cms category.
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/719_cms_agent_primetech_loop.sql

UPDATE agentsam_tools
SET
  input_schema = '{"type":"object","properties":{"page_id":{"type":"string","description":"CMS page UUID"},"project_slug":{"type":"string"},"include_html":{"type":"boolean","default":true}},"required":[]}',
  description = 'Read CMS page metadata, sections, draft/published HTML excerpts, and preview_urls. Start every revision loop here.',
  updated_at = unixepoch()
WHERE tool_key IN ('agentsam_cms_read', 'cms_read');

UPDATE agentsam_tools
SET
  input_schema = '{"type":"object","properties":{"section_id":{"type":"string"},"section_data":{"type":"object","description":"Section JSON payload"}},"required":["section_id","section_data"]}',
  description = 'Update cms_page_sections.section_data, stage KV draft, write R2 draft.html. Then publish + verify.',
  updated_at = unixepoch()
WHERE tool_key IN ('agentsam_cms_write', 'cms_write');

UPDATE agentsam_tools
SET
  input_schema = '{"type":"object","properties":{"page_id":{"type":"string","description":"CMS page UUID"}},"required":["page_id"]}',
  description = 'Complete publish: draft R2 → published, D1 status=published, cache bust. Always follow with agentsam_cms_verify_live.',
  updated_at = unixepoch()
WHERE tool_key IN ('agentsam_cms_publish', 'cms_publish');

INSERT OR REPLACE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type, handler_key,
  description, input_schema, handler_config, risk_level, requires_approval, requires_confirmation,
  is_active, is_degraded, workspace_scope, sort_priority, is_global, updated_at
) VALUES
(
  'ast_agentsam_cms_save_page_html',
  'agentsam_cms_save_page_html',
  'agentsam_cms_save_page_html',
  'CMS Save Page HTML',
  'cms',
  'agent',
  'agentsam_cms_save_page_html',
  'Write full-page HTML to R2 draft.html (preserves published status). Use for remasters and full-page rewrites.',
  '{"type":"object","properties":{"page_id":{"type":"string"},"html":{"type":"string"},"title":{"type":"string"}},"required":["page_id","html"]}',
  '{"handler":"agentsam_cms_save_page_html","module":"tools/builtin/cms.js"}',
  'medium', 0, 0, 1, 0, '["*"]', 11, 1, unixepoch()
),
(
  'ast_agentsam_cms_save_injected',
  'agentsam_cms_save_injected',
  'agentsam_cms_save_injected',
  'CMS Save Injected Section',
  'cms',
  'agent',
  'agentsam_cms_save_injected',
  'Persist HTML fragment or full document as R2-backed cms_page_sections row + rebuild draft.html.',
  '{"type":"object","properties":{"page_id":{"type":"string"},"section_name":{"type":"string"},"html":{"type":"string"},"section_type":{"type":"string"},"position":{"type":"string","enum":["start","end"]}},"required":["page_id","section_name","html"]}',
  '{"handler":"agentsam_cms_save_injected","module":"tools/builtin/cms.js"}',
  'medium', 0, 0, 1, 0, '["*"]', 12, 1, unixepoch()
),
(
  'ast_agentsam_cms_verify_live',
  'agentsam_cms_verify_live',
  'agentsam_cms_verify_live',
  'CMS Verify Live URL',
  'cms',
  'agent',
  'agentsam_cms_verify_live',
  'Fetch live storefront URL and confirm 200 + real content (not Clean canvas / 404). Required to complete the PrimeTech loop.',
  '{"type":"object","properties":{"page_id":{"type":"string"},"url":{"type":"string"},"expect_title":{"type":"string"},"expect_snippet":{"type":"string"}},"required":[]}',
  '{"handler":"agentsam_cms_verify_live","module":"tools/builtin/cms.js"}',
  'low', 0, 0, 1, 0, '["*"]', 13, 1, unixepoch()
);

-- cms_edit route: CMS tools are primary; drop code.search hard requirement if present
UPDATE agentsam_route_requirements
SET required_capability_keys_json = '[]',
    optional_capability_keys_json = '["web_fetch","browser_inspect","cms_pipeline_prototype"]'
WHERE route_key = 'cms_edit'
  AND required_capability_keys_json LIKE '%code.search%';
