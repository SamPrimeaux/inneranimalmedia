/**
 * Agent Sam chat spine — login → mode → RuntimeProfile → model (Thompson if auto) → tool loop.
 * Replaces the boolean maze in agent.js for standard composer chat.
 */
import { withD1Retry } from '../core/d1-retry.js';
import { jsonResponse } from '../core/responses.js';
import {
  resolveRuntimeProfile,
  logRuntimeProfile,
  logRouteContract,
} from '../core/runtime-profile.js';
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
import { loadProjectContextSystemBlock } from '../core/project-context-budget.js';
import { normalizePlanModeMessage } from '../core/plan-mode-utils.js';
import {
  shouldUseUserAppRuntimeLane,
  compileUserAppRuntimeProfile,
  parseProjectContextFromBody,
} from '../core/user-app-runtime.js';
import { parseSessionProjectIdFromChatBody } from '../core/project-chat-link.js';
import { loadSessionProjectContextSystemBlock } from '../core/project-session-context.js';
import { resolveWorkspaceBindings } from '../core/agentsam-workspace.js';

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

  // Image fast path BEFORE chat Thompson / project_qna compile — pure image turns must not
  // pick gpt-5/kimi or strip tools; those logs were misleading when this ran after profile.
  // Keyword fast-path (D1) → escalate to intent_classification classifier on miss + cue.
  if (!requireVision) {
    const { resolvePrimaryImageGenerationIntent, handleDirectImageGenerationChatStream } = await import(
      '../tools/image_generation.js'
    );
    const intent = await resolvePrimaryImageGenerationIntent(env, message, {
      tenantId,
      workspaceId,
      userId,
      conversationId: sessionId,
    });
    if (intent.isMatch) {
      scheduleChatSessionTitleInsert(env, ctx, {
        conversationId: sessionId,
        tenantId,
        userId,
        workspaceId,
        message,
        modelKey: null,
        activeFileEnvelope,
        body,
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
      });
    }
  }

  const profile = await withD1Retry(
    () =>
      userAppLane
        ? compileUserAppRuntimeProfile(env, {
            mode: requestedMode,
            message,
            body,
            session: { userId, workspaceId, tenantId, conversationId: sessionId, authUser },
            overrides: {
              model_key: runtimeOverrides.model_key,
              subagent_slug: runtimeOverrides.subagent_slug,
            },
            projectContext,
            requireVision,
            isSuperadmin:
              authUser?.isSuperadmin === true ||
              authUser?.is_superadmin === true ||
              String(authUser?.role || '')
                .trim()
                .toLowerCase() === 'superadmin',
          })
        : resolveRuntimeProfile(env, {
            mode: requestedMode,
            message,
            session: { userId, workspaceId, tenantId, conversationId: sessionId, authUser },
            overrides: runtimeOverrides,
            compile_lane: 'live',
            requireVision,
          }),
    { maxAttempts: 2, delays: [40, 120] },
  );

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

  const { isSimpleAskMessage } = await import('../core/runtime-profile.js');
  const casualChatTurn = isSimpleAskMessage(message) && !activeFileEnvelope && !requireVision;
  const sessionProjectRef = parseSessionProjectIdFromChatBody(body);
  const workspaceBindingIdentifier = trimIdentifier(
    sessionProjectRef ||
      body.project_id ||
      body.projectId ||
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
  const projectContextBlock =
    casualChatTurn || userAppLane
      ? ''
      : await loadProjectContextSystemBlock(env, workspaceId);

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
