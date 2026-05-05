#!/usr/bin/env node
/**
 * Dry-run payload for Send Email hook; optional live POST if AUTH_HOOK_SECRET + TEST_BASE_URL set.
 */
const dry = {
  user: { email: process.env.TEST_EMAIL || 'user@example.com' },
  email_data: {
    subject: 'Dry run — confirm email',
    confirmation_url: 'https://inneranimalmedia.com/auth/login?dry_run=1',
  },
};
console.log('Dry-run JSON:\n', JSON.stringify(dry, null, 2));

const base = process.env.TEST_BASE_URL;
const secret = process.env.AUTH_HOOK_SECRET;
if (base && secret) {
  const res = await fetch(`${base.replace(/\/$/, '')}/api/auth-hooks/send-email`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(dry),
  });
  const j = await res.json().catch(() => ({}));
  console.log('Live response', res.status, j);
} else {
  console.log('Set TEST_BASE_URL and AUTH_HOOK_SECRET to exercise live send.');
}
