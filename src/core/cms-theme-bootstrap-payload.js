/**
 * Shared active-theme payload builder for GET /api/themes/active and dashboard bootstrap.
 */
import { buildActiveThemeApiPayload, hydrateCmsThemeCssVarsFromR2 } from './cms-theme-active.js';
import { getCachedActiveThemePayload, putCachedActiveThemePayload } from './cms-theme-kv-cache.js';
import { resolveActiveCmsThemeRow, resolveTenantIdForCmsThemeOps } from './cms-theme-resolve.js';

/**
 * @param {any} env
 * @param {{
 *   themeRow: Record<string, unknown> | null,
 *   resolved: { row?: Record<string, unknown> | null, resolved_from?: string },
 *   workspaceId?: string | null,
 *   projectId?: string | null,
 *   authUser?: { id?: string } | null,
 *   cache?: boolean,
 * }} args
 */
export async function buildResolvedActiveThemeApiPayload(env, args) {
  let themeRow = args.themeRow;
  if (!themeRow && env?.DB) {
    themeRow = await env.DB.prepare(
      `SELECT * FROM cms_themes WHERE is_system = 1 AND slug = 'dark' LIMIT 1`,
    ).first();
  }

  await hydrateCmsThemeCssVarsFromR2(env, themeRow);

  const payload =
    buildActiveThemeApiPayload(themeRow) ||
    ({
      name: 'dark',
      slug: 'dark',
      is_dark: true,
      data: {},
      theme_channel: 'live',
    });

  payload.resolved_from = args.resolved?.resolved_from ?? 'none';
  const ws = args.workspaceId != null ? String(args.workspaceId).trim() : '';
  const proj = args.projectId != null ? String(args.projectId).trim() : '';
  if (ws) payload.workspace_id = ws;
  if (proj) payload.project_id = proj;

  if (args.cache !== false && args.authUser?.id) {
    await putCachedActiveThemePayload(env, ws || null, args.authUser.id, proj || null, payload);
  }

  return payload;
}

/**
 * Dashboard bootstrap theme — KV first, then D1 (same semantics as GET /api/themes/active).
 * @param {any} env
 * @param {Record<string, unknown> | null | undefined} authUser
 * @param {string | null | undefined} workspaceId
 */
export async function resolveDashboardBootstrapTheme(env, authUser, workspaceId) {
  const uid = authUser?.id != null ? String(authUser.id).trim() : '';
  const ws = workspaceId != null ? String(workspaceId).trim() : '';

  try {
    const cached = await getCachedActiveThemePayload(env, ws || null, uid, null);
    if (cached) {
      cached.theme_channel = cached.theme_channel || 'live';
      cached.cache_hit = 'kv';
      return cached;
    }

    if (!env?.DB) {
      return {
        name: 'dark',
        slug: 'dark',
        is_dark: true,
        data: {},
        theme_channel: 'live',
        resolved_from: 'no_db',
      };
    }

    const tenantId = await resolveTenantIdForCmsThemeOps(env, authUser, ws || null);
    const resolved = await resolveActiveCmsThemeRow(env, {
      tenantId,
      authUser,
      workspaceId: ws || null,
      projectId: null,
    });

    return await buildResolvedActiveThemeApiPayload(env, {
      themeRow: resolved.row,
      resolved,
      workspaceId: ws || null,
      projectId: null,
      authUser,
      cache: true,
    });
  } catch {
    return {
      name: 'dark',
      slug: 'dark',
      is_dark: true,
      data: {},
      theme_channel: 'live',
      resolved_from: 'default',
    };
  }
}
