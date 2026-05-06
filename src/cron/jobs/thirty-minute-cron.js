/** Every 30 minutes (worker.js parity). */

import { runOvernightCronStep } from './overnight-progress.js';

export async function processQueues(env) {
  if (!env.DB) return;
  try {
    const { results: sessions } = await env.DB.prepare(
      `SELECT DISTINCT session_id FROM agent_request_queue WHERE status = 'queued'`
    ).all();
    for (const { session_id } of sessions || []) {
      const task = await env.DB.prepare(
        `SELECT * FROM agent_request_queue WHERE session_id = ? AND status = 'queued' ORDER BY position ASC, created_at ASC LIMIT 1`
      ).bind(session_id).first();
      if (!task) continue;
      try {
        await env.DB.prepare(
          `UPDATE agent_request_queue SET status = 'running', updated_at = unixepoch() WHERE id = ?`
        ).bind(task.id).run();
        const payload = task.payload_json ? JSON.parse(task.payload_json) : {};
        await env.DB.prepare(
          `UPDATE agent_request_queue SET status = 'done', result_json = ?, updated_at = unixepoch() WHERE id = ?`
        ).bind(JSON.stringify({ success: true, payload: payload }), task.id).run();
      } catch (e) {
        await env.DB.prepare(
          `UPDATE agent_request_queue SET status = 'failed', result_json = ?, updated_at = unixepoch() WHERE id = ?`
        ).bind(JSON.stringify({ error: String(e?.message || e) }), task.id).run();
      }
    }
  } catch (e) {
    console.warn('[processQueues]', e?.message || e);
  }
}

/** Nightly: update agentsam_routing_arms performance scores from routing_decisions telemetry. */
export async function updateRoutingPerformanceScores(env) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(`
      UPDATE agentsam_routing_arms
      SET
        performance_score = (
          SELECT ROUND(AVG(CASE WHEN had_error = 0 THEN 100.0 ELSE 0.0 END), 2)
          FROM routing_decisions
          WHERE task_type = agentsam_routing_arms.task_type
            AND created_at > unixepoch('now', '-7 days')
        ),
        avg_latency_ms = (
          SELECT ROUND(AVG(latency_ms), 0)
          FROM routing_decisions
          WHERE task_type = agentsam_routing_arms.task_type
            AND latency_ms IS NOT NULL
            AND created_at > unixepoch('now', '-7 days')
        )
      WHERE task_type IN (
        SELECT DISTINCT task_type FROM routing_decisions
        WHERE created_at > unixepoch('now', '-7 days')
      )
    `).run();
    console.log('[cron] routing performance scores updated');
  } catch (e) {
    console.warn('[cron] updateRoutingPerformanceScores', e?.message ?? e);
  }
}

/** Close terminal_sessions idle > 24h so active-count stays accurate. */
export async function sweepStaleTerminalSessions(env) {
  if (!env.DB) return;
  try {
    const r = await env.DB.prepare(
      `UPDATE terminal_sessions
       SET status = 'closed', closed_at = unixepoch(), updated_at = unixepoch()
       WHERE status = 'active'
         AND updated_at < unixepoch() - 86400`
    ).run();
    const closed = r.meta?.changes ?? r.changes ?? 0;
    if (closed > 0) console.log('[cron] terminal_sessions swept:', closed, 'stale sessions closed');
  } catch (e) {
    console.warn('[cron] sweepStaleTerminalSessions', e?.message ?? e);
  }
}

export async function runThirtyMinuteJobs(env, ctx) {
  ctx.waitUntil(processQueues(env));
  ctx.waitUntil(runOvernightCronStep(env));
  ctx.waitUntil(sweepStaleTerminalSessions(env));
}
