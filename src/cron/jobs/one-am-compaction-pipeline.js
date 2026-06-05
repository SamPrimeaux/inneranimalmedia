/**
 * Unified 1 AM compaction pipeline — ordered rollups and purges (six-table addendum).
 *
 * 1. rollupExecutionPerformanceMetrics
 * 2. runEtoPipeline
 * 3. rollupUsageEventsDaily
 * 4. rollupToolCallLogDaily
 * 5. archiveAgentRunsDailyToR2 + pruneCompletedAgentRuns
 * 6. purgeExpiredToolCache
 * 7. purgeErrorLog
 * 8. purgeHookExecution
 * 9. purgeUsageEventsAfterRollup
 * 10. (prune included in step 5)
 * 11. retention_purge (tool_call_log / usage_events / hook_execution skipped)
 */

import { rollupExecutionPerformanceMetrics } from '../../core/memory.js';
import { runEtoPipeline } from '../../core/performance-eto.js';
import { rollupUsageEventsDaily, purgeUsageEventsAfterRollup } from '../../core/usage-events-rollup.js';
import {
  rollupToolCallLogDaily,
  purgeExpiredToolCache,
  purgeErrorLog,
  purgeHookExecution,
} from '../../core/one-am-table-compaction.js';
import {
  archiveAgentRunsDailyToR2,
  pruneCompletedAgentRuns,
} from './agent-run-daily-rollup.js';
import { runRetentionPurge } from '../retention-purge.js';
import { completeCronRun, failCronRun, startCronRun } from '../../core/cron-run-ledger.js';

const CRON_ONE_AM = '0 1 * * *';

/**
 * @param {any} env
 */
export async function runOneAmCompactionPipeline(env) {
  const steps = {};

  steps.epm = await rollupExecutionPerformanceMetrics(env)
    .then(() => ({ ok: true }))
    .catch((e) => {
      console.warn('[1am-pipeline] epm', e?.message ?? e);
      return { ok: false, error: String(e?.message || e) };
    });

  steps.eto = await runEtoPipeline(env)
    .then((r) => ({ ok: true, ...(r && typeof r === 'object' ? r : {}) }))
    .catch((e) => {
      console.warn('[1am-pipeline] eto', e?.message ?? e);
      return { ok: false, error: String(e?.message || e) };
    });

  steps.usage_events_rollup = await rollupUsageEventsDaily(env);
  steps.tool_call_log = await rollupToolCallLogDaily(env);

  steps.agent_run_archive = await archiveAgentRunsDailyToR2(env);
  steps.agent_run_prune = await pruneCompletedAgentRuns(env);

  steps.tool_cache = await purgeExpiredToolCache(env);
  steps.error_log = await purgeErrorLog(env);
  steps.hook_execution = await purgeHookExecution(env);
  steps.usage_events_purge = await purgeUsageEventsAfterRollup(env);

  steps.retention_purge = await runRetentionPurge(env).catch((e) => {
    console.warn('[1am-pipeline] retention_purge', e?.message ?? e);
    return { ok: false, error: String(e?.message || e) };
  });

  const rowsWritten =
    (steps.usage_events_purge?.deleted ?? 0) +
    (steps.tool_call_log?.deleted ?? 0) +
    (steps.tool_cache?.deleted ?? 0) +
    (steps.error_log?.deleted ?? 0) +
    (steps.hook_execution?.deleted ?? 0) +
    (steps.agent_run_prune?.deleted ?? 0) +
    (steps.retention_purge?.rowsWritten ?? 0);

  return { ok: true, steps, rowsWritten };
}

/**
 * Ledger-wrapped entry for scheduled cron.
 * @param {any} env
 */
export async function runOneAmCompactionPipelineLedgered(env) {
  const begun = await startCronRun(env, {
    jobName: 'one_am_compaction_pipeline',
    cronExpression: CRON_ONE_AM,
    tenantId: null,
    workspaceId: null,
  });
  const runId = begun?.runId ?? null;
  const startedAt = begun?.startedAt ?? Date.now();

  try {
    const out = await runOneAmCompactionPipeline(env);
    if (runId) {
      await completeCronRun(env, runId, startedAt, {
        rowsRead: 0,
        rowsWritten: out.rowsWritten ?? 0,
        metadata: { steps: out.steps },
      });
    }
    return out;
  } catch (e) {
    if (runId) await failCronRun(env, runId, startedAt, e);
    throw e;
  }
}
