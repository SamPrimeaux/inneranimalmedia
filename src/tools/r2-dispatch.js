// src/tools/r2-dispatch.js
/**
 * Agent Sam: Global R2 Dispatcher
 * Orchestrates bucket-agnostic storage operations.
 */
import { jsonResponse } from '../core/auth.js';
import * as r2Core from '../core/r2.js';

/**
 * Main dispatcher for R2 storage tasks.
 * Route: /api/agentsam/r2/*
 */
export async function handleR2Dispatch(request, env, ctx, authUser) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '') || '/';
    const method = request.method.toUpperCase();

    try {
        // Expected params: bucket (string), key (string), prefix (string), limit (number)
        const body = method !== 'GET' ? await request.json() : {};
        const bucket = body.bucket || url.searchParams.get('bucket') || 'inneranimalmedia';
        const key = body.key || url.searchParams.get('key');
        
        // Dynamic Binding lookup (falls back to S3 API if no binding exists)
        const binding = env[bucket.toUpperCase().replace(/-/g, '_')];

        // 1. LIST Objects
        if (path.endsWith('/list')) {
            const prefix = body.prefix || url.searchParams.get('prefix') || '';
            const limit = body.limit || url.searchParams.get('limit') || 100;
            const objects = await r2Core.r2ListViaBindingOrS3(env, binding, bucket, prefix, limit);
            return jsonResponse({ bucket, prefix, objects });
        }

        // 2. GET Object
        if (path.endsWith('/get')) {
            if (!key) return jsonResponse({ error: 'Missing key' }, 400);
            const obj = await r2Core.r2GetViaBindingOrS3(env, binding, bucket, key);
            if (!obj) return jsonResponse({ error: 'Object not found' }, 404);
            const content = await obj.text();
            return jsonResponse({ bucket, key, content });
        }

        // 3. PUT Object
        if (path.endsWith('/put')) {
            if (!key || !body.content) return jsonResponse({ error: 'Missing key or content' }, 400);
            const success = await r2Core.r2PutViaBindingOrS3(env, binding, bucket, key, body.content, body.contentType);
            return jsonResponse({ bucket, key, success });
        }

        // 4. DELETE Object
        if (path.endsWith('/delete')) {
            if (!key) return jsonResponse({ error: 'Missing key' }, 400);
            const success = await r2Core.r2DeleteViaBindingOrS3(env, binding, bucket, key);
            return jsonResponse({ bucket, key, success });
        }

        return jsonResponse({ error: 'R2 action not found' }, 404);

    } catch (e) {
        console.error('[R2 Dispatch Error]', e.message);
        return jsonResponse({ error: 'Dispatcher failed', detail: e.message }, 500);
    }
}
