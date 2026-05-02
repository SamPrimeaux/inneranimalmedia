import { jsonResponse } from '../core/responses.js';

/**
 * Hyperdrive SQL Execution Proxy.
 * Connects the dashboard to Supabase/Postgres via Cloudflare Hyperdrive.
 */
export async function handleHyperdriveApi(request, env) {
    if (!env.HYPERDRIVE) {
        return jsonResponse({ error: 'Hyperdrive binding not configured' }, 503);
    }

    try {
        const { sql, params = [] } = await request.json();
        if (!sql) return jsonResponse({ error: 'SQL query required' }, 400);

        // This assumes a Postgres-compatible interface via the Hyperdrive binding
        // Logic ported from monolithic worker.js handlers
        const result = await env.HYPERDRIVE.query(sql, params);
        return jsonResponse({ ok: true, results: result.rows, meta: result.meta });
    } catch (e) {
        return jsonResponse({ error: 'Hyperdrive query failed', detail: e.message }, 500);
    }
}
