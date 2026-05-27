/**
 * POST /api/internal/cron-self-test — run a scheduled cron handler on demand.
 * Auth: INTERNAL_API_SECRET (Bearer or X-Internal-Secret).
 */
import { jsonResponse, verifyInternalApiSecret } from '../core/auth.js';
import { handleScheduled } from '../cron/scheduled.js';
import { sendDailyPlanEmail } from '../cron/jobs/daily-plan-email.js';

/**
 * @param {Request} request
 * @param {any} env
 * @param {ExecutionContext} ctx
 */
export async function handleCronSelfTest(request, env, ctx) {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }
  if (!verifyInternalApiSecret(request, env)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    /* empty body */
  }

  const cron = typeof body.cron === 'string' ? body.cron.trim() : '';
  if (!cron) {
    return jsonResponse({ error: 'cron_required', detail: 'POST JSON body: { "cron": "30 13 * * *" }' }, 400);
  }

  const startedAt = Date.now();
  try {
    if (cron === '30 13 * * *') {
      await sendDailyPlanEmail(env);
      return jsonResponse({
        ok: true,
        cron,
        job: 'daily_plan_email',
        mode: 'direct',
        duration_ms: Date.now() - startedAt,
      });
    }

    await handleScheduled({ cron }, env, ctx);
    return jsonResponse({
      ok: true,
      cron,
      mode: 'handleScheduled',
      duration_ms: Date.now() - startedAt,
    });
  } catch (e) {
    return jsonResponse(
      {
        ok: false,
        cron,
        error: e?.message != null ? String(e.message) : String(e),
        duration_ms: Date.now() - startedAt,
      },
      500,
    );
  }
}
