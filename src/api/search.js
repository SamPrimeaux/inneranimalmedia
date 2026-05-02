/**
 * API Service: Cloudflare AI Search (AutoRAG)
 * Handles semantic search and RAG chat completions.
 */

export async function handleSearchApi(request, url, env, ctx) {
  const method = request.method.toUpperCase();
  const path = url.pathname.toLowerCase();

  // Auth guard — require valid session
  const { getAuthUser, jsonResponse } = await import('../core/auth.js');
  const authUser = await getAuthUser(request, env);
  if (!authUser) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const token = env.AI_SEARCH_TOKEN;
  const base = env.AI_SEARCH_ENDPOINT;

  if (!token || !base) {
    return jsonResponse({ error: 'AI Search not configured' }, 503);
  }

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  // POST /api/search — semantic search
  if (method === 'POST' && path === '/api/search') {
    let body;
    try {
      body = await request.json();
    } catch (_) {
      return jsonResponse({ error: 'Invalid JSON' }, 400);
    }

    const { query, mode = 'search' } = body;
    if (!query) {
      return jsonResponse({ error: 'query required' }, 400);
    }

    const endpoint = mode === 'chat' ? `${base}/chat/completions` : `${base}/search`;

    const requestBody = mode === 'chat'
      ? { model: 'auto', messages: [{ role: 'user', content: query }] }
      : { query };

    try {
      const upstream = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      });

      const raw = await upstream.text();
      let data;
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        return jsonResponse(
          {
            error: 'AI Search returned non-JSON response',
            status: upstream.status,
          },
          upstream.ok ? 502 : upstream.status,
        );
      }
      return jsonResponse(data, upstream.status);
    } catch (e) {
      return jsonResponse({ error: 'AI Search request failed', detail: e.message }, 502);
    }
  }

  return jsonResponse({ error: 'Not found' }, 404);
}
