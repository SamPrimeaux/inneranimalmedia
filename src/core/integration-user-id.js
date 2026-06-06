/**
 * Canonical auth_users.id for integration OAuth / API key lookups.
 * Never use email fallback — user_oauth_tokens.user_id is always au_*.
 */
import { resolveCanonicalUserId } from '../api/auth.js';

/**
 * @param {any} env
 * @param {{ id?: string | null, email?: string | null } | null | undefined} authUser
 * @returns {Promise<string | null>}
 */
export async function resolveIntegrationUserId(env, authUser) {
  const raw = authUser?.id != null ? String(authUser.id).trim() : '';
  if (!raw || !env) return null;
  return resolveCanonicalUserId(raw, env);
}

/**
 * @param {any} env
 * @param {string} userId
 * @param {string} [accountIdentifier]
 * @param {string} [workspaceId]
 */
export async function invalidateGithubReposSessionCache(env, userId, accountIdentifier = '', workspaceId = '') {
  if (!env?.SESSION_CACHE?.delete || !userId) return;
  const uid = String(userId).trim();
  const acct = String(accountIdentifier || '').trim() || '_';
  const ws = String(workspaceId || '').trim() || '_';
  const keys = new Set([
    `github:repos:v2:${uid}:${acct}:${ws}`,
    `github:repos:v2:${uid}:_:_`,
    `github:repos:v2:${uid}:${acct}:_`,
    `github:repos:v2:${uid}:_:${ws}`,
    `github:repos:${uid}:${acct}:${ws}`,
    `github:repos:${uid}:_:_`,
    `github:repos:${uid}:${acct}:_`,
    `github:repos:${uid}:_:${ws}`,
  ]);
  for (const key of keys) {
    try {
      await env.SESSION_CACHE.delete(key);
    } catch (_) { /* non-fatal */ }
  }
}

/**
 * @param {Record<string, string>} extra
 */
export function githubPrivateResponse(body, status = 200, extra = {}) {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'private, no-store, max-age=0',
    Pragma: 'no-cache',
    ...extra,
  });
  return new Response(JSON.stringify(body), { status, headers });
}
