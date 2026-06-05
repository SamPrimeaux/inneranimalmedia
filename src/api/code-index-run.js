/**
 * POST /api/internal/code-index/run — superadmin or internal secret; runs oldest idle code index job.
 */
import { jsonResponse, verifyInternalApiSecret, getAuthUser, authUserIsSuperadmin } from '../core/auth.js';
import { runPendingCodeIndexJob } from '../core/code-indexer.js';

/**
 * @param {Request} request
 * @param {any} env
 * @param {ExecutionContext} ctx
 */
export async function handleCodeIndexRun(request, env, ctx) {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const internalOk = verifyInternalApiSecret(request, env);
  if (!internalOk) {
    const authUser = await getAuthUser(request, env);
    if (!authUser || !authUserIsSuperadmin(authUser)) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
  }

  if (!env?.DB) {
    return jsonResponse({ ok: false, error: 'DB not configured' }, 503);
  }

  const startedAt = Date.now();
  const work = runPendingCodeIndexJob(env, { startedAt, cpuBudgetMs: 22_000 });

  if (ctx?.waitUntil) {
    ctx.waitUntil(
      work.catch((e) => {
        console.warn('[code-index-run]', e?.message ?? e);
      }),
    );
    const kickoff = await Promise.race([
      work,
      new Promise((resolve) => setTimeout(() => resolve({ ok: true, mode: 'background' }), 1200)),
    ]);
    return jsonResponse({
      ok: true,
      mode: kickoff?.mode === 'background' ? 'background' : 'inline',
      started_at: startedAt,
      ...(kickoff && typeof kickoff === 'object' ? kickoff : {}),
      hint:
        kickoff?.mode === 'background'
          ? 'Job continues via waitUntil — poll agentsam_code_index_job for status'
          : undefined,
    });
  }

  const result = await work;
  return jsonResponse({
    ok: result.ok !== false,
    mode: 'inline',
    duration_ms: Date.now() - startedAt,
    ...result,
  });
}
