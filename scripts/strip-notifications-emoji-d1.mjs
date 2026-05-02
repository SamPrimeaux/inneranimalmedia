#!/usr/bin/env node
/**
 * Strip emoji from D1 notifications.subject / notifications.message (same rules as StatusBar UI).
 *
 * Run from repo root (requires Cloudflare credentials via with-cloudflare-env):
 *   DRY_RUN=1 ./scripts/with-cloudflare-env.sh node scripts/strip-notifications-emoji-d1.mjs
 *   ./scripts/with-cloudflare-env.sh node scripts/strip-notifications-emoji-d1.mjs
 */
import { execSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DRY = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

function stripEmoji(s) {
  if (s == null) return null;
  const str = String(s);
  try {
    const out = str
      .replace(/\p{Extended_Pictographic}/gu, '')
      .replace(/\uFE0F/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    return out;
  } catch {
    return str.replace(/\uFE0F/g, '').trim();
  }
}

function sqlString(v) {
  if (v == null) return 'NULL';
  const t = String(v).replace(/'/g, "''");
  return `'${t}'`;
}

function sqlId(v) {
  return `'${String(v).replace(/'/g, "''")}'`;
}

function wranglerSelect() {
  return execSync(
    './scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --json --command="SELECT id, subject, message FROM notifications"',
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, cwd: ROOT },
  );
}

function wranglerSql(sql) {
  const r = spawnSync(
    './scripts/with-cloudflare-env.sh',
    [
      'npx',
      'wrangler',
      'd1',
      'execute',
      'inneranimalmedia-business',
      '--remote',
      '-c',
      'wrangler.production.toml',
      '--command',
      sql,
    ],
    { encoding: 'utf8', cwd: ROOT, stdio: DRY ? 'pipe' : 'inherit' },
  );
  if (r.status !== 0) {
    throw new Error(r.stderr || `wrangler exit ${r.status}`);
  }
}

const raw = wranglerSelect();
let parsed;
try {
  parsed = JSON.parse(raw.trim());
} catch (e) {
  console.error('Failed to parse wrangler JSON. Raw (first 500 chars):\n', raw.slice(0, 500));
  process.exit(1);
}

const first = Array.isArray(parsed) ? parsed[0] : parsed;
const rows = first?.results ?? first?.result ?? [];
if (!Array.isArray(rows)) {
  console.error('Unexpected wrangler output shape', Object.keys(first || {}));
  process.exit(1);
}

function fieldNeedsStrip(raw) {
  if (raw == null) return false;
  const s = String(raw);
  return stripEmoji(s) !== s;
}

let updated = 0;
for (const row of rows) {
  const id = row.id;
  if (id == null) continue;
  if (!fieldNeedsStrip(row.subject) && !fieldNeedsStrip(row.message)) continue;

  const subSql = row.subject == null ? 'NULL' : sqlString(stripEmoji(String(row.subject)));
  const msgSql = row.message == null ? 'NULL' : sqlString(stripEmoji(String(row.message)));
  const sql = `UPDATE notifications SET subject = ${subSql}, message = ${msgSql} WHERE id = ${sqlId(id)}`;
  if (DRY) {
    console.log('[DRY_RUN]', sql.slice(0, 200) + (sql.length > 200 ? '…' : ''));
  } else {
    wranglerSql(sql);
  }
  updated += 1;
}

console.log(DRY ? `DRY_RUN: would update ${updated} row(s).` : `Updated ${updated} notification row(s).`);
