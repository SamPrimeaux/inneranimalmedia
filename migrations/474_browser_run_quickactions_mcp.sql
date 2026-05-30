-- 474: Browser Run Quick Actions — 6 MCP tools + OAuth allowlist + input schemas
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/474_browser_run_quickactions_mcp.sql

INSERT OR IGNORE INTO agentsam_mcp_tools (
  id,
  user_id,
  tool_key,
  tool_name,
  display_name,
  tool_category,
  handler_type,
  handler_config,
  description,
  input_schema,
  risk_level,
  requires_approval,
  is_active,
  enabled,
  workspace_scope,
  modes_json,
  created_at,
  updated_at
) VALUES
  (
    'mtr_browser_run_markdown',
    '',
    'browser_run_markdown',
    'browser_run_markdown',
    'Browser Run Markdown',
    'browser',
    'http',
    '{"endpoint":"https://inneranimalmedia.com/api/browser/run/markdown","method":"POST","auth_source":"platform"}',
    'Fetch any URL and return clean markdown. Use for reading docs, articles, or any web page as text. Faster than browser_navigate for content extraction.',
    '{}',
    'low',
    0,
    1,
    1,
    '["*"]',
    '["auto","agent","debug"]',
    unixepoch(),
    unixepoch()
  ),
  (
    'mtr_browser_run_content',
    '',
    'browser_run_content',
    'browser_run_content',
    'Browser Run Content',
    'browser',
    'http',
    '{"endpoint":"https://inneranimalmedia.com/api/browser/run/content","method":"POST","auth_source":"platform"}',
    'Fetch fully rendered HTML of a page after JavaScript execution. Use when you need the DOM structure, not just text.',
    '{}',
    'low',
    0,
    1,
    1,
    '["*"]',
    '["auto","agent","debug"]',
    unixepoch(),
    unixepoch()
  ),
  (
    'mtr_browser_run_screenshot',
    '',
    'browser_run_screenshot',
    'browser_run_screenshot',
    'Browser Run Screenshot',
    'browser',
    'http',
    '{"endpoint":"https://inneranimalmedia.com/api/browser/run/screenshot","method":"POST","auth_source":"platform"}',
    'Take a stateless screenshot of any URL. Faster than playwright_screenshot. Returns JPEG image as base64.',
    '{}',
    'low',
    0,
    1,
    1,
    '["*"]',
    '["auto","agent","debug"]',
    unixepoch(),
    unixepoch()
  ),
  (
    'mtr_browser_run_links',
    '',
    'browser_run_links',
    'browser_run_links',
    'Browser Run Links',
    'browser',
    'http',
    '{"endpoint":"https://inneranimalmedia.com/api/browser/run/links","method":"POST","auth_source":"platform"}',
    'Extract all links from a web page. Use to discover site structure, find related pages, or build crawl queues.',
    '{}',
    'low',
    0,
    1,
    1,
    '["*"]',
    '["auto","agent","debug"]',
    unixepoch(),
    unixepoch()
  ),
  (
    'mtr_browser_run_crawl',
    '',
    'browser_run_crawl',
    'browser_run_crawl',
    'Browser Run Crawl',
    'browser',
    'http',
    '{"endpoint":"https://inneranimalmedia.com/api/browser/run/crawl","method":"POST","auth_source":"platform"}',
    'Crawl a site starting from a URL, following links up to a configurable depth and page limit. Returns markdown for each page. Use for building knowledge bases or RAG ingest.',
    '{}',
    'medium',
    0,
    1,
    1,
    '["*"]',
    '["auto","agent","debug"]',
    unixepoch(),
    unixepoch()
  ),
  (
    'mtr_browser_run_json',
    '',
    'browser_run_json',
    'browser_run_json',
    'Browser Run JSON Extract',
    'browser',
    'http',
    '{"endpoint":"https://inneranimalmedia.com/api/browser/run/json","method":"POST","auth_source":"platform"}',
    'Extract structured JSON data from any web page using a natural language prompt and schema. Powered by Workers AI. Use for scraping product data, pricing, tables, or any structured content.',
    '{}',
    'low',
    0,
    1,
    1,
    '["*"]',
    '["auto","agent","debug"]',
    unixepoch(),
    unixepoch()
  );

INSERT OR IGNORE INTO agentsam_mcp_oauth_tool_allowlist
  (client_id, tool_key, access_class, is_active, expose_on_connector, sort_order, notes)
VALUES
  ('iam_mcp_inneranimalmedia', 'browser_run_markdown', 'read', 1, 0, 124, 'Browser Run Quick Action: markdown'),
  ('iam_mcp_inneranimalmedia', 'browser_run_content', 'read', 1, 0, 125, 'Browser Run Quick Action: content'),
  ('iam_mcp_inneranimalmedia', 'browser_run_screenshot', 'read', 1, 0, 126, 'Browser Run Quick Action: screenshot'),
  ('iam_mcp_inneranimalmedia', 'browser_run_links', 'read', 1, 0, 127, 'Browser Run Quick Action: links'),
  ('iam_mcp_inneranimalmedia', 'browser_run_crawl', 'write', 1, 0, 128, 'Browser Run Quick Action: crawl'),
  ('iam_mcp_inneranimalmedia', 'browser_run_json', 'read', 1, 0, 129, 'Browser Run Quick Action: json extract');

UPDATE agentsam_mcp_tools SET input_schema = '{
  "type":"object",
  "required":["url"],
  "properties":{
    "url":{"type":"string","description":"URL to fetch as markdown"},
    "wait_for_network":{"type":"boolean","default":false,"description":"Wait for networkidle2 before capturing. Slower but more complete for JS-heavy pages."}
  }
}', updated_at = unixepoch() WHERE tool_key = 'browser_run_markdown';

UPDATE agentsam_mcp_tools SET input_schema = '{
  "type":"object",
  "required":["url"],
  "properties":{
    "url":{"type":"string"},
    "wait_for_network":{"type":"boolean","default":false}
  }
}', updated_at = unixepoch() WHERE tool_key = 'browser_run_content';

UPDATE agentsam_mcp_tools SET input_schema = '{
  "type":"object",
  "required":["url"],
  "properties":{
    "url":{"type":"string"},
    "full_page":{"type":"boolean","default":false}
  }
}', updated_at = unixepoch() WHERE tool_key = 'browser_run_screenshot';

UPDATE agentsam_mcp_tools SET input_schema = '{
  "type":"object",
  "required":["url"],
  "properties":{
    "url":{"type":"string"},
    "visible_only":{"type":"boolean","default":true},
    "exclude_external":{"type":"boolean","default":false}
  }
}', updated_at = unixepoch() WHERE tool_key = 'browser_run_links';

UPDATE agentsam_mcp_tools SET input_schema = '{
  "type":"object",
  "required":["url"],
  "properties":{
    "url":{"type":"string","description":"Starting URL to crawl"},
    "limit":{"type":"integer","default":20,"maximum":100},
    "depth":{"type":"integer","default":3,"maximum":10},
    "render":{"type":"boolean","default":false,"description":"false = fast static fetch, true = full JS render (costs browser time)"},
    "include_subdomains":{"type":"boolean","default":false},
    "include_external":{"type":"boolean","default":false},
    "include_patterns":{"type":"array","items":{"type":"string"}},
    "exclude_patterns":{"type":"array","items":{"type":"string"}}
  }
}', updated_at = unixepoch() WHERE tool_key = 'browser_run_crawl';

UPDATE agentsam_mcp_tools SET input_schema = '{
  "type":"object",
  "required":["url","prompt"],
  "properties":{
    "url":{"type":"string"},
    "prompt":{"type":"string","description":"What data to extract. Be specific about where it appears on the page."},
    "schema":{"type":"object","description":"JSON schema defining the expected output structure"}
  }
}', updated_at = unixepoch() WHERE tool_key = 'browser_run_json';

-- Refresh OAuth token allowlists from platform registry (no per-user au_* literals)
UPDATE mcp_workspace_tokens
SET allowed_tools = (
  SELECT COALESCE(json_group_array(tool_key), '[]')
  FROM (
    SELECT tool_key
    FROM agentsam_mcp_oauth_tool_allowlist
    WHERE client_id = 'iam_mcp_inneranimalmedia'
      AND COALESCE(is_active, 1) = 1
    ORDER BY sort_order ASC, tool_key ASC
  )
)
WHERE token_type = 'oauth'
  AND COALESCE(is_active, 1) = 1;
