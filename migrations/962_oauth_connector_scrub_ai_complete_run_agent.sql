-- 962: Scrub weak ChatGPT/Claude connector tools; promote real orientation + CF/GitHub helpers.
--
-- Demote:
--   ai_complete          — nested LLM call; the OAuth chat product already is the LLM
--   agentsam_run_agent   — opaque workflow runner; ChatGPT/Claude ARE the agent
--   agentsam_memory_manager — compat wrapper; commit/search/save are canonical
--
-- Promote (replacements + closed-loop helpers):
--   agentsam_workspace_context — who/where am I (workspace, scopes)
--   agentsam_health_check      — is the platform up
--   agentsam_search_tools      — find more catalog tools by keyword
--   agentsam_cf_workers_list   — list workers (pairs with worker_deploy)
--   agentsam_github_list_commits — commit history (pairs with github_*)
--
-- Tickets stay as dedicated tools (status machine + events + dual-pass law).
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/962_oauth_connector_scrub_ai_complete_run_agent.sql

-- Demote weak / redundant chalkboard tools (keep allowlist active for non-connector paths)
UPDATE agentsam_mcp_oauth_tool_allowlist
SET
  expose_on_connector = 0,
  notes = COALESCE(notes, '') || ' | 962: demoted — not a useful ChatGPT/Claude chalkboard tool',
  updated_at = unixepoch()
WHERE client_id = 'iam_mcp_inneranimalmedia'
  AND tool_key IN ('ai_complete', 'agentsam_run_agent', 'agentsam_memory_manager');

-- Promote orientation + discovery
UPDATE agentsam_mcp_oauth_tool_allowlist
SET
  is_active = 1,
  expose_on_connector = 1,
  connector_priority = 7,
  sort_order = 7,
  access_class = 'read',
  runtime_contract_key = 'agentsam_workspace_context',
  notes = '962: chalkboard — workspace snapshot for OAuth orientation',
  updated_at = unixepoch()
WHERE client_id = 'iam_mcp_inneranimalmedia'
  AND tool_key = 'agentsam_workspace_context';

INSERT INTO agentsam_mcp_oauth_tool_allowlist (
  client_id, tool_key, is_active, expose_on_connector, connector_priority,
  access_class, runtime_contract_key, sort_order, notes, updated_at
)
SELECT
  'iam_mcp_inneranimalmedia', 'agentsam_workspace_context', 1, 1, 7,
  'read', 'agentsam_workspace_context', 7,
  '962: chalkboard — workspace snapshot for OAuth orientation', unixepoch()
WHERE NOT EXISTS (
  SELECT 1 FROM agentsam_mcp_oauth_tool_allowlist
  WHERE client_id = 'iam_mcp_inneranimalmedia' AND tool_key = 'agentsam_workspace_context'
);

UPDATE agentsam_mcp_oauth_tool_allowlist
SET
  is_active = 1,
  expose_on_connector = 1,
  connector_priority = 8,
  sort_order = 8,
  access_class = 'read',
  runtime_contract_key = 'agentsam_health_check',
  notes = '962: chalkboard — platform health',
  updated_at = unixepoch()
WHERE client_id = 'iam_mcp_inneranimalmedia'
  AND tool_key = 'agentsam_health_check';

INSERT INTO agentsam_mcp_oauth_tool_allowlist (
  client_id, tool_key, is_active, expose_on_connector, connector_priority,
  access_class, runtime_contract_key, sort_order, notes, updated_at
)
SELECT
  'iam_mcp_inneranimalmedia', 'agentsam_health_check', 1, 1, 8,
  'read', 'agentsam_health_check', 8,
  '962: chalkboard — platform health', unixepoch()
WHERE NOT EXISTS (
  SELECT 1 FROM agentsam_mcp_oauth_tool_allowlist
  WHERE client_id = 'iam_mcp_inneranimalmedia' AND tool_key = 'agentsam_health_check'
);

UPDATE agentsam_mcp_oauth_tool_allowlist
SET
  is_active = 1,
  expose_on_connector = 1,
  connector_priority = 9,
  sort_order = 9,
  access_class = 'read',
  runtime_contract_key = 'agentsam_search_tools',
  notes = '962: chalkboard — search catalog beyond the capped list',
  updated_at = unixepoch()
WHERE client_id = 'iam_mcp_inneranimalmedia'
  AND tool_key = 'agentsam_search_tools';

INSERT INTO agentsam_mcp_oauth_tool_allowlist (
  client_id, tool_key, is_active, expose_on_connector, connector_priority,
  access_class, runtime_contract_key, sort_order, notes, updated_at
)
SELECT
  'iam_mcp_inneranimalmedia', 'agentsam_search_tools', 1, 1, 9,
  'read', 'agentsam_search_tools', 9,
  '962: chalkboard — search catalog beyond the capped list', unixepoch()
WHERE NOT EXISTS (
  SELECT 1 FROM agentsam_mcp_oauth_tool_allowlist
  WHERE client_id = 'iam_mcp_inneranimalmedia' AND tool_key = 'agentsam_search_tools'
);

-- Promote CF / GitHub helpers that pair with existing chalkboard tools
UPDATE agentsam_mcp_oauth_tool_allowlist
SET
  is_active = 1,
  expose_on_connector = 1,
  connector_priority = 29,
  sort_order = 29,
  access_class = 'read',
  runtime_contract_key = 'agentsam_cf_workers_list',
  notes = '962: chalkboard — list workers (pairs with worker_deploy)',
  updated_at = unixepoch()
WHERE client_id = 'iam_mcp_inneranimalmedia'
  AND tool_key = 'agentsam_cf_workers_list';

INSERT INTO agentsam_mcp_oauth_tool_allowlist (
  client_id, tool_key, is_active, expose_on_connector, connector_priority,
  access_class, runtime_contract_key, sort_order, notes, updated_at
)
SELECT
  'iam_mcp_inneranimalmedia', 'agentsam_cf_workers_list', 1, 1, 29,
  'read', 'agentsam_cf_workers_list', 29,
  '962: chalkboard — list workers (pairs with worker_deploy)', unixepoch()
WHERE NOT EXISTS (
  SELECT 1 FROM agentsam_mcp_oauth_tool_allowlist
  WHERE client_id = 'iam_mcp_inneranimalmedia' AND tool_key = 'agentsam_cf_workers_list'
);

UPDATE agentsam_mcp_oauth_tool_allowlist
SET
  is_active = 1,
  expose_on_connector = 1,
  connector_priority = 124,
  sort_order = 124,
  access_class = 'read',
  runtime_contract_key = 'agentsam_github_list_commits',
  notes = '962: chalkboard — commit history (pairs with github_*)',
  updated_at = unixepoch()
WHERE client_id = 'iam_mcp_inneranimalmedia'
  AND tool_key = 'agentsam_github_list_commits';

INSERT INTO agentsam_mcp_oauth_tool_allowlist (
  client_id, tool_key, is_active, expose_on_connector, connector_priority,
  access_class, runtime_contract_key, sort_order, notes, updated_at
)
SELECT
  'iam_mcp_inneranimalmedia', 'agentsam_github_list_commits', 1, 1, 124,
  'read', 'agentsam_github_list_commits', 124,
  '962: chalkboard — commit history (pairs with github_*)', unixepoch()
WHERE NOT EXISTS (
  SELECT 1 FROM agentsam_mcp_oauth_tool_allowlist
  WHERE client_id = 'iam_mcp_inneranimalmedia' AND tool_key = 'agentsam_github_list_commits'
);

-- Ensure catalog rows are oauth-visible for the promoted tools
UPDATE agentsam_tools
SET oauth_visible = 1, is_active = 1, updated_at = unixepoch()
WHERE tool_key IN (
  'agentsam_workspace_context',
  'agentsam_health_check',
  'agentsam_search_tools',
  'agentsam_cf_workers_list',
  'agentsam_github_list_commits'
);
