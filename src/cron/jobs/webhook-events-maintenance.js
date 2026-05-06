import { completeCronRun, failCronRun, startCronRun } from '../../core/cron-run-ledger.js';

export async function runWebhookEventsMaintenanceCron(env) {
  if (!env.DB) return;
  const begun = await startCronRun(env, {
    jobName: 'webhook_events_maintenance',
    cronExpression: '0 6 * * *',
    tenantId: null,
    workspaceId: null,
  });
  const runId = begun?.runId ?? null;
  const startedAt = begun?.startedAt ?? Date.now();
  let rowsRead = 0;
  let rowsWritten = 0;
  try {
    const del = await env.DB.prepare(
      `DELETE FROM agentsam_webhook_events
       WHERE processed_at < datetime('now', '-30 days')
       AND status IN ('processed','ignored','duplicate')`
    ).run();
    rowsWritten += Number(del.meta?.changes ?? del.changes ?? 0) || 0;
    console.log('[cron] agentsam_webhook_events cleanup changes:', del.meta?.changes ?? del.changes ?? 0);
  } catch (e) {
    console.warn('[cron] agentsam_webhook_events DELETE cleanup', e?.message ?? e);
  }
  try {
    const upd = await env.DB.prepare(
      `UPDATE agentsam_webhook_events
       SET payload_json = NULL
       WHERE processed_at < datetime('now', '-7 days')
       AND status = 'processed'
       AND payload_json IS NOT NULL`
    ).run();
    rowsWritten += Number(upd.meta?.changes ?? upd.changes ?? 0) || 0;
    console.log('[cron] agentsam_webhook_events payload compression changes:', upd.meta?.changes ?? upd.changes ?? 0);
  } catch (e) {
    console.warn('[cron] agentsam_webhook_events payload compress', e?.message ?? e);
  }
  try {
    const _bjId = 'bj_' + Date.now();
    await env.DB.prepare("INSERT OR IGNORE INTO agentsam_code_index_job (id,job_name,target_table,source_type,status,started_at,created_by) VALUES (?,?,?,'cron','running',unixepoch(),?)")
      .bind(_bjId, 'webhook_event_stats_rollup', 'webhook_event_stats', 'system')
      .run().catch(() => { });
    const _res = await env.DB.prepare(
      `INSERT OR REPLACE INTO webhook_event_stats
        (date, source, event_type, total, succeeded, failed)
       SELECT
        date(COALESCE(processed_at, datetime('now'))) AS date,
        provider AS source,
        event_type,
        COUNT(*) AS total,
        SUM(CASE WHEN status='processed' THEN 1 ELSE 0 END) AS succeeded,
        SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed
       FROM agentsam_webhook_events
       WHERE date(COALESCE(processed_at, datetime('now'))) = date('now', '-1 day')
       GROUP BY date, provider, event_type`
    ).run().catch(() => null);
    const inserted = Number(_res?.meta?.changes ?? _res?.changes ?? 0) || 0;
    rowsRead += 1;
    rowsWritten += inserted;
    await env.DB.prepare("UPDATE agentsam_code_index_job SET status='completed',records_processed=?,records_inserted=?,completed_at=unixepoch() WHERE id=?")
      .bind(inserted, inserted, _bjId)
      .run().catch(() => { });
    console.log('[cron] webhook_event_stats rollup completed');
  } catch (e) {
    console.warn('[cron] webhook_event_stats rollup', e?.message ?? e);
  }

  try {
    if (runId) {
      await completeCronRun(env, runId, startedAt, {
        rowsRead,
        rowsWritten,
        metadata: {},
      });
    }
  } catch (e) {
    if (runId) await failCronRun(env, runId, startedAt, e);
    console.warn('[cron] webhook-events-maintenance ledger', e?.message ?? e);
  }
}
