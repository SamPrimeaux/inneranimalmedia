#!/usr/bin/env node
/**
 * Smoke: POST a Standard-Webhooks-signed sample to /api/webhooks/openai.
 * Loads OPENAI_WEBHOOK_SECRET from env or .env.cloudflare (never prints it).
 *
 * Usage:
 *   node scripts/smoke-openai-webhook.mjs
 *   OPENAI_WEBHOOK_SECRET=whsec_… node scripts/smoke-openai-webhook.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { createHmac, randomBytes } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const url = process.env.OPENAI_WEBHOOK_URL || 'https://inneranimalmedia.com/api/webhooks/openai';

function loadSecret() {
  let s = (process.env.OPENAI_WEBHOOK_SECRET || '').trim();
  if (s) return s;
  const envPath = resolve(root, '.env.cloudflare');
  if (!existsSync(envPath)) return null;
  const text = readFileSync(envPath, 'utf8');
  const m = text.match(/^OPENAI_WEBHOOK_SECRET=(.*)$/m);
  if (!m) return null;
  return m[1].trim().replace(/^["']|["']$/g, '');
}

function decodeSecret(secret) {
  if (secret.startsWith('whsec_')) {
    return Buffer.from(secret.slice('whsec_'.length), 'base64');
  }
  return Buffer.from(secret, 'utf8');
}

function sign(secret, webhookId, timestamp, body) {
  const signedPayload = `${webhookId}.${timestamp}.${body}`;
  const sig = createHmac('sha256', decodeSecret(secret)).update(signedPayload).digest('base64');
  return `v1,${sig}`;
}

const secret = loadSecret();
if (!secret) {
  console.error(
    JSON.stringify({
      ok: false,
      error: 'OPENAI_WEBHOOK_SECRET missing — set in env or add to .env.cloudflare',
    }),
  );
  process.exit(2);
}

const body = JSON.stringify({
  object: 'event',
  id: `evt_smoke_${Date.now()}`,
  type: 'batch.completed',
  created_at: Math.floor(Date.now() / 1000),
  data: { id: `batch_smoke_${randomBytes(4).toString('hex')}` },
});
const webhookId = `msg_smoke_${randomBytes(6).toString('hex')}`;
const timestamp = String(Math.floor(Date.now() / 1000));
const signature = sign(secret, webhookId, timestamp, body);

const res = await fetch(url, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'webhook-id': webhookId,
    'webhook-timestamp': timestamp,
    'webhook-signature': signature,
  },
  body,
});
const text = await res.text();
let json = null;
try {
  json = JSON.parse(text);
} catch {
  /* raw */
}

console.log(
  JSON.stringify(
    {
      ok: res.ok,
      status: res.status,
      url,
      webhook_id: webhookId,
      body: json ?? text.slice(0, 200),
    },
    null,
    2,
  ),
);
process.exit(res.ok ? 0 : 1);
