/**
 * Shared helpers for D1 deploy ledger scripts (remote inneranimalmedia-business).
 * Derives worker_name from wrangler.production.toml → package.json → inneranimalmedia.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { execFileSync } from 'child_process';
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';

const execFile = promisify(execFileCb);

const D1_DB = 'inneranimalmedia-business';
const WRANGLER_CFG = 'wrangler.production.toml';

export function escapeSqlLiteral(s) {
  return String(s ?? '').replace(/'/g, "''");
}

export function sqlString(v) {
  if (v === null || v === undefined) return 'NULL';
  return `'${escapeSqlLiteral(v)}'`;
}

export function sqlJson(obj) {
  return sqlString(JSON.stringify(obj ?? {}));
}

export function sqlInt(n) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return 'NULL';
  return String(Math.floor(Number(n)));
}

export function deriveWorkerName(repoRoot) {
  try {
    const toml = readFileSync(resolve(repoRoot, WRANGLER_CFG), 'utf8');
    const m = toml.match(/^\s*name\s*=\s*"([^"]+)"/m);
    if (m?.[1]) return m[1].trim();
  } catch {
    /* ignore */
  }
  try {
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
    if (pkg?.name) return String(pkg.name).trim();
  } catch {
    /* ignore */
  }
  return 'inneranimalmedia';
}

export function gitShort(repoRoot) {
  try {
    const out = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim();
    return out || 'unknown';
  } catch {
    return 'unknown';
  }
}

export function gitFull(repoRoot) {
  try {
    const out = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim();
    return out || '';
  } catch {
    return '';
  }
}

export function pkgVersion(repoRoot) {
  try {
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
    return String(pkg?.version || '').trim() || null;
  } catch {
    return null;
  }
}

export function resolveProjectId() {
  return String(
    process.env.DOCUMENTS_PROJECT_ID ?? process.env.DEPLOY_PROJECT_ID ?? process.env.PROJECT_ID ?? '',
  ).trim();
}

export function deployedByActor() {
  const uid = String(process.env.D1_AUTH_USER_ID ?? '').trim();
  if (uid) return uid;
  const email = String(process.env.DEPLOY_USER_EMAIL ?? process.env.USER_EMAIL ?? '').trim();
  return email || 'unknown';
}

export function notifyRecipient() {
  const a = String(process.env.DEPLOY_NOTIFY_EMAIL ?? '').trim();
  const b = String(process.env.RESEND_NOTIFY_EMAIL ?? '').trim();
  return a || b || '';
}

export function wranglerWrapperPath(repoRoot) {
  return resolve(repoRoot, 'scripts/with-cloudflare-env.sh');
}

export function hasCloudflareToken() {
  return Boolean(String(process.env.CLOUDFLARE_API_TOKEN ?? '').trim());
}

function parseD1Json(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    return [];
  }
  const rows = parsed[0]?.results ?? parsed.results ?? [];
  return Array.isArray(rows) ? rows : [];
}

export function runD1Query(repoRoot, sql) {
  const wrapper = wranglerWrapperPath(repoRoot);
  const args = [
    'npx',
    'wrangler',
    'd1',
    'execute',
    D1_DB,
    '--remote',
    '-c',
    WRANGLER_CFG,
    '--json',
    '--command',
    sql,
  ];
  const raw = execFileSync(wrapper, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return parseD1Json(raw);
}

export async function runD1Exec(repoRoot, sql) {
  const wrapper = wranglerWrapperPath(repoRoot);
  const args = [
    'npx',
    'wrangler',
    'd1',
    'execute',
    D1_DB,
    '--remote',
    '-c',
    WRANGLER_CFG,
    '--command',
    sql,
  ];
  await execFile(wrapper, args, {
    cwd: repoRoot,
    maxBuffer: 32 * 1024 * 1024,
  });
}

/** @returns {Map<string, { type: string, notnull: number, pk: number }>} */
export function pragmaTableInfo(repoRoot, table) {
  const rows = runD1Query(repoRoot, `PRAGMA table_info(${escapeSqlIdent(table)})`);
  const m = new Map();
  for (const r of rows) {
    const name = r.name != null ? String(r.name) : '';
    if (!name) continue;
    m.set(name, {
      type: String(r.type ?? ''),
      notnull: Number(r.notnull ?? 0),
      pk: Number(r.pk ?? 0),
    });
  }
  return m;
}

function escapeSqlIdent(ident) {
  const s = String(ident ?? '').replace(/[^a-zA-Z0-9_]/g, '');
  return s || 'invalid';
}

export function pickFirstExisting(cols, candidates) {
  for (const c of candidates) {
    if (cols.has(c)) return c;
  }
  return null;
}

export function trackingRowId(runGroupId) {
  return `dtrack_${runGroupId}`;
}

export function healthRowId(runGroupId, suffix) {
  const safe = String(runGroupId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  return `adh_${safe}_${suffix}`;
}

export function notificationRowId(runGroupId) {
  const safe = String(runGroupId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  return `dn_${safe}`;
}
