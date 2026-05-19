#!/usr/bin/env node
/**
 * Audit D1 rows for a user by email (remote prod DB via wrangler).
 * Usage: node scripts/audit-auth-user.mjs user@example.com
 *
 * Requires: wrangler authenticated, same D1 binding name as wrangler.production.toml
 */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/audit-auth-user.mjs <email>');
  process.exit(1);
}
const esc = email.replace(/'/g, "''");
const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(root, '..');
const wrangler = join(repoRoot, 'wrangler.production.toml');
const db = 'inneranimalmedia-business';

function q(sql) {
  console.log('\n---', sql.replace(/\s+/g, ' ').trim().slice(0, 120), '...');
  execSync(
    `npx wrangler d1 execute ${db} --remote -c "${wrangler}" --command "${sql.replace(/"/g, '\\"')}"`,
    { cwd: repoRoot, stdio: 'inherit' },
  );
}

q(`SELECT id, email, name, tenant_id, supabase_user_id, created_at, updated_at FROM auth_users WHERE LOWER(email) = LOWER('${esc}') LIMIT 5`);
q(`SELECT id, user_id, tenant_id, workspace_id, person_uuid, supabase_user_id, email, provider, display_name, expires_at, created_at, last_active_at, work_session_id FROM auth_sessions WHERE user_id IN (SELECT id FROM auth_users WHERE LOWER(email) = LOWER('${esc}')) OR LOWER(COALESCE(email,'')) = LOWER('${esc}') ORDER BY created_at DESC LIMIT 10`);
q(`SELECT id, user_key, email, auth_id, default_workspace_id FROM users WHERE LOWER(email) = LOWER('${esc}') LIMIT 5`);
q(`SELECT wm.workspace_id, wm.role, w.name FROM workspace_members wm JOIN workspaces w ON w.id = wm.workspace_id WHERE wm.user_id IN (SELECT id FROM auth_users WHERE LOWER(email) = LOWER('${esc}')) LIMIT 20`);
q(`SELECT user_id, theme, default_workspace_id FROM user_settings WHERE user_id IN (SELECT id FROM auth_users WHERE LOWER(email) = LOWER('${esc}')) LIMIT 5`);
q(`SELECT provider, account_identifier, length(access_token) AS at_len, length(refresh_token) AS rt_len, expires_at, scope FROM user_oauth_tokens WHERE user_id IN (SELECT id FROM auth_users WHERE LOWER(email) = LOWER('${esc}')) LIMIT 50`);
