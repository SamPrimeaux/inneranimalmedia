-- 713: SSH service identity secret name + command-run exec_identity audit column.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/713_terminal_exec_identity_audit.sql

ALTER TABLE terminal_connections ADD COLUMN ssh_identity_secret_name TEXT;

UPDATE terminal_connections
SET ssh_identity_secret_name = 'AGENTSAM_IAM_TUNNEL_SSH_KEY',
    updated_at = unixepoch()
WHERE privileged_target_id = 'conn_gcp_iam_tunnel'
   OR id = 'conn_gcp_iam_tunnel';

ALTER TABLE agentsam_command_run ADD COLUMN exec_identity TEXT;
