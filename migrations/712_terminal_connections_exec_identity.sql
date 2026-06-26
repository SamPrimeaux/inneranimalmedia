-- 712: terminal_connections exec identity + privileged target linkage.
-- Maps connection rows to agentsam_privileged_targets.target_id and on-box exec user.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/712_terminal_connections_exec_identity.sql

ALTER TABLE terminal_connections ADD COLUMN remote_exec_user TEXT;
ALTER TABLE terminal_connections ADD COLUMN privileged_target_id TEXT;

-- Canonical privileged GCP lane (AgentSam ops hands)
INSERT OR IGNORE INTO terminal_connections (
  id, workspace_id, tenant_id, name, type, connection_type, ws_url,
  auth_mode, auth_token_secret_name, bridge_key_hash, ollama_url,
  is_default, is_active, shell, platform, user_id, description, port,
  target_type, target_priority, self_service_enabled, cwd_strategy,
  remote_exec_user, privileged_target_id,
  created_at, updated_at
) VALUES (
  'conn_gcp_iam_tunnel',
  'ws_inneranimalmedia',
  'tenant_sam_primeaux',
  'iam-tunnel — AgentSam ops',
  'pty',
  'pty_tunnel',
  'wss://terminal.inneranimalmedia.com',
  'secret_name',
  'PTY_AUTH_TOKEN',
  '01212d175dee7adda19a1e995675153e8d7cbfaab1953c7d434cd79c5396ce66',
  'https://ollama.inneranimalmedia.com',
  0,
  1,
  '/bin/bash',
  'linux',
  'au_871d920d1233cbd1',
  'GCP iam-tunnel — ExecOS runs as agentsam — scoped sudo for patch/tunnel ops',
  22,
  'platform_vm',
  45,
  0,
  'host_default',
  'agentsam',
  'conn_gcp_iam_tunnel',
  unixepoch(),
  unixepoch()
);

-- Link existing GCP operator lanes to the privileged target + agentsam exec user
UPDATE terminal_connections
SET
  remote_exec_user = 'agentsam',
  privileged_target_id = 'conn_gcp_iam_tunnel',
  updated_at = unixepoch()
WHERE workspace_id = 'ws_inneranimalmedia'
  AND target_type IN ('platform_vm', 'sandbox')
  AND is_active = 1
  AND (
    ws_url LIKE '%terminal.inneranimalmedia.com%'
    OR ws_url LIKE '%sandboxterminal.inneranimalmedia.com%'
  );

UPDATE terminal_connections
SET
  remote_exec_user = 'agentsam',
  privileged_target_id = 'conn_gcp_iam_tunnel',
  updated_at = unixepoch()
WHERE id IN (
  'conn_mac_shell2',
  'conn_sam_sandbox',
  'conn_op_gcp_8a5b76',
  'conn_op_gcp_cccac6',
  'conn_op_gcp_cd1d8f',
  'conn_op_gcp_32844a',
  'conn_gcp_iam_tunnel'
);
