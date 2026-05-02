-- BACKFILL: March 19, 2026 Deployments (from cursor-session-log.md)
-- Run in D1 Studio or: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/147_backfill_march19_deployments.sql
-- Requires migrations 145 and 146 applied first (deployments table with notes, changed_files).

-- Deploy 1: Workspace API + dashboard wire
INSERT OR REPLACE INTO deployments (
  id, timestamp, version, git_hash, changed_files, description, status, deployed_by, environment, notes
) VALUES (
  '2018cff2-31f6-46bd-b780-b7b7bf149756',
  '2026-03-19T12:00:00Z',
  'workspace-api-launch',
  '2018cff2',
  '["migrations/141_user_workspace_settings.sql", "worker.js", "dashboard/user-settings.html"]',
  'Workspace API + dashboard wire. Added user_workspace_settings table, GET/PATCH /api/settings/workspaces, wired Workspace tab to API',
  'success',
  'cursor-manual',
  'production',
  'Migration 141 applied. Workspace tab loads/saves Brand/Plans/Budget/Time per workspace slot via D1.'
);

-- Deploy 2: User Settings header z-index + profile sync
INSERT OR REPLACE INTO deployments (
  id, timestamp, version, git_hash, changed_files, description, status, deployed_by, environment, notes
) VALUES (
  '8ce51465-6b4e-488a-acd7-3460594c1fdc',
  '2026-03-19T13:00:00Z',
  'user-settings-profile-fix',
  '8ce51465',
  '["dashboard/user-settings.html", "worker.js"]',
  'User Settings: header z-index fix, profile image and identity sync, verified emails. Profile pre-filled in D1 for provisioned admin account (avatar, phone).',
  'success',
  'cursor-manual',
  'production',
  'Header dropdowns z-index 1000/1001. GET /api/settings/profile merges auth data. Verified Emails shows login email. Change profile picture flow wired.'
);

-- Deploy 3: Profile image change reliability
INSERT OR REPLACE INTO deployments (
  id, timestamp, version, git_hash, changed_files, description, status, deployed_by, environment, notes
) VALUES (
  '4d057e26-c8ad-4a23-b5ad-774ac3a7358f',
  '2026-03-19T13:30:00Z',
  'profile-image-reliability',
  '4d057e26',
  '["dashboard/user-settings.html"]',
  'Improved profile image upload reliability - clear file input before picker, reset state after upload, sync header avatar',
  'success',
  'cursor-manual',
  'production',
  'Fixed second-time upload not working. Profile preview img pointer-events:none so clicks trigger picker.'
);

-- Deploy 4: Backup code sign-in + multi-GitHub + migrations
INSERT OR REPLACE INTO deployments (
  id, timestamp, version, git_hash, changed_files, description, status, deployed_by, environment, notes
) VALUES (
  '08687c9e-548f-451f-b5e2-d913c0f56c34',
  '2026-03-19T14:00:00Z',
  'multi-github-backup-codes',
  '08687c9e',
  '["worker.js", "dashboard/user-settings.html", "migrations/142_user_backup_codes.sql", "migrations/144_user_oauth_tokens_multi_github.sql"]',
  'Backup code sign-in + multi-GitHub login support. Migrations 142/144 applied, /api/integrations/status returns github_accounts array',
  'success',
  'cursor-manual',
  'production',
  'Migrations: 142 (user_backup_codes), 144 (user_oauth_tokens multi-account PK). Integrations UI shows each GitHub account.'
);
