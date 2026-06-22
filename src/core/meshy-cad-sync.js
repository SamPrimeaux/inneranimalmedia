/**
 * Apply Meshy task payloads to agentsam_cad_jobs (poll + webhook).
 */
import { buildCadAssetPublicUrl } from './cad-job-scope.js';
import { finalizeCadJobComplete, ingestRemoteGlbToR2 } from './cad-job-complete.js';

const STATUS_MAP = {
  PENDING: 'pending',
  IN_PROGRESS: 'running',
  SUCCEEDED: 'done',
  FAILED: 'failed',
  CANCELED: 'failed',
};

/**
 * @param {Record<string, unknown>} payload
 */
export function meshyTaskIdFromPayload(payload) {
  const id = payload?.id ?? payload?.result ?? payload?.task_id ?? null;
  return id != null ? String(id).trim() : null;
}

/**
 * @param {Record<string, unknown>} payload
 */
export function meshyTaskStatus(payload) {
  return String(payload?.status || '').trim().toUpperCase();
}

/**
 * @param {any} env
 * @param {string} externalTaskId
 */
export async function findCadJobByExternalTaskId(env, externalTaskId) {
  if (!env?.DB || !externalTaskId) return null;
  return env.DB.prepare(
    `SELECT * FROM agentsam_cad_jobs
     WHERE engine = 'meshy' AND external_task_id = ?
     ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(externalTaskId)
    .first();
}

/**
 * @param {any} env
 * @param {any} ctx
 * @param {Record<string, unknown>} job
 * @param {Record<string, unknown>} scope
 * @param {string | null | undefined} glbUrl
 */
async function meshyIngestIfDone(env, ctx, job, scope, glbUrl) {
  const url = String(glbUrl || '').trim();
  if (!url || !scope.workspaceId || !scope.tenantId) return null;
  try {
    if (!job.workspace_id && scope.workspaceId) {
      await env.DB.prepare(
        `UPDATE agentsam_cad_jobs SET
           workspace_id = ?, tenant_id = ?, project_id = COALESCE(?, project_id),
           scene_snapshot_id = COALESCE(?, scene_snapshot_id), updated_at = unixepoch()
         WHERE id = ?`,
      )
        .bind(scope.workspaceId, scope.tenantId, scope.projectId, scope.sceneSnapshotId, job.id)
        .run();
    }
    const ingested = await ingestRemoteGlbToR2(env, {
      tenantId: scope.tenantId || job.tenant_id,
      workspaceId: scope.workspaceId || job.workspace_id,
      jobId: String(job.id),
      sourceUrl: url,
    });
    return finalizeCadJobComplete(env, ctx, {
      job_id: job.id,
      status: 'done',
      r2_key: ingested.r2_key,
      r2_bucket: ingested.r2_bucket,
      public_url: ingested.public_url,
      size_bytes: ingested.size_bytes,
    });
  } catch (e) {
    console.warn('[meshy-cad-sync] r2 ingest failed:', e?.message ?? e);
    return null;
  }
}

/**
 * @param {any} env
 * @param {any} ctx
 * @param {Record<string, unknown>} taskPayload
 */
export async function applyMeshyTaskToCadJob(env, ctx, taskPayload) {
  if (!env?.DB) return { ok: false, reason: 'db_missing' };

  const externalTaskId = meshyTaskIdFromPayload(taskPayload);
  if (!externalTaskId) return { ok: false, reason: 'missing_task_id' };

  const job = await findCadJobByExternalTaskId(env, externalTaskId);
  if (!job) {
    return { ok: true, ignored: true, reason: 'job_not_found', external_task_id: externalTaskId };
  }

  const jobId = String(job.id);
  if (['done', 'failed', 'stub'].includes(String(job.status))) {
    return { ok: true, job_id: jobId, status: String(job.status), skipped: 'terminal' };
  }

  const meshyStatus = meshyTaskStatus(taskPayload);
  const newStatus = STATUS_MAP[meshyStatus] || String(job.status);
  const progress = Number(taskPayload?.progress) || null;

  if (newStatus === 'running' || newStatus === 'pending') {
    await env.DB.prepare(
      `UPDATE agentsam_cad_jobs SET status = ?, progress_pct = COALESCE(?, progress_pct), updated_at = unixepoch() WHERE id = ?`,
    )
      .bind(newStatus, progress, jobId)
      .run();
    return { ok: true, job_id: jobId, status: newStatus, progress };
  }

  if (newStatus === 'failed') {
    const errMsg =
      String(taskPayload?.message || taskPayload?.error || taskPayload?.task_error || 'Meshy generation failed').slice(
        0,
        500,
      );
    await env.DB.prepare(
      `UPDATE agentsam_cad_jobs SET status='failed', error=?, updated_at=unixepoch() WHERE id=?`,
    )
      .bind(errMsg, jobId)
      .run();
    ctx?.waitUntil?.(
      finalizeCadJobComplete(env, ctx, { job_id: jobId, status: 'failed', error: errMsg }).catch(() => null),
    );
    return { ok: true, job_id: jobId, status: 'failed', error: errMsg };
  }

  if (newStatus !== 'done') {
    return { ok: true, job_id: jobId, status: newStatus, skipped: 'non_terminal' };
  }

  const glbUrl = taskPayload?.model_urls?.glb || taskPayload?.model_url || null;
  const scope = {
    workspaceId: job.workspace_id,
    tenantId: job.tenant_id,
    projectId: job.project_id,
    sceneSnapshotId: job.scene_snapshot_id,
  };
  const ingested = await meshyIngestIfDone(env, ctx, job, scope, glbUrl ? String(glbUrl) : null);
  const publicUrl = ingested?.public_url || buildCadAssetPublicUrl(ingested?.r2_key) || glbUrl;

  if (!ingested && glbUrl) {
    await env.DB.prepare(
      `UPDATE agentsam_cad_jobs SET status='done', result_url=?, progress_pct=100, updated_at=unixepoch() WHERE id=?`,
    )
      .bind(String(glbUrl), jobId)
      .run();
  }

  return {
    ok: true,
    job_id: jobId,
    status: 'done',
    public_url: publicUrl,
    r2_key: ingested?.r2_key ?? null,
    cms_asset: ingested?.cms_asset ?? null,
    progress_pct: 100,
  };
}
