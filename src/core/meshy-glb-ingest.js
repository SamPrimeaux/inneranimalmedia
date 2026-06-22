/**
 * Meshy GLB ingest + automatic polish queue (meshopt on ExecOS / runner).
 */
import { ingestRemoteGlbToR2 } from './cad-job-complete.js';
import { dispatchMeshyGlbOptimize, mergeCadJobTextureData } from './glb-optimize-dispatch.js';

/**
 * Download Meshy GLB → R2, then queue invisible optimize before user sees "done".
 * @param {any} env
 * @param {any} ctx
 * @param {Record<string, unknown>} job
 * @param {Record<string, unknown>} scope
 * @param {string | null | undefined} glbUrl
 */
export async function meshyIngestAndQueuePolish(env, ctx, job, scope, glbUrl) {
  const url = String(glbUrl || '').trim();
  if (!url || !scope.workspaceId || !scope.tenantId) return null;
  const lower = url.toLowerCase();
  if (!lower.includes('.glb') && !lower.includes('gltf')) return null;

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

    const textureData = mergeCadJobTextureData(job.texture_data, {
      glb_optimize_pending: true,
      glb_optimized: false,
      glb_raw_bytes: ingested.size_bytes,
    });

    await env.DB.prepare(
      `UPDATE agentsam_cad_jobs SET
         status = 'running',
         progress_pct = 92,
         r2_key = ?,
         r2_bucket = ?,
         result_url = ?,
         texture_data = ?,
         updated_at = unixepoch()
       WHERE id = ?`,
    )
      .bind(
        ingested.r2_key,
        ingested.r2_bucket,
        ingested.public_url,
        textureData,
        String(job.id),
      )
      .run();

    ctx?.waitUntil?.(
      dispatchMeshyGlbOptimize(env, ctx, { ...job, r2_key: ingested.r2_key, texture_data: textureData }).catch(
        (e) => console.warn('[meshy-glb-ingest] optimize dispatch:', e?.message ?? e),
      ),
    );

    return {
      ...ingested,
      pending_polish: true,
      progress_pct: 92,
      status: 'running',
    };
  } catch (e) {
    console.warn('[meshy-glb-ingest] r2 ingest failed:', e?.message ?? e);
    return null;
  }
}
