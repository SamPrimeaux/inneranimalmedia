-- 961: Guarantee agentsam_terminal_remote on ChatGPT/Claude connector tools/list.
--
-- Symptom: connectors reported sandbox/local (or neither) without remote despite
-- oauth_visible=1 + expose_on_connector=1. Curated surface is capped; Google
-- Calendar/Drive rows crowded priorities; some clients truncate/cache aggressively.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/961_chatgpt_claude_terminal_remote_connector_pin.sql

UPDATE agentsam_tools
SET
  description = 'Run a shell command on the GCP cloud desk (terminal.inneranimalmedia.com / iam-tunnel). Primary lane for ChatGPT, Claude, and phone when Mac is asleep — git, wrangler worker-only, sparse repo clones. Prefer this over sandbox for persistent operator repo state.',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_terminal_remote';

-- Pin terminal lanes immediately after ping / d1_query (unmissable in top-N + client truncations)
UPDATE agentsam_mcp_oauth_tool_allowlist
SET
  is_active = 1,
  expose_on_connector = 1,
  connector_priority = 4,
  sort_order = 4,
  access_class = 'write',
  runtime_contract_key = 'agentsam_terminal_remote',
  notes = '961: pin GCP remote for ChatGPT/Claude connector',
  updated_at = unixepoch()
WHERE client_id = 'iam_mcp_inneranimalmedia'
  AND tool_key = 'agentsam_terminal_remote';

UPDATE agentsam_mcp_oauth_tool_allowlist
SET
  is_active = 1,
  expose_on_connector = 1,
  connector_priority = 5,
  sort_order = 5,
  access_class = 'write',
  runtime_contract_key = 'agentsam_terminal_sandbox',
  notes = '961: pin sandbox beside remote on connector',
  updated_at = unixepoch()
WHERE client_id = 'iam_mcp_inneranimalmedia'
  AND tool_key = 'agentsam_terminal_sandbox';

UPDATE agentsam_mcp_oauth_tool_allowlist
SET
  is_active = 1,
  expose_on_connector = 1,
  connector_priority = 6,
  sort_order = 6,
  access_class = 'write',
  runtime_contract_key = 'agentsam_terminal_local',
  notes = '961: pin localpty beside remote on connector',
  updated_at = unixepoch()
WHERE client_id = 'iam_mcp_inneranimalmedia'
  AND tool_key = 'agentsam_terminal_local';

-- Free connector slots — keep allowlist active for non-connector OAuth paths
UPDATE agentsam_mcp_oauth_tool_allowlist
SET
  expose_on_connector = 0,
  notes = COALESCE(notes, '') || ' | 961: demoted from connector (terminal pin room)',
  updated_at = unixepoch()
WHERE client_id = 'iam_mcp_inneranimalmedia'
  AND tool_key IN (
    'gcal_list', 'gcal_create', 'gcal_update', 'gcal_delete',
    'gdrive_create_folder', 'gdrive_trash', 'gdrive_delete', 'gdrive_rename'
  );
