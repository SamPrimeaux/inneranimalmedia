#!/usr/bin/env node
/**
 * Sync one provider: Worker secret + user_api_keys BYOK.
 *
 * Usage:
 *   node scripts/sync-provider-byok.mjs anthropic
 *   node scripts/sync-provider-byok.mjs openai google meshy
 *
 * Reads keys from .env.cloudflare (load via with-cloudflare-env.sh).
 */
import { loadEnvCloudflare } from './lib/load-env-cloudflare.mjs';
import { mintAgentSessionCookie, resolveOperatorUserId } from './lib/mint-agent-session.mjs';
import {
  upsertProviderByok,
  wranglerSecretPut,
} from './lib/sync-byok-provider.mjs';

loadEnvCloudflare();

const BASE_URL = (process.env.IAM_BASE_URL || 'https://inneranimalmedia.com').replace(/\/$/, '');
const WORKSPACE_ID = (process.env.WORKSPACE_ID || 'ws_inneranimalmedia').trim();
const USER_ID = resolveOperatorUserId();

/** @type {Record<string, { envKeys: string[]; wranglerSecret?: string; vaultName?: string; label: string; validate?: boolean; extra?: Record<string, unknown> }>} */
const PROVIDERS = {
  openai: {
    envKeys: ['OPENAI_API_KEY'],
    wranglerSecret: 'OPENAI_API_KEY',
    vaultName: 'OPENAI_API_KEY',
    label: 'OpenAI (synced from .env.cloudflare)',
    validate: true,
  },
  anthropic: {
    envKeys: ['ANTHROPIC_API_KEY'],
    wranglerSecret: 'ANTHROPIC_API_KEY',
    vaultName: 'ANTHROPIC_API_KEY',
    label: 'Anthropic (synced from .env.cloudflare)',
    validate: false,
  },
  google: {
    envKeys: ['GOOGLE_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'GOOGLE_AI_API_KEY'],
    wranglerSecret: 'GOOGLE_AI_API_KEY',
    vaultName: 'GEMINI_API_KEY',
    label: 'Google AI (synced from .env.cloudflare)',
    validate: true,
  },
  meshy: {
    envKeys: ['MESHYAI_API_KEY', 'MESHY_API_KEY'],
    wranglerSecret: 'MESHYAI_API_KEY',
    label: 'Meshy (synced from .env.cloudflare)',
    validate: false,
  },
  cloudflare: {
    envKeys: ['CLOUDFLARE_API_TOKEN'],
    label: 'Cloudflare (synced from .env.cloudflare)',
    validate: true,
    getExtra: () => {
      const id = firstEnv(['CLOUDFLARE_ACCOUNT_ID']);
      return id ? { cloudflare_account_id: id } : {};
    },
  },
  github: {
    envKeys: ['GITHUB_TOKEN'],
    label: 'GitHub (synced from .env.cloudflare)',
    validate: true,
  },
  resend: {
    envKeys: ['RESEND_API_KEY'],
    label: 'Resend (synced from .env.cloudflare)',
    validate: true,
  },
  supabase: {
    envKeys: ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY'],
    label: 'Supabase (synced from .env.cloudflare)',
    validate: false,
  },
};

function firstEnv(keys) {
  for (const k of keys) {
    const v = process.env[k];
    if (v && String(v).trim()) return String(v).trim();
  }
  return '';
}

async function syncOne(provider, cookie, opts = {}) {
  const spec = PROVIDERS[provider];
  if (!spec) throw new Error(`unknown provider: ${provider}`);

  const apiKey = firstEnv(spec.envKeys);
  if (!apiKey) {
    console.log(`[skip] ${provider} (no env value for ${spec.envKeys.join('|')})`);
    return;
  }

  const validate = opts.validate && (spec.validate ?? false);

  if (spec.wranglerSecret && !opts.skipWrangler) {
    try {
      wranglerSecretPut(spec.wranglerSecret, apiKey);
      console.log(`[ok] Worker secret ${spec.wranglerSecret}`);
    } catch (e) {
      console.warn(`[warn] wrangler ${spec.wranglerSecret}: ${e instanceof Error ? e.message : e}`);
    }
  }

  const extra =
    typeof spec.getExtra === 'function' ? spec.getExtra() : spec.extra || {};
  const result = await upsertProviderByok({
    baseUrl: BASE_URL,
    cookie,
    workspaceId: WORKSPACE_ID,
    provider,
    apiKey,
    label: spec.label,
    validate,
    extraPayload: extra,
  });
  console.log(
    `[ok] BYOK ${provider} ${result.rotated ? 'rotated' : 'created'} (${result.id || 'new'})`,
  );
}

async function main() {
  const argv = process.argv.slice(2);
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const args = argv.filter((a) => !a.startsWith('--'));
  const validateByok = flags.has('--validate');
  const skipWrangler = flags.has('--skip-wrangler');

  if (!args.length) {
    console.error('Usage: sync-provider-byok.mjs <provider> [provider...]');
    console.error('Providers:', Object.keys(PROVIDERS).join(', '));
    process.exit(1);
  }

  const { cookie } = await mintAgentSessionCookie({
    userId: USER_ID,
    workspaceId: WORKSPACE_ID,
    baseUrl: BASE_URL,
  });

  for (const p of args) {
    try {
      await syncOne(p.toLowerCase(), cookie, { validate: validateByok, skipWrangler });
    } catch (e) {
      console.warn(`[warn] ${p}: ${e instanceof Error ? e.message : e}`);
    }
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
