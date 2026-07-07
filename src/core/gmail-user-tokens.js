/**
 * Canonical Gmail OAuth token resolution — always prefer au_* user_id.
 * Reads google_gmail (and legacy gmail / email-keyed rows during migration).
 */

import { resolveIntegrationUserId } from './integration-user-id.js';

export const GMAIL_PROVIDER = 'google_gmail';
const LEGACY_GMAIL_PROVIDER = 'gmail';

/**
 * @param {*} env
 * @param {{ id?: string, email?: string } | null | undefined} authUser
 * @returns {Promise<string | null>}
 */
export async function resolveGmailUserId(env, authUser) {
  return resolveIntegrationUserId(env, authUser);
}

/**
 * @param {*} env
 * @param {string} canonicalUserId
 * @param {string} [legacyEmail]
 */
async function queryGmailTokenRows(env, canonicalUserId, legacyEmail = '') {
  if (!env?.DB || !canonicalUserId) return [];
  const keys = new Set([canonicalUserId]);
  const email = String(legacyEmail || '').trim().toLowerCase();
  if (email && email !== canonicalUserId.toLowerCase()) keys.add(email);

  const all = [];
  for (const userKey of keys) {
    const { results } = await env.DB.prepare(
      `SELECT user_id, provider, account_identifier,
              access_token, access_token_encrypted,
              refresh_token, refresh_token_encrypted,
              expires_at, scope, updated_at, account_email, account_display
       FROM user_oauth_tokens
       WHERE user_id = ? AND lower(provider) IN ('google_gmail', 'gmail')
       ORDER BY updated_at DESC`
    ).bind(userKey).all().catch(() => ({ results: [] }));
    for (const row of results || []) {
      const acct = String(row.account_identifier || '').trim().toLowerCase();
      const dedupe = `${acct}:${String(row.provider || '').toLowerCase()}`;
      if (all.some((x) => `${String(x.account_identifier || '').trim().toLowerCase()}:${String(x.provider || '').toLowerCase()}` === dedupe)) {
        continue;
      }
      all.push({ ...row, user_id: canonicalUserId, provider: GMAIL_PROVIDER });
    }
  }
  return all;
}

/**
 * @param {*} env
 * @param {{ id?: string, email?: string } | null | undefined} authUser
 */
export async function listGmailTokenRowsForUser(env, authUser) {
  const canonicalUserId = await resolveGmailUserId(env, authUser);
  if (!canonicalUserId) return [];
  const email = authUser?.email ? String(authUser.email).trim().toLowerCase() : '';
  return queryGmailTokenRows(env, canonicalUserId, email);
}

/**
 * @param {*} env
 * @param {{ id?: string, email?: string } | null | undefined} authUser
 * @param {string | null | undefined} accountIdentifier
 */
export async function getGmailTokenRowForUser(env, authUser, accountIdentifier = null) {
  const rows = await listGmailTokenRowsForUser(env, authUser);
  if (!rows.length) return null;
  const acct = accountIdentifier ? String(accountIdentifier).trim().toLowerCase() : '';
  if (acct) {
    return rows.find((r) => String(r.account_identifier || '').trim().toLowerCase() === acct) || null;
  }
  return rows[0];
}
