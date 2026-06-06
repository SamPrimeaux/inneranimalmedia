/**
 * Platform operator workspace from wrangler `WORKSPACE_ID` only.
 * Superadmin / platform owner resolves here — never ws_{user_key}.
 * New tenant signups (non-owner) may get ws_{user_key} via defaultWorkspaceIdFromUserKey.
 */
import { authUserIsSuperadmin } from './auth.js';

/** @param {any} env */
export function getPlatformWorkspaceEnvId(env) {
  const id = env?.WORKSPACE_ID != null ? String(env.WORKSPACE_ID).trim() : '';
  return id || null;
}

/**
 * Superadmin + explicit platform fallback only (terminal root, internal git-status, DO allowPlatformFallback).
 * @param {any} env
 * @param {Record<string, unknown>|null|undefined} authUser
 * @param {{ allowPlatformFallback?: boolean }} [opts]
 */
export function resolvePlatformOperatorWorkspaceId(env, authUser, opts = {}) {
  if (opts.allowPlatformFallback !== true) return null;
  if (!authUserIsSuperadmin(authUser)) return null;
  return getPlatformWorkspaceEnvId(env);
}

/** @param {Record<string, unknown>|null|undefined} authUser */
export function pickAuthUserWorkspaceId(authUser) {
  const raw =
    authUser?.active_workspace_id ??
    authUser?.workspace_id ??
    authUser?.workspaceId ??
    null;
  const id = raw != null ? String(raw).trim() : '';
  return id || null;
}

/**
 * Default personal workspace for new tenant signup only (e.g. Connor → ws_connor…).
 * Never applied to superadmin / platform owner — they use D1 active_workspace_id or env.WORKSPACE_ID.
 * @param {string} userKey
 */
export function defaultWorkspaceIdFromUserKey(userKey) {
  const uk = userKey != null ? String(userKey).trim().toLowerCase() : '';
  if (!uk) return null;
  const safe = uk.replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32);
  return safe ? `ws_${safe}` : null;
}
