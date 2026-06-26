-- 711: D1 allowlist for scoped sudo / privileged ops per terminal target.
-- New VMs/containers/workers add a row here — no Worker code change required.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/711_agentsam_privileged_targets.sql

CREATE TABLE IF NOT EXISTS agentsam_privileged_targets (
  id TEXT PRIMARY KEY,
  target_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  target_type TEXT NOT NULL,
  privilege_mode TEXT NOT NULL DEFAULT 'scoped_sudo',
  allowed_commands TEXT,
  sudoers_user TEXT,
  workspace_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_priv_targets_target_id
  ON agentsam_privileged_targets(target_id);

CREATE INDEX IF NOT EXISTS idx_priv_targets_workspace_enabled
  ON agentsam_privileged_targets(workspace_id, enabled);

INSERT OR IGNORE INTO agentsam_privileged_targets (
  id, target_id, display_name, target_type, privilege_mode,
  allowed_commands, sudoers_user, workspace_id, tenant_id, notes
) VALUES (
  'target_iam_tunnel',
  'conn_gcp_iam_tunnel',
  'iam-tunnel',
  'gcp_vm',
  'scoped_sudo',
  '["apt","systemctl","cloudflared","workspace"]',
  'agentsam',
  'ws_inneranimalmedia',
  'tenant_sam_primeaux',
  'Primary SSH tunnel box — scoped sudo via /usr/local/sbin/iam-ops-* wrappers only'
);
