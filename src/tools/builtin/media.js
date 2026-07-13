/**
 * Tool: Media (Excalidraw / Voxel / Meshy / ImageGen)
 * Implements 13 tools for creative production and 3D modeling.
 */

import { createPlanExcalidrawArtifact } from '../../core/agentsam-plan-excalidraw-artifact.js';
import {
  broadcastExcalidrawAction,
  persistCollabCanvasElements,
  resolveCollabWorkspaceId,
} from '../../core/collab-broadcast.js';
import { meshyGenerateInProcess, meshyStatusInProcess, meshyAnimationInProcess, meshyImageTo3dInProcess, meshyRiggingInProcess, meshyRetextureInProcess, meshyPrintMultiColorInProcess, meshyRemeshInProcess, meshyConvertInProcess, meshyResizeInProcess, meshyUvUnwrapInProcess } from '../../api/cad-meshy.js';

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

/**
 * @param {Record<string, unknown>} params
 * @param {Record<string, unknown>} runContext
 */
function meshyScopeFields(params, runContext = {}) {
    const session = params?.session && typeof params.session === 'object' ? params.session : {};
    const resolved =
        runContext.resolvedContext && typeof runContext.resolvedContext === 'object'
            ? runContext.resolvedContext
            : {};
    const sessionId = String(
        params.session_id ??
            params.conversation_id ??
            runContext.sessionId ??
            runContext.session_id ??
            runContext.conversation_id ??
            runContext.conversationId ??
            resolved.session_id ??
            session.session_id ??
            '',
    ).trim();
    return {
        session_id: sessionId || undefined,
        scene_snapshot_id: String(
            params.scene_snapshot_id ?? params.scene_id ?? runContext.scene_snapshot_id ?? '',
        ).trim() || undefined,
        blueprint_id: String(params.blueprint_id ?? runContext.blueprint_id ?? '').trim() || undefined,
    };
}

function meshyToolAuth(params, runContext = {}) {
    const session = params?.session && typeof params.session === 'object' ? params.session : {};
    const resolved =
        runContext.resolvedContext && typeof runContext.resolvedContext === 'object'
            ? runContext.resolvedContext
            : {};
    const userId = String(
        runContext.userId ??
            runContext.user_id ??
            resolved.user_id ??
            params.user_id ??
            session.user_id ??
            '',
    ).trim();
    const tenantId = String(
        runContext.tenantId ??
            runContext.tenant_id ??
            resolved.tenant_id ??
            params.tenant_id ??
            session.tenant_id ??
            '',
    ).trim();
    const workspaceId = String(
        runContext.workspaceId ??
            runContext.workspace_id ??
            resolved.workspace_id ??
            params.workspace_id ??
            session.workspace_id ??
            session.workspaceId ??
            '',
    ).trim();
    return { userId, tenantId: tenantId || undefined, workspaceId: workspaceId || undefined };
}

export const handlers = {
    // ── Excalidraw (UI) ───────────────────────────────────────────────────
    async excalidraw_open(params, env) {
        const workspaceId = resolveCollabWorkspaceId(params);
        if (workspaceId) {
            await broadcastExcalidrawAction(env, workspaceId, 'open', {});
        }
        return { ok: true, message: 'Canvas activated in main panel' };
    },
    async excalidraw_clear(params, env) {
        const workspaceId = resolveCollabWorkspaceId(params);
        if (workspaceId) {
            await broadcastExcalidrawAction(env, workspaceId, 'clear', {});
        }
        return { ok: true };
    },
    async excalidraw_add_elements(params, env) {
        const workspaceId = resolveCollabWorkspaceId(params);
        const elements = Array.isArray(params?.elements) ? params.elements : [];
        if (workspaceId) {
            await broadcastExcalidrawAction(env, workspaceId, 'add_elements', { elements });
        }
        return { ok: true, element_count: elements.length };
    },
    async excalidraw_export(params, env) { return await invokeMediaOp(env, '/api/draw/export', 'POST', params); },
    async excalidraw_load_library(params, env) { return await invokeMediaOp(env, '/api/draw/library', 'POST', params); },

    /** Server-side plan → Excalidraw artifact (R2 + agentsam_artifacts). Params: plan_id, open_after_create? */
    async excalidraw_plan_map_create(params, env) {
        const planId = String(params.plan_id || params.planId || '').trim();
        if (!planId) return { error: 'plan_id required' };
        const tenantId = String(params.tenant_id || params.session?.tenant_id || '').trim();
        const workspaceId = String(params.workspace_id || params.session?.workspace_id || '').trim();
        const userId = String(params.user_id || params.session?.user_id || '').trim();
        if (!tenantId) return { error: 'tenant_id required' };
        if (!workspaceId) return { error: 'workspace_id required' };
        if (!userId) return { error: 'user_id required' };
        let openAfter = true;
        if (params.open_after_create === false || params.open_after_create === 0) openAfter = false;
        try {
            const out = await createPlanExcalidrawArtifact(env, {
                tenantId,
                workspaceId,
                userId,
                planId,
                sourceRunId: params.agent_run_id ?? params.run_id ?? null,
                sourceSessionId: params.conversation_id ?? params.session_id ?? null,
            });
            const planElements = Array.isArray(out.elements) ? out.elements : [];
            if (planElements.length > 0) {
                await broadcastExcalidrawAction(env, workspaceId, 'add_elements', { elements: planElements });
                await persistCollabCanvasElements(env, workspaceId, planElements);
            }
            return {
                ok: true,
                artifact_type: 'excalidraw',
                artifact_id: out.artifact_id,
                r2_key: out.r2_key,
                public_url: out.public_url,
                open_url: out.open_url,
                plan_id: out.plan_id,
                open_draw: openAfter,
            };
        } catch (e) {
            return { error: e?.message != null ? String(e.message) : String(e) };
        }
    },

    /**
     * iam.illustration.v1 SSOT — route sketch/diagram → Excalidraw, CAD brief → Design Studio.
     * ctx is passed through so ctx.waitUntil fires auto-execute for CAD jobs.
     */
    async illustration_create(params, env, runContext = {}, ctx = null) {
        const {
            parseIllustrationEnvelope,
            normalizeIllustrationEnvelope,
            validateIllustrationEnvelope,
        } = await import('../../core/iam-illustration-v1.js');
        const { routeIllustration } = await import('../../core/iam-illustration-router.js');

        // Pull identity from resolvedContext (same pattern as meshyToolAuth) so
        // workspace_id/tenant_id/user_id are always populated even when the agent
        // doesn't explicitly pass them in the tool call input.
        const session = params?.session && typeof params.session === 'object' ? params.session : {};
        const resolved =
            runContext.resolvedContext && typeof runContext.resolvedContext === 'object'
                ? runContext.resolvedContext
                : {};

        let envelope = parseIllustrationEnvelope(params);
        if (!envelope && params && typeof params === 'object') {
            envelope = parseIllustrationEnvelope({
                schema: 'iam.illustration.v1',
                intent: params.intent,
                fidelity: params.fidelity,
                engine: params.engine,
                title: params.title,
                brief: params.brief ?? params.prompt ?? params.description,
                workspace_id: params.workspace_id,
                tenant_id: params.tenant_id,
                user_id: params.user_id,
                payload: params.payload,
                constraints: params.constraints,
                references: params.references,
                open_after_create: params.open_after_create,
            });
        }
        if (!envelope) return { error: 'iam.illustration.v1 envelope required' };

        envelope = normalizeIllustrationEnvelope(envelope, {
            workspaceId:
                runContext.workspaceId ??
                runContext.workspace_id ??
                resolved.workspace_id ??
                params.workspace_id ??
                session.workspace_id ??
                null,
            tenantId:
                runContext.tenantId ??
                runContext.tenant_id ??
                resolved.tenant_id ??
                params.tenant_id ??
                session.tenant_id ??
                null,
            userId:
                runContext.userId ??
                runContext.user_id ??
                resolved.user_id ??
                params.user_id ??
                session.user_id ??
                null,
            title: params.title ?? null,
        });

        const valid = validateIllustrationEnvelope(envelope);
        if (!valid.ok) return { error: valid.errors.join('; ') };

        // Pass real ctx so ctx.waitUntil fires auto-execute in routeIllustrationCad
        const workerCtx = ctx ?? runContext.ctx ?? null;
        return routeIllustration(env, workerCtx, envelope, {
            ...runContext,
            authUser: runContext.authUser ?? null,
        });
    },

    // ── Voxel (3D Engine) ─────────────────────────────────────────────────
    async voxel_generate_scene(params, env) { return await invokeMediaOp(env, '/api/voxel/generate', 'POST', params); },
    async voxel_spawn_model(params, env) { return await invokeMediaOp(env, '/api/voxel/spawn', 'POST', params); },

    // ── Meshy AI (Mesh Generation) — in-process auth via bridge key ───────
    async meshyai_text_to_3d(params, env, runContext = {}) {
        const auth = meshyToolAuth(params, runContext);
        if (!auth.userId) return { error: 'user_id required for meshyai_text_to_3d' };
        const scope = meshyScopeFields(params, runContext);
        return meshyGenerateInProcess(env, null, auth, {
            prompt: params.prompt ?? params.description,
            mode: 'text',
            session_id: scope.session_id,
            scene_snapshot_id: scope.scene_snapshot_id,
            blueprint_id: scope.blueprint_id,
            auto_refine: params.auto_refine,
            ai_model: params.ai_model,
            art_style: params.art_style,
            negative_prompt: params.negative_prompt,
        });
    },
    async meshyai_image_to_3d(params, env, runContext = {}) {
        const auth = meshyToolAuth(params, runContext);
        if (!auth.userId) return { error: 'user_id required for meshyai_image_to_3d' };
        const scope = meshyScopeFields(params, runContext);
        return meshyImageTo3dInProcess(env, null, auth, {
            image_url: params.image_url ?? params.imageUrl,
            input_task_id: params.input_task_id ?? params.inputTaskId,
            prompt: params.prompt,
            texture_prompt: params.texture_prompt ?? params.texturePrompt,
            texture_image_url: params.texture_image_url ?? params.textureImageUrl,
            session_id: scope.session_id,
            scene_snapshot_id: scope.scene_snapshot_id,
            blueprint_id: scope.blueprint_id,
            model_type: params.model_type,
            ai_model: params.ai_model,
            should_texture: params.should_texture,
            enable_pbr: params.enable_pbr,
            hd_texture: params.hd_texture,
            should_remesh: params.should_remesh,
            topology: params.topology,
            target_polycount: params.target_polycount,
            decimation_mode: params.decimation_mode,
            save_pre_remeshed_model: params.save_pre_remeshed_model,
            pose_mode: params.pose_mode,
            image_enhancement: params.image_enhancement,
            remove_lighting: params.remove_lighting,
            moderation: params.moderation,
            target_formats: params.target_formats,
            auto_size: params.auto_size,
            alpha_thumbnail: params.alpha_thumbnail,
            multi_view_thumbnails: params.multi_view_thumbnails,
            origin_at: params.origin_at,
        });
    },
    async meshyai_get_task(params, env, runContext = {}) {
        const auth = meshyToolAuth(params, runContext);
        if (!auth.userId) return { error: 'user_id required for meshyai_get_task' };
        const jobId = String(params.id ?? params.job_id ?? params.cad_job_id ?? '').trim();
        if (!jobId) return { error: 'id (cad_job_id) required' };
        return meshyStatusInProcess(env, null, auth, jobId);
    },
    async meshyai_rigging(params, env, runContext = {}) {
        const auth = meshyToolAuth(params, runContext);
        if (!auth.userId) return { error: 'user_id required for meshyai_rigging' };
        const inputTaskId = String(params.input_task_id ?? params.model_task_id ?? '').trim();
        const modelUrl = String(params.model_url ?? params.modelUrl ?? '').trim();
        if (!inputTaskId && !modelUrl) {
            return { error: 'input_task_id or model_url required' };
        }
        const scope = meshyScopeFields(params, runContext);
        return meshyRiggingInProcess(env, null, auth, {
            input_task_id: inputTaskId || undefined,
            model_url: modelUrl || undefined,
            height_meters: params.height_meters,
            texture_image_url: params.texture_image_url ?? params.textureImageUrl,
            session_id: scope.session_id,
            scene_snapshot_id: scope.scene_snapshot_id,
            blueprint_id: scope.blueprint_id,
        });
    },
    async meshyai_retexture(params, env, runContext = {}) {
        const auth = meshyToolAuth(params, runContext);
        if (!auth.userId) return { error: 'user_id required for meshyai_retexture' };
        const inputTaskId = String(params.input_task_id ?? params.model_task_id ?? '').trim();
        const modelUrl = String(params.model_url ?? params.modelUrl ?? '').trim();
        if (!inputTaskId && !modelUrl) {
            return { error: 'input_task_id or model_url required' };
        }
        const textStyle = String(
            params.text_style_prompt ?? params.texture_prompt ?? params.prompt ?? '',
        ).trim();
        const imageStyle = String(params.image_style_url ?? params.imageStyleUrl ?? '').trim();
        if (!textStyle && !imageStyle) {
            return { error: 'text_style_prompt or image_style_url required' };
        }
        const scope = meshyScopeFields(params, runContext);
        return meshyRetextureInProcess(env, null, auth, {
            input_task_id: inputTaskId || undefined,
            model_url: modelUrl || undefined,
            text_style_prompt: textStyle || undefined,
            image_style_url: imageStyle || undefined,
            ai_model: params.ai_model,
            enable_original_uv: params.enable_original_uv,
            enable_pbr: params.enable_pbr,
            hd_texture: params.hd_texture,
            remove_lighting: params.remove_lighting,
            target_formats: params.target_formats,
            alpha_thumbnail: params.alpha_thumbnail,
            session_id: scope.session_id,
            scene_snapshot_id: scope.scene_snapshot_id,
            blueprint_id: scope.blueprint_id,
        });
    },
    async meshyai_print_multi_color(params, env, runContext = {}) {
        const auth = meshyToolAuth(params, runContext);
        if (!auth.userId) return { error: 'user_id required for meshyai_print_multi_color' };
        const inputTaskId = String(params.input_task_id ?? params.model_task_id ?? '').trim();
        const modelUrl = String(params.model_url ?? params.modelUrl ?? '').trim();
        if (!inputTaskId && !modelUrl) {
            return { error: 'input_task_id or model_url required' };
        }
        const scope = meshyScopeFields(params, runContext);
        return meshyPrintMultiColorInProcess(env, null, auth, {
            input_task_id: inputTaskId || undefined,
            model_url: modelUrl || undefined,
            max_colors: params.max_colors ?? params.maxColors,
            max_depth: params.max_depth ?? params.maxDepth,
            session_id: scope.session_id,
            scene_snapshot_id: scope.scene_snapshot_id,
            blueprint_id: scope.blueprint_id,
        });
    },
    async meshyai_animation(params, env, runContext = {}) {
        const auth = meshyToolAuth(params, runContext);
        if (!auth.userId) return { error: 'user_id required for meshyai_animation' };
        const rigTaskId = String(params.rig_task_id ?? params.rigTaskId ?? '').trim();
        const actionId = Number(params.action_id ?? params.actionId);
        if (!rigTaskId || !Number.isFinite(actionId)) {
            return { error: 'rig_task_id and action_id required' };
        }
        const scope = meshyScopeFields(params, runContext);
        return meshyAnimationInProcess(env, null, auth, {
            rig_task_id: rigTaskId,
            action_id: actionId,
            post_process: params.post_process ?? undefined,
            session_id: scope.session_id,
            scene_snapshot_id: scope.scene_snapshot_id,
            blueprint_id: scope.blueprint_id,
        });
    },
    /** @see https://docs.meshy.ai/en/api/remesh */
    async meshyai_remesh(params, env, runContext = {}) {
        const auth = meshyToolAuth(params, runContext);
        if (!auth.userId) return { error: 'user_id required for meshyai_remesh' };
        const inputTaskId = String(params.input_task_id ?? params.model_task_id ?? '').trim();
        const modelUrl = String(params.model_url ?? params.modelUrl ?? '').trim();
        if (!inputTaskId && !modelUrl) return { error: 'input_task_id or model_url required' };
        const scope = meshyScopeFields(params, runContext);
        return meshyRemeshInProcess(env, null, auth, {
            input_task_id: inputTaskId || undefined,
            model_url: modelUrl || undefined,
            target_formats: params.target_formats,
            topology: params.topology,
            target_polycount: params.target_polycount,
            decimation_mode: params.decimation_mode,
            alpha_thumbnail: params.alpha_thumbnail,
            session_id: scope.session_id,
            scene_snapshot_id: scope.scene_snapshot_id,
            blueprint_id: scope.blueprint_id,
        });
    },
    /** @see https://docs.meshy.ai/en/api/convert — Meshy 3D formats only (not CloudConvert) */
    async meshyai_convert(params, env, runContext = {}) {
        const auth = meshyToolAuth(params, runContext);
        if (!auth.userId) return { error: 'user_id required for meshyai_convert' };
        const inputTaskId = String(params.input_task_id ?? params.model_task_id ?? '').trim();
        const modelUrl = String(params.model_url ?? params.modelUrl ?? '').trim();
        if (!inputTaskId && !modelUrl) return { error: 'input_task_id or model_url required' };
        if (!params.target_formats) return { error: 'target_formats required' };
        const scope = meshyScopeFields(params, runContext);
        return meshyConvertInProcess(env, null, auth, {
            input_task_id: inputTaskId || undefined,
            model_url: modelUrl || undefined,
            target_formats: params.target_formats,
            session_id: scope.session_id,
            scene_snapshot_id: scope.scene_snapshot_id,
            blueprint_id: scope.blueprint_id,
        });
    },
    /** @see https://docs.meshy.ai/en/api/resize */
    async meshyai_resize(params, env, runContext = {}) {
        const auth = meshyToolAuth(params, runContext);
        if (!auth.userId) return { error: 'user_id required for meshyai_resize' };
        const inputTaskId = String(params.input_task_id ?? params.model_task_id ?? '').trim();
        const modelUrl = String(params.model_url ?? params.modelUrl ?? '').trim();
        if (!inputTaskId && !modelUrl) return { error: 'input_task_id or model_url required' };
        const scope = meshyScopeFields(params, runContext);
        return meshyResizeInProcess(env, null, auth, {
            input_task_id: inputTaskId || undefined,
            model_url: modelUrl || undefined,
            resize_height: params.resize_height,
            resize_longest_side: params.resize_longest_side,
            auto_size: params.auto_size,
            origin_at: params.origin_at,
            session_id: scope.session_id,
            scene_snapshot_id: scope.scene_snapshot_id,
            blueprint_id: scope.blueprint_id,
        });
    },
    /** @see https://docs.meshy.ai/en/api/uv-unwrap */
    async meshyai_uv_unwrap(params, env, runContext = {}) {
        const auth = meshyToolAuth(params, runContext);
        if (!auth.userId) return { error: 'user_id required for meshyai_uv_unwrap' };
        const inputTaskId = String(params.input_task_id ?? params.model_task_id ?? '').trim();
        const modelUrl = String(params.model_url ?? params.modelUrl ?? '').trim();
        if (!inputTaskId && !modelUrl) return { error: 'input_task_id or model_url required' };
        const scope = meshyScopeFields(params, runContext);
        return meshyUvUnwrapInProcess(env, null, auth, {
            input_task_id: inputTaskId || undefined,
            model_url: modelUrl || undefined,
            session_id: scope.session_id,
            scene_snapshot_id: scope.scene_snapshot_id,
            blueprint_id: scope.blueprint_id,
        });
    },

    // ── Image Generation (OpenAI / Google) ───────────────────────────────
    async imgx_generate_image(params, env) { return await invokeMediaOp(env, '/api/images/generate', 'POST', params); },
    async imgx_edit_image(params, env) { return await invokeMediaOp(env, '/api/images/edit', 'POST', params); },
    async imgx_list_providers(params, env) { return { providers: ['openai', 'google', 'workers-ai'] }; },
};
