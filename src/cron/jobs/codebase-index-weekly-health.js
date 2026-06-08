import { completeCronRun, failCronRun, startCronRun } from '../../core/cron-run-ledger.js';
import { runCodebaseIndexWeeklyHealth } from '../../core/codebase-index-health.js';

/**
 * Sunday weekly job — surface pgvector codebase files stale vs GitHub.
 * @param {any} env
 */
export async function runCodebaseIndexWeeklyHealthCron(env) {
  const begun = await startCronRun(env, {
    jobName: 'codebase_index_weekly_health',
    cronExpression: '0 0 * * 0',
    tenantId: null,
    workspaceId: env?.WORKSPACE_ID ? String(env.WORKSPACE_ID) : null,
  });
  const runId = begun?.runId ?? null;
  const startedAt = begun?.startedAt ?? Date.now();
  try {
    const out = await runCodebaseIndexWeeklyHealth(env);
    if (runId) {
      await completeCronRun(env, runId, startedAt, {
        rowsRead: Number(out.total_indexed) || 0,
        rowsWritten: Number(out.rowsWritten) || 0,
        metadata: {
          stale_index_count: out.stale_index_count ?? 0,
          skipped: out.skipped === true,
          reason: out.reason ?? null,
        },
      });
    }
    if (out.stale_index_count > 0) {
      console.warn(
        '[codebase_index_weekly_health] stale=%s workspace=%s',
        out.stale_index_count,
        out.workspace_key,
      );
    }
    return out;
  } catch (e) {
    if (runId) await failCronRun(env, runId, startedAt, e);
    throw e;
  }
}
