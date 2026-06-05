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
