#!/usr/bin/env node
/**
 * List CloudConvert webhooks and print signing_secret for our endpoint (for Worker + .env.cloudflare).
 * Usage: ./scripts/with-cloudflare-env.sh node scripts/cloudconvert-sync-webhook-secret.mjs
 */
const apiKey = process.env.CLOUDCONVERT_API_KEY;
const targetUrl =
  process.env.CLOUDCONVERT_WEBHOOK_URL || 'https://inneranimalmedia.com/api/webhooks/cloudconvert';

if (!apiKey) {
  console.error('CLOUDCONVERT_API_KEY missing in .env.cloudflare');
  process.exit(1);
}

const res2 = await fetch('https://api.cloudconvert.com/v2/users/me/webhooks', {
  headers: { Authorization: `Bearer ${apiKey}` },
});
const data = await res2.json().catch(() => ({}));
if (!res2.ok) {
  console.error('List webhooks failed', data);
  process.exit(1);
}

const hooks = data.data || [];
const hit = hooks.find((h) => String(h.url || '').replace(/\/$/, '') === targetUrl.replace(/\/$/, ''));
if (!hit) {
  console.log('No webhook matching', targetUrl);
  console.log('Registered URLs:', hooks.map((h) => h.url).join('\n  ') || '(none)');
  process.exit(1);
}

console.log('Webhook id:', hit.id);
console.log('URL:', hit.url);
console.log('Events:', (hit.events || []).join(', '));
if (hit.signing_secret) {
  console.log('\nSigning secret (set as CLOUDCONVERT_WEBHOOK_SECRET):');
  console.log(hit.signing_secret);
  console.log('\nWorker:');
  console.log(
    `  printf '%s' '${hit.signing_secret}' | ./scripts/with-cloudflare-env.sh npx wrangler secret put CLOUDCONVERT_WEBHOOK_SECRET -c wrangler.production.toml`,
  );
  console.log('\nLocal:');
  console.log(`  printf '%s' '${hit.signing_secret}' | ./scripts/upsert-env-cloudflare-var.sh CLOUDCONVERT_WEBHOOK_SECRET`);
} else {
  console.log('signing_secret not in API response — copy from CloudConvert dashboard webhook settings');
}
