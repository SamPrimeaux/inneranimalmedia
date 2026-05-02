// src/tools/http-dispatch.js
/**
 * Agent Sam: HTTP Network Dispatcher
 * Orchestrates isolated external API requests.
 */
import { jsonResponse } from '../core/auth.js';

/**
 * Main dispatcher for External HTTP tasks.
 */
export async function handleHttpDispatch(request, env, ctx, authUser) {
    const method = request.method.toUpperCase();
    
    try {
        if (method === 'GET') {
            const urlParam = new URL(request.url).searchParams.get('url');
            if (!urlParam) return jsonResponse({ error: 'Missing url parameter' }, 400);
            
            const response = await fetch(urlParam, {
                headers: { 'User-Agent': 'AgentSam-Worker/2.0' }
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
                    'User-Agent': 'AgentSam-Worker/2.0'
                },
                body: JSON.stringify(body.payload || {})
            });
            const data = await response.json();
            return jsonResponse({ status: response.status, data });
        }

        return jsonResponse({ error: 'Method not supported by HTTP dispatcher' }, 405);

    } catch (e) {
        return jsonResponse({ error: 'HTTP fetch failed', detail: e.message }, 500);
    }
}
<!-- slide -->
// src/tools/proxy-dispatch.js
/**
 * Agent Sam: Proxy & Protocol Dispatcher
 * Orchestrates protocol translation and infrastructure bridging.
 */
import { jsonResponse } from '../core/auth.js';

/**
 * Main dispatcher for Infrastructure Proxy tasks.
 */
export async function handleProxyDispatch(request, env, ctx, authUser) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '') || '/';

    // 1. Generic Proxy Forwarding (SOTA)
    // Map /api/agentsam/proxy/target/... to actual target
    const target = url.searchParams.get('target');
    if (!target) return jsonResponse({ error: 'Target destination required' }, 400);

    try {
        const response = await fetch(target, {
            method: request.method,
            headers: request.headers,
            body: request.method !== 'GET' ? await request.clone().blob() : undefined
        });

        return new Response(response.body, {
            status: response.status,
            headers: response.headers
        });

    } catch (e) {
        return jsonResponse({ error: 'Proxy forwarding failed', detail: e.message }, 500);
    }
}
