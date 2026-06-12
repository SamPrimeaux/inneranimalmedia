/**
 * moviemode-service — globe landing (public/) + legacy meaux API routes.
 * MovieMode encode APIs live on inneranimalmedia.com main worker.
 */
import { jsonResponse, corsHeaders } from './lib/http.js';
import { handleLegacyMeauxRoute } from './legacy-routes.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '') || '/';
    const method = request.method.toUpperCase();

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(url.origin) });
    }

    const legacy = await handleLegacyMeauxRoute(request, env, path, method);
    if (legacy) return legacy;

    if (path === '/health' || path === '/api/health') {
      return jsonResponse({
        ok: true,
        service: 'moviemode-service',
        landing: 'globe',
        version: env.CF_VERSION_METADATA?.id || null,
      });
    }

    // Globe landing, charts.js, scroll.js, globe.js, studio build
    if (env.STATIC?.fetch) {
      return env.STATIC.fetch(request);
    }

    return jsonResponse({ error: 'Not found', service: 'moviemode-service' }, 404);
  },
};
