/**
 * CAD pipelines: Meshy, OpenSCAD, Blender, job execute + runner completion.
 */
import { jsonResponse, verifyInternalApiSecret, resolveRequestContext } from '../core/auth.js';
import {
  decodeCadScriptPayload,
  resolveCadJobScope,
  buildCadExportR2Key,
  buildCadAssetPublicUrl,
} from '../core/cad-job-scope.js';
import { finalizeCadJobComplete } from '../core/cad-job-complete.js';
import {
  dispatchCadJob,
  probeCadComputeHealth,
  cadDispatchLabel,
  resolveCadDispatchTarget,
} from '../core/cad-dispatch.js';
import { handleCadMeshyApi } from './cad-meshy.js';
import { resolveModelForTask } from '../core/resolveModel.js';
import { dispatchComplete } from '../core/provider.js';

const OPENSCAD_BIN = '/opt/homebrew/bin/openscad';
const CAD_SCRIPT_TASK_TYPE = 'designstudio_cad_script';

const OPENSCAD_SYSTEM_PROMPT = `You are an OpenSCAD expert. Output ONLY valid OpenSCAD code.
No markdown fences, no explanation, no comments unless they are OpenSCAD inline comments.
The code must be immediately runnable with: openscad -o output.stl input.scad
Use parametric variables at the top. Make the model well-structured and printable.`;

const FREECAD_SYSTEM_PROMPT = `You are a FreeCAD Python API expert. Output ONLY a valid FreeCAD Python script for headless FreeCADCmd.
The script must:
- Use import FreeCAD, Part, Mesh, Import as needed
- Create or modify the requested geometry
- Export mesh to STL as "output.stl" in the current working directory using shape.exportStl("output.stl")
  (preferred for headless FreeCADCmd) or Mesh.export / document objects
  OR write /tmp/output.stl — required for viewport GLB ingest
- Use print() for progress messages
No markdown fences, no explanation. Pure Python only.`;

const BLENDER_SYSTEM_PROMPT = `You are a Blender Python API expert. Output ONLY a valid Blender Python script using bpy.
The script must:
- Clear the default scene (delete default cube)
- Create the requested geometry using bpy.ops or bpy.data
- Set up basic lighting
- Export to GLB: bpy.ops.export_scene.gltf(filepath=OUTPUT_GLB, export_format='GLB')
Use OUTPUT_GLB as the filepath variable defined at the top of the script.
No markdown, no explanation. Pure Python only.`;

function extractDispatchText(result) {
  if (!result) return '';
  if (typeof result === 'string') return result;
  return (
    result?.content?.[0]?.text ||
    result?.choices?.[0]?.message?.content ||
    result?.text ||
    result?.output_text ||
    ''
  );
}

function stripMarkdownFences(text) {
  return String(text || '')
    .replace(/^```[\w]*\n?/gm, '')
    .replace(/```$/gm, '')
    .trim();
}

function encodeCadScriptPayload(script) {
  const raw = String(script || '');
  if (!raw) return '';
  return raw.length > 4000 ? 'b64:' + btoa(unescape(encodeURIComponent(raw))) : raw;
}

/**
 * @param {any} env
 * @param {{
 *   authUser: { id: string, tenant_id?: string | null },
 *   scope: Awaited<ReturnType<typeof resolveCadJobScope>>,
 *   engine: string,
 *   prompt: string,
 *   systemPrompt: string,
 *   userContent: string,
 *   mode?: string,
 *   extraTextureData?: Record<string, unknown>,
 *   requestedModelKey?: string | null,
 *   maxScriptLen?: number,
 * }} opts
 */
async function generateCadScriptJob(env, opts) {
  const {
    authUser,
    scope,
    engine,
    prompt,
    systemPrompt,
    userContent,
    mode = 'text',
    extraTextureData = {},
    requestedModelKey = null,
    maxScriptLen = 8000,
  } = opts;

  const resolved = await resolveModelForTask(env, {
    task_type: CAD_SCRIPT_TASK_TYPE,
    mode: 'agent',
    workspace_id: scope.workspaceId,
    tenant_id: scope.tenantId,
    require_tools: false,
    ...(requestedModelKey ? { requested_model_key: String(requestedModelKey).trim() } : {}),
  });
  if (!resolved?.model_key) {
    return { error: 'model_resolve_empty', status: 503 };
  }

  let result;
  try {
    result = await dispatchComplete(env, {
      modelKey: resolved.model_key,
      taskType: CAD_SCRIPT_TASK_TYPE,
      systemPrompt,
      messages: [{ role: 'user', content: userContent }],
      userId: authUser.id,
      options: { maxOutputTokens: 4096, reasoningEffort: 'medium', verbosity: 'low' },
    });
  } catch (e) {
    return { error: String(e?.message || e), status: 502 };
  }

  const script = stripMarkdownFences(extractDispatchText(result)).slice(0, maxScriptLen);
  if (!script.trim()) {
    return { error: 'empty_script_generation', status: 502 };
  }

  const jobId = 'cadj_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  const scriptStored = encodeCadScriptPayload(script);
  const textureMeta = {
    ...extraTextureData,
    script_model_key: resolved.model_key,
    ...(resolved.routing_arm_id ? { script_routing_arm_id: resolved.routing_arm_id } : {}),
  };

  await insertCadJob(env, {
    id: jobId,
    user_id: authUser.id,
    session_id: scope.sessionId,
    engine,
    prompt,
    mode,
    status: 'script_ready',
    r2_key: scriptStored,
    workspace_id: scope.workspaceId,
    tenant_id: scope.tenantId,
    project_id: scope.projectId,
    scene_snapshot_id: scope.sceneSnapshotId,
  });

  if (Object.keys(textureMeta).length) {
    await env.DB.prepare(`UPDATE agentsam_cad_jobs SET texture_data = ? WHERE id = ?`)
      .bind(JSON.stringify(textureMeta), jobId)
      .run();
  }

  return {
    jobId,
    script,
    model_key: resolved.model_key,
    routing_arm_id: resolved.routing_arm_id ?? null,
    resolution_source: resolved.resolution_source ?? null,
  };
}

/**
 * @param {any} env
 * @param {Record<string, unknown>} fields
 */
async function insertCadJob(env, fields) {
  await env.DB.prepare(
    `INSERT INTO agentsam_cad_jobs (
       id, user_id, session_id, engine, prompt, mode, status,
       external_task_id, r2_key, r2_bucket, workspace_id, tenant_id,
       project_id, scene_snapshot_id, progress_pct, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())`,
  )
    .bind(
      fields.id,
      fields.user_id,
      fields.session_id ?? null,
      fields.engine,
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
    )
    .run();
}

export async function handleCadApi(request, url, env, ctx) {
  const method = request.method.toUpperCase();
  const path = url.pathname.toLowerCase();

  try {
    if (path === '/api/internal/cad/glb-upload' && method === 'POST') {
      if (!verifyInternalApiSecret(request, env)) {
        return jsonResponse({ error: 'Forbidden' }, 403);
      }
      if (!env.ASSETS) return jsonResponse({ error: 'ASSETS binding not configured' }, 503);

      const form = await request.formData().catch(() => null);
      if (!form) return jsonResponse({ error: 'multipart_required' }, 400);

      const file = form.get('file');
      const r2Key = String(form.get('r2_key') || '').trim().replace(/^\/+/, '');
      if (!file || typeof file === 'string' || !r2Key) {
        return jsonResponse({ error: 'file_and_r2_key_required' }, 400);
      }
      if (r2Key.includes('..')) {
        return jsonResponse({ error: 'invalid_r2_key' }, 400);
      }

      await env.ASSETS.put(r2Key, file.stream(), {
        httpMetadata: { contentType: 'model/gltf-binary' },
      });
      return jsonResponse({ ok: true, r2_key: r2Key, bucket: 'inneranimalmedia' });
    }

    if (path === '/api/internal/cad/job-complete' && method === 'POST') {
      if (!verifyInternalApiSecret(request, env)) {
        return jsonResponse({ error: 'Forbidden' }, 403);
      }
      const body = await request.json().catch(() => ({}));
      const result = await finalizeCadJobComplete(env, ctx, body);
      return jsonResponse(result);
    }

    const executeMatch = url.pathname.match(/^\/api\/cad\/jobs\/([^/]+)\/execute$/i);
    if (executeMatch && method === 'POST') {
      const reqCtx = await resolveRequestContext(request, env);
      if (reqCtx.error) return jsonResponse({ error: 'Unauthorized' }, 401);
      const authUser = { id: reqCtx.userId, tenant_id: reqCtx.tenantId };
      if (!env.DB) return jsonResponse({ error: 'Database not configured' }, 503);

      const jobId = executeMatch[1];
      const body = await request.json().catch(() => ({}));
      const job = await env.DB.prepare(`SELECT * FROM agentsam_cad_jobs WHERE id = ? LIMIT 1`)
        .bind(jobId)
        .first();
      if (!job) return jsonResponse({ error: 'Job not found' }, 404);
      if (String(job.user_id) !== String(authUser.id)) {
        return jsonResponse({ error: 'Forbidden' }, 403);
      }

      const runnable = ['script_ready', 'pending', 'failed'];
      if (!runnable.includes(String(job.status || ''))) {
        return jsonResponse(
          { error: 'job_not_executable', status: job.status },
          409,
        );
      }

      const scope = await resolveCadJobScope(env, request, authUser, body);
      if (!scope.workspaceId) {
        return jsonResponse({ error: 'WORKSPACE_CONTEXT_MISSING' }, 400);
      }

      await env.DB.prepare(
        `UPDATE agentsam_cad_jobs SET
           status = 'pending',
           workspace_id = ?,
           tenant_id = ?,
           project_id = COALESCE(?, project_id),
           scene_snapshot_id = COALESCE(?, scene_snapshot_id),
           progress_pct = 0,
           error = NULL,
           error_code = NULL,
           updated_at = unixepoch()
         WHERE id = ?`,
      )
        .bind(
          scope.workspaceId,
          scope.tenantId,
          scope.projectId,
          scope.sceneSnapshotId,
          jobId,
        )
        .run();

      const engine = String(job.engine || '').toLowerCase();
      const ptyEngines = new Set(['openscad', 'blender', 'freecad']);
      if (ptyEngines.has(engine)) {
        const dispatch = async () => {
          try {
            await dispatchCadJob(env, ctx, jobId, {
              userId: authUser.id,
              tenantId: scope.tenantId,
              workspaceId: scope.workspaceId,
            });
          } catch (e) {
            console.warn('[cad execute] dispatch failed:', e?.message ?? e);
            await finalizeCadJobComplete(env, ctx, {
              job_id: jobId,
              status: 'failed',
              error: String(e?.message || e).slice(0, 2000),
              error_code: 'cad_dispatch_failed',
              runner_host: 'execos-gcp',
            }).catch(() => null);
          }
        };
        if (ctx?.waitUntil) {
          ctx.waitUntil(dispatch());
        } else {
          await dispatch();
        }
        const dispatchTarget = resolveCadDispatchTarget(env);
        return jsonResponse({
          ok: true,
          job_id: jobId,
          status: 'running',
          workspace_id: scope.workspaceId,
          dispatch: dispatchTarget === 'container' ? 'container' : 'execos',
          dispatch_target: dispatchTarget,
          message:
            dispatchTarget === 'container'
              ? 'CAD job dispatched to IAM CAD worker container'
              : 'CAD job dispatched to ExecOS GCP (iam-tunnel)',
        });
      }

      return jsonResponse({
        ok: true,
        job_id: jobId,
        status: 'pending',
        workspace_id: scope.workspaceId,
        message: 'Job queued',
      });
    }

    if (path === '/api/cad/compute/health' && method === 'GET') {
      const reqCtx = await resolveRequestContext(request, env);
      if (reqCtx.error) return jsonResponse({ error: 'Unauthorized' }, 401);
      const health = await probeCadComputeHealth(env, {
        userId: reqCtx.userId,
        tenantId: reqCtx.tenantId,
        workspaceId: reqCtx.workspaceId,
      });
      return jsonResponse({ ok: true, ...health });
    }

    const jobOneMatch = url.pathname.match(/^\/api\/cad\/jobs\/([^/]+)$/i);
    if (jobOneMatch && method === 'GET') {
      const reqCtx = await resolveRequestContext(request, env);
      if (reqCtx.error) return jsonResponse({ error: 'Unauthorized' }, 401);
      const authUser = { id: reqCtx.userId, tenant_id: reqCtx.tenantId };
      if (!env.DB) return jsonResponse({ error: 'Database not configured' }, 503);

      const jobId = jobOneMatch[1];
      const job = await env.DB.prepare(`SELECT * FROM agentsam_cad_jobs WHERE id = ? LIMIT 1`)
        .bind(jobId)
        .first();
      if (!job) return jsonResponse({ error: 'Job not found' }, 404);
      if (String(job.user_id) !== String(authUser.id)) {
        return jsonResponse({ error: 'Forbidden' }, 403);
      }

      const publicUrl =
        job.r2_key && !String(job.r2_key).includes('\n') && !String(job.r2_key).startsWith('b64:')
          ? buildCadAssetPublicUrl(job.r2_key)
          : job.result_url;

      return jsonResponse({
        job: {
          ...job,
          public_url: publicUrl,
        },
      });
    }

    if (path.startsWith('/api/cad/meshy')) {
      const meshyRes = await handleCadMeshyApi(request, url, env, ctx);
      if (meshyRes) return meshyRes;
    }

    if (path === '/api/cad/openscad/generate' && method === 'POST') {
      const reqCtx = await resolveRequestContext(request, env);
      if (reqCtx.error) return jsonResponse({ error: 'Unauthorized' }, 401);
      const authUser = { id: reqCtx.userId, tenant_id: reqCtx.tenantId };
      if (!env.DB) return jsonResponse({ error: 'Database not configured' }, 503);

      const body = await request.json().catch(() => ({}));
      const { prompt, model_key: requestedModelKey } = body;
      if (!prompt) return jsonResponse({ error: 'prompt required' }, 400);

      const scope = await resolveCadJobScope(env, request, authUser, body);
      const generated = await generateCadScriptJob(env, {
        authUser,
        scope,
        engine: 'openscad',
        prompt,
        systemPrompt: OPENSCAD_SYSTEM_PROMPT,
        userContent: `Create an OpenSCAD model: ${prompt}`,
        requestedModelKey: requestedModelKey ?? null,
      });
      if (generated.error) {
        return jsonResponse({ error: generated.error }, generated.status || 500);
      }

      return jsonResponse({
        job_id: generated.jobId,
        script: generated.script,
        status: 'script_ready',
        engine: 'openscad',
        model_key: generated.model_key,
        routing_arm_id: generated.routing_arm_id,
        openscad_bin: OPENSCAD_BIN,
        next_step: 'POST /api/cad/jobs/{job_id}/execute',
      });
    }

    if (path === '/api/cad/freecad/script' && method === 'POST') {
      const reqCtx = await resolveRequestContext(request, env);
      if (reqCtx.error) return jsonResponse({ error: 'Unauthorized' }, 401);
      const authUser = { id: reqCtx.userId, tenant_id: reqCtx.tenantId };
      if (!env.DB) return jsonResponse({ error: 'Database not configured' }, 503);

      const body = await request.json().catch(() => ({}));
      const { prompt, input_url, model_key: requestedModelKey } = body;
      if (!prompt) return jsonResponse({ error: 'prompt required' }, 400);

      const scope = await resolveCadJobScope(env, request, authUser, body);
      const inputUrl = input_url != null ? String(input_url).trim() : '';
      const generated = await generateCadScriptJob(env, {
        authUser,
        scope,
        engine: 'freecad',
        prompt,
        systemPrompt: FREECAD_SYSTEM_PROMPT,
        userContent: `Create a FreeCAD Python script for: ${prompt}${
          inputUrl ? `\nInput file URL (optional load): ${inputUrl.slice(0, 500)}` : ''
        }`,
        extraTextureData: inputUrl ? { input_url: inputUrl } : {},
        requestedModelKey: requestedModelKey ?? null,
      });
      if (generated.error) {
        return jsonResponse({ error: generated.error }, generated.status || 500);
      }

      return jsonResponse({
        job_id: generated.jobId,
        script: generated.script,
        status: 'script_ready',
        engine: 'freecad',
        model_key: generated.model_key,
        routing_arm_id: generated.routing_arm_id,
        next_step: 'POST /api/cad/jobs/{job_id}/execute',
      });
    }

    if (path === '/api/cad/freecad/execute' && method === 'POST') {
      const reqCtx = await resolveRequestContext(request, env);
      if (reqCtx.error) return jsonResponse({ error: 'Unauthorized' }, 401);
      const authUser = { id: reqCtx.userId, tenant_id: reqCtx.tenantId };
      if (!env.DB) return jsonResponse({ error: 'Database not configured' }, 503);

      const body = await request.json().catch(() => ({}));
      const script = String(body.script || '').trim();
      if (!script) return jsonResponse({ error: 'script required' }, 400);

      const scope = await resolveCadJobScope(env, request, authUser, body);
      if (!scope.workspaceId) {
        return jsonResponse({ error: 'WORKSPACE_CONTEXT_MISSING' }, 400);
      }

      const jobId = 'cadj_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
      const scriptStored =
        script.length > 4000 ? 'b64:' + btoa(unescape(encodeURIComponent(script))) : script;
      const inputUrl = body.input_url != null ? String(body.input_url).trim() : null;

      await insertCadJob(env, {
        id: jobId,
        user_id: authUser.id,
        session_id: scope.sessionId,
        engine: 'freecad',
        prompt: script.slice(0, 200),
        mode: 'script',
        status: 'pending',
        r2_key: scriptStored,
        workspace_id: scope.workspaceId,
        tenant_id: scope.tenantId,
        project_id: scope.projectId,
        scene_snapshot_id: scope.sceneSnapshotId,
      });

      if (inputUrl) {
        await env.DB.prepare(
          `UPDATE agentsam_cad_jobs SET texture_data = ? WHERE id = ?`,
        )
          .bind(JSON.stringify({ input_url: inputUrl }), jobId)
          .run();
      }

      const dispatch = async () => {
        try {
          const result = await dispatchCadJob(env, ctx, jobId, {
            userId: authUser.id,
            tenantId: scope.tenantId,
            workspaceId: scope.workspaceId,
          });
          if (!result?.ok) {
            throw new Error(result?.error || 'freecad_dispatch_failed');
          }
        } catch (e) {
          console.warn('[cad freecad] dispatch failed:', e?.message ?? e);
          await finalizeCadJobComplete(env, ctx, {
            job_id: jobId,
            status: 'failed',
            error: String(e?.message || e).slice(0, 2000),
            error_code: 'freecad_dispatch_failed',
            runner_host: 'execos-gcp',
          }).catch(() => null);
        }
      };
      if (ctx?.waitUntil) {
        ctx.waitUntil(dispatch());
      } else {
        await dispatch();
      }

      const dispatchTarget = resolveCadDispatchTarget(env);
      return jsonResponse({
        ok: true,
        job_id: jobId,
        status: 'running',
        engine: 'freecad',
        dispatch: dispatchTarget === 'container' ? 'container' : 'execos',
        dispatch_target: dispatchTarget,
        message: cadDispatchLabel({ dispatch: dispatchTarget === 'container' ? 'container' : 'execos' }),
      });
    }

    if (path === '/api/cad/blender/script' && method === 'POST') {
      const reqCtx = await resolveRequestContext(request, env);
      if (reqCtx.error) return jsonResponse({ error: 'Unauthorized' }, 401);
      const authUser = { id: reqCtx.userId, tenant_id: reqCtx.tenantId };
      if (!env.DB) return jsonResponse({ error: 'Database not configured' }, 503);

      const body = await request.json().catch(() => ({}));
      const { prompt, scene_json, model_key: requestedModelKey } = body;
      if (!prompt) return jsonResponse({ error: 'prompt required' }, 400);

      const scope = await resolveCadJobScope(env, request, authUser, body);
      const generated = await generateCadScriptJob(env, {
        authUser,
        scope,
        engine: 'blender',
        prompt,
        systemPrompt: BLENDER_SYSTEM_PROMPT,
        userContent: `Create a Blender script for: ${prompt}${
          scene_json ? '\nExisting scene: ' + JSON.stringify(scene_json).slice(0, 500) : ''
        }`,
        requestedModelKey: requestedModelKey ?? null,
      });
      if (generated.error) {
        return jsonResponse({ error: generated.error }, generated.status || 500);
      }

      return jsonResponse({
        job_id: generated.jobId,
        script: generated.script,
        status: 'script_ready',
        engine: 'blender',
        model_key: generated.model_key,
        routing_arm_id: generated.routing_arm_id,
        next_step: 'POST /api/cad/jobs/{job_id}/execute',
      });
    }

    if (path === '/api/cad/jobs' && method === 'GET') {
      const reqCtx = await resolveRequestContext(request, env);
      if (reqCtx.error) return jsonResponse({ error: 'Unauthorized' }, 401);
      const authUser = { id: reqCtx.userId, tenant_id: reqCtx.tenantId };
      if (!env.DB) return jsonResponse({ error: 'Database not configured' }, 503);

      const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);
      const { results } = await env.DB.prepare(
        `SELECT id, engine, prompt, mode, status, result_url, r2_key, r2_bucket, error,
                workspace_id, tenant_id, project_id, scene_snapshot_id, progress_pct,
                created_at, updated_at
         FROM agentsam_cad_jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
      )
        .bind(authUser.id, limit)
        .all();

      const jobs = (results || []).map((row) => ({
        ...row,
        public_url:
          row.r2_key && !String(row.r2_key).startsWith('b64:')
            ? buildCadAssetPublicUrl(row.r2_key)
            : row.result_url,
      }));

      return jsonResponse({ jobs });
    }

    return jsonResponse({ error: 'Not found' }, 404);
  } catch (e) {
    console.warn('[handleCadApi]', e?.message ?? e);
    return jsonResponse({ error: String(e?.message || e) }, 500);
  }
}
