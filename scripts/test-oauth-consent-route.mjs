#!/usr/bin/env node
/**
 * Fetches consent routes; expects HTML 400 for missing authorization_id (not app 404 page).
 * Usage: TEST_BASE_URL=https://inneranimalmedia.com node scripts/test-oauth-consent-route.mjs
 */
const base = (process.env.TEST_BASE_URL || 'https://inneranimalmedia.com').replace(/\/$/, '');
const paths = [`${base}/api/auth/oauth/consent`, `${base}/oauth/consent`];

async function run() {
  for (const url of paths) {
    const res = await fetch(url, { redirect: 'manual' });
    const text = await res.text();
    const is404Page = res.status === 404 && /not found/i.test(text);
    if (is404Page) {
      console.error('FAIL: got generic 404 for', url);
      process.exit(1);
    }
    if (res.status !== 400) {
      console.error('FAIL: expected 400 for missing authorization_id', url, 'status=', res.status);
      process.exit(1);
    }
    if (text.length < 80) {
      console.error('FAIL: empty or trivial body for', url);
      process.exit(1);
    }
    console.log('OK', url, 'status=', res.status);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
