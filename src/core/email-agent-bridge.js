/**
 * Phone-email IDE bridge: inbound reply → Agent Sam turn → dual outbound (email + push).
 *
 * Sender allowlist is D1-only: active superadmins in tenant_sam_primeaux, matching
 * auth_users.email OR auth_user_emails aliases (iam_alias etc.). No hardcoded email lists.
 */

import {
  PLATFORM_D1_AUTH_USER_ID,
  PLATFORM_D1_WORKSPACE_ID,
  PLATFORM_OPERATOR_EMAIL_PRIMARY,
} from './platform-identity-constants.js';
import { parseEmailReplyThread } from './email-reply-thread.js';
import { sendPlatformEmail } from '../lib/email.js';
import { scheduleChatSessionTitleInsert } from './agentsam-chat-sessions.js';

export const PHONE_LOOP_INBOX = 'sam@inneranimalmedia.com';
export const PHONE_LOOP_USER_ID = PLATFORM_D1_AUTH_USER_ID;
export const PHONE_LOOP_WORKSPACE_ID = PLATFORM_D1_WORKSPACE_ID;
export const PHONE_LOOP_TENANT_ID = 'tenant_sam_primeaux';

/**
 * @param {string} email
 */
export function normalizePhoneLoopSenderEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase()
    .replace(/^.*<([^>]+)>.*$/, '$1')
    .trim();
}

/**
 * D1 allowlist: primary auth_users.email OR auth_user_emails alias → active superadmin.
 * Must join aliases via EXISTS — auth_users.email alone misses iam_alias rows.
 *
 * @param {any} env
 * @param {string} email
 * @returns {Promise<boolean>}
 */
export async function isPhoneLoopAllowlistedSender(env, email) {
  const normalized = normalizePhoneLoopSenderEmail(email);
  if (!normalized || !normalized.includes('@') || !env?.DB) return false;

  try {
    const row = await env.DB.prepare(
      `SELECT 1 AS ok
         FROM auth_users au
        WHERE au.tenant_id = ?
          AND COALESCE(au.is_superadmin, 0) = 1
          AND lower(trim(COALESCE(au.status, ''))) = 'active'
          AND (
            lower(trim(au.email)) = ?
            OR EXISTS (
              SELECT 1
                FROM auth_user_emails aue
               WHERE aue.auth_user_id = au.id
                 AND lower(trim(aue.email)) = ?
                 AND COALESCE(aue.is_login_enabled, 1) = 1
            )
          )
        LIMIT 1`,
    )
      .bind(PHONE_LOOP_TENANT_ID, normalized, normalized)
      .first();
    return !!row?.ok;
  } catch (e) {
    console.warn('[isPhoneLoopAllowlistedSender]', e?.message ?? e);
    return false;
  }
}

/**
 * Resolve a deployments.id to attach phone-loop email receipts to the deploy trail.
 * @param {any} env
 * @param {string} [preferredId]
 */
export async function resolvePhoneLoopDeploymentId(env, preferredId) {
  const preferred = preferredId != null ? String(preferredId).trim() : '';
  if (preferred) return preferred;
  if (!env?.DB) return `phone_loop_${Date.now()}`;
  const row = await env.DB.prepare(
    `SELECT id FROM deployments
     WHERE lower(COALESCE(status, '')) IN ('success', 'succeeded', 'ok', 'complete', 'completed')
     ORDER BY datetime(COALESCE(created_at, updated_at)) DESC
     LIMIT 1`,
  )
    .first()
    .catch(() => null);
  if (row?.id) return String(row.id);
  return `phone_loop_${Date.now()}`;
}

/**
 * Append-only email receipt on deployment_notifications (deploy trail + phone IDE loop).
 * status='sent' requires a real Resend message id — never optimistic.
 * @param {any} env
 * @param {{
 *   deploymentId: string,
 *   recipient: string,
 *   subject: string,
 *   message?: string|null,
 *   status: 'pending'|'sent'|'failed'|'skipped',
 *   errorMessage?: string|null,
 *   notificationType?: string,
 *   resendMessageId?: string|null,
 * }} row
 */
export async function recordPhoneLoopDeploymentNotification(env, row) {
  if (!env?.DB) return { ok: false, reason: 'no_db' };
  const id = `dn_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const deploymentId = String(row.deploymentId || '').trim();
  const recipient = String(row.recipient || '').trim();
  const subject = String(row.subject || '').trim().slice(0, 400);
  const message = row.message != null ? String(row.message).slice(0, 8000) : null;
  const resendMessageId =
    row.resendMessageId != null && String(row.resendMessageId).trim()
      ? String(row.resendMessageId).trim()
      : null;
  let status = ['pending', 'sent', 'failed', 'skipped'].includes(String(row.status))
    ? String(row.status)
    : 'pending';
  // Honesty gate: never claim sent without a provider message id.
  if (status === 'sent' && !resendMessageId) {
    status = 'failed';
  }
  const notificationType = String(row.notificationType || 'phone_loop_email').slice(0, 64);
  let errorMessage =
    row.errorMessage != null ? String(row.errorMessage).slice(0, 2000) : null;
  if (status === 'failed' && !errorMessage && !resendMessageId) {
    errorMessage = 'missing_resend_message_id';
  }
  if (!deploymentId || !recipient || !subject) {
    return { ok: false, reason: 'missing_fields' };
  }
  try {
    await env.DB.prepare(
      `INSERT INTO deployment_notifications (
         id, deployment_id, notification_type, recipient, subject, message,
         status, sent_at, error_message, resend_message_id, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'sent' THEN datetime('now') ELSE NULL END, ?, ?, datetime('now'), datetime('now'))`,
    )
      .bind(
        id,
        deploymentId,
        notificationType,
        recipient,
        subject,
        message,
        status,
        status,
        errorMessage,
        resendMessageId,
      )
      .run();
    return { ok: true, id, deploymentId, status, resendMessageId };
  } catch (e) {
    // Column may not exist until migration 1018 — fall back without resend_message_id.
    const msg = String(e?.message || e);
    if (/resend_message_id/i.test(msg)) {
      try {
        await env.DB.prepare(
          `INSERT INTO deployment_notifications (
             id, deployment_id, notification_type, recipient, subject, message,
             status, sent_at, error_message, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'sent' THEN datetime('now') ELSE NULL END, ?, datetime('now'), datetime('now'))`,
        )
          .bind(
            id,
            deploymentId,
            notificationType,
            recipient,
            subject,
            message,
            status,
            status,
            errorMessage,
          )
          .run();
        return { ok: true, id, deploymentId, status, resendMessageId, legacy: true };
      } catch (e2) {
        console.warn('[recordPhoneLoopDeploymentNotification]', e2?.message ?? e2);
        return { ok: false, reason: e2?.message || String(e2) };
      }
    }
    console.warn('[recordPhoneLoopDeploymentNotification]', msg);
    return { ok: false, reason: msg };
  }
}

/**
 * Dual outbound: email + push in the same waitUntil batch (no sequencing dependency).
 * Also writes deployment_notifications so the email trail is queryable next to deploy rows.
 *
 * @param {any} env
 * @param {any} ctx
 * @param {{
 *   conversationId: string,
 *   inReplyTo?: string|null,
 *   subject: string,
 *   body: string,
 *   pushTitle: string,
 *   pushBody: string,
 *   deploymentId?: string|null,
 * }} opts
 */
export async function sendPhoneLoopCompletion(env, ctx, opts) {
  const conversationId = String(opts.conversationId || '').trim();
  if (!conversationId) {
    return { ok: false, error: 'conversation_id_required' };
  }

  const subject = String(opts.subject || '[Agent Sam] update').trim();
  const body = String(opts.body || '').trim();
  const pushTitle = String(opts.pushTitle || subject).trim().slice(0, 80);
  const pushBody = String(opts.pushBody || body.slice(0, 140)).trim().slice(0, 180);
  const inReplyTo = opts.inReplyTo != null ? String(opts.inReplyTo).trim() : '';

  const deepLink = `/dashboard/agent/${encodeURIComponent(conversationId)}`;

  const run = async () => {
    const deploymentId = await resolvePhoneLoopDeploymentId(env, opts.deploymentId);

    const emailResult = await sendPlatformEmail(env, {
      to: PHONE_LOOP_INBOX,
      subject,
      text: body,
      category: 'phone_loop',
      conversationId,
      inReplyTo: inReplyTo || undefined,
      noAgentSamPrefix: subject.startsWith('[Agent Sam]'),
    });

    const resendId =
      emailResult?.externalMessageId ||
      emailResult?.data?.id ||
      emailResult?.id ||
      null;
    const emailOk = !!(emailResult && emailResult.success === true && resendId);
    const notifyRow = await recordPhoneLoopDeploymentNotification(env, {
      deploymentId,
      recipient: PHONE_LOOP_INBOX,
      subject,
      message: [
        body.slice(0, 4000),
        '',
        `conversation_id=${conversationId}`,
        `deep_link=${deepLink}`,
        emailOk ? 'resend_ok=1' : 'resend_ok=0',
        resendId ? `resend_id=${resendId}` : '',
        emailResult?.error ? `error=${emailResult.error}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      status: emailOk ? 'sent' : 'failed',
      errorMessage: emailOk
        ? null
        : String(emailResult?.error || (!resendId ? 'missing_resend_message_id' : 'email_send_failed')),
      resendMessageId: resendId,
      notificationType: 'phone_loop_email',
    });

    let pushResult = { ok: false, reason: 'not_attempted' };
    let notifId = null;
    try {
      const { broadcastWebPushToActiveSubscriptions, insertPushNotification } = await import(
        './web-push.js'
      );
      notifId = await insertPushNotification(env, {
        recipientId: PHONE_LOOP_USER_ID,
        channel: 'push',
        subject: pushTitle,
        message: pushBody,
        entityType: 'conversation',
        entityId: conversationId,
        status: 'sent',
        data: { url: deepLink, tag: conversationId, type: 'phone_loop' },
      }).catch(() => null);

      const pushUrl = notifId
        ? `${deepLink}${deepLink.includes('?') ? '&' : '?'}notif=${encodeURIComponent(notifId)}`
        : deepLink;

      pushResult = await broadcastWebPushToActiveSubscriptions(env, {
        title: pushTitle,
        body: pushBody,
        url: pushUrl,
        tag: conversationId,
        notificationId: notifId || undefined,
        entityType: 'conversation',
        entityId: conversationId,
      });
    } catch (e) {
      pushResult = { ok: false, reason: e?.message || String(e) };
      console.warn('[sendPhoneLoopCompletion] push', e?.message ?? e);
    }

    return {
      ok: true,
      email: emailResult,
      push: pushResult,
      conversationId,
      deepLink,
      deploymentId,
      notification: notifyRow,
    };
  };

  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(run());
    return { ok: true, async: true, conversationId, deepLink };
  }
  return run();
}

/**
 * Ensure chat session exists for conversationId (no orphan mint when id already provided).
 * @param {any} env
 * @param {any} ctx
 * @param {string} conversationId
 * @param {string} [seedMessage]
 */
export async function ensurePhoneLoopChatSession(env, ctx, conversationId, seedMessage) {
  const id = String(conversationId || '').trim();
  if (!id || !env?.DB) return { ok: false, error: 'missing' };

  scheduleChatSessionTitleInsert(env, ctx || { waitUntil() {} }, {
    conversationId: id,
    tenantId: PHONE_LOOP_TENANT_ID,
    userId: PHONE_LOOP_USER_ID,
    workspaceId: PHONE_LOOP_WORKSPACE_ID,
    message: String(seedMessage || 'Phone email thread').slice(0, 500),
    modelKey: null,
  });

  return { ok: true, conversationId: id };
}

/**
 * Mint a new conversation id when inbound has no [ref:].
 */
export function mintPhoneLoopConversationId() {
  return crypto.randomUUID();
}

/**
 * Collect assistant text from an SSE agent response body.
 * @param {Response} response
 */
async function collectSseAssistantText(response) {
  if (!response?.body) {
    const t = await response.text().catch(() => '');
    return t.slice(0, 12000);
  }
  const reader = response.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split('\n');
    buf = parts.pop() || '';
    for (const line of parts) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const evt = JSON.parse(payload);
        const typ = String(evt.type || evt.event || '');
        if (typ === 'token' || typ === 'text_delta' || typ === 'content_delta') {
          text += String(evt.text ?? evt.delta ?? evt.content ?? '');
        } else if (typ === 'message' || typ === 'assistant_message') {
          text += String(evt.content ?? evt.text ?? '');
        } else if (evt.choices?.[0]?.delta?.content) {
          text += String(evt.choices[0].delta.content);
        }
      } catch {
        /* ignore non-json */
      }
    }
  }
  return text.trim().slice(0, 12000);
}

/**
 * Run one Agent Sam turn from an inbound email reply.
 *
 * @param {any} env
 * @param {any} ctx
 * @param {{
 *   conversationId?: string|null,
 *   instruction: string,
 *   fromAddress: string,
 *   inReplyTo?: string|null,
 *   subject?: string|null,
 * }} payload
 */
export async function runAgentTurnFromEmail(env, ctx, payload) {
  const instruction = String(payload.instruction || '').trim();
  if (!instruction) {
    return { ok: false, error: 'empty_instruction' };
  }
  if (!(await isPhoneLoopAllowlistedSender(env, payload.fromAddress))) {
    return { ok: false, error: 'sender_not_allowlisted' };
  }

  let conversationId = String(payload.conversationId || '').trim();
  const minted = !conversationId;
  if (!conversationId) conversationId = mintPhoneLoopConversationId();

  await ensurePhoneLoopChatSession(env, ctx, conversationId, instruction);

  const inReplyTo = payload.inReplyTo != null ? String(payload.inReplyTo).trim() : '';
  const subjectIn = payload.subject != null ? String(payload.subject) : '';

  const work = async () => {
    try {
      const { executeAgentChatSpine } = await import('../api/agent-chat-spine.js');
      const body = {
        message: instruction,
        conversationId,
        conversation_id: conversationId,
        sessionId: conversationId,
        mode: 'agent',
        trigger: 'email_reply',
        source: 'email_phone',
        stream: true,
      };
      const request = new Request('https://inneranimalmedia.com/api/agent/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          'X-AgentSam-Trigger': 'email_reply',
        },
        body: JSON.stringify(body),
      });

      const authUser = {
        id: PHONE_LOOP_USER_ID,
        email: PLATFORM_OPERATOR_EMAIL_PRIMARY,
        tenant_id: PHONE_LOOP_TENANT_ID,
        role: 'superadmin',
      };

      const response = await executeAgentChatSpine(env, request, ctx || { waitUntil() {} }, {
        body,
        message: instruction,
        requestedMode: 'agent',
        tenantId: PHONE_LOOP_TENANT_ID,
        userId: PHONE_LOOP_USER_ID,
        workspaceId: PHONE_LOOP_WORKSPACE_ID,
        sessionId: conversationId,
        authUser,
      });

      let assistantText = '';
      if (response && typeof response === 'object' && response.body) {
        assistantText = await collectSseAssistantText(response);
      }

      const outcomeBody =
        assistantText ||
        `Received your email instruction and ran an Agent Sam turn.\n\nInstruction:\n${instruction.slice(0, 2000)}`;

      await sendPhoneLoopCompletion(env, null, {
        conversationId,
        inReplyTo: inReplyTo || null,
        subject: subjectIn
          ? `[Agent Sam] Re: ${subjectIn.replace(/^re:\s*/i, '').slice(0, 80)}`
          : `[Agent Sam] Turn complete`,
        body: `${outcomeBody}\n\n---\nWhat you asked:\n${instruction.slice(0, 1500)}`,
        pushTitle: 'Agent Sam reply ready',
        pushBody: outcomeBody.replace(/\s+/g, ' ').slice(0, 140),
      });

      return { ok: true, conversationId, minted, assistantChars: assistantText.length };
    } catch (e) {
      console.error('[runAgentTurnFromEmail]', e?.message ?? e);
      try {
        await env.DB?.prepare(
          `INSERT INTO agentsam_error_log (
             id, workspace_id, tenant_id, error_code, error_message, source, context_json, resolved, created_at
           ) VALUES (?, ?, ?, 'email_reply_loop', ?, 'email_agent_bridge', ?, 0, unixepoch())`,
        )
          .bind(
            `aerr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
            PHONE_LOOP_WORKSPACE_ID,
            PHONE_LOOP_TENANT_ID,
            String(e?.message || e).slice(0, 500),
            JSON.stringify({ conversationId, from: payload.fromAddress }).slice(0, 2000),
          )
          .run();
      } catch {
        /* ignore */
      }
      await sendPhoneLoopCompletion(env, null, {
        conversationId,
        inReplyTo: inReplyTo || null,
        subject: '[Agent Sam] Turn failed',
        body: `Agent turn failed: ${e?.message || e}\n\nYour instruction was:\n${instruction.slice(0, 1500)}`,
        pushTitle: 'Agent Sam turn failed',
        pushBody: String(e?.message || e).slice(0, 140),
      }).catch(() => null);
      return { ok: false, error: e?.message || String(e), conversationId };
    }
  };

  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(work());
    return { ok: true, accepted: true, conversationId, minted };
  }
  return work();
}

/**
 * Convenience: parse inbound payload fields then run the turn.
 */
export async function handleParsedEmailReply(env, ctx, raw) {
  const parsed = parseEmailReplyThread({
    text: raw.text,
    html: raw.html,
    subject: raw.subject,
    inReplyTo: raw.inReplyTo,
  });
  return runAgentTurnFromEmail(env, ctx, {
    conversationId: parsed.conversationId,
    instruction: parsed.instruction,
    fromAddress: raw.fromAddress,
    inReplyTo: parsed.inReplyTo || raw.inReplyTo,
    subject: raw.subject,
  });
}

export { parseEmailReplyThread };
