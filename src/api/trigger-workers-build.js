/**
 * POST /api/internal/trigger-workers-build
 * Triggers the Workers Builds Deploy Hook (agent-sam-trigger) via AGENT_SAM_DEPLOY_HOOK_URL.
 * Auth: INTERNAL_API_SECRET (X-Internal-Secret or Bearer), same as other internal routes.
 */
import { verifyInternalApiSecret, jsonResponse } from '../core/auth.js';
import { postAgentSamDeployHook } from '../core/workers-deploy-hook.js';

export async function handleTriggerWorkersBuild(request, env, ctx) {
  void ctx;
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }
  if (!verifyInternalApiSecret(request, env)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const result = await postAgentSamDeployHook(env);
  if (result.error === 'AGENT_SAM_DEPLOY_HOOK_URL not configured') {
    return jsonResponse({ error: result.error }, 503);
  }
  if (result.error && result.status === 0) {
    return jsonResponse({ error: result.error }, 400);
  }

  const httpOk = result.ok ? 200 : 502;
  return jsonResponse(
    {
      ok: result.ok,
      http_status: result.status,
      cloudflare: result.json ?? null,
      detail: result.raw ?? null,
      error: result.error ?? null,
    },
    httpOk,
  );
}
