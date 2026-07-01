/**
 * Platform operator identity SSOT — D1 au_*, Supabase UUIDs, workspace mapping.
 * Override at runtime via Worker env / wrangler [vars] where noted.
 *
 * Primary login: info@inneranimals.com
 * Secondary login: sam@inneranimalmedia.com (same operator lane, alternate auth_users row)
 */

/** Canonical D1 auth_users.id for platform operator (info@inneranimals.com). */
export const PLATFORM_D1_AUTH_USER_ID = 'au_871d920d1233cbd1';

/** D1 workspace key for Inner Animal Media platform lane. */
export const PLATFORM_D1_WORKSPACE_ID = 'ws_inneranimalmedia';

/** Supabase agentsam.agentsam_workspaces.id for ws_inneranimalmedia. */
export const PLATFORM_SUPABASE_WORKSPACE_UUID = 'fa1f12a8-c841-4b79-a26c-d53a78b17dac';

/** auth.users.id — primary operator login (info@inneranimals.com). */
export const PLATFORM_SUPABASE_USER_ID_PRIMARY = '6cbd71f8-1d57-4530-9736-9bf03be1adad';

/** auth.users.id — secondary operator login (sam@inneranimalmedia.com). */
export const PLATFORM_SUPABASE_USER_ID_SECONDARY = '8678c8bb-b9b2-4aad-bb95-882d27d00787';

export const PLATFORM_OPERATOR_EMAIL_PRIMARY = 'info@inneranimals.com';
export const PLATFORM_OPERATOR_EMAIL_SECONDARY = 'sam@inneranimalmedia.com';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AU_RE = /^au_[a-f0-9]+$/;

function trim(v) {
  return v == null ? '' : String(v).trim();
}

/** @param {unknown} raw */
export function isPlatformAuthUserId(raw) {
  return AU_RE.test(trim(raw));
}

/** @param {unknown} raw */
export function isSupabaseUuid(raw) {
  return UUID_RE.test(trim(raw));
}

/**
 * Resolve D1 operator auth_users.id from env (Worker or script).
 * @param {Record<string, unknown>|null|undefined} env
 */
export function resolvePlatformD1AuthUserId(env) {
  for (const key of ['D1_AUTH_USER_ID', 'IAM_D1_AUTH_USER_ID', 'OPERATOR_USER_ID', 'AGENT_SESSION_USER_ID']) {
    const v = trim(env?.[key]);
    if (isPlatformAuthUserId(v)) return v;
  }
  return PLATFORM_D1_AUTH_USER_ID;
}

/**
 * Primary Supabase auth.users UUID (info@ login).
 * @param {Record<string, unknown>|null|undefined} env
 */
export function resolvePlatformSupabaseUserId(env) {
  for (const key of ['IAM_SUPABASE_USER_ID', 'SUPABASE_USER_ID', 'OPERATOR_SUPABASE_USER_ID']) {
    const v = trim(env?.[key]);
    if (isSupabaseUuid(v)) return v;
  }
  return PLATFORM_SUPABASE_USER_ID_PRIMARY;
}

/**
 * Supabase workspace UUID for platform lane (never pass ws_* to Postgres uuid columns).
 * @param {Record<string, unknown>|null|undefined} env
 */
export function resolvePlatformSupabaseWorkspaceUuid(env) {
  for (const key of ['IAM_SUPABASE_WORKSPACE_ID', 'SUPABASE_WORKSPACE_UUID', 'SUPABASE_WORKSPACE_ID']) {
    const v = trim(env?.[key]);
    if (isSupabaseUuid(v)) return v;
  }
  return PLATFORM_SUPABASE_WORKSPACE_UUID;
}

/**
 * Primary operator email for deploy notifications / audit (info@).
 * @param {Record<string, unknown>|null|undefined} env
 */
export function resolvePlatformOperatorEmailPrimary(env) {
  for (const key of ['OPERATOR_USER_EMAIL', 'DEPLOY_USER_EMAIL', 'IAM_USER_EMAIL']) {
    const v = trim(env?.[key]);
    if (v && v.includes('@')) return v.toLowerCase();
  }
  return PLATFORM_OPERATOR_EMAIL_PRIMARY;
}
