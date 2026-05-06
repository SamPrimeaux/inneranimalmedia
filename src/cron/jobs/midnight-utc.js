import { completeCronRun, failCronRun, startCronRun } from '../../core/cron-run-ledger.js';
import { runMasterDailyRetention } from '../../core/retention.js';
import { runSecurityScan } from '../../core/security-scan.js';
import {
  compactAgentsamToolCallLogToStats,
  rollupExecutionPerformanceMetrics,
  rollupUsageEventsDaily,
  runAgentsamMemoryDecay,
} from '../../core/memory.js';
import { runRetentionPurge } from '../retention-purge.js';
import { archiveOldConversations } from './archive-old-conversations.js';
import { sendDailyDigest } from './daily-digest.js';
import { writeDailySnapshot } from './write-daily-snapshot.js';

const CRON_MIDNIGHT = '0 0 * * *';
const CRON_ONE_AM = '0 1 * * *';

/**
 * @param {any} env
 * @param {string} jobName
 * @param {string} cronExpr
 * @param {() => Promise<any>} fn
 * @param {string | null} [tenantId]
 * @param {string | null} [workspaceId]
 */
async function cronLedgerWrap(env, jobName, cronExpr, fn, tenantId = null, workspaceId = null) {
  const begun = await startCronRun(env, {
    jobName,
    cronExpression: cronExpr,
    tenantId,
    workspaceId,
  });
  const runId = begun?.runId ?? null;
  const startedAt = begun?.startedAt ?? Date.now();
  try {
    await fn();
    if (runId) {
      await completeCronRun(env, runId, startedAt, { rowsRead: 0, rowsWritten: 0, metadata: {} });
    }
  } catch (e) {
    if (runId) await failCronRun(env, runId, startedAt, e);
    console.warn(`[cron] ${jobName}`, e?.message ?? e);
  }
}

/**
 * `0 0 * * *` UTC — retention purge, nightly rollups, archive, daily digest email (worker.js parity).
 * @param {any} env
 * @param {ExecutionContext} ctx
 */
export async function runMidnightUtcJobs(env, ctx) {
  if (env?.DB) ctx.waitUntil(cronLedgerWrap(env, 'retention_purge', CRON_MIDNIGHT, () => runRetentionPurge(env)));
  if (env?.DB) {
    ctx.waitUntil(
      cronLedgerWrap(env, 'master_daily_retention', CRON_MIDNIGHT, () => runMasterDailyRetention(env)),
    );
    ctx.waitUntil(
      cronLedgerWrap(env, 'security_scan_nightly', CRON_MIDNIGHT, () =>
        runSecurityScan(env, {
          tenantId: env.TENANT_ID,
          scanSources: ['agent_messages', 'terminal_history', 'agentsam_mcp_tool_execution'],
          triggeredBy: 'nightly_cron',
        }),
      ),
    );
    ctx.waitUntil(
      cronLedgerWrap(env, 'rollup_usage_events_daily', CRON_MIDNIGHT, async () => {
        try {
          await rollupUsageEventsDaily(env);
        } catch (e) {
          console.warn('[cron] agentsam_usage_rollups_daily', e?.message ?? e);
          throw e;
        }
      }),
    );
  }
  if (env?.DB && env?.R2) {
    ctx.waitUntil(
      archiveOldConversations(env).then((r) => {
        console.log('[archive]', JSON.stringify(r));
      }),
    );
  }
  if (!env?.DB) return;
  const today = new Date().toISOString().slice(0, 10);
  const already = await env.DB.prepare(
    `SELECT id FROM email_logs
     WHERE subject LIKE '%Daily Digest%'
     AND created_at >= ? LIMIT 1`,
  )
    .bind(`${today}T00:00:00`)
    .first()
    .catch(() => null);
  if (already) return;
  ctx.waitUntil(writeDailySnapshot(env, 'cron_midnight').catch(() => {}));
  ctx.waitUntil(sendDailyDigest(env));
}

/**
 * `0 1 * * *` — agentsam memory decay + tool stats (matches former src/index.js scheduled).
 * @param {any} env
 * @param {ExecutionContext} ctx
 */
export function scheduleOneAmMaintenance(env, ctx) {
  if (!env?.DB) return;
  ctx.waitUntil(
    cronLedgerWrap(env, 'agentsam_memory_decay', CRON_ONE_AM, () =>
      runAgentsamMemoryDecay(env).catch((e) => {
        console.warn('[cron] agentsam_memory decay', e?.message ?? e);
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
    cronLedgerWrap(env, 'execution_performance_rollup', CRON_ONE_AM, () =>
      rollupExecutionPerformanceMetrics(env).catch((e) => {
        console.warn('[cron] execution_performance_metrics', e?.message ?? e);
        throw e;
      }),
    ),
  );
}
