/**
 * CAD pipelines: Meshy, OpenSCAD (Worker generates script), Blender Python script.
 */
import { getAuthUser, jsonResponse } from '../core/auth.js';

const MESHY_BASE = 'https://api.meshy.ai/openapi/v2';
const OPENSCAD_BIN = '/opt/homebrew/bin/openscad';

function isStubKey(key) {
  return !key || key.startsWith('sk-meshy-stub') || key === 'stub';
}

export async function handleCadApi(request, url, env, ctx) {
  const method = request.method.toUpperCase();
  const path = url.pathname.toLowerCase();

  try {
    if (path === '/api/cad/meshy/generate' && method === 'POST') {
      const authUser = await getAuthUser(request, env);
      if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

      if (!env.DB) {
        return jsonResponse({ error: 'Database not configured' }, 503);
      }

      const body = await request.json().catch(() => ({}));
      const { prompt, mode = 'text', session_id, image_url } = body;
      if (!prompt && mode === 'text') return jsonResponse({ error: 'prompt required' }, 400);
      if (mode === 'image' && !image_url) return jsonResponse({ error: 'image_url required for image mode' }, 400);

      const jobId = 'cadj_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);

      if (isStubKey(env.MESHYAI_API_KEY)) {
        await env.DB.prepare(`
          INSERT INTO agentsam_cad_jobs (id, user_id, session_id, engine, prompt, mode, status, created_at, updated_at)
          VALUES (?, ?, ?, 'meshy', ?, ?, 'stub', unixepoch(), unixepoch())
        `).bind(jobId, authUser.id, session_id || null, prompt || '', mode).run();

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

      await env.DB.prepare(`
        INSERT INTO agentsam_cad_jobs
          (id, user_id, session_id, engine, prompt, mode, status, external_task_id, created_at, updated_at)
        VALUES (?, ?, ?, 'meshy', ?, ?, 'pending', ?, unixepoch(), unixepoch())
      `).bind(jobId, authUser.id, session_id || null, prompt || '', mode, externalTaskId).run();

      return jsonResponse({ job_id: jobId, status: 'pending', external_task_id: externalTaskId });
    }

    const statusMatch = url.pathname.match(/^\/api\/cad\/meshy\/status\/([^/]+)$/i);
    if (statusMatch && method === 'GET') {
      const authUser = await getAuthUser(request, env);
      if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

      if (!env.DB) {
        return jsonResponse({ error: 'Database not configured' }, 503);
      }

      const jobId = statusMatch[1];
      const job = await env.DB.prepare('SELECT * FROM agentsam_cad_jobs WHERE id = ?').bind(jobId).first();
      if (!job) return jsonResponse({ error: 'Job not found' }, 404);

      if (['done', 'failed', 'stub'].includes(job.status)) {
        return jsonResponse({ job_id: jobId, status: job.status, result_url: job.result_url, error: job.error });
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

      const statusMap = { PENDING: 'pending', IN_PROGRESS: 'running', SUCCEEDED: 'done', FAILED: 'failed' };
      const newStatus = statusMap[pollData.status] || job.status;

      if (newStatus === 'done') {
        const glbUrl = pollData.model_urls?.glb || pollData.model_url || null;
        await env.DB.prepare(`
          UPDATE agentsam_cad_jobs SET status='done', result_url=?, updated_at=unixepoch() WHERE id=?
        `).bind(glbUrl, jobId).run();
        return jsonResponse({ job_id: jobId, status: 'done', result_url: glbUrl });
      }

      if (newStatus === 'failed') {
        const errMsg = pollData.message || pollData.error || 'Meshy generation failed';
        await env.DB.prepare(`
          UPDATE agentsam_cad_jobs SET status='failed', error=?, updated_at=unixepoch() WHERE id=?
        `).bind(errMsg, jobId).run();
        return jsonResponse({ job_id: jobId, status: 'failed', error: errMsg });
      }

      return jsonResponse({ job_id: jobId, status: newStatus, progress: pollData.progress || null });
    }

    if (path === '/api/cad/openscad/generate' && method === 'POST') {
      const authUser = await getAuthUser(request, env);
      if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

      if (!env.ANTHROPIC_API_KEY) {
        return jsonResponse({ error: 'ANTHROPIC_API_KEY not configured' }, 503);
      }
      if (!env.DB) {
        return jsonResponse({ error: 'Database not configured' }, 503);
      }

      const body = await request.json().catch(() => ({}));
      const { prompt, session_id } = body;
      if (!prompt) return jsonResponse({ error: 'prompt required' }, 400);

      const jobId = 'cadj_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);

      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 4096,
          system: `You are an OpenSCAD expert. Output ONLY valid OpenSCAD code.
No markdown fences, no explanation, no comments unless they are OpenSCAD inline comments.
The code must be immediately runnable with: openscad --export-format asciistl -o output.stl script.scad
Use parametric variables at the top. Make the model well-structured and printable.`,
          messages: [{ role: 'user', content: `Create an OpenSCAD model: ${prompt}` }],
        }),
      });

      if (!aiRes.ok) return jsonResponse({ error: 'AI service error' }, 502);
      const aiData = await aiRes.json();
      const script = aiData.content?.[0]?.text || '';

      const scriptStored =
        script.length > 4000 ? 'b64:' + btoa(unescape(encodeURIComponent(script))) : script;

      await env.DB.prepare(`
        INSERT INTO agentsam_cad_jobs
          (id, user_id, session_id, engine, prompt, mode, status, r2_key, created_at, updated_at)
        VALUES (?, ?, ?, 'openscad', ?, 'text', 'done', ?, unixepoch(), unixepoch())
      `).bind(jobId, authUser.id, session_id || null, prompt, scriptStored).run();

      return jsonResponse({
        job_id: jobId,
        script,
        status: 'done',
        engine: 'openscad',
        openscad_bin: OPENSCAD_BIN,
      });
    }

    if (path === '/api/cad/blender/script' && method === 'POST') {
      const authUser = await getAuthUser(request, env);
      if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

      if (!env.ANTHROPIC_API_KEY) {
        return jsonResponse({ error: 'ANTHROPIC_API_KEY not configured' }, 503);
      }
      if (!env.DB) {
        return jsonResponse({ error: 'Database not configured' }, 503);
      }

      const body = await request.json().catch(() => ({}));
      const { prompt, scene_json, session_id } = body;
      if (!prompt) return jsonResponse({ error: 'prompt required' }, 400);

      const jobId = 'cadj_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);

      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 4096,
          system: `You are a Blender Python API expert. Output ONLY a valid Blender Python script using bpy.
The script must:
- Clear the default scene (delete default cube)
- Create the requested geometry using bpy.ops or bpy.data
- Set up basic lighting
- Export to GLB: bpy.ops.export_scene.gltf(filepath='/tmp/output.glb', export_format='GLB')
No markdown, no explanation. Pure Python only. The script runs headless: blender --background --python script.py`,
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

      await env.DB.prepare(`
        INSERT INTO agentsam_cad_jobs
          (id, user_id, session_id, engine, prompt, mode, status, r2_key, created_at, updated_at)
        VALUES (?, ?, ?, 'blender', ?, 'text', 'script_ready', ?, unixepoch(), unixepoch())
      `).bind(jobId, authUser.id, session_id || null, prompt, script.slice(0, 4000)).run();

      return jsonResponse({
        job_id: jobId,
        script,
        status: 'script_ready',
        engine: 'blender',
        run_command: 'blender --background --python script.py',
        note: 'Run this script locally via your PTY terminal, then upload the output GLB to R2',
      });
    }

    if (path === '/api/cad/jobs' && method === 'GET') {
      const authUser = await getAuthUser(request, env);
      if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

      if (!env.DB) {
        return jsonResponse({ error: 'Database not configured' }, 503);
      }

      const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);
      const { results } = await env.DB.prepare(`
        SELECT id, engine, prompt, mode, status, result_url, error, created_at, updated_at
        FROM agentsam_cad_jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
      `).bind(authUser.id, limit).all();

      return jsonResponse({ jobs: results || [] });
    }

    return jsonResponse({ error: 'Not found' }, 404);
  } catch (e) {
    console.warn('[handleCadApi]', e?.message ?? e);
    return jsonResponse({ error: String(e?.message || e) }, 500);
  }
}
