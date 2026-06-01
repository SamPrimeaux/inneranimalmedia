/**
 * Agent Sam chat spine — login → mode → RuntimeProfile → model (Thompson if auto) → tool loop.
 * Replaces the boolean maze in agent.js for standard composer chat.
 */
import { jsonResponse } from '../core/responses.js';
import { loadAgentSamUserPolicy } from '../core/agent-policy.js';
import {
  resolveRuntimeProfile,
  logRuntimeProfile,
  logRouteContract,
  toolsManifestFromCompiledRows,
} from '../core/runtime-profile.js';
import { normalizeAgentRuntimeMode } from '../core/agent-mode.js';
import {
  newChatAgentRunId,
  scheduleAgentsamChatAgentRunStart,
} from '../core/agent-run-routing.js';
import { fireAgentHooks } from '../core/hook-dispatcher.js';
import {
  hasImageGenerationIntent,
  isPrimaryImageGenerationIntent,
  handleDirectImageGenerationChatStream,
} from '../tools/image_generation.js';
import { isCodeImplementationIntent } from '../core/code-implementation-intent.js';

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  'Access-Control-Allow-Origin': '*',
};

/**
 * @param {Promise<unknown>} promise
 * @param {number} ms
 */
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('agent_run_timeout')), ms);
    }),
  ]);
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
  const message = String(pre.message || '').trim();
  const requestedMode = normalizeAgentRuntimeMode(pre.requestedMode ?? body.mode);
  const tenantId = pre.tenantId != null ? String(pre.tenantId) : null;
  const userId = pre.userId != null ? String(pre.userId) : null;
  const workspaceId = pre.workspaceId != null ? String(pre.workspaceId) : null;
  const sessionId = pre.sessionId != null ? String(pre.sessionId) : null;
  const authUser = pre.authUser || { id: userId, tenant_id: tenantId };
  const quickstartBatch = pre.quickstartBatch != null ? String(pre.quickstartBatch) : '';
  const activeFileEnvelope = pre.activeFileEnvelope ?? null;
  const subagentProfileRow = pre.subagentProfileRow ?? null;
  const browserContextPayload = pre.browserContextPayload ?? null;
  const handoffResume = pre.handoffResume ?? null;
  const agentChatResolvedContext = pre.agentChatResolvedContext ?? null;

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

  const intentMessageForMedia = message;
  const directImageIntent =
    hasImageGenerationIntent(intentMessageForMedia) && !isCodeImplementationIntent(intentMessageForMedia) &&
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

  if (profile.execution_kind === 'plan_pipeline') {
    return executePlanPipelineSse(env, ctx, {
      message,
      requestedMode,
      userId,
      tenantId,
      workspaceId,
      sessionId,
      authUser,
    });
  }

  const userPolicy =
    pre.userPolicy || (await loadAgentSamUserPolicy(env, userId, workspaceId));

  if (!profile.model_key) {
    return jsonResponse({ error: 'no_model_resolved', profile_id: profile.profile_id }, 503);
  }

  const promptRouteRow = profile._prompt_route_row ?? null;
  const tools = toolsManifestFromCompiledRows(profile._compiled_tool_rows || []);
  const requireTools = tools.length > 0;

  const { buildSystemPrompt } = await import('./agent.js');
  const minimalAsk =
    profile.max_tools === 0 &&
    !profile.context_policy.include_rag &&
    !profile.context_policy.include_memory;

  let systemPrompt;
  if (env?.DB) {
    systemPrompt = await buildSystemPrompt(
      env,
      tenantId,
      profile.mode,
      '',
      null,
      promptRouteRow,
      {
        request,
        sessionId,
        planId: body.planId ?? body.plan_id ?? null,
        taskId: body.taskId ?? body.task_id ?? null,
        message,
        taskType: profile.routing_task_type,
        workspaceId,
        userId,
        minimalAsk,
      },
    );
  } else {
    systemPrompt = 'You are Agent Sam. Be direct and helpful.';
  }

  if (profile.mode === 'debug') {
    systemPrompt +=
      '\n\n## Debug mode\nHypothesize first. Prefer read/search/log evidence before broad edits. ' +
      'Add instrumentation when reproduction is needed; remove it after the fix is verified.';
  }

  if (profile.mode === 'ask') {
    systemPrompt +=
      '\n\n## Ask mode (read-only)\nAnswer directly. Use read-only evidence tools when the question ' +
      'needs codebase, D1, or project context. Never mutate files, run terminal commands, deploy, or write to D1. ' +
      'If the user asks you to fix or implement something, explain the likely approach and suggest switching to Agent or Debug.';
  }

  const chatAgentRunId =
    env?.DB && userId && workspaceId
      ? newChatAgentRunId(quickstartBatch ? { label: quickstartBatch } : {})
      : null;

  if (chatAgentRunId && ctx?.waitUntil) {
    ctx.waitUntil(
      fireAgentHooks(env, ctx, 'start', {
        tenant_id: tenantId,
        workspace_id: workspaceId,
        user_id: userId,
        agent_run_id: chatAgentRunId,
        conversation_id: sessionId,
        session_id: sessionId,
      }).catch((e) => console.warn('[hook-dispatcher] start', e?.message ?? e)),
    );
  }

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const emit = (type, payload) => {
    try {
      writer.write(encoder.encode(`data: ${JSON.stringify({ type, ...payload })}\n\n`));
    } catch (_) {
      /* stream closed */
    }
  };

  emit('context', {
    mode: profile.mode,
    runtime_mode: profile.mode,
    execution_kind: profile.execution_kind,
    profile_id: profile.profile_id,
    profile_hash: profile.profile_hash,
    model: profile.model_key,
    auto_model: !modelOverride,
    routing_arm_id: profile.routing_arm_id,
    tool_count: tools.length,
    routing_task_type: profile.routing_task_type,
    write_policy: profile.write_policy,
    color: profile.color,
    tool_profile: profile.tool_profile,
    tool_capable_required: profile.tool_capable_required,
    ...(chatAgentRunId ? { agent_run_id: chatAgentRunId } : {}),
    ...(subagentProfileRow
      ? {
          subagent_profile_id: subagentProfileRow.id,
          subagent_slug: subagentProfileRow.slug,
        }
      : {}),
  });

  const maxRunMs = profile.max_runtime_ms || 90000;
  const chatMessages =
    Array.isArray(body.messages) && body.messages.length
      ? [...body.messages]
      : [{ role: 'user', content: message }];

  (async () => {
    const chatT0 = Date.now();
    try {
      if (chatAgentRunId && userId && workspaceId) {
        scheduleAgentsamChatAgentRunStart(env, ctx, {
          runId: chatAgentRunId,
          run_group_id: chatAgentRunId,
          userId,
          tenantId,
          workspaceId,
          conversationId: sessionId,
          routingArmId: profile.routing_arm_id,
          agentSlug: subagentProfileRow?.id ?? null,
          subagentProfileId: subagentProfileRow?.id ?? null,
          modelKey: profile.model_key,
          selectedModel: profile.model_key,
          taskType: profile.routing_task_type,
          mode: profile.mode,
          intent: profile.mode,
          trigger: quickstartBatch || 'chat_spine',
          requiresTools: requireTools,
          routingStrategy: modelOverride ? 'requested' : 'thompson',
        });
      }

      const { runAgentToolLoop } = await import('./agent.js');
      const dispatchSpine = chatAgentRunId
        ? {
            agent_run_id: chatAgentRunId,
            routing_arm_id: profile.routing_arm_id,
            mode: profile.mode,
          }
        : null;

      const mcpRuntimeContext = {
        userId,
        tenantId,
        workspaceId,
        sessionId,
        taskType: profile.routing_task_type,
        routeKey: profile.refined_route_key || profile.mode,
        writePolicy: profile.write_policy,
        userMessage: message,
      };

      await withTimeout(
        runAgentToolLoop(env, ctx, emit, {
          request,
          messages: chatMessages,
          tools,
          systemPrompt,
          modelKey: profile.model_key,
          temperature: profile.temperature,
          maxToolCalls: profile.max_tool_calls,
          mode: profile.mode,
          modeConfig: {
            max_runtime_ms: maxRunMs,
            max_turns: profile.max_turns,
            max_tool_calls: profile.max_tool_calls,
            temperature: profile.temperature,
          },
          userPolicy,
          sessionId,
          tenantId,
          userId,
          workspaceId,
          routingTaskType: profile.routing_task_type,
          mcpRuntimeContext,
          routingArmId: profile.routing_arm_id,
          dispatchSpine,
          agentSlug: subagentProfileRow?.id ?? null,
          chatAgentRunId,
          chatRouteKey: profile.refined_route_key,
          activeFileEnvelope,
          resolvedContext: agentChatResolvedContext,
          handoffDepth: handoffResume?.depth ?? 0,
          rootSessionId: handoffResume?.rootSessionId ?? sessionId,
          runStartedAt: chatT0,
          maxRuntimeMs: maxRunMs,
        }),
        maxRunMs + 5000,
      );

      emit('done', {});
    } catch (e) {
      console.warn('[agent-chat-spine] loop_failed', e?.message ?? e);
      emit('error', { message: e?.message ?? 'Agent loop failed', code: 'agent_spine_error' });
      emit('done', {});
    } finally {
      writer.close().catch(() => {});
    }
  })();

  return new Response(readable, { headers: SSE_HEADERS });
}

/**
 * @param {any} env
 * @param {any} ctx
 * @param {Record<string, unknown>} opts
 */
async function executePlanPipelineSse(env, ctx, opts) {
  const message = String(opts.message || '');
  const requestedMode = String(opts.requestedMode || 'plan');
  const userId = opts.userId != null ? String(opts.userId) : null;
  const tenantId = opts.tenantId != null ? String(opts.tenantId) : null;
  const workspaceId = opts.workspaceId != null ? String(opts.workspaceId) : null;
  const sessionId = opts.sessionId != null ? String(opts.sessionId) : null;

  const encoder = new TextEncoder();
  const { readable: planReadable, writable: planWritable } = new TransformStream();
  const planWriter = planWritable.getWriter();
  const emitPlan = (event, data) => {
    try {
      planWriter.write(encoder.encode(`data: ${JSON.stringify({ type: event, ...data })}\n\n`));
    } catch (_) {}
  };

  (async () => {
    try {
      const { createPlan, startAgentChatPlanWorkflowRun } = await import('../core/agentsam-planner.js');
      emitPlan('plan_thinking', { message: 'Breaking down your goal into tasks...' });

      const wfBoot = await startAgentChatPlanWorkflowRun(env, {
        tenantId,
        workspaceId,
        userId,
        sessionId,
        goal: message,
      });

      const plan = await createPlan(env, {
        goal: message,
        userId,
        workspaceId,
        tenantId,
        sessionId,
        workflowRunId: wfBoot.workflowRunId,
        ctx,
      });

      emitPlan('plan_created', {
        plan_id: plan.plan_id,
        plan_title: plan.plan_title,
        workflow_run_id: plan.workflow_run_id,
        task_count: plan.tasks.length,
        tasks: plan.tasks.map((t) => ({
          id: t.id,
          title: t.title,
          order_index: t.order_index,
          status: 'todo',
        })),
      });

      if (requestedMode !== 'plan') {
        const { executePlan } = await import('../core/agentsam-task-executor.js');
        await executePlan(env, {
          planId: plan.plan_id,
          userId,
          workspaceId,
          tenantId,
          emit: emitPlan,
          ctx,
          sessionId,
          workflowRunId: wfBoot.workflowRunId,
        });
      } else {
        emitPlan('text', {
          text: '_Plan mode: tasks stay as **todo**. Switch to **Agent** or **Multitask** to execute._',
        });
      }
      emitPlan('done', {});
    } catch (e) {
      emitPlan('text', { text: `**Plan error:** ${e?.message ?? String(e)}` });
      emitPlan('done', {});
    } finally {
      planWriter.close().catch(() => {});
    }
  })();

  return new Response(planReadable, { headers: SSE_HEADERS });
}
