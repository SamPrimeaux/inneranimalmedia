/**
 * Single entry for Worker `scheduled()` — maps `event.cron` to lifted jobs (worker.js parity).
 * See `./matrix.js` for expression → handler reference.
 */
import { runIntegritySnapshot } from '../api/integrity.js';
import { runMidnightUtcJobs } from './jobs/midnight-utc.js';
import { runFinancialCommandCron } from './jobs/financial-command-cron.js';
import { sendDailyPlanEmail } from './jobs/daily-plan-email.js';
import { runWeeklyRollup } from './jobs/weekly-rollup.js';
import { runWebhookWeeklyRollupCron } from './jobs/webhook-weekly-rollup.js';
import { runCodebaseIndexWeeklyHealthCron } from './jobs/codebase-index-weekly-health.js';
import { runFirstOfMonthJobs } from './jobs/first-of-month.js';
import { scheduleSixAmRagJobs } from './jobs/rag-six-am.js';
import { writeDailySnapshot } from './jobs/write-daily-snapshot.js';
import { runThirtyMinuteJobs, runHourlyRoutingJobs } from './jobs/thirty-minute-cron.js';
import { runContainerPrewarmCron } from './jobs/container-prewarm-cron.js';
import {
  CRON_MESHY_CAD_SAFETY,
  runMeshyCadReconcileJobs,
} from './jobs/meshy-cad-reconcile-cron.js';
import { runWebhookPayloadPurgeCron } from './jobs/webhook-payload-purge.js';
import { compactAgentsamToolCallLogToStats, rollupOtlpTracesDaily } from '../core/memory.js';
import { rollupWorkerAnalytics } from '../core/worker-analytics-rollup.js';
import { runOneAmCompactionPipelineLedgered } from './jobs/one-am-compaction-pipeline.js';
import { completeCronRun, failCronRun, startCronRun } from '../core/cron-run-ledger.js';

const CRON_ONE_AM = '0 1 * * *';

/** @param {any} out */
function cronJobResultToLedgerPayload(out) {
  if (!out || typeof out !== 'object') {
    return { rowsRead: 0, rowsWritten: 0, metadata: {} };
  }
  const rowsWritten =
    Number(out.rowsWritten ?? out.totalDeleted ?? out.pruned_objects ?? 0) || 0;
  const rowsRead = Number(out.rowsRead ?? 0) || 0;
  if (out.metadata != null && typeof out.metadata === 'object') {
    return { rowsRead, rowsWritten, metadata: out.metadata };
  }
  return { rowsRead, rowsWritten, metadata: {} };
}

async function cronLedgerWrap(env, jobName, cronExpr, fn) {
  const begun = await startCronRun(env, {
    jobName,
    cronExpression: cronExpr,
    tenantId: null,
    workspaceId: null,
  });
  const runId = begun?.runId ?? null;
  const startedAt = begun?.startedAt ?? Date.now();
  try {
    const out = await fn();
    if (runId) {
      await completeCronRun(env, runId, startedAt, cronJobResultToLedgerPayload(out));
    }
  } catch (e) {
    if (runId) await failCronRun(env, runId, startedAt, e);
    console.warn(`[cron] ${jobName}`, e?.message ?? e);
  }
}

/**
 * `0 1 * * *` — unified compaction pipeline, webhook purge, worker analytics, MCP tool stats, OTLP rollup.
 * @param {any} env
 * @param {ExecutionContext} ctx
 */
function scheduleOneAmMaintenance(env, ctx) {
  if (!env?.DB) return;
  ctx.waitUntil(runWebhookPayloadPurgeCron(env));
  ctx.waitUntil(
    cronLedgerWrap(env, 'rollup_worker_analytics', CRON_ONE_AM, () =>
      rollupWorkerAnalytics(env).catch((e) => {
        console.warn('[cron] rollup_worker_analytics', e?.message ?? e);
        throw e;
      }),
    ),
  );
  ctx.waitUntil(
    cronLedgerWrap(env, 'one_am_compaction_pipeline', CRON_ONE_AM, () =>
      runOneAmCompactionPipelineLedgered(env).catch((e) => {
        console.warn('[cron] one_am_compaction_pipeline', e?.message ?? e);
        throw e;
      }),
    ),
  );
  ctx.waitUntil(
    cronLedgerWrap(env, 'tool_call_log_compact', CRON_ONE_AM, () =>
      compactAgentsamToolCallLogToStats(env).catch((e) => {
        console.warn('[cron] tool_stats_compacted', e?.message ?? e);
        throw e;
      }),
    ),
  );
  ctx.waitUntil(
    cronLedgerWrap(env, 'otlp_traces_rollup_daily', CRON_ONE_AM, () =>
      rollupOtlpTracesDaily(env).catch((e) => {
        console.warn('[cron] otlp_traces rollup', e?.message ?? e);
        throw e;
      }),
    ),
  );
  // Standalone memory decay (also runs after 6am RAG chain — ledger here so hangs upstream cannot skip it).
  ctx.waitUntil(
    cronLedgerWrap(env, 'agentsam_memory_decay', CRON_ONE_AM, async () => {
      const { runAgentsamMemoryDecay } = await import('../core/memory.js');
      return runAgentsamMemoryDecay(env);
    }),
  );
}

/**
 * @param {ScheduledEvent} event
 * @param {any} env
 * @param {ExecutionContext} ctx
 */
export async function handleScheduled(event, env, ctx) {
  const cron = event.cron;
  console.log('[Cron] Execution starting:', cron);

  switch (cron) {
    case CRON_MESHY_CAD_SAFETY:
    case '*/1 * * * *':
      ctx.waitUntil(
        runMeshyCadReconcileJobs(env, ctx).catch((e) =>
          console.warn('[cron] meshy_cad_reconcile', e?.message ?? e),
        ),
      );
      break;

    case '*/25 * * * *':
      ctx.waitUntil(
        runContainerPrewarmCron(env, ctx).catch((e) =>
          console.warn('[cron] container_prewarm', e?.message ?? e),
        ),
      );
      break;

    case '*/30 * * * *':
      await runThirtyMinuteJobs(env, ctx);
      break;

    case '0 * * * *':
      await runHourlyRoutingJobs(env, ctx);
      break;

    case '0 0 * * *':
      await runMidnightUtcJobs(env, ctx);
      if (env?.DB) {
        ctx.waitUntil(writeDailySnapshot(env, 'cron_0010').catch(() => {}));
        if (new Date().getUTCDay() === 0) {
          ctx.waitUntil(runWeeklyRollup(env));
          ctx.waitUntil(
            runWebhookWeeklyRollupCron(env).catch((e) =>
              console.warn('[cron] webhook_weekly_rollup', e?.message ?? e),
            ),
          );
          ctx.waitUntil(
            runCodebaseIndexWeeklyHealthCron(env).catch((e) =>
              console.warn('[cron] codebase_index_weekly_health', e?.message ?? e),
            ),
          );
        }
      }
      break;

    case '0 1 * * *':
      scheduleOneAmMaintenance(env, ctx);
      break;

    case '0 6 * * *':
      scheduleSixAmRagJobs(env, ctx);
      break;

    case '0 9 * * *':
      ctx.waitUntil(runFinancialCommandCron(env, ctx));
      break;

    case '0 9 * * 1':
      ctx.waitUntil(
        runIntegritySnapshot(env, 'cron').catch((e) =>
          console.warn('[cron] runIntegritySnapshot', e?.message ?? e),
        ),
      );
      break;

    case '30 13 * * *':
      ctx.waitUntil(sendDailyPlanEmail(env, ctx));
      break;

    case '0 0 1 * *':
      ctx.waitUntil(runFirstOfMonthJobs(env));
      break;

    default:
      console.warn('[cron] unhandled_cron_expression', cron);
  }
}
