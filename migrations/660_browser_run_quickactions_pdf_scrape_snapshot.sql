-- 660: Browser Run Quick Actions — all 9 endpoints in agentsam_tools SSOT + OAuth allowlist
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/660_browser_run_quickactions_pdf_scrape_snapshot.sql

INSERT OR IGNORE INTO agentsam_tools (
  id, tool_name, tool_key, display_name,
  handler_type, tool_category, domain,
  handler_key, handler_config,
  description, input_schema,
  risk_level, requires_approval,
  is_active, oauth_visible, is_global,
  workspace_scope, modes_json,
  sort_priority, dispatch_target,
  created_at, updated_at
) VALUES
  (
    'ast_browser_run_markdown',
    'browser_run_markdown',
    'browser_run_markdown',
    'Browser Run Markdown',
    'http', 'browser.quickaction', 'inspect',
    'browser_run_markdown',
    '{"endpoint":"https://inneranimalmedia.com/api/browser/run/markdown","method":"POST","auth_source":"platform"}',
    'Fetch any URL and return clean markdown. Faster than browser_navigate for content extraction.',
    '{"type":"object","required":["url"],"properties":{"url":{"type":"string"},"wait_for_network":{"type":"boolean","default":false}}}',
    'low', 0,
    1, 1, 1,
    '["*"]', '["auto","agent","debug"]',
    124, 'both',
    unixepoch(), unixepoch()
  ),
  (
    'ast_browser_run_content',
    'browser_run_content',
    'browser_run_content',
    'Browser Run Content',
    'http', 'browser.quickaction', 'inspect',
    'browser_run_content',
    '{"endpoint":"https://inneranimalmedia.com/api/browser/run/content","method":"POST","auth_source":"platform"}',
    'Fetch fully rendered HTML after JavaScript execution.',
    '{"type":"object","required":["url"],"properties":{"url":{"type":"string"},"wait_for_network":{"type":"boolean","default":false}}}',
    'low', 0,
    1, 1, 1,
    '["*"]', '["auto","agent","debug"]',
    125, 'both',
    unixepoch(), unixepoch()
  ),
  (
    'ast_browser_run_screenshot',
    'browser_run_screenshot',
    'browser_run_screenshot',
    'Browser Run Screenshot',
    'http', 'browser.quickaction', 'inspect',
    'browser_run_screenshot',
    '{"endpoint":"https://inneranimalmedia.com/api/browser/run/screenshot","method":"POST","auth_source":"platform"}',
    'Stateless screenshot of any URL. Returns JPEG as base64.',
    '{"type":"object","required":["url"],"properties":{"url":{"type":"string"},"full_page":{"type":"boolean","default":false}}}',
    'low', 0,
    1, 1, 1,
    '["*"]', '["auto","agent","debug"]',
    126, 'both',
    unixepoch(), unixepoch()
  ),
  (
    'ast_browser_run_links',
    'browser_run_links',
    'browser_run_links',
    'Browser Run Links',
    'http', 'browser.quickaction', 'inspect',
    'browser_run_links',
    '{"endpoint":"https://inneranimalmedia.com/api/browser/run/links","method":"POST","auth_source":"platform"}',
    'Extract all links from a web page.',
    '{"type":"object","required":["url"],"properties":{"url":{"type":"string"},"visible_only":{"type":"boolean","default":true},"exclude_external":{"type":"boolean","default":false}}}',
    'low', 0,
    1, 1, 1,
    '["*"]', '["auto","agent","debug"]',
    127, 'both',
    unixepoch(), unixepoch()
  ),
  (
    'ast_browser_run_crawl',
    'browser_run_crawl',
    'browser_run_crawl',
    'Browser Run Crawl',
    'http', 'browser.quickaction', 'inspect',
    'browser_run_crawl',
    '{"endpoint":"https://inneranimalmedia.com/api/browser/run/crawl","method":"POST","auth_source":"platform"}',
    'Crawl a site from a starting URL with configurable depth and page limit.',
    '{"type":"object","required":["url"],"properties":{"url":{"type":"string"},"limit":{"type":"integer","default":20,"maximum":100},"depth":{"type":"integer","default":3,"maximum":10},"render":{"type":"boolean","default":false}}}',
    'medium', 0,
    1, 1, 1,
    '["*"]', '["auto","agent","debug"]',
    128, 'both',
    unixepoch(), unixepoch()
  ),
  (
    'ast_browser_run_json',
    'browser_run_json',
    'browser_run_json',
    'Browser Run JSON Extract',
    'http', 'browser.quickaction', 'inspect',
    'browser_run_json',
    '{"endpoint":"https://inneranimalmedia.com/api/browser/run/json","method":"POST","auth_source":"platform"}',
    'Extract structured JSON from a webpage using a natural language prompt and schema.',
    '{"type":"object","required":["url","prompt"],"properties":{"url":{"type":"string"},"prompt":{"type":"string"},"schema":{"type":"object"}}}',
    'low', 0,
    1, 1, 1,
    '["*"]', '["auto","agent","debug"]',
    129, 'both',
    unixepoch(), unixepoch()
  ),
  (
    'ast_browser_run_pdf',
    'browser_run_pdf',
    'browser_run_pdf',
    'Browser Run PDF',
    'http', 'browser.quickaction', 'inspect',
    'browser_run_pdf',
    '{"endpoint":"https://inneranimalmedia.com/api/browser/run/pdf","method":"POST","auth_source":"platform"}',
    'Render a webpage or custom HTML as a PDF. Returns base64-encoded PDF bytes.',
    '{"type":"object","properties":{"url":{"type":"string"},"html":{"type":"string"},"wait_for_network":{"type":"boolean","default":false},"pdf_options":{"type":"object"}}}',
    'low', 0,
    1, 1, 1,
    '["*"]', '["auto","agent","debug"]',
    130, 'both',
    unixepoch(), unixepoch()
  ),
  (
    'ast_browser_run_scrape',
    'browser_run_scrape',
    'browser_run_scrape',
    'Browser Run Scrape',
    'http', 'browser.quickaction', 'inspect',
    'browser_run_scrape',
    '{"endpoint":"https://inneranimalmedia.com/api/browser/run/scrape","method":"POST","auth_source":"platform"}',
    'Extract structured data from specific CSS selectors on a webpage.',
    '{"type":"object","required":["url","elements"],"properties":{"url":{"type":"string"},"elements":{"type":"array","items":{"type":"object","required":["selector"],"properties":{"selector":{"type":"string"}}}},"wait_for_network":{"type":"boolean","default":false}}}',
    'low', 0,
    1, 1, 1,
    '["*"]', '["auto","agent","debug"]',
    131, 'both',
    unixepoch(), unixepoch()
  ),
  (
    'ast_browser_run_snapshot',
    'browser_run_snapshot',
    'browser_run_snapshot',
    'Browser Run Snapshot',
    'http', 'browser.quickaction', 'inspect',
    'browser_run_snapshot',
    '{"endpoint":"https://inneranimalmedia.com/api/browser/run/snapshot","method":"POST","auth_source":"platform"}',
    'Capture HTML, screenshot, markdown, and accessibility tree in one request.',
    '{"type":"object","properties":{"url":{"type":"string"},"html":{"type":"string"},"formats":{"type":"array","items":{"type":"string"}},"full_page":{"type":"boolean","default":false},"wait_for_network":{"type":"boolean","default":false}}}',
    'low', 0,
    1, 1, 1,
    '["*"]', '["auto","agent","debug"]',
    132, 'both',
    unixepoch(), unixepoch()
  );

INSERT OR IGNORE INTO agentsam_mcp_oauth_tool_allowlist (
  client_id, tool_key, access_class, is_active, expose_on_connector, sort_order, notes, updated_at
) VALUES
  ('iam_mcp_inneranimalmedia', 'browser_run_markdown', 'read', 1, 0, 124, 'Browser Run Quick Action: markdown', unixepoch()),
  ('iam_mcp_inneranimalmedia', 'browser_run_content', 'read', 1, 0, 125, 'Browser Run Quick Action: content', unixepoch()),
  ('iam_mcp_inneranimalmedia', 'browser_run_screenshot', 'read', 1, 0, 126, 'Browser Run Quick Action: screenshot', unixepoch()),
  ('iam_mcp_inneranimalmedia', 'browser_run_links', 'read', 1, 0, 127, 'Browser Run Quick Action: links', unixepoch()),
  ('iam_mcp_inneranimalmedia', 'browser_run_crawl', 'write', 1, 0, 128, 'Browser Run Quick Action: crawl', unixepoch()),
  ('iam_mcp_inneranimalmedia', 'browser_run_json', 'read', 1, 0, 129, 'Browser Run Quick Action: json extract', unixepoch()),
  ('iam_mcp_inneranimalmedia', 'browser_run_pdf', 'read', 1, 0, 130, 'Browser Run Quick Action: pdf', unixepoch()),
  ('iam_mcp_inneranimalmedia', 'browser_run_scrape', 'read', 1, 0, 131, 'Browser Run Quick Action: scrape', unixepoch()),
  ('iam_mcp_inneranimalmedia', 'browser_run_snapshot', 'read', 1, 0, 132, 'Browser Run Quick Action: snapshot', unixepoch());

UPDATE mcp_workspace_tokens
SET allowed_tools = (
  SELECT COALESCE(json_group_array(a.tool_key), '[]')
  FROM (
    SELECT a.tool_key
    FROM agentsam_mcp_oauth_tool_allowlist a
    INNER JOIN agentsam_tools t ON t.tool_key = a.tool_key
    WHERE a.client_id = 'iam_mcp_inneranimalmedia'
      AND COALESCE(a.is_active, 1) = 1
      AND COALESCE(t.is_active, 1) = 1
      AND COALESCE(t.is_degraded, 0) = 0
    ORDER BY a.sort_order ASC, a.tool_key ASC
  ) a
)
WHERE token_type = 'oauth'
  AND COALESCE(is_active, 1) = 1;
