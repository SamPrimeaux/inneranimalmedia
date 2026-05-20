/** Every 30 minutes (worker.js parity). */

import { completeCronRun, failCronRun, startCronRun } from '../../core/cron-run-ledger.js';
import { runOvernightCronStep } from './overnight-progress.js';
import {
  reconcileRoutingArmsFromAgentRuns,
  rollupAgentsamModelRoutingMemory,
  enforceEvalSlosPauseArms,
  enforceTaskSlosFromRoutingMemory,
  syncRoutingArmPauseFromDrift,
  runRoutingAnalyticsRollups,
} from '../../core/routing-cron.js';
import { scanErrorLogThresholds } from '../../core/error-log-escalation.js';

const CRON_30 = '*/30 * * * *';

/** Mark long-running ledger rows as failed (no completion recorded). */
export async function sweepStaleCronRuns(env) {
  if (!env?.DB) return;
  const begun = await startCronRun(env, {
    jobName: 'agentsam_cron_runs_stuck_sweep',
    cronExpression: CRON_30,
    tenantId: null,
    workspaceId: null,
  });
  const runId = begun?.runId ?? null;
  const startedAt = begun?.startedAt ?? Date.now();
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
  } catch (e) {
    if (runId) await failCronRun(env, runId, startedAt, e);
    console.warn('[sweepStaleCronRuns]', e?.message ?? e);
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

export async function processQueues(env) {
  if (!env.DB) return;
  const begun = await startCronRun(env, {
    jobName: 'agent_request_queue_drain',
    cronExpression: CRON_30,
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
    const r = await env.DB.prepare(
      `UPDATE terminal_sessions
       SET status = 'closed', closed_at = unixepoch(), updated_at = unixepoch()
       WHERE status = 'active'
         AND updated_at < unixepoch() - 86400`,
    ).run();
    const closed = Number(r.meta?.changes ?? r.changes ?? 0) || 0;
    if (closed > 0) console.log('[cron] terminal_sessions swept:', closed, 'stale sessions closed');
    if (runId) await completeCronRun(env, runId, startedAt, { rowsRead: 0, rowsWritten: closed, metadata: {} });
  } catch (e) {
    if (runId) await failCronRun(env, runId, startedAt, e);
    console.warn('[cron] sweepStaleTerminalSessions', e?.message ?? e);
  }
}

export async function runThirtyMinuteJobs(env, ctx) {
  ctx.waitUntil(
    (async () => {
      await sweepStaleCronRuns(env);
      // routing jobs moved to hourly cron
    })(),
  );
  ctx.waitUntil(sweepExpiredApprovalQueue(env));
  ctx.waitUntil(processQueues(env));
  ctx.waitUntil(runOvernightCronStep(env));
  ctx.waitUntil(sweepStaleTerminalSessions(env));
}

export async function runHourlyRoutingJobs(env, ctx) {
  ctx.waitUntil(reconcileRoutingArmsFromAgentRuns(env).catch(e => console.warn('[cron/hourly] reconcileRoutingArms', e?.message)));
  ctx.waitUntil(rollupAgentsamModelRoutingMemory(env).catch(e => console.warn('[cron/hourly] rollupRoutingMemory', e?.message)));
  ctx.waitUntil(enforceTaskSlosFromRoutingMemory(env).catch(e => console.warn('[cron/hourly] enforceSlos', e?.message)));
  ctx.waitUntil(enforceEvalSlosPauseArms(env, { lookbackDays: 7 }).catch(e => console.warn('[cron/hourly] enforceEvalSlos', e?.message)));
  ctx.waitUntil(syncRoutingArmPauseFromDrift(env).catch(e => console.warn('[cron/hourly] syncPause', e?.message)));
  ctx.waitUntil(runRoutingAnalyticsRollups(env).catch(e => console.warn('[cron/hourly] analyticsRollup', e?.message)));
  ctx.waitUntil(scanErrorLogThresholds(env).catch(e => console.warn('[cron/hourly] errorLogThresholds', e?.message)));
}
