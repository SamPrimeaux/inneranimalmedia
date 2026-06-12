/**
 * moviemode-service — media encode lane + landing globe + studio static.
 * Invoked via meauxcloud service binding or direct routes.
 */
import { jsonResponse, corsHeaders } from './lib/http.js';

const STATIC_FILES = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/globe.js', 'globe.js'],
  ['/charts.js', 'charts.js'],
  ['/scroll.js', 'scroll.js'],
]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '') || '/';
    const method = request.method.toUpperCase();

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(url.origin) });
    }

    if (path === '/health' || path === '/api/health') {
      return jsonResponse({
        ok: true,
        service: 'moviemode-service',
        version: env.CF_VERSION_METADATA?.id || null,
      });
    }

    // Landing + globe scene (wrangler assets or R2 fallback)
    const staticName = STATIC_FILES.get(path);
    if (staticName && method === 'GET') {
      const asset = await loadStatic(env, staticName);
      if (asset) return asset;
    }

    if (path.startsWith('/studio') && method === 'GET') {
      const studioPath = path === '/studio' ? '/studio/index.html' : path;
      const asset = await loadStatic(env, studioPath.replace(/^\//, ''));
      if (asset) return asset;
      return jsonResponse({ error: 'Studio build not found — run npm run build:studio' }, 404);
    }

    if (path.startsWith('/api/webhooks/cloudconvert') && method === 'POST') {
      const { handleCloudConvertWebhook } = await import('./api/webhooks/cloudconvert.js');
      return handleCloudConvertWebhook(request, env, ctx);
    }

    if (path.startsWith('/api/webhooks/stream/') && method === 'POST') {
      const { handleStreamWebhook } = await import('./api/webhooks/stream.js');
      return handleStreamWebhook(request, url, env, ctx);
    }

    if (path.startsWith('/api/cloudconvert/')) {
      const { handleCloudConvertApi } = await import('./api/cloudconvert-api.js');
      return handleCloudConvertApi(request, url, env);
    }

    if (
      path.startsWith('/api/moviemode/') ||
      path.startsWith('/api/media/assets') ||
      path.startsWith('/api/stream/')
    ) {
      const { handleMoviemodeApi } = await import('./api/moviemode-api.js');
      return handleMoviemodeApi(request, url, env, ctx);
    }

    return jsonResponse({ error: 'Not found', service: 'moviemode-service' }, 404);
  },
};

async function loadStatic(env, key) {
  if (env.STATIC?.fetch) {
    const res = await env.STATIC.fetch(new URL(`https://static/${key}`));
    if (res.ok) return res;
  }
  if (env.ASSETS?.get) {
    const obj = await env.ASSETS.get(key);
    if (obj) {
      const ct = mimeFor(key);
      return new Response(obj.body, {
        headers: { 'Content-Type': ct, 'Cache-Control': 'public, max-age=300' },
      });
    }
  }
  return null;
}

function mimeFor(key) {
  if (key.endsWith('.html')) return 'text/html; charset=utf-8';
  if (key.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (key.endsWith('.css')) return 'text/css; charset=utf-8';
  return 'application/octet-stream';
}
