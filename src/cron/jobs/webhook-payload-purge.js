/**
 * Stale webhook rows: mark old received as ignored; purge processed payloads; delete old processed rows.
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
  const purgeCutoff = '(unixepoch() - 30 * 86400)';
  const ignoreCutoff = '(unixepoch() - 7 * 86400)';
  const stripCutoff = '(unixepoch() - 86400)';

  try {
    const ign = await env.DB.prepare(
      `UPDATE agentsam_webhook_events
       SET status = 'ignored'
       WHERE status = 'received'
         AND received_at_unix < ${ignoreCutoff}`,
    ).run();
    rowsWritten += Number(ign.meta?.changes ?? ign.changes ?? 0) || 0;

    const nullPayload = await env.DB.prepare(
      `UPDATE agentsam_webhook_events
       SET payload_json = NULL,
           headers_json = NULL
       WHERE status != 'received'
         AND received_at_unix < ${stripCutoff}
         AND (payload_json IS NOT NULL OR headers_json IS NOT NULL)`,
    ).run();
    rowsWritten += Number(nullPayload.meta?.changes ?? nullPayload.changes ?? 0) || 0;

    const del = await env.DB.prepare(
      `DELETE FROM agentsam_webhook_events
       WHERE received_at_unix < ${purgeCutoff}
         AND status = 'processed'`,
    ).run();
    rowsWritten += Number(del.meta?.changes ?? del.changes ?? 0) || 0;
    rowsRead += 3;

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
