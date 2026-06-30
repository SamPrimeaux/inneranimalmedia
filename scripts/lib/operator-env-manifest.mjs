/**
 * SSOT manifest — gitignored build env for platform operator (Sam).
 *
 * Local/CI scripts load via:
 *   ./scripts/with-cloudflare-env.sh <cmd>
 *
 * Files (repo root, never commit):
 *   .env.cloudflare     — primary: Cloudflare, R2, Supabase, LLM keys, deploy, GCP, terminal
 *   .mcp_exports.sh     — bridge rotation: AGENTSAM_BRIDGE_KEY, MCP_AUTH_TOKEN (overrides stale .env)
 *
 * Dashboard BYOK (user_api_keys / user_secrets) is synced FROM .env.cloudflare:
 *   npm run sync:operator-keys
 *
 * Superadmin runtime bypass (in-app Agent Sam): Wrangler Worker secrets via getPlatformCredential().
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './load-env-cloudflare.mjs';

export const BUILD_ENV_FILE = '.env.cloudflare';
export const BRIDGE_ENV_FILE = '.mcp_exports.sh';
export const OPERATOR_LANE_IDS_FILE = 'scripts/lib/sam-operator-lane.ids';

/** Required for ./scripts/with-cloudflare-env.sh to run anything. */
export const REQUIRED_WRAPPER_VARS = Object.freeze([
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_API_TOKEN',
]);

/** Required for full deploy:full / deploy-frontend paths. */
export const REQUIRED_DEPLOY_VARS = Object.freeze([
  ...REQUIRED_WRAPPER_VARS,
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
]);

/** Required for npm run sync:operator-keys (mint session + upsert BYOK). */
export const REQUIRED_SYNC_VARS = Object.freeze([
  'AGENT_SESSION_MINT_SECRET',
  ...REQUIRED_WRAPPER_VARS,
]);

/** Env var names → BYOK provider (sync-operator-keys-from-env.mjs). */
export const PROVIDER_ENV_MAP = Object.freeze([
  { provider: 'openai', envKeys: ['OPENAI_API_KEY'] },
  { provider: 'anthropic', envKeys: ['ANTHROPIC_API_KEY'] },
  { provider: 'google', envKeys: ['GOOGLE_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'GOOGLE_AI_API_KEY'] },
  { provider: 'meshy', envKeys: ['MESHYAI_API_KEY', 'MESHY_API_KEY'] },
  {
    provider: 'cloudflare',
    envKeys: ['CLOUDFLARE_API_TOKEN'],
    requires: ['CLOUDFLARE_ACCOUNT_ID'],
  },
  { provider: 'github', envKeys: ['GITHUB_TOKEN'] },
  { provider: 'resend', envKeys: ['RESEND_API_KEY'] },
  { provider: 'supabase', envKeys: ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY'] },
]);

export const PERSONAL_ENV_MAP = Object.freeze([
  { secret_name: 'tavily_api_key', envKeys: ['TAVILY_API_KEY'] },
  { secret_name: 'realtimekit_api_token', envKeys: ['REALTIMEKIT_API_TOKEN'] },
]);

/** Infra / bridge — live in .env.cloudflare and/or .mcp_exports.sh; not all synced to BYOK. */
export const INFRA_ENV_VARS = Object.freeze([
  'AGENTSAM_BRIDGE_KEY',
  'MCP_AUTH_TOKEN',
  'PTY_AUTH_TOKEN',
  'EXECOS_KEY',
  'INTERNAL_API_SECRET',
  'AGENT_SESSION_MINT_SECRET',
  'DEPLOY_TRACKING_TOKEN',
  'D1_DATABASE_ID',
]);

const PLACEHOLDER_RE =
  /^(your_|changeme|replace_me|xxx+|test+|dummy|placeholder|todo|fixme|sk-fake)/i;

/** @param {string} val */
export function isPlaceholderEnvValue(val) {
  const s = String(val ?? '').trim();
  if (!s) return true;
  if (PLACEHOLDER_RE.test(s)) return true;
  if (s === 'your_cloudflare_account_id' || s === 'your_cloudflare_api_token') return true;
  return false;
}

/** @param {string} [repoRoot] */
export function loadOperatorLaneIds(repoRoot = REPO_ROOT) {
  const p = path.join(repoRoot, OPERATOR_LANE_IDS_FILE);
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^au_[a-f0-9]+$/.test(l));
}

/** @param {Record<string, string|undefined>} env */
export function auditEnvPresence(env, varNames) {
  /** @type {{ present: string[], missing: string[], placeholder: string[] }} */
  const out = { present: [], missing: [], placeholder: [] };
  for (const name of varNames) {
    const val = env[name];
    if (val == null || String(val).trim() === '') {
      out.missing.push(name);
    } else if (isPlaceholderEnvValue(val)) {
      out.placeholder.push(name);
    } else {
      out.present.push(name);
    }
  }
  return out;
}

/** @param {Record<string, string|undefined>} env */
export function providersWithEnvKeys(env) {
  const found = [];
  for (const row of PROVIDER_ENV_MAP) {
    const val = row.envKeys.map((k) => env[k]).find((v) => v && !isPlaceholderEnvValue(v));
    if (!val) continue;
    if (row.requires?.some((k) => !env[k] || isPlaceholderEnvValue(env[k]))) continue;
    found.push(row.provider);
  }
  return found;
}
