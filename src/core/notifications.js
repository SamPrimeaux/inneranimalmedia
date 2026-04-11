/**
 * Core Layer: Notifications
 * Handles system alerts via Resend email and BlueBubbles iMessage.
 * Deconstructed from legacy worker.js.
 */

// ─── Resend Email ─────────────────────────────────────────────────────────────

/**
 * Send an email notification via Resend and log to email_logs.
 * opts.to overrides default recipient.
 * Pass executionCtx to avoid blocking the request path.
 */
export async function notifySam(env, opts, executionCtx) {
  const subjectRaw = String(opts.subject || '')
    .replace(/[\r\n\t]/g, ' ')
    .trim();
  const bodyRaw = String(opts.body || '').trim();
  const category = String(opts.category || 'notice').trim();
  const toAddr = opts.to || env.RESEND_TO || 'sam@inneranimalmedia.com';
  const fromAddr = env.RESEND_FROM || 'agent@inneranimalmedia.com';
  const prefix = subjectRaw.startsWith('[Agent Sam]') ? '' : '[Agent Sam] ';
  const subject = `${prefix}${subjectRaw}`.slice(0, 400);

  const run = async () => {
    if (!env.RESEND_API_KEY) {
      console.warn('[notifySam] RESEND_API_KEY not set', category);
      return;
    }
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromAddr,
          to: [toAddr],
          subject,
          text: bodyRaw,
        }),
      });
      const json = await res.json().catch(() => ({}));

      if (env.DB) {
        await env.DB.prepare(
          `INSERT INTO email_logs (id, to_email, from_email, subject, status, resend_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
        ).bind(
          crypto.randomUUID(),
          toAddr,
          fromAddr,
          subject,
          res.ok ? 'sent' : 'failed',
          json.id ?? null
        ).run().catch((e) => console.warn('[notifySam] email_logs', e?.message ?? e));
      }

      if (!res.ok) console.warn('[notifySam] Resend', res.status, JSON.stringify(json).slice(0, 400));
    } catch (e) {
      console.warn('[notifySam]', e?.message ?? e);
    }
  };

  if (executionCtx && typeof executionCtx.waitUntil === 'function') {
    executionCtx.waitUntil(run());
  } else {
    await run();
  }
}

// ─── BlueBubbles iMessage ─────────────────────────────────────────────────────

/**
 * Send an iMessage via BlueBubbles self-hosted server.
 * opts.chatGuid — required, e.g. "iMessage;-;+15551234567" or a group GUID
 * opts.message  — required, message text
 * opts.subject  — optional iMessage subject line
 * Pass executionCtx to avoid blocking the request path.
 */
export async function notifySamIMessage(env, opts, executionCtx) {
  const run = async () => {
    const bbUrl = (env.BLUEBUBBLES_URL || '').replace(/\/$/, '');
    const bbPassword = env.BLUEBUBBLES_PASSWORD || '';

    if (!bbUrl || !bbPassword) {
      console.warn('[notifySamIMessage] BLUEBUBBLES_URL or BLUEBUBBLES_PASSWORD not set');
      return;
    }

    const chatGuid = String(opts.chatGuid || '').trim();
    const message = String(opts.message || '').trim();

    if (!chatGuid || !message) {
      console.warn('[notifySamIMessage] chatGuid and message are required');
      return;
    }

    const tempGuid = `temp-${crypto.randomUUID()}`;

    try {
      const res = await fetch(
        `${bbUrl}/api/v1/message/text?password=${encodeURIComponent(bbPassword)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chatGuid,
            tempGuid,
            message,
            ...(opts.subject ? { subject: opts.subject } : {}),
          }),
        }
      );

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        console.warn('[notifySamIMessage] BlueBubbles error', res.status, JSON.stringify(json).slice(0, 400));
      }
    } catch (e) {
      console.warn('[notifySamIMessage]', e?.message ?? e);
    }
  };

  if (executionCtx && typeof executionCtx.waitUntil === 'function') {
    executionCtx.waitUntil(run());
  } else {
    await run();
  }
}

// ─── Unified Notify ───────────────────────────────────────────────────────────

/**
 * Send both email and iMessage in parallel.
 * opts.email   — passed to notifySam (subject, body, to, category)
 * opts.imessage — passed to notifySamIMessage (chatGuid, message, subject)
 * Either channel is skipped if its opts are absent.
 */
export async function notifyAll(env, opts, executionCtx) {
  const tasks = [];

  if (opts.email) {
    tasks.push(notifySam(env, opts.email, executionCtx));
  }

  if (opts.imessage) {
    tasks.push(notifySamIMessage(env, opts.imessage, executionCtx));
  }

  if (tasks.length) await Promise.allSettled(tasks);
}
