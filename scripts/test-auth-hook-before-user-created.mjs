#!/usr/bin/env node
const sample = {
  record: {
    email: process.env.TEST_EMAIL || 'newuser@example.com',
    user_metadata: {},
  },
};
console.log('Sample before-user-created payload:\n', JSON.stringify(sample, null, 2));

const base = process.env.TEST_BASE_URL;
const secret = process.env.AUTH_HOOK_SECRET;
if (base && secret) {
  const res = await fetch(`${base.replace(/\/$/, '')}/api/auth-hooks/before-user-created`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(sample),
  });
  const j = await res.json().catch(() => ({}));
  console.log('Live response', res.status, j);
} else {
  console.log('Set TEST_BASE_URL and AUTH_HOOK_SECRET for live policy check.');
}
