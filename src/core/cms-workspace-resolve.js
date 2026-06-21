/**
 * CMS project + workspace context — resolved per user via agentsam_bootstrap + D1.
 * Never hardcode operator project slugs as fallbacks.
 */
import { resolveActiveBootstrap, resolveBootstrapWorkspaceContext } from './bootstrap.js';
import { ensureUserBootstrapRow } from './bootstrap-scoped-context.js';
import { cmsBootstrapKey } from './cms-kv-cache.js';
import { userCanAccessWorkspace } from './workspace-access.js';

function trim(v) {
  return v == null ? '' : String(v).trim();
}

function parseJsonSafe(raw, fallback = {}) {
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return fallback;
  }
}

/**
 * @param {Record<string, unknown>|null|undefined} bootstrapRow
 */
export function readBootstrapCmsProjectSlug(bootstrapRow) {
  if (!bootstrapRow) return null;
  const prefs = parseJsonSafe(bootstrapRow.ui_preferences_json, {});
  const runtime = parseJsonSafe(bootstrapRow.runtime_status_json, {});
  const fromPrefs = trim(prefs.cms_project_slug);
  if (fromPrefs) return fromPrefs;
  return trim(runtime.cms_project_slug) || null;
}

/**
 * @param {any} env
 * @param {{ tenantId: string, workspaceId: string }} scope
 */
export async function listCmsSitesForScope(env, { tenantId, workspaceId }) {
  const tid = trim(tenantId);
  const ws = trim(workspaceId);
  if (!env?.DB || !tid || !ws) return [];

  const bySlug = new Map();

  const addSite = (slug, meta = {}) => {
    const key = trim(slug);
    if (!key) return;
    const prev = bySlug.get(key) || {};
    bySlug.set(key, {
      slug: key,
      name: trim(meta.name) || trim(meta.project_name) || key,
      domain: trim(meta.domain) || null,
      page_count: Number(meta.page_count) || prev.page_count || 0,
      updated_at: meta.updated_at || prev.updated_at || null,
      source: meta.source || prev.source || 'unknown',
    });
  };

  let hasWorkspaceRegistry = false;
  try {
    const { results: ctxRows } = await env.DB.prepare(
      `SELECT project_key, project_name
         FROM agentsam_project_context
        WHERE workspace_id = ? AND project_type = 'cms_site' AND COALESCE(status, 'active') = 'active'
        ORDER BY project_name, project_key`,
    )
      .bind(ws)
      .all();
    hasWorkspaceRegistry = (ctxRows || []).length > 0;
    for (const row of ctxRows || []) {
      addSite(row.project_key, { name: row.project_name, source: 'agentsam_project_context' });
    }
  } catch (_) {}

  if (!hasWorkspaceRegistry) {
    try {
      const { results: tenantSites } = await env.DB.prepare(
        `SELECT slug, name, domain
           FROM cms_tenants
          WHERE tenant_ref_id = ? AND COALESCE(is_active, 1) = 1
          ORDER BY name, slug`,
      )
        .bind(tid)
        .all();
      for (const row of tenantSites || []) {
        addSite(row.slug, { name: row.name, domain: row.domain, source: 'cms_tenants' });
      }
    } catch (_) {}

    try {
      const { results: pageProjects } = await env.DB.prepare(
        `SELECT project_slug AS slug, COUNT(*) AS page_count, MAX(updated_at) AS updated_at
           FROM cms_pages
          WHERE tenant_id = ?
            AND status != 'archived'
            AND trim(COALESCE(project_slug, '')) != ''
            AND (workspace_id = ? OR workspace_id IS NULL OR trim(workspace_id) = '')
          GROUP BY project_slug
          ORDER BY project_slug`,
      )
        .bind(tid, ws)
        .all();
      for (const row of pageProjects || []) {
        addSite(row.slug, {
          page_count: Number(row.page_count) || 0,
          updated_at: row.updated_at,
          source: 'cms_pages',
        });
      }
    } catch (_) {}

    try {
      const wsRow = await env.DB.prepare(
        `SELECT slug, name FROM workspaces WHERE id = ? LIMIT 1`,
      )
        .bind(ws)
        .first();
      const wsSlug = trim(wsRow?.slug);
      if (wsSlug && !bySlug.has(wsSlug)) {
        const tenant = await env.DB.prepare(
          `SELECT slug, name, domain FROM cms_tenants WHERE slug = ? AND COALESCE(is_active, 1) = 1 LIMIT 1`,
        )
          .bind(wsSlug)
          .first()
          .catch(() => null);
        if (tenant) {
          addSite(tenant.slug, {
            name: tenant.name,
            domain: tenant.domain,
            source: 'workspace_slug',
          });
        }
      }
    } catch (_) {}
  }

  const sites = [...bySlug.values()];
  for (const site of sites) {
    if (site.page_count > 0) continue;
    try {
      const row = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM cms_pages WHERE project_slug = ? AND status != 'archived'`,
      )
        .bind(site.slug)
        .first();
      site.page_count = Number(row?.n) || 0;
    } catch (_) {}
  }

  sites.sort((a, b) => String(a.name || a.slug).localeCompare(String(b.name || b.slug)));
  return sites;
}

/**
 * Collab workspaces (explicit cms_site registry) store pages under the workspace tenant.
 * Connor on ws_fuelnfreetime reads/writes tenant_sam_primeaux CMS rows, not his personal tenant.
 * @param {any} env
 * @param {{ tenant_id?: string, id?: string }} authUser
 * @param {string} workspaceId
 * @param {Array<{ source?: string }>|null|undefined} sites
 */
export async function resolveCmsEffectiveTenantId(env, authUser, workspaceId, sites) {
  const authTenant = trim(authUser?.tenant_id);
  const ws = trim(workspaceId);
  if (!env?.DB || !authTenant || !ws) return authTenant;

  const registryMode = (sites || []).some((s) => s.source === 'agentsam_project_context');
  if (!registryMode) return authTenant;
  if (!(await userCanAccessWorkspace(env, authUser, ws))) return authTenant;

  try {
    const wsRow = await env.DB.prepare(
      `SELECT tenant_id FROM workspaces WHERE id = ? LIMIT 1`,
    )
      .bind(ws)
      .first();
    const wsTenant = trim(wsRow?.tenant_id);
    if (wsTenant) return wsTenant;
  } catch (_) {}

  return authTenant;
}

/**
 * @param {any} env
 * @param {{
 *   tenantId: string,
 *   workspaceId: string,
 *   explicitSlug?: string|null,
 *   bootstrapRow?: Record<string, unknown>|null,
 *   sites?: Array<{ slug: string }>|null,
 * }} opts
 */
export async function resolveCmsProjectSlug(env, opts) {
  const tenantId = trim(opts.tenantId);
  const workspaceId = trim(opts.workspaceId);
  const sites =
    opts.sites ||
    (await listCmsSitesForScope(env, { tenantId, workspaceId }));
  const allowed = new Set(sites.map((s) => trim(s.slug)).filter(Boolean));

  const pickIfAllowed = (slug, resolvedFrom) => {
    const key = trim(slug);
    if (!key || !allowed.has(key)) return null;
    const site = sites.find((s) => s.slug === key);
    return {
      project_slug: key,
      project_name: site?.name || key,
      resolved_from: resolvedFrom,
    };
  };

  const explicit = pickIfAllowed(opts.explicitSlug, 'query.project_slug');
  if (explicit) return explicit;

  const fromBootstrap = pickIfAllowed(
    readBootstrapCmsProjectSlug(opts.bootstrapRow),
    'agentsam_bootstrap.ui_preferences_json',
  );
  if (fromBootstrap) return fromBootstrap;

  if (sites.length === 1) {
    return {
      project_slug: sites[0].slug,
      project_name: sites[0].name || sites[0].slug,
      resolved_from: 'single_site_for_scope',
    };
  }

  return {
    project_slug: null,
    project_name: null,
    resolved_from: sites.length ? 'ambiguous_requires_site' : 'no_sites_for_scope',
  };
}

/**
 * @param {any} env
 * @param {Request} request
 * @param {{ id?: string, tenant_id?: string, person_uuid?: string }} authUser
 * @param {Record<string, unknown>} [cache]
 * @param {{ explicitProjectSlug?: string|null }} [opts]
 */
export async function resolveCmsWorkspaceContext(env, request, authUser, cache = {}, opts = {}) {
  try {
    const userId = trim(authUser?.id);
    const tenantId = trim(authUser?.tenant_id);
    if (!userId || !tenantId) {
      return { error: 'AUTH_CONTEXT_MISSING', workspace_id: null, project_slug: null, sites: [] };
    }

    const bootCtx = await resolveBootstrapWorkspaceContext(env, request, userId, cache);
    if (bootCtx.error || !bootCtx.workspace_id) {
      return {
        error: bootCtx.error || 'WORKSPACE_CONTEXT_MISSING',
        workspace_id: null,
        project_slug: null,
        sites: [],
      };
    }

    const workspaceId = trim(bootCtx.workspace_id);
    let bootstrapRow = bootCtx.bootstrap || null;
    if (!bootstrapRow) {
      bootstrapRow = await ensureUserBootstrapRow(env, {
        authUser,
        userId,
        workspaceId,
        tenantId,
      });
    }
    const bootstrapPrefs = parseJsonSafe(bootstrapRow?.ui_preferences_json, {});

    let workspaceName = trim(bootstrapRow?.workspace_name) || null;
    let workspaceSlug = trim(bootstrapRow?.workspace_slug) || null;
    if (!workspaceName || !workspaceSlug) {
      try {
        const wsRow = await env.DB.prepare(
          `SELECT name, slug FROM workspaces WHERE id = ? LIMIT 1`,
        )
          .bind(workspaceId)
          .first();
        workspaceName = workspaceName || trim(wsRow?.name) || null;
        workspaceSlug = workspaceSlug || trim(wsRow?.slug) || null;
      } catch (_) {}
    }

    const sites = await listCmsSitesForScope(env, { tenantId, workspaceId });
    const project = await resolveCmsProjectSlug(env, {
      tenantId,
      workspaceId,
      explicitSlug: opts.explicitProjectSlug,
      bootstrapRow,
      sites,
    });

    const projectSlug = project.project_slug;
    return {
      error: null,
      user_id: userId,
      tenant_id: tenantId,
      workspace_id: workspaceId,
      workspace_name: workspaceName,
      workspace_slug: workspaceSlug,
      bootstrap_id: trim(bootstrapRow?.id) || null,
      project_slug: projectSlug,
      project_name: project.project_name,
      resolved_from: project.resolved_from,
      bootstrap_cache_key:
        projectSlug && workspaceId ? cmsBootstrapKey(workspaceId, projectSlug) : null,
      sites,
      ui_label: workspaceName || workspaceSlug || 'PrimeTech Workspace',
      bootstrap_prefs: {
        cms_project_slug: trim(bootstrapPrefs.cms_project_slug) || null,
      },
    };
  } catch (e) {
    console.warn('[cms] resolveCmsWorkspaceContext', e?.message || e);
    return {
      error: String(e?.message || e || 'CMS_CONTEXT_FAILED').slice(0, 400),
      workspace_id: null,
      project_slug: null,
      sites: [],
    };
  }
}

/**
 * Persist user's CMS site pick on their agentsam_bootstrap row (per user + workspace).
 * @param {any} env
 * @param {{
 *   bootstrapId: string,
 *   userId: string,
 *   workspaceId: string,
 *   projectSlug: string,
 * }} opts
 */
export async function persistBootstrapCmsProjectSlug(env, opts) {
  const bootstrapId = trim(opts.bootstrapId);
  const userId = trim(opts.userId);
  const workspaceId = trim(opts.workspaceId);
  const projectSlug = trim(opts.projectSlug);
  if (!env?.DB || !bootstrapId || !userId || !workspaceId || !projectSlug) {
    return { ok: false, error: 'missing_fields' };
  }

  const row = await env.DB.prepare(
    `SELECT id, user_id, workspace_id, ui_preferences_json
       FROM agentsam_bootstrap
      WHERE id = ? AND COALESCE(is_active, 1) = 1
      LIMIT 1`,
  )
    .bind(bootstrapId)
    .first()
    .catch(() => null);

  if (!row || trim(row.user_id) !== userId || trim(row.workspace_id) !== workspaceId) {
    return { ok: false, error: 'bootstrap_scope_mismatch' };
  }

  const prefs = parseJsonSafe(row.ui_preferences_json, {});
  prefs.cms_project_slug = projectSlug;

  await env.DB.prepare(
    `UPDATE agentsam_bootstrap
        SET ui_preferences_json = ?, updated_at = datetime('now')
      WHERE id = ? AND user_id = ? AND workspace_id = ?`,
  )
    .bind(JSON.stringify(prefs), bootstrapId, userId, workspaceId)
    .run();

  return { ok: true, cms_project_slug: projectSlug };
}

/**
 * Resolve project slug for bootstrap API — throws-style result object.
 * @param {any} env
 * @param {Request} request
 * @param {{ id?: string, tenant_id?: string }} authUser
 * @param {string} workspaceId
 * @param {string|null} explicitSlug
 * @param {Record<string, unknown>} [cache]
 */
export async function resolveCmsBootstrapProjectSlug(
  env,
  request,
  authUser,
  workspaceId,
  explicitSlug,
  cache = {},
) {
  const ctx = await resolveCmsWorkspaceContext(env, request, authUser, cache, {
    explicitProjectSlug: explicitSlug,
  });
  if (ctx.error) return { error: ctx.error, context: ctx };
  if (!ctx.project_slug) {
    return {
      error: 'CMS_PROJECT_UNRESOLVED',
      context: ctx,
      message:
        ctx.sites?.length > 1
          ? 'Multiple CMS sites available — pass project_slug or pick a site.'
          : 'No CMS site configured for this workspace.',
    };
  }
  return { project_slug: ctx.project_slug, context: ctx };
}
