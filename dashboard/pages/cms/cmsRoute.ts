/** Workspace-scoped localStorage key — server SSOT is agentsam_bootstrap.ui_preferences_json.cms_project_slug */
export function cmsProjectStorageKey(workspaceId: string | null | undefined): string {
  const ws = String(workspaceId || '').trim();
  return ws ? `iam_cms_project:${ws}` : 'iam_cms_project';
}

export function readStoredCmsProjectSlug(workspaceId: string | null | undefined): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const scoped = localStorage.getItem(cmsProjectStorageKey(workspaceId));
    if (scoped) return scoped;
    const legacy = localStorage.getItem('iam_cms_project');
    return legacy || null;
  } catch {
    return null;
  }
}

export function writeStoredCmsProjectSlug(
  workspaceId: string | null | undefined,
  projectSlug: string | null | undefined,
): void {
  if (typeof localStorage === 'undefined' || !projectSlug) return;
  try {
    localStorage.setItem(cmsProjectStorageKey(workspaceId), String(projectSlug).trim());
  } catch {
    /* ignore */
  }
}

/** Legacy path segments — not project slugs. */
const CMS_RESERVED = new Set([
  'sites',
  'websites',
  'editor',
  'templates',
  'imports',
  'media',
  'pages',
  'studio',
  'online-store',
  'theme-editor',
]);

export type CmsView =
  | 'sites'
  | 'hub'
  | 'pages'
  | 'templates'
  | 'imports'
  | 'media'
  | 'online-store'
  | 'theme-editor';

export type ParsedCmsRoute = {
  view: CmsView;
  /** Explicit ?site= or legacy slug segment — never a hardcoded default */
  siteSlug: string | null;
  pageId: string | null;
  panel: 'pages' | 'templates' | 'imports' | 'media' | 'online-store' | 'theme-editor';
  legacy: boolean;
  legacyTarget: string | null;
};

/** Command center for a selected site — progressive discovery step 1. */
export function buildCmsHubPath(siteSlug?: string | null): string {
  const site = siteSlug ? String(siteSlug).trim() : '';
  return site ? `/dashboard/cms?site=${encodeURIComponent(site)}` : '/dashboard/cms';
}

export function buildCmsPath(opts: {
  panel?: 'pages' | 'templates' | 'imports' | 'media' | 'online-store' | 'theme-editor';
  pageId?: string | null;
  siteSlug?: string | null;
}): string {
  const panel = opts.panel || 'pages';
  const pageId = opts.pageId ? String(opts.pageId).trim() : '';
  const site = opts.siteSlug ? String(opts.siteSlug).trim() : '';
  const siteQs = site ? `?site=${encodeURIComponent(site)}` : '';

  if (panel === 'online-store') return `/dashboard/cms/online-store${siteQs}`;
  if (panel === 'theme-editor') return `/dashboard/cms/theme-editor${siteQs}`;
  if (panel === 'templates') return `/dashboard/cms/templates${siteQs}`;
  if (panel === 'imports') return `/dashboard/cms/imports${siteQs}`;
  if (panel === 'media') return `/dashboard/cms/media${siteQs}`;
  if (pageId) return `/dashboard/cms/pages/${encodeURIComponent(pageId)}${siteQs}`;
  return `/dashboard/cms/pages${siteQs}`;
}

/** Immersive CMS shell (hub + editor lanes) — hides dashboard chrome; Agent Sam uses side rail. */
export function isCmsEditorFullscreenRoute(
  pathname: string,
  searchParams: URLSearchParams,
): boolean {
  const parsed = parseCmsRoute(pathname, searchParams);
  if (parsed.view === 'hub') return true;
  if (parsed.view === 'sites' && parsed.siteSlug) return true;
  return parsed.view !== 'sites';
}

export function parseCmsRoute(pathname: string, searchParams: URLSearchParams): ParsedCmsRoute {
  const parts = pathname.split('/').filter(Boolean);
  const cmsIdx = parts.indexOf('cms');
  const rest = cmsIdx >= 0 ? parts.slice(cmsIdx + 1) : [];
  const siteFromQuery =
    searchParams.get('site') || searchParams.get('project') || searchParams.get('project_slug');

  if (rest.length === 0 || rest[0] === 'sites' || rest[0] === 'websites') {
    const site = siteFromQuery;
    return {
      view: site ? 'hub' : 'sites',
      siteSlug: site,
      pageId: null,
      panel: 'pages',
      legacy: false,
      legacyTarget: null,
    };
  }

  // Legacy: /dashboard/cms/editor?project=&page=
  if (rest[0] === 'editor') {
    const pageId = searchParams.get('page');
    const site = siteFromQuery;
    return {
      view: 'pages',
      siteSlug: site,
      pageId,
      panel: 'pages',
      legacy: true,
      legacyTarget: buildCmsPath({ panel: 'pages', pageId, siteSlug: site }),
    };
  }

  // Canonical: /dashboard/cms/pages[/:pageId]
  if (rest[0] === 'pages') {
    const pageId = rest[1] && rest[1] !== 'studio' ? rest[1] : searchParams.get('page');
    return {
      view: 'pages',
      siteSlug: siteFromQuery,
      pageId: pageId || null,
      panel: 'pages',
      legacy: false,
      legacyTarget: null,
    };
  }

  if (rest[0] === 'templates') {
    return {
      view: 'pages',
      siteSlug: siteFromQuery,
      pageId: searchParams.get('add_to_page'),
      panel: 'templates',
      legacy: false,
      legacyTarget: null,
    };
  }

  if (rest[0] === 'imports') {
    return {
      view: 'pages',
      siteSlug: siteFromQuery,
      pageId: null,
      panel: 'imports',
      legacy: false,
      legacyTarget: null,
    };
  }

  if (rest[0] === 'media') {
    return {
      view: 'media',
      siteSlug: siteFromQuery,
      pageId: null,
      panel: 'media',
      legacy: false,
      legacyTarget: null,
    };
  }

  if (rest[0] === 'online-store') {
    return {
      view: 'online-store',
      siteSlug: siteFromQuery,
      pageId: null,
      panel: 'online-store',
      legacy: false,
      legacyTarget: null,
    };
  }

  if (rest[0] === 'theme-editor') {
    return {
      view: 'theme-editor',
      siteSlug: siteFromQuery,
      pageId: null,
      panel: 'theme-editor',
      legacy: false,
      legacyTarget: null,
    };
  }

  // Legacy slug-in-path: /dashboard/cms/{slug}/pages[/:pageId]
  const maybeSlug = rest[0];
  if (maybeSlug && !CMS_RESERVED.has(maybeSlug)) {
    const seg2 = rest[1];
    const seg3 = rest[2];
    let panel: 'pages' | 'templates' | 'imports' = 'pages';
    let pageId: string | null = null;

    if (seg2 === 'templates') {
      panel = 'templates';
      pageId = searchParams.get('add_to_page');
    } else if (seg2 === 'imports') {
      panel = 'imports';
    } else if (!seg2 || seg2 === 'pages' || seg2 === 'studio') {
      pageId = seg3 || searchParams.get('page');
    }

    return {
      view: 'pages',
      siteSlug: maybeSlug,
      pageId,
      panel,
      legacy: true,
      legacyTarget: buildCmsPath({ panel, pageId, siteSlug: maybeSlug }),
    };
  }

  if (CMS_RESERVED.has(maybeSlug)) {
    return { view: 'sites', siteSlug: siteFromQuery, pageId: null, panel: 'pages', legacy: false, legacyTarget: null };
  }

  return { view: 'sites', siteSlug: siteFromQuery, pageId: null, panel: 'pages', legacy: false, legacyTarget: null };
}
