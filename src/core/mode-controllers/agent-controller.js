import { jsonResponse } from '../responses.js';
import { loadAgentSamUserPolicy } from '../agent-policy.js';
import { newChatAgentRunId, scheduleAgentsamChatAgentRunStart } from '../agent-run-routing.js';
import { fireAgentHooks } from '../hook-dispatcher.js';
import { toolsManifestFromCompiledRows } from '../runtime-profile.js';
import { executeRwsSpawnFanout, shouldRunRwsFanout } from '../rws-spawn-fanout.js';
import { runtimeContextPayload, legacyContextPayload } from './runtime-context.js';
import { resolveAgentChatLaneContextBlock } from '../agent-chat-lane-context.js';
import { compactConversationMessagesIfNeeded } from '../conversation-compaction.js';
import { scheduleChatExecutionContextSnapshot } from '../execution-context-snapshot.js';
import {
  shouldUseCodemodeForRequest,
  getOrBuildCodemodeRuntime,
  buildHybridCodemodeManifest,
} from '../codemode-agent-bridge.js';

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
 * Agent controller
 * - execution_kind: agent_tool_loop
 * - purpose: do the work, policy gated by compiled profile
 *
 * @param {any} env
 * @param {any} ctx
 * @param {{
 *   request: Request,
 *   body: Record<string, unknown>,
 *   message: string,
 *   profile: import('../runtime-profile.types.js').RuntimeProfile,
 *   session: { userId: string|null, workspaceId: string|null, tenantId: string|null, sessionId: string|null, authUser?: any },
 *   modelOverride?: string|null,
 *   quickstartBatch?: string,
 *   activeFileEnvelope?: any,
 *   subagentProfileRow?: any,
 *   agentChatResolvedContext?: any,
 *   handoffResume?: any,
 * }} input
 */
/**
 * Shared SSE tool-loop runner for ask / agent / debug profiles.
 * Controllers must validate execution_kind before calling.
 *
 * @param {any} env
 * @param {any} ctx
 * @param {any} input
 */
export async function runSharedProfileToolLoop(env, ctx, input) {
  const profile = input.profile;
  const body = input.body || {};
  const message = String(input.message || '').trim();
  const { userId, tenantId, workspaceId, sessionId } = input.session || {};
  const quickstartBatch = input.quickstartBatch != null ? String(input.quickstartBatch) : '';
  const activeFileEnvelope = input.activeFileEnvelope ?? null;
  const subagentProfileRow = input.subagentProfileRow ?? null;
  const handoffResume = input.handoffResume ?? null;
  const agentChatResolvedContext = input.agentChatResolvedContext ?? null;
  const browserContextPayload = input.browserContextPayload ?? null;

  const userPolicy = await loadAgentSamUserPolicy(env, userId, workspaceId);
  if (!profile.model_key) {
    return jsonResponse({ error: 'no_model_resolved', profile_id: profile.profile_id }, 503);
  }

  const promptRouteRow = profile._prompt_route_row ?? null;
  let tools = toolsManifestFromCompiledRows(profile._compiled_tool_rows || []);
  if (activeFileEnvelope && env?.DB) {
    const { ensureActiveFileCapabilityTools } = await import('../../api/agent.js');
    const cap = Math.max(tools.length, Number(profile.max_tools) || 8);
    tools = await ensureActiveFileCapabilityTools(env, tools, cap, activeFileEnvelope);
  }

  /** Codemode hybrid manifest (multitask / tool-chain planning) — non-fatal if build fails. */
  let codemodeRuntime = null;
  const rawBodyTaskType = body.task_type ?? body.taskType ?? null;
  const useCodemode = shouldUseCodemodeForRequest(env, {
    agentLikeTooling:
      profile.mode === 'agent' || profile.mode === 'debug' || profile.mode === 'multitask',
    resolvedRoutingTaskType: profile.routing_task_type,
    rawBodyTaskType: rawBodyTaskType != null ? String(rawBodyTaskType) : '',
  });
  if (useCodemode) {
    try {
      const { hasImageGenerationIntent, hasVideoGenerationIntent } = await import(
        '../../tools/image_generation.js'
      );
      codemodeRuntime = await getOrBuildCodemodeRuntime(env, {
        workspaceId,
        tenantId,
        userId,
        sessionId,
      });
      tools = buildHybridCodemodeManifest(tools, codemodeRuntime, {
        browserDispatchToolsActive: /\b(browser|screenshot|navigate|playwright|cdt_)\b/i.test(
          message,
        ),
        imageCapabilityIntent: hasImageGenerationIntent(message),
        videoCapabilityIntent: hasVideoGenerationIntent(message),
      });
      console.info(
        '[agent-controller] codemode_manifest',
        JSON.stringify({ sidecar_count: tools.length, catalog_tools: codemodeRuntime.toolCount }),
      );
    } catch (e) {
      console.warn('[agent-controller] codemode_build_failed', e?.message ?? e);
    }
  }

  const requireTools = tools.length > 0 || profile.tool_capable_required === true;

  const { buildSystemPrompt, runAgentToolLoop } = await import('../../api/agent.js');
  const minimalAsk =
    profile.max_tools === 0 &&
    !profile.context_policy.include_rag &&
    !profile.context_policy.include_memory;

  let contextBlock = '';
  const includeRag =
    !minimalAsk &&
    profile.context_policy?.include_rag !== false &&
    Number(promptRouteRow?.include_rag ?? 1) !== 0;
  if (env?.DB && includeRag && message && workspaceId) {
    try {
      const laneCtx = await resolveAgentChatLaneContextBlock(env, {
        message,
        includeRag: true,
        workspaceId,
        tenantId,
        userId,
        authUser: input.session?.authUser ?? null,
        routingTaskType: profile.routing_task_type ?? null,
      });
      contextBlock = laneCtx?.block != null ? String(laneCtx.block) : '';
      if (contextBlock && laneCtx?.lane) {
        console.info(
          '[agent-controller] lane_context_injected',
          JSON.stringify({
            lane: laneCtx.lane,
            source: laneCtx.source,
            chars: contextBlock.length,
          }),
        );
      }
    } catch (e) {
      console.warn('[agent-controller] lane_context_failed', e?.message ?? e);
      contextBlock = '';
    }
  }

  let systemPrompt;
  if (env?.DB) {
    systemPrompt = await buildSystemPrompt(
      env,
      tenantId,
      profile.mode,
      contextBlock,
      null,
      promptRouteRow,
      {
        request: input.request,
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

  if (contextBlock) {
    const laneHead = contextBlock.slice(0, 80);
    if (!systemPrompt.includes(laneHead)) {
      systemPrompt = `${systemPrompt}\n\n---\n\n${contextBlock}`;
    }
  }

  const projectContextBlock =
    input.projectContextBlock != null ? String(input.projectContextBlock).trim() : '';
  if (projectContextBlock && !systemPrompt.includes(projectContextBlock.slice(0, 40))) {
    systemPrompt = `${systemPrompt}\n\n${projectContextBlock}`;
  }

  if (profile.mode === 'debug') {
    systemPrompt +=
      '\n\n## Debug mode\nHypothesize first. Prefer read/search/log evidence before broad edits. ' +
      'Add instrumentation when reproduction is needed; remove it after the fix is verified.';
  }

  if (userId) {
    try {
      const { buildGithubScopeSystemPromptLine } = await import('../github-repo-scope.js');
      const ghLine = await buildGithubScopeSystemPromptLine(env, userId);
      if (ghLine && !systemPrompt.includes('GitHub scope (enforced)')) {
        systemPrompt = `${systemPrompt}\n\n## GitHub\n${ghLine}`;
      }
    } catch (e) {
      console.warn('[agent-controller] github_scope_prompt', e?.message ?? e);
    }
  }

  const userMessageText = String(input.message || input.prompt || '').toLowerCase();
  if (
    userMessageText.includes('create-subagent') ||
    userMessageText.includes('create subagent') ||
    userMessageText.includes('custom subagent')
  ) {
    try {
      const { buildSubagentScopeSystemPromptLine } = await import('../subagent-profile-write.js');
      const subLine = buildSubagentScopeSystemPromptLine();
      if (subLine && !systemPrompt.includes('agentsam_subagent_profile')) {
        systemPrompt = `${systemPrompt}\n\n## Subagents\n${subLine}`;
      }
    } catch (e) {
      console.warn('[agent-controller] subagent_scope_prompt', e?.message ?? e);
    }
  }

  if (profile.mode === 'ask') {
    systemPrompt +=
      '\n\n## Ask mode (read-only)\nAnswer directly. Use read-only evidence tools when the question ' +
      'needs codebase, D1, or project context. Never mutate files, run terminal commands, deploy, or write to D1. ' +
      'If the user asks you to fix or implement something, explain the likely approach and suggest switching to Agent or Debug.';
  }

  /** @type {Record<string, unknown>|null} */
  let capabilityDecision = null;
  if (message && (browserContextPayload || workspaceId)) {
    try {
      const { extractComposerFlagsFromBrowserContext } = await import('../workspace-studio-context.js');
      const { classifyWorkspaceCapabilities, capabilityRouterPromptBlock } = await import('../capability-router.js');
      const { applyComposerAntigravityToggle } = await import('../antigravity-policy.js');
      const composerFlags = extractComposerFlagsFromBrowserContext(browserContextPayload);
      capabilityDecision = await classifyWorkspaceCapabilities(env, {
        message,
        browserContext: browserContextPayload,
        userId,
        tenantId,
      });
      if (composerFlags.antigravity_sandbox_enabled) {
        capabilityDecision = applyComposerAntigravityToggle(capabilityDecision, true);
      }
      if (capabilityDecision?.should_use_antigravity) {
        systemPrompt += `\n\n${capabilityRouterPromptBlock(capabilityDecision)}`;
        console.info(
          '[agent-controller] antigravity_routing',
          JSON.stringify({
            composer_toggle: composerFlags.antigravity_sandbox_enabled,
            score: capabilityDecision.antigravity_score,
            reasons: capabilityDecision.antigravity_reasons,
          }),
        );
      }
    } catch (e) {
      console.warn('[agent-controller] antigravity_capability', e?.message ?? e);
    }
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

  // Required: runtime_context event for every turn.
  emit('runtime_context', runtimeContextPayload(profile, { modelOverride: input.modelOverride ?? null }));
  // Compatibility: preserve older context event.
  emit(
    'context',
    legacyContextPayload(profile, {
      toolsCount: tools.length,
      modelOverride: input.modelOverride ?? null,
      routingArmId: profile.routing_arm_id,
      routingTaskType: profile.routing_task_type,
      extra: {
        ...(chatAgentRunId ? { agent_run_id: chatAgentRunId } : {}),
        ...(subagentProfileRow
          ? { subagent_profile_id: subagentProfileRow.id, subagent_slug: subagentProfileRow.slug }
          : {}),
      },
    }),
  );

  const maxRunMs = profile.max_runtime_ms || 90000;
  let chatMessages =
    Array.isArray(body.messages) && body.messages.length
      ? [...body.messages]
      : [{ role: 'user', content: message }];

  const activeToolNames = tools
    .map((t) => String(t?.name || t?.function?.name || '').trim())
    .filter(Boolean);

  const { parseThreadSlashCommand } = await import('../thread-on-demand.js');
  const threadSlashAction = parseThreadSlashCommand(message);

  if (userId && workspaceId && sessionId && !threadSlashAction) {
    try {
      const compacted = await compactConversationMessagesIfNeeded(env, ctx, {
        messages: chatMessages,
        userId,
        workspaceId,
        tenantId,
        conversationId: sessionId,
        agentRunId: chatAgentRunId,
        activeTools: activeToolNames,
      });
      chatMessages = compacted.messages;
      scheduleChatExecutionContextSnapshot(env, ctx, {
        agentRunId: chatAgentRunId,
        workspaceId,
        tenantId,
        conversationId: sessionId,
        contextTokens: compacted.estimated ?? 0,
      });
    } catch (e) {
      console.warn('[agent-controller] compaction_pipeline', e?.message ?? e);
    }
  }

  (async () => {
    const chatT0 = Date.now();
    try {
      if (threadSlashAction && userId && workspaceId && sessionId) {
        const { runThreadActionOnDemand } = await import('../thread-on-demand.js');
        const threadOut = await runThreadActionOnDemand(env, ctx, {
          action: threadSlashAction,
          userId,
          workspaceId,
          tenantId,
          conversationId: sessionId,
          agentRunId: chatAgentRunId,
          messages: chatMessages,
        });
        emit('thread_action', { type: 'thread_action', ...threadOut });
        if (threadOut.user_message) {
          emit('text', { text: threadOut.user_message });
        }
        emit('done', {});
        return;
      }

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
          routingStrategy: input.modelOverride ? 'requested' : 'thompson',
        });
      }

      const dispatchSpine = chatAgentRunId
        ? { agent_run_id: chatAgentRunId, routing_arm_id: profile.routing_arm_id, mode: profile.mode }
        : null;

      if (
        capabilityDecision?.should_use_antigravity &&
        workspaceId &&
        profile.mode !== 'ask'
      ) {
        try {
          const { streamAntigravitySandboxInteraction, formatAntigravityOrchestratorBlock } =
            await import('../antigravity-interactions.js');
          const { buildGithubScopeSystemPromptLine } = await import('../github-repo-scope.js');
          const wsCtx =
            browserContextPayload &&
            typeof browserContextPayload === 'object' &&
            browserContextPayload.workspaceContext &&
            typeof browserContextPayload.workspaceContext === 'object'
              ? browserContextPayload.workspaceContext
              : null;
          const openFiles = Array.isArray(wsCtx?.openFiles)
            ? wsCtx.openFiles.map((f) => String(f || '').trim()).filter(Boolean)
            : [];
          const ghLine = userId ? await buildGithubScopeSystemPromptLine(env, userId).catch(() => '') : '';

          const agResult = await streamAntigravitySandboxInteraction(env, {
            message,
            workspaceId,
            tenantId,
            userId,
            modelKey: capabilityDecision.antigravity_model_key,
            githubScopeLine: ghLine,
            openFiles,
            emit,
          });

          const agBlock = formatAntigravityOrchestratorBlock(agResult);
          if (agBlock) {
            systemPrompt = `${systemPrompt}\n\n${agBlock}`;
          }
          if (!agResult.ok) {
            console.warn('[agent-controller] antigravity_dispatch_failed', agResult.message);
          }
        } catch (e) {
          console.warn('[agent-controller] antigravity_dispatch', e?.message ?? e);
          emit('antigravity_interaction_error', {
            type: 'antigravity_interaction_error',
            error: e?.message != null ? String(e.message) : String(e),
          });
        }
      }

      const mcpRuntimeContext = {
        userId,
        tenantId,
        workspaceId,
        sessionId,
        taskType: profile.routing_task_type,
        routeKey: profile.refined_route_key || profile.mode,
        writePolicy: profile.write_policy,
        userMessage: message,
        runtimeProfile: profile,
      };

      await withTimeout(
        runAgentToolLoop(env, ctx, emit, {
          request: input.request,
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
          runtimeProfile: profile,
          codemodeRuntime,
        }),
        maxRunMs + 5000,
      );

      emit('done', {});
    } catch (e) {
      console.warn('[agent-controller] loop_failed', e?.message ?? e);
      emit('error', { message: e?.message ?? 'Agent loop failed', code: 'agent_spine_error' });
      emit('done', {});
    } finally {
      writer.close().catch(() => {});
    }
  })();

  return new Response(readable, { headers: SSE_HEADERS });
}

/**
 * Agent controller entry — execution_kind must be agent_tool_loop.
 *
 * @param {any} env
 * @param {any} ctx
 * @param {any} input
 */
export async function executeAgentTurn(env, ctx, input) {
  const profile = input.profile;
  if (profile.execution_kind !== 'agent_tool_loop') {
    return jsonResponse(
      { error: 'agent_controller_execution_kind_mismatch', execution_kind: profile.execution_kind },
      400,
    );
  }
  if (shouldRunRwsFanout(profile)) {
    return executeRwsSpawnFanout(env, ctx, input);
  }
  return runSharedProfileToolLoop(env, ctx, input);
}

