#!/usr/bin/env node
/**
 * Sync one provider key end-to-end:
 *   visible paste (or --from-env) → .env.cloudflare → wrangler secret → BYOK
 *
 * Usage:
 *   node scripts/sync-env-secret.mjs anthropic
 *   node scripts/sync-env-secret.mjs anthropic --from-env   # use existing .env.cloudflare value
 *   node scripts/sync-env-secret.mjs anthropic --check
 */
import { createInterface } from 'node:readline';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { loadEnvCloudflare, REPO_ROOT } from './lib/load-env-cloudflare.mjs';
import { mintAgentSessionCookie, resolveOperatorUserId } from './lib/mint-agent-session.mjs';
import { sanitizeSecret, assertPlausibleApiKey } from './lib/sanitize-secret.mjs';
import { validateProviderKey, normalizeApiKeySecret } from '../src/core/secret-validators.js';
import {
  upsertProviderByok,
  wranglerSecretPut,
} from './lib/sync-byok-provider.mjs';

loadEnvCloudflare();

const BASE_URL = (process.env.IAM_BASE_URL || 'https://inneranimalmedia.com').replace(/\/$/, '');
const WORKSPACE_ID = (process.env.WORKSPACE_ID || 'ws_inneranimalmedia').trim();
const USER_ID = resolveOperatorUserId();
const ENV_PATH = path.join(REPO_ROOT, '.env.cloudflare');
const WRANGLER_CFG = 'wrangler.production.toml';

/** @type {Record<string, { envVar: string; wranglerSecret?: string; byok: string; vault?: string; label: string; envAliases?: string[] }>} */
const SPECS = {
  anthropic: {
    envVar: 'ANTHROPIC_API_KEY',
    wranglerSecret: 'ANTHROPIC_API_KEY',
    byok: 'anthropic',
    vault: 'ANTHROPIC_API_KEY',
    label: 'Anthropic (synced from .env.cloudflare)',
    envAliases: [],
  },
  openai: {
    envVar: 'OPENAI_API_KEY',
    wranglerSecret: 'OPENAI_API_KEY',
    byok: 'openai',
    vault: 'OPENAI_API_KEY',
    label: 'OpenAI (synced from .env.cloudflare)',
  },
  google: {
    envVar: 'GOOGLE_AI_API_KEY',
    wranglerSecret: 'GOOGLE_AI_API_KEY',
    byok: 'google',
    vault: 'GEMINI_API_KEY',
    label: 'Google AI (synced from .env.cloudflare)',
    envAliases: ['GOOGLE_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'],
  },
  meshy: {
    envVar: 'MESHYAI_API_KEY',
    wranglerSecret: 'MESHYAI_API_KEY',
    byok: 'meshy',
    label: 'Meshy (synced from .env.cloudflare)',
    envAliases: ['MESHY_API_KEY'],
  },
};

function maskKey(v) {
  const s = String(v || '');
  if (!s) return '<missing>';
  if (s.length <= 12) return `<set:${s.length}chars>`;
  return `${s.slice(0, 10)}…${s.slice(-4)} (${s.length} chars)`;
}

function readEnvFileVar(key) {
  if (!existsSync(ENV_PATH)) return '';
  for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    if (t.startsWith(`${key}=`)) {
      return sanitizeSecret(t.slice(key.length + 1));
    }
  }
  return '';
}

function writeEnvFileVar(key, value) {
  const newLine = `${key}="${value}"`;
  const lines = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8').split('\n') : [];
  const out = [];
  let found = false;
  for (const line of lines) {
    if (line.trim().startsWith(`${key}=`)) {
      if (!found) {
        out.push(newLine);
        found = true;
      }
    } else {
      out.push(line);
    }
  }
  if (!found) {
    if (out.length && out[out.length - 1].trim()) out.push('');
    out.push(`# ${key}`);
    out.push(newLine);
  }
  writeFileSync(ENV_PATH, `${out.join('\n').replace(/\n+$/, '')}\n`, 'utf8');
  process.env[key] = value;
}

function firstEnvKey(spec) {
  const keys = [spec.envVar, ...(spec.envAliases || [])];
  for (const k of keys) {
    const fromFile = readEnvFileVar(k);
    if (fromFile) return { key: spec.envVar, value: fromFile };
    const fromProc = sanitizeSecret(process.env[k]);
    if (fromProc) return { key: spec.envVar, value: fromProc };
  }
  return { key: spec.envVar, value: '' };
}

function promptVisible(label) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    console.log('');
    console.log(`→ ${label}`);
    console.log('  Paste key below (visible) and press Enter:');
    rl.question('  ', (ans) => {
      rl.close();
      resolve(sanitizeSecret(ans));
    });
  });
}

async function validateKey(provider, value, spec) {
  const key = normalizeApiKeySecret(value);
  const opts = {};
  if (provider === 'cloudflare') {
    const accountId = sanitizeSecret(process.env.CLOUDFLARE_ACCOUNT_ID);
    if (!accountId) throw new Error('CLOUDFLARE_ACCOUNT_ID required in .env.cloudflare');
    opts.cloudflare_account_id = accountId;
  }
  const byok = spec.byok || provider;
  const result = await validateProviderKey(byok, key, process.env, opts);
  const icon = result.ok ? '✓' : '✗';
  console.log(`${icon} validate ${byok}: ${result.ok ? 'OK' : 'FAILED'}`);
  for (const c of result.checks || []) {
    const mark = c.status === 'pass' ? '  ✓' : '  ✗';
    console.log(`${mark} ${c.id}: ${c.detail || c.status}`);
    if (Array.isArray(c.models_sample) && c.models_sample.length) {
      console.log(`      ${c.models_sample.join(', ')}`);
    }
  }
  if (!result.ok) {
    throw new Error(result.checks?.find((c) => c.status === 'fail')?.detail || 'validation failed');
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const provider = argv.find((a) => !a.startsWith('--'))?.toLowerCase();
  if (!provider || !SPECS[provider]) {
    console.error('Usage: sync-env-secret.mjs <provider> [--from-env] [--check] [--skip-validate]');
    console.error('Providers:', Object.keys(SPECS).join(', '));
    process.exit(1);
  }

  const spec = SPECS[provider];
  const fromEnv = flags.has('--from-env');
  const checkOnly = flags.has('--check');
  const skipValidate = flags.has('--skip-validate');

  if (checkOnly) {
    const { value } = firstEnvKey(spec);
    console.log(`.env.cloudflare ${spec.envVar}: ${maskKey(value)}`);
    if (value && !skipValidate) {
      await validateKey(provider, value, spec);
    }
    return;
  }

  console.log(`=== Sync ${spec.envVar} (${provider}) ===`);

  let value = '';
  if (fromEnv) {
    value = firstEnvKey(spec).value;
    if (!value) {
      console.error(`ERROR: no ${spec.envVar} in .env.cloudflare — run without --from-env to paste`);
      process.exit(1);
    }
    value = assertPlausibleApiKey(value, spec.envVar);
    console.log(`Using .env.cloudflare: ${maskKey(value)}`);
  } else {
    value = await promptVisible(`${spec.envVar}`);
    value = assertPlausibleApiKey(value, spec.envVar);
  }

  if (!skipValidate) {
    console.log('');
    await validateKey(provider, value, spec);
  }

  writeEnvFileVar(spec.envVar, value);
  console.log(`✓ .env.cloudflare: ${spec.envVar}`);

  if (spec.wranglerSecret) {
    wranglerSecretPut(spec.wranglerSecret, value, WRANGLER_CFG);
    console.log(`✓ Worker secret ${spec.wranglerSecret}`);
  }

  const { cookie } = await mintAgentSessionCookie({
    userId: USER_ID,
    workspaceId: WORKSPACE_ID,
    baseUrl: BASE_URL,
  });

  const byok = await upsertProviderByok({
    baseUrl: BASE_URL,
    cookie,
    workspaceId: WORKSPACE_ID,
    provider: spec.byok,
    apiKey: value,
    label: spec.label,
    validate: false,
  });
  console.log(`✓ BYOK ${spec.byok} ${byok.rotated ? 'rotated' : 'created'}`);

  console.log('');
  console.log('OK — https://inneranimalmedia.com/dashboard/settings/keys');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
