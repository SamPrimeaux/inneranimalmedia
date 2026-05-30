/**
 * Single entry for Worker `scheduled()` — maps `event.cron` to lifted jobs (worker.js parity).
 * See `./matrix.js` for expression → handler reference.
 */
import { runIntegritySnapshot } from '../api/integrity';
import { runMidnightUtcJobs } from './jobs/midnight-utc.js';
import { runFinancialCommandCron } from './jobs/financial-command-cron.js';
import { sendDailyPlanEmail } from './jobs/daily-plan-email.js';
import { runWeeklyRollup } from './jobs/weekly-rollup.js';
import { runFirstOfMonthJobs } from './jobs/first-of-month.js';
import { scheduleSixAmRagJobs } from './jobs/rag-six-am.js';
import { writeDailySnapshot } from './jobs/write-daily-snapshot.js';
import { runThirtyMinuteJobs, runHourlyRoutingJobs } from './jobs/thirty-minute-cron.js';
import { runWebhookPayloadPurgeCron } from './jobs/webhook-payload-purge.js';
import {
  compactAgentsamToolCallLogToStats,
  rollupExecutionPerformanceMetrics,
  rollupOtlpTracesDaily,
} from '../core/memory.js';
import { runEtoPipeline } from '../core/performance-eto.js';
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
 * `0 1 * * *` — webhook payload purge + tool/execution rollups (no memory decay; decay runs at 06:00).
 * @param {any} env
 * @param {ExecutionContext} ctx
 */
function scheduleOneAmMaintenance(env, ctx) {
  if (!env?.DB) return;
  ctx.waitUntil(runWebhookPayloadPurgeCron(env));
  ctx.waitUntil(
    cronLedgerWrap(env, 'tool_call_log_compact', CRON_ONE_AM, () =>
      compactAgentsamToolCallLogToStats(env).catch((e) => {
        console.warn('[cron] tool_stats_compacted', e?.message ?? e);
        throw e;
      }),
    ),
  );
  ctx.waitUntil(
    cronLedgerWrap(env, 'execution_performance_rollup', CRON_ONE_AM, async () => {
      await rollupExecutionPerformanceMetrics(env).catch((e) => {
        console.warn('[cron] agentsam_execution_performance_metrics', e?.message ?? e);
        throw e;
      });
      await runEtoPipeline(env).catch((e) => {
        console.warn('[cron] agentsam_performance_eto_events', e?.message ?? e);
        throw e;
      });
    }),
  );
  ctx.waitUntil(
    cronLedgerWrap(env, 'otlp_traces_rollup_daily', CRON_ONE_AM, () =>
      rollupOtlpTracesDaily(env).catch((e) => {
        console.warn('[cron] otlp_traces rollup', e?.message ?? e);
        throw e;
      }),
    ),
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
    case '*/30 * * * *':
      await runThirtyMinuteJobs(env, ctx);
      break;

    case '0 * * * *':
      await runHourlyRoutingJobs(env, ctx);
      break;

    case '0 0 * * *':
      if (env?.DB) {
        await env.DB.prepare(
          `DELETE FROM worker_analytics_events WHERE created_at < unixepoch('now', '-7 days')`,
        )
          .run()
          .catch((e) => console.warn('[cron] worker_analytics_events purge', e?.message ?? e));
      }
      await runMidnightUtcJobs(env, ctx);
      if (env?.DB) {
        ctx.waitUntil(writeDailySnapshot(env, 'cron_0010').catch(() => {}));
        if (new Date().getUTCDay() === 0) {
          ctx.waitUntil(runWeeklyRollup(env));
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
      ctx.waitUntil(sendDailyPlanEmail(env));
      break;

    case '0 0 1 * *':
      ctx.waitUntil(runFirstOfMonthJobs(env));
      break;

    default:
      console.warn('[cron] unhandled_cron_expression', cron);
  }
}
