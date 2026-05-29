/**
 * Cursor Cloud Agents webhook — verifies signature, audits event, dispatches wf_on_cursor.
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

/**
 * @param {Request} request
 * @param {any} env
 * @param {ExecutionContext} ctx
 */
export async function handleCursorWebhook(request, env, ctx) {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  let secret = env.CURSOR_WEBHOOK_SECRET;
  if (!secret && env.DB && env.VAULT_KEY) {
    try {
      const vault = await getVaultSecrets(env);
      secret = secretFromVault(vault, env, 'CURSOR_WEBHOOK_SECRET');
    } catch {
      /* vault unavailable */
    }
  }
  if (!secret) {
    return jsonResponse({ error: 'CURSOR_WEBHOOK_SECRET not configured' }, 503);
  }

  const rawBody = await request.text();
  const sigHeader = (request.headers.get('X-Cursor-Signature') || request.headers.get('X-Webhook-Signature') || '').trim();
  const m = /^sha256=([0-9a-fA-F]+)$/.exec(sigHeader);
  if (!m) {
    return jsonResponse({ error: 'invalid signature' }, 401);
  }

  const recvHex = m[1].toLowerCase();
  const expectedHex = (await hmacSha256Hex(secret, rawBody)).toLowerCase();
  if (recvHex.length !== expectedHex.length || !timingSafeEqualUtf8(recvHex, expectedHex)) {
    return jsonResponse({ error: 'invalid signature' }, 401);
  }

  let payload = {};
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return jsonResponse({ error: 'invalid JSON' }, 400);
  }

  const eventType = String(
    payload?.type || payload?.event || payload?.event_type || 'unknown',
  ).trim();

  await ingestWebhookEventAndDispatch(env, ctx, {
    provider: 'cursor',
    eventType,
    eventId: payload?.id != null ? String(payload.id) : null,
    payload,
    endpointPath: '/api/webhooks/cursor',
    signatureValid: true,
    metadata: {
      agent_id: payload?.agent_id ?? payload?.agentId ?? null,
      status: payload?.status ?? null,
    },
    tenantId: payload?.tenant_id ?? null,
    workspaceId: payload?.workspace_id ?? null,
  });

  return jsonResponse({ ok: true });
}
