#!/usr/bin/env node
/**
 * Smoke: CloudConvert capture-website → PNG for inneranimalmedia.com
 * Usage: ./scripts/with-cloudflare-env.sh node scripts/cloudconvert-smoke-capture.mjs
 */
const apiKey = process.env.CLOUDCONVERT_API_KEY;
const targetUrl = process.env.CC_CAPTURE_URL || 'https://inneranimalmedia.com';
const webhookUrl =
  process.env.CLOUDCONVERT_WEBHOOK_URL || 'https://inneranimalmedia.com/api/webhooks/cloudconvert';

if (!apiKey) {
  console.error('CLOUDCONVERT_API_KEY missing — load via with-cloudflare-env.sh');
  process.exit(1);
}

async function cc(path, opts = {}) {
  const res = await fetch(`https://api.cloudconvert.com/v2${path}`, {
    method: opts.method || 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || data?.error?.message || `HTTP ${res.status}`);
  }
  return data.data ?? data;
}

console.log('→ CloudConvert user/me…');
const me = await cc('/users/me');
console.log('  credits:', me.credits ?? me.remaining_credits ?? '(unknown)');

console.log('→ Webhooks…');
const hooks = await cc('/users/me/webhooks');
const registered = hooks || [];
const hit = registered.find((h) => String(h.url || '').includes('inneranimalmedia.com'));
console.log('  registered:', registered.length);
if (hit) {
  console.log('  ✓ webhook:', hit.url, '| events:', (hit.events || []).join(', '));
} else {
  console.warn('  ⚠ no webhook for inneranimalmedia.com — async jobs need dashboard webhook');
}

console.log('→ capture-website job:', targetUrl);
const job = await cc('/jobs', {
  method: 'POST',
  body: {
    tag: 'iam-smoke-capture',
    webhook_url: webhookUrl,
    tasks: {
      'capture-home': {
        operation: 'capture-website',
        url: targetUrl,
        output_format: 'png',
        engine: 'chrome',
        screen_width: 1440,
        wait_until: 'networkidle2',
        filename: 'iam-homepage-smoke.png',
      },
      'export-png': {
        operation: 'export/url',
        input: 'capture-home',
      },
    },
  },
});

console.log('  job id:', job.id, '| status:', job.status);

const deadline = Date.now() + 120_000;
let final = job;
while (Date.now() < deadline) {
  if (['finished', 'error'].includes(final.status)) break;
  await new Promise((r) => setTimeout(r, 3000));
  final = await cc(`/jobs/${job.id}?include=tasks`);
  const pct = final.tasks?.find((t) => t.operation === 'capture-website')?.percent;
  process.stdout.write(`  poll: ${final.status}${pct != null ? ` (${pct}%)` : ''}\r`);
}
console.log('');

if (final.status === 'error') {
  const errTask = final.tasks?.find((t) => t.status === 'error');
  console.error('✗ job failed:', errTask?.message || final.message || 'unknown');
  process.exit(1);
}

const exportTask = final.tasks?.find((t) => t.operation === 'export/url' && t.status === 'finished');
const fileUrl = exportTask?.result?.files?.[0]?.url;
const filename = exportTask?.result?.files?.[0]?.filename;
if (fileUrl) {
  console.log('✓ capture complete');
  console.log('  file:', filename);
  console.log('  url:', fileUrl);
} else {
  console.log('✓ job finished — check CloudConvert dashboard for export URL');
  console.log('  job:', `https://cloudconvert.com/dashboard/jobs/${job.id}`);
}

console.log('\nProduction API equivalent:');
console.log(`  POST /api/cloudconvert/jobs`);
console.log(`  { "preset": "capture-website-png", "capture_url": "${targetUrl}" }`);
