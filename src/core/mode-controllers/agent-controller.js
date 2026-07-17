import { jsonResponse } from '../responses.js';
import { loadAgentSamUserPolicy } from '../agent-policy.js';
import { newChatAgentRunId, scheduleAgentsamChatAgentRunStart, scheduleAgentsamChatAgentRunInsert } from '../agent-run-routing.js';
import { fetchModelCostUsd } from '../agent-model-resolver.js';
import { processWorkspaceSpendAlertsAfterUsage } from '../workspace-spend-guard.js';
import { fireAgentHooks } from '../hook-dispatcher.js';
import { toolsManifestFromCompiledRows, isSimpleAskMessage } from '../runtime-profile.js';
import { executeRwsSpawnFanout, shouldRunRwsFanout } from '../rws-spawn-fanout.js';
import { runtimeContextPayload, legacyContextPayload } from './runtime-context.js';
import { resolveAgentChatLaneContextBlock } from '../agent-chat-lane-context.js';
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
import {
  extractMailSurfaceContext,
  formatMailSurfaceContextForAgent,
} from '../mail-studio-context.js';
import { formatDatabaseContextForAgent } from '../database-studio-context.js';
import { withAbortableAgentRunTimeout } from '../agent-run-timeout.js';
import {
  formatActiveFileForAgent,
  messageReferencesActiveFile,
} from '../active-file-envelope.js';

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  'Access-Control-Allow-Origin': '*',
};

// Production hang cancellation was observed at ~52s. Keep our typed timeout
// comfortably ahead of the platform so finalization can still run.
const AGENT_RUN_HARD_TIMEOUT_MS = 45_000;

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
  const activeRepo = String(body.active_repo ?? body.activeRepo ?? '').trim();
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
  const pendingWrites = new Set();
  const emit = (type, payload) => {
    const write = writer
      .write(encoder.encode(`data: ${JSON.stringify({ type, ...payload })}\n\n`))
      .catch(() => {});
    pendingWrites.add(write);
    write.then(
      () => pendingWrites.delete(write),
      () => pendingWrites.delete(write),
    );
    return write;
  };
  const closeStream = async () => {
    await Promise.allSettled([...pendingWrites]);
    await writer.close().catch(() => {});
  };
  emit('thinking_start', {});
  emit('status', { phase: 'context' });

  void (async () => {
    try {
  let chatMessages =
    Array.isArray(body.messages) && body.messages.length
      ? [...body.messages]
      : [{ role: 'user', content: message }];

  // Hot path: DO/R2 history → model. Never wait on client to resend the thread.
  if (sessionId && (!Array.isArray(body.messages) || !body.messages.length)) {
    try {
      const { getChatMessages } = await import('../agentsam-chat-sessions.js');
      const prior = await getChatMessages(env, sessionId);
      if (Array.isArray(prior) && prior.length) {
        const last = prior[prior.length - 1];
        const lastContent =
          typeof last?.content === 'string'
            ? last.content
            : Array.isArray(last?.content)
              ? last.content
              : null;
        const sameAsCurrent =
          last?.role === 'user' &&
          ((typeof lastContent === 'string' && lastContent === message) ||
            (Array.isArray(lastContent) &&
              lastContent.some((p) => p?.type === 'text' && p?.text === message)));
        chatMessages = sameAsCurrent ? [...prior] : [...prior, { role: 'user', content: message }];
        console.info('[agent-controller] history_hydrate', {
          conversation_id: sessionId,
          prior_count: prior.length,
          outgoing_count: chatMessages.length,
        });
      }
    } catch (e) {
      console.warn('[agent-controller] history_hydrate', e?.message ?? e);
    }
  }

  const {
    resolveChatVisionUpload,
    applyVisionBlocksToChatMessages,
    chatMessagesHaveVisionUpload,
    collectChatVisionUploadFiles,
    resolveImageHandlingMode,
    IMAGE_HANDLING_MODES,
    visionErrorUserMessage,
    VISION_ERROR_CODES,
  } = await import('../chat-composer-attachments.js');
  let visionUploadActive = false;
  let visionUploadError = null;
  let imageHandlingMode = IMAGE_HANDLING_MODES.EPHEMERAL_VISION;
  const visionUploadFiles = collectChatVisionUploadFiles(body);
  if (visionUploadFiles.length) {
    const vision = await resolveChatVisionUpload(body, {
      message,
      sessionId,
      env,
    });
    imageHandlingMode = vision.mode;
    if (!vision.ok && vision.error) {
      visionUploadError = vision.error;
      console.warn('[agent-controller] vision_upload_failed', {
        code: vision.error.code,
        fileCount: visionUploadFiles.length,
        mode: vision.mode,
        detail: vision.error.detail ?? {},
        sizes: visionUploadFiles.map((f) => ({
          name: f?.name ?? null,
          size: f?.size ?? null,
          type: f?.type ?? null,
        })),
      });
    } else if (vision.blocks.length) {
      chatMessages = applyVisionBlocksToChatMessages(chatMessages, message, vision.blocks);
      visionUploadActive = true;
    }
  } else if (
    resolveImageHandlingMode(body, message) === IMAGE_HANDLING_MODES.TEMPORARY_CONTEXT &&
    sessionId &&
    env
  ) {
    const { loadTemporaryVisionImages } = await import('../chat-vision-temp-store.js');
    const cached = await loadTemporaryVisionImages(env, sessionId);
    if (cached.length) {
      chatMessages = applyVisionBlocksToChatMessages(chatMessages, message, cached);
      visionUploadActive = true;
      imageHandlingMode = IMAGE_HANDLING_MODES.TEMPORARY_CONTEXT;
    }
  }
  const createSubagentFlow = resolveCreateSubagentFlow(chatMessages);

  const skipHeavyContext =
    !profile.context_policy?.include_rag &&
    !visionUploadActive &&
    !createSubagentFlow.active &&
    !activeFileEnvelope &&
    (profile.refined_route_key === 'simple_ask_greeting' ||
      (profile.mode === 'agent' && isSimpleAskMessage(message)));

  const promptRouteRow = profile._prompt_route_row ?? null;
  const projectQnaFastLane = profile._project_qna_fast_lane === true;
  let tools = toolsManifestFromCompiledRows(profile._compiled_tool_rows || []);
  if (
    !projectQnaFastLane &&
    env?.DB &&
    (profile.mode === 'agent' || profile.mode === 'debug' || profile.mode === 'multitask')
  ) {
    try {
      const { ensureWorkspaceRgTools, agentToolNameOf } = await import('../agent-tool-loader.js');
      const cap = Math.max(tools.length + 2, Number(profile.max_tools) || 12);
      tools = await ensureWorkspaceRgTools(env, tools, cap);
      const allow = Array.isArray(profile.tool_allowlist) ? [...profile.tool_allowlist] : [];
      for (const t of tools) {
        const nm = agentToolNameOf(t);
        if (nm && !allow.includes(nm)) allow.push(nm);
      }
      profile.tool_allowlist = allow;
      if (!profile.tool_policy) profile.tool_policy = {};
      profile.tool_policy.allowlist = allow;
    } catch (e) {
      console.warn('[agent-controller] ensure_workspace_rg_tools', e?.message ?? e);
    }
  }
  if (!projectQnaFastLane && activeFileEnvelope && env?.DB) {
    const { ensureActiveFileCapabilityTools } = await import('../../api/agent.js');
    const cap = Math.max(tools.length, Number(profile.max_tools) || 8);
    tools = await ensureActiveFileCapabilityTools(env, tools, cap, activeFileEnvelope);
  }
  if (!projectQnaFastLane && activeRepo && env?.DB) {
    try {
      const {
        fetchAgentsamToolRowsByName,
        agentToolNameOf,
        inputSchemaFromAgentsamToolRow,
      } = await import('../agent-tool-loader.js');
      const names = [
        'agentsam_github_tree',
        'agentsam_github_read',
        'agentsam_github_read_many',
        'agentsam_github_search',
        'agentsam_github_repo_list',
        'agentsam_github_list_commits',
      ];
      const have = new Set(tools.map((t) => agentToolNameOf(t)).filter(Boolean));
      const missing = names.filter((n) => !have.has(n));
      if (missing.length) {
        const rows = await fetchAgentsamToolRowsByName(env, missing);
        const cap = Math.max(tools.length + missing.length, Number(profile.max_tools) || 12);
        const seen = new Set(have);
        const injected = [];
        for (const row of rows) {
          const nm = String(row.tool_name || '');
          if (!nm || seen.has(nm)) continue;
          if (tools.length >= cap) break;
          seen.add(nm);
          injected.push(nm);
          tools.unshift({
            name: nm,
            description: String(row.description || nm).slice(0, 4000),
            input_schema: inputSchemaFromAgentsamToolRow(row),
            tool_category: String(row.tool_category || 'builtin'),
            requires_approval: Number(row.requires_approval || 0) === 1,
          });
        }
        // Manifest alone is not enough — validator enforces tool_policy.allowlist.
        if (injected.length) {
          const allow = Array.isArray(profile.tool_allowlist) ? profile.tool_allowlist : [];
          for (const nm of injected) {
            if (!allow.includes(nm)) allow.push(nm);
          }
          profile.tool_allowlist = allow;
          if (!profile.tool_policy) profile.tool_policy = {};
          profile.tool_policy.allowlist = allow;
        }
      }
    } catch (e) {
      console.warn('[agent-controller] ensure_github_repo_tools', e?.message ?? e);
    }
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

  const mailSurfaceRaw = extractMailSurfaceContext(browserContextPayload, body);
  const mailSurfaceBlock = formatMailSurfaceContextForAgent(mailSurfaceRaw);
  if (mailSurfaceBlock) {
    contextBlock = contextBlock
      ? `${contextBlock}\n\n## Mail context\n\n${mailSurfaceBlock}`
      : `## Mail context\n\n${mailSurfaceBlock}`;
    console.info(
      '[agent-controller] mail_surface_context_injected',
      JSON.stringify({
        route: profile.refined_route_key || profile.routing_task_type,
        chars: mailSurfaceBlock.length,
        preview_count: Array.isArray(mailSurfaceRaw?.inboxPreview) ? mailSurfaceRaw.inboxPreview.length : 0,
      }),
    );
  }

  const databaseSurfaceRaw =
    browserContextPayload &&
    typeof browserContextPayload === 'object' &&
    browserContextPayload.databaseContext &&
    typeof browserContextPayload.databaseContext === 'object'
      ? browserContextPayload.databaseContext
      : body.databaseContext && typeof body.databaseContext === 'object'
        ? body.databaseContext
        : null;
  const databaseSurfaceBlock = formatDatabaseContextForAgent(databaseSurfaceRaw);
  if (databaseSurfaceBlock) {
    contextBlock = contextBlock
      ? `${contextBlock}\n\n## Database Studio context\n\n${databaseSurfaceBlock}`
      : `## Database Studio context\n\n${databaseSurfaceBlock}`;
    console.info(
      '[agent-controller] database_surface_context_injected',
      JSON.stringify({
        studio_section:
          databaseSurfaceRaw?.studioSection ?? databaseSurfaceRaw?.studio_section ?? null,
        provider: databaseSurfaceRaw?.provider ?? null,
        resource_ref:
          databaseSurfaceRaw?.resourceRef ?? databaseSurfaceRaw?.resource_ref ?? null,
        chars: databaseSurfaceBlock.length,
      }),
    );
  } else {
    const studioRoute =
      String(
        profile.refined_route_key ||
          profile.routing_task_type ||
          body.route_key ||
          body.routeKey ||
          '',
      ).trim() === 'database_studio';
    if (studioRoute) {
      console.warn(
        '[agent-controller] database_surface_context_missing',
        JSON.stringify({
          route_key: 'database_studio',
          has_browser_context: Boolean(browserContextPayload),
        }),
      );
    }
  }

  if (activeFileEnvelope && messageReferencesActiveFile(message)) {
    const activeFileBlock = formatActiveFileForAgent(activeFileEnvelope);
    if (activeFileBlock) {
      contextBlock = contextBlock
        ? `${contextBlock}\n\n## Active editor file\n\n${activeFileBlock}`
        : `## Active editor file\n\n${activeFileBlock}`;
      console.info(
        '[agent-controller] active_file_context_injected',
        JSON.stringify({
          source: activeFileEnvelope.source,
          path: activeFileEnvelope.path,
          chars: activeFileBlock.length,
        }),
      );
    }
  }

  // Project memory/instructions belong in system context — never the visible user bubble.
  const sessionProjectBlock = String(input.sessionProjectContextBlock || '').trim();
  const workspaceProjectBlock = String(input.projectContextBlock || '').trim();
  const projectBlock = sessionProjectBlock || workspaceProjectBlock;
  const scopedProjectRef = Object.prototype.hasOwnProperty.call(input, 'sessionProjectRef')
    ? input.sessionProjectRef
    : body.project_id ?? body.projectId ?? null;
  if (projectBlock) {
    contextBlock = contextBlock ? `${contextBlock}\n\n${projectBlock}` : projectBlock;
    console.info(
      '[agent-controller] project_session_context_injected',
      JSON.stringify({
        chars: projectBlock.length,
        source: sessionProjectBlock ? 'session_project' : 'workspace_project',
        project_ref: input.sessionProjectRef ?? null,
      }),
    );
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
        projectId: scopedProjectRef,
        projectRef: scopedProjectRef,
        minimalAsk,
        ctx: input.ctx ?? null,
        authUser: sessionAuthUser ?? input.session?.authUser ?? null,
        conversationId: sessionId,
        activeRepo:
          activeRepo ||
          String(body.selectedGithubRepoContext ?? body.github_repo_context ?? body.githubRepoContext ?? '').trim() ||
          null,
        active_repo:
          activeRepo ||
          String(body.selectedGithubRepoContext ?? body.github_repo_context ?? body.githubRepoContext ?? '').trim() ||
          null,
        githubRepoContext:
          String(body.selectedGithubRepoContext ?? body.github_repo_context ?? body.githubRepoContext ?? '').trim() ||
          activeRepo ||
          null,
        activeBranch: String(body.active_branch ?? body.activeBranch ?? body.github_branch ?? 'main').trim() || 'main',
      },
    );
  } else {
    systemPrompt = 'You are Agent Sam. Be direct and helpful.';
  }

  // CMS Working On → site spine (buckets/keys/conventions). Not ambient IDE dump.
  try {
    const { extractCmsAgentContext, formatCmsContextForAgent } = await import('../cms-agent-context.js');
    const cmsCtx = extractCmsAgentContext(body, browserContextPayload);
    if (cmsCtx) {
      const cmsBlock = formatCmsContextForAgent(cmsCtx);
      if (cmsBlock) systemPrompt = `${systemPrompt}\n\n${cmsBlock}`;
    }
  } catch (e) {
    console.warn('[agent-controller] cms site spine skipped', e?.message ?? e);
  }

  const capabilityDecision = null;

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

  const maxRunMs = Math.min(
    Number(profile.max_runtime_ms) || 90000,
    AGENT_RUN_HARD_TIMEOUT_MS - 5000,
  );

  try {
    tools = await filterToolsForCapabilityDecision(env, tools, capabilityDecision, message, {
      requestedMode: profile.mode,
      workspaceId,
      messages: chatMessages,
    });
  } catch (e) {
    console.warn('[agent-controller] tool_capability_filter', e?.message ?? e);
  }

  const { parseThreadSlashCommand } = await import('../thread-on-demand.js');
  const threadSlashAction = parseThreadSlashCommand(message);

  // Compaction is COLD path only — never normalize/stringify live provider payloads
  // (that destroys vision content[] and tool_calls). Snapshot tokens for ops only.
  if (userId && workspaceId && sessionId && !threadSlashAction) {
    try {
      const approxTokens = Math.ceil(
        chatMessages
          .map((m) => {
            if (typeof m?.content === 'string') return m.content;
            try {
              return JSON.stringify(m?.content ?? '');
            } catch {
              return '';
            }
          })
          .join('').length / 4,
      );
      scheduleChatExecutionContextSnapshot(env, ctx, {
        agentRunId: chatAgentRunId,
        workspaceId,
        tenantId,
        conversationId: sessionId,
        contextTokens: approxTokens,
      });
    } catch (e) {
      console.warn('[agent-controller] context_snapshot', e?.message ?? e);
    }
  }

  await (async () => {
    const chatT0 = Date.now();
    let agentRunStartPromise = null;
    let loopStats = null;
    let clientAborted = false;
    const reqSignal = input.request?.signal ?? null;
    let onRequestAbort = null;
    try {
      if (visionUploadError) {
        const failText = visionErrorUserMessage(visionUploadError.code, visionUploadError.message);
        emit('text', { text: failText });
        emit('error', {
          message: failText,
          code: visionUploadError.code || VISION_ERROR_CODES.VISION_ADAPTER_FAILED,
          detail: visionUploadError.detail ?? {},
        });
        emit('done', {});
        return;
      }
      if (visionUploadFiles.length && !chatMessagesHaveVisionUpload(chatMessages)) {
        const failText = visionErrorUserMessage(VISION_ERROR_CODES.NO_IMAGE_FILE_IN_REQUEST);
        emit('text', { text: failText });
        emit('error', { message: failText, code: VISION_ERROR_CODES.NO_IMAGE_FILE_IN_REQUEST });
        emit('done', {});
        return;
      }

      // Quickstart-card first turn ("Slides", "Prototype", etc.): instead of letting the
      // model free-write a markdown question dump, run the same explore -> intake pipeline
      // Plan mode uses for pre_plan, and emit plan_questions_batch so the Questions tab
      // handles it. Only fires on the literal first turn of a quickstart-seeded thread.
      if (
        quickstartBatch &&
        chatMessages.length <= 1 &&
        !threadSlashAction &&
        !createSubagentFlow.active &&
        !/\b(image|photo|picture|render|generat|illustrat|draw|barndo|visual)\b/i.test(message)
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
          if (
            chatMessages.length === 1 &&
            chatMessages[0]?.role === 'user' &&
            !chatMessagesHaveVisionUpload(chatMessages)
          ) {
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
        agentRunStartPromise = scheduleAgentsamChatAgentRunStart(env, ctx, {
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

      const githubRepoCtx = String(
        body.active_repo ??
          body.activeRepo ??
          body.selectedGithubRepoContext ??
          body.github_repo_context ??
          body.githubRepoContext ??
          '',
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
      let isPlatformOperator = false;
      if (wsCtxMobile) {
        const {
          parseClientSurface,
          parseExecLane,
          parsePlatformOperatorLane,
          resolveEffectiveExecLane,
        } = await import('../mobile-exec-profile.js');
        const { userIsPlatformOperator } = await import('../platform-operator-policy.js');
        clientSurface = parseClientSurface(wsCtxMobile);
        execLane = parseExecLane(wsCtxMobile);
        isPlatformOperator =
          parsePlatformOperatorLane(wsCtxMobile) ||
          (userId ? await userIsPlatformOperator(env, sessionAuthUser, workspaceId) : false);
        if (clientSurface && execLane) {
          execLane = resolveEffectiveExecLane(clientSurface, execLane, isPlatformOperator);
        }
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
        fsa_root: profile._fsa_root === true,
        ...(databaseSurfaceRaw
          ? {
              databaseContext: databaseSurfaceRaw,
              database_context: databaseSurfaceRaw,
            }
          : {}),
        ...(browserContextPayload && typeof browserContextPayload === 'object'
          ? { browserContext: browserContextPayload, browser_context: browserContextPayload }
          : {}),
        ...(githubRepoCtx
          ? {
              selectedGithubRepoContext: githubRepoCtx,
              github_repo_context: githubRepoCtx,
              active_repo: githubRepoCtx,
            }
          : {}),
        ...(clientSurface ? { client_surface: clientSurface, clientSurface } : {}),
        ...(execLane ? { exec_lane: execLane, execLane } : {}),
        ...(isPlatformOperator ? { platform_operator_lane: true, platformOperatorLane: true } : {}),
        isSuperadmin:
          sessionAuthUser?.role === 'superadmin' ||
          sessionAuthUser?.is_superadmin === true ||
          sessionAuthUser?.is_superadmin === 1,
      };

      if (reqSignal) {
        if (reqSignal.aborted) clientAborted = true;
        else {
          onRequestAbort = () => { clientAborted = true; };
          reqSignal.addEventListener('abort', onRequestAbort, { once: true });
        }
      }
      const runDeadlineController = new AbortController();
      loopStats = await withAbortableAgentRunTimeout(
        () => runAgentToolLoop(env, ctx, emit, {
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
            signal: runDeadlineController.signal,
            explicitCatalogSeed: null,
        }),
        maxRunMs + 5000,
        runDeadlineController,
      );

      } catch (e) {
        const msg = String(e?.message || e || '');
        const isTimeout = msg.includes('agent_run_timeout') || /\bTimeout\b/i.test(msg);
        const isAbort =
          clientAborted || e?.name === 'AbortError' || /aborted|AbortError/i.test(msg);
        if (isTimeout) {
          loopStats = {
            timedOut: true,
            cancelled: false,
            totalUsage: {},
            modelKey: profile.model_key,
          };
          emit('error', { message: 'Agent run timed out', code: 'agent_run_timeout' });
        } else if (isAbort) {
          loopStats = {
            cancelled: true,
            timedOut: false,
            totalUsage: {},
            modelKey: profile.model_key,
          };
        } else {
          console.warn('[agent-controller] loop_failed', e?.message ?? e);
          if (!e?.alreadyEmitted) {
            emit('error', { message: e?.message ?? 'Agent loop failed', code: e?.code || 'agent_spine_error' });
          }
        }
        if (!loopStats?.cancelled) {
          emit('done', {});
        }
      } finally {
        if (reqSignal && onRequestAbort) {
          reqSignal.removeEventListener('abort', onRequestAbort);
        }
        await closeStream();
        const finalizeAccounting = async () => {
          if (!chatAgentRunId || !userId || !workspaceId) return;
          const cancelled = loopStats?.cancelled === true || clientAborted;
          const timedOut = loopStats?.timedOut === true;
          const inputTokens = Math.max(0, Math.floor(Number(loopStats?.totalUsage?.input_tokens) || 0));
          const outputTokens = Math.max(
            0,
            Math.floor(Number(loopStats?.totalUsage?.output_tokens) || 0),
          );
          const cacheReadTokens = Math.max(
            0,
            Math.floor(Number(loopStats?.totalUsage?.cache_read_input_tokens) || 0),
          );
          const mk = loopStats?.modelKey || profile.model_key;
          const costUsd =
            inputTokens > 0 || outputTokens > 0
              ? await fetchModelCostUsd(env, mk, inputTokens, outputTokens, cacheReadTokens)
              : 0;
          const finalSuccess = Boolean(loopStats) && !cancelled && !timedOut;
          const errorMessage = cancelled
            ? 'agent_run_cancelled'
            : timedOut
              ? 'agent_run_timeout'
              : loopStats == null
                ? 'agent_spine_error'
                : null;

          const finalizePayload = {
            runId: chatAgentRunId,
            userId,
            tenantId,
            workspaceId,
            conversationId: sessionId ? String(sessionId) : null,
            routingArmId: profile.routing_arm_id,
            modelKey: mk,
            taskType: profile.routing_task_type,
            mode: profile.mode,
            routeKey: profile.refined_route_key,
            success: finalSuccess,
            cancelled,
            inputTokens,
            outputTokens,
            costUsd,
            durationMs: Date.now() - chatT0,
            errorMessage,
            workflowRunId: loopStats?.workflowRunId ?? null,
            chainRootId: loopStats?.chainRootId ?? null,
            timedOut,
            fallbackUsed: false,
            fallbackReason: null,
            modelsTried: mk ? [mk] : [],
            quickstartBatch: quickstartBatch || null,
          };
          if (agentRunStartPromise) {
            await agentRunStartPromise.catch(() => {});
          }
          scheduleAgentsamChatAgentRunInsert(env, ctx, finalizePayload);

          const isSuperadmin =
            sessionAuthUser?.role === 'superadmin' ||
            sessionAuthUser?.is_superadmin === true ||
            sessionAuthUser?.is_superadmin === 1;
          if (inputTokens > 0 || outputTokens > 0 || costUsd > 0) {
            await processWorkspaceSpendAlertsAfterUsage(env, ctx, {
              tenantId,
              workspaceId,
              userId,
              sessionId: sessionId ? String(sessionId) : null,
              isSuperadmin,
            });
          }
        };
        const accountingTask = finalizeAccounting().catch((e) =>
          console.warn('[agent-controller] finalize_accounting', e?.message ?? e),
        );
        if (ctx?.waitUntil) ctx.waitUntil(accountingTask);
      }
  })();
    } catch (setupErr) {
      console.warn('[agent-controller] setup_failed', setupErr?.message ?? setupErr);
      emit('error', {
        message: String(setupErr?.message || setupErr || 'Agent setup failed'),
        code: 'agent_setup_error',
      });
      emit('done', {});
      await closeStream();
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

