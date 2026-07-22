-- 994: Sam PTY lane order — Mac local → GCP remote → sandbox (last).
-- One Mac row (conn_mac_local). Deactivate duplicate GCP shell2. Activate sandbox as tertiary.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/994_sam_pty_lane_local_remote_sandbox.sql

-- Mac desk primary
UPDATE terminal_connections
SET
  target_priority = 10,
  is_default = 1,
  is_active = 1,
  description = 'Sam Mac — localpty.inneranimalmedia.com — primary desk lane',
  updated_at = unixepoch()
WHERE id = 'conn_mac_local'
  AND user_id = 'au_871d920d1233cbd1';

-- GCP iam-tunnel secondary (always-on remote)
UPDATE terminal_connections
SET
  target_priority = 45,
  is_default = 0,
  is_active = 1,
  description = 'Sam GCP iam-tunnel — terminal.inneranimalmedia.com — remote fallback',
  updated_at = unixepoch()
WHERE id = 'conn_gcp_iam_tunnel'
  AND user_id = 'au_871d920d1233cbd1';

-- Duplicate GCP row (same host as conn_gcp_iam_tunnel) — deactivate
UPDATE terminal_connections
SET
  is_active = 0,
  is_default = 0,
  description = 'Deprecated duplicate of conn_gcp_iam_tunnel — use remote fallback chain',
  updated_at = unixepoch()
WHERE id = 'conn_mac_shell2'
  AND user_id = 'au_871d920d1233cbd1';

-- Sandbox tertiary (no desk machine)
UPDATE terminal_connections
SET
  ws_url = 'wss://sandboxterminal.inneranimalmedia.com',
  target_type = 'sandbox',
  cwd_strategy = 'platform_workspace',
  target_priority = 90,
  is_default = 0,
  is_active = 1,
  auth_token_secret_name = COALESCE(NULLIF(TRIM(auth_token_secret_name), ''), 'PTY_AUTH_TOKEN'),
  auth_mode = COALESCE(NULLIF(TRIM(auth_mode), ''), 'secret_name'),
  description = 'Sam sandbox — sandboxterminal — last-resort isolated workspace',
  updated_at = unixepoch()
WHERE id = 'conn_sam_sandbox'
  AND user_id = 'au_871d920d1233cbd1';

-- Ensure only one default for Sam workspace
UPDATE terminal_connections
SET is_default = 0, updated_at = unixepoch()
WHERE user_id = 'au_871d920d1233cbd1'
  AND workspace_id = 'ws_inneranimalmedia'
  AND id != 'conn_mac_local'
  AND is_default = 1;
