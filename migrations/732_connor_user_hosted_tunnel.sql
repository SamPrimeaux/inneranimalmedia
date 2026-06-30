-- 732: Connor → user_hosted_tunnel on Windows PC (PowerShell, his repos).
-- Replaces sandboxterminal / platform_workspace isolation (empty /workspace paths).
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/732_connor_user_hosted_tunnel.sql

-- Retire GCP sandbox lane for Connor (was empty /workspace/{tenant}/{user}/)
UPDATE terminal_connections
SET is_active = 0,
    is_default = 0,
    description = 'Retired — Connor uses user_hosted_tunnel on Windows PC (migration 732)',
    updated_at = unixepoch()
WHERE user_id = 'au_5d17673408aaebc7'
  AND target_type IN ('sandbox', 'platform_vm')
  AND id != 'conn_connor_primary';

-- Primary lane: Windows device tunnel (inactive until cloudflared setup completes)
UPDATE terminal_connections
SET
  name = 'Connor Windows — device tunnel',
  target_type = 'user_hosted_tunnel',
  cwd_strategy = 'host_default',
  platform = 'windows',
  shell = 'powershell',
  ws_url = '',
  is_active = 0,
  is_default = 1,
  self_service_enabled = 1,
  auth_mode = 'secret_name',
  auth_token_secret_name = 'user_pty_token',
  description = 'Connor Windows PC — PowerShell via user-hosted cloudflared tunnel. Settings → Terminal to connect.',
  updated_at = unixepoch()
WHERE id = 'conn_connor_primary'
  AND user_id = 'au_5d17673408aaebc7';

INSERT OR IGNORE INTO workspace_settings (workspace_id, settings_json, updated_at)
VALUES (
  'ws_connor_mcneely',
  '{}',
  unixepoch()
);

UPDATE workspace_settings
SET settings_json = json_patch(
  COALESCE(settings_json, '{}'),
  json('{
    "workspace_root": "C:\\\\dev\\\\Skyline-Powerwashing",
    "workspace_cd_command": "cd C:\\\\dev\\\\Skyline-Powerwashing",
    "github_repo": "connordmcneely96/Skyline-Powerwashing",
    "terminal_platform": "windows",
    "terminal_shell": "powershell",
    "github": {
      "github_account": "connordmcneely96",
      "prefer_terminal_for": "multi_file_scaffolds",
      "notes": "Clone repo locally; agent exec runs on Connor PC via user_hosted_tunnel"
    }
  }')
),
updated_at = unixepoch()
WHERE workspace_id = 'ws_connor_mcneely';

UPDATE agentsam_tools
SET description = 'Run a shell command on the signed-in user''s own machine via their provisioned device tunnel (user_hosted_tunnel). Sam: Mac zsh at localpty. Connor: Windows PowerShell on his PC. Requires Settings → Terminal device setup. Not for GCP VM — operators use agentsam_terminal_remote when away from desk.',
    updated_at = datetime('now')
WHERE tool_key = 'agentsam_terminal_local';
