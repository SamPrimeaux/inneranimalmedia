/**
 * POST /api/internal/cron-self-test — run a scheduled cron handler on demand.
 * Auth: INTERNAL_API_SECRET (Bearer or X-Internal-Secret).
 */
import { jsonResponse, verifyInternalApiSecret } from '../core/auth.js';
import { handleScheduled } from '../cron/scheduled.js';
import {
  runDailyMemoryPipeline,
} from '../cron/jobs/daily-memory-pipeline.js';

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
  const mode = body.mode === 'morning' || body.mode === 'evening' ? body.mode : null;
  const forceEmail = body.force === true || body.forceEmail === true;

  if (!cron && !mode) {
    return jsonResponse({
      error: 'cron_or_mode_required',
      detail: 'POST JSON: { "cron": "0 0 * * *" } or { "mode": "evening"|"morning", "force": true }',
    }, 400);
  }

  const startedAt = Date.now();
  try {
    if (mode === 'evening' || cron === '0 0 * * *') {
      const out = await runDailyMemoryPipeline(env, { mode: 'evening', ctx, forceEmail });
      return jsonResponse({
        ok: true,
        cron: cron || '0 0 * * *',
        job: 'evening_memory_email',
        mode: 'direct',
        forceEmail,
        result: out,
        duration_ms: Date.now() - startedAt,
      });
    }

    if (mode === 'morning' || cron === '30 13 * * *') {
      const out = await runDailyMemoryPipeline(env, { mode: 'morning', ctx, forceEmail });
      return jsonResponse({
        ok: true,
        cron: cron || '30 13 * * *',
        job: 'morning_focus_email',
        mode: 'direct',
        forceEmail,
        result: out,
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
        cron: cron || mode,
        error: e?.message != null ? String(e.message) : String(e),
        duration_ms: Date.now() - startedAt,
      },
      500,
    );
  }
}

export { sendEveningMemoryEmail, sendMorningFocusEmail } from '../cron/jobs/daily-memory-pipeline.js';