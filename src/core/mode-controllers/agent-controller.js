import { jsonResponse } from '../responses.js';
import { loadAgentSamUserPolicy } from '../agent-policy.js';
import { newChatAgentRunId, scheduleAgentsamChatAgentRunStart } from '../agent-run-routing.js';
import { fireAgentHooks } from '../hook-dispatcher.js';
import { toolsManifestFromCompiledRows, isSimpleAskMessage } from '../runtime-profile.js';
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
import {
  buildCreateSubagentFlowSystemPromptLine,
  resolveCreateSubagentFlow,
  executeGenmediaSkillSpawn,
} from '../create-subagent-flow.js';
import {
  executeLaunchSkillSpawn,
  executeDeckSkillSpawn,
} from '../skill-spawn-orchestrator.js';
import { executeSkillSpawnByRoute } from '../skill-spawn-pipelines-ext.js';
import { filterToolsForCapabilityDecision } from '../tool-capability-filter.js';

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
 * Quickstart seed messages are meta-instructions to the MODEL ("Ask the user what they
 * need before doing anything. Wait for answers before generating."), not task
 * descriptions. Fed verbatim to the plan-intake LLM, it reads "the goal is to ask
 * questions" and returns needs_questions: false -- and even if it didn't, the
 * fallthrough message would still tell the model to ask via free text either way.
 * Strip sentences instructing the model to ask/wait, leaving just the descriptive
 * goal (e.g. "Quickstart: Slides.") for both the intake decision and, on fallthrough,
 * the message actually sent to the model.
 */
function stripQuickstartAskInstructions(text) {
  const raw = String(text || '').trim();
  const sentences = raw
    .split(/(?<=[.!?])\s+/)
    .filter((s) => !/\b(ask|wait for (the )?answers?)\b/i.test(s));
  const cleaned = sentences.join(' ').trim();
  return cleaned || raw;
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
  const { userId, tenantId, workspaceId, sessionId, authUser: sessionAuthUser } = input.session || {};
  const quickstartBatch = input.quickstartBatch != null ? String(input.quickstartBatch) : '';
  const activeFileEnvelope = input.activeFileEnvelope ?? null;
  const subagentProfileRow = input.subagentProfileRow ?? null;
  const handoffResume = input.handoffResume ?? null;
  const agentChatResolvedContext = input.agentChatResolvedContext ?? null;
  const browserContextPayload = input.browserContextPayload ?? null;
  const chatTurnMeta = input.chatTurnMeta ?? null;

  const userPolicy =
    input.userPolicy && typeof input.userPolicy === 'object'
      ? input.userPolicy
      : await loadAgentSamUserPolicy(env, userId, workspaceId);
  if (!profile.model_key) {
    return jsonResponse({ error: 'no_model_resolved', profile_id: profile.profile_id }, 503);
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
  emit('thinking_start', {});
  emit('status', { phase: 'context' });

  void (async () => {
    try {
  let chatMessages =
    Array.isArray(body.messages) && body.messages.length
      ? [...body.messages]
      : [{ role: 'user', content: message }];
  const {
    chatUploadHasVisionImages,
    parseChatComposerImageBlocks,
    applyVisionBlocksToChatMessages,
  } = await import('../core/chat-composer-attachments.js');
  if (chatUploadHasVisionImages(body.files)) {
    const imageBlocks = await parseChatComposerImageBlocks(body.files);
    if (imageBlocks.length) {
      chatMessages = applyVisionBlocksToChatMessages(chatMessages, message, imageBlocks);
    }
  }
  const createSubagentFlow = resolveCreateSubagentFlow(chatMessages);

  const skipHeavyContext =
    !createSubagentFlow.active &&
    !activeFileEnvelope &&
    (profile.refined_route_key === 'simple_ask_greeting' ||
      (profile.mode === 'agent' && isSimpleAskMessage(message)));

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
  const routeKeyPin = body.route_key ?? body.routeKey ?? profile.refined_route_key ?? null;
  const useCodemode =
    !skipHeavyContext &&
    !createSubagentFlow.active &&
    shouldUseCodemodeForRequest(env, {
    agentLikeTooling:
      profile.mode === 'agent' || profile.mode === 'debug' || profile.mode === 'multitask',
    resolvedRoutingTaskType: profile.routing_task_type,
    rawBodyTaskType: rawBodyTaskType != null ? String(rawBodyTaskType) : '',
    routeKey: routeKeyPin != null ? String(routeKeyPin) : null,
    routeKeyPin: routeKeyPin != null ? String(routeKeyPin) : null,
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
    skipHeavyContext ||
    (profile.max_tools === 0 &&
      !profile.context_policy.include_rag &&
      !profile.context_policy.include_memory);

  let contextBlock = '';
  const includeRag =
    !skipHeavyContext &&
    !createSubagentFlow.active &&
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
        routeKey: promptRouteRow?.route_key ?? body.route_key ?? body.routeKey ?? null,
        workspaceId,
        userId,
        minimalAsk,
        ctx: input.ctx ?? null,
        conversationId: sessionId,
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

  try {
    const { extractCmsAgentContext, formatCmsContextForAgent } = await import('../cms-agent-context.js');
    const { appendAmbientWorkspaceContextToPrompt } = await import('../workspace-studio-context.js');
    systemPrompt = appendAmbientWorkspaceContextToPrompt(
      systemPrompt,
      browserContextPayload,
      body,
    );
    const cmsBlock = formatCmsContextForAgent(extractCmsAgentContext(body, browserContextPayload));
    if (cmsBlock && !systemPrompt.includes('## CMS context')) {
      systemPrompt = `${systemPrompt}\n\n${cmsBlock}`;
    }
    const lockedEnvelope = body.activeFileEnvelope;
    if (lockedEnvelope) {
      const { formatActiveFileForAgent } = await import('../active-file-envelope.js');
      const activeBlock = formatActiveFileForAgent(lockedEnvelope);
      if (activeBlock && !systemPrompt.includes('[Active file envelope')) {
        systemPrompt = `${systemPrompt}\n\n## Active context (locked)\n${activeBlock}`;
      }
    }
    const wsCtxForMobile =
      browserContextPayload &&
      typeof browserContextPayload === 'object' &&
      browserContextPayload.workspaceContext &&
      typeof browserContextPayload.workspaceContext === 'object'
        ? browserContextPayload.workspaceContext
        : null;
    if (wsCtxForMobile) {
      const { parseClientSurface, parseExecLane, parseEnabledConnectors, parseEnabledTools, parseSessionProjectId, formatMobileExecProfilePromptBlock } =
        await import('../mobile-exec-profile.js');
      const mobileBlock = formatMobileExecProfilePromptBlock(
        parseClientSurface(wsCtxForMobile),
        parseExecLane(wsCtxForMobile),
        parseEnabledConnectors(wsCtxForMobile),
        parseEnabledTools(wsCtxForMobile),
        parseSessionProjectId(wsCtxForMobile),
      );
      if (mobileBlock && !systemPrompt.includes('[Mobile client surface')) {
        systemPrompt = `${systemPrompt}\n\n## Mobile exec profile\n${mobileBlock}`;
      }
    }
  } catch (e) {
    console.warn('[agent-controller] cms_context', e?.message ?? e);
  }

  if (profile.mode === 'debug') {
    systemPrompt +=
      '\n\n## Debug mode\nHypothesize first. Prefer read/search/log evidence before broad edits. ' +
      'Add instrumentation when reproduction is needed; remove it after the fix is verified.';
  }

  if (userId && !createSubagentFlow.active && !skipHeavyContext) {
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

  if (workspaceId && !createSubagentFlow.active && !skipHeavyContext) {
    try {
      const {
        fetchWorkspaceChatBinding,
        appendWorkspaceBindingToPrompt,
      } = await import('../workspace-chat-scope.js');
      const binding = await fetchWorkspaceChatBinding(env, workspaceId);
      const explicitGh = String(
        body.selectedGithubRepoContext ?? body.github_repo_context ?? body.githubRepoContext ?? '',
      ).trim();
      const envelope = body.activeFileEnvelope;
      systemPrompt = appendWorkspaceBindingToPrompt(systemPrompt, binding, {
        explicitGithubRepo: explicitGh || null,
        activeFileRepo:
          envelope?.github_repo != null ? String(envelope.github_repo).trim() : null,
        activeFileR2Key:
          envelope?.r2_key != null
            ? String(envelope.r2_key).trim()
            : envelope?.path != null && String(envelope.path).startsWith('r2://')
              ? String(envelope.path).trim()
              : null,
      });
    } catch (e) {
      console.warn('[agent-controller] workspace_binding_prompt', e?.message ?? e);
    }
  }

  if (createSubagentFlow.active && createSubagentFlow.phase) {
    try {
      const flowLine = buildCreateSubagentFlowSystemPromptLine(createSubagentFlow.phase);
      if (flowLine && !systemPrompt.includes('Create subagent (step')) {
        systemPrompt = `${systemPrompt}\n\n## Subagents\n${flowLine}`;
      }
    } catch (e) {
      console.warn('[agent-controller] create_subagent_flow_prompt', e?.message ?? e);
    }
  }

  if (profile.mode === 'ask') {
    systemPrompt +=
      '\n\n## Ask mode (read-only)\nAnswer directly. Use read-only evidence tools when the question ' +
      'needs codebase, D1, or project context. Never mutate files, run terminal commands, deploy, or write to D1. ' +
      'If the user asks you to fix or implement something, explain the likely approach and suggest switching to Agent or Debug.';
  }

  if (profile.mode !== 'ask' && workspaceId && !skipHeavyContext) {
    try {
      const { appendDeliveryWorkflowToPrompt } = await import('../agent-delivery-workflow.js');
      systemPrompt = await appendDeliveryWorkflowToPrompt(env, systemPrompt, {
        workspaceId,
        mode: profile.mode,
      });
    } catch (e) {
      console.warn('[agent-controller] delivery_workflow', e?.message ?? e);
    }
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

  emit('runtime_context', runtimeContextPayload(profile, { modelOverride: input.modelOverride ?? null }));
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

  try {
    tools = await filterToolsForCapabilityDecision(env, tools, capabilityDecision, message, {
      requestedMode: profile.mode,
      workspaceId,
      messages: chatMessages,
    });
  } catch (e) {
    console.warn('[agent-controller] tool_capability_filter', e?.message ?? e);
  }

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
      // Quickstart-card first turn ("Slides", "Prototype", etc.): instead of letting the
      // model free-write a markdown question dump, run the same explore -> intake pipeline
      // Plan mode uses for pre_plan, and emit plan_questions_batch so the Questions tab
      // handles it. Only fires on the literal first turn of a quickstart-seeded thread.
      if (
        quickstartBatch &&
        chatMessages.length <= 1 &&
        !threadSlashAction &&
        !createSubagentFlow.active
      ) {
        try {
          const {
            runPlanIntakeExplore,
            generatePlanIntakeQuestions,
            formatPlanIntakeQuestionsForUi,
            insertPlanIntakeBatch,
            newPlanIntakeBatchId,
            supersedePendingBatchesForSession,
          } = await import('../agentsam-plan-intake.js');

          const goalForIntake = stripQuickstartAskInstructions(message);

          if (userId && workspaceId && sessionId) {
            await supersedePendingBatchesForSession(env, { workspaceId, sessionId });
          }

          const explore = await runPlanIntakeExplore(env, {
            goal: goalForIntake,
            workspaceId: workspaceId || '',
            intent: 'mixed',
          });

          const intake = await generatePlanIntakeQuestions(env, {
            goal: goalForIntake,
            explore,
            phase: 'quickstart_intake',
            userId,
            workspaceId,
          });

          if (intake.needs_questions) {
            const batchId = newPlanIntakeBatchId();
            const questionsUi = formatPlanIntakeQuestionsForUi(intake.questions);

            await insertPlanIntakeBatch(env, {
              id: batchId,
              tenant_id: tenantId || env?.TENANT_ID || '',
              workspace_id: workspaceId || '',
              user_id: userId,
              session_id: sessionId,
              phase: 'quickstart_intake',
              status: 'pending',
              goal_text: goalForIntake,
              explore_summary_json: JSON.stringify({ ...explore, synthesis: intake.synthesis }),
              questions_json: JSON.stringify(intake.questions),
              // Stash routing info here (not optional_details — submitPlanIntakeBatch
              // overwrites optional_details with the user's free-text "Anything else?"
              // answer). The quickstart_intake submit-resume branch reads this back to
              // re-resolve the same route_key/task_type/model_key for the real agent turn.
              roadblock_context_json: JSON.stringify({
                source: 'quickstart_intake',
                route_key:
                  body.route_key ??
                  body.routeKey ??
                  profile.refined_route_key ??
                  profile.mode,
                task_type:
                  body.task_type ??
                  body.taskType ??
                  profile.routing_task_type ??
                  null,
                quickstart_card: body.quickstart_card ?? body.quickstartCard ?? null,
                model_key: profile.model_key || null,
                subagent_slug: subagentProfileRow?.slug ?? null,
                requested_mode: 'agent',
              }),
            });

            emit('plan_questions_batch', {
              batch_id: batchId,
              phase: 'quickstart_intake',
              explore_summary: {
                synthesis: intake.synthesis || explore.synthesis,
                files_searched: explore.files_searched,
                searches: explore.searches,
              },
              questions: questionsUi,
              allow_skip: true,
            });
            emit('done', {});
            return;
          }
          // needs_questions === false: goal already specific enough -- still rewrite the
          // first message to the cleaned goal so the model doesn't redundantly free-write
          // questions from the original "ask the user / wait for answers" seed text.
          if (chatMessages.length === 1 && chatMessages[0]?.role === 'user') {
            chatMessages[0] = { ...chatMessages[0], content: goalForIntake };
          }
        } catch (e) {
          console.warn('[agent-controller] quickstart_intake', e?.message ?? e);
          // Non-fatal — fall through to the normal agent tool loop on any intake error.
        }
      }

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
        !createSubagentFlow.active &&
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

      const githubRepoCtx = String(
        body.selectedGithubRepoContext ?? body.github_repo_context ?? body.githubRepoContext ?? '',
      ).trim();
      const wsCtxMobile =
        browserContextPayload &&
        typeof browserContextPayload === 'object' &&
        browserContextPayload.workspaceContext &&
        typeof browserContextPayload.workspaceContext === 'object'
          ? browserContextPayload.workspaceContext
          : null;
      let clientSurface = null;
      let execLane = null;
      if (wsCtxMobile) {
        const { parseClientSurface, parseExecLane } = await import('../mobile-exec-profile.js');
        clientSurface = parseClientSurface(wsCtxMobile);
        execLane = parseExecLane(wsCtxMobile);
      }
      const mcpRuntimeContext = {
        userId,
        tenantId,
        workspaceId,
        sessionId,
        authUser: sessionAuthUser ?? null,
        taskType: profile.routing_task_type,
        routeKey: profile.refined_route_key || profile.mode,
        writePolicy: profile.write_policy,
        userMessage: message,
        runtimeProfile: profile,
        ...(githubRepoCtx
          ? { selectedGithubRepoContext: githubRepoCtx, github_repo_context: githubRepoCtx }
          : {}),
        ...(clientSurface ? { client_surface: clientSurface, clientSurface } : {}),
        ...(execLane ? { exec_lane: execLane, execLane } : {}),
        isSuperadmin:
          sessionAuthUser?.role === 'superadmin' ||
          sessionAuthUser?.is_superadmin === true ||
          sessionAuthUser?.is_superadmin === 1,
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
          authUser: sessionAuthUser ?? null,
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
          chatTurnMeta,
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
    } catch (setupErr) {
      console.warn('[agent-controller] setup_failed', setupErr?.message ?? setupErr);
      emit('error', {
        message: String(setupErr?.message || setupErr || 'Agent setup failed'),
        code: 'agent_setup_error',
      });
      emit('done', {});
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
  const skillRoute = input.skillRoute ?? null;
  if (skillRoute) {
    if (
      skillRoute.skill_id === 'skill_on_brand_genmedia' ||
      skillRoute.master_agent_slug === 'on_brand_genmedia'
    ) {
      return executeGenmediaSkillSpawn(env, ctx, input);
    }
    if (
      skillRoute.skill_id === 'skill_marketing_agency' ||
      skillRoute.master_agent_slug === 'marketing_agency'
    ) {
      return executeLaunchSkillSpawn(env, ctx, input);
    }
    if (
      skillRoute.skill_id === 'skill_brand_aligned_presentations' ||
      skillRoute.master_agent_slug === 'brand_aligned_presentations'
    ) {
      return executeDeckSkillSpawn(env, ctx, input);
    }
    const ext = await executeSkillSpawnByRoute(env, ctx, input);
    if (ext) return ext;
  }
  if (shouldRunRwsFanout(profile)) {
    return executeRwsSpawnFanout(env, ctx, input);
  }
  return runSharedProfileToolLoop(env, ctx, input);
}

