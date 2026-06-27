/**
 * CMS Studio lane — dedicated authoring host (studio.inneranimalmedia.com).
 * Storefront preview stays on project domains (?preview=draft); this host serves
 * the editor shell + CMS static assets only (auth-gated).
 */
import { getDashboardR2Object } from './dashboard-r2-assets.js';

export const CMS_STUDIO_HOST = 'studio.inneranimalmedia.com';

const CMS_SHELL_R2_KEY = 'static/dashboard/app/cms/cms-studio-shell.html';

/** @param {string|null|undefined} hostname */
export function isCmsStudioHost(hostname) {
  const h = String(hostname || '').trim().toLowerCase();
  return h === CMS_STUDIO_HOST || h === `www.${CMS_STUDIO_HOST}`;
}

/**
 * Path alias on the primary domain until studio DNS is live.
 * @param {string} pathLower
 */
export function isCmsStudioPathAlias(pathLower) {
  return (
    pathLower === '/studio' ||
    pathLower === '/studio/' ||
    pathLower === '/studio/editor' ||
    pathLower === '/studio/pages' ||
    pathLower.startsWith('/studio/pages/') ||
    pathLower === '/studio/theme-editor'
  );
}

/**
 * @param {URL} url
 */
export function normalizeCmsStudioUrl(url) {
  if (!isCmsStudioPathAlias(url.pathname.toLowerCase())) return url;
  const next = new URL(url.toString());
  const rest = next.pathname.replace(/^\/studio\/?/, '/');
  next.pathname = rest.startsWith('/') ? rest : `/${rest}`;
  if (next.pathname === '/') next.pathname = '/editor';
  return next;
}

/**
 * @param {string} pathLower
 * @returns {boolean}
 */
export function isCmsStudioAuthShellPath(pathLower) {
  if (!pathLower || pathLower.startsWith('/api/') || pathLower.startsWith('/auth/')) return false;
  if (isCmsStudioPathAlias(pathLower)) return true;
  if (pathLower === '/editor' || pathLower === '/pages' || pathLower === '/theme-editor') return true;
  if (pathLower.startsWith('/pages/')) return true;
  if (pathLower === CMS_SHELL_R2_KEY.replace(/^static\/dashboard\/app\//, '/static/dashboard/app/')) return true;
  if (pathLower === '/static/dashboard/app/cms/cms-studio-shell.html') return true;
  if (pathLower === '/' || pathLower === '') return true;
  return false;
}

/**
 * @param {string} pathLower
 */
export function isCmsStudioStaticAssetPath(pathLower) {
  return (
    pathLower.startsWith('/static/dashboard/app/cms/') ||
    pathLower.startsWith('/static/dashboard/app/vendor/') ||
    pathLower === '/static/dashboard/shell.css'
  );
}

/**
 * Map studio path → shell query params.
 * @param {URL} url
 */
export function buildCmsStudioShellSearch(url) {
  const normalized = normalizeCmsStudioUrl(url);
  const q = new URLSearchParams(normalized.searchParams);
  const path = normalized.pathname.replace(/\/+$/, '') || '/';

  if (path === '/theme-editor') {
    q.set('view', 'themeEditor');
    q.set('panel', 'theme-editor');
  } else if (path.startsWith('/pages/')) {
    const pageId = decodeURIComponent(path.slice('/pages/'.length)).split('/')[0];
    if (pageId) q.set('page', pageId);
    q.set('panel', 'pages');
  } else if (path === '/pages') {
    q.set('panel', 'pages');
  }

  if (!q.get('parent_origin')) {
    const ref = url.searchParams.get('parent_origin');
    if (ref) q.set('parent_origin', ref);
  }

  return q;
}

/**
 * @param {any} env
 * @param {string} assetPathLower
 * @param {(key: string) => string} getMimeType
 */
async function serveStudioStaticAsset(env, assetPathLower, getMimeType) {
  if (!env?.ASSETS) return null;
  const key = assetPathLower.startsWith('/') ? assetPathLower.slice(1) : assetPathLower;
  const obj = await getDashboardR2Object(env.ASSETS, key).catch(() => null);
  if (!obj) {
    const fallback = await env.ASSETS.get(key).catch(() => null);
    if (!fallback) return null;
    return new Response(fallback.body, {
      headers: {
        'Content-Type': fallback.httpMetadata?.contentType || getMimeType(key),
        'Cache-Control': assetPathLower.endsWith('.html')
          ? 'private, no-store, max-age=0'
          : 'public, max-age=3600',
      },
    });
  }
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType || getMimeType(key),
      'Cache-Control': assetPathLower.includes('cms-editor-core') ||
        assetPathLower.includes('cms-editor.js')
        ? 'private, no-store, max-age=0, must-revalidate'
        : 'public, max-age=3600',
    },
  });
}

/**
 * @param {any} env
 */
async function loadCmsStudioShellHtml(env) {
  if (!env?.ASSETS) return null;
  const obj =
    (await getDashboardR2Object(env.ASSETS, CMS_SHELL_R2_KEY).catch(() => null)) ||
    (await env.ASSETS.get(CMS_SHELL_R2_KEY).catch(() => null));
  if (!obj) return null;
  return obj.text();
}

/**
 * @param {{
 *   request: Request,
 *   url: URL,
 *   env: any,
 *   methodUpper: string,
 *   pathLower: string,
 *   getMimeType: (key: string) => string,
 *   withSessionHealing: (res: Response) => Response,
 * }} opts
 * @returns {Promise<Response|null>}
 */
export async function dispatchCmsStudioLane(opts) {
  const { request, url, env, methodUpper, pathLower, getMimeType, withSessionHealing } = opts;
  const onStudioHost = isCmsStudioHost(url.hostname);
  const onStudioPath = isCmsStudioPathAlias(pathLower);
  if (!onStudioHost && !onStudioPath) return null;

  const studioUrl = onStudioPath ? normalizeCmsStudioUrl(url) : url;

  if (methodUpper !== 'GET' && methodUpper !== 'HEAD') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (pathLower.startsWith('/api/') || pathLower.startsWith('/auth/')) return null;

  if (isCmsStudioStaticAssetPath(pathLower)) {
    const assetRes = await serveStudioStaticAsset(env, pathLower, getMimeType);
    if (assetRes) return assetRes;
  }

  const pathForRoute = studioUrl.pathname.toLowerCase();

  if (pathForRoute === '/' || pathForRoute === '') {
    const dest = new URL(studioUrl.toString());
    dest.pathname = onStudioPath ? '/studio/editor' : '/editor';
    return Response.redirect(dest.toString(), 302);
  }

  if (
    pathForRoute === '/editor' ||
    pathForRoute === '/pages' ||
    pathForRoute.startsWith('/pages/') ||
    pathForRoute === '/theme-editor' ||
    pathLower === '/static/dashboard/app/cms/cms-studio-shell.html'
  ) {
    const shellHtml = await loadCmsStudioShellHtml(env);
    if (!shellHtml) {
      return new Response('CMS studio shell missing from R2. Run deploy-frontend.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    const q = buildCmsStudioShellSearch(studioUrl);
    const shellPath = onStudioPath ? '/studio/editor' : '/editor';
    const canonical = `${url.origin}${shellPath}?${q.toString()}`;
    const headers = new Headers({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
      Link: `<${canonical}>; rel="canonical"`,
    });

    return withSessionHealing(new Response(shellHtml, { headers }));
  }

  if (pathLower.startsWith('/static/')) {
    const assetRes = await serveStudioStaticAsset(env, pathLower, getMimeType);
    if (assetRes) return assetRes;
  }

  const dest = new URL(url.toString());
  dest.pathname = onStudioPath ? '/studio/editor' : '/editor';
  return Response.redirect(dest.toString(), 302);
}

/**
 * Platform default studio URL for workspace CMS context.
 * @param {Record<string, unknown>|null|undefined} meta
 */
export function resolvePlatformCmsStudioUrl(meta) {
  const fromMeta = String(meta?.studio_url || meta?.cms_studio_url || '').trim();
  if (fromMeta) return fromMeta.replace(/\/$/, '');
  return `https://inneranimalmedia.com/studio/editor`;
}
