/**
 * Integration Layer: Resend
 * Transactional email via api.resend.com.
 * Uses RESEND_API_KEY secret.
 * Logs all sends to D1 email_logs table.
 * Distinct from core/notifications.js (notifySam) —
 * this is the lower-level API wrapper for arbitrary email sends.
 */
import { jsonResponse } from '../core/responses.js';

const RESEND_BASE = 'https://api.resend.com';

// ─── Core Send ────────────────────────────────────────────────────────────────

/**
 * Send a transactional email via Resend.
 *
 * @param {object} env
 * @param {object} opts
 * @param {string|string[]} opts.to       - recipient(s)
 * @param {string}          opts.from     - sender (must be verified domain)
 * @param {string}          opts.subject
 * @param {string}          [opts.text]   - plain text body
 * @param {string}          [opts.html]   - HTML body
 * @param {string|string[]} [opts.cc]
 * @param {string|string[]} [opts.bcc]
 * @param {string}          [opts.reply_to]
 * @param {string}          [opts.tag]    - category tag for email_logs
 * @returns {Promise<{id: string|null, ok: boolean, error?: string}>}
 */
export async function sendEmail(env, opts) {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY not configured');

  const from    = opts.from    || env.RESEND_FROM || 'agent@inneranimalmedia.com';
  const to      = Array.isArray(opts.to) ? opts.to : [opts.to];
  const subject = String(opts.subject || '').replace(/[\r\n\t]/g, ' ').trim().slice(0, 400);

  if (!to.length || !subject) throw new Error('sendEmail: to and subject are required');

  const payload = {
    from,
    to,
    subject,
    ...(opts.text      ? { text: opts.text }           : {}),
    ...(opts.html      ? { html: opts.html }           : {}),
    ...(opts.cc        ? { cc: opts.cc }               : {}),
    ...(opts.bcc       ? { bcc: opts.bcc }             : {}),
    ...(opts.reply_to  ? { reply_to: opts.reply_to }   : {}),
  };

  let resendId = null;
  let ok       = false;
  let errorMsg = null;

  try {
    const res  = await fetch(`${RESEND_BASE}/emails`, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => ({}));
    ok         = res.ok;
    resendId   = json.id ?? null;
    if (!ok) errorMsg = json.message || json.error || `HTTP ${res.status}`;
  } catch (e) {
    errorMsg = e.message;
  }

  await logEmailToD1(env, {
    to:       to.join(', '),
    from,
    subject,
    status:   ok ? 'sent' : 'failed',
    resendId,
    tag:      opts.tag || null,
    error:    errorMsg,
  }).catch(() => {});

  return { id: resendId, ok, ...(errorMsg ? { error: errorMsg } : {}) };
}

/**
 * Send to multiple recipients in a single Resend batch call.
 * Each recipient gets their own email (not a group send).
 *
 * @param {object} env
 * @param {Array<{to, subject, text?, html?}>} emails
 * @param {string} from - sender address
 * @returns {Promise<{ok: boolean, data: object[]}>}
 */
export async function sendBatch(env, emails, from) {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY not configured');

  const fromAddr = from || env.RESEND_FROM || 'agent@inneranimalmedia.com';

  const batch = emails.map(e => ({
    from:    fromAddr,
    to:      Array.isArray(e.to) ? e.to : [e.to],
    subject: String(e.subject || '').replace(/[\r\n\t]/g, ' ').trim().slice(0, 400),
    ...(e.text ? { text: e.text } : {}),
    ...(e.html ? { html: e.html } : {}),
  }));

  const res  = await fetch(`${RESEND_BASE}/emails/batch`, {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(batch),
  });

  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data: data.data || [] };
}

// ─── D1 Logging ───────────────────────────────────────────────────────────────

/**
 * Log an email send attempt to D1 email_logs table.
 */
export async function logEmailToD1(env, opts) {
  if (!env.DB) return;

  await env.DB.prepare(
    `INSERT INTO email_logs
     (id, to_email, from_email, subject, status, resend_id, tag, error_message, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
  ).bind(
    crypto.randomUUID(),
    opts.to     || '',
    opts.from   || '',
    opts.subject|| '',
    opts.status || 'unknown',
    opts.resendId || null,
    opts.tag      || null,
    opts.error    || null,
  ).run().catch(e => console.warn('[resend] email_logs write failed:', e?.message));
}

// ─── HTTP Handler ─────────────────────────────────────────────────────────────

/**
 * HTTP dispatcher for /api/resend/* routes.
 */
export async function handleResendApi(request, url, env) {
  const path   = url.pathname.toLowerCase();
  const method = request.method.toUpperCase();

  if (method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  let body = {};
  try { body = await request.json(); } catch (_) {}

  if (path === '/api/resend/send') {
    try {
      const result = await sendEmail(env, body);
      return jsonResponse(result, result.ok ? 200 : 502);
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  if (path === '/api/resend/batch') {
    try {
      const { emails, from } = body;
      if (!Array.isArray(emails) || !emails.length) {
        return jsonResponse({ error: 'emails array required' }, 400);
      }
      const result = await sendBatch(env, emails, from);
      return jsonResponse(result);
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  return jsonResponse({ error: 'Resend route not found' }, 404);
}
