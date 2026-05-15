/**
 * Single entry for Worker `scheduled()` — maps `event.cron` to lifted jobs (worker.js parity).
 * See `./matrix.js` for expression → handler reference.
 */
import { runIntegritySnapshot } from '../api/integrity';
import { runMidnightUtcJobs, scheduleOneAmMaintenance } from './jobs/midnight-utc.js';
import { runFinancialCommandCron } from './jobs/financial-command-cron.js';
import { sendDailyPlanEmail } from './jobs/daily-plan-email.js';
import { runWeeklyRollup } from './jobs/weekly-rollup.js';
import { runSpendLedgerRollup } from './jobs/spend-ledger-rollup.js';
import { scheduleSixAmRagJobs } from './jobs/rag-six-am.js';
import { writeDailySnapshot } from './jobs/write-daily-snapshot.js';
import { runThirtyMinuteJobs, runHourlyRoutingJobs } from './jobs/thirty-minute-cron.js';
import { runWebhookPayloadPurgeCron } from './jobs/webhook-payload-purge.js';

/**
 * @param {ScheduledEvent} event
 * @param {any} env
 * @param {ExecutionContext} ctx
 */
export async function handleScheduled(event, env, ctx) {
  const cron = event.cron;
  console.log('[Cron] Execution starting:', cron);

  switch (cron) {
    case '*/30 * * * *':
      await runThirtyMinuteJobs(env, ctx);
      break;

    /** Hourly trigger is registered in wrangler but unused in legacy worker.scheduled (final block). */
    case '0 * * * *':
      await runHourlyRoutingJobs(env, ctx);
      break;

    case '0 0 * * *':
      await runMidnightUtcJobs(env, ctx);
      break;

    case '0 1 * * *':
      scheduleOneAmMaintenance(env, ctx);
      break;

    case '0 3 * * *':
      ctx.waitUntil(runWebhookPayloadPurgeCron(env));
      break;

    case '10 0 * * *':
      if (env?.DB) {
        ctx.waitUntil(writeDailySnapshot(env, 'cron_0010').catch(() => {}));
      }
      break;

    case '0 6 * * *':
      scheduleSixAmRagJobs(env, ctx);
      break;

    case '0 9 * * *':
      ctx.waitUntil(runFinancialCommandCron(env, ctx));
      break;

    case '0 9 * * 1':
      ctx.waitUntil(
        runIntegritySnapshot(env, 'cron').catch((e) =>
          console.warn('[cron] runIntegritySnapshot', e?.message ?? e),
        ),
      );
      break;

    case '0 1 * * sun':
      if (env?.DB) {
        ctx.waitUntil(runWeeklyRollup(env));
      }
      break;

    case '30 13 * * *':
      ctx.waitUntil(sendDailyPlanEmail(env));
      break;

    case '0 0 1 * *':
      ctx.waitUntil(runSpendLedgerRollup(env));
      break;

    default:
      console.warn('[cron] unhandled_cron_expression', cron);
  }
}
