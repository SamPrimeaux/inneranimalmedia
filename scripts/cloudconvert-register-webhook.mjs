#!/usr/bin/env node
/**
 * Idempotent: register CloudConvert webhook for IAM production ingest.
 * Usage: ./scripts/with-cloudflare-env.sh node scripts/cloudconvert-register-webhook.mjs
 *
 * Env:
 *   CLOUDCONVERT_API_KEY (required)
 *   CLOUDCONVERT_WEBHOOK_URL (default: https://inneranimalmedia.com/api/webhooks/cloudconvert)
 *   CLOUDCONVERT_WEBHOOK_EVENTS (optional comma list; default job.created,job.finished,job.failed)
 */
const apiKey = process.env.CLOUDCONVERT_API_KEY;
const targetUrl = (
  process.env.CLOUDCONVERT_WEBHOOK_URL || 'https://inneranimalmedia.com/api/webhooks/cloudconvert'
).replace(/\/$/, '');
const events = (process.env.CLOUDCONVERT_WEBHOOK_EVENTS || 'job.created,job.finished,job.failed')
  .split(',')
  .map((e) => e.trim())
  .filter(Boolean);

if (!apiKey) {
  console.error('CLOUDCONVERT_API_KEY missing — load via with-cloudflare-env.sh');
  process.exit(1);
}

const CC = 'https://api.cloudconvert.com/v2';

async function cc(path, opts = {}) {
  const res = await fetch(`${CC}${path}`, {
    method: opts.method || 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data?.message ||
      data?.error?.message ||
      (Array.isArray(data?.errors) ? data.errors[0]?.message : null) ||
      `HTTP ${res.status}`;
    throw new Error(String(msg));
  }
  return data.data ?? data;
}

function normalizeUrl(u) {
  return String(u || '').replace(/\/$/, '');
}

function printSecretInstructions(hit) {
  console.log('Webhook id:', hit.id);
  console.log('URL:', hit.url);
  console.log('Events:', (hit.events || []).join(', '));
  if (hit.signing_secret) {
    console.log('\nSigning secret (CLOUDCONVERT_WEBHOOK_SECRET):');
    console.log(hit.signing_secret);
    console.log('\nWorker:');
    console.log(
      `  printf '%s' '${hit.signing_secret}' | ./scripts/with-cloudflare-env.sh npx wrangler secret put CLOUDCONVERT_WEBHOOK_SECRET -c wrangler.production.toml`,
    );
    console.log('\nLocal .env.cloudflare:');
    console.log(
      `  printf '%s' '${hit.signing_secret}' | ./scripts/upsert-env-cloudflare-var.sh CLOUDCONVERT_WEBHOOK_SECRET`,
    );
  } else {
    console.log('\nNo signing_secret in API response — run:');
    console.log('  ./scripts/with-cloudflare-env.sh node scripts/cloudconvert-sync-webhook-secret.mjs');
  }
}

console.log('→ List webhooks…');
const existing = await cc('/users/me/webhooks');
const list = Array.isArray(existing) ? existing : [];
const hit = list.find((h) => normalizeUrl(h.url) === targetUrl);

if (hit) {
  console.log('✓ Webhook already registered for', targetUrl);
  printSecretInstructions(hit);
  process.exit(0);
}

console.log('→ Create webhook:', targetUrl);
console.log('  events:', events.join(', '));

const created = await cc('/webhooks', {
  method: 'POST',
  body: { url: targetUrl, events },
});

console.log('✓ Webhook created');
printSecretInstructions(created);

console.log('\nVerify ingest:');
console.log('  ./scripts/with-cloudflare-env.sh node scripts/cloudconvert-smoke-capture.mjs');
