/**
 * Unauthenticated read-only CMS endpoints for public marketing shells.
 */
import { jsonResponse } from '../core/auth.js';
import { loadPublishedCmsSectionsByRoute } from '../core/cms-public-page.js';

export async function handlePublicCmsApi(request, url, env) {
  if (request.method.toUpperCase() !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }
  const path = url.pathname.replace(/\/$/, '');
  if (path !== '/api/public/cms/page-sections') {
    return jsonResponse({ error: 'Not found' }, 404);
  }
  if (!env?.DB) return jsonResponse({ error: 'Database unavailable' }, 503);

  const route = String(url.searchParams.get('route') || '').trim();
  if (!route.startsWith('/')) return jsonResponse({ error: 'route must start with /' }, 400);

  const bundle = await loadPublishedCmsSectionsByRoute(env.DB, route);
  return new Response(
    JSON.stringify({
      page: bundle.page,
      sections: (bundle.sections || []).map((s) => ({
        id: s.id,
        section_type: s.section_type,
        section_name: s.section_name,
        section_data: s.section_data,
        sort_order: s.sort_order,
      })),
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60',
      },
    },
  );
}
