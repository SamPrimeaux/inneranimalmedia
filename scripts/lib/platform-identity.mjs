/**
 * Node/script SSOT for platform operator identity — mirrors src/core/platform-identity-constants.js.
 * Load .env.cloudflare via loadEnvCloudflare() before resolve* when running standalone.
 */
import { loadEnvCloudflare, REPO_ROOT } from './load-env-cloudflare.mjs';

export const PLATFORM_D1_AUTH_USER_ID = 'au_871d920d1233cbd1';
export const PLATFORM_D1_WORKSPACE_ID = 'ws_inneranimalmedia';
export const PLATFORM_SUPABASE_WORKSPACE_UUID = 'fa1f12a8-c841-4b79-a26c-d53a78b17dac';
export const PLATFORM_SUPABASE_USER_ID_PRIMARY = '6cbd71f8-1d57-4530-9736-9bf03be1adad';
export const PLATFORM_SUPABASE_USER_ID_SECONDARY = '8678c8bb-b9b2-4aad-bb95-882d27d00787';
export const PLATFORM_OPERATOR_EMAIL_PRIMARY = 'info@inneranimals.com';
export const PLATFORM_OPERATOR_EMAIL_SECONDARY = 'sam@inneranimalmedia.com';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AU_RE = /^au_[a-f0-9]+$/;

function trim(v) {
  return v == null ? '' : String(v).trim();
}

/** @param {Record<string, string|undefined>} [env] */
export function resolvePlatformD1AuthUserId(env = process.env) {
  for (const key of ['D1_AUTH_USER_ID', 'IAM_D1_AUTH_USER_ID', 'OPERATOR_USER_ID', 'AGENT_SESSION_USER_ID']) {
    const v = trim(env[key]);
    if (AU_RE.test(v)) return v;
  }
  return PLATFORM_D1_AUTH_USER_ID;
}

/** @param {Record<string, string|undefined>} [env] */
export function resolvePlatformSupabaseUserId(env = process.env) {
  for (const key of ['IAM_SUPABASE_USER_ID', 'SUPABASE_USER_ID', 'OPERATOR_SUPABASE_USER_ID']) {
    const v = trim(env[key]);
    if (UUID_RE.test(v)) return v;
  }
  return PLATFORM_SUPABASE_USER_ID_PRIMARY;
}

/** @param {Record<string, string|undefined>} [env] */
export function resolvePlatformSupabaseWorkspaceUuid(env = process.env) {
  for (const key of ['IAM_SUPABASE_WORKSPACE_ID', 'SUPABASE_WORKSPACE_UUID', 'SUPABASE_WORKSPACE_ID']) {
    const v = trim(env[key]);
    if (UUID_RE.test(v)) return v;
  }
  return PLATFORM_SUPABASE_WORKSPACE_UUID;
}

/** @param {Record<string, string|undefined>} [env] */
export function resolvePlatformOperatorEmailPrimary(env = process.env) {
  for (const key of ['OPERATOR_USER_EMAIL', 'DEPLOY_USER_EMAIL', 'IAM_USER_EMAIL']) {
    const v = trim(env[key]);
    if (v && v.includes('@')) return v.toLowerCase();
  }
  return PLATFORM_OPERATOR_EMAIL_PRIMARY;
}

/** Load .env.cloudflare and return resolved identity bundle for deploy scripts. */
export function loadPlatformIdentityFromEnv(repoRoot = REPO_ROOT) {
  loadEnvCloudflare(repoRoot);
  return {
    d1AuthUserId: resolvePlatformD1AuthUserId(),
    supabaseUserId: resolvePlatformSupabaseUserId(),
    supabaseWorkspaceUuid: resolvePlatformSupabaseWorkspaceUuid(),
    operatorEmailPrimary: resolvePlatformOperatorEmailPrimary(),
    d1WorkspaceId: PLATFORM_D1_WORKSPACE_ID,
  };
}
