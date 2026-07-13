/** Every 30 minutes (worker.js parity). */

import { completeCronRun, failCronRun, startCronRun } from '../../core/cron-run-ledger.js';
import {
  reconcileRoutingArmsFromAgentRuns,
  rollupAgentsamModelRoutingMemory,
  enforceEvalSlosPauseArms,
  enforceTaskSlosFromRoutingMemory,
} from '../../core/routing-cron.js';
import { applyEtoToRoutingArms } from '../../core/performance-eto.js';
import { scanErrorLogThresholds } from '../../core/error-log-escalation.js';
import { runMcpServerHealthCron } from './mcp-server-health.js';
import { runAgentsamMemoryVectorSync } from '../../core/agentsam-memory-vector-sync.js';

const CRON_30 = '*/30 * * * *';

/**
 * Mark long-running ledger rows as failed (no completion recorded).
 * @param {any} env
 * @param {{ cronExpression?: string, skipLedger?: boolean }} [opts]
 */
export async function sweepStaleCronRuns(env, opts = {}) {
  if (!env?.DB) return { rowsWritten: 0 };
  const cronExpression = opts.cronExpression ?? CRON_30;
  const skipLedger = opts.skipLedger === true;
  let runId = null;
  let startedAt = Date.now();
  if (!skipLedger) {
    const begun = await startCronRun(env, {
      jobName: 'agentsam_cron_runs_stuck_sweep',
      cronExpression,
      tenantId: null,
      workspaceId: null,
    });
    runId = begun?.runId ?? null;
    startedAt = begun?.startedAt ?? Date.now();
  }
  try {
    const r = await env.DB.prepare(
      `UPDATE agentsam_cron_runs SET status='failed', error_message='timeout - no completion recorded'
       WHERE status='running' AND started_at < unixepoch() - 3600`,
    ).run();
    const rowsWritten = Number(r.meta?.changes ?? r.changes ?? 0) || 0;
    if (runId) {
      await completeCronRun(env, runId, startedAt, {
        rowsRead: 0,
        rowsWritten,
        metadata: { stuck_rows_marked: rowsWritten },
      });
    }
    return { rowsWritten };
  } catch (e) {
    if (runId) await failCronRun(env, runId, startedAt, e);
    console.warn('[sweepStaleCronRuns]', e?.message ?? e);
    throw e;
  }
}

/** Mark stale pending approvals as expired (TTL drift / missed decisions). */
export async function sweepExpiredApprovalQueue(env) {
  if (!env?.DB) return;
  const begun = await startCronRun(env, {
    jobName: 'agentsam_approval_queue_expiry_sweep',
    cronExpression: CRON_30,
    tenantId: null,
    workspaceId: null,
  });
  const runId = begun?.runId ?? null;
  const startedAt = begun?.startedAt ?? Date.now();
  try {
    const r = await env.DB.prepare(
      `UPDATE agentsam_approval_queue SET status='expired'
       WHERE status='pending' AND expires_at < unixepoch()`,
    ).run();
    const rowsWritten = Number(r.meta?.changes ?? r.changes ?? 0) || 0;
    if (runId) {
      await completeCronRun(env, runId, startedAt, {
        rowsRead: 0,
        rowsWritten,
        metadata: { expired_rows: rowsWritten },
      });
    }
  } catch (e) {
    if (runId) await failCronRun(env, runId, startedAt, e);
    console.warn('[sweepExpiredApprovalQueue]', e?.message ?? e);
  }
}

const CRON_HOURLY = '0 * * * *';

export async function processQueues(env) {
  if (!env.DB) return;
  const begun = await startCronRun(env, {
    jobName: 'agent_request_queue_drain',
    cronExpression: CRON_HOURLY,
    tenantId: null,
    workspaceId: null,
  });
  const runId = begun?.runId ?? null;
  const startedAt = begun?.startedAt ?? Date.now();
  let rowsRead = 0;
  let rowsWritten = 0;
  try {
    const { results: sessions } = await env.DB.prepare(
      `SELECT DISTINCT session_id FROM agent_request_queue WHERE status = 'queued'`,
    ).all();
    rowsRead = (sessions || []).length;
    for (const { session_id } of sessions || []) {
      const task = await env.DB.prepare(
        `SELECT * FROM agent_request_queue WHERE session_id = ? AND status = 'queued' ORDER BY position ASC, created_at ASC LIMIT 1`,
      )
        .bind(session_id)
        .first();
      if (!task) continue;
      try {
        await env.DB.prepare(
          `UPDATE agent_request_queue SET status = 'running', updated_at = unixepoch() WHERE id = ?`,
        )
          .bind(task.id)
          .run();
        const payload = task.payload_json ? JSON.parse(task.payload_json) : {};
        await env.DB.prepare(
          `UPDATE agent_request_queue SET status = 'done', result_json = ?, updated_at = unixepoch() WHERE id = ?`,
        )
          .bind(JSON.stringify({ success: true, payload: payload }), task.id)
          .run();
        rowsWritten += 2;
      } catch (e) {
        await env.DB.prepare(
          `UPDATE agent_request_queue SET status = 'failed', result_json = ?, updated_at = unixepoch() WHERE id = ?`,
        )
          .bind(JSON.stringify({ error: String(e?.message || e) }), task.id)
          .run();
        rowsWritten += 2;
      }
    }
    if (runId) await completeCronRun(env, runId, startedAt, { rowsRead, rowsWritten, metadata: {} });
  } catch (e) {
    if (runId) await failCronRun(env, runId, startedAt, e);
    console.warn('[processQueues]', e?.message || e);
  }
}

/** @deprecated Use reconcileRoutingArmsFromAgentRuns (agentsam_agent_run, not routing_decisions). */
export async function updateRoutingPerformanceScores(env) {
  await reconcileRoutingArmsFromAgentRuns(env);
}

/** Close terminal_sessions idle > 24h so active-count stays accurate. */
export async function sweepStaleTerminalSessions(env) {
  if (!env.DB) return;
  const begun = await startCronRun(env, {
    jobName: 'terminal_sessions_stale_sweep',
    cronExpression: CRON_30,
    tenantId: null,
    workspaceId: null,
  });
  const runId = begun?.runId ?? null;
  const startedAt = begun?.startedAt ?? Date.now();
  try {
    const { purgeStaleTerminalSessions } = await import('../../core/terminal.js');
    const purged = await purgeStaleTerminalSessions(env);
    const r = await env.DB.prepare(
      `UPDATE terminal_sessions
       SET status = 'closed', closed_at = unixepoch(), updated_at = unixepoch()
       WHERE status = 'active'
         AND updated_at < unixepoch() - 86400`,
    ).run();
    const closed = Number(r.meta?.changes ?? r.changes ?? 0) || 0;
    if (closed > 0 || purged > 0) {
      console.log('[cron] terminal_sessions swept:', closed, 'stale closed;', purged, 'purged');
    }
    if (runId) {
      await completeCronRun(env, runId, startedAt, {
        rowsRead: 0,
        rowsWritten: closed + purged,
        metadata: { closed, purged },
      });
    }
  } catch (e) {
    if (runId) await failCronRun(env, runId, startedAt, e);
    console.warn('[cron] sweepStaleTerminalSessions', e?.message ?? e);
  }
}

/** Mark agent_run rows stuck in 'running' for > 35 min as failed_stale. */
async function sweepStaleAgentRuns(env) {
  if (!env?.DB) return;
  try {
    const cutoff = Math.floor(Date.now() / 1000) - 35 * 60;
    const result = await env.DB.prepare(`
      UPDATE agentsam_agent_run
      SET status = 'failed',
          error_message = COALESCE(error_message, 'run exceeded 35min without terminal status — swept by cron'),
          completed_at = COALESCE(completed_at, datetime('now')),
          updated_at_unix = strftime('%s','now')
      WHERE status = 'running'
        AND (
          (created_at_unix > 0 AND created_at_unix < ?)
          OR (COALESCE(created_at_unix, 0) = 0 AND started_at IS NOT NULL AND started_at < datetime('now', '-35 minutes'))
        )
    `).bind(cutoff).run();
    if (result?.meta?.changes > 0) {
      console.log('[cron] sweepStaleAgentRuns: marked', result.meta.changes, 'runs as failed_stale');
    }
  } catch (e) {
    console.warn('[cron] sweepStaleAgentRuns', e?.message ?? e);
  }
}

export async function runThirtyMinuteJobs(env, ctx) {
  // Stuck sweep + overnight progress moved to daily (midnight UTC) — was 48×/day with 0 writes.
  ctx.waitUntil(sweepExpiredApprovalQueue(env));
  ctx.waitUntil(sweepStaleTerminalSessions(env));
  ctx.waitUntil(sweepStaleAgentRuns(env));
  ctx.waitUntil(
    import('../../core/keys-security.js')
      .then(({ runSecurityShieldPulseCron }) => runSecurityShieldPulseCron(env))
      .catch((e) => console.warn('[cron] security_shield_pulse', e?.message ?? e)),
  );
  ctx.waitUntil(runMcpServerHealthCron(env).catch((e) => console.warn('[cron] mcp_server_health', e?.message ?? e)));
  ctx.waitUntil(
    import('./google-calendar-sync-cron.js')
      .then(({ runGoogleCalendarSyncJob }) => runGoogleCalendarSyncJob(env))
      .catch((e) => console.warn('[cron] google_calendar_sync', e?.message ?? e)),
  );
  ctx.waitUntil(
    import('../../core/moviemode-veo-poll.js')
      .then(({ pollPendingVeoJobs }) => pollPendingVeoJobs(env))
      .catch((e) => console.warn('[cron] moviemode_veo_poll', e?.message ?? e)),
  );
}

export async function runHourlyRoutingJobs(env, ctx) {
  ctx.waitUntil(reconcileRoutingArmsFromAgentRuns(env).catch(e => console.warn('[cron/hourly] reconcileRoutingArms', e?.message)));
  ctx.waitUntil(rollupAgentsamModelRoutingMemory(env).catch(e => console.warn('[cron/hourly] rollupRoutingMemory', e?.message)));
  ctx.waitUntil(enforceTaskSlosFromRoutingMemory(env).catch(e => console.warn('[cron/hourly] enforceSlos', e?.message)));
  ctx.waitUntil(enforceEvalSlosPauseArms(env, { lookbackDays: 7 }).catch(e => console.warn('[cron/hourly] enforceEvalSlos', e?.message)));
  // routing_analytics_rollups disabled — duplicated execution_performance rollup with 0 writes.
  ctx.waitUntil(processQueues(env).catch((e) => console.warn('[cron/hourly] agent_request_queue_drain', e?.message)));
  ctx.waitUntil(scanErrorLogThresholds(env).catch(e => console.warn('[cron/hourly] errorLogThresholds', e?.message)));
  ctx.waitUntil(applyEtoToRoutingArms(env, {}).catch(e => console.warn('[cron/hourly] applyEtoToRoutingArms', e?.message)));
  ctx.waitUntil(
    runAgentsamMemoryVectorSync(env, { cronExpression: CRON_HOURLY }).catch((e) =>
      console.warn('[cron/hourly] agentsam_memory_oai3large_1536_sync', e?.message ?? e),
    ),
  );
}
