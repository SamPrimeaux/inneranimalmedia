/**
 * Core Layer: Notifications
 * Handles system alerts and email communication via Resend.
 * Deconstructed from legacy worker.js.
 */

/**
 * Resend notification + email_logs. Optional opts.to overrides default recipient.
 * Use executionCtx.waitUntil when provided so the fetch path never blocks.
 */
export async function notifySam(env, opts, executionCtx) {
  const subjectRaw = String(opts.subject || '')
    .replace(/[\r\n\t]/g, ' ')
    .trim();
  const bodyRaw = String(opts.body || '').trim();
  const category = String(opts.category || 'notice').trim();
  const toAddr = opts.to || env.RESEND_TO || '';
  const fromAddr = env.RESEND_FROM || 'support@inneranimalmedia.com';
  const prefix = subjectRaw.startsWith('[Agent Sam]') ? '' : '[Agent Sam] ';
  const subject = `${prefix}${subjectRaw}`.slice(0, 400);

  const run = async () => {
    if (!env.RESEND_API_KEY) {
      console.warn('[notifySam] RESEND_API_KEY not set', category);
      return;
    }
    if (!toAddr) {
      console.warn('[notifySam] RESEND_TO not set', category);
      return;
    }
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${env.RESEND_API_KEY}`, 
          'Content-Type': 'application/json' 
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
        )
        .bind(
          crypto.randomUUID(),
          toAddr,
          fromAddr,
          subject,
          res.ok ? 'sent' : 'failed',
          json.id ?? null
        )
        .run()
        .catch((e) => console.warn('[notifySam] email_logs', e?.message ?? e));
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
