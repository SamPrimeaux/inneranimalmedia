/** Every minute — Meshy CAD poll + GLB polish reconciliation. */

import { completeCronRun, failCronRun, startCronRun } from '../../core/cron-run-ledger.js';
import { runMeshyCadReconcileCron } from '../../core/meshy-cad-reconcile.js';

const CRON_EVERY_MINUTE = '*/1 * * * *';

/**
 * @param {any} env
 * @param {ExecutionContext} ctx
 */
export async function runMeshyCadReconcileJobs(env, ctx) {
  const begun = await startCronRun(env, {
    jobName: 'meshy_cad_reconcile',
    cronExpression: CRON_EVERY_MINUTE,
    tenantId: null,
    workspaceId: null,
  });
  const runId = begun?.runId ?? null;
  const startedAt = begun?.startedAt ?? Date.now();
  try {
    const out = await runMeshyCadReconcileCron(env, ctx);
    if (runId) {
      await completeCronRun(env, runId, startedAt, {
        rowsRead: Number(out?.rowsRead) || 0,
        rowsWritten: Number(out?.rowsWritten) || 0,
        metadata: out?.metadata ?? {},
      });
    }
    return out;
  } catch (e) {
    if (runId) await failCronRun(env, runId, startedAt, e);
    console.warn('[cron] meshy_cad_reconcile', e?.message ?? e);
    throw e;
  }
}
