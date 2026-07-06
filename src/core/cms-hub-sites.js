/**
 * Operator CMS hub — featured client builds visible from ws_inneranimalmedia /dashboard/cms.
 */
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

/** Featured order on IAM operator CMS setup (inneranimalmedia first). */
export const CMS_OPERATOR_HUB_SLUGS = [
  'inneranimalmedia',
  'companionscpas',
  'fuelnfreetime',
  'meauxbility',
];

/** CMS slug → runtime workspace for client-worker CMS. */
export const CMS_SLUG_RUNTIME_WORKSPACE = {
  inneranimalmedia: 'ws_inneranimalmedia',
  companionscpas: 'ws_companionscpas',
  fuelnfreetime: 'ws_fuelnfreetime',
  meauxbility: 'ws_meauxbility',
};

export const CMS_HUB_BRAND_DEFAULTS = {
  inneranimalmedia: {
    name: 'Inner Animal Media',
    domain: 'inneranimalmedia.com',
    logo_url:
      'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/ac515729-af6b-4ea5-8b10-e581a4d02100/avatar',
    primary_color: '#007AFF',
  },
  companionscpas: {
    name: 'Companions of Caddo',
    domain: 'companionsofcaddo.org',
    logo_url:
      'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/17381bd3-ef22-4668-dd97-78fa7211b700/avatar',
    primary_color: '#2f7bff',
  },
  fuelnfreetime: {
    name: 'Fuel N Free Time',
    domain: 'fuelnfreetime.com',
    logo_url: null,
    primary_color: '#c45c26',
  },
  meauxbility: {
    name: 'Meauxbility',
    domain: 'meauxbility.org',
    logo_url: null,
    primary_color: '#10B981',
  },
};

/**
 * Resolve which workspace should run CMS for a site slug (client workers vs platform).
 * @param {any} env
 * @param {string} activeWorkspaceId
 * @param {string|null|undefined} projectSlug
 */
export async function resolveRuntimeWorkspaceForCmsSlug(env, activeWorkspaceId, projectSlug) {
  const active = trim(activeWorkspaceId);
  const slug = trim(projectSlug);
  if (!slug) return active;
  const mapped = CMS_SLUG_RUNTIME_WORKSPACE[slug];
  if (mapped && mapped !== active) {
    if (env?.DB) {
      try {
        const row = await env.DB.prepare(
          `SELECT id FROM agentsam_workspace WHERE id = ? LIMIT 1`,
        )
          .bind(mapped)
          .first();
        if (row?.id) return mapped;
      } catch (_) {}
    } else {
      return mapped;
    }
  }
  if (env?.DB && active) {
    try {
      const hub = await env.DB.prepare(
        `SELECT notes FROM agentsam_project_context
          WHERE workspace_id = ? AND project_key = ? AND project_type = 'cms_site'
          LIMIT 1`,
      )
        .bind(active, slug)
        .first();
      const notes = parseJsonSafe(hub?.notes, {});
      const target = trim(notes.target_workspace_id);
      if (target) return target;
    } catch (_) {}
  }
  return active;
}

/**
 * Merge featured hub sites into operator workspace site list.
 * @param {any} env
 * @param {string} workspaceId
 * @param {Map<string, object>} bySlug
 */
export async function mergeOperatorHubSites(env, workspaceId, bySlug) {
  if (trim(workspaceId) !== 'ws_inneranimalmedia' || !env?.DB) return;

  let tenantRows = [];
  try {
    const placeholders = CMS_OPERATOR_HUB_SLUGS.map(() => '?').join(',');
    const { results } = await env.DB.prepare(
      `SELECT slug, name, domain, logo_url, primary_color
         FROM cms_tenants
        WHERE slug IN (${placeholders}) AND COALESCE(is_active, 1) = 1`,
    )
      .bind(...CMS_OPERATOR_HUB_SLUGS)
      .all();
    tenantRows = results || [];
  } catch (_) {}

  const tenantBySlug = new Map(tenantRows.map((r) => [trim(r.slug), r]));

  for (const slug of CMS_OPERATOR_HUB_SLUGS) {
    const defaults = CMS_HUB_BRAND_DEFAULTS[slug] || {};
    const tenant = tenantBySlug.get(slug);
    const prev = bySlug.get(slug) || {};
    bySlug.set(slug, {
      slug,
      name: trim(tenant?.name) || trim(prev.name) || defaults.name || slug,
      domain: trim(tenant?.domain) || trim(prev.domain) || defaults.domain || null,
      logo_url: trim(tenant?.logo_url) || trim(prev.logo_url) || defaults.logo_url || null,
      primary_color:
        trim(tenant?.primary_color) || trim(prev.primary_color) || defaults.primary_color || null,
      page_count: Number(prev.page_count) || 0,
      updated_at: prev.updated_at || null,
      source: prev.source || 'cms_hub',
      target_workspace_id: CMS_SLUG_RUNTIME_WORKSPACE[slug] || null,
      is_featured: true,
      cms_hosting: slug === 'inneranimalmedia' ? 'platform' : 'client_worker',
    });
  }
}

/** Sort hub sites: featured order first, then name. */
export function sortCmsHubSites(sites, opts = {}) {
  const primary = trim(opts.primarySlug);
  const hubIndex = (slug) => {
    const i = CMS_OPERATOR_HUB_SLUGS.indexOf(trim(slug));
    return i >= 0 ? i : 99;
  };
  return [...(sites || [])].sort((a, b) => {
    const pa = trim(a?.slug);
    const pb = trim(b?.slug);
    if (primary && pa === primary) return -1;
    if (primary && pb === primary) return 1;
    const ha = a.is_featured ? hubIndex(pa) : 50 + hubIndex(pa);
    const hb = b.is_featured ? hubIndex(pb) : 50 + hubIndex(pb);
    if (ha !== hb) return ha - hb;
    return String(a.name || a.slug).localeCompare(String(b.name || b.slug));
  });
}
