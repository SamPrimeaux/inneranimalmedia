/**
 * Canonical platform operator auth_users.id (au_*) for local scripts.
 *
 * Priority:
 *   1. OPERATOR_USER_ID / AGENT_SESSION_USER_ID (must be au_*)
 *   2. AGENT_SESSION_DEFAULT_USER_ID only if au_* (UUID/person_uuid is ignored — use OPERATOR_USER_ID)
 *   3. Lookup by OPERATOR_USER_EMAIL in D1 (--remote audit only)
 *   4. First id in scripts/lib/sam-operator-lane.ids
 *
 * Never hardcode au_* in new scripts — import resolveOperatorUserId().
 */
import { spawnSync } from 'node:child_process';
import { loadOperatorLaneIds } from './operator-env-manifest.mjs';
import { REPO_ROOT } from './load-env-cloudflare.mjs';

const AU_RE = /^au_[a-f0-9]+$/;

/** @param {unknown} raw */
export function isOperatorAuthUserId(raw) {
  return AU_RE.test(String(raw || '').trim());
}

/** @returns {{ userId: string, source: string, warnings: string[] }} */
export function resolveOperatorUserId(options = {}) {
  const warnings = [];
  const laneIds = loadOperatorLaneIds(options.repoRoot ?? REPO_ROOT);
  const env = options.env ?? process.env;

  for (const [key, source] of [
    [env.OPERATOR_USER_ID, 'OPERATOR_USER_ID'],
    [env.AGENT_SESSION_USER_ID, 'AGENT_SESSION_USER_ID'],
    [env.USER_ID, 'USER_ID'],
  ]) {
    const s = String(key || '').trim();
    if (isOperatorAuthUserId(s)) return { userId: s, source, warnings };
  }

  const defRaw = String(env.AGENT_SESSION_DEFAULT_USER_ID || '').trim();
  if (defRaw) {
    if (isOperatorAuthUserId(defRaw)) {
      return { userId: defRaw, source: 'AGENT_SESSION_DEFAULT_USER_ID', warnings };
    }
    warnings.push(
      `AGENT_SESSION_DEFAULT_USER_ID=${defRaw.slice(0, 8)}… is not au_* (person_uuid?). Set OPERATOR_USER_ID=au_… in .env.cloudflare`,
    );
  }

  const email = String(env.OPERATOR_USER_EMAIL || env.AGENT_SESSION_USER_EMAIL || '').trim().toLowerCase();
  if (email && options.lookupD1) {
    const fromD1 = lookupAuthUserIdByEmail(email, options);
    if (fromD1) return { userId: fromD1, source: `D1 email ${email}`, warnings };
  }

  if (laneIds.length) {
    return { userId: laneIds[0], source: 'sam-operator-lane.ids (first)', warnings };
  }

  throw new Error(
    'No operator au_* resolved. Set OPERATOR_USER_ID=au_… in .env.cloudflare (see .env.cloudflare.example)',
  );
}

/** @param {string} email @param {object} options */
function lookupAuthUserIdByEmail(email, options) {
  const sql = `SELECT id FROM auth_users WHERE lower(email) = lower('${email.replace(/'/g, "''")}') LIMIT 1`;
  const remote = options.remote !== false;
  const args = [
    'd1',
    'execute',
    'inneranimalmedia-business',
    remote ? '--remote' : '--local',
    '-c',
    'wrangler.production.toml',
    '--command',
    sql,
    '--json',
  ];
  const r = spawnSync('npx', ['wrangler', ...args], {
    encoding: 'utf8',
    cwd: options.repoRoot ?? REPO_ROOT,
    env: process.env,
  });
  if (r.status !== 0) return null;
  try {
    const parsed = JSON.parse(r.stdout);
    const block = Array.isArray(parsed) ? parsed[0] : parsed;
    const row = block?.results?.[0];
    const id = row?.id != null ? String(row.id).trim() : '';
    return isOperatorAuthUserId(id) ? id : null;
  } catch {
    return null;
  }
}

/** @returns {string} */
export function resolveOperatorUserIdOrThrow(options = {}) {
  return resolveOperatorUserId(options).userId;
}
