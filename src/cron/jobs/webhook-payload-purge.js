/**
 * Stale webhook rows: mark old received as ignored; strip payloads on terminal statuses.
 * Schedule: 0 3 * * * (UTC)
 */
import { completeCronRun, failCronRun, startCronRun } from '../../core/cron-run-ledger.js';

export async function runWebhookPayloadPurgeCron(env) {
  if (!env?.DB) return;
  const begun = await startCronRun(env, {
    jobName: 'webhook_payload_purge',
    cronExpression: '0 3 * * *',
    tenantId: null,
    workspaceId: null,
  });
  const runId = begun?.runId ?? null;
  const startedAt = begun?.startedAt ?? Date.now();
  let rowsRead = 0;
  let rowsWritten = 0;
  try {
    const ign = await env.DB.prepare(
      `UPDATE agentsam_webhook_events
       SET status='ignored'
       WHERE status='received'
         AND datetime(received_at) < datetime('now', '-7 days')`,
    ).run();
    rowsWritten += Number(ign.meta?.changes ?? ign.changes ?? 0) || 0;

    const nullPayload = await env.DB.prepare(
      `UPDATE agentsam_webhook_events
       SET payload_json = NULL,
           headers_json = NULL
       WHERE status != 'received'
         AND datetime(received_at) < datetime('now', '-24 hours')`,
    ).run();
    rowsWritten += Number(nullPayload.meta?.changes ?? nullPayload.changes ?? 0) || 0;
    rowsRead += 2;

    if (runId) {
      await completeCronRun(env, runId, startedAt, {
        rowsRead,
        rowsWritten,
        metadata: {},
      });
    }
  } catch (e) {
    if (runId) await failCronRun(env, runId, startedAt, e);
    console.warn('[cron] webhook_payload_purge', e?.message ?? e);
  }
}
