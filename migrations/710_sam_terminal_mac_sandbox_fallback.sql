-- 710: Sam operator lanes — Mac desk (localpty) + GCP sandbox mirror (sandboxterminal).
-- Phone / Mac asleep: health auto probes localpty then sandboxterminal (platform_workspace clone).
-- Does not change Connor (conn_connor_primary) or customer rows.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/710_sam_terminal_mac_sandbox_fallback.sql

-- Mac primary desk lane
UPDATE terminal_connections
SET
  cwd_strategy = 'host_default',
  target_priority = 10,
  is_default = 0,
  is_active = 1,
  description = 'Sam iMac — localpty.inneranimalmedia.com — desk lane (host repo cwd)',
  updated_at = unixepoch()
WHERE id IN ('conn_mac_local', 'conn_op_local_32844a');

-- GCP sandbox mirror — /workspace/{tenant}/{user}/inneranimalmedia (phone / Mac asleep)
UPDATE terminal_connections
SET
  ws_url = 'wss://sandboxterminal.inneranimalmedia.com',
  target_type = 'sandbox',
  cwd_strategy = 'platform_workspace',
  platform = 'linux',
  shell = '/bin/bash',
  target_priority = 25,
  is_default = 0,
  is_active = 1,
  auth_token_secret_name = 'PTY_AUTH_TOKEN',
  auth_mode = 'secret_name',
  description = 'Sam GCP sandbox — sandboxterminal — isolated workspace clone',
  updated_at = unixepoch()
WHERE id = 'conn_sam_sandbox';

-- Legacy operator terminal.* lane — tertiary (CAD/exec may still use terminal.* directly)
UPDATE terminal_connections
SET
  cwd_strategy = 'host_default',
  target_priority = 50,
  is_default = 0,
  is_active = 1,
  description = 'Sam operator cloud lane — terminal.inneranimalmedia.com — tertiary host repo cwd',
  updated_at = unixepoch()
WHERE id = 'conn_mac_shell2';

-- One default per user/workspace — clear duplicate GCP operator defaults for Sam
UPDATE terminal_connections
SET is_default = 0, updated_at = unixepoch()
WHERE user_id = 'au_871d920d1233cbd1'
  AND workspace_id = 'ws_inneranimalmedia'
  AND id NOT IN ('conn_connor_primary');
