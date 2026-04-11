/**
 * API: Integrations — External Webhook Receiver
 * Receives inbound events from BlueBubbles (iMessage) and Resend (email).
 * Matches events to active hooks in agentsam_hook and triggers agent reasoning.
 *
 * Routes:
 *   POST /api/integrations/bluebubbles/webhook
 *   POST /api/integrations/resend/webhook
 *   POST /api/webhooks/resend
 *   POST /api/email/inbound
 */

import { jsonResponse } from '../core/responses.js';

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function handleIntegrationsRequest(request, env, ctx) {
  const url    = new URL(request.url);
  const path   = url.pathname.toLowerCase().replace(/\/$/, '');
  const method = request.method.toUpperCase();

  if (method !== 'POST') return null;

  // BlueBubbles
  if (path === '/api/integrations/bluebubbles/webhook') {
    return handleBlueBubblesWebhook(request, env, ctx);
  }

  // Resend — general + inbound
  if (
    path === '/api/integrations/resend/webhook' ||
    path === '/api/webhooks/resend' ||
    path === '/api/email/inbound'
  ) {
    const secretHeader = request.headers.get('X-Resend-Webhook-Secret')
      || request.headers.get('X-Resend-Inbound-Secret')
      || url.searchParams.get('secret');

    const expectedSecret = path === '/api/email/inbound'
      ? env.RESEND_INBOUND_WEBHOOK_SECRET
      : env.RESEND_WEBHOOK_SECRET;

    if (expectedSecret && secretHeader !== expectedSecret) {
      return jsonResponse({ error: 'Invalid webhook secret' }, 403);
    }

    return handleResendWebhook(request, env, ctx);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Agent trigger — fires async agent reasoning after a message is stored
// ---------------------------------------------------------------------------

async function triggerAgentReasoning(conversationId, provider, env) {
  const origin = (env.IAM_ORIGIN || 'https://inneranimalmedia.com').replace(/\/$/, '');
  try {
    await fetch(`${origin}/api/agent/continue`, {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'X-Internal-Secret': env.INTERNAL_API_SECRET || '',
      },
      body: JSON.stringify({ conversation_id: conversationId, provider }),
    });
  } catch (err) {
    console.error('[triggerAgentReasoning] failed:', err.message);
  }
}

// ---------------------------------------------------------------------------
// BlueBubbles
// ---------------------------------------------------------------------------

async function handleBlueBubblesWebhook(request, env, ctx) {
  // Verify shared secret if configured
  // BlueBubbles supports a configurable secret in the webhook URL or header.
  // Set BLUEBUBBLES_WEBHOOK_SECRET in env and match against X-Bluebubbles-Secret header.
  const bbSecret = env.BLUEBUBBLES_WEBHOOK_SECRET;
  if (bbSecret) {
    const provided = request.headers.get('X-Bluebubbles-Secret')
      || new URL(request.url).searchParams.get('secret');
    if (provided !== bbSecret) {
      return jsonResponse({ error: 'Invalid webhook secret' }, 403);
    }
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  if (body.type !== 'new-message') {
    return jsonResponse({ status: 'ignored', type: body.type || 'unknown' });
  }

  const msg      = body.data || {};
  const text     = msg.text || '';
  const sender   = msg.handle?.address || 'unknown';
  const chatGuid = msg.chatGuid || '';

  if (!text || !chatGuid) {
    return jsonResponse({ error: 'Missing text or chatGuid' }, 400);
  }

  // Look up active hook for this chat
  const hook = await env.DB.prepare(
    `SELECT * FROM agentsam_hook
     WHERE provider = 'imessage'
       AND external_id = ?
       AND trigger = 'imessage_reply'
       AND is_active = 1
     LIMIT 1`
  ).bind(chatGuid).first().catch(() => null);

  if (hook) {
    const messageId = crypto.randomUUID();
    const now       = Math.floor(Date.now() / 1000);

    await env.DB.prepare(
      `INSERT INTO agent_messages
         (id, conversation_id, role, content, provider, created_at)
       VALUES (?, ?, 'user', ?, 'imessage', ?)`
    ).bind(messageId, hook.target_id, text, now).run();

    // Fire agent reasoning asynchronously — does not block the webhook response
    ctx.waitUntil(triggerAgentReasoning(hook.target_id, 'imessage', env));
  }

  return jsonResponse({
    status:       'received',
    message_id:   msg.guid || null,
    source:       'bluebubbles',
    hook_matched: !!hook,
  });
}

// ---------------------------------------------------------------------------
// Resend
// ---------------------------------------------------------------------------

async function handleResendWebhook(request, env, ctx) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  // Resend inbound email shape varies — normalize both formats
  const data        = body.data || body;
  const senderEmail = data.from?.email || data.from || '';
  const subject     = data.subject || '(no subject)';
  const text        = data.text || data.plain || '';
  const html        = data.html || '';
  const content     = text || html || '(no content)';

  if (!senderEmail) {
    return jsonResponse({ error: 'Missing sender email' }, 400);
  }

  // Look up active hook for this sender
  const hook = await env.DB.prepare(
    `SELECT * FROM agentsam_hook
     WHERE provider = 'resend'
       AND external_id = ?
       AND trigger = 'email_reply'
       AND is_active = 1
     LIMIT 1`
  ).bind(senderEmail).first().catch(() => null);

  if (hook) {
    const messageId = crypto.randomUUID();
    const now       = Math.floor(Date.now() / 1000);

    await env.DB.prepare(
      `INSERT INTO agent_messages
         (id, conversation_id, role, content, provider, created_at)
       VALUES (?, ?, 'user', ?, 'resend', ?)`
    ).bind(
      messageId,
      hook.target_id,
      `[Email Reply] Subject: ${subject}\n\n${content}`,
      now
    ).run();

    ctx.waitUntil(triggerAgentReasoning(hook.target_id, 'resend', env));
  }

  return jsonResponse({
    status:       'received',
    source:       'resend',
    hook_matched: !!hook,
  });
}
