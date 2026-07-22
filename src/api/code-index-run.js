/**
 * POST /api/internal/code-index/run — superadmin or internal secret; runs oldest idle chunk job.
 * Body (optional): { workspace_id, job_id }
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

  const body = await request.json().catch(() => ({}));
  const workspaceId =
    typeof body?.workspace_id === 'string' && body.workspace_id.trim()
      ? body.workspace_id.trim()
      : null;
  const jobId =
    typeof body?.job_id === 'string' && body.job_id.trim() ? body.job_id.trim() : null;

  const startedAt = Date.now();
  const work = runPendingCodeIndexJob(env, {
    startedAt,
    cpuBudgetMs: 22_000,
    workspaceId,
    jobId,
  });

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
      workspace_id: workspaceId,
      job_id: jobId,
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
    workspace_id: workspaceId,
    ...result,
  });
}
