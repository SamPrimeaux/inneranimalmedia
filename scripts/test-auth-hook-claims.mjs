#!/usr/bin/env node
const sample = {
  user: {
    email: process.env.TEST_EMAIL || 'founder@inneranimalmedia.com',
    id: '00000000-0000-0000-0000-000000000000',
  },
};
console.log('Sample custom-access-token payload:\n', JSON.stringify(sample, null, 2));

const base = process.env.TEST_BASE_URL;
const secret = process.env.AUTH_HOOK_SECRET;
if (base && secret) {
  const res = await fetch(`${base.replace(/\/$/, '')}/api/auth-hooks/custom-access-token`, {
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
  console.log('Set TEST_BASE_URL and AUTH_HOOK_SECRET for live claims merge.');
}
