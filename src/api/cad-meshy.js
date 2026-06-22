/**
 * Meshy CAD route handlers — balance, text-to-3d preview/refine, task CRUD, generate.
 */
import { jsonResponse, resolveRequestContext } from '../core/auth.js';
import { resolveCadJobScope } from '../core/cad-job-scope.js';
import { applyMeshyTaskToCadJob } from '../core/meshy-cad-sync.js';
import { buildCadAssetPublicUrl } from '../core/cad-job-scope.js';
import {
  checkMeshyBalance,
  checkMeshyBalanceForOperation,
  createMeshyTask,
  deleteMeshyTask,
  getBalance,
  getMeshyTask,
  isMeshyStubKey,
  listMeshyTasks,
  meshyErrorResponseBody,
  textTo3dPreview,
  textTo3dRefine,
} from '../core/meshy-api.js';
import {
  estimateImageTo3dCost,
  estimateTextTo3dFullCost,
  estimateTextTo3dPreviewCost,
  MESHY_CREDIT_COSTS,
  estimateMeshyOperationCost,
} from '../core/meshy-credits.js';
import { bridgedToolRequest, primeRequestAuthForTool } from '../core/meshy-tool-auth.js';

// Re-export for tool bridge
export { getBalance, checkMeshyBalance };

/**
 * @param {any} env
 * @param {Record<string, unknown>} fields
 */
export async function insertMeshyCadJob(env, fields) {
  await env.DB.prepare(
    `INSERT INTO agentsam_cad_jobs (
       id, user_id, session_id, engine, prompt, mode, status,
       external_task_id, r2_key, r2_bucket, workspace_id, tenant_id,
       project_id, scene_snapshot_id, progress_pct,
       task_type, parent_task_id, rig_task_id, credits_consumed,
       model_formats, texture_data,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())`,
  )
    .bind(
      fields.id,
      fields.user_id,
      fields.session_id ?? null,
      fields.engine ?? 'meshy',
      fields.prompt ?? '',
      fields.mode ?? 'text',
      fields.status,
      fields.external_task_id ?? null,
      fields.r2_key ?? null,
      fields.r2_bucket ?? 'inneranimalmedia',
      fields.workspace_id ?? null,
      fields.tenant_id ?? null,
      fields.project_id ?? null,
      fields.scene_snapshot_id ?? null,
      Number(fields.progress_pct) || 0,
      fields.task_type ?? 'text-to-3d',
      fields.parent_task_id ?? null,
      fields.rig_task_id ?? null,
      Number(fields.credits_consumed) || 0,
      fields.model_formats != null ? JSON.stringify(fields.model_formats) : null,
      fields.texture_data != null ? JSON.stringify(fields.texture_data) : null,
    )
    .run();
}

/** UI rail / API aliases → Meshy OpenAPI task route key. */
const MESHY_TASK_TYPE_ALIASES = {
  'text-to-texture': 'retexture',
  texture: 'retexture',
  'post-process': 'remesh',
  image: 'text-to-image',
  print: 'remesh',
};

/**
 * Start a Meshy task and persist agentsam_cad_jobs row.
 * @param {any} env
 * @param {Request} authRequest
 * @param {{ id: string; tenant_id?: string }} authUser
 * @param {Record<string, unknown>} body
 * @param {string} taskType
 */
async function startMeshyCadJob(env, authRequest, authUser, body, taskType) {
  const normalized = MESHY_TASK_TYPE_ALIASES[taskType] || taskType;
  const op =
    taskType === 'print'
      ? 'remesh'
      : normalized === 'text-to-image'
        ? 'text-to-image'
        : normalized;

  if (isMeshyStubKey(env)) {
    return { stub: true, message: 'MESHYAI_API_KEY not configured' };
  }

  await checkMeshyBalanceForOperation(env, op, body);

  const scope = await resolveCadJobScope(env, authRequest, authUser, body);
  const inputTaskId = String(body.input_task_id || body.model_task_id || '').trim();
  const modelUrl = String(body.model_url || '').trim();

  /** @type {Record<string, unknown>} */
  let payload = {};

  if (normalized === 'retexture') {
    if (!inputTaskId && !modelUrl) throw new Error('input_task_id or model_url required');
    payload = {
      ...(inputTaskId ? { input_task_id: inputTaskId } : {}),
      ...(modelUrl ? { model_url: modelUrl } : {}),
      ...(body.texture_prompt || body.prompt
        ? { texture_prompt: String(body.texture_prompt || body.prompt) }
        : {}),
      ...(body.texture_image_url ? { texture_image_url: body.texture_image_url } : {}),
      enable_pbr: body.enable_pbr !== false,
    };
  } else if (normalized === 'remesh') {
    if (!inputTaskId && !modelUrl) throw new Error('input_task_id or model_url required');
    const isPrint = taskType === 'print';
    payload = {
      ...(inputTaskId ? { input_task_id: inputTaskId } : {}),
      ...(modelUrl ? { model_url: modelUrl } : {}),
      target_formats: body.target_formats || (isPrint ? ['stl', '3mf'] : ['glb']),
      topology: body.topology || 'triangle',
      target_polycount: body.target_polycount,
    };
  } else if (normalized === 'text-to-image') {
    const prompt = String(body.prompt || '').trim();
    if (!prompt) throw new Error('prompt required');
    payload = {
      ai_model: body.ai_model || 'nano-banana',
      prompt,
      aspect_ratio: body.aspect_ratio || '1:1',
      generate_multi_view: body.generate_multi_view === true,
      ...(body.pose_mode ? { pose_mode: body.pose_mode } : {}),
    };
  } else if (normalized === 'animation') {
    const rigTaskId = String(body.rig_task_id || '').trim();
    const actionId = Number(body.action_id);
    if (!rigTaskId || !Number.isFinite(actionId)) {
      throw new Error('rig_task_id and action_id required');
    }
    payload = { rig_task_id: rigTaskId, action_id: actionId };
  } else {
    throw new Error(`unsupported task_type: ${taskType}`);
  }

  const { task_id: externalTaskId, raw } = await createMeshyTask(env, normalized, payload);
  if (!externalTaskId) {
    throw new Error(`Meshy did not return task id for ${normalized}`);
  }

  const jobId = 'cadj_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  const promptLabel =
    String(body.prompt || body.texture_prompt || '').trim() ||
    (inputTaskId ? `${normalized}:${inputTaskId.slice(0, 8)}` : normalized);

  await insertMeshyCadJob(env, {
    id: jobId,
    user_id: authUser.id,
    session_id: scope.sessionId,
    engine: 'meshy',
    prompt: promptLabel,
    mode: normalized,
    status: 'pending',
    external_task_id: externalTaskId,
    parent_task_id: inputTaskId || String(body.rig_task_id || '') || null,
    workspace_id: scope.workspaceId,
    tenant_id: scope.tenantId,
    project_id: scope.projectId,
    scene_snapshot_id: scope.sceneSnapshotId,
    task_type: normalized,
    credits_consumed: estimateMeshyOperationCost(op, body),
    rig_task_id: body.rig_task_id ? String(body.rig_task_id) : null,
  });

  return {
    job_id: jobId,
    task_id: externalTaskId,
    external_task_id: externalTaskId,
    status: 'pending',
    phase: taskType,
    workspace_id: scope.workspaceId,
    meshy: raw,
  };
}

/**
 * @param {Request} request
 * @param {URL} url
 * @param {any} env
 * @param {any} ctx
 */
export async function handleCadMeshyApi(request, url, env, ctx) {
  const method = request.method.toUpperCase();
  const path = url.pathname.toLowerCase();
  const authRequest = bridgedToolRequest(request);

  const reqCtx = await resolveRequestContext(authRequest, env);
  if (reqCtx.error) return jsonResponse({ error: 'Unauthorized' }, 401);
  const authUser = { id: reqCtx.userId, tenant_id: reqCtx.tenantId };
  if (!env.DB) return jsonResponse({ error: 'Database not configured' }, 503);

  try {
    if (path === '/api/cad/meshy/balance' && method === 'GET') {
      if (isMeshyStubKey(env)) {
        return jsonResponse({
          balance: 0,
          stub: true,
          message: 'MESHYAI_API_KEY not configured',
        });
      }
      const { balance, raw } = await getBalance(env);
      return jsonResponse({ balance, raw });
    }

    if (path === '/api/cad/meshy/text-to-3d/preview' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (!body.prompt && !body.texture_prompt) {
        return jsonResponse({ error: 'prompt required' }, 400);
      }

      if (isMeshyStubKey(env)) {
        return jsonResponse({
          stub: true,
          message: 'MESHYAI_API_KEY not configured',
        });
      }

      try {
        await checkMeshyBalanceForOperation(env, 'text-to-3d-preview', body);
      } catch (e) {
        const mapped = meshyErrorResponseBody(e);
        return jsonResponse(mapped.body, mapped.status);
      }

      const scope = await resolveCadJobScope(env, authRequest, authUser, body);
      const { task_id: externalTaskId, raw } = await textTo3dPreview(env, body);
      if (!externalTaskId) {
        return jsonResponse({ error: 'Meshy did not return task id', meshy: raw }, 502);
      }

      const jobId = 'cadj_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
      await insertMeshyCadJob(env, {
        id: jobId,
        user_id: authUser.id,
        session_id: scope.sessionId,
        engine: 'meshy',
        prompt: String(body.prompt || ''),
        mode: 'text',
        status: 'pending',
        external_task_id: externalTaskId,
        workspace_id: scope.workspaceId,
        tenant_id: scope.tenantId,
        project_id: scope.projectId,
        scene_snapshot_id: scope.sceneSnapshotId,
        task_type: 'text-to-3d',
        credits_consumed: estimateTextTo3dPreviewCost(body),
      });

      return jsonResponse({
        job_id: jobId,
        task_id: externalTaskId,
        external_task_id: externalTaskId,
        phase: 'preview',
        status: 'pending',
        workspace_id: scope.workspaceId,
      });
    }

    if (path === '/api/cad/meshy/text-to-3d/refine' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const previewTaskId = String(body.preview_task_id || body.previewTaskId || '').trim();
      if (!previewTaskId) return jsonResponse({ error: 'preview_task_id required' }, 400);

      if (isMeshyStubKey(env)) {
        return jsonResponse({ stub: true, message: 'MESHYAI_API_KEY not configured' });
      }

      try {
        await checkMeshyBalance(env, MESHY_CREDIT_COSTS.TEXT_TO_3D_REFINE);
      } catch (e) {
        const mapped = meshyErrorResponseBody(e);
        return jsonResponse(mapped.body, mapped.status);
      }

      const scope = await resolveCadJobScope(env, authRequest, authUser, body);
      const { task_id: refineTaskId, raw } = await textTo3dRefine(env, {
        preview_task_id: previewTaskId,
        enable_pbr: body.enable_pbr !== false,
        texture_prompt: body.texture_prompt,
        texture_image_url: body.texture_image_url,
        ai_model: body.ai_model,
        target_formats: body.target_formats,
        remove_lighting: body.remove_lighting,
        moderation: body.moderation,
        auto_size: body.auto_size,
        origin_at: body.origin_at,
      });
      if (!refineTaskId) {
        return jsonResponse({ error: 'Meshy did not return refine task id', meshy: raw }, 502);
      }

      const jobId = 'cadj_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
      await insertMeshyCadJob(env, {
        id: jobId,
        user_id: authUser.id,
        session_id: scope.sessionId,
        engine: 'meshy',
        prompt: String(body.texture_prompt || body.prompt || ''),
        mode: 'text',
        status: 'pending',
        external_task_id: refineTaskId,
        parent_task_id: previewTaskId,
        workspace_id: scope.workspaceId,
        tenant_id: scope.tenantId,
        project_id: scope.projectId,
        scene_snapshot_id: scope.sceneSnapshotId,
        task_type: 'text-to-3d',
        credits_consumed: MESHY_CREDIT_COSTS.TEXT_TO_3D_REFINE,
      });

      return jsonResponse({
        job_id: jobId,
        task_id: refineTaskId,
        external_task_id: refineTaskId,
        preview_task_id: previewTaskId,
        phase: 'refine',
        status: 'pending',
        workspace_id: scope.workspaceId,
      });
    }

    const taskOneMatch = url.pathname.match(/^\/api\/cad\/meshy\/task\/([^/]+)$/i);
    if (taskOneMatch) {
      const taskId = taskOneMatch[1];
      const taskType = url.searchParams.get('type') || 'text-to-3d';

      if (method === 'GET') {
        if (isMeshyStubKey(env)) {
          return jsonResponse({ stub: true, task_id: taskId });
        }
        const task = await getMeshyTask(env, taskType, taskId);
        const applied = await applyMeshyTaskToCadJob(env, ctx, task);
        return jsonResponse({ task, cad: applied });
      }

      if (method === 'DELETE') {
        if (isMeshyStubKey(env)) {
          return jsonResponse({ ok: true, stub: true, task_id: taskId });
        }
        const deleted = await deleteMeshyTask(env, taskType, taskId);
        return jsonResponse({ ok: true, task_id: taskId, meshy: deleted });
      }
    }

    if (path === '/api/cad/meshy/tasks' && method === 'GET') {
      const taskType = url.searchParams.get('type') || 'text-to-3d';
      const pageNum = parseInt(url.searchParams.get('page_num') || '1', 10);
      const pageSize = Math.min(parseInt(url.searchParams.get('page_size') || '10', 10), 50);
      const sortBy = url.searchParams.get('sort_by') || '-created_at';

      if (isMeshyStubKey(env)) {
        return jsonResponse({ stub: true, tasks: [], page_num: pageNum, page_size: pageSize });
      }

      const tasks = await listMeshyTasks(env, taskType, {
        page_num: pageNum,
        page_size: pageSize,
        sort_by: sortBy,
      });
      return jsonResponse({ tasks, page_num: pageNum, page_size: pageSize, type: taskType });
    }

    if (path === '/api/cad/meshy/rigging' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const inputTaskId = String(body.input_task_id || body.model_task_id || '').trim();
      const modelUrl = String(body.model_url || '').trim();
      if (!inputTaskId && !modelUrl) {
        return jsonResponse({ error: 'input_task_id or model_url required' }, 400);
      }

      if (isMeshyStubKey(env)) {
        return jsonResponse({ stub: true, message: 'MESHYAI_API_KEY not configured' });
      }

      try {
        await checkMeshyBalanceForOperation(env, 'rigging', body);
      } catch (e) {
        const mapped = meshyErrorResponseBody(e);
        return jsonResponse(mapped.body, mapped.status);
      }

      const scope = await resolveCadJobScope(env, authRequest, authUser, body);
      const payload = {
        ...(inputTaskId ? { input_task_id: inputTaskId } : {}),
        ...(modelUrl ? { model_url: modelUrl } : {}),
        height_meters: Number(body.height_meters) > 0 ? Number(body.height_meters) : 1.7,
      };
      const { task_id: externalTaskId, raw } = await createMeshyTask(env, 'rigging', payload);
      if (!externalTaskId) {
        return jsonResponse({ error: 'Meshy did not return rigging task id', meshy: raw }, 502);
      }

      const jobId = 'cadj_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
      await insertMeshyCadJob(env, {
        id: jobId,
        user_id: authUser.id,
        session_id: scope.sessionId,
        engine: 'meshy',
        prompt: inputTaskId ? `rig:${inputTaskId}` : 'rig:model_url',
        mode: 'rig',
        status: 'pending',
        external_task_id: externalTaskId,
        parent_task_id: inputTaskId || null,
        workspace_id: scope.workspaceId,
        tenant_id: scope.tenantId,
        project_id: scope.projectId,
        scene_snapshot_id: scope.sceneSnapshotId,
        task_type: 'rigging',
        credits_consumed: MESHY_CREDIT_COSTS.RIGGING,
      });

      return jsonResponse({
        job_id: jobId,
        task_id: externalTaskId,
        external_task_id: externalTaskId,
        status: 'pending',
        phase: 'rigging',
        workspace_id: scope.workspaceId,
      });
    }

    if (path === '/api/cad/meshy/animations/library' && method === 'GET') {
      try {
        const res = await fetch('https://api.meshy.ai/web/public/animations/resources', {
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) return jsonResponse({ error: 'animation_library_unavailable' }, 502);
        const data = await res.json();
        return jsonResponse({ animations: data });
      } catch (e) {
        return jsonResponse({ error: String(e?.message || e) }, 502);
      }
    }

    if (path === '/api/cad/meshy/task' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const taskType = String(body.task_type || '').trim();
      if (!taskType) return jsonResponse({ error: 'task_type required' }, 400);

      if (isMeshyStubKey(env)) {
        const scope = await resolveCadJobScope(env, authRequest, authUser, body);
        const jobId = 'cadj_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
        await insertMeshyCadJob(env, {
          id: jobId,
          user_id: authUser.id,
          session_id: scope.sessionId,
          engine: 'meshy',
          prompt: String(body.prompt || taskType),
          mode: taskType,
          status: 'stub',
          workspace_id: scope.workspaceId,
          tenant_id: scope.tenantId,
          project_id: scope.projectId,
          scene_snapshot_id: scope.sceneSnapshotId,
          task_type: MESHY_TASK_TYPE_ALIASES[taskType] || taskType,
        });
        return jsonResponse({
          job_id: jobId,
          status: 'stub',
          message: 'Meshy API key not configured. Set MESHYAI_API_KEY on the Worker.',
        });
      }

      try {
        const result = await startMeshyCadJob(env, authRequest, authUser, body, taskType);
        return jsonResponse(result);
      } catch (e) {
        const mapped = meshyErrorResponseBody(e);
        if (mapped.status !== 500) return jsonResponse(mapped.body, mapped.status);
        return jsonResponse({ error: String(e?.message || e) }, 400);
      }
    }

    if (path === '/api/cad/meshy/generate' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const { prompt, mode = 'text', image_url, auto_refine = true } = body;
      if (!prompt && mode === 'text') return jsonResponse({ error: 'prompt required' }, 400);
      if (mode === 'image' && !image_url) {
        return jsonResponse({ error: 'image_url required for image mode' }, 400);
      }

      const scope = await resolveCadJobScope(env, authRequest, authUser, body);
      const jobId = 'cadj_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);

      if (isMeshyStubKey(env)) {
        await insertMeshyCadJob(env, {
          id: jobId,
          user_id: authUser.id,
          session_id: scope.sessionId,
          engine: 'meshy',
          prompt: prompt || '',
          mode,
          status: 'stub',
          workspace_id: scope.workspaceId,
          tenant_id: scope.tenantId,
          project_id: scope.projectId,
          scene_snapshot_id: scope.sceneSnapshotId,
          task_type: mode === 'image' ? 'image-to-3d' : 'text-to-3d',
        });
        return jsonResponse({
          job_id: jobId,
          status: 'stub',
          message:
            'Meshy API key not configured. Set MESHYAI_API_KEY via: wrangler versions secret put MESHYAI_API_KEY',
        });
      }

      try {
        const op = mode === 'image' ? 'image-to-3d' : 'text-to-3d';
        await checkMeshyBalanceForOperation(env, op, body);
      } catch (e) {
        const mapped = meshyErrorResponseBody(e);
        return jsonResponse(mapped.body, mapped.status);
      }

      let externalTaskId = null;
      let taskType = 'text-to-3d';
      let creditsConsumed = 0;
      let phase = 'preview';

      if (mode === 'image') {
        taskType = 'image-to-3d';
        phase = 'image-to-3d';
        const { createMeshyTask } = await import('../core/meshy-api.js');
        const created = await createMeshyTask(env, 'image-to-3d', {
          image_url,
          enable_pbr: body.enable_pbr !== false,
          should_texture: body.should_texture !== false,
          ai_model: body.ai_model,
          topology: body.topology,
          target_polycount: body.target_polycount,
          target_formats: body.target_formats,
          moderation: body.moderation,
        });
        externalTaskId = created.task_id;
        creditsConsumed = estimateImageTo3dCost(body);
      } else {
        const previewBody = {
          prompt,
          art_style: body.art_style || 'realistic',
          negative_prompt: body.negative_prompt || 'low quality, blurry',
          ai_model: body.ai_model,
          model_type: body.model_type,
          topology: body.topology,
          target_polycount: body.target_polycount,
          should_remesh: body.should_remesh,
          symmetry_mode: body.symmetry_mode,
          pose_mode: body.pose_mode,
          target_formats: body.target_formats,
          moderation: body.moderation,
          auto_size: body.auto_size,
          origin_at: body.origin_at,
        };
        const created = await textTo3dPreview(env, previewBody);
        externalTaskId = created.task_id;
        creditsConsumed = estimateTextTo3dPreviewCost(previewBody);
        if (auto_refine !== false) {
          // Refine is chained asynchronously when preview succeeds (meshy-cad-sync).
          phase = 'preview→refine';
        } else {
          phase = 'preview';
        }
      }

      if (!externalTaskId) {
        return jsonResponse({ error: 'Meshy did not return task id' }, 502);
      }

      await insertMeshyCadJob(env, {
        id: jobId,
        user_id: authUser.id,
        session_id: scope.sessionId,
        engine: 'meshy',
        prompt: prompt || '',
        mode,
        status: 'pending',
        external_task_id: externalTaskId,
        workspace_id: scope.workspaceId,
        tenant_id: scope.tenantId,
        project_id: scope.projectId,
        scene_snapshot_id: scope.sceneSnapshotId,
        task_type: taskType,
        credits_consumed: creditsConsumed,
        texture_data: mode === 'text' && auto_refine !== false ? { auto_refine: true } : null,
      });

      return jsonResponse({
        job_id: jobId,
        status: 'pending',
        external_task_id: externalTaskId,
        phase,
        auto_refine: mode === 'text' ? auto_refine !== false : false,
        estimated_full_cost: mode === 'text' ? estimateTextTo3dFullCost(body, { autoRefine: auto_refine !== false }) : creditsConsumed,
        workspace_id: scope.workspaceId,
      });
    }

    const statusMatch = url.pathname.match(/^\/api\/cad\/meshy\/status\/([^/]+)$/i);
    if (statusMatch && method === 'GET') {
      const jobId = statusMatch[1];
      const job = await env.DB.prepare(`SELECT * FROM agentsam_cad_jobs WHERE id = ? LIMIT 1`)
        .bind(jobId)
        .first();
      if (!job) return jsonResponse({ error: 'Job not found' }, 404);
      if (String(job.user_id) !== String(authUser.id)) {
        return jsonResponse({ error: 'Forbidden' }, 403);
      }

      if (['done', 'failed', 'stub'].includes(String(job.status))) {
        const publicUrl =
          job.r2_key && !String(job.r2_key).startsWith('b64:')
            ? buildCadAssetPublicUrl(job.r2_key)
            : job.result_url;
        return jsonResponse({
          job_id: jobId,
          status: job.status,
          result_url: job.result_url,
          public_url: publicUrl,
          r2_key: job.r2_key,
          error: job.error,
          progress_pct: job.progress_pct,
          task_type: job.task_type,
          parent_task_id: job.parent_task_id,
        });
      }

      if (isMeshyStubKey(env)) {
        return jsonResponse({ job_id: jobId, status: 'stub' });
      }

      if (!job.external_task_id) {
        return jsonResponse({ job_id: jobId, status: job.status });
      }

      const taskType = String(job.task_type || (job.mode === 'image' ? 'image-to-3d' : 'text-to-3d'));
      const task = await getMeshyTask(env, taskType, String(job.external_task_id));
      const applied = await applyMeshyTaskToCadJob(env, ctx, task);
      if (applied.ok && applied.status === 'failed') {
        return jsonResponse({
          job_id: jobId,
          status: 'failed',
          error: applied.error,
        });
      }
      if (applied.ok && applied.status === 'done') {
        return jsonResponse({
          job_id: jobId,
          status: 'done',
          result_url: applied.public_url,
          public_url: applied.public_url,
          r2_key: applied.r2_key,
          cms_asset: applied.cms_asset,
          progress_pct: 100,
        });
      }
      return jsonResponse({
        job_id: jobId,
        status: applied.status || job.status,
        progress: applied.progress,
        phase: applied.phase,
      });
    }

    return null;
  } catch (e) {
    const mapped = meshyErrorResponseBody(e);
    if (mapped.status !== 500) {
      return jsonResponse(mapped.body, mapped.status);
    }
    console.warn('[handleCadMeshyApi]', e?.message ?? e);
    return jsonResponse({ error: String(e?.message || e) }, 500);
  }
}

/**
 * In-process tool bridge — agent tools call without HTTP cookies.
 * @param {any} env
 * @param {any} ctx
 * @param {{ userId: string; tenantId?: string; workspaceId?: string }} auth
 * @param {Record<string, unknown>} body
 */
export async function meshyGenerateInProcess(env, ctx, auth, body = {}) {
  const fakeUrl = new URL('https://inneranimalmedia.com/api/cad/meshy/generate');
  const req = new Request(fakeUrl.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': String(auth.userId),
      ...(auth.tenantId ? { 'X-Tenant-Id': String(auth.tenantId) } : {}),
      ...(auth.workspaceId ? { 'X-Workspace-Id': String(auth.workspaceId) } : {}),
    },
    body: JSON.stringify(body),
  });
  // resolveRequestContext reads session; for tools use internal headers via prime auth
  await primeRequestAuthForTool(req, env, auth);
  const res = await handleCadMeshyApi(req, fakeUrl, env, ctx);
  if (!res) return { error: 'meshy generate handler missing' };
  return res.json();
}

/**
 * @param {any} env
 * @param {any} ctx
 * @param {{ userId: string; tenantId?: string; workspaceId?: string }} auth
 * @param {string} jobId
 */
export async function meshyStatusInProcess(env, ctx, auth, jobId) {
  const fakeUrl = new URL(`https://inneranimalmedia.com/api/cad/meshy/status/${encodeURIComponent(jobId)}`);
  const req = new Request(fakeUrl.toString(), {
    method: 'GET',
    headers: {
      'X-User-Id': String(auth.userId),
      ...(auth.tenantId ? { 'X-Tenant-Id': String(auth.tenantId) } : {}),
      ...(auth.workspaceId ? { 'X-Workspace-Id': String(auth.workspaceId) } : {}),
    },
  });
  await primeRequestAuthForTool(req, env, auth);
  const res = await handleCadMeshyApi(req, fakeUrl, env, ctx);
  if (!res) return { error: 'meshy status handler missing' };
  return res.json();
}
