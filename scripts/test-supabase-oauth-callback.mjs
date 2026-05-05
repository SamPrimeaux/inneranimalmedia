#!/usr/bin/env node
/**
 * Validates expected callback query shape (no network, no secrets).
 */
const samples = [
  'https://inneranimalmedia.com/api/auth/supabase/callback?code=abc&state=uuid',
  'https://inneranimalmedia.com/auth/callback/supabase?code=abc&state=uuid',
];
for (const u of samples) {
  const x = new URL(u);
  const code = x.searchParams.get('code');
  const state = x.searchParams.get('state');
  if (!code || !state) {
    console.error('FAIL missing code/state', u);
    process.exit(1);
  }
  console.log('OK', x.pathname, { has_code: !!code, has_state: !!state });
}
console.log('All callback shape checks passed.');
