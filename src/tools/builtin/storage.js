/**
 * Tool: Storage (R2 / Workspace Files)
 * Implements 9 tools for cloud object management and local exploration.
 */

import { handlers as fsHandlers } from '../fs.js';

async function invokeStorageOp(env, endpoint, method = 'POST', body = null) {
    const origin = env.IAM_ORIGIN || 'https://inneranimalmedia.com';
    try {
        const res = await fetch(`${origin}${endpoint}`, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : null,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Storage Operation Failed');
        return data;
    } catch (e) {
        return { error: `Storage Error: ${e.message}` };
    }
}

export const handlers = {
    // ── R2 Object Storage ────────────────────────────────────────────────
    async r2_list(params, env) { return await invokeStorageOp(env, '/api/storage/r2/list', 'POST', params); },
    async r2_read(params, env) { return await invokeStorageOp(env, '/api/storage/r2/read', 'POST', params); },
    async r2_write(params, env) { return await invokeStorageOp(env, '/api/storage/r2/write', 'POST', params); },
    async r2_search(params, env) { return await invokeStorageOp(env, '/api/storage/r2/search', 'POST', params); },
    async get_r2_url(params, env) { return await invokeStorageOp(env, '/api/storage/r2/url', 'POST', params); },
    async r2_bucket_summary(params, env) { return await invokeStorageOp(env, '/api/storage/r2/summary', 'GET'); },

    // ── Local Workspace (Proxied to fs tool) ─────────────────────────────
    async workspace_list_files(params, env) { return await fsHandlers.list_dir(params, env); },
    async workspace_read_file(params, env) { return await fsHandlers.read_file(params, env); },
    async workspace_search(params, env) { 
        // Proxies to a grepped search via the fs runner
        return await fsHandlers.list_dir({ ...params, recursive: true, search: true }, env); 
    },
};
