/**
 * POST /api/internal/trigger-workers-build
 * Triggers per-workspace Workers Builds Deploy Hook URL.
 * Auth: INTERNAL_API_SECRET (X-Internal-Secret or Bearer), or Bearer AGENTSAM_BRIDGE_KEY.
 */
import { verifyInternalApiSecret, jsonResponse } from '../core/auth.js';
import { postWorkersDeployHook, redactDeployHookUrl } from '../core/workers-deploy-hook.js';

function trim(v) {
  return v == null ? '' : String(v).trim();
}

function verifyBridgeOrInternal(request, env) {
  if (verifyInternalApiSecret(request, env)) return true;
  const auth = request.headers.get('Authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const bridge = trim(env?.AGENTSAM_BRIDGE_KEY);
  return Boolean(bridge && bearer && bearer === bridge);
}

export async function handleTriggerWorkersBuild(request, env, ctx) {
  void ctx;
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }
  if (!verifyBridgeOrInternal(request, env)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const workspaceId = trim(body.workspace_id) || trim(body.workspaceId) || 'ws_inneranimalmedia';
  const workerName = trim(body.worker_name) || trim(body.workerName) || null;

  const result = await postWorkersDeployHook(env, { workspaceId, workerName });
  if (result.error === 'deploy_hook_url not configured') {
    return jsonResponse({ error: result.error, workspace_id: workspaceId }, 503);
  }
  if (result.error && result.status === 0) {
    return jsonResponse({ error: result.error, workspace_id: workspaceId }, 400);
  }

  const buildUuid = result.json?.result?.build_uuid ?? result.json?.build_uuid ?? null;
  const httpOk = result.ok ? 200 : 502;
  return jsonResponse(
    {
      ok: result.ok,
      workspace_id: workspaceId,
      worker_name: workerName,
      deploy_hook_url_redacted: redactDeployHookUrl(result.deploy_hook_url),
      deploy_hook_source: result.source ?? null,
      build_uuid: buildUuid,
      http_status: result.status,
      cloudflare: result.json ?? null,
      detail: result.raw ?? null,
      error: result.error ?? null,
    },
    httpOk,
  );
}
