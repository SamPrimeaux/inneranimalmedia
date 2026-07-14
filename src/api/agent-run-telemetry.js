/**
 * POST /api/internal/agent-run-telemetry
 * Dual producer sink: in-app Agent Sam + Cursor desk stop hook.
 * Auth: INTERNAL_API_SECRET (or logged-in user).
 */
import { jsonResponse, verifyInternalApiSecret, getAuthUser } from '../core/auth.js';
import { fireAgentRunStopHooks } from '../core/agentsam-run-stop-hooks.js';

/**
 * @param {Request} request
 * @param {any} env
 * @param {any} [ctx]
 */
export async function handleAgentRunTelemetry(request, env, ctx) {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const internalOk = verifyInternalApiSecret(request, env);
  let authUser = null;
  if (!internalOk) {
    authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const success = body.success !== false && body.status !== 'failed' && body.status !== 'error';
  const sessionId = String(
    body.session_id || body.conversation_id || body.sessionId || '',
  ).trim();
  const workspaceId = String(body.workspace_id || body.workspaceId || '').trim();
  const tenantId = String(body.tenant_id || body.tenantId || 'tenant_inneranimalmedia').trim();
  const userId = String(
    body.user_id || body.userId || authUser?.id || authUser?.user_id || 'system',
  ).trim();
  const agentRunId = String(body.agent_run_id || body.agentRunId || body.run_id || '').trim();
  const source = String(body.source || 'cursor_stop').trim() || 'cursor_stop';

  if (!sessionId && !agentRunId) {
    return jsonResponse({ ok: false, error: 'session_id or agent_run_id required' }, 400);
  }

  const result = await fireAgentRunStopHooks(env, ctx, {
    success,
    agentRunId: agentRunId || `ext_${crypto.randomUUID().slice(0, 12)}`,
    sessionId: sessionId || agentRunId,
    conversationId: sessionId || agentRunId,
    tenantId,
    workspaceId: workspaceId || 'ws_inneranimalmedia',
    userId,
    modelKey: body.model_key || body.modelKey || null,
    provider: body.provider || null,
    errorMessage: body.error_message || body.error || null,
    inputTokens: Number(body.input_tokens || body.inputTokens) || 0,
    outputTokens: Number(body.output_tokens || body.outputTokens) || 0,
    costUsd: Number(body.cost_usd || body.costUsd) || 0,
    durationMs: Number(body.duration_ms || body.durationMs) || null,
    source,
  });

  return jsonResponse({
    ok: true,
    sink: 'agentsam_hook_execution+hyperdrive+agentsam_request_queue',
    ...result,
  });
}
