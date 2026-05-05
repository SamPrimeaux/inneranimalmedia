#!/usr/bin/env node
/**
 * List integration-related tokens for a user id or email.
 * Usage: node scripts/audit-integrations.mjs <email-or-user-id>
 */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const id = process.argv[2];
if (!id) {
  console.error('Usage: node scripts/audit-integrations.mjs <email-or-auth-user-id>');
  process.exit(1);
}
const esc = id.replace(/'/g, "''");
const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(root, '..');
const wrangler = join(repoRoot, 'wrangler.production.toml');
const db = 'inneranimalmedia-business';

const uidSub = id.includes('@')
  ? `(SELECT id FROM auth_users WHERE LOWER(email) = LOWER('${esc}') LIMIT 1)`
  : `'${esc}'`;

const sql = `SELECT user_id, provider, account_identifier, expires_at, scope, updated_at FROM user_oauth_tokens WHERE user_id = ${uidSub} ORDER BY provider, account_identifier`;
console.log(sql);
execSync(
  `npx wrangler d1 execute ${db} --remote -c "${wrangler}" --command "${sql.replace(/"/g, '\\"')}"`,
  { cwd: repoRoot, stdio: 'inherit' },
);
