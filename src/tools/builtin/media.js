/**
 * Tool: Media (Excalidraw / Voxel / Meshy / ImageGen)
 * Implements 13 tools for creative production and 3D modeling.
 */

async function invokeMediaOp(env, endpoint, method = 'POST', body = null) {
    const origin = env.IAM_ORIGIN || 'https://inneranimalmedia.com';
    try {
        const res = await fetch(`${origin}${endpoint}`, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : null,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Media Operation Failed');
        return data;
    } catch (e) {
        return { error: `Media Error: ${e.message}` };
    }
}

export const handlers = {
    // ── Excalidraw (UI) ───────────────────────────────────────────────────
    async excalidraw_open(params, env) { return { ok: true, message: 'Canvas activated in main panel' }; },
    async excalidraw_clear(params, env) { return await invokeMediaOp(env, '/api/draw/clear', 'POST', params); },
    async excalidraw_add_elements(params, env) { return await invokeMediaOp(env, '/api/draw/elements', 'POST', params); },
    async excalidraw_export(params, env) { return await invokeMediaOp(env, '/api/draw/export', 'POST', params); },
    async excalidraw_load_library(params, env) { return await invokeMediaOp(env, '/api/draw/library', 'POST', params); },

    // ── Voxel (3D Engine) ─────────────────────────────────────────────────
    async voxel_generate_scene(params, env) { return await invokeMediaOp(env, '/api/voxel/generate', 'POST', params); },
    async voxel_spawn_model(params, env) { return await invokeMediaOp(env, '/api/voxel/spawn', 'POST', params); },

    // ── Meshy AI (Mesh Generation) ────────────────────────────────────────
    async meshyai_text_to_3d(params, env) { return await invokeMediaOp(env, '/api/meshy/text-to-3d', 'POST', params); },
    async meshyai_image_to_3d(params, env) { return await invokeMediaOp(env, '/api/meshy/image-to-3d', 'POST', params); },
    async meshyai_get_task(params, env) { return await invokeMediaOp(env, `/api/meshy/task?id=${params.id}`, 'GET'); },

    // ── Image Generation (OpenAI / Google) ───────────────────────────────
    async imgx_generate_image(params, env) { return await invokeMediaOp(env, '/api/images/generate', 'POST', params); },
    async imgx_edit_image(params, env) { return await invokeMediaOp(env, '/api/images/edit', 'POST', params); },
    async imgx_list_providers(params, env) { return { providers: ['openai', 'google', 'workers-ai'] }; },
};
