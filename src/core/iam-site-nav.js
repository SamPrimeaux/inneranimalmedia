/**
 * IAM site nav dynamics (CPAS render_site_nav pattern).
 * Chrome template stays in R2 iam-header.html; nav link lists are patched at inject time
 * from SITE_NAV_ITEMS + cms_pages.nav_visible (fallback: is_active + published status).
 */

import { IAM_STOREFRONT_ASSET_PAGES } from './iam-storefront-assets.js';
import { normalizeCmsRoutePath } from './cms-page-hydrate-dispatch.js';

/** @typedef {{ route: string, label: string, dataNav: string, inHeader: boolean, inSidenav: boolean, cta?: boolean }} IamNavItem */

/** @type {IamNavItem[]} */
export const IAM_SITE_NAV_ITEMS = [
  { route: '/', label: 'Home', dataNav: 'home', inHeader: true, inSidenav: true },
  { route: '/work', label: 'Work', dataNav: 'work', inHeader: true, inSidenav: true },
  { route: '/about', label: 'About', dataNav: 'about', inHeader: true, inSidenav: true },
  { route: '/services', label: 'Services', dataNav: 'services', inHeader: true, inSidenav: true },
  { route: '/contact', label: 'Contact', dataNav: 'contact', inHeader: true, inSidenav: true },
];

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {any} env
 * @returns {Promise<Map<string, boolean>>}
 */
export async function loadIamNavVisibility(env) {
  const map = new Map();
  if (!env?.DB) return map;
  const queries = [
    `SELECT route_path,
            COALESCE(nav_visible, 1) AS nav_visible,
            COALESCE(is_active, 1) AS is_active,
            status
       FROM cms_pages
      WHERE project_slug = 'inneranimalmedia'
         OR project_slug IS NULL
         OR project_slug = ''`,
    `SELECT route_path,
            1 AS nav_visible,
            COALESCE(is_active, 1) AS is_active,
            status
       FROM cms_pages
      WHERE project_slug = 'inneranimalmedia'
         OR project_slug IS NULL
         OR project_slug = ''`,
  ];
  for (const sql of queries) {
    try {
      const { results } = await env.DB.prepare(sql).all();
      for (const row of results || []) {
        const route = normalizeCmsRoutePath(row.route_path || '');
        if (!route) continue;
        const status = String(row.status || '').toLowerCase();
        const active = Number(row.is_active) !== 0;
        const navVisible = Number(row.nav_visible) !== 0;
        const publishedOk = !status || status === 'published';
        map.set(route, active && navVisible && publishedOk);
      }
      return map;
    } catch (e) {
      console.warn('[iam-site-nav] visibility query retry', e?.message || e);
    }
  }
  return map;
}

function isVisible(map, route) {
  const r = normalizeCmsRoutePath(route);
  if (map.has(r)) return map.get(r) === true;
  return true;
}

/**
 * @param {Map<string, boolean>} visibilityMap
 * @returns {IamNavItem[]}
 */
export function headerNavItems(visibilityMap) {
  return IAM_SITE_NAV_ITEMS.filter((item) => item.inHeader && isVisible(visibilityMap, item.route));
}

/**
 * @param {Map<string, boolean>} visibilityMap
 */
function renderDesktopNav(visibilityMap) {
  return headerNavItems(visibilityMap)
    .map(
      (item) =>
        `<a href="${esc(item.route)}" data-nav="${esc(item.dataNav)}">${esc(item.label)}</a>`,
    )
    .join('\n      ');
}

/**
 * @param {Map<string, boolean>} visibilityMap
 */
function renderSidenavLinks(visibilityMap) {
  const links = headerNavItems(visibilityMap)
    .map(
      (item) =>
        `<a href="${esc(item.route)}" data-nav="${esc(item.dataNav)}">${esc(item.label)}</a>`,
    )
    .join('\n  ');
  return `${links}\n  <a href="/auth/signup" class="iam-sidenav-cta">Sign Up</a>`;
}

/**
 * Patch R2 header chrome: replace .iam-nav and #iamSidenav link lists.
 * Styles + logo + scripts stay from R2 template.
 * @param {string} headerHtml
 * @param {Map<string, boolean>} visibilityMap
 */
export function patchIamHeaderNavHtml(headerHtml, visibilityMap) {
  let html = String(headerHtml || '');
  if (!html.trim()) return html;

  const desktop = renderDesktopNav(visibilityMap);
  const side = renderSidenavLinks(visibilityMap);

  html = html.replace(
    /(<nav class="iam-nav"[^>]*>)([\s\S]*?)(<\/nav>)/i,
    `$1\n      ${desktop}\n    $3`,
  );
  html = html.replace(
    /(<nav class="iam-sidenav"[^>]*>)([\s\S]*?)(<\/nav>)/i,
    `$1\n  ${side}\n$3`,
  );
  return html;
}

/**
 * Default catalog routes that can appear in nav (from storefront map).
 */
export function iamNavCatalogRoutes() {
  return IAM_STOREFRONT_ASSET_PAGES.filter((d) => d.chrome !== false && !d.skip_shell).map((d) =>
    normalizeCmsRoutePath(d.route),
  );
}
