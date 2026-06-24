/**
 * Validate Anthropic API key (avoids curl/libcurl header bugs on macOS).
 * Usage: node scripts/lib/validate-anthropic-key.mjs [key]
 *   or ANTHROPIC_API_KEY in env
 */
import { loadEnvCloudflare } from './load-env-cloudflare.mjs';

loadEnvCloudflare();

function sanitizeKey(raw) {
  return String(raw ?? '')
    .replace(/\uFEFF/g, '')
    .replace(/[\s\r\n\t]/g, '')
    .replace(/^["']+|["']+$/g, '');
}

const raw = process.argv[2] || process.env.ANTHROPIC_API_KEY || '';
const key = sanitizeKey(raw);

if (!key) {
  console.error('ERROR: empty key');
  process.exit(2);
}

if (!/^sk-ant-[A-Za-z0-9_-]+$/.test(key)) {
  console.warn(`WARN: unusual format (len=${key.length}, prefix=${key.slice(0, 12)}…)`);
}

try {
  const res = await fetch('https://api.anthropic.com/v1/models', {
    method: 'GET',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
  });
  const text = await res.text();
  if (res.ok) {
    console.log(`Anthropic API: ok (HTTP ${res.status})`);
    process.exit(0);
  }
  console.error(`Anthropic API: FAIL (HTTP ${res.status})`);
  console.error(text.slice(0, 300));
  process.exit(1);
} catch (e) {
  console.error(`Anthropic API: network error — ${e?.message || e}`);
  process.exit(1);
}
