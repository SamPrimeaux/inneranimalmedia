/**
 * Resend notification + email_logs (from worker.js notifySam).
 * @param {any} env
 * @param {{ subject?: string, body?: string, category?: string, to?: string }} opts
 * @param {ExecutionContext | null} executionCtx
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
  let subject = `${prefix}${subjectRaw}`.slice(0, 400);
  const repoPlaceholder =
    (typeof env.GITHUB_REPO === 'string' && env.GITHUB_REPO.trim()) || 'SamPrimeaux/inneranimalmedia';
  const branchPlaceholder =
    (typeof env.GIT_BRANCH === 'string' && env.GIT_BRANCH.trim()) || 'main';
  subject = subject
    .replace(/\{repo\}/g, repoPlaceholder)
    .replace(/\{branch\}/g, branchPlaceholder)
    .slice(0, 400);

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
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
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
           VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        )
          .bind(
            crypto.randomUUID(),
            toAddr,
            fromAddr,
            subject,
            res.ok ? 'sent' : 'failed',
            json.id ?? null,
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
