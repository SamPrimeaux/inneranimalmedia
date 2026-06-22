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
import { applyMeshyTaskToCadJob } from '../core/meshy-cad-sync.js';

const MESHY_BASE = 'https://api.meshy.ai/openapi/v2';
const OPENSCAD_BIN = '/opt/homebrew/bin/openscad';

function isStubKey(key) {
  return !key || key.startsWith('sk-meshy-stub') || key === 'stub';
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

      return jsonResponse({
        ok: true,
        job_id: jobId,
        status: 'pending',
        workspace_id: scope.workspaceId,
        message: 'Job queued for CAD runner',
      });
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

    if (path === '/api/cad/meshy/generate' && method === 'POST') {
      const reqCtx = await resolveRequestContext(request, env);
      if (reqCtx.error) return jsonResponse({ error: 'Unauthorized' }, 401);
      const authUser = { id: reqCtx.userId, tenant_id: reqCtx.tenantId };
      if (!env.DB) return jsonResponse({ error: 'Database not configured' }, 503);

      const body = await request.json().catch(() => ({}));
      const { prompt, mode = 'text', image_url } = body;
      if (!prompt && mode === 'text') return jsonResponse({ error: 'prompt required' }, 400);
      if (mode === 'image' && !image_url) return jsonResponse({ error: 'image_url required for image mode' }, 400);

      const scope = await resolveCadJobScope(env, request, authUser, body);
      const jobId = 'cadj_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);

      if (isStubKey(env.MESHYAI_API_KEY)) {
        await insertCadJob(env, {
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
        });
        return jsonResponse({
          job_id: jobId,
          status: 'stub',
          message: 'Meshy API key not configured. Set MESHYAI_API_KEY via: wrangler versions secret put MESHYAI_API_KEY',
        });
      }

      const meshyEndpoint = mode === 'image' ? `${MESHY_BASE}/image-to-3d` : `${MESHY_BASE}/text-to-3d`;
      const meshyBody =
        mode === 'image'
          ? { image_url, enable_pbr: true }
          : { mode: 'preview', prompt, art_style: 'realistic', negative_prompt: 'low quality, blurry' };

      const meshyRes = await fetch(meshyEndpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.MESHYAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(meshyBody),
      });

      if (!meshyRes.ok) {
        const errText = await meshyRes.text();
        console.warn('[cad/meshy] API error:', meshyRes.status, errText.slice(0, 200));
        return jsonResponse({ error: `Meshy API error: ${meshyRes.status}` }, 502);
      }

      const meshyData = await meshyRes.json();
      const externalTaskId = meshyData.result || meshyData.id || null;

      await insertCadJob(env, {
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
      });

      return jsonResponse({
        job_id: jobId,
        status: 'pending',
        external_task_id: externalTaskId,
        workspace_id: scope.workspaceId,
      });
    }

    const statusMatch = url.pathname.match(/^\/api\/cad\/meshy\/status\/([^/]+)$/i);
    if (statusMatch && method === 'GET') {
      const reqCtx = await resolveRequestContext(request, env);
      if (reqCtx.error) return jsonResponse({ error: 'Unauthorized' }, 401);
      const authUser = { id: reqCtx.userId, tenant_id: reqCtx.tenantId };
      if (!env.DB) return jsonResponse({ error: 'Database not configured' }, 503);

      const jobId = statusMatch[1];
      const job = await env.DB.prepare(`SELECT * FROM agentsam_cad_jobs WHERE id = ? LIMIT 1`)
        .bind(jobId)
        .first();
      if (!job) return jsonResponse({ error: 'Job not found' }, 404);

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
        });
      }

      if (isStubKey(env.MESHYAI_API_KEY)) {
        return jsonResponse({ job_id: jobId, status: 'stub' });
      }

      if (!job.external_task_id) {
        return jsonResponse({ job_id: jobId, status: job.status });
      }

      const endpoint =
        job.mode === 'image'
          ? `${MESHY_BASE}/image-to-3d/${job.external_task_id}`
          : `${MESHY_BASE}/text-to-3d/${job.external_task_id}`;

      const pollRes = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${env.MESHYAI_API_KEY}` },
      });

      if (!pollRes.ok) {
        return jsonResponse({ job_id: jobId, status: 'running', message: 'Poll failed' });
      }

      const pollData = await pollRes.json();
      const applied = await applyMeshyTaskToCadJob(env, ctx, pollData);
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
      });
    }

    if (path === '/api/cad/openscad/generate' && method === 'POST') {
      const reqCtx = await resolveRequestContext(request, env);
      if (reqCtx.error) return jsonResponse({ error: 'Unauthorized' }, 401);
      const authUser = { id: reqCtx.userId, tenant_id: reqCtx.tenantId };
      if (!env.ANTHROPIC_API_KEY) return jsonResponse({ error: 'ANTHROPIC_API_KEY not configured' }, 503);
      if (!env.DB) return jsonResponse({ error: 'Database not configured' }, 503);

      const body = await request.json().catch(() => ({}));
      const { prompt } = body;
      if (!prompt) return jsonResponse({ error: 'prompt required' }, 400);

      const scope = await resolveCadJobScope(env, request, authUser, body);
      const jobId = 'cadj_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);

      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
          system: `You are an OpenSCAD expert. Output ONLY valid OpenSCAD code.
No markdown fences, no explanation, no comments unless they are OpenSCAD inline comments.
The code must be immediately runnable with: openscad -o output.stl input.scad
Use parametric variables at the top. Make the model well-structured and printable.`,
          messages: [{ role: 'user', content: `Create an OpenSCAD model: ${prompt}` }],
        }),
      });

      if (!aiRes.ok) return jsonResponse({ error: 'AI service error' }, 502);
      const aiData = await aiRes.json();
      const script = aiData.content?.[0]?.text || '';
      const scriptStored =
        script.length > 4000 ? 'b64:' + btoa(unescape(encodeURIComponent(script))) : script;

      await insertCadJob(env, {
        id: jobId,
        user_id: authUser.id,
        session_id: scope.sessionId,
        engine: 'openscad',
        prompt,
        mode: 'text',
        status: 'script_ready',
        r2_key: scriptStored,
        workspace_id: scope.workspaceId,
        tenant_id: scope.tenantId,
        project_id: scope.projectId,
        scene_snapshot_id: scope.sceneSnapshotId,
      });

      return jsonResponse({
        job_id: jobId,
        script,
        status: 'script_ready',
        engine: 'openscad',
        openscad_bin: OPENSCAD_BIN,
        next_step: 'POST /api/cad/jobs/{job_id}/execute',
      });
    }

    if (path === '/api/cad/blender/script' && method === 'POST') {
      const reqCtx = await resolveRequestContext(request, env);
      if (reqCtx.error) return jsonResponse({ error: 'Unauthorized' }, 401);
      const authUser = { id: reqCtx.userId, tenant_id: reqCtx.tenantId };
      if (!env.ANTHROPIC_API_KEY) return jsonResponse({ error: 'ANTHROPIC_API_KEY not configured' }, 503);
      if (!env.DB) return jsonResponse({ error: 'Database not configured' }, 503);

      const body = await request.json().catch(() => ({}));
      const { prompt, scene_json } = body;
      if (!prompt) return jsonResponse({ error: 'prompt required' }, 400);

      const scope = await resolveCadJobScope(env, request, authUser, body);
      const jobId = 'cadj_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);

      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
          system: `You are a Blender Python API expert. Output ONLY a valid Blender Python script using bpy.
The script must:
- Clear the default scene (delete default cube)
- Create the requested geometry using bpy.ops or bpy.data
- Set up basic lighting
- Export to GLB: bpy.ops.export_scene.gltf(filepath=OUTPUT_GLB, export_format='GLB')
Use OUTPUT_GLB as the filepath variable defined at the top of the script.
No markdown, no explanation. Pure Python only.`,
          messages: [
            {
              role: 'user',
              content: `Create a Blender script for: ${prompt}${scene_json ? '\nExisting scene: ' + JSON.stringify(scene_json).slice(0, 500) : ''}`,
            },
          ],
        }),
      });

      if (!aiRes.ok) return jsonResponse({ error: 'AI service error' }, 502);
      const aiData = await aiRes.json();
      const script = aiData.content?.[0]?.text || '';
      const scriptStored =
        script.length > 4000 ? 'b64:' + btoa(unescape(encodeURIComponent(script))) : script.slice(0, 8000);

      await insertCadJob(env, {
        id: jobId,
        user_id: authUser.id,
        session_id: scope.sessionId,
        engine: 'blender',
        prompt,
        mode: 'text',
        status: 'script_ready',
        r2_key: scriptStored,
        workspace_id: scope.workspaceId,
        tenant_id: scope.tenantId,
        project_id: scope.projectId,
        scene_snapshot_id: scope.sceneSnapshotId,
      });

      return jsonResponse({
        job_id: jobId,
        script,
        status: 'script_ready',
        engine: 'blender',
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
