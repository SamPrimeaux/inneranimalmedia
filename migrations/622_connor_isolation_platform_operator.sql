-- 622: Connor isolation — sandboxterminal lane, platform_operator policy, no terminal.*
--
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml \
--     --file=migrations/622_connor_isolation_platform_operator.sql

ALTER TABLE agentsam_user_policy ADD COLUMN platform_operator INTEGER NOT NULL DEFAULT 0;

-- Connor → sandbox only (never production terminal.* or localpty)
UPDATE terminal_connections
SET ws_url = 'wss://sandboxterminal.inneranimalmedia.com',
    target_type = 'sandbox',
    cwd_strategy = 'platform_workspace',
    platform = 'linux',
    shell = '/bin/bash',
    target_priority = 50,
    is_active = 1,
    is_default = 1,
    auth_token_secret_name = 'PTY_AUTH_TOKEN',
    auth_mode = 'secret_name',
    description = 'Connor sandbox lane — isolated /workspace/{tenant}/{user}/ via sandboxterminal.inneranimalmedia.com',
    updated_at = unixepoch()
WHERE id = 'conn_connor_primary';

UPDATE terminal_connections
SET is_active = 0,
    updated_at = unixepoch()
WHERE user_id = 'au_5d17673408aaebc7'
  AND id != 'conn_connor_primary'
  AND (
    ws_url LIKE '%terminal.inneranimalmedia.com%'
    OR ws_url LIKE '%localpty.inneranimalmedia.com%'
  );

-- Sam tenant superadmins → platform_operator on platform workspace
INSERT OR IGNORE INTO agentsam_user_policy (
  user_id,
  workspace_id,
  tenant_id,
  can_run_pty,
  platform_operator,
  tool_risk_level_max,
  updated_at
)
SELECT
  au.id,
  'ws_inneranimalmedia',
  'tenant_sam_primeaux',
  1,
  1,
  'high',
  datetime('now')
FROM auth_users au
WHERE au.is_superadmin = 1
  AND au.tenant_id = 'tenant_sam_primeaux';

UPDATE agentsam_user_policy
SET platform_operator = 1,
    updated_at = datetime('now')
WHERE user_id IN (
  SELECT id FROM auth_users
  WHERE is_superadmin = 1 AND tenant_id = 'tenant_sam_primeaux'
);

-- Connor explicit deny (junior dev — sandbox dashboard PTY only)
UPDATE agentsam_user_policy
SET platform_operator = 0,
    updated_at = datetime('now')
WHERE user_id = 'au_5d17673408aaebc7';
