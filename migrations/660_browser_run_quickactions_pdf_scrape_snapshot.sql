-- 660: Browser Run Quick Actions — pdf, scrape, snapshot MCP tools + OAuth allowlist
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/660_browser_run_quickactions_pdf_scrape_snapshot.sql

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
    'mtr_browser_run_pdf',
    '',
    'browser_run_pdf',
    'browser_run_pdf',
    'Browser Run PDF',
    'browser',
    'http',
    '{"endpoint":"https://inneranimalmedia.com/api/browser/run/pdf","method":"POST","auth_source":"platform"}',
    'Render a webpage or custom HTML as a PDF using Browser Run. Returns base64-encoded PDF bytes.',
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
    'mtr_browser_run_scrape',
    '',
    'browser_run_scrape',
    'browser_run_scrape',
    'Browser Run Scrape',
    'browser',
    'http',
    '{"endpoint":"https://inneranimalmedia.com/api/browser/run/scrape","method":"POST","auth_source":"platform"}',
    'Extract structured data from specific CSS selectors on a webpage (text, html, attributes, dimensions).',
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
    'mtr_browser_run_snapshot',
    '',
    'browser_run_snapshot',
    'browser_run_snapshot',
    'Browser Run Snapshot',
    'browser',
    'http',
    '{"endpoint":"https://inneranimalmedia.com/api/browser/run/snapshot","method":"POST","auth_source":"platform"}',
    'Capture multiple page formats in one request: HTML content, screenshot, markdown, and accessibility tree.',
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
  ('iam_mcp_inneranimalmedia', 'browser_run_pdf', 'read', 1, 0, 130, 'Browser Run Quick Action: pdf'),
  ('iam_mcp_inneranimalmedia', 'browser_run_scrape', 'read', 1, 0, 131, 'Browser Run Quick Action: scrape'),
  ('iam_mcp_inneranimalmedia', 'browser_run_snapshot', 'read', 1, 0, 132, 'Browser Run Quick Action: snapshot');

UPDATE agentsam_mcp_tools SET input_schema = '{
  "type":"object",
  "properties":{
    "url":{"type":"string","description":"URL to render as PDF"},
    "html":{"type":"string","description":"Raw HTML to render as PDF (alternative to url)"},
    "wait_for_network":{"type":"boolean","default":false},
    "pdf_options":{"type":"object","description":"PDF options (format, margins, header/footer templates)"}
  }
}', updated_at = unixepoch() WHERE tool_key = 'browser_run_pdf';

UPDATE agentsam_mcp_tools SET input_schema = '{
  "type":"object",
  "required":["url","elements"],
  "properties":{
    "url":{"type":"string"},
    "elements":{"type":"array","items":{"type":"object","required":["selector"],"properties":{"selector":{"type":"string"}}},"description":"CSS selectors to extract"},
    "wait_for_network":{"type":"boolean","default":false}
  }
}', updated_at = unixepoch() WHERE tool_key = 'browser_run_scrape';

UPDATE agentsam_mcp_tools SET input_schema = '{
  "type":"object",
  "properties":{
    "url":{"type":"string"},
    "html":{"type":"string","description":"Raw HTML snapshot source (alternative to url)"},
    "formats":{"type":"array","items":{"type":"string","enum":["content","screenshot","markdown","accessibilityTree"]},"default":["content","screenshot"]},
    "full_page":{"type":"boolean","default":false},
    "wait_for_network":{"type":"boolean","default":false}
  }
}', updated_at = unixepoch() WHERE tool_key = 'browser_run_snapshot';

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
