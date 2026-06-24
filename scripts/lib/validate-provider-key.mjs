#!/usr/bin/env node
/**
 * Validate a provider API key (models list / capabilities probe).
 * Uses same logic as Settings → Keys validate (src/core/secret-validators.js).
 *
 * Usage:
 *   node scripts/lib/validate-provider-key.mjs anthropic
 *   node scripts/lib/validate-provider-key.mjs anthropic sk-ant-...
 *   node scripts/lib/validate-provider-key.mjs openai --from-env
 */
import { loadEnvCloudflare } from './load-env-cloudflare.mjs';
import { validateProviderKey, normalizeApiKeySecret } from '../../src/core/secret-validators.js';
import { sanitizeSecret } from './sanitize-secret.mjs';

loadEnvCloudflare();

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const args = argv.filter((a) => !a.startsWith('--'));
const provider = args[0]?.toLowerCase();
const keyArg = args[1];

const ENV_MAP = {
  openai: ['OPENAI_API_KEY'],
  anthropic: ['ANTHROPIC_API_KEY'],
  google: ['GOOGLE_AI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_API_KEY'],
  meshy: ['MESHYAI_API_KEY', 'MESHY_API_KEY'],
  github: ['GITHUB_TOKEN'],
  resend: ['RESEND_API_KEY'],
  supabase: ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY'],
  cloudflare: ['CLOUDFLARE_API_TOKEN'],
};

function readKey(providerName) {
  if (keyArg) return normalizeApiKeySecret(keyArg);
  if (flags.has('--from-env')) {
    const keys = ENV_MAP[providerName] || [];
    for (const k of keys) {
      const v = sanitizeSecret(process.env[k]);
      if (v) return normalizeApiKeySecret(v);
    }
  }
  return '';
}

function printResult(result) {
  const icon = result.ok ? '✓' : '✗';
  console.log(`${icon} ${result.provider} validate: ${result.ok ? 'OK' : 'FAILED'}`);
  for (const c of result.checks || []) {
    const mark = c.status === 'pass' ? '  ✓' : '  ✗';
    const lat = c.latency_ms != null ? ` (${c.latency_ms}ms)` : '';
    console.log(`${mark} ${c.id}: ${c.detail || c.status}${lat}`);
    if (Array.isArray(c.models_sample) && c.models_sample.length) {
      console.log(`      models: ${c.models_sample.join(', ')}`);
    }
    if (c.model_count != null && !c.models_sample?.length) {
      console.log(`      count: ${c.model_count}`);
    }
    if (c.balance != null) console.log(`      balance: ${c.balance}`);
    if (c.domain_count != null) console.log(`      domains: ${c.domain_count}`);
  }
  for (const w of result.warnings || []) console.log(`  warn: ${w}`);
}

async function main() {
  if (!provider) {
    console.error('Usage: validate-provider-key.mjs <provider> [key] [--from-env]');
    console.error('Providers:', Object.keys(ENV_MAP).join(', '));
    process.exit(1);
  }

  const key = readKey(provider);
  if (!key) {
    console.error('ERROR: no key — pass as arg or use --from-env with .env.cloudflare loaded');
    process.exit(2);
  }

  const opts = {};
  if (provider === 'cloudflare') {
    const accountId = sanitizeSecret(process.env.CLOUDFLARE_ACCOUNT_ID);
    if (!accountId) {
      console.error('ERROR: CLOUDFLARE_ACCOUNT_ID required in .env.cloudflare');
      process.exit(2);
    }
    opts.cloudflare_account_id = accountId;
  }

  const result = await validateProviderKey(provider, key, process.env, opts);
  printResult(result);
  process.exit(result.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
