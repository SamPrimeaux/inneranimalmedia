/**
 * Server-side Meshy CAD reconciliation — poll in-flight jobs + finalize GLB polish (progress_pct=92).
 * Runs on a Worker cron so jobs complete when the user tabs away.
 */
import { applyMeshyTaskToCadJob } from './meshy-cad-sync.js';
import { getMeshyTask } from './meshy-api.js';
import { resolveMeshyAuth, isMeshyAuthMissing } from './meshy-api-key.js';
import { dispatchMeshyGlbOptimize } from './glb-optimize-dispatch.js';
import { finalizeCadJobComplete } from './cad-job-complete.js';
import { buildCadAssetPublicUrl } from './cad-job-scope.js';

const BATCH = 8;

function parseTextureData(raw) {
  if (!raw) return {};
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return {};
  }
}

/**
 * @param {any} env
 * @param {any} ctx
 */
export async function runMeshyCadReconcileCron(env, ctx) {
  if (!env?.DB) return { rowsRead: 0, rowsWritten: 0, metadata: {} };

  let rowsRead = 0;
  let rowsWritten = 0;
  let meshyPolled = 0;
  let polishDispatched = 0;
  let polishFinalized = 0;

  const { results: inFlight } = await env.DB.prepare(
    `SELECT * FROM agentsam_cad_jobs
     WHERE engine = 'meshy'
       AND status IN ('pending', 'running', 'queued', 'accepted')
       AND external_task_id IS NOT NULL
       AND (progress_pct IS NULL OR progress_pct < 92)
       AND updated_at < unixepoch() - 15
     ORDER BY updated_at ASC
     LIMIT ?`,
  )
    .bind(BATCH)
    .all()
    .catch(() => ({ results: [] }));

  for (const job of inFlight || []) {
    rowsRead += 1;
    const taskType = String(job.task_type || 'text-to-3d').trim();
    const extId = String(job.external_task_id || '').trim();
    if (!extId) continue;

    const meshyAuth = await resolveMeshyAuth(env, {
      userId: job.user_id,
      tenantId: job.tenant_id,
      user_id: job.user_id,
      tenant_id: job.tenant_id,
    });
    if (isMeshyAuthMissing(meshyAuth)) continue;

    try {
      const task = await getMeshyTask(env, taskType, extId, meshyAuth);
      await applyMeshyTaskToCadJob(env, ctx, task);
      meshyPolled += 1;
      rowsWritten += 1;
    } catch (e) {
      console.warn('[meshy-cad-reconcile] poll', job.id, e?.message ?? e);
    }
  }

  const { results: polishPending } = await env.DB.prepare(
    `SELECT * FROM agentsam_cad_jobs
     WHERE engine = 'meshy'
       AND status = 'running'
       AND progress_pct >= 92
       AND texture_data LIKE '%"glb_optimize_pending":true%'
       AND updated_at < unixepoch() - 20
     ORDER BY updated_at ASC
     LIMIT ?`,
  )
    .bind(BATCH)
    .all()
    .catch(() => ({ results: [] }));

  for (const job of polishPending || []) {
    rowsRead += 1;
    const td = parseTextureData(job.texture_data);
    if (td.glb_optimized === true && td.glb_optimize_pending !== true) {
      try {
        const publicUrl =
          String(job.result_url || '').trim() ||
          buildCadAssetPublicUrl(String(job.r2_key || '').trim());
        await finalizeCadJobComplete(env, ctx, {
          job_id: String(job.id),
          status: 'done',
          r2_key: job.r2_key,
          r2_bucket: job.r2_bucket,
          public_url: publicUrl,
          runner_host: 'meshy_cad_reconcile',
        });
        polishFinalized += 1;
        rowsWritten += 1;
      } catch (e) {
        console.warn('[meshy-cad-reconcile] finalize', job.id, e?.message ?? e);
      }
      continue;
    }

    try {
      const out = await dispatchMeshyGlbOptimize(env, ctx, job);
      if (out?.ok) {
        polishDispatched += 1;
        rowsWritten += 1;
      }
    } catch (e) {
      console.warn('[meshy-cad-reconcile] polish dispatch', job.id, e?.message ?? e);
    }
  }

  return {
    rowsRead,
    rowsWritten,
    metadata: { meshyPolled, polishDispatched, polishFinalized },
  };
}
