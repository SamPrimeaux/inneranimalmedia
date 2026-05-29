/**
 * OpenAI inbound webhooks — HMAC verify + D1 audit + registry workflow dispatch.
 */
import { jsonResponse } from '../../core/auth.js';
import { getVaultSecrets, secretFromVault } from '../../core/vault.js';
import { ingestWebhookEventAndDispatch } from '../../core/webhook-ingest-dispatch.js';

/** @param {string} a @param {string} b */
function timingSafeEqualUtf8(a, b) {
  const enc = new TextEncoder();
  const ea = enc.encode(a);
  const eb = enc.encode(b);
  if (ea.length !== eb.length) return false;
  let d = 0;
  for (let i = 0; i < ea.length; i += 1) d |= ea[i] ^ eb[i];
  return d === 0;
}

/** @param {string} secret @param {string} message */
async function hmacSha256Hex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map((c) => c.toString(16).padStart(2, '0')).join('');
}

/** @param {any} env */
async function resolveOpenAiWebhookSecret(env) {
  let secret = env?.OPENAI_WEBHOOK_SECRET;
  if (secret != null && String(secret).trim() !== '') return String(secret).trim();
  if (env?.DB && (env?.VAULT_KEY || env?.VAULT_MASTER_KEY)) {
    try {
      const vault = await getVaultSecrets(env);
      secret = secretFromVault(vault, env, 'OPENAI_WEBHOOK_SECRET');
      if (secret != null && String(secret).trim() !== '') return String(secret).trim();
    } catch {
      /* vault unavailable */
    }
  }
  return null;
}

/**
 * @param {Request} request
 * @param {any} env
 * @param {ExecutionContext} ctx
 */
export async function handleOpenAiWebhook(request, env, ctx) {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const raw = await request.text();
  const key = await resolveOpenAiWebhookSecret(env);
  if (key) {
    const sig = (request.headers.get('x-openai-signature') || '').trim();
    const expected = await hmacSha256Hex(key, raw);
    if (!sig || !timingSafeEqualUtf8(sig.toLowerCase(), expected.toLowerCase())) {
      return jsonResponse({ error: 'invalid signature' }, 401);
    }
  }

  /** @type {Record<string, unknown>} */
  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    return jsonResponse({ error: 'invalid JSON' }, 400);
  }

  const eventType = String(payload?.type || 'unknown').trim();
  await ingestWebhookEventAndDispatch(env, ctx, {
    tenantId: null,
    workspaceId: null,
    provider: 'openai',
    eventType,
    eventId: payload?.id != null ? String(payload.id) : null,
    payload,
    endpointPath: '/api/webhooks/openai',
    signatureValid: Boolean(key),
  });

  return jsonResponse({ ok: true });
}
