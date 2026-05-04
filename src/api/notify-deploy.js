/**
 * POST /api/notify/deploy-complete
 * Internal: sends Resend emails with Meet link after production deploy.
 * Auth: INTERNAL_API_SECRET (X-Internal-Secret or Bearer).
 */
import { verifyInternalApiSecret, jsonResponse } from '../core/auth.js';

const MEET_URL = 'https://inneranimalmedia.com/dashboard/meet?room=iam-sam-connor-live';

function deployEmailHtml(meetUrl) {
  return `
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0f172a;color:#f8fafc;padding:28px 24px 36px;max-width:560px;margin:0 auto;">
  <div style="font-size:22px;font-weight:700;color:#0d9488;letter-spacing:-0.02em;margin-bottom:6px;">Inner Animal Media</div>
  <div style="font-size:13px;color:#94a3b8;margin-bottom:20px;">Deploy Notification · Live session</div>
  <p style="margin:0 0 12px;font-size:16px;">Production is live.</p>
  <p style="color:#94a3b8;font-size:13px;margin:0 0 22px;">The latest build deployed successfully. Join the live session now.</p>
  <a href="${meetUrl}" style="display:inline-block;padding:12px 28px;background:#0d9488;color:#f8fafc;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;">Join Live Session →</a>
  <p style="margin:18px 0 0;color:#64748b;font-size:11px;word-break:break-all;">${meetUrl}</p>
  <div style="margin-top:28px;padding-top:18px;border-top:1px solid #1e293b;">
    <img src="https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/238de9d1-a470-4fe5-5424-9182f4bc0500/medium" width="100" style="opacity:0.75;" alt="" />
  </div>
  <p style="font-size:12px;color:#64748b;margin:20px 0 0;">Inner Animal Media · inneranimalmedia.com · Auto-generated deploy notification</p>
</div>`;
}

async function sendResendEmail(env, { to, subject, html }) {
  const key = env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY not configured');
  const from = env.EMAIL_FROM || 'Inner Animal Media <support@inneranimalmedia.com>';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Resend ${res.status}: ${t.slice(0, 200)}`);
  }
}

function parseNotifyRecipients(env) {
  const raw = String(env.DEPLOY_NOTIFY_EMAILS || '').trim();
  if (!raw) return [];
  return raw
    .split(/[,\n]/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function handleNotifyDeployComplete(request, env, ctx) {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }
  if (!verifyInternalApiSecret(request, env)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const meetUrl = MEET_URL;
  const html = deployEmailHtml(meetUrl);
  const recipients = parseNotifyRecipients(env);

  const work = (async () => {
    if (recipients.length === 0) return;
    await Promise.all(recipients.map((to) =>
      sendResendEmail(env, {
        to,
        subject: '🚀 Production deployed — join live session',
        html,
      })
    ));
  })();

  if (ctx?.waitUntil) ctx.waitUntil(work.catch((e) => console.warn('[notify-deploy-complete]', e?.message ?? e)));
  else await work.catch((e) => console.warn('[notify-deploy-complete]', e?.message ?? e));

  return jsonResponse({ ok: true, queued: true, meet_url: meetUrl });
}
