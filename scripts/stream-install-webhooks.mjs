#!/usr/bin/env node
/**
 * Register Cloudflare Stream VOD webhook + print live notification setup.
 *
 * Usage:
 *   ./scripts/with-cloudflare-env.sh node scripts/stream-install-webhooks.mjs
 *   ./scripts/with-cloudflare-env.sh node scripts/stream-install-webhooks.mjs --vod-url https://inneranimalmedia.com/api/webhooks/stream/vod
 *
 * After run: set Worker secret CLOUDFLARE_STREAM_WEBHOOK_SECRET from printed secret.
 * Live Input: Cloudflare dashboard → Notifications → Stream Live Input →
 *   destination URL https://inneranimalmedia.com/api/webhooks/stream/live
 *   secret → CLOUDFLARE_STREAM_LIVE_WEBHOOK_SECRET
 */
import process from 'node:process';

const args = process.argv.slice(2);
const vodUrl =
  args.find((a) => a.startsWith('--vod-url='))?.slice('--vod-url='.length) ||
  'https://inneranimalmedia.com/api/webhooks/stream/vod';

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_STREAM_TOKEN || process.env.CLOUDFLARE_API_TOKEN;
if (!accountId || !token) {
  console.error('Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_STREAM_TOKEN');
  process.exit(1);
}

const res = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/webhook`,
  {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ notificationUrl: vodUrl }),
  },
);
const data = await res.json();
if (!data.success) {
  console.error('Stream VOD webhook registration failed:', JSON.stringify(data.errors || data, null, 2));
  process.exit(1);
}

console.log('✓ Stream VOD webhook registered');
console.log(JSON.stringify(data.result, null, 2));
console.log('');
console.log('Next steps:');
console.log(`  1. wrangler secret put CLOUDFLARE_STREAM_WEBHOOK_SECRET -c wrangler.production.toml`);
console.log(`     (paste secret from result above)`);
console.log('  2. Cloudflare Notifications → create generic webhook destination:');
console.log('       URL:', 'https://inneranimalmedia.com/api/webhooks/stream/live');
console.log('     Add notification: Product Stream → Live Input events');
console.log('  3. wrangler secret put CLOUDFLARE_STREAM_LIVE_WEBHOOK_SECRET -c wrangler.production.toml');
console.log('  4. Apply migration 618 if not yet applied (moviemode_live_inputs + agentsam_webhooks rows)');
