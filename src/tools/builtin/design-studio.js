import {
  cadEngineSystemPrompt,
  cancelCadJobForUser,
  generateCadScriptJob,
} from '../../api/cad.js';

function scopeFromContext(params, runContext) {
  const userId = String(runContext.userId ?? runContext.user_id ?? params.user_id ?? '').trim();
  const workspaceId = String(
    runContext.workspaceId ?? runContext.workspace_id ?? params.workspace_id ?? '',
  ).trim();
  const tenantId = String(
    runContext.tenantId ?? runContext.tenant_id ?? params.tenant_id ?? '',
  ).trim();
  if (!userId || !workspaceId || !tenantId) {
    throw new Error('Design Studio tool requires authenticated user, workspace, and tenant scope');
  }
  return {
    userId,
    workspaceId,
    tenantId,
    sessionId: String(
      runContext.sessionId ?? runContext.session_id ?? params.session_id ?? '',
    ).trim() || null,
    projectId: String(params.project_id ?? params.blueprint_id ?? '').trim() || null,
    sceneSnapshotId:
      String(params.scene_snapshot_id ?? params.scene_id ?? '').trim() || null,
  };
}

async function listScenes(params, env, runContext) {
  const scope = scopeFromContext(params, runContext);
  const limit = Math.min(Math.max(Number(params.limit) || 20, 1), 50);
  const { results } = await env.DB.prepare(
    `SELECT id, name, project_type, entity_count, public_url, thumbnail_url,
            description, tags, version, project_id, glb_r2_key, cad_job_id,
            style_preset, updated_at
     FROM scene_snapshots
     WHERE user_id = ? AND workspace_id = ? AND is_autosave = 0
     ORDER BY updated_at DESC
     LIMIT ?`,
  )
    .bind(scope.userId, scope.workspaceId, limit)
    .all();
  return { scenes: results || [], count: results?.length || 0 };
}

async function listAssets(params, env, runContext) {
  const scope = scopeFromContext(params, runContext);
  const limit = Math.min(Math.max(Number(params.limit) || 30, 1), 50);
  const { results } = await env.DB.prepare(
    `SELECT id, filename, tags, public_url, thumbnail_url, metadata, category, created_at
     FROM cms_assets
     WHERE is_live = 1
       AND (category = '3d_studio' OR (category = '3d_studio_user' AND created_by = ?))
     ORDER BY created_at DESC
     LIMIT ?`,
  )
    .bind(scope.userId, limit)
    .all();
  return { assets: results || [], count: results?.length || 0 };
}

async function cadJobStatus(params, env, runContext) {
  const scope = scopeFromContext(params, runContext);
  const jobId = String(params.job_id ?? params.id ?? '').trim();
  const limit = Math.min(Math.max(Number(params.limit) || 10, 1), 20);
  const fields = `id AS job_id, engine, prompt, mode, status, progress_pct, public_url,
                  result_url, task_type, external_task_id, parent_task_id, rig_task_id,
                  model_formats, scene_snapshot_id, created_at, updated_at, finished_at`;
  if (jobId) {
    const job = await env.DB.prepare(
      `SELECT ${fields}
       FROM agentsam_cad_jobs
       WHERE id = ? AND user_id = ? AND workspace_id = ? AND tenant_id = ?
       LIMIT 1`,
    )
      .bind(jobId, scope.userId, scope.workspaceId, scope.tenantId)
      .first();
    return job ? { job } : { error: 'CAD job not found' };
  }
  const { results } = await env.DB.prepare(
    `SELECT ${fields}
     FROM agentsam_cad_jobs
     WHERE user_id = ? AND workspace_id = ? AND tenant_id = ?
     ORDER BY updated_at DESC
     LIMIT ?`,
  )
    .bind(scope.userId, scope.workspaceId, scope.tenantId, limit)
    .all();
  return { jobs: results || [], count: results?.length || 0 };
}

async function cadJobCancel(params, env, runContext) {
  const scope = scopeFromContext(params, runContext);
  const jobId = String(params.job_id ?? params.id ?? '').trim();
  if (!jobId) return { error: 'job_id required' };
  const owned = await env.DB.prepare(
    `SELECT id FROM agentsam_cad_jobs
     WHERE id = ? AND user_id = ? AND workspace_id = ? AND tenant_id = ?
     LIMIT 1`,
  )
    .bind(jobId, scope.userId, scope.workspaceId, scope.tenantId)
    .first();
  if (!owned) return { error: 'CAD job not found' };
  return cancelCadJobForUser(
    env,
    { id: scope.userId, tenant_id: scope.tenantId },
    jobId,
  );
}

async function cadGenerate(params, env, runContext) {
  const scope = scopeFromContext(params, runContext);
  const engine = String(params.engine || '').trim().toLowerCase();
  if (!['openscad', 'freecad', 'blender'].includes(engine)) {
    return { error: 'engine must be openscad, freecad, or blender' };
  }
  const prompt = String(params.prompt || params.description || '').trim();
  if (!prompt) return { error: 'prompt required' };
  const generated = await generateCadScriptJob(env, {
    authUser: { id: scope.userId, tenant_id: scope.tenantId },
    scope,
    engine,
    prompt,
    systemPrompt: cadEngineSystemPrompt(engine),
    userContent: `Generate a production-ready ${engine} script for this request:\n${prompt}`,
    mode: 'text',
    requestedModelKey: params.model_key ?? null,
  });
  if (generated?.error) return generated;
  return {
    ok: true,
    job_id: generated.jobId,
    engine,
    status: 'script_ready',
    model_key: generated.model_key,
    next_step: 'Execute the CAD job after reviewing the generated script.',
  };
}

export const handlers = {
  designstudio_scene_list: listScenes,
  designstudio_asset_list: listAssets,
  cad_job_status: cadJobStatus,
  cad_job_cancel: cadJobCancel,
  cad_generate: cadGenerate,
};
