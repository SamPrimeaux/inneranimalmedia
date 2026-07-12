/**
 * Remote D1 execute helper for gate / ticket scripts (wrangler --json --remote).
 */
import { spawnSync } from 'node:child_process';
import { REPO_ROOT } from './load-env-cloudflare.mjs';

const DB = process.env.IAM_D1_DB || 'inneranimalmedia-business';
const WRANGLER_CONFIG = process.env.IAM_WRANGLER_CONFIG || 'wrangler.production.toml';

/**
 * @param {string} sql
 * @returns {Record<string, unknown>[]}
 */
export function d1Query(sql) {
  const cmd = [
    'npx',
    'wrangler',
    'd1',
    'execute',
    DB,
    '--json',
    '--remote',
    '-c',
    WRANGLER_CONFIG,
    '--command',
    sql,
  ];
  const proc = spawnSync(cmd[0], cmd.slice(1), {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  if (proc.status !== 0) {
    const err = (proc.stderr || proc.stdout || '').slice(0, 2000);
    throw new Error(`d1Query failed (${proc.status}): ${err}`);
  }
  const out = String(proc.stdout || '').trim();
  const start = Math.min(
    ...[out.indexOf('['), out.indexOf('{')].filter((i) => i >= 0),
  );
  const payload = JSON.parse(start >= 0 ? out.slice(start) : out);
  if (Array.isArray(payload) && payload[0]?.results) return payload[0].results;
  if (payload?.results) return payload.results;
  return [];
}

/** @param {unknown} v */
export function sqlQuote(v) {
  if (v == null) return 'NULL';
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v === 'boolean') return v ? '1' : '0';
  return `'${String(v).replace(/'/g, "''")}'`;
}
