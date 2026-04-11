/**
 * Agent Sam: HTTP Network Dispatcher
 * Orchestrates isolated external API requests on behalf of the agent.
 * Belongs in: src/tools/builtin/http-dispatch.js
 */
import { jsonResponse } from '../core/responses.js';

/**
 * Main dispatcher for external HTTP tasks.
 * GET  — fetches URL passed as ?url= query param
 * POST — posts JSON payload to body.url
 */
export async function handleHttpDispatch(request, env, ctx, authUser) {
  const method = request.method.toUpperCase();

  try {
    if (method === 'GET') {
      const urlParam = new URL(request.url).searchParams.get('url');
      if (!urlParam) return jsonResponse({ error: 'Missing url parameter' }, 400);

      const response = await fetch(urlParam, {
        headers: { 'User-Agent': 'AgentSam-Worker/2.0' },
      });
      const data = await response.text();
      return jsonResponse({ status: response.status, data });
    }

    if (method === 'POST') {
      const body = await request.json();
      if (!body.url) return jsonResponse({ error: 'Missing url in body' }, 400);

      const response = await fetch(body.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'AgentSam-Worker/2.0',
        },
        body: JSON.stringify(body.payload || {}),
      });
      const data = await response.json().catch(() => ({}));
      return jsonResponse({ status: response.status, data });
    }

    return jsonResponse({ error: 'Method not supported by HTTP dispatcher' }, 405);
  } catch (e) {
    return jsonResponse({ error: 'HTTP fetch failed', detail: e.message }, 500);
  }
}
