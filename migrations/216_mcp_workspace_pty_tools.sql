-- 216: PTY workspace tools (read/list/grep Agent Sam repo on iam-pty host)
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/216_mcp_workspace_pty_tools.sql

INSERT OR IGNORE INTO mcp_registered_tools (
  id,
  tool_name,
  tool_category,
  mcp_service_url,
  description,
  input_schema,
  requires_approval,
  enabled,
  cost_per_call_usd,
  created_at,
  updated_at
) VALUES
(
  'tool_workspace_read_file',
  'workspace_read_file',
  'terminal',
  'BUILTIN',
  'Read a text file from the Agent Sam dashboard repo on the PTY host. Path is absolute or relative to inneranimalmedia-agentsam-dashboard. Uses the same PTY/exec backend as terminal_execute (cat, stat, wc). Returns JSON: path, bytes, mtime_unix, content (truncated if very large).',
  '{"type":"object","properties":{"path":{"type":"string","description":"Absolute path or path relative to repo root"}},"required":["path"],"additionalProperties":false}',
  0,
  1,
  0,
  datetime('now'),
  datetime('now')
),
(
  'tool_workspace_list_files',
  'workspace_list_files',
  'terminal',
  'BUILTIN',
  'List files under a directory in the repo on the PTY host (find -name, excludes node_modules and ._*). Default dir is repo root. Returns JSON: paths (relative).',
  '{"type":"object","properties":{"dir":{"type":"string","description":"Directory relative to repo root or absolute under repo"},"pattern":{"type":"string","description":"Glob for find -name, e.g. *.tsx"}},"additionalProperties":false}',
  0,
  1,
  0,
  datetime('now'),
  datetime('now')
),
(
  'tool_workspace_search',
  'workspace_search',
  'terminal',
  'BUILTIN',
  'Search file contents in the repo on the PTY host (grep -rHn, fixed-string match, excludes node_modules/.git). Returns JSON: matches [{ file, line, preview }].',
  '{"type":"object","properties":{"query":{"type":"string","description":"Literal search string"},"dir":{"type":"string","description":"Directory under repo root"},"file_pattern":{"type":"string","description":"grep --include glob, e.g. *.ts"}},"required":["query"],"additionalProperties":false}',
  0,
  1,
  0,
  datetime('now'),
  datetime('now')
);

UPDATE mcp_registered_tools
SET
  modes_json = '["ask","agent","debug"]',
  updated_at = datetime('now')
WHERE id IN (
  'tool_workspace_read_file',
  'tool_workspace_list_files',
  'tool_workspace_search'
);
