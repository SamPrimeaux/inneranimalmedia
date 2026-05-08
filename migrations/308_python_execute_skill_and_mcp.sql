-- 308: python_execute MCP tool row + skill_code_exec description (IAM PTY /exec backend).
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/308_python_execute_skill_and_mcp.sql

UPDATE agentsam_skill
SET
  description = 'Run Python scripts, install pip packages, process data, and automate tasks using the python_execute tool. Use for: data analysis with pandas/numpy, JSON/CSV processing, API calls with requests, file operations, math and statistics, generating reports, and any multi-step computation. The Python session persists packages and environment variables within a conversation. Prefer a single well-structured script over multiple small calls. Also handles JavaScript/Node via the Anthropic code_execution sandbox for browser-compatible code.',
  updated_at = unixepoch()
WHERE id = 'skill_code_exec';

INSERT OR REPLACE INTO agentsam_mcp_tools (
  id,
  user_id,
  tool_key,
  tool_name,
  display_name,
  tool_category,
  description,
  input_schema,
  handler_type,
  enabled,
  is_active,
  risk_level,
  modes_json,
  workspace_scope,
  updated_at
) VALUES (
  'tool_python_execute',
  'sam_primeaux',
  'python_execute',
  'python_execute',
  'Python execute',
  'builtin',
  'Execute Python on the IAM PTY host (pip install, cwd, python3 -c). Same /exec backend as terminal_execute.',
  '{"type":"object","properties":{"script":{"type":"string","description":"Python source"},"pip_install":{"type":"array","items":{"type":"string"}},"working_dir":{"type":"string"},"timeout_seconds":{"type":"number"}},"required":["script"]}',
  'builtin',
  1,
  1,
  'medium',
  '["auto","agent","debug","ask"]',
  '["ws_inneranimalmedia"]',
  unixepoch()
);
