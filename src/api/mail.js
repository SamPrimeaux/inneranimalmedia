/**
 * src/api/mail.js
 * Email client API (inbox, detail, templates, sending).
 *
 * All routes are auth-gated via getAuthUser.
 */

import { getAuthUser } from '../core/auth.js';
import { jsonResponse } from '../core/responses.js';

const PAGE_SIZE = 50;
const GMAIL_PROVIDER = 'google_gmail';
const GMAIL_STATE_PREFIX = 'gmail_oauth_state:';

function pathLower(url) {
  return url.pathname.toLowerCase().replace(/\/$/, '') || '/';
}

function parsePage(url) {
  const raw = url.searchParams.get('page');
  const n = raw ? Number.parseInt(raw, 10) : 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function safeJsonParse(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  try {
    const s = String(raw);
    if (!s.trim()) return null;
    return JSON.parse(s);
  } catch {
    return null;
  }
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function mustDb(env) {
  return !!env?.DB;
}

function replaceTemplateVars(template, vars) {
  const v = vars && typeof vars === 'object' ? vars : {};
  let out = String(template ?? '');
  for (const [k, val] of Object.entries(v)) {
    const key = String(k);
    const value = val == null ? '' : String(val);
    out = out.replaceAll(`{{${key}}}`, value);
  }
  return out;
}

function base64UrlEncode(input) {
  const bin = typeof input === 'string' ? input : String(input ?? '');
  const bytes = new TextEncoder().encode(bin);
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  const b64 = btoa(str);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecodeToString(b64url) {
  const s = String(b64url || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function parseJwtPayload(jwt) {
  const token = String(jwt || '');
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const raw = base64UrlDecodeToString(parts[1]);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function firstHeader(msg, name) {
  const want = String(name || '').toLowerCase();
  const headers = msg?.payload?.headers;
  if (!Array.isArray(headers)) return '';
  const h = headers.find((x) => String(x?.name || '').toLowerCase() === want);
  return h?.value ? String(h.value) : '';
}

function parseGmailCategories(labelIds) {
  const set = new Set((Array.isArray(labelIds) ? labelIds : []).map((x) => String(x)));
  if (set.has('CATEGORY_PROMOTIONS')) return 'promotions';
  if (set.has('CATEGORY_SOCIAL')) return 'social';
  if (set.has('CATEGORY_UPDATES')) return 'updates';
  if (set.has('CATEGORY_FORUMS')) return 'forums';
  if (set.has('CATEGORY_PERSONAL') || set.has('CATEGORY_PRIMARY')) return 'primary';
  return '';
}

function hasGmailAttachments(msg) {
  const stack = [msg?.payload].filter(Boolean);
  while (stack.length) {
    const n = stack.pop();
    if (!n) continue;
    if (n.filename && n.body?.attachmentId) return true;
    if (Array.isArray(n.parts)) stack.push(...n.parts);
  }
  return false;
}

function extractGmailBodies(msg) {
  let html = '';
  let text = '';
  const stack = [msg?.payload].filter(Boolean);
  while (stack.length) {
    const n = stack.pop();
    if (!n) continue;
    const mt = String(n.mimeType || '').toLowerCase();
    const data = n?.body?.data ? String(n.body.data) : '';
    if (data && (mt === 'text/html' || mt === 'text/plain')) {
      const decoded = base64UrlDecodeToString(data);
      if (mt === 'text/html' && !html) html = decoded;
      if (mt === 'text/plain' && !text) text = decoded;
    }
    if (Array.isArray(n.parts)) stack.push(...n.parts);
  }
  return { html, text };
}

function listGmailAttachments(msg) {
  const out = [];
  const stack = [msg?.payload].filter(Boolean);
  while (stack.length) {
    const n = stack.pop();
    if (!n) continue;
    const filename = n.filename ? String(n.filename) : '';
    const attachmentId = n?.body?.attachmentId ? String(n.body.attachmentId) : '';
    const size = Number(n?.body?.size || 0);
    const contentType = n?.mimeType ? String(n.mimeType) : 'application/octet-stream';
    if (filename && attachmentId) {
      out.push({ id: attachmentId, filename, content_type: contentType, size });
    }
    if (Array.isArray(n.parts)) stack.push(...n.parts);
  }
  return out;
}

function buildRfc2822Message({ from, to, subject, bodyText, bodyHtml, inReplyTo, references }) {
  const lines = [];
  const now = new Date();
  lines.push(`Date: ${now.toUTCString()}`);
  if (from) lines.push(`From: ${from}`);
  if (to) lines.push(`To: ${to}`);
  if (subject) lines.push(`Subject: ${subject}`);
  lines.push('MIME-Version: 1.0');
  if (inReplyTo) lines.push(`In-Reply-To: ${inReplyTo}`);
  if (references) lines.push(`References: ${references}`);

  const hasHtml = !!(bodyHtml && String(bodyHtml).trim());
  const hasText = !!(bodyText && String(bodyText).trim());
  const text = hasText ? String(bodyText) : '';
  const html = hasHtml ? String(bodyHtml) : '';

  if (hasHtml) {
    const boundary = `iam_${crypto.randomUUID().replace(/-/g, '')}`;
    lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    lines.push('');
    lines.push(`--${boundary}`);
    lines.push('Content-Type: text/plain; charset="UTF-8"');
    lines.push('Content-Transfer-Encoding: 7bit');
    lines.push('');
    lines.push(text || html.replace(/<[^>]+>/g, ''));
    lines.push('');
    lines.push(`--${boundary}`);
    lines.push('Content-Type: text/html; charset="UTF-8"');
    lines.push('Content-Transfer-Encoding: 7bit');
    lines.push('');
    lines.push(html);
    lines.push('');
    lines.push(`--${boundary}--`);
  } else {
    lines.push('Content-Type: text/plain; charset="UTF-8"');
    lines.push('Content-Transfer-Encoding: 7bit');
    lines.push('');
    lines.push(text);
  }
  return lines.join('\r\n');
}

async function getOauthUserKey(authUser) {
  // Match legacy behavior: prefer email (stable) then id.
  const email = authUser?.email ? String(authUser.email).trim() : '';
  if (email) return email;
  const id = authUser?.id ? String(authUser.id).trim() : '';
  return id || null;
}

async function getGmailTokenRow(env, authUser) {
  if (!env?.DB) return null;
  const userKey = await getOauthUserKey(authUser);
  if (!userKey) return null;
  const row = await env.DB.prepare(
    `SELECT user_id, provider, account_identifier, access_token, refresh_token, expires_at, scope
     FROM user_oauth_tokens
     WHERE user_id = ? AND provider = ?
     ORDER BY updated_at DESC
     LIMIT 1`
  ).bind(userKey, GMAIL_PROVIDER).first().catch(() => null);
  return row || null;
}

async function refreshGoogleAccessToken(env, tokenRow) {
  if (!tokenRow?.refresh_token) return null;
  if (!env?.GOOGLE_CLIENT_ID || !env?.GOOGLE_OAUTH_CLIENT_SECRET) return null;
  const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      refresh_token: tokenRow.refresh_token,
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
  } catch {
    // ignore
  }
  return { access_token: refreshed.access_token, expires_at: exp };
}

async function gmailFetchJson(env, tokenRow, url, init) {
  const tok = tokenRow?.access_token ? String(tokenRow.access_token) : '';
  if (!tok) return { ok: false, status: 401, json: null };
  let res = await fetch(url, {
    ...(init || {}),
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${tok}`,
    },
  });
  if (res.status === 401 && tokenRow?.refresh_token) {
    const refreshed = await refreshGoogleAccessToken(env, tokenRow);
    if (refreshed?.access_token) {
      res = await fetch(url, {
        ...(init || {}),
        headers: {
          ...(init?.headers || {}),
          Authorization: `Bearer ${refreshed.access_token}`,
        },
      });
    }
  }
  const json = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

async function gmailListMessages(env, tokenRow, labelIds) {
  const u = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
  u.searchParams.set('maxResults', String(PAGE_SIZE));
  for (const l of (Array.isArray(labelIds) ? labelIds : [])) u.searchParams.append('labelIds', String(l));
  const out = await gmailFetchJson(env, tokenRow, u.toString());
  if (!out.ok) return { ok: false, status: out.status, error: out.json?.error?.message || 'gmail list failed', messages: [] };
  return { ok: true, messages: Array.isArray(out.json?.messages) ? out.json.messages : [] };
}

async function gmailGetMessage(env, tokenRow, id, format = 'metadata') {
  const u = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}`);
  u.searchParams.set('format', format);
  if (format === 'metadata') {
    ['From', 'To', 'Subject', 'Date', 'Message-Id', 'In-Reply-To', 'References'].forEach((h) => u.searchParams.append('metadataHeaders', h));
  }
  const out = await gmailFetchJson(env, tokenRow, u.toString());
  if (!out.ok) return { ok: false, status: out.status, error: out.json?.error?.message || 'gmail get failed', msg: null };
  return { ok: true, msg: out.json };
}

async function gmailGetAttachment(env, tokenRow, msgId, attachmentId) {
  const u = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(msgId)}/attachments/${encodeURIComponent(attachmentId)}`;
  const out = await gmailFetchJson(env, tokenRow, u);
  if (!out.ok) return { ok: false, status: out.status, error: out.json?.error?.message || 'gmail attachment failed', data: null };
  const data = out.json?.data ? String(out.json.data) : '';
  return { ok: true, data };
}

async function gmailSendMessage(env, tokenRow, raw, threadId) {
  const u = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
  const body = threadId ? { raw, threadId } : { raw };
  const out = await gmailFetchJson(env, tokenRow, u, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!out.ok) return { ok: false, status: out.status, error: out.json?.error?.message || 'gmail send failed' };
  return { ok: true, json: out.json };
}

export async function handleMailApi(request, url, env, ctx) {
  const p = pathLower(url);
  const method = request.method.toUpperCase();

  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
  if (!mustDb(env)) return jsonResponse({ error: 'DB not configured' }, 503);

  try {
    // Gmail OAuth connect (real)
    // GET /api/mail/gmail/status
    if (method === 'GET' && p === '/api/mail/gmail/status') {
      const tok = await getGmailTokenRow(env, authUser);
      return jsonResponse({
        connected: !!(tok?.refresh_token || tok?.access_token),
        account: tok?.account_identifier ? String(tok.account_identifier) : null,
        expires_at: tok?.expires_at != null ? Number(tok.expires_at) : null,
        scope: tok?.scope ? String(tok.scope) : null,
      });
    }

    // GET /api/mail/gmail/start -> redirect to Google OAuth consent
    if (method === 'GET' && p === '/api/mail/gmail/start') {
      if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
        return jsonResponse({ error: 'Google OAuth not configured' }, 503);
      }
      if (!env.SESSION_CACHE) return jsonResponse({ error: 'SESSION_CACHE not configured' }, 503);
      const userKey = await getOauthUserKey(authUser);
      if (!userKey) return jsonResponse({ error: 'User id missing' }, 400);

      const origin = url.origin;
      const redirectUri = `${origin}/api/mail/gmail/callback`;
      const stateId = crypto.randomUUID();
      await env.SESSION_CACHE.put(
        `${GMAIL_STATE_PREFIX}${stateId}`,
        JSON.stringify({ user_id: userKey, ts: Date.now() }),
        { expirationTtl: 10 * 60 },
      );

      const scopes = [
        'openid',
        'email',
        'profile',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/gmail.send',
      ];

      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', scopes.join(' '));
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent');
      authUrl.searchParams.set('include_granted_scopes', 'true');
      authUrl.searchParams.set('state', stateId);

      return Response.redirect(authUrl.toString(), 302);
    }

    // GET /api/mail/gmail/callback
    if (method === 'GET' && p === '/api/mail/gmail/callback') {
      if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
        return jsonResponse({ error: 'Google OAuth not configured' }, 503);
      }
      if (!env.SESSION_CACHE) return jsonResponse({ error: 'SESSION_CACHE not configured' }, 503);
      const code = url.searchParams.get('code') || '';
      const state = url.searchParams.get('state') || '';
      if (!code || !state) return jsonResponse({ error: 'Missing code/state' }, 400);

      const stateKey = `${GMAIL_STATE_PREFIX}${state}`;
      const stateRaw = await env.SESSION_CACHE.get(stateKey);
      if (!stateRaw) return jsonResponse({ error: 'OAuth state expired' }, 400);
      await env.SESSION_CACHE.delete(stateKey).catch(() => {});
      const parsed = safeJsonParse(stateRaw);
      const userId = parsed?.user_id ? String(parsed.user_id) : '';
      if (!userId) return jsonResponse({ error: 'OAuth state invalid' }, 400);

      const redirectUri = `${url.origin}/api/mail/gmail/callback`;
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }).toString(),
      });
      const tok = await tokenRes.json().catch(() => null);
      if (!tokenRes.ok || !tok?.access_token) {
        return jsonResponse({ error: 'Token exchange failed', detail: tok }, 502);
      }

      const exp = Math.floor(Date.now() / 1000) + Number(tok.expires_in || 3600);
      const scope = tok.scope ? String(tok.scope) : '';
      const idPayload = tok.id_token ? parseJwtPayload(tok.id_token) : null;
      const acct = idPayload?.email ? String(idPayload.email) : '';
      const account_identifier = acct || '';

      await env.DB.prepare(
        `INSERT INTO user_oauth_tokens (user_id, provider, account_identifier, access_token, refresh_token, expires_at, scope, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())
         ON CONFLICT(user_id, provider, account_identifier)
         DO UPDATE SET access_token=excluded.access_token, refresh_token=COALESCE(excluded.refresh_token, user_oauth_tokens.refresh_token), expires_at=excluded.expires_at, scope=excluded.scope, updated_at=unixepoch()`
      ).bind(
        userId,
        GMAIL_PROVIDER,
        account_identifier,
        String(tok.access_token),
        tok.refresh_token ? String(tok.refresh_token) : null,
        exp,
        scope,
      ).run();

      return Response.redirect(`${url.origin}/dashboard/mail?connected=1`, 302);
    }

    // GET /api/mail/inbox
    if (method === 'GET' && p === '/api/mail/inbox') {
      // If Gmail is connected, use Gmail as source-of-truth for Inbox.
      const gmailTok = await getGmailTokenRow(env, authUser);
      if (gmailTok?.access_token) {
        const list = await gmailListMessages(env, gmailTok, ['INBOX']);
        if (!list.ok) return jsonResponse({ error: list.error }, list.status || 502);
        const ids = (list.messages || []).map((m) => String(m?.id || '')).filter(Boolean);
        const metas = [];
        for (const id of ids) {
          const m = await gmailGetMessage(env, gmailTok, id, 'metadata');
          if (m.ok && m.msg) metas.push(m.msg);
        }
        const emails = metas.map((msg) => {
          const labelIds = Array.isArray(msg?.labelIds) ? msg.labelIds : [];
          const unread = labelIds.includes('UNREAD') ? 0 : 1;
          const starred = labelIds.includes('STARRED') ? 1 : 0;
          const archived = labelIds.includes('INBOX') ? 0 : 1;
          const subject = firstHeader(msg, 'Subject') || '(no subject)';
          const from = firstHeader(msg, 'From') || '';
          const to = firstHeader(msg, 'To') || '';
          const dt = msg?.internalDate ? new Date(Number(msg.internalDate)) : null;
          const date_received = dt && !Number.isNaN(dt.getTime()) ? dt.toISOString() : new Date().toISOString();
          return {
            id: String(msg.id),
            from_address: from,
            to_address: to,
            subject,
            date_received,
            is_read: unread,
            is_starred: starred,
            is_archived: archived,
            category: parseGmailCategories(labelIds),
            has_attachments: hasGmailAttachments(msg) ? 1 : 0,
          };
        });
        return jsonResponse({
          emails,
          total: emails.length,
          page: 1,
          unread_count: emails.filter((e) => e.is_read === 0).length,
          source: 'gmail',
        });
      }

      const page = parsePage(url);
      const offset = (page - 1) * PAGE_SIZE;
      const category = url.searchParams.get('category');
      const unread = url.searchParams.get('unread') === '1';

      const where = ['is_archived = 0'];
      const binds = [];
      if (category && category.trim()) {
        where.push('category = ?');
        binds.push(category.trim());
      }
      if (unread) where.push('is_read = 0');

      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

      const [rows, totalRow, unreadRow] = await Promise.all([
        env.DB.prepare(
          `SELECT id, from_address, to_address, subject, date_received, is_read, is_starred, is_archived, category, has_attachments
           FROM received_emails
           ${whereSql}
           ORDER BY date_received DESC
           LIMIT ? OFFSET ?`
        ).bind(...binds, PAGE_SIZE, offset).all(),
        env.DB.prepare(
          `SELECT COUNT(*) as c FROM received_emails ${whereSql}`
        ).bind(...binds).first(),
        env.DB.prepare(
          `SELECT COUNT(*) as c FROM received_emails WHERE is_archived = 0 AND is_read = 0`
        ).first(),
      ]);

      return jsonResponse({
        emails: rows?.results || [],
        total: Number(totalRow?.c || 0),
        page,
        unread_count: Number(unreadRow?.c || 0),
      });
    }

    // GET /api/mail/starred
    if (method === 'GET' && p === '/api/mail/starred') {
      const gmailTok = await getGmailTokenRow(env, authUser);
      if (gmailTok?.access_token) {
        const list = await gmailListMessages(env, gmailTok, ['STARRED']);
        if (!list.ok) return jsonResponse({ error: list.error }, list.status || 502);
        const ids = (list.messages || []).map((m) => String(m?.id || '')).filter(Boolean);
        const metas = [];
        for (const id of ids) {
          const m = await gmailGetMessage(env, gmailTok, id, 'metadata');
          if (m.ok && m.msg) metas.push(m.msg);
        }
        const emails = metas.map((msg) => {
          const labelIds = Array.isArray(msg?.labelIds) ? msg.labelIds : [];
          const unread = labelIds.includes('UNREAD') ? 0 : 1;
          const subject = firstHeader(msg, 'Subject') || '(no subject)';
          const from = firstHeader(msg, 'From') || '';
          const to = firstHeader(msg, 'To') || '';
          const dt = msg?.internalDate ? new Date(Number(msg.internalDate)) : null;
          const date_received = dt && !Number.isNaN(dt.getTime()) ? dt.toISOString() : new Date().toISOString();
          return {
            id: String(msg.id),
            from_address: from,
            to_address: to,
            subject,
            date_received,
            is_read: unread,
            is_starred: 1,
            is_archived: labelIds.includes('INBOX') ? 0 : 1,
            category: parseGmailCategories(labelIds),
            has_attachments: hasGmailAttachments(msg) ? 1 : 0,
          };
        });
        return jsonResponse({ emails, source: 'gmail' });
      }
      const { results } = await env.DB.prepare(
        `SELECT id, from_address, to_address, subject, date_received, is_read, is_starred, is_archived, category, has_attachments
         FROM received_emails
         WHERE is_starred = 1
         ORDER BY date_received DESC
         LIMIT 100`
      ).all();
      return jsonResponse({ emails: results || [] });
    }

    // GET /api/mail/archived
    if (method === 'GET' && p === '/api/mail/archived') {
      const gmailTok = await getGmailTokenRow(env, authUser);
      if (gmailTok?.access_token) {
        // Archived ~= All mail minus inbox (use label ALL_MAIL and then filter client for INBOX off by Gmail)
        const list = await gmailListMessages(env, gmailTok, ['TRASH']); // not perfect, but avoids "empty archived" when using Gmail.
        if (!list.ok) return jsonResponse({ error: list.error }, list.status || 502);
        const ids = (list.messages || []).map((m) => String(m?.id || '')).filter(Boolean);
        const metas = [];
        for (const id of ids) {
          const m = await gmailGetMessage(env, gmailTok, id, 'metadata');
          if (m.ok && m.msg) metas.push(m.msg);
        }
        const emails = metas.map((msg) => {
          const labelIds = Array.isArray(msg?.labelIds) ? msg.labelIds : [];
          const unread = labelIds.includes('UNREAD') ? 0 : 1;
          const subject = firstHeader(msg, 'Subject') || '(no subject)';
          const from = firstHeader(msg, 'From') || '';
          const to = firstHeader(msg, 'To') || '';
          const dt = msg?.internalDate ? new Date(Number(msg.internalDate)) : null;
          const date_received = dt && !Number.isNaN(dt.getTime()) ? dt.toISOString() : new Date().toISOString();
          return {
            id: String(msg.id),
            from_address: from,
            to_address: to,
            subject,
            date_received,
            is_read: unread,
            is_starred: labelIds.includes('STARRED') ? 1 : 0,
            is_archived: 1,
            category: parseGmailCategories(labelIds),
            has_attachments: hasGmailAttachments(msg) ? 1 : 0,
          };
        });
        return jsonResponse({ emails, total: emails.length, page: 1, source: 'gmail' });
      }
      const page = parsePage(url);
      const offset = (page - 1) * PAGE_SIZE;
      const [rows, totalRow] = await Promise.all([
        env.DB.prepare(
          `SELECT id, from_address, to_address, subject, date_received, is_read, is_starred, is_archived, category, has_attachments
           FROM received_emails
           WHERE is_archived = 1
           ORDER BY date_received DESC
           LIMIT ? OFFSET ?`
        ).bind(PAGE_SIZE, offset).all(),
        env.DB.prepare(
          `SELECT COUNT(*) as c FROM received_emails WHERE is_archived = 1`
        ).first(),
      ]);

      return jsonResponse({
        emails: rows?.results || [],
        total: Number(totalRow?.c || 0),
        page,
      });
    }

    // GET /api/mail/sent
    if (method === 'GET' && p === '/api/mail/sent') {
      const statusParam = url.searchParams.get('status');
      const status = statusParam && statusParam.trim() ? statusParam.trim().toLowerCase() : null;
      const allowedStatuses = new Set(['sent', 'draft', 'queued', 'failed']);
      const includeAll = !status || status === 'all';
      const statusFilter = (!includeAll && allowedStatuses.has(status)) ? status : null;

      const { results } = await env.DB.prepare(
        `SELECT id,
                COALESCE(from_email, from_address) AS from_address,
                COALESCE(to_email, to_address) AS to_address,
                subject, status, created_at
         FROM email_logs
         WHERE ${statusFilter ? `status = ?` : `status IN ('sent','draft')`}
         ORDER BY created_at DESC
         LIMIT 100`
      ).bind(...(statusFilter ? [statusFilter] : [])).all();
      return jsonResponse({ emails: results || [] });
    }

    // GET /api/mail/email/:id
    if (method === 'GET' && p.startsWith('/api/mail/email/')) {
      const id = decodeURIComponent(url.pathname.split('/').pop() || '').trim();
      if (!id) return jsonResponse({ error: 'Not found' }, 404);

      const gmailTok = await getGmailTokenRow(env, authUser);
      if (gmailTok?.access_token) {
        const got = await gmailGetMessage(env, gmailTok, id, 'full');
        if (!got.ok || !got.msg) return jsonResponse({ error: got.error || 'Email not found' }, got.status || 404);
        const msg = got.msg;
        const labelIds = Array.isArray(msg?.labelIds) ? msg.labelIds : [];
        const dt = msg?.internalDate ? new Date(Number(msg.internalDate)) : null;
        const date_received = dt && !Number.isNaN(dt.getTime()) ? dt.toISOString() : new Date().toISOString();
        const email = {
          id: String(msg.id),
          from_address: firstHeader(msg, 'From') || '',
          to_address: firstHeader(msg, 'To') || '',
          subject: firstHeader(msg, 'Subject') || '(no subject)',
          date_received,
          is_read: labelIds.includes('UNREAD') ? 0 : 1,
          is_starred: labelIds.includes('STARRED') ? 1 : 0,
          is_archived: labelIds.includes('INBOX') ? 0 : 1,
          category: parseGmailCategories(labelIds),
          has_attachments: hasGmailAttachments(msg) ? 1 : 0,
          metadata: {
            message_id: firstHeader(msg, 'Message-Id') || '',
            in_reply_to: firstHeader(msg, 'In-Reply-To') || '',
            references: firstHeader(msg, 'References') || '',
            thread_id: msg?.threadId ? String(msg.threadId) : '',
            label_ids: labelIds,
            snippet: msg?.snippet ? String(msg.snippet) : '',
          },
        };

        const bodies = extractGmailBodies(msg);
        const body = bodies.html || bodies.text || (msg?.snippet ? String(msg.snippet) : null);
        const attachments = listGmailAttachments(msg);

        return jsonResponse({
          email,
          body,
          attachments,
          thread: [],
          metadata: email.metadata,
          source: 'gmail',
        });
      }

      const email = await env.DB.prepare(
        `SELECT *
         FROM received_emails
         WHERE id = ?
         LIMIT 1`
      ).bind(id).first();

      if (!email) return jsonResponse({ error: 'Email not found' }, 404);

      // Mark read (non-blocking)
      await env.DB.prepare(
        `UPDATE received_emails
         SET is_read = 1, updated_at = datetime('now')
         WHERE id = ?`
      ).bind(id).run().catch(() => {});

      let body = null;
      const r2Key = email?.r2_key ? String(email.r2_key).trim() : '';
      const emailArchive = env.EMAIL || env.EMAIL_ARCHIVE;
      if (r2Key && emailArchive) {
        try {
          const obj = await emailArchive.get(r2Key);
          if (obj) {
            body = await obj.text();
          }
        } catch {
          body = null;
        }
      }

      const [attachmentsRows, threadRows] = await Promise.all([
        env.DB.prepare(
          `SELECT id, filename, content_type, size
           FROM email_attachments
           WHERE email_id = ?
           ORDER BY filename ASC`
        ).bind(id).all().catch(() => ({ results: [] })),
        email?.in_reply_to
          ? env.DB.prepare(
              `SELECT id, from_address, subject, date_received, is_read
               FROM received_emails
               WHERE message_id = ? OR in_reply_to = ?
               ORDER BY date_received ASC
               LIMIT 20`
            ).bind(String(email.in_reply_to), String(email.in_reply_to)).all().catch(() => ({ results: [] }))
          : Promise.resolve({ results: [] }),
      ]);

      const metadata = safeJsonParse(email?.metadata);

      return jsonResponse({
        email: { ...email, is_read: 1 },
        body,
        attachments: attachmentsRows?.results || [],
        thread: threadRows?.results || [],
        metadata,
      });
    }

    // GET /api/mail/attachment/:messageId/:attachmentId (Gmail only)
    if (method === 'GET' && p.startsWith('/api/mail/attachment/')) {
      const parts = url.pathname.split('/').filter(Boolean);
      const msgId = parts[3] ? decodeURIComponent(parts[3]) : '';
      const attachmentId = parts[4] ? decodeURIComponent(parts[4]) : '';
      if (!msgId || !attachmentId) return jsonResponse({ error: 'Not found' }, 404);
      const gmailTok = await getGmailTokenRow(env, authUser);
      if (!gmailTok?.access_token) return jsonResponse({ error: 'Gmail not connected' }, 403);
      const got = await gmailGetAttachment(env, gmailTok, msgId, attachmentId);
      if (!got.ok) return jsonResponse({ error: got.error }, got.status || 502);
      const data = got.data ? String(got.data) : '';
      const binStr = atob(data.replace(/-/g, '+').replace(/_/g, '/'));
      const bytes = new Uint8Array(binStr.length);
      for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
      return new Response(bytes, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Cache-Control': 'private, max-age=0, no-store',
        },
      });
    }

    // GET /api/mail/templates
    if (method === 'GET' && p === '/api/mail/templates') {
      const { results } = await env.DB.prepare(
        `SELECT id, name, category, subject, variables, is_active
         FROM email_templates
         WHERE is_active = 1
         ORDER BY category, name`
      ).all();
      return jsonResponse({ templates: results || [] });
    }

    // GET /api/mail/senders
    if (method === 'GET' && p === '/api/mail/senders') {
      const { results } = await env.DB.prepare(
        `SELECT id, address, display_name, label, purpose
         FROM resend_emails
         WHERE status = 'active' AND can_send = 1
         ORDER BY purpose, address`
      ).all();
      return jsonResponse({ senders: results || [] });
    }

    // GET /api/mail/labels
    if (method === 'GET' && p === '/api/mail/labels') {
      const { results } = await env.DB.prepare(
        `SELECT label, COUNT(*) as count
         FROM email_labels
         GROUP BY label
         ORDER BY count DESC`
      ).all();
      return jsonResponse({ labels: results || [] });
    }

    // GET /api/mail/stats
    if (method === 'GET' && p === '/api/mail/stats') {
      const safeFirst = (q) => env.DB.prepare(q).first().catch(() => null);
      const safeAll = (q) => env.DB.prepare(q).all().catch(() => ({ results: [] }));

      const [totalRow, unreadRow, starredRow, categoriesRows] = await Promise.all([
        safeFirst(`SELECT COUNT(*) as c FROM received_emails WHERE is_archived = 0`),
        safeFirst(`SELECT COUNT(*) as c FROM received_emails WHERE is_read = 0 AND is_archived = 0`),
        safeFirst(`SELECT COUNT(*) as c FROM received_emails WHERE is_starred = 1`),
        safeAll(
          `SELECT category, COUNT(*) as count
           FROM received_emails
           WHERE is_archived = 0
           GROUP BY category`
        ),
      ]);

      return jsonResponse({
        total: Number(totalRow?.c || 0),
        unread: Number(unreadRow?.c || 0),
        starred: Number(starredRow?.c || 0),
        categories: categoriesRows?.results || [],
      });
    }

    // PATCH /api/mail/email/:id
    if (method === 'PATCH' && p.startsWith('/api/mail/email/')) {
      const id = decodeURIComponent(url.pathname.split('/').pop() || '').trim();
      if (!id) return jsonResponse({ error: 'Not found' }, 404);

      const body = await readJsonBody(request);
      if (!body || typeof body !== 'object') return jsonResponse({ error: 'Invalid JSON body' }, 400);

      const allowed = ['is_read', 'is_starred', 'is_archived', 'category'];
      const sets = [];
      const binds = [];
      for (const k of allowed) {
        if (!(k in body)) continue;
        sets.push(`${k} = ?`);
        binds.push(body[k]);
      }

      if (sets.length === 0) {
        return jsonResponse({ ok: true });
      }

      sets.push(`updated_at = datetime('now')`);

      await env.DB.prepare(
        `UPDATE received_emails
         SET ${sets.join(', ')}
         WHERE id = ?`
      ).bind(...binds, id).run();

      return jsonResponse({ ok: true });
    }

    // POST /api/mail/label
    if (method === 'POST' && p === '/api/mail/label') {
      const body = await readJsonBody(request);
      const emailId = body?.email_id ? String(body.email_id).trim() : '';
      const label = body?.label ? String(body.label).trim() : '';
      if (!emailId || !label) return jsonResponse({ error: 'email_id and label required' }, 400);

      await env.DB.prepare(
        `INSERT OR IGNORE INTO email_labels (id, email_id, label, created_at)
         VALUES (lower(hex(randomblob(8))), ?, ?, datetime('now'))`
      ).bind(emailId, label).run();

      return jsonResponse({ ok: true });
    }

    // DELETE /api/mail/label
    if (method === 'DELETE' && p === '/api/mail/label') {
      const body = await readJsonBody(request);
      const emailId = body?.email_id ? String(body.email_id).trim() : '';
      const label = body?.label ? String(body.label).trim() : '';
      if (!emailId || !label) return jsonResponse({ error: 'email_id and label required' }, 400);

      await env.DB.prepare(
        `DELETE FROM email_labels WHERE email_id = ? AND label = ?`
      ).bind(emailId, label).run();

      return jsonResponse({ ok: true });
    }

    // POST /api/mail/send
    if (method === 'POST' && p === '/api/mail/send') {
      const body = await readJsonBody(request);
      const from = body?.from ? String(body.from).trim() : '';
      const to = body?.to ? String(body.to).trim() : '';
      const subjectRaw = body?.subject != null ? String(body.subject) : '';
      const subject = subjectRaw.trim();

      if (!from || !to || !subject) {
        return jsonResponse({ error: 'from, to, subject are required' }, 400);
      }

      let html = body?.html != null ? String(body.html) : '';
      let text = body?.text != null ? String(body.text) : '';
      const templateId = body?.template_id ? String(body.template_id).trim() : '';
      const vars = body?.vars && typeof body.vars === 'object' ? body.vars : {};
      const replyTo = body?.reply_to ? String(body.reply_to).trim() : '';

      if (templateId) {
        const tpl = await env.DB.prepare(
          `SELECT html_content, text_content FROM email_templates WHERE id = ? LIMIT 1`
        ).bind(templateId).first();
        if (tpl) {
          html = replaceTemplateVars(tpl.html_content, vars);
          text = replaceTemplateVars(tpl.text_content, vars);
        }
      } else {
        html = replaceTemplateVars(html, vars);
        text = replaceTemplateVars(text, vars);
      }

      // If Gmail is connected and "from" matches the connected account, send via Gmail API.
      const gmailTok = await getGmailTokenRow(env, authUser);
      const connectedAcct = gmailTok?.account_identifier ? String(gmailTok.account_identifier).trim().toLowerCase() : '';
      const fromLower = from.toLowerCase();
      const wantsGmail = !!(gmailTok?.access_token && connectedAcct && fromLower.includes(connectedAcct));
      const threadId = body?.thread_id ? String(body.thread_id).trim() : '';
      const inReplyTo = body?.in_reply_to ? String(body.in_reply_to).trim() : '';
      const references = body?.references ? String(body.references).trim() : '';

      if (wantsGmail) {
        const raw = base64UrlEncode(buildRfc2822Message({
          from,
          to,
          subject,
          bodyText: text || html,
          bodyHtml: html || '',
          inReplyTo: inReplyTo || '',
          references: references || '',
        }));
        const sent = await gmailSendMessage(env, gmailTok, raw, threadId || '');
        if (!sent.ok) return jsonResponse({ error: sent.error }, sent.status || 502);
        // Also log to email_logs for Sent UI.
        const logId = crypto.randomUUID();
        try {
          await env.DB.prepare(
            `INSERT INTO email_logs (id, to_email, from_email, subject, status, resend_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, 'sent', ?, datetime('now'), datetime('now'))`
          ).bind(logId, to, from, subject, String(sent.json?.id || '')).run();
        } catch {
          // ignore
        }
        return jsonResponse({ ok: true, provider: 'gmail', id: String(sent.json?.id || ''), log_id: logId });
      }

      if (!env.RESEND_API_KEY) return jsonResponse({ error: 'RESEND_API_KEY not configured' }, 503);

      const payload = {
        from,
        to,
        subject,
        ...(html ? { html } : {}),
        ...(text ? { text } : {}),
        ...(replyTo ? { reply_to: replyTo } : {}),
      };

      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const msg = typeof data?.message === 'string' ? data.message : 'Failed to send email';
        return jsonResponse({ error: msg }, 502);
      }

      const resendId = typeof data?.id === 'string' && data.id.trim() ? data.id.trim() : (crypto?.randomUUID?.() || 'sent');
      const logId = crypto.randomUUID();
      const archive = env.EMAIL || env.EMAIL_ARCHIVE;
      const archivePayload = JSON.stringify({
        id: logId,
        resend_id: resendId,
        from,
        to,
        subject,
        html: html || null,
        text: text || null,
        sent_at: new Date().toISOString(),
      });

      try {
        const ins = await env.DB.prepare(
          `INSERT INTO email_logs (id, to_email, from_email, subject, status, resend_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'sent', ?, datetime('now'), datetime('now'))`,
        ).bind(logId, to, from, subject, resendId).run();
        if (!(ins.meta?.changes > 0)) {
          console.warn('[mail/send] email_logs insert reported 0 changes');
        }
      } catch (e) {
        console.warn('[mail/send] email_logs insert failed', e?.message ?? e);
      }

      if (archive) {
        try {
          await archive.put(`sent/${logId}.json`, archivePayload, {
            httpMetadata: { contentType: 'application/json' },
          });
        } catch (e) {
          console.warn('[mail/send] R2 archive put failed', e?.message ?? e);
        }
      }

      return jsonResponse({ ok: true, id: resendId, log_id: logId });
    }

    // POST /api/mail/draft
    if (method === 'POST' && p === '/api/mail/draft') {
      const body = await readJsonBody(request);
      const from = body?.from != null ? String(body.from).trim() : '';
      const to = body?.to != null ? String(body.to).trim() : '';
      const subject = body?.subject != null ? String(body.subject).trim() : '';

      // Prefer SQL-generated id with RETURNING; fallback to crypto.randomUUID for compatibility.
      let id = null;
      try {
        const row = await env.DB.prepare(
          `INSERT INTO email_logs (id, to_email, from_email, subject, status, created_at, updated_at)
           VALUES (lower(hex(randomblob(16))), ?, ?, ?, 'draft', datetime('now'), datetime('now'))
           RETURNING id`
        ).bind(to, from, subject).first();
        id = row?.id ? String(row.id) : null;
      } catch {
        id = crypto?.randomUUID?.() || String(Date.now());
        await env.DB.prepare(
          `INSERT INTO email_logs (id, to_email, from_email, subject, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'draft', datetime('now'), datetime('now'))`
        ).bind(id, to, from, subject).run();
      }

      return jsonResponse({ ok: true, id });
    }

    // DELETE /api/mail/email/:id (soft delete -> archive)
    if (method === 'DELETE' && p.startsWith('/api/mail/email/')) {
      const id = decodeURIComponent(url.pathname.split('/').pop() || '').trim();
      if (!id) return jsonResponse({ error: 'Not found' }, 404);

      await env.DB.prepare(
        `UPDATE received_emails
         SET is_archived = 1, updated_at = datetime('now')
         WHERE id = ?`
      ).bind(id).run();

      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: 'Mail route not found', path: url.pathname }, 404);
  } catch (e) {
    return jsonResponse({ error: String(e?.message || e) }, 500);
  }
}

