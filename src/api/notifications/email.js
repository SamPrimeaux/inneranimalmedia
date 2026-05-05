/**
 * App-level email notifications (not Supabase Auth hook traffic).
 * Uses Resend via src/services/resend.js.
 */
import { sendResendEmail } from '../../services/resend.js';
import { verifyInternalApiSecret, jsonResponse } from '../../core/auth.js';

/**
 * POST /api/notifications/email  (internal)
 * Body: { to, subject, html?, text?, tag? }
 */
export async function handleAppNotificationEmail(request, env) {
  if (!verifyInternalApiSecret(request, env)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  const body = await request.json().catch(() => ({}));
  const to = body.to;
  const subject = body.subject;
  if (!to || !subject) return jsonResponse({ error: 'to and subject required' }, 400);
  const out = await sendResendEmail(env, {
    to,
    subject,
    html: body.html,
    text: body.text,
    tags: body.tag ? [{ name: 'app', value: String(body.tag) }] : undefined,
  });
  if (out.error) return jsonResponse({ ok: false, error: out.error }, 502);
  return jsonResponse({ ok: true, id: out.id });
}
