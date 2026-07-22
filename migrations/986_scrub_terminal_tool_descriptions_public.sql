-- 986: Scrub operator/client names from public MCP terminal tool descriptions.
-- ChatGPT/Claude connector tools/list is PUBLIC — never name real people or devices.
-- Also clarify lane roles: remote = OAuth/phone primary; sandbox = isolated zones;
-- local = caller's own provisioned device tunnel.

UPDATE agentsam_tools
SET
  description = 'Run a shell command on the signed-in user''s own machine via their provisioned device tunnel (user_hosted_tunnel). Requires Settings → Terminal device setup. Not for cloud VM — use agentsam_terminal_remote when away from desk, or agentsam_terminal_sandbox for an isolated cloud shell.',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_terminal_local';

UPDATE agentsam_tools
SET
  description = 'Isolated cloud shell in a CF Container sandbox (MY_CONTAINER). Use for experiment zones (zone_slug: engineer, architect, cms, specialist) and disposable builds. For persistent operator repo state on the cloud desk prefer agentsam_terminal_remote; for your own machine use agentsam_terminal_local after device setup.',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_terminal_sandbox';

UPDATE agentsam_tools
SET
  description = 'Run a shell command on the platform cloud desk (always-on VM). Primary lane for ChatGPT/Claude connectors and phone when the desk machine is asleep — git, wrangler worker-only, sparse repo clones. Prefer this over sandbox for persistent operator repo state.',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_terminal_remote';

-- Keep connector pin loud + bump allowlist updated_at so MCP KV self-heal invalidates.
UPDATE agentsam_mcp_oauth_tool_allowlist
SET
  is_active = 1,
  expose_on_connector = 1,
  connector_priority = 4,
  sort_order = 4,
  access_class = 'write',
  runtime_contract_key = 'agentsam_terminal_remote',
  notes = '986: remote pin + PII-scrubbed catalog copy',
  updated_at = unixepoch()
WHERE client_id = 'iam_mcp_inneranimalmedia'
  AND tool_key = 'agentsam_terminal_remote';

UPDATE agentsam_mcp_oauth_tool_allowlist
SET
  is_active = 1,
  expose_on_connector = 1,
  connector_priority = 5,
  sort_order = 5,
  notes = '986: sandbox beside remote on connector',
  updated_at = unixepoch()
WHERE client_id = 'iam_mcp_inneranimalmedia'
  AND tool_key = 'agentsam_terminal_sandbox';

UPDATE agentsam_mcp_oauth_tool_allowlist
SET
  is_active = 1,
  expose_on_connector = 1,
  connector_priority = 6,
  sort_order = 6,
  notes = '986: local beside remote on connector',
  updated_at = unixepoch()
WHERE client_id = 'iam_mcp_inneranimalmedia'
  AND tool_key = 'agentsam_terminal_local';
