/**
 * Platform email (Resend or delegated Gmail) vs user Gmail (OAuth tokens).
 */
import { getVaultSecrets, getPublicConfig, secretFromVault } from '../core/vault.js';

function b64UrlEncodeUtf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64UrlEncodeRaw(buf) {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getGmailPlatformAccessToken(env, vault) {
  if (env.KV) {
    const cached = await env.KV.get('gmail_send:access_token');
    if (cached) return cached;
  }
  const raw = secretFromVault(vault, env, 'GOOGLE_SERVICE_ACCOUNT_JSON');
  if (!raw || typeof raw !== 'string') throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not configured');
  const sa = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);
  const header = b64UrlEncodeUtf8(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const deleg =
    (env.GMAIL_DELEGATED_USER && String(env.GMAIL_DELEGATED_USER).trim()) ||
    (env.GMAIL_IMPERSONATE_USER && String(env.GMAIL_IMPERSONATE_USER).trim()) ||
    secretFromVault(vault, env, 'GMAIL_DELEGATED_USER') ||
    '';
  const payloadObj = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/gmail.send',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now - 60,
  };
  if (deleg) payloadObj.sub = deleg;
  const payload = b64UrlEncodeUtf8(JSON.stringify(payloadObj));
  const pem = sa.private_key;
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');
  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signingInput = `${header}.${payload}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );
  const jwt = `${signingInput}.${b64UrlEncodeRaw(signature)}`;
  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const tokJson = await tokenResp.json();
  if (!tokenResp.ok || !tokJson.access_token) {
    const err = tokJson.error_description || tokJson.error || 'token exchange failed';
    throw new Error(typeof err === 'string' ? err : JSON.stringify(err));
  }
  if (env.KV) {
    await env.KV.put('gmail_send:access_token', tokJson.access_token, { expirationTtl: 3300 });
  }
  return tokJson.access_token;
}

function buildRfc2822({ from, to, subject, html, text }) {
  const boundary = `b_${crypto.randomUUID?.() || Date.now()}`;
  const body =
    html && text
      ? [
          'MIME-Version: 1.0',
          `Content-Type: multipart/alternative; boundary="${boundary}"`,
          '',
          `--${boundary}`,
          'Content-Type: text/plain; charset=UTF-8',
          '',
          text,
          '',
          `--${boundary}`,
          'Content-Type: text/html; charset=UTF-8',
          '',
          html,
          '',
          `--${boundary}--`,
        ].join('\r\n')
      : html
        ? ['MIME-Version: 1.0', 'Content-Type: text/html; charset=UTF-8', '', html].join('\r\n')
        : ['MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', '', text || ''].join('\r\n');

  const head = [`From: ${from}`, `To: ${to}`, `Subject: ${subject}`].join('\r\n');
  return `${head}\r\n${body}`;
}

function toRawBase64Url(rfc2822) {
  const bytes = new TextEncoder().encode(rfc2822);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sendViaResend(vault, env, { from, to, subject, html, text }) {
  const key = secretFromVault(vault, env, 'RESEND_API_KEY');
  if (!key) throw new Error('RESEND_API_KEY not configured');
  const body = { from, to: [to], subject };
  if (html) body.html = html;
  if (text) body.text = text;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Resend ${res.status}: ${t.slice(0, 400)}`);
  }
  const json = await res.json().catch(() => ({}));
  return json;
}

async function sendViaGmailPlatform(vault, env, { from, to, subject, html, text }) {
  const token = await getGmailPlatformAccessToken(env, vault);
  const rfc = buildRfc2822({ from, to, subject, html: html || '', text });
  const raw = toRawBase64Url(rfc);
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Gmail API ${res.status}: ${t.slice(0, 400)}`);
  }
  return res.json().catch(() => ({}));
}

/**
 * Platform transactional email: provider from public_config.platform_email_provider.
 * @param {object} env
 * @param {{ to?: string, subject: string, text?: string, html?: string, from?: string, category?: string }} opts
 * @param {import('@cloudflare/workers-types').ExecutionContext} [executionCtx]
 */
export async function sendPlatformEmail(env, opts, executionCtx) {
  const subjectRaw = String(opts.subject || '')
    .replace(/[\r\n\t]/g, ' ')
    .trim();
  const bodyRaw = String(opts.text || opts.body || '').trim();
  const category = String(opts.category || 'notice').trim();
  const publicCfg = await getPublicConfig(env);
  const vault = await getVaultSecrets(env);
  const toAddr = opts.to || secretFromVault(vault, env, 'RESEND_TO') || env.RESEND_TO || '';
  const fromOverride = opts.from ? String(opts.from).trim() : '';
  const fromDefault =
    fromOverride ||
    secretFromVault(vault, env, 'RESEND_FROM') ||
    env.RESEND_FROM ||
    secretFromVault(vault, env, 'PLATFORM_GMAIL_FROM') ||
    env.PLATFORM_GMAIL_FROM ||
    env.GMAIL_FROM ||
    '';
  const noPrefix = opts.noAgentSamPrefix === true;
  const prefix =
    noPrefix || subjectRaw.startsWith('[Agent Sam]') ? '' : '[Agent Sam] ';
  const subject = `${prefix}${subjectRaw}`.slice(0, 400);

  const providerRaw = String(publicCfg.platform_email_provider || '').trim().toLowerCase();
  const useResend = providerRaw === 'resend';

  const run = async () => {
    if (!toAddr) {
      console.warn('[sendPlatformEmail] no recipient', category);
      return { success: false, error: 'no_recipient' };
    }
    if (useResend) {
      const key = secretFromVault(vault, env, 'RESEND_API_KEY');
      if (!key) {
        console.warn('[sendPlatformEmail] RESEND_API_KEY not set', category);
        return { success: false, error: 'no_resend_key' };
      }
    } else {
      const hasSa = secretFromVault(vault, env, 'GOOGLE_SERVICE_ACCOUNT_JSON') || env.GOOGLE_SERVICE_ACCOUNT_JSON;
      if (!hasSa) {
        console.warn('[sendPlatformEmail] gmail_platform but GOOGLE_SERVICE_ACCOUNT_JSON not set', category);
        return { success: false, error: 'no_service_account' };
      }
    }

    try {
      let json;
      if (useResend) {
        const from = fromDefault;
        if (!from) {
          console.warn('[sendPlatformEmail] no From for resend', category);
          return { success: false, error: 'no_from' };
        }
        json = await sendViaResend(vault, env, {
          from,
          to: toAddr,
          subject,
          html: opts.html,
          text: bodyRaw,
        });
      } else {
        const from = fromDefault;
        if (!from) {
          console.warn('[sendPlatformEmail] no From for gmail_platform', category);
          return { success: false, error: 'no_from' };
        }
        json = await sendViaGmailPlatform(vault, env, {
          from,
          to: toAddr,
          subject,
          html: opts.html,
          text: bodyRaw,
        });
      }

      if (env.DB) {
        await env.DB.prepare(
          `INSERT INTO email_logs (id, to_email, from_email, subject, status, resend_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        )
          .bind(
            crypto.randomUUID(),
            toAddr,
            fromDefault || 'platform',
            subject,
            'sent',
            json?.id ?? null,
          )
          .run()
          .catch((e) => console.warn('[sendPlatformEmail] email_logs', e?.message ?? e));
      }
      return { success: true, data: json };
    } catch (e) {
      console.warn('[sendPlatformEmail]', e?.message ?? e);
      return { success: false, error: e?.message ?? String(e) };
    }
  };

  if (executionCtx && typeof executionCtx.waitUntil === 'function') {
    executionCtx.waitUntil(run());
    return { success: true, async: true };
  }
  return run();
}

async function refreshUserGoogleToken(env, vault, tokenRow) {
  if (!tokenRow?.refresh_token) return null;
  const cid = secretFromVault(vault, env, 'GOOGLE_CLIENT_ID') || env.GOOGLE_CLIENT_ID;
  const cs =
    secretFromVault(vault, env, 'GOOGLE_OAUTH_CLIENT_SECRET') || env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!cid || !cs) return null;
  const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cid,
      client_secret: cs,
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
       WHERE user_id = ? AND provider = ? AND (account_identifier = ? OR (account_identifier IS NULL AND ? = ''))`,
    )
      .bind(
        refreshed.access_token,
        exp,
        tokenRow.user_id,
        tokenRow.provider,
        tokenRow.account_identifier || '',
        tokenRow.account_identifier || '',
      )
      .run();
  } catch {
    /* ignore */
  }
  return { access_token: refreshed.access_token, expires_at: exp };
}

async function gmailSendWithUserToken(env, vault, tokenRow, raw) {
  let tok = tokenRow?.access_token ? String(tokenRow.access_token) : '';
  if (!tok) throw new Error('No user access token');
  let res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }),
  });
  if (res.status === 401 && tokenRow?.refresh_token) {
    const refreshed = await refreshUserGoogleToken(env, vault, tokenRow);
    if (refreshed?.access_token) {
      res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${refreshed.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw }),
      });
    }
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Gmail user send ${res.status}: ${t.slice(0, 300)}`);
  }
  return res.json().catch(() => ({}));
}

/**
 * Send as the user's connected Google account (never platform keys).
 * @param {object} env
 * @param {string} userId
 * @param {{ to: string, subject: string, html?: string, text?: string }} params
 */
export async function sendUserGmail(env, userId, params) {
  if (!env?.DB || !userId) return { ok: false, error: 'missing_db_or_user' };
  const to = String(params.to || '').trim();
  const subject = String(params.subject || '').trim();
  if (!to || !subject) return { ok: false, error: 'to_and_subject_required' };

  const vault = await getVaultSecrets(env);
  const row = await env.DB.prepare(
    `SELECT user_id, provider, account_identifier, access_token, refresh_token, expires_at
     FROM user_oauth_tokens
     WHERE user_id = ? AND LOWER(provider) IN ('google', 'google_gmail')
     ORDER BY updated_at DESC
     LIMIT 1`,
  )
    .bind(String(userId))
    .first()
    .catch(() => null);
  if (!row?.access_token && !row?.refresh_token) {
    return { ok: false, error: 'no_google_oauth' };
  }

  const fromAddr = String(row.account_identifier || '').trim();
  if (!fromAddr || !fromAddr.includes('@')) {
    return { ok: false, error: 'no_sender_identity' };
  }

  const html = params.html != null ? String(params.html) : '';
  const text = params.text != null ? String(params.text) : '';
  const rfc = buildRfc2822({
    from: fromAddr,
    to,
    subject,
    html: html || undefined,
    text: text || html || '',
  });
  const raw = toRawBase64Url(rfc);
  const json = await gmailSendWithUserToken(env, vault, row, raw);
  return { ok: true, id: json?.id };
}
