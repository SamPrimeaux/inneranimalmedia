-- 960: ChatGPT/Claude connector surface — promote GCP terminal into the capped top-N list.
--
-- Root cause: CONNECTOR_TOOL_SURFACE_MAX (36) + connector_priority 190–210 meant
-- agentsam_terminal_* never appeared in tools/list for external connectors even when
-- oauth_visible=1 and expose_on_connector=1 (53 exposed rows; cut after ~github_search).
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/960_chatgpt_connector_terminal_remote_priority.sql

UPDATE agentsam_tools
SET
  description = 'GCP cloud desk (terminal.inneranimalmedia.com / iam-tunnel). Primary shell for ChatGPT/Claude OAuth and phone when Mac is asleep — git, wrangler worker-only, sparse clones. Prefer over sandbox for operator persistent repo state. Platform-operator only.',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_terminal_remote';

UPDATE agentsam_mcp_oauth_tool_allowlist
SET
  is_active = 1,
  expose_on_connector = 1,
  connector_priority = 16,
  access_class = 'write',
  runtime_contract_key = 'agentsam_terminal_remote',
  sort_order = 16,
  notes = '960: ChatGPT connector — GCP remote inside top-N surface',
  updated_at = unixepoch()
WHERE client_id = 'iam_mcp_inneranimalmedia'
  AND tool_key = 'agentsam_terminal_remote';

UPDATE agentsam_mcp_oauth_tool_allowlist
SET
  is_active = 1,
  expose_on_connector = 1,
  connector_priority = 17,
  access_class = 'write',
  runtime_contract_key = 'agentsam_terminal_sandbox',
  sort_order = 17,
  notes = '960: ChatGPT connector — sandbox inside top-N surface',
  updated_at = unixepoch()
WHERE client_id = 'iam_mcp_inneranimalmedia'
  AND tool_key = 'agentsam_terminal_sandbox';

UPDATE agentsam_mcp_oauth_tool_allowlist
SET
  is_active = 1,
  expose_on_connector = 1,
  connector_priority = 18,
  access_class = 'write',
  runtime_contract_key = 'agentsam_terminal_local',
  sort_order = 18,
  notes = '960: ChatGPT connector — localpty inside top-N surface',
  updated_at = unixepoch()
WHERE client_id = 'iam_mcp_inneranimalmedia'
  AND tool_key = 'agentsam_terminal_local';

INSERT INTO agentsam_mcp_oauth_tool_allowlist (
  client_id, tool_key, is_active, expose_on_connector, connector_priority,
  access_class, runtime_contract_key, sort_order, notes, updated_at
)
SELECT
  'iam_mcp_inneranimalmedia',
  'agentsam_terminal_remote',
  1, 1, 16, 'write', 'agentsam_terminal_remote', 16,
  '960: ChatGPT connector — GCP remote inside top-N surface',
  unixepoch()
WHERE NOT EXISTS (
  SELECT 1 FROM agentsam_mcp_oauth_tool_allowlist
  WHERE client_id = 'iam_mcp_inneranimalmedia' AND tool_key = 'agentsam_terminal_remote'
);
