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
       WHERE received_at_unix < (unixepoch() - 14 * 86400)
         AND status IN ('processed','ignored','duplicate')`,
    ).run();
    rowsWritten += Number(del.meta?.changes ?? del.changes ?? 0) || 0;
    console.log('[cron] agentsam_webhook_events cleanup changes:', del.meta?.changes ?? del.changes ?? 0);
    const delNulled = await env.DB.prepare(
      `DELETE FROM agentsam_webhook_events
       WHERE received_at_unix < (unixepoch() - 14 * 86400)
         AND payload_json IS NULL`,
    ).run();
    rowsWritten += Number(delNulled.meta?.changes ?? delNulled.changes ?? 0) || 0;
    console.log(
      '[cron] agentsam_webhook_events null-payload cleanup changes:',
      delNulled.meta?.changes ?? delNulled.changes ?? 0,
    );
  } catch (e) {
    console.warn('[cron] agentsam_webhook_events DELETE cleanup', e?.message ?? e);
  }
  try {
    const upd = await env.DB.prepare(
      `UPDATE agentsam_webhook_events
       SET payload_json = NULL
       WHERE received_at_unix < (unixepoch() - 7 * 86400)
         AND status = 'processed'
         AND payload_json IS NOT NULL`,
    ).run();
    rowsWritten += Number(upd.meta?.changes ?? upd.changes ?? 0) || 0;
    console.log('[cron] agentsam_webhook_events payload compression changes:', upd.meta?.changes ?? upd.changes ?? 0);
  } catch (e) {
    console.warn('[cron] agentsam_webhook_events payload compress', e?.message ?? e);
  }
  try {
    const _bjId = 'bj_' + Date.now();
    await env.DB.prepare("INSERT OR IGNORE INTO agentsam_code_index_job (id,job_name,target_table,source_type,status,started_at,created_by) VALUES (?,?,?,'cron','running',unixepoch(),?)")
      .bind(_bjId, 'webhook_event_stats_rollup', 'webhook_event_stats', env.TENANT_ID ?? 'system') // system-scoped: no authenticated user context at this path
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
    const currentWeekStart = `(unixepoch() - ((CAST(strftime('%w', 'now') AS INTEGER) + 6) % 7) * 86400)
      - (CAST(strftime('%H', 'now') AS INTEGER) * 3600)
      - (CAST(strftime('%M', 'now') AS INTEGER) * 60)
      - CAST(strftime('%S', 'now') AS INTEGER)`;
    const weekRes = await env.DB.prepare(
      `INSERT OR REPLACE INTO agentsam_webhook_weekly (
         id, tenant_id, workspace_id, week_start, week_end, provider,
         total_received, total_processed, total_failed, rolled_up_at
       )
       SELECT
         'whw_' || lower(hex(randomblob(6))),
         COALESCE(e.tenant_id, 'system'),
         COALESCE(NULLIF(TRIM(e.workspace_id), ''), '__tenant__'),
         e.week_start,
         date(e.week_start, '+6 days'),
         e.provider,
         COUNT(*),
         SUM(CASE WHEN e.status = 'processed' THEN 1 ELSE 0 END),
         SUM(CASE WHEN e.status = 'failed' THEN 1 ELSE 0 END),
         unixepoch()
       FROM (
         SELECT
           tenant_id,
           workspace_id,
           provider,
           status,
           received_at_unix,
           strftime('%Y-%m-%d',
             datetime(
               received_at_unix
               - ((CAST(strftime('%w', datetime(received_at_unix, 'unixepoch')) AS INTEGER) + 6) % 7) * 86400
               - (CAST(strftime('%H', datetime(received_at_unix, 'unixepoch')) AS INTEGER) * 3600)
               - (CAST(strftime('%M', datetime(received_at_unix, 'unixepoch')) AS INTEGER) * 60)
               - CAST(strftime('%S', datetime(received_at_unix, 'unixepoch')) AS INTEGER),
               'unixepoch'
             )
           ) AS week_start,
           (received_at_unix
             - ((CAST(strftime('%w', datetime(received_at_unix, 'unixepoch')) AS INTEGER) + 6) % 7) * 86400
             - (CAST(strftime('%H', datetime(received_at_unix, 'unixepoch')) AS INTEGER) * 3600)
             - (CAST(strftime('%M', datetime(received_at_unix, 'unixepoch')) AS INTEGER) * 60)
             - CAST(strftime('%S', datetime(received_at_unix, 'unixepoch')) AS INTEGER)
           ) AS week_start_unix
         FROM agentsam_webhook_events
         WHERE received_at_unix IS NOT NULL
       ) e
       WHERE e.week_start_unix < ${currentWeekStart}
         AND NOT EXISTS (
           SELECT 1 FROM agentsam_webhook_weekly w
           WHERE w.tenant_id = COALESCE(e.tenant_id, 'system')
             AND w.workspace_id = COALESCE(NULLIF(TRIM(e.workspace_id), ''), '__tenant__')
             AND w.week_start = e.week_start
             AND w.provider = e.provider
         )
       GROUP BY COALESCE(e.tenant_id, 'system'),
                COALESCE(NULLIF(TRIM(e.workspace_id), ''), '__tenant__'),
                e.week_start,
                e.provider`,
    ).run();
    rowsWritten += Number(weekRes?.meta?.changes ?? weekRes?.changes ?? 0) || 0;
    console.log('[cron] agentsam_webhook_weekly rollup changes:', weekRes?.meta?.changes ?? weekRes?.changes ?? 0);
  } catch (e) {
    console.warn('[cron] agentsam_webhook_weekly rollup', e?.message ?? e);
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
