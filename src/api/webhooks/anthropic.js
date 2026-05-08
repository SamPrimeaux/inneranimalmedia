/**
 * Anthropic Managed Agents inbound webhooks — signature verification + D1 audit row.
 * @see https://platform.claude.com/docs/en/managed-agents/webhooks
 */
import { jsonResponse } from '../../core/auth.js';
import { getVaultSecrets, secretFromVault } from '../../core/vault.js';
import { verifyAnthropicWebhookSignature } from '../../core/anthropic-webhook-verify.js';

/**
 * @param {Request} request
 * @param {any} env
 * @param {ExecutionContext} ctx
 */
export async function handleAnthropicWebhook(request, env, ctx) {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  let signingSecret = env.ANTHROPIC_WEBHOOK_SIGNING_KEY;
  if (!signingSecret && env.DB && env.VAULT_KEY) {
    try {
      const vault = await getVaultSecrets(env);
      signingSecret = secretFromVault(vault, env, 'ANTHROPIC_WEBHOOK_SIGNING_KEY');
    } catch {
      /* vault unavailable */
    }
  }
  if (!signingSecret || !String(signingSecret).trim()) {
    return jsonResponse({ error: 'Anthropic webhook signing secret not configured' }, 503);
  }

  const rawBody = await request.text();
  const sig =
    request.headers.get('x-webhook-signature') ??
    request.headers.get('X-Webhook-Signature') ??
    '';

  const ok = await verifyAnthropicWebhookSignature(rawBody, sig, String(signingSecret).trim(), {
    toleranceSec: 300,
  });
  if (!ok) {
    return jsonResponse({ error: 'invalid signature' }, 401);
  }

  /** @type {Record<string, unknown>} */
  let event = {};
  try {
    event = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return jsonResponse({ error: 'invalid JSON' }, 400);
  }

  const data = /** @type {Record<string, unknown> | undefined} */ (event.data);
  const eventType =
    (typeof data?.type === 'string' && data.type) ||
    (typeof event.type === 'string' && event.type) ||
    'unknown';
  const resourceId =
    (typeof data?.id === 'string' && data.id) ||
    (typeof event.id === 'string' && event.id) ||
    null;
  const deliveryEventId = typeof event.id === 'string' ? event.id : null;

  const tenantId =
    (typeof env?.ANTHROPIC_WEBHOOK_TENANT_ID === 'string' && env.ANTHROPIC_WEBHOOK_TENANT_ID.trim()) ||
    (typeof env?.TENANT_ID === 'string' && env.TENANT_ID.trim()) ||
    'system';

  if (env?.DB && ctx?.waitUntil) {
    ctx.waitUntil(
      (async () => {
        const eventRowId = crypto.randomUUID();
        try {
          await env.DB.prepare(
            `INSERT INTO agentsam_webhook_events (
              id, tenant_id, provider, event_type, event_id,
              payload_json, status, received_at
            ) VALUES (
              ?, ?, 'anthropic', ?, ?,
              ?, 'received', datetime('now')
            )`,
          )
            .bind(eventRowId, tenantId, eventType, deliveryEventId || resourceId, rawBody)
            .run();
          await env.DB.prepare(`UPDATE agentsam_webhook_events SET status='processed' WHERE id=?`)
            .bind(eventRowId)
            .run();
        } catch (e) {
          console.warn('[anthropic webhook] agentsam_webhook_events', e?.message ?? e);
        }
      })(),
    );
  }

  return new Response('', { status: 200 });
}
