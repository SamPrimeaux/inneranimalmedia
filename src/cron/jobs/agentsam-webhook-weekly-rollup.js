export async function runAgentsamWebhookWeeklyRollup(env) {
  if (!env?.DB) return;
  const now = new Date();
  const thisMonday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = thisMonday.getUTCDay();
  thisMonday.setUTCDate(thisMonday.getUTCDate() - ((day + 6) % 7));
  const lastMonday = new Date(thisMonday);
  lastMonday.setUTCDate(lastMonday.getUTCDate() - 7);
  const weekStart = lastMonday.toISOString().slice(0, 10);
  const weekEnd = thisMonday.toISOString().slice(0, 10);
  try {
    const stats = await env.DB.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status='processed' THEN 1 ELSE 0 END) AS processed,
        SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed
      FROM agentsam_webhook_events
      WHERE datetime(COALESCE(processed_at, datetime('now'))) >= datetime(?)
        AND datetime(COALESCE(processed_at, datetime('now'))) < datetime(?)
    `).bind(weekStart, weekEnd).first().catch(() => null);
    const bySource = await env.DB.prepare(`
      SELECT provider AS source, COUNT(*) AS c
      FROM agentsam_webhook_events
      WHERE datetime(COALESCE(processed_at, datetime('now'))) >= datetime(?)
        AND datetime(COALESCE(processed_at, datetime('now'))) < datetime(?)
      GROUP BY provider
      ORDER BY c DESC
      LIMIT 50
    `).bind(weekStart, weekEnd).all().catch(() => ({ results: [] }));
    const byType = await env.DB.prepare(`
      SELECT event_type, COUNT(*) AS c
      FROM agentsam_webhook_events
      WHERE datetime(COALESCE(processed_at, datetime('now'))) >= datetime(?)
        AND datetime(COALESCE(processed_at, datetime('now'))) < datetime(?)
      GROUP BY event_type
      ORDER BY c DESC
      LIMIT 100
    `).bind(weekStart, weekEnd).all().catch(() => ({ results: [] }));
    const perSourceJson = JSON.stringify(Object.fromEntries((bySource.results || []).map(r => [r.source || 'unknown', Number(r.c) || 0])));
    const perTypeJson = JSON.stringify(Object.fromEntries((byType.results || []).map(r => [r.event_type || 'unknown', Number(r.c) || 0])));

    await env.DB.prepare(
      `INSERT OR REPLACE INTO agentsam_webhook_weekly
        (tenant_id, week_start, week_end, total_events, processed_count, failed_count,
         per_source_json, per_event_type_json, rolled_up_at)
       VALUES ('tenant_sam_primeaux', ?, ?, ?, ?, ?, ?, ?, unixepoch())`
    ).bind(
      weekStart,
      weekEnd,
      Number(stats?.total) || 0,
      Number(stats?.processed) || 0,
      Number(stats?.failed) || 0,
      perSourceJson,
      perTypeJson
    ).run().catch(() => { });
  } catch (e) {
    console.warn('[cron] agentsam_webhook_weekly rollup', e?.message ?? e);
  }
}
