/**
 * Shared Resend client for transactional and app emails.
 * Never log full API keys or raw provider responses with PII.
 */

export function resendFromAddress(env) {
  return (
    (env.RESEND_FROM && String(env.RESEND_FROM).trim()) ||
    (env.RESEND_AUTH_FROM && String(env.RESEND_AUTH_FROM).trim()) ||
    'InnerAnimalMedia <auth@inneranimalmedia.com>'
  );
}

/**
 * @returns {Promise<{ id?: string, error?: string }>}
 */
export async function sendResendEmail(env, { to, subject, html, text, tags }) {
  const key = env.RESEND_API_KEY && String(env.RESEND_API_KEY).trim();
  if (!key) return { error: 'RESEND_API_KEY not configured' };
  const body = {
    from: resendFromAddress(env),
    to: Array.isArray(to) ? to : [to],
    subject: String(subject || '').slice(0, 998),
  };
  if (html) body.html = html;
  if (text) body.text = text;
  if (tags && typeof tags === 'object') body.tags = tags;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { error: data?.message || `resend_${res.status}` };
  }
  return { id: data?.id || null };
}
