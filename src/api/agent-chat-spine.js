/**
 * Agent Sam chat spine — session context (DO) → model → tool loop.
 * No per-turn classify / compileModeProfile.
 */
import { jsonResponse } from '../core/responses.js';
import { logRuntimeProfile, logRouteContract } from '../core/runtime-profile.js';
import { normalizeAgentRuntimeMode } from '../core/agent-mode.js';
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
import { normalizePlanModeMessage } from '../core/plan-mode-utils.js';
import {
  shouldUseUserAppRuntimeLane,
  parseProjectContextFromBody,
  shouldUseProjectQnaFastLane,
  applyProjectQnaFastLaneToSessionProfile,
} from '../core/user-app-runtime.js';
import {
  parseSessionProjectIdFromChatBody,
  resolveConversationProjectRef,
} from '../core/project-chat-link.js';
import { loadSessionProjectContextSystemBlock } from '../core/project-session-context.js';
import { resolveWorkspaceBindings } from '../core/agentsam-workspace.js';
import {
  loadOrBootstrapSessionContext,
  buildSessionRuntimeProfile,
} from '../core/agent-session-context.js';

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  'Access-Control-Allow-Origin': '*',
};

function trimIdentifier(value) {
  if (value == null) return '';
  return String(value).trim();
}

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

  const { collectChatVisionUploadFiles } = await import('../core/chat-composer-attachments.js');
  const visionUploadFiles = collectChatVisionUploadFiles(body);
  const requireVision = visionUploadFiles.length > 0;

  const projectContext =
    pre.projectContext ?? parseProjectContextFromBody(body) ?? null;
  const userAppLane = shouldUseUserAppRuntimeLane(body, pre);
  const projectQnaFastLane = shouldUseProjectQnaFastLane(
    body,
    projectContext,
    requestedMode === 'auto' ? 'agent' : requestedMode,
    message,
  );

  const { resolveDesignStudioChatOverrides } = await import('../core/design-studio-context.js');
  const designStudioOverrides = resolveDesignStudioChatOverrides(browserContextPayload, body, message);
  const runtimeOverrides = {
    model_key: modelOverride,
    subagent_slug:
      body.subagent_slug ??
      body.subagentSlug ??
      designStudioOverrides?.subagent_slug ??
      null,
    route_key:
      designStudioOverrides?.route_key ?? body.route_key ?? body.routeKey ?? null,
    task_type:
      designStudioOverrides?.task_type ?? body.task_type ?? body.taskType ?? null,
    skip_rws_fanout: designStudioOverrides?.skip_rws_fanout === true,
  };

  const forceImage =
    body.force_image_generation === true ||
    body.force_image_generation === 1 ||
    body.force_image_generation === '1' ||
    body.force_image_generation === 'true' ||
    String(body.composer_action || '').trim().toLowerCase() === 'create_image';

  if (!sessionId) {
    return jsonResponse({ error: 'conversation_id required for session context' }, 400);
  }

  const requestedSessionProjectRef = parseSessionProjectIdFromChatBody(body);
  const projectContextExplicit =
    body.project_context_explicit === true ||
    body.project_context_explicit === 1 ||
    body.project_context_explicit === '1' ||
    String(body.project_context_source || '').trim() === 'project_composer';
  const projectContextClear =
    body.project_context_clear === true ||
    body.project_context_clear === 1 ||
    body.project_context_clear === '1';
  const conversationProject = await resolveConversationProjectRef(env, {
    conversationId: sessionId,
    userId,
    tenantId,
    requestedProjectRef: requestedSessionProjectRef,
    explicit: projectContextExplicit || projectContextClear,
    clear: projectContextClear,
  });
  const sessionProjectRef = conversationProject.projectRef;
  console.info(
    '[agent-chat-spine] project_context_resolved',
    JSON.stringify({
      conversation_id: sessionId,
      project_ref: sessionProjectRef,
      source: conversationProject.source,
      ignored_request_ref:
        !projectContextExplicit &&
        requestedSessionProjectRef &&
        requestedSessionProjectRef !== sessionProjectRef
          ? requestedSessionProjectRef
          : null,
    }),
  );

  if (!requireVision && forceImage) {
    const { handleDirectImageGenerationChatStream } = await import('../tools/image_generation.js');
    scheduleChatSessionTitleInsert(env, ctx, {
      conversationId: sessionId,
      tenantId,
      userId,
      workspaceId,
      message,
      modelKey: null,
      activeFileEnvelope,
      body,
      projectRef: sessionProjectRef,
      projectExplicit: projectContextExplicit || projectContextClear,
    });
    scheduleWorkspaceStateConversationUpdate(env, ctx, {
      conversationId: sessionId,
      workspaceId,
    });
    return handleDirectImageGenerationChatStream(env, ctx, {
      request,
      message,
      userId,
      tenantId,
      workspaceId,
      sessionId,
      authUser,
      turnDecisionId: null,
      turnDecision: { imageFastPath: true },
    });
  }

  const sessionCtx = await loadOrBootstrapSessionContext(env, {
    conversationId: sessionId,
    mode: requestedMode,
    workspaceId,
    body,
    activeFileEnvelope,
    forceRefresh: body.refresh_session_context === true,
  });

  const composerMode = sessionCtx.mode || (requestedMode === 'auto' ? 'agent' : requestedMode);
  let modelKey = modelOverride;
  let routingArmId = null;
  try {
    const { resolveModelForTask } = await import('../core/resolveModel.js');
    const resolved = await resolveModelForTask(env, {
      task_type: composerMode === 'ask' || projectQnaFastLane ? 'ask' : 'agent',
      mode: composerMode,
      workspace_id: workspaceId,
      tenant_id: tenantId,
      user_id: userId,
      requested_model_key: modelOverride,
      require_tools: !projectQnaFastLane && composerMode !== 'ask',
      require_vision: requireVision,
    });
    modelKey = resolved?.model_key || modelKey;
    routingArmId = resolved?.arm_id || resolved?.routing_arm_id || null;
  } catch (e) {
    console.warn('[agent-chat-spine] resolveModelForTask', e?.message ?? e);
  }
  if (!modelKey) {
    return jsonResponse({ error: 'no_model_resolved' }, 503);
  }

  const profile = buildSessionRuntimeProfile({
    mode: composerMode,
    tools: projectQnaFastLane ? [] : sessionCtx.tools,
    writePolicy: sessionCtx.writePolicy,
    modelKey,
    routingArmId,
    profileTaskType: sessionCtx.profile_task_type || null,
    profileKey: sessionCtx.profile_key || sessionCtx.roots?.profile_key || null,
  });
  profile._session_roots = sessionCtx.roots;
  profile._fsa_root = sessionCtx.roots?.fsa_root === true;
  if (projectQnaFastLane) {
    applyProjectQnaFastLaneToSessionProfile(profile);
  }

  logRuntimeProfile(profile, {
    path: 'executeAgentChatSpine.session_context',
    conversation_id: sessionId,
    live: true,
    project_qna_fast_lane: projectQnaFastLane,
  });
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
    projectRef: sessionProjectRef,
    projectExplicit: projectContextExplicit || projectContextClear,
  });

  scheduleWorkspaceStateConversationUpdate(env, ctx, {
    conversationId: sessionId,
    workspaceId,
  });

  const workspaceBindingIdentifier = trimIdentifier(
    sessionProjectRef ||
      body.workspace_id ||
      body.workspaceId ||
      workspaceId,
  );
  const workspaceBindings =
    !workspaceBindingIdentifier
      ? null
      : await resolveWorkspaceBindings(env, workspaceBindingIdentifier);
  const projectExecutionBindings =
    sessionProjectRef && workspaceBindings
      ? workspaceBindings
      : sessionProjectRef
        ? await resolveWorkspaceBindings(env, sessionProjectRef)
        : null;
  const sessionProjectContextBlock = sessionProjectRef
    ? await loadSessionProjectContextSystemBlock(env, sessionProjectRef, workspaceId)
    : '';
  // Project context is opt-in and conversation-scoped. Never pick an ambient
  // "active" project from a workspace that contains many unrelated projects.
  const projectContextBlock = '';

  const skillRoute = await resolveSkillSpawnRouting(env, message, body, {
    sessionId,
    workspaceId,
  });

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
    sessionProjectContextBlock,
    sessionProjectRef: sessionProjectRef || null,
    projectExecutionBindings,
    workspaceBindings,
    chatTurnMeta: pre.chatTurnMeta ?? null,
  };

  if (skillRoute) {
    let agentProfile = profile;
    if (profile.execution_kind !== 'agent_tool_loop' || profile.routing_task_type !== 'agent') {
      agentProfile = userAppLane
        ? await compileUserAppRuntimeProfile(env, {
            mode: 'agent',
            message,
            body,
            session: { userId, workspaceId, tenantId, conversationId: sessionId, authUser },
            overrides: {
              model_key: modelOverride,
              subagent_slug: body.subagent_slug ?? body.subagentSlug ?? null,
            },
            projectContext,
          })
        : await resolveRuntimeProfile(env, {
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
