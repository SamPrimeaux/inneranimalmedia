/**
 * Access control for dashboard media keys on R2 bucket `inneranimalmedia`.
 *
 * Prefix conventions:
 *   users/{userId}/images/              — personal uploads / legacy
 *   workspace-media/{workspaceId}/images/ — legacy workspace layout
 *   uploads/{workspaceSlug}/images/     — preferred workspace uploads
 *   media/{workspaceSlug}/library/    — curated workspace library
 *   captures/{workspaceSlug}/...      — workspace-scoped captures (reports, Playwright, etc.)
 *   captures/theme-debug/...          — theme-debug bundles (superadmin-only reads)
 */
import { userCanAccessWorkspace } from './cms-theme-resolve.js';

function isSuperadmin(authUser) {
  return !!(authUser && (authUser.is_superadmin === 1 || authUser.is_superadmin === true));
}

/**
 * Resolve a stable folder slug for R2 paths (prefers workspaces.slug, falls back to id).
 * @param {unknown} env
 * @param {string} workspaceId
 */
export async function workspaceSlugForWorkspaceId(env, workspaceId) {
  const wid = String(workspaceId || '').trim();
  if (!wid || !env?.DB) return wid;
  try {
    const row = await env.DB.prepare(
      `SELECT COALESCE(NULLIF(TRIM(slug), ''), id) AS s FROM workspaces WHERE id = ? LIMIT 1`,
    )
      .bind(wid)
      .first();
    const s = row?.s != null ? String(row.s).trim() : '';
    return s || wid;
  } catch {
    return wid;
  }
}

/**
 * @param {unknown} env
 * @param {{ id?: string }} authUser
 * @param {string} segment workspace slug OR workspace id
 */
async function canAccessWorkspaceSlugOrId(env, authUser, segment) {
  const seg = String(segment || '').trim();
  if (!seg || !authUser?.id) return false;
  if (await userCanAccessWorkspace(env, authUser, seg)) return true;
  if (!env?.DB) return false;
  try {
    const row = await env.DB.prepare(`SELECT id FROM workspaces WHERE slug = ? LIMIT 1`).bind(seg).first();
    const id = row?.id != null ? String(row.id).trim() : '';
    if (id && (await userCanAccessWorkspace(env, authUser, id))) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * @param {unknown} env
 * @param {{ id?: string }} authUser
 * @param {string} key
 */
export async function canAccessMediaObjectKey(env, authUser, key) {
  if (!authUser?.id) return false;
  const uid = String(authUser.id).trim();
  const k = String(key || '');
  if (!uid || !k) return false;

  if (k.startsWith(`users/${uid}/`)) return true;

  let m = /^workspace-media\/([^/]+)\//.exec(k);
  if (m) return userCanAccessWorkspace(env, authUser, m[1]);

  m = /^uploads\/([^/]+)\/images\//.exec(k);
  if (m) return canAccessWorkspaceSlugOrId(env, authUser, m[1]);

  m = /^media\/([^/]+)\/library\//.exec(k);
  if (m) return canAccessWorkspaceSlugOrId(env, authUser, m[1]);

  m = /^captures\/([^/]+)\//.exec(k);
  if (m && m[1] !== 'theme-debug') return canAccessWorkspaceSlugOrId(env, authUser, m[1]);

  if (k.startsWith('captures/theme-debug/')) return isSuperadmin(authUser);

  if (k.startsWith('cms/')) return !!authUser?.id;

  return false;
}

/**
 * Prefixes scanned for GET /api/images (merged view).
 * @param {unknown} env
 * @param {{ id?: string; is_superadmin?: number | boolean }} authUser
 * @param {string | null | undefined} workspaceId
 */
export async function resolveMediaListPrefixes(env, authUser, workspaceId) {
  const uid = String(authUser?.id || '').trim();
  if (!uid) return { error: 'Unauthorized', status: 401, prefixes: [], slug: '' };

  const ws = workspaceId != null && String(workspaceId).trim() !== '' ? String(workspaceId).trim() : '';

  if (!ws) {
    const prefixes = [`users/${uid}/images/`];
    if (isSuperadmin(authUser)) prefixes.push('captures/theme-debug/');
    return { slug: '', prefixes };
  }

  const ok = await userCanAccessWorkspace(env, authUser, ws);
  if (!ok) return { error: 'Forbidden workspace', status: 403, prefixes: [], slug: '' };

  const slug = await workspaceSlugForWorkspaceId(env, ws);
  const prefixes = [
    `uploads/${slug}/images/`,
    `media/${slug}/library/`,
    `captures/${slug}/`,
    `workspace-media/${ws}/images/`,
  ];
  if (isSuperadmin(authUser)) prefixes.push('captures/theme-debug/');

  return { slug, prefixes, workspaceId: ws };
}

/**
 * Single upload prefix for POST /api/images (new objects land here).
 * @param {unknown} env
 * @param {{ id?: string }} authUser
 * @param {string | null | undefined} workspaceId
 */
export async function resolvePrimaryUploadPrefix(env, authUser, workspaceId) {
  const uid = String(authUser?.id || '').trim();
  if (!uid) return { error: 'Unauthorized', status: 401 };

  const ws = workspaceId != null && String(workspaceId).trim() !== '' ? String(workspaceId).trim() : '';
  if (!ws) {
    return { prefix: `users/${uid}/images/` };
  }

  const ok = await userCanAccessWorkspace(env, authUser, ws);
  if (!ok) return { error: 'Forbidden workspace', status: 403 };

  const slug = await workspaceSlugForWorkspaceId(env, ws);
  return { prefix: `uploads/${slug}/images/`, workspaceSlug: slug, workspaceId: ws };
}

/** @deprecated Use resolvePrimaryUploadPrefix / resolveMediaListPrefixes */
export async function resolveWorkspaceImagesPrefix(env, authUser, workspaceId) {
  const pack = await resolvePrimaryUploadPrefix(env, authUser, workspaceId);
  if (pack.error) return pack;
  return { prefix: pack.prefix };
}
