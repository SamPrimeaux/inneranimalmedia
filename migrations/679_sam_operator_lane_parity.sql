-- 679: Sam operator lane parity — five emails share identical working plane.
-- info@inneranimals.com, sam@inneranimalmedia.com, meauxbility@gmail.com,
-- ceosamprimeaux@gmail.com, inneranimalclothing@gmail.com
--
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml \
--     --file=migrations/679_sam_operator_lane_parity.sql

-- Canonical operator lane user ids (person_uuid 550e8400-e29b-41d4-a716-446655440001)
-- au_871d920d1233cbd1  info@inneranimals.com
-- au_8a5b76b737a9f14c  sam@inneranimalmedia.com
-- au_cccac6ec2360ac75  meauxbility@gmail.com
-- au_cd1d8f5ccce9e15a  ceosamprimeaux@gmail.com
-- au_32844a43aecdea33  inneranimalclothing@gmail.com

-- 1. Normalize auth_users defaults → platform workspace
UPDATE auth_users
SET default_workspace_id = 'ws_inneranimalmedia',
    active_workspace_id  = 'ws_inneranimalmedia',
    updated_at           = unixepoch()
WHERE id IN (
  'au_871d920d1233cbd1',
  'au_8a5b76b737a9f14c',
  'au_cccac6ec2360ac75',
  'au_cd1d8f5ccce9e15a',
  'au_32844a43aecdea33'
);

-- 2. Mirror workspace_members from info@ → other four operator lanes
INSERT OR IGNORE INTO workspace_members
  (workspace_id, tenant_id, user_id, member_type, role, is_active, person_uuid, created_at, updated_at)
SELECT
  wm.workspace_id,
  wm.tenant_id,
  target.user_id,
  wm.member_type,
  wm.role,
  wm.is_active,
  '550e8400-e29b-41d4-a716-446655440001',
  unixepoch(),
  unixepoch()
FROM workspace_members wm
CROSS JOIN (
  SELECT 'au_8a5b76b737a9f14c' AS user_id
  UNION ALL SELECT 'au_cccac6ec2360ac75'
  UNION ALL SELECT 'au_cd1d8f5ccce9e15a'
  UNION ALL SELECT 'au_32844a43aecdea33'
) AS target
WHERE wm.user_id = 'au_871d920d1233cbd1';

-- 3. agentsam_user_policy — operator plane on ws_inneranimalmedia
INSERT OR IGNORE INTO agentsam_user_policy
  (user_id, workspace_id, tenant_id, platform_operator, can_run_pty, terminal_ai_enabled,
   require_allowlist_for_mcp, allowed_model_tier_max)
SELECT
  u.id,
  'ws_inneranimalmedia',
  'tenant_sam_primeaux',
  1, 1, 1, 0, 4
FROM auth_users u
WHERE u.id IN (
  'au_871d920d1233cbd1',
  'au_8a5b76b737a9f14c',
  'au_cccac6ec2360ac75',
  'au_cd1d8f5ccce9e15a',
  'au_32844a43aecdea33'
);

UPDATE agentsam_user_policy
SET platform_operator         = 1,
    can_run_pty               = 1,
    terminal_ai_enabled       = 1,
    require_allowlist_for_mcp = 0,
    allowed_model_tier_max    = 4,
    updated_at                = datetime('now')
WHERE user_id IN (
  'au_871d920d1233cbd1',
  'au_8a5b76b737a9f14c',
  'au_cccac6ec2360ac75',
  'au_cd1d8f5ccce9e15a',
  'au_32844a43aecdea33'
)
  AND workspace_id = 'ws_inneranimalmedia';

-- 4. MCP OAuth surface allowlist — mirror info@ rows for lanes missing grants
INSERT OR IGNORE INTO agentsam_mcp_oauth_user_client_allowlist
  (user_id, workspace_id, client_key, tenant_id, is_active, created_at, updated_at)
SELECT
  target.user_id,
  a.workspace_id,
  a.client_key,
  a.tenant_id,
  a.is_active,
  unixepoch(),
  unixepoch()
FROM agentsam_mcp_oauth_user_client_allowlist a
CROSS JOIN (
  SELECT 'au_8a5b76b737a9f14c' AS user_id
  UNION ALL SELECT 'au_32844a43aecdea33'
) AS target
WHERE a.user_id = 'au_871d920d1233cbd1';

-- 5. Terminal cwd — all active operator lanes use host repo (not /workspace isolation)
UPDATE terminal_connections
SET cwd_strategy = 'host_default',
    updated_at   = unixepoch()
WHERE user_id IN (
  'au_871d920d1233cbd1',
  'au_8a5b76b737a9f14c',
  'au_cccac6ec2360ac75',
  'au_cd1d8f5ccce9e15a',
  'au_32844a43aecdea33'
)
  AND is_active = 1
  AND cwd_strategy != 'host_default';

-- 6. GCP operator terminal lane (phone-safe remote exec)
INSERT OR IGNORE INTO terminal_connections (
  id, workspace_id, tenant_id, name, type, connection_type, ws_url,
  auth_mode, auth_token_secret_name, bridge_key_hash, ollama_url,
  is_default, is_active, shell, platform, user_id, description, port,
  target_type, target_priority, self_service_enabled, cwd_strategy,
  created_at, updated_at
) VALUES
  ('conn_op_gcp_8a5b76', 'ws_inneranimalmedia', 'tenant_sam_primeaux',
   'GCP VM – Linux (shared)', 'pty', 'pty_tunnel', 'wss://terminal.inneranimalmedia.com',
   'secret_name', 'PTY_AUTH_TOKEN',
   '01212d175dee7adda19a1e995675153e8d7cbfaab1953c7d434cd79c5396ce66',
   'https://ollama.inneranimalmedia.com', 1, 1, '/bin/bash', 'linux',
   'au_8a5b76b737a9f14c',
   'Sam operator cloud lane — terminal.inneranimalmedia.com — host repo cwd',
   22, 'platform_vm', 50, 0, 'host_default', unixepoch(), unixepoch()),
  ('conn_op_gcp_cccac6', 'ws_inneranimalmedia', 'tenant_sam_primeaux',
   'GCP VM – Linux (shared)', 'pty', 'pty_tunnel', 'wss://terminal.inneranimalmedia.com',
   'secret_name', 'PTY_AUTH_TOKEN',
   '01212d175dee7adda19a1e995675153e8d7cbfaab1953c7d434cd79c5396ce66',
   'https://ollama.inneranimalmedia.com', 1, 1, '/bin/bash', 'linux',
   'au_cccac6ec2360ac75',
   'Sam operator cloud lane — terminal.inneranimalmedia.com — host repo cwd',
   22, 'platform_vm', 50, 0, 'host_default', unixepoch(), unixepoch()),
  ('conn_op_gcp_cd1d8f', 'ws_inneranimalmedia', 'tenant_sam_primeaux',
   'GCP VM – Linux (shared)', 'pty', 'pty_tunnel', 'wss://terminal.inneranimalmedia.com',
   'secret_name', 'PTY_AUTH_TOKEN',
   '01212d175dee7adda19a1e995675153e8d7cbfaab1953c7d434cd79c5396ce66',
   'https://ollama.inneranimalmedia.com', 1, 1, '/bin/bash', 'linux',
   'au_cd1d8f5ccce9e15a',
   'Sam operator cloud lane — terminal.inneranimalmedia.com — host repo cwd',
   22, 'platform_vm', 50, 0, 'host_default', unixepoch(), unixepoch()),
  ('conn_op_gcp_32844a', 'ws_inneranimalmedia', 'tenant_sam_primeaux',
   'GCP VM – Linux (shared)', 'pty', 'pty_tunnel', 'wss://terminal.inneranimalmedia.com',
   'secret_name', 'PTY_AUTH_TOKEN',
   '01212d175dee7adda19a1e995675153e8d7cbfaab1953c7d434cd79c5396ce66',
   'https://ollama.inneranimalmedia.com', 1, 1, '/bin/bash', 'linux',
   'au_32844a43aecdea33',
   'Sam operator cloud lane — terminal.inneranimalmedia.com — host repo cwd',
   22, 'platform_vm', 50, 0, 'host_default', unixepoch(), unixepoch());

-- 7. Mac localpty lane (when Mac is online)
INSERT OR IGNORE INTO terminal_connections (
  id, workspace_id, tenant_id, name, type, connection_type, ws_url,
  auth_mode, auth_token_secret_name, bridge_key_hash, ollama_url,
  is_default, is_active, shell, platform, user_id, description, port,
  target_type, target_priority, self_service_enabled, cwd_strategy,
  created_at, updated_at
) VALUES
  ('conn_op_local_8a5b76', 'ws_inneranimalmedia', 'tenant_sam_primeaux',
   'Sam Mac — localpty (primary)', 'pty', 'pty_tunnel', 'wss://localpty.inneranimalmedia.com',
   'secret_name', 'PTY_AUTH_TOKEN',
   '01212d175dee7adda19a1e995675153e8d7cbfaab1953c7d434cd79c5396ce66',
   'https://ollama.inneranimalmedia.com', 0, 1, '/bin/zsh', 'macos',
   'au_8a5b76b737a9f14c',
   'Sam iMac — localpty.inneranimalmedia.com — primary dev terminal (host repo cwd)',
   22, 'user_hosted_tunnel', 10, 0, 'host_default', unixepoch(), unixepoch()),
  ('conn_op_local_cccac6', 'ws_inneranimalmedia', 'tenant_sam_primeaux',
   'Sam Mac — localpty (primary)', 'pty', 'pty_tunnel', 'wss://localpty.inneranimalmedia.com',
   'secret_name', 'PTY_AUTH_TOKEN',
   '01212d175dee7adda19a1e995675153e8d7cbfaab1953c7d434cd79c5396ce66',
   'https://ollama.inneranimalmedia.com', 0, 1, '/bin/zsh', 'macos',
   'au_cccac6ec2360ac75',
   'Sam iMac — localpty.inneranimalmedia.com — primary dev terminal (host repo cwd)',
   22, 'user_hosted_tunnel', 10, 0, 'host_default', unixepoch(), unixepoch()),
  ('conn_op_local_cd1d8f', 'ws_inneranimalmedia', 'tenant_sam_primeaux',
   'Sam Mac — localpty (primary)', 'pty', 'pty_tunnel', 'wss://localpty.inneranimalmedia.com',
   'secret_name', 'PTY_AUTH_TOKEN',
   '01212d175dee7adda19a1e995675153e8d7cbfaab1953c7d434cd79c5396ce66',
   'https://ollama.inneranimalmedia.com', 0, 1, '/bin/zsh', 'macos',
   'au_cd1d8f5ccce9e15a',
   'Sam iMac — localpty.inneranimalmedia.com — primary dev terminal (host repo cwd)',
   22, 'user_hosted_tunnel', 10, 0, 'host_default', unixepoch(), unixepoch()),
  ('conn_op_local_32844a', 'ws_inneranimalmedia', 'tenant_sam_primeaux',
   'Sam Mac — localpty (primary)', 'pty', 'pty_tunnel', 'wss://localpty.inneranimalmedia.com',
   'secret_name', 'PTY_AUTH_TOKEN',
   '01212d175dee7adda19a1e995675153e8d7cbfaab1953c7d434cd79c5396ce66',
   'https://ollama.inneranimalmedia.com', 0, 1, '/bin/zsh', 'macos',
   'au_32844a43aecdea33',
   'Sam iMac — localpty.inneranimalmedia.com — primary dev terminal (host repo cwd)',
   22, 'user_hosted_tunnel', 10, 0, 'host_default', unixepoch(), unixepoch());
