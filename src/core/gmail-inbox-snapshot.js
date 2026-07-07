/**
 * Cron-safe Gmail inbox snapshot (no HTTP auth session).
 * Reads user_oauth_tokens for google_gmail by user key (email preferred, then auth id).
 */

import { resolveOAuthAccessToken, resolveOAuthRefreshToken } from '../api/oauth.js';

const GMAIL_PROVIDER = 'google_gmail';
const DEFAULT_MAX = 25;

function firstHeader(msg, name) {
  const want = String(name || '').toLowerCase();
  const headers = msg?.payload?.headers;
  if (!Array.isArray(headers)) return '';
  const h = headers.find((x) => String(x?.name || '').toLowerCase() === want);
  return h?.value ? String(h.value) : '';
}

async function refreshGoogleAccessToken(env, tokenRow) {
  const rt = await resolveOAuthRefreshToken(env, tokenRow);
  if (!rt) return null;
  if (!env?.GOOGLE_CLIENT_ID || !env?.GOOGLE_OAUTH_CLIENT_SECRET) return null;
  const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      refresh_token: rt,
      grant_type: 'refresh_token',
    }).toString(),
  });
  const refreshed = await refreshRes.json().catch(() => null);
  if (!refreshRes.ok || !refreshed?.access_token) return null;
  const exp = Math.floor(Date.now() / 1000) + Number(refreshed.expires_in || 3600);
  try {
    await env.DB.prepare(
      `UPDATE user_oauth_tokens
       SET access_token = ?, expires_at = ?, updated_at = unixepoch()
       WHERE user_id = ? AND provider = ? AND account_identifier = ?`
    ).bind(refreshed.access_token, exp, tokenRow.user_id, tokenRow.provider, tokenRow.account_identifier || '').run();
  } catch { /* ignore */ }
  return { access_token: refreshed.access_token };
}

async function gmailFetchJson(env, tokenRow, url, init) {
  const tok = tokenRow ? (await resolveOAuthAccessToken(env, tokenRow) || '') : '';
  if (!tok) return { ok: false, status: 401, json: null };
  let res = await fetch(url, {
    ...(init || {}),
    headers: { ...(init?.headers || {}), Authorization: `Bearer ${tok}` },
  });
  if (res.status === 401 && (await resolveOAuthRefreshToken(env, tokenRow))) {
    const refreshed = await refreshGoogleAccessToken(env, tokenRow);
    if (refreshed?.access_token) {
      res = await fetch(url, {
        ...(init || {}),
        headers: { ...(init?.headers || {}), Authorization: `Bearer ${refreshed.access_token}` },
      });
    }
  }
  const json = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

async function listGmailTokens(env, userKey) {
  if (!env?.DB || !userKey) return [];
  const { results } = await env.DB.prepare(
    `SELECT user_id, provider, account_identifier,
            access_token, access_token_encrypted,
            refresh_token, refresh_token_encrypted,
            expires_at, scope
     FROM user_oauth_tokens
     WHERE user_id = ? AND provider = ?
     ORDER BY updated_at DESC`
  ).bind(userKey, GMAIL_PROVIDER).all().catch(() => ({ results: [] }));
  return results || [];
}

/**
 * @param {*} env
 * @param {{ email?: string, userId?: string, maxPerAccount?: number }} opts
 */
export async function snapshotGmailInboxForUser(env, opts = {}) {
  const email = opts.email ? String(opts.email).trim().toLowerCase() : '';
  const userId = opts.userId ? String(opts.userId).trim() : '';
  const userKey = email || userId;
  const max = Number(opts.maxPerAccount) > 0 ? Number(opts.maxPerAccount) : DEFAULT_MAX;
  if (!userKey) return { emails: [], accounts: [], source: 'none' };

  let tokens = await listGmailTokens(env, userKey);
  if (!tokens.length && userId && email && userId !== email) {
    tokens = await listGmailTokens(env, userId);
  }

  const emails = [];
  const accounts = [];
  for (const tokenRow of tokens) {
    const acct = String(tokenRow.account_identifier || '').trim();
    if (!acct) continue;
    const access = await resolveOAuthAccessToken(env, tokenRow);
    const refresh = await resolveOAuthRefreshToken(env, tokenRow);
    if (!access && !refresh) continue;
    accounts.push(acct);

    const u = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
    u.searchParams.set('maxResults', String(max));
    u.searchParams.append('labelIds', 'INBOX');
    u.searchParams.set('q', 'newer_than:2d');
    const list = await gmailFetchJson(env, tokenRow, u.toString());
    if (!list.ok) continue;

    const ids = (Array.isArray(list.json?.messages) ? list.json.messages : [])
      .map((m) => String(m?.id || '')).filter(Boolean);
    for (const id of ids) {
      const detailUrl = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}`);
      detailUrl.searchParams.set('format', 'metadata');
      ['From', 'To', 'Subject', 'Date'].forEach((h) => detailUrl.searchParams.append('metadataHeaders', h));
      const got = await gmailFetchJson(env, tokenRow, detailUrl.toString());
      if (!got.ok || !got.json) continue;
      const msg = got.json;
      const labelIds = Array.isArray(msg?.labelIds) ? msg.labelIds : [];
      const dt = msg?.internalDate ? new Date(Number(msg.internalDate)) : null;
      emails.push({
        id: String(msg.id),
        account: acct,
        from_address: firstHeader(msg, 'From') || '',
        to_address: firstHeader(msg, 'To') || '',
        subject: firstHeader(msg, 'Subject') || '(no subject)',
        date_received: dt && !Number.isNaN(dt.getTime()) ? dt.toISOString() : '',
        is_read: labelIds.includes('UNREAD') ? 0 : 1,
        is_starred: labelIds.includes('STARRED') ? 1 : 0,
        snippet: msg?.snippet ? String(msg.snippet).slice(0, 280) : '',
      });
    }
  }

  emails.sort((a, b) => new Date(b.date_received).getTime() - new Date(a.date_received).getTime());
  return {
    emails: emails.slice(0, max * Math.max(accounts.length, 1)),
    accounts,
    source: accounts.length ? 'gmail' : 'none',
  };
}
