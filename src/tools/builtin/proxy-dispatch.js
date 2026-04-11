/**
 * Agent Sam: Proxy & Protocol Dispatcher
 * Orchestrates protocol translation and infrastructure bridging.
 * Belongs in: src/tools/builtin/proxy-dispatch.js
 */
import { jsonResponse } from '../core/responses.js';

/**
 * Main dispatcher for infrastructure proxy tasks.
 * Forwards the full request to ?target= URL, preserving method and body.
 */
export async function handleProxyDispatch(request, env, ctx, authUser) {
  const url    = new URL(request.url);
  const target = url.searchParams.get('target');

  if (!target) return jsonResponse({ error: 'target query parameter required' }, 400);

  try {
    const response = await fetch(target, {
      method:  request.method,
      headers: request.headers,
      body:    request.method !== 'GET' && request.method !== 'HEAD'
        ? await request.clone().blob()
        : undefined,
    });

    return new Response(response.body, {
      status:  response.status,
      headers: response.headers,
    });
  } catch (e) {
    return jsonResponse({ error: 'Proxy forwarding failed', detail: e.message }, 500);
  }
}
