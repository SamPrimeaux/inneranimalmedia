/**
 * Agent Sam chat spine — login → mode → RuntimeProfile → model (Thompson if auto) → tool loop.
 * Replaces the boolean maze in agent.js for standard composer chat.
 */
import { jsonResponse } from '../core/responses.js';
import {
  resolveRuntimeProfile,
  logRuntimeProfile,
  logRouteContract,
} from '../core/runtime-profile.js';
import { normalizeAgentRuntimeMode } from '../core/agent-mode.js';
import {
  hasImageGenerationIntent,
  isPrimaryImageGenerationIntent,
  handleDirectImageGenerationChatStream,
} from '../tools/image_generation.js';
import { isCodeImplementationIntent } from '../core/code-implementation-intent.js';
import { executeAskTurn } from '../core/mode-controllers/ask-controller.js';
import { executePlanTurn } from '../core/mode-controllers/plan-controller.js';
import { executeAgentTurn } from '../core/mode-controllers/agent-controller.js';
import { resolveSkillSpawnRouting } from '../core/agent-lane-router.js';
import { executeDebugTurn } from '../core/mode-controllers/debug-controller.js';
import { executeMultitaskTurn } from '../core/mode-controllers/multitask-controller.js';
import { resolveIntegrationUserId } from '../core/integration-user-id.js';
import {
  scheduleChatSessionTitleInsert,
  scheduleWorkspaceStateConversationUpdate,
} from '../core/agentsam-chat-sessions.js';
import { loadProjectContextSystemBlock } from '../core/project-context-budget.js';
import { normalizePlanModeMessage } from '../core/plan-mode-utils.js';

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  'Access-Control-Allow-Origin': '*',
};

/**
 * @param {any} env
 * @param {Request} request
 * @param {any} ctx
 * @param {Record<string, unknown>} pre
 * @returns {Promise<Response>}
 */
export async function executeAgentChatSpine(env, request, ctx, pre) {
  const body = /** @type {Record<string, unknown>} */ (pre.body || {});
  const rawMessage = String(pre.message || '').trim();
  const planNorm = normalizePlanModeMessage(rawMessage, body);
  const message = planNorm.message;
  if (planNorm.forcePlan) {
    body.force_plan_mode = true;
  }
  if (planNorm.refinePlanId) {
    body.plan_id = planNorm.refinePlanId;
    body.refine_plan = true;
  }
  const tenantId = pre.tenantId != null ? String(pre.tenantId) : null;
  let userId = pre.userId != null ? String(pre.userId) : null;
  if (userId) {
    const canonicalUserId = await resolveIntegrationUserId(env, { id: userId });
    if (canonicalUserId) userId = canonicalUserId;
  }
  const workspaceId = pre.workspaceId != null ? String(pre.workspaceId).trim() : null;
  const sessionId = pre.sessionId != null ? String(pre.sessionId) : null;
  if (!workspaceId) {
    return jsonResponse({ error: 'workspace_resolution_failed' }, 400);
  }
  const authUser = pre.authUser || { id: userId, tenant_id: tenantId };
  const quickstartBatch = pre.quickstartBatch != null ? String(pre.quickstartBatch) : '';
  const activeFileEnvelope = pre.activeFileEnvelope ?? null;
  const subagentProfileRow = pre.subagentProfileRow ?? null;
  const browserContextPayload = pre.browserContextPayload ?? null;
  const handoffResume = pre.handoffResume ?? null;
  const agentChatResolvedContext = pre.agentChatResolvedContext ?? null;

  // NOTE: requestedMode is only used to compile the immutable RuntimeProfile.
  // Dispatch must always use profile.mode_controller.
  let requestedMode = normalizeAgentRuntimeMode(pre.requestedMode ?? body.mode);
  if (planNorm.forcePlan) requestedMode = 'plan';

  const rawModel =
    body.model ?? body.model_key ?? body.modelKey ?? pre.handoffResume?.fallbackModelKey ?? null;
  const modelOverride =
    rawModel != null && String(rawModel).trim() !== '' && String(rawModel).trim().toLowerCase() !== 'auto'
      ? String(rawModel).trim()
      : null;

  const profile = await resolveRuntimeProfile(env, {
    mode: requestedMode,
    message,
    session: { userId, workspaceId, tenantId, conversationId: sessionId },
    overrides: {
      model_key: modelOverride,
      subagent_slug: body.subagent_slug ?? body.subagentSlug ?? null,
      route_key: body.route_key ?? body.routeKey ?? null,
      task_type: body.task_type ?? body.taskType ?? null,
    },
    compile_lane: 'live',
  });

  profile.source.compile_lane = 'live';
  logRuntimeProfile(profile, { path: 'executeAgentChatSpine', conversation_id: sessionId, live: true });
  logRouteContract(profile, {
    requestedMode: requestedMode,
    routeKey: profile.refined_route_key || profile.mode,
    taskType: profile.routing_task_type,
  });

  scheduleChatSessionTitleInsert(env, ctx, {
    conversationId: sessionId,
    tenantId,
    userId,
    workspaceId,
    message,
    modelKey: profile.model_key ?? modelOverride,
    activeFileEnvelope,
    body,
  });

  scheduleWorkspaceStateConversationUpdate(env, ctx, {
    conversationId: sessionId,
    workspaceId,
  });

  const projectContextBlock = await loadProjectContextSystemBlock(env, workspaceId);

  const skillRoute = await resolveSkillSpawnRouting(env, message, body);

  const intentMessageForMedia = message;
  const directImageIntent =
    !skillRoute &&
    hasImageGenerationIntent(intentMessageForMedia) &&
    !isCodeImplementationIntent(intentMessageForMedia) &&
    isPrimaryImageGenerationIntent(intentMessageForMedia);

  if (directImageIntent) {
    return handleDirectImageGenerationChatStream(env, ctx, {
      request,
      message,
      userId,
      tenantId,
      workspaceId,
      sessionId,
      authUser,
    });
  }

  // Spine job: dispatch by compiled immutable profile only.
  const controllerInput = {
    request,
    body,
    message,
    profile,
    session: {
      userId,
      workspaceId,
      tenantId,
      sessionId,
      authUser,
    },
    modelOverride,
    quickstartBatch,
    activeFileEnvelope,
    subagentProfileRow,
    browserContextPayload,
    handoffResume,
    agentChatResolvedContext,
    projectContextBlock,
  };

  if (skillRoute) {
    let agentProfile = profile;
    if (profile.execution_kind !== 'agent_tool_loop' || profile.routing_task_type !== 'agent') {
      agentProfile = await resolveRuntimeProfile(env, {
        mode: 'agent',
        message,
        session: { userId, workspaceId, tenantId, conversationId: sessionId },
        overrides: {
          model_key: modelOverride,
          task_type: 'agent',
          subagent_slug: body.subagent_slug ?? body.subagentSlug ?? null,
        },
        compile_lane: 'live',
      });
    }
    return executeAgentTurn(env, ctx, { ...controllerInput, profile: agentProfile, skillRoute });
  }

  switch (profile.mode_controller) {
    case 'ask_controller':
      return executeAskTurn(env, ctx, controllerInput);
    case 'plan_controller':
      return executePlanTurn(env, ctx, controllerInput);
    case 'agent_controller':
      return executeAgentTurn(env, ctx, controllerInput);
    case 'debug_controller':
      return executeDebugTurn(env, ctx, controllerInput);
    case 'multitask_controller':
      return executeMultitaskTurn(env, ctx, controllerInput);
    default:
      throw new Error(`Unsupported mode_controller: ${profile.mode_controller}`);
  }
}
