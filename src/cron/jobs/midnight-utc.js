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

/**
 * `0 0 * * *` UTC — retention purge, nightly rollups, archive, daily digest email (worker.js parity).
 * @param {any} env
 * @param {ExecutionContext} ctx
 */
export async function runMidnightUtcJobs(env, ctx) {
  if (env?.DB) ctx.waitUntil(runRetentionPurge(env));
  if (env?.DB) {
    ctx.waitUntil(
      Promise.allSettled([
        runMasterDailyRetention(env),
        runSecurityScan(env, {
          tenantId: env.TENANT_ID,
          scanSources: ['agent_messages', 'terminal_history', 'agentsam_mcp_tool_execution'],
          triggeredBy: 'nightly_cron',
        }),
        rollupUsageEventsDaily(env).catch((e) =>
          console.warn('[cron] agentsam_usage_rollups_daily', e?.message ?? e),
        ),
      ]).then((results) => {
        console.log('[retention] rollup complete', { results });
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
    runAgentsamMemoryDecay(env).catch((e) => console.warn('[cron] agentsam_memory decay', e?.message ?? e)),
  );
  ctx.waitUntil(
    compactAgentsamToolCallLogToStats(env).catch((e) =>
      console.warn('[cron] tool_stats_compacted', e?.message ?? e),
    ),
  );
  ctx.waitUntil(
    rollupExecutionPerformanceMetrics(env).catch((e) =>
      console.warn('[cron] execution_performance_metrics', e?.message ?? e),
    ),
  );
}
