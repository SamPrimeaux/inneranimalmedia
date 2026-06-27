/**
 * CMS preview route resolution — ?preview=draft|published on real storefront URLs.
 * Works with cms=1 (editor embed chrome) or standalone preview tabs.
 */
import { getCmsDraftCache } from './cms-kv-cache.js';
import { mergeCmsDraftSections } from './cms-edit-safety.js';
import { normalizeCmsRoutePath } from './cms-page-hydrate-dispatch.js';

function parseSectionData(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * @param {URL} url
 * @returns {{ cmsEmbed: boolean, previewMode: 'draft' | 'published' | null, pageId: string | null }}
 */
export function parseCmsUrlPreviewMode(url) {
  const cmsEmbed = url.searchParams.get('cms') === '1';
  const previewRaw = String(url.searchParams.get('preview') || '').trim().toLowerCase();
  const pageId = String(url.searchParams.get('page_id') || url.searchParams.get('page') || '').trim() || null;

  let previewMode = null;
  if (previewRaw === 'draft' || previewRaw === '1' || previewRaw === 'true') {
    previewMode = 'draft';
  } else if (previewRaw === 'published' || previewRaw === 'live') {
    previewMode = 'published';
  }

  return { cmsEmbed, previewMode, pageId };
}

/**
 * Resolve cms_pages row by public route (supports / vs /home aliases).
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} routePath
 * @param {{ includeDraft?: boolean }} [opts]
 */
export async function resolveCmsPageByRoutePath(db, routePath, opts = {}) {
  if (!db) return { page: null, sections: [] };
  const route = normalizeCmsRoutePath(routePath);
  const includeDraft = opts.includeDraft === true;
  const statusSql = includeDraft
    ? `status != 'archived'`
    : `status = 'published' AND COALESCE(is_active, 1) = 1`;

  const candidates = [route];
  if (route === '/') candidates.push('/home');
  if (route === '/home') candidates.push('/');

  let page = null;
  for (const candidate of candidates) {
    page = await db
      .prepare(
        `SELECT id, route_path, slug, title, status, page_type, r2_key, r2_bucket, content_type, project_slug, project_id, is_homepage
         FROM cms_pages
         WHERE route_path = ? AND ${statusSql}
         ORDER BY is_homepage DESC, updated_at DESC
         LIMIT 1`,
      )
      .bind(candidate)
      .first()
      .catch(() => null);
    if (page?.id) break;
  }

  if (!page?.id && route !== '/') {
    page = await db
      .prepare(
        `SELECT id, route_path, slug, title, status, page_type, r2_key, r2_bucket, content_type, project_slug, project_id, is_homepage
         FROM cms_pages
         WHERE slug = ? AND ${statusSql}
         ORDER BY updated_at DESC
         LIMIT 1`,
      )
      .bind(route.replace(/^\//, ''))
      .first()
      .catch(() => null);
  }

  if (!page?.id) return { page: null, sections: [] };

  const { results } = await db
    .prepare(
      `SELECT id, section_type, section_name, section_data, sort_order, is_visible
       FROM cms_page_sections
       WHERE page_id = ?
       ORDER BY sort_order ASC, section_name ASC`,
    )
    .bind(page.id)
    .all()
    .catch(() => ({ results: [] }));

  const sections = (Array.isArray(results) ? results : []).map((row) => ({
    ...row,
    section_data: parseSectionData(row.section_data),
  }));

  return { page, sections };
}

/**
 * Load sections for a route, optionally merging authenticated draft overrides.
 * @param {any} env
 * @param {string} routePath
 * @param {{ previewMode?: 'draft' | 'published' | null, userId?: string | null, pageId?: string | null }} opts
 */
export async function loadCmsSectionsForRoute(env, routePath, opts = {}) {
  const previewMode = opts.previewMode || null;
  const userId = String(opts.userId || '').trim() || null;
  const explicitPageId = String(opts.pageId || '').trim() || null;
  const includeDraft = previewMode === 'draft';

  let bundle;
  if (explicitPageId && env?.DB) {
    const page = await env.DB.prepare(
      `SELECT id, route_path, slug, title, status, page_type, r2_key, r2_bucket, content_type, project_slug, project_id, is_homepage
       FROM cms_pages WHERE id = ? LIMIT 1`,
    )
      .bind(explicitPageId)
      .first()
      .catch(() => null);
    if (page?.id) {
      const resolved = await resolveCmsPageByRoutePath(env.DB, page.route_path || routePath, {
        includeDraft,
      });
      bundle = resolved.page?.id === page.id ? resolved : await resolveCmsPageByRoutePath(env.DB, routePath, { includeDraft });
      if (!bundle.page?.id) {
        const { results } = await env.DB.prepare(
          `SELECT id, section_type, section_name, section_data, sort_order, is_visible
           FROM cms_page_sections WHERE page_id = ? ORDER BY sort_order ASC`,
        )
          .bind(page.id)
          .all()
          .catch(() => ({ results: [] }));
        bundle = {
          page,
          sections: (results || []).map((row) => ({
            ...row,
            section_data: parseSectionData(row.section_data),
          })),
        };
      }
    } else {
      bundle = await resolveCmsPageByRoutePath(env.DB, routePath, { includeDraft });
    }
  } else {
    bundle = await resolveCmsPageByRoutePath(env.DB, routePath, { includeDraft });
  }

  if (!bundle.page?.id) {
    return { page: null, sections: [], effectiveMode: 'none' };
  }

  let sections = bundle.sections || [];
  let effectiveMode = previewMode === 'draft' ? 'draft' : 'published';

  if (previewMode === 'draft' && userId) {
    let draftData = null;
    const kvDraft = await getCmsDraftCache(env, bundle.page.id, userId).catch(() => null);
    draftData = kvDraft?.draft_data || null;
    if (!draftData) {
      const draftRow = await env.DB.prepare(
        `SELECT draft_data FROM cms_page_drafts WHERE page_id = ? AND user_id = ? LIMIT 1`,
      )
        .bind(bundle.page.id, userId)
        .first()
        .catch(() => null);
      if (draftRow?.draft_data) {
        try {
          draftData = JSON.parse(draftRow.draft_data);
        } catch {
          draftData = null;
        }
      }
    }
    sections = mergeCmsDraftSections(sections, draftData);
  } else if (previewMode === 'draft' && !userId) {
    effectiveMode = 'published';
  }

  if (effectiveMode === 'published') {
    sections = sections.filter((s) => s.is_visible === 1 || s.is_visible === true);
  }

  return { page: bundle.page, sections, effectiveMode };
}

/**
 * Build storefront URLs for a CMS page.
 * @param {Record<string, unknown>} page
 * @param {{ domain?: string | null, projectSlug?: string | null }} [opts]
 */
export function buildCmsPageUrls(page, opts = {}) {
  const route = normalizeCmsRoutePath(
    String(page.route_path || '').trim() ||
      (page.slug && String(page.slug) !== 'home' ? `/${page.slug}` : '/'),
  );
  const domain = String(opts.domain || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const project = String(opts.projectSlug || page.project_slug || page.project_id || 'inneranimalmedia').trim();
  const origin = domain ? `https://${domain}` : `https://${project}.meauxbility.workers.dev`;
  const base = `${origin}${route}`;

  const u = (params) => {
    try {
      const url = new URL(base);
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
      return url.toString();
    } catch {
      const qs = new URLSearchParams(params).toString();
      return `${base}?${qs}`;
    }
  };

  return {
    route_path: route,
    live_url: base,
    embed_url: u({ cms: '1' }),
    preview_draft_url: u({ preview: 'draft', cms: '1', page_id: String(page.id || '') }),
    preview_published_url: u({ preview: 'published', cms: '1' }),
    page_id: String(page.id || ''),
  };
}
