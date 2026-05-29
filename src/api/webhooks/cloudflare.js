/**
 * Cloudflare build/deploy webhooks — INTERNAL_WEBHOOK_SECRET or X-Cf-Webhook-Secret.
 */
import { jsonResponse } from '../../core/auth.js';
import { ingestWebhookEventAndDispatch } from '../../core/webhook-ingest-dispatch.js';
import { resolveInternalWebhookSecret } from './internal.js';

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

/**
 * @param {Request} request
 * @param {any} env
 * @param {ExecutionContext} ctx
 */
export async function handleCloudflareWebhook(request, env, ctx) {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const secret = await resolveInternalWebhookSecret(env);
  const cfHeader = (request.headers.get('X-Cf-Webhook-Secret') || '').trim();
  const auth = (request.headers.get('Authorization') || '').trim();
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';

  if (secret) {
    const candidate = cfHeader || bearer;
    if (!candidate || !timingSafeEqualUtf8(candidate, secret)) {
      return jsonResponse({ error: 'unauthorized' }, 401);
    }
  }

  const raw = await request.text();
  /** @type {Record<string, unknown>} */
  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { _raw: raw.slice(0, 8000) };
  }

  const eventType = String(
    payload?.type || payload?.event_type || payload?.status || 'build_event',
  ).trim();
  const tenantId =
    typeof env?.TENANT_ID === 'string' && env.TENANT_ID.trim() ? env.TENANT_ID.trim() : 'system';

  await ingestWebhookEventAndDispatch(env, ctx, {
    tenantId,
    provider: 'cloudflare',
    eventType,
    payload,
    endpointPath: '/api/webhooks/cloudflare',
    signatureValid: Boolean(secret),
  });

  return jsonResponse({ ok: true });
}
