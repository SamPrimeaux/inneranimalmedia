-- 536: Register PTY / .env.cloudflare sync scripts in agentsam_scripts.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/536_install_terminal_tunnel_env_script.sql

INSERT OR IGNORE INTO agentsam_scripts (
  id, tenant_id, workspace_id, slug, name, path, body, description, purpose,
  runner, language, script_hash, is_global, is_active, requires_env, owner_only,
  safe_to_run, approval_required, risk_level, preferred_for, notes, source_stored,
  created_at_epoch, updated_at_epoch
) VALUES
(
  'script_install_terminal_tunnel_env',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'install_terminal_tunnel_env',
  'Install terminal tunnel env (Mac + GCP + Workers)',
  'scripts/install-terminal-tunnel-env.sh',
  '',
  'Sync .env.cloudflare SSOT to Mac ~/iam-pty (.env + .env.cloudflare + .mcp_exports.sh), GCP iam-pty, Worker PTY secrets, and VM repo paths via sync-vm-env-cloudflare.sh.',
  'infra',
  'bash',
  'bash',
  '',
  0,
  1,
  1,
  1,
  1,
  0,
  'medium',
  'pty,terminal,env,worker-secrets,iam-pty',
  'Requires PTY_AUTH_TOKEN in .env.cloudflare. Flags: --mac-only, --gcp-only, --workers-only, --dry-run.',
  'repo:scripts/install-terminal-tunnel-env.sh',
  unixepoch(),
  unixepoch()
),
(
  'script_sync_vm_env_cloudflare',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'sync_vm_env_cloudflare',
  'Sync .env.cloudflare to GCP VM repo path(s)',
  'scripts/sync-vm-env-cloudflare.sh',
  '',
  'Secure scp of gitignored .env.cloudflare (+ .mcp_exports.sh) to iam-tunnel VM repo paths (chmod 600). Included in install_terminal_tunnel_env full run.',
  'infra',
  'bash',
  'bash',
  '',
  0,
  1,
  1,
  1,
  1,
  0,
  'low',
  'pty,terminal,env,gcp,vm',
  'Optional IAM_VM_ENV_REPO_PATHS in .env.cloudflare. Flag: --dry-run.',
  'repo:scripts/sync-vm-env-cloudflare.sh',
  unixepoch(),
  unixepoch()
);

UPDATE agentsam_scripts
SET
  name = 'Install terminal tunnel env (Mac + GCP + Workers)',
  path = 'scripts/install-terminal-tunnel-env.sh',
  description = 'Sync .env.cloudflare SSOT to Mac ~/iam-pty (.env + .env.cloudflare + .mcp_exports.sh), GCP iam-pty, Worker PTY secrets, and VM repo paths via sync-vm-env-cloudflare.sh.',
  purpose = 'infra',
  runner = 'bash',
  language = 'bash',
  requires_env = 1,
  owner_only = 1,
  safe_to_run = 1,
  approval_required = 0,
  risk_level = 'medium',
  preferred_for = 'pty,terminal,env,worker-secrets,iam-pty',
  notes = 'Requires PTY_AUTH_TOKEN in .env.cloudflare. Flags: --mac-only, --gcp-only, --workers-only, --dry-run.',
  source_stored = 'repo:scripts/install-terminal-tunnel-env.sh',
  updated_at_epoch = unixepoch()
WHERE slug = 'install_terminal_tunnel_env'
  AND tenant_id = 'tenant_sam_primeaux'
  AND workspace_id = 'ws_inneranimalmedia';

UPDATE agentsam_scripts
SET
  name = 'Sync .env.cloudflare to GCP VM repo path(s)',
  path = 'scripts/sync-vm-env-cloudflare.sh',
  description = 'Secure scp of gitignored .env.cloudflare (+ .mcp_exports.sh) to iam-tunnel VM repo paths (chmod 600). Included in install_terminal_tunnel_env full run.',
  purpose = 'infra',
  runner = 'bash',
  language = 'bash',
  requires_env = 1,
  owner_only = 1,
  safe_to_run = 1,
  approval_required = 0,
  risk_level = 'low',
  preferred_for = 'pty,terminal,env,gcp,vm',
  notes = 'Optional IAM_VM_ENV_REPO_PATHS in .env.cloudflare. Flag: --dry-run.',
  source_stored = 'repo:scripts/sync-vm-env-cloudflare.sh',
  updated_at_epoch = unixepoch()
WHERE slug = 'sync_vm_env_cloudflare'
  AND tenant_id = 'tenant_sam_primeaux'
  AND workspace_id = 'ws_inneranimalmedia';
