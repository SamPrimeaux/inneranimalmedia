/**
 * Periodic jobs for Thompson arms, routing memory, drift pause, and execution metrics rollups.
 */

import { startCronRun, completeCronRun, failCronRun } from './cron-run-ledger.js';
import { pragmaTableInfo } from './retention.js';
import { rollupExecutionPerformanceMetrics } from './memory.js';

const CRON_30 = '*/30 * * * *';

/**
 * After routing-memory rollup, pause routing arms when task SLOs are breached (best-effort).
 * @param {any} env
 */
export async function enforceTaskSlosFromRoutingMemory(env) {
  if (!env?.DB) return;
  const sloCols = await pragmaTableInfo(env.DB, 'agentsam_task_slos');
  const armCols = await pragmaTableInfo(env.DB, 'agentsam_routing_arms');
  if (!sloCols.size || !armCols.has('task_type') || !armCols.has('is_paused')) return;
  if (!sloCols.has('pause_arm_on_breach')) return;

  const { results: slos } = await env.DB
    .prepare(
      `SELECT ts.task_type, ts.sla_p95_latency_ms, ts.sla_avg_cost_usd, ts.sla_min_quality,
              ts.pause_arm_on_breach,
              AVG(rm.avg_latency_ms) AS actual_latency, AVG(rm.avg_cost_usd) AS actual_cost,
              AVG(rm.success_rate) AS actual_quality
       FROM agentsam_task_slos ts
       LEFT JOIN agentsam_model_routing_memory rm ON rm.task_type = ts.task_type
       GROUP BY ts.task_type`,
    )
    .all()
    .catch(() => ({ results: [] }));

  for (const slo of slos || []) {
    const pauseCol = Number(slo.pause_arm_on_breach) === 1;
    if (!pauseCol) continue;
    const lat = slo.actual_latency != null ? Number(slo.actual_latency) : null;
    const cost = slo.actual_cost != null ? Number(slo.actual_cost) : null;
    const qual = slo.actual_quality != null ? Number(slo.actual_quality) : null;
    const latencyBreach =
      lat != null &&
      Number.isFinite(lat) &&
      Number.isFinite(Number(slo.sla_p95_latency_ms)) &&
      lat > Number(slo.sla_p95_latency_ms);
    const costBreach =
      cost != null &&
      Number.isFinite(cost) &&
      Number.isFinite(Number(slo.sla_avg_cost_usd)) &&
      cost > Number(slo.sla_avg_cost_usd);
    const qualityBreach =
      qual != null &&
      Number.isFinite(qual) &&
      Number.isFinite(Number(slo.sla_min_quality)) &&
      qual < Number(slo.sla_min_quality);
    console.log('[slo]', slo.task_type, { latencyBreach, costBreach, qualityBreach });
    if (!latencyBreach && !costBreach && !qualityBreach) continue;
    const taskType = slo.task_type != null ? String(slo.task_type).trim() : '';
    if (!taskType) continue;
    if (armCols.has('pause_reason')) {
      await env.DB
        .prepare(
          `UPDATE agentsam_routing_arms SET is_paused = 1, pause_reason = 'slo_breach', updated_at = unixepoch()
           WHERE task_type = ? AND COALESCE(is_paused, 0) = 0`,
        )
        .bind(taskType)
        .run()
        .catch(() => {});
    } else {
      await env.DB
        .prepare(
          `UPDATE agentsam_routing_arms SET is_paused = 1, updated_at = unixepoch()
           WHERE task_type = ? AND COALESCE(is_paused, 0) = 0`,
        )
        .bind(taskType)
        .run()
        .catch(() => {});
    }
  }
}

/** Reconcile Beta counts + decayed_score from recent agentsam_agent_run rows (replaces legacy routing_decisions cron). */
export async function reconcileRoutingArmsFromAgentRuns(env) {
  if (!env?.DB) return;
  const runCols = await pragmaTableInfo(env.DB, 'agentsam_agent_run');
  const armCols = await pragmaTableInfo(env.DB, 'agentsam_routing_arms');
  if (!runCols.size || !runCols.has('routing_arm_id') || !armCols.size) return;

  const begun = await startCronRun(env, {
    jobName: 'routing_arms_reconcile_agent_run',
    cronExpression: CRON_30,
    tenantId: null,
    workspaceId: null,
  });
  const runId = begun?.runId ?? null;
  const startedAt = begun?.startedAt ?? Date.now();
  try {
    const dateFilter = runCols.has('created_at')
      ? `AND datetime(COALESCE(r.created_at, '1970-01-01')) >= datetime('now', '-7 days')`
      : '';

    const r1 = await env.DB
      .prepare(
        `
      UPDATE agentsam_routing_arms SET
        success_alpha = MAX(1.0, 1.0 + COALESCE((
          SELECT COUNT(*) FROM agentsam_agent_run r
          WHERE r.routing_arm_id = agentsam_routing_arms.id
            AND COALESCE(r.status, '') = 'completed'
            ${dateFilter}
        ), 0)),
        success_beta = MAX(1.0, 1.0 + COALESCE((
          SELECT COUNT(*) FROM agentsam_agent_run r
          WHERE r.routing_arm_id = agentsam_routing_arms.id
            AND COALESCE(r.status, '') != 'completed'
            ${dateFilter}
        ), 0)),
        updated_at = unixepoch()
      WHERE id IN (SELECT DISTINCT routing_arm_id FROM agentsam_agent_run WHERE routing_arm_id IS NOT NULL)
    `,
      )
      .run();

    const r2 = await env.DB
      .prepare(
        `
      UPDATE agentsam_routing_arms SET
        decayed_score = success_alpha / NULLIF(success_alpha + success_beta, 0),
        updated_at = unixepoch()
      WHERE id IN (SELECT DISTINCT routing_arm_id FROM agentsam_agent_run WHERE routing_arm_id IS NOT NULL)
    `,
      )
      .run();

    const rowsWritten =
      (Number(r1.meta?.changes ?? r1.changes ?? 0) || 0) +
      (Number(r2.meta?.changes ?? r2.changes ?? 0) || 0);
    if (runId) await completeCronRun(env, runId, startedAt, { rowsRead: 2, rowsWritten, metadata: {} });
  } catch (e) {
    if (runId) await failCronRun(env, runId, startedAt, e);
    console.warn('[cron] reconcileRoutingArmsFromAgentRuns', e?.message ?? e);
  }
}

/** Roll agentsam_agent_run → agentsam_model_routing_memory (aggregate priors for cold-start). */
export async function rollupAgentsamModelRoutingMemory(env) {
  if (!env?.DB) return;
  const mem = await pragmaTableInfo(env.DB, 'agentsam_model_routing_memory');
  const run = await pragmaTableInfo(env.DB, 'agentsam_agent_run');
  if (!mem.size || !run.size || !run.has('routing_arm_id')) return;

  const begun = await startCronRun(env, {
    jobName: 'agentsam_model_routing_memory_rollup',
    cronExpression: CRON_30,
    tenantId: null,
    workspaceId: null,
  });
  const runId = begun?.runId ?? null;
  const startedAt = begun?.startedAt ?? Date.now();
  try {
    await env.DB
      .prepare(
        `
      INSERT INTO agentsam_model_routing_memory (
        id, workspace_id, task_type, model_key,
        success_rate, avg_latency_ms, avg_cost_usd,
        code_pass_rate, hallucination_rate, sample_count, updated_at
      )
      SELECT
        'mrm_' || lower(hex(randomblob(8))),
        COALESCE(
          NULLIF(trim(r.workspace_id), ''),
          NULLIF(trim(ar.workspace_id), ''),
          ''
        ),
        ar.task_type,
        ar.model_key,
        AVG(CASE WHEN COALESCE(r.status, '') = 'completed' THEN 1.0 ELSE 0.0 END),
        AVG(
          CASE
            WHEN r.started_at IS NOT NULL AND r.completed_at IS NOT NULL THEN
              (julianday(r.completed_at) - julianday(r.started_at)) * 86400000.0
            ELSE NULL
          END
        ),
        AVG(COALESCE(r.cost_usd, 0)),
        NULL,
        NULL,
        COUNT(*),
        unixepoch()
      FROM agentsam_agent_run r
      INNER JOIN agentsam_routing_arms ar ON ar.id = r.routing_arm_id
      WHERE r.routing_arm_id IS NOT NULL
        AND datetime(COALESCE(r.created_at, '1970-01-01')) >= datetime('now', '-14 days')
      GROUP BY COALESCE(NULLIF(trim(r.workspace_id), ''), ''), ar.task_type, ar.model_key
      ON CONFLICT(workspace_id, task_type, model_key) DO UPDATE SET
        success_rate = excluded.success_rate,
        avg_latency_ms = excluded.avg_latency_ms,
        avg_cost_usd = excluded.avg_cost_usd,
        sample_count = excluded.sample_count,
        updated_at = unixepoch()
    `,
      )
      .run();
    if (runId) await completeCronRun(env, runId, startedAt, { rowsRead: 1, rowsWritten: 1, metadata: {} });
  } catch (e) {
    if (runId) await failCronRun(env, runId, startedAt, e);
    console.warn('[cron] rollupAgentsamModelRoutingMemory', e?.message ?? e);
  }
}

/** Pause arms on active drift regressions; resume when drift rows are acknowledged. */
export async function syncRoutingArmPauseFromDrift(env) {
  if (!env?.DB) return;
  const driftCols = await pragmaTableInfo(env.DB, 'agentsam_model_drift_signals');
  const armCols = await pragmaTableInfo(env.DB, 'agentsam_routing_arms');
  if (!driftCols.size || !armCols.size || !armCols.has('is_paused')) return;

  const begun = await startCronRun(env, {
    jobName: 'routing_arms_drift_pause_sync',
    cronExpression: CRON_30,
    tenantId: null,
    workspaceId: null,
  });
  const runId = begun?.runId ?? null;
  const startedAt = begun?.startedAt ?? Date.now();
  let rowsWritten = 0;
  try {
    if (driftCols.has('acknowledged') && driftCols.has('severity') && driftCols.has('model_key')) {
      const r1 = await env.DB
        .prepare(
          `
        UPDATE agentsam_routing_arms AS a
        SET
          is_paused = 1,
          pause_reason = 'drift_regression',
          drift_signal_id = (
            SELECT s.id FROM agentsam_model_drift_signals s
            WHERE COALESCE(s.acknowledged, 0) = 0
              AND s.severity IN ('regression', 'breaking')
              AND s.model_key = a.model_key
              AND (s.task_type = a.task_type OR s.task_type IS NULL OR trim(COALESCE(s.task_type,'')) = '')
            ORDER BY COALESCE(s.detected_at, s.id) DESC
            LIMIT 1
          ),
          updated_at = unixepoch()
        WHERE a.is_paused = 0
          AND EXISTS (
            SELECT 1 FROM agentsam_model_drift_signals s
            WHERE COALESCE(s.acknowledged, 0) = 0
              AND s.severity IN ('regression', 'breaking')
              AND s.model_key = a.model_key
              AND (s.task_type = a.task_type OR s.task_type IS NULL OR trim(COALESCE(s.task_type,'')) = '')
          )
      `,
        )
        .run();
      rowsWritten += Number(r1.meta?.changes ?? r1.changes ?? 0) || 0;
    }

    if (driftCols.has('acknowledged') && armCols.has('drift_signal_id')) {
      const r2 = await env.DB
        .prepare(
          `
        UPDATE agentsam_routing_arms SET
          is_paused = 0,
          pause_reason = NULL,
          drift_signal_id = NULL,
          updated_at = unixepoch()
        WHERE drift_signal_id IS NOT NULL
          AND drift_signal_id IN (
            SELECT id FROM agentsam_model_drift_signals WHERE COALESCE(acknowledged, 0) = 1
          )
      `,
        )
        .run();
      rowsWritten += Number(r2.meta?.changes ?? r2.changes ?? 0) || 0;
    }

    if (runId) {
      await completeCronRun(env, runId, startedAt, { rowsRead: 1, rowsWritten, metadata: {} });
    }
  } catch (e) {
    if (runId) await failCronRun(env, runId, startedAt, e);
    console.warn('[cron] syncRoutingArmPauseFromDrift', e?.message ?? e);
  }
}

/** Best-effort: refresh execution performance metrics + tool stats alongside arm maintenance. */
export async function runRoutingAnalyticsRollups(env) {
  if (!env?.DB) return;
  const begun = await startCronRun(env, {
    jobName: 'routing_analytics_rollups',
    cronExpression: CRON_30,
    tenantId: null,
    workspaceId: null,
  });
  const runId = begun?.runId ?? null;
  const startedAt = begun?.startedAt ?? Date.now();
  try {
    await rollupExecutionPerformanceMetrics(env);
    if (runId) await completeCronRun(env, runId, startedAt, { rowsRead: 0, rowsWritten: 0, metadata: {} });
  } catch (e) {
    if (runId) await failCronRun(env, runId, startedAt, e);
    console.warn('[cron] runRoutingAnalyticsRollups', e?.message ?? e);
  }
}
