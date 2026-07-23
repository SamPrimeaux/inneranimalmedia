/**
 * Core Layer: Notifications — platform email via sendPlatformEmail.
 */

import { sendPlatformEmail } from '../lib/email.js';

/**
 * Platform notification + email_logs. Optional opts.to overrides default recipient.
 * Use executionCtx.waitUntil when provided so the fetch path never blocks.
 *
 * Phone-loop: pass conversationId / inReplyTo; prefer opts.to = sam@inneranimalmedia.com.
 */
export async function notifySam(env, opts, executionCtx) {
  const subjectRaw = String(opts.subject || '')
    .replace(/[\r\n\t]/g, ' ')
    .trim();
  const bodyRaw = String(opts.body || '').trim();
  const category = String(opts.category || 'notice').trim();
  const toAddr = opts.to || env.RESEND_TO || '';

  return sendPlatformEmail(
    env,
    {
      subject: subjectRaw,
      text: bodyRaw,
      html: opts.html,
      to: toAddr,
      category,
      conversationId: opts.conversationId,
      inReplyTo: opts.inReplyTo,
      from: opts.from,
      noAgentSamPrefix: opts.noAgentSamPrefix,
    },
    executionCtx,
  );
}
