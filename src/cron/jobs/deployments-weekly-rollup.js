export async function runDeploymentsWeeklyRollup(env) {
  if (!env?.DB) return;
  try {
    const now = new Date();
    // This function is gated to Mondays (UTC) by the scheduler.
    const thisMonday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const day = thisMonday.getUTCDay();
    thisMonday.setUTCDate(thisMonday.getUTCDate() - ((day + 6) % 7)); // move to Monday of current week
    const lastMonday = new Date(thisMonday);
    lastMonday.setUTCDate(lastMonday.getUTCDate() - 7);
    const weekStart = lastMonday.toISOString().slice(0, 10);
    const weekEnd = thisMonday.toISOString().slice(0, 10);
    const stats = await env.DB.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) AS success,
        SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed,
        SUM(COALESCE(deploy_duration_ms,0)) AS total_duration_ms
      FROM deployments
      WHERE datetime(timestamp) >= datetime(?)
        AND datetime(timestamp) < datetime(?)
    `).bind(weekStart, weekEnd).first().catch(() => null);
    const workers = await env.DB.prepare(`
      SELECT worker_name, COUNT(*) AS c
      FROM deployments
      WHERE datetime(timestamp) >= datetime(?)
        AND datetime(timestamp) < datetime(?)
      GROUP BY worker_name
      ORDER BY c DESC
      LIMIT 25
    `).bind(weekStart, weekEnd).all().catch(() => ({ results: [] }));
    const workersJson = JSON.stringify(Object.fromEntries((workers.results || []).map(r => [r.worker_name || 'unknown', Number(r.c) || 0])));
    const topTrig = await env.DB.prepare(`
      SELECT triggered_by, COUNT(*) AS c
      FROM deployments
      WHERE datetime(timestamp) >= datetime(?)
        AND datetime(timestamp) < datetime(?)
      GROUP BY triggered_by
      ORDER BY c DESC
      LIMIT 1
    `).bind(weekStart, weekEnd).first().catch(() => null);
    const totalDeploys = Number(stats?.total) || 0;
    const totalDurationMs = Number(stats?.total_duration_ms) || 0;
    const avgDurationMs = totalDeploys > 0 ? (totalDurationMs / totalDeploys) : 0;

    await env.DB.prepare(
      `INSERT OR REPLACE INTO deployments_weekly_rollup
        (tenant_id, week_start, week_end, total_deploys, success_count, failed_count,
         total_duration_ms, avg_duration_ms, per_worker_json, top_triggered_by, notes, rolled_up_at)
       VALUES ('tenant_sam_primeaux', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())`
    ).bind(
      weekStart,
      weekEnd,
      totalDeploys,
      Number(stats?.success) || 0,
      Number(stats?.failed) || 0,
      totalDurationMs,
      avgDurationMs,
      workersJson,
      topTrig?.triggered_by != null ? String(topTrig.triggered_by) : null,
      `auto rollup ${weekStart}..${weekEnd}`
    ).run().catch(() => { });

    // Always log for analysis, even if rollup table doesn't exist
    await env.DB.prepare(
      `INSERT INTO agentsam_tool_call_log
        (tenant_id, tool_name, status, duration_ms, input_summary, output_summary, tool_category, user_id)
       VALUES ('tenant_sam_primeaux','deployments_weekly_rollup','success',0,?,?,'rollup','au_871d920d1233cbd1')`
    ).bind(
      `week_start=${weekStart} week_end=${weekEnd}`,
      `total=${totalDeploys} success=${Number(stats?.success) || 0} failed=${Number(stats?.failed) || 0} workers=${workers.results?.length || 0} top_triggered_by=${topTrig?.triggered_by || 'n/a'}`
    ).run().catch(() => { });
  } catch (e) {
    await env.DB.prepare(
      `INSERT INTO agentsam_tool_call_log
        (tenant_id, tool_name, status, error_message, tool_category, user_id)
       VALUES ('tenant_sam_primeaux','deployments_weekly_rollup','error',?,'rollup','au_871d920d1233cbd1')`
    ).bind(e?.message ?? String(e)).run().catch(() => { });
  }
}
