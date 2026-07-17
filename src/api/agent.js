/**
 * API Layer: Agent Sam Reasoning Engine
 * Handles all /api/agent/* routes.
 *
 * Key notes:
 *  - Provider dispatch metadata: D1 agentsam_model_catalog (canonical); agentsam_ai is legacy/persona/BYOK overlay.
 *  - agent_model_registry is legacy/staging/enrichment — never used for chat routing or billing math here.
 *  - No hardcoded model strings — always resolved from DB
 *  - Tool definitions: agent chat → agentsam_tools via selectAgentsamToolsForAgentChat (lane→tool_category, allowlist,
 *    workspace_scope, modes_json). Execution: dispatchByToolCode only (no runBuiltinTool). Cap: maxModelToolsForAgentTask.
 *  - MCP catalog (management JSON): GET /api/mcp/tools/catalog (lane, limit, include_schema).
 *  - Approval gate wired for high-risk tool calls
 *  - Telemetry written per request via writeTelemetry
 *  - Tool execution delegated to src/tools/ai-dispatch.js
 *  - agentsam_tool_call_log: scheduleToolCallLog (agentsam-ops-ledger.js) with PRAGMA-driven columns; identity fields
 *    from validateToolCall + toolLogFieldsFromValidation on hot paths.
 *
 * P0 data isolation audit 2026-05-23 — unscoped SELECT lines (grep -v WHERE user_id|workspace_id|tenant_id):
 * Full log: artifacts/p0-data-isolation-audit-20260523.txt
 * Sample hits patched this pass: agentsam_plans/tasks, agentsam_todo, agent_conversations/messages/sessions, /problems.
 */
import { chatWithAnthropic }                            from '../integrations/anthropic.js';
import { dispatchStream, resolveModelMeta } from '../core/provider.js';
import {
  resolveModelForTask,
  normalizeCanonicalTaskType,
  ResolutionError,
  computeCostUsd as computeModelCostUsd,
} from '../core/resolveModel.js';
import {
  resolveWorkspaceCapabilityShellWorkflowId,
  isWorkspaceCapabilityActionIntent,
} from '../core/workspace-capability-actions/index.js';
import { scheduleMirrorAgentsamPlanToSupabasePublic } from '../core/agentsam-plan-supabase-public-sync.js';
import { listUserChatSessions, patchUserChatSession, deleteUserChatSession, initChatSessionR2, appendChatMessage, getChatMessages, scheduleChatSessionTitleInsert } from '../core/agentsam-chat-sessions.js';
import {
  legacyUnifiedRagSearch,
  handleAgentMemorySync,
  insertCuratedAgentMemory,
  searchCuratedAgentMemory,
} from './rag.js';
import { LANES, writeToLane, writeMemoryLane } from '../core/rag-lanes.js';
import { resolveAgentChatLaneContextBlock } from '../core/agent-chat-lane-context.js';
import { loadAgentMemoryForPrompt }                     from '../core/memory.js';
import { writeTelemetry }                               from './telemetry.js';
import { jsonResponse }                                 from '../core/responses.js';
import { startAgentChatEarlySse } from '../core/agent-chat-early-sse.js';
import { withD1Retry } from '../core/d1-retry.js';
import { authUserFromRequest, getSession,
         isIngestSecretAuthorized,
         fetchAuthUserTenantId,
         authUserIsSuperadmin,
         platformTenantIdFromEnv,
         resolveRequestContext }    from '../core/auth.js';
import { resolveGitHubToken } from '../core/github-token.js';
import {
  fetchAgentGitStatus,
  fetchGitStatusFromGitHub,
  fetchWorkspaceGithubRepo,
  pingPtyServiceHealth,
  setUserWorkspaceActiveBranch,
} from '../core/status-bar-runtime.js';
import { resolveIdentity, resolveIamActorContext } from '../core/identity.js';
import { selectAgentsamMcpToolsList } from '../core/agentsam-mcp-tools.js';
import { maxModelToolsForAgentTask } from '../core/mcp-tools-branded.js';
import {
  resolveAgentChatRouteToolRequirements,
  effectiveAgentChatToolCap,
} from '../core/agentsam-route-tool-resolver.js';
import { resolveActiveBootstrap } from '../core/bootstrap.js';
import { buildScopedBootstrapContext } from '../core/bootstrap-scoped-context.js';
import {
  readAgentBootstrapCache,
  writeAgentBootstrapCache,
} from '../core/agent-bootstrap-project-context.js';
import {
  loadAgentSamUserPolicy,
  isToolAllowedByAllowlist,
  isToolAllowedByPolicyRisk,
  isSubagentToolName,
  collectAllowlistToolKeysForScope,
} from '../core/agent-policy.js';
import {
  aggregateAnthropicUsageTokens,
  aggregateOpenAiCompatibleUsageTokens,
  extractCompactionFromAnthropicUsage,
  scheduleCompactionFromAnthropicUsage,
  scheduleInsertAgentCost,
} from '../core/agent-costs.js';
import { evaluateGuardrails } from '../core/guardrails.js';
import { extractBrowserNavigateUrl } from '../core/extract-browser-url.js';
import { scheduleToolCallLog } from '../core/agentsam-ops-ledger.js';
import {
  scheduleRecordMcpToolExecution,
  recordMcpToolOtlpSpan,
  tryReadAgentsamToolCache,
  writeAgentsamToolCacheAfterSuccess,
} from '../core/mcp-tool-execution.js';
import { recordSpan } from '../core/tracer.js';
import {
  insertAgentRunExecutionStep,
  newChatAgentRunId,
  normalizeChatDispatchSpine,
  scheduleAgentsamChatAgentRunInsert,
  scheduleAgentsamChatAgentRunStart,
} from '../core/agent-run-routing.js';
import { pragmaTableInfo } from '../core/retention.js';
import { formatRelativeCheckedAgo, toUnixSeconds }     from './workspaces.js';
import { notifySam }                                    from '../core/notifications.js';
import { getAgentMetadata, logSkillInvocation,
         getActivePromptByWeight, getPromptMetadata }   from './agentsam.js';
import { normalizeToolName } from '../tools/ai-dispatch.js';
import { dispatchByToolCode } from '../core/dispatch-by-tool-code.js';
import {
  selectAgentsamToolsForAgentChat,
  selectAgentsamToolsForChatRuntime,
  loadAgentsamToolRow,
  parseMcpTemplateServerKeys,
  loadPromptRouteMcpServerKeys,
} from '../core/agentsam-tools-catalog.js';
import {
  isImageGenerationTool,
  isPrimaryImageGenerationIntent,
  hasImageGenerationIntent,
  hasVideoGenerationIntent,
  handleDirectImageGenerationChatStream,
  streamImageGenerationSse,
} from '../tools/image_generation.js';
import { getCapabilityTools } from '../core/capability-tools.js';
import { loadAvailableToolsForCapability } from '../core/tool-registry.js';
import {
  resolveRoutingArmByModelKey,
  validateModelAgainstRouteRequirements,
  scheduleRoutingArmBanditUpdate,
  scheduleRoutingArmQualityUpdate,
  applyRoutingArmUsageFeedback,
  loadChatRoutingArmsModelKeyOrder,
  queryRoutingArmsCandidates,
  resolveRoutingTaskType,
  loadRouteRequirementsRow,
  recordRoutingArmOutcome,
  isAnthropicSmoketestQuickstartBatch,
} from '../core/routing.js';
import {
  BUILDER_TASK_TYPES,
  SCOUT_TASK_TYPES,
} from '../core/model-catalog-capabilities.js';
import { listAgentsamSlashCommands } from '../core/agentsam-command-catalog.js';
import {
  resolveProviderForModelKey,
  writeUsageEvent,
  writeUsageEventFromChat,
  usageEventExtraColumnSql,
} from '../core/usage-event-writer.js';
import { buildRoutingDecision } from '../core/routingDecision.js';
import { fireAgentHooks } from '../core/hook-dispatcher.js';
import { hydrateSkillsFromR2 } from '../core/agentsam-skill-r2.js';
import { triggerEvalAfterNRuns } from '../core/eval-runner.js';
import {
  scheduleEscalationAttempt,
  isEtoThompsonOwner,
  applyEtoToRoutingArms,
  shouldApplyEtoAfterRun,
} from '../core/performance-eto.js';
import { listPlatformQuickstartTemplates } from '../core/agent-quickstart-templates.js';
import {
  resolveSubagentProfileForChat,
  appendSubagentProfileToSystemPrompt,
  filterToolsForSubagentProfile,
  applySubagentDefaultModelToBody,
} from '../core/subagent-profile-resolve.js';
import {
  scheduleAgentsamCommandRunInsert,
  fireForgetAgentToolChainRow,
  resolveAgentCommand,
} from './command-run-telemetry.js';
import { resolveCanonicalUserId } from './auth.js';
import { resolveAgentDataScope } from '../core/data-isolation-scope.js';
import { estimateModelRunCostUsd } from '../core/model-pricing.js';
import { logPromptCacheUsage } from '../core/prompt-cache-economics.js';
import {
  messageRequestsBrowserInspect,
  messageRequestsOpenWebSearch,
  messageRequestsWebFetch,
  messageRequestsWorkspaceGrep,
  resolveOpenWebSearchBackend,
  WORKSPACE_GREP_TOOL_NAMES,
} from '../core/agent-lane-router.js';
import {
  CODE_IMPLEMENTATION_TOOL_NAMES,
  isCodeImplementationIntent,
  isReadOnlyFileContextIntent,
  isReadOnlyRepoSearchIntent,
  messageExplicitlyRequestsBrowserInspection,
  shouldAllowAgentChatWorkflowGraph,
  shouldSkipSurfaceWorkflowPreflight,
} from '../core/code-implementation-intent.js';
import { stripUserTextForIntent, activeFileBlocksImageGeneration, extractOpenFileContentFromMessage, applyActiveFileDefaultsToToolInput, activeFileIsLocalWorkspaceBuffer, activeFileIsGithubBound } from '../core/active-file-envelope.js';
import {
  buildHandoffPrimingUserMessage,
  executeAgentHandoffFromLoop,
  markHandoffAccepted,
  patchAgentRunBudgetProgress,
  resolvePendingHandoffForSession,
} from '../core/agent-handoff.js';
import {
  buildAgentChatResolvedContext,
  mergeResolvedContextIntoRunContext,
} from '../core/agent-chat-resolved-context.js';
import {
  messageHasBrowserUrlNavigation,
  inferIntentHeuristically,
  classifyIntent,
} from './agent/classify-intent.js';
import { userCanAccessWorkspace } from '../core/cms-theme-resolve.js';
import {
  routingPickFromResolveModelForTask,
  fetchModelCostUsd,
  filterWorkspaceModelTierPool,
  resolveDefaultModel,
  resolveAiModelRowById,
  resolveAiModelFromRequest,
  resolveAskFastModelKey,
  gateRewriteAndClassify,
  intentSlugFromHeuristic,
  loadChatRoutingFallbackRows,
  loadToolFallbackChain,
  resolveAgentsamAiRowByModelKey,
  dedupeModelsByKey,
  filterGraniteAutoChain,
  rowIsGranite,
  rowIsExternalProvider,
  withTimeout,
  kickoffModelTierMigration,
  recordArmOutcome,
} from '../core/agent-model-resolver.js';
import {
  appendSkillsAndRulesToSystemPrompt,
  loadBlendedSkillsForRequest,
} from '../core/agent-skills-rules.js';
import {
  buildSystemPrompt,
  parseJsonSafe,
  resolvePromptRouteRowForAgentChat,
  resolveAgentsamPromptRoute,
  scheduleAgentsamToolCallLog,
  toolLogFieldsFromValidation,
  scheduleAgentsamArtifactFromChatOutput,
  extractLastAssistantPlainText,
  inferArtifactFromAssistantText,
  resolveBootstrapWorkspaceIdForAgentApi,
  fetchActivePlanContextFragment,
  isSimpleAskMessage,
} from '../core/agent-prompt-builder.js';
import {
  loadToolsForRequest,
  loadModeToolPolicy,
  ensureActiveFileCapabilityTools,
  filterAgentToolsForRequest,
  enrichToolsFromAgentsamCatalog,
  ensureImageCapabilityTools,
  ensureVideoCapabilityTools,
  ensureCodeCapabilityTools,
  ensureBrowserCapabilityTools,
  ensureWebLaneTools,
  mergeToolsFromPromptRouteKeys,
  shouldEnsureBrowserCapabilityTools,
  shouldEnsureCodeCapabilityTools,
  chatModeUsesToolLoop,
  shouldOpenChatToolSessionLedger,
} from '../core/agent-tool-loader.js';
import {
  validateToolCall,
  dispatchToolCall,
  dispatchToolCallWithBudget,
  resolveToolExecutionBudgetMs,
  formatToolApprovalPreview,
  chatToolSessionSseBase,
  createChatToolSessionLedger,
  appendChatToolSessionLedgerStep,
  finalizeChatToolSessionLedger,
} from '../core/agent-tool-validator.js';
import {
  needsApproval,
  createApprovalRequest,
  pollApprovalQueue,
  checkApprovalGate,
  auditToolDecision,
  scheduleAgentsamUsageEventFromChat,
} from '../core/agent-approval-gate.js';
import {
  consumeOpenAIChatCompletionsSse,
  consumeOpenAIResponsesSse,
  tryEmitCodeDiffFromToolOutput,
  safeJsonParse,
} from '../core/agent-sse-consumer.js';
import { runAgentToolLoop } from '../core/agent-tool-loop.js';
import {
  executeWorkflowAndStream,
  resolveSurfaceWorkflowForMessage,
  resolveSurfaceWorkflowPreflightExecution,
  logSurfacePreflightIntentDebug,
  shouldBypassSurfaceWorkflowPreflight,
  logSurfaceWorkflowPreflightBypass,
  streamBrowserPreflightNoWorkflow,
  streamPreflightSurfaceWorkflowMissing,
  extractPrimaryUrlForBrowserPreflight,
  mcpPanelAgentChatSse,
  mcpPanelToolMatchesGlob,
  filterToolsForMcpPanelGlobs,
} from '../core/agent-surface-workflow.js';


/**
 * Map resolveModelForTask() → legacy routing pick shape used by chat chain assembly.
 * @param {any} env
 * @param {{ taskType: string, mode?: string, workspaceId: string, tenantId?: string|null, toolRequired?: boolean }} opts
 */
export async function loadModeConfig(env, modeSlug, workspaceId = null) {
  const slug = (modeSlug || 'auto').toLowerCase();
  const defaults = {
    slug,
    temperature: 0.7,
    auto_run: 0,
    max_tool_calls: 15,
    max_runtime_ms: 90000,
    max_turns: 6,
    system_prompt_fragment: null,
    context_strategy: 'standard',
    tool_policy_json: null,
    gate_model: null,
    gate_reasoning_effort: null,
    escalation_model: null,
    escalation_threshold: 0,
  };
  if (!env.DB) return defaults;

  const ws =
    workspaceId != null && String(workspaceId).trim() !== ''
      ? String(workspaceId).trim()
      : null;
  if (!ws) return defaults;

  try {
    const gateResolved = await resolveModelForTask(env, {
      task_type: 'ask',
      mode: 'auto',
      workspace_id: ws,
    });
    const escResolved = await resolveModelForTask(env, {
      task_type: 'ask',
      mode: 'agent',
      workspace_id: ws,
    });
    return {
      ...defaults,
      slug,
      gate_model: gateResolved.model_key,
      escalation_model: escResolved.model_key,
    };
  } catch (_) {
    return defaults;
  }
}

async function loadCapabilityAliasToolKeysForTask(env, taskType) {
  if (!env?.DB) return [];
  const tt = String(taskType || '').trim().toLowerCase();
  if (!tt) return [];
  try {
    const dotted = tt.replace(/_/g, '.');
    const { results } = await env.DB.prepare(
      `SELECT match_value
       FROM agentsam_capability_aliases
       WHERE is_active = 1
         AND lower(trim(match_kind)) = 'tool_key'
         AND (
           lower(trim(abstract_capability)) = ?
           OR lower(trim(abstract_capability)) = ?
           OR lower(trim(abstract_capability)) LIKE ? || '.%'
           OR lower(replace(trim(abstract_capability), '.', '_')) = ?
         )
       ORDER BY priority ASC
       LIMIT 24`,
    )
      .bind(tt, dotted, dotted, tt)
      .all();
    const keys = [];
    for (const row of results || []) {
      const v = String(row.match_value || '').trim();
      if (v) keys.push(v);
    }
    return [...new Set(keys)];
  } catch (e) {
    console.warn('[agent] capability_alias_tools', e?.message ?? e);
    return [];
  }
}

function isSkillCreatorIntakeMessage(message) {
  const m = String(message || '').trim();
  if (!m) return false;
  if (
    /\b(SKILL\.md|src\/skills\/|agentsam_skill|playwright|validate the skill|wrun_|plan_\w{8,})\b/i.test(
      m,
    )
  ) {
    return false;
  }
  return (
    /\b(create|make|build|write|add|new)\b.{0,50}\b(skill|skills)\b/i.test(m) ||
    /\b(skill|skills)\b.{0,40}\b(for|to help|that helps)\b/i.test(m)
  );
}

async function loadSkillCreatorSkillRow(env) {
  if (!env?.DB) return null;
  try {
    return await env.DB.prepare(
      `SELECT id, name, content_markdown FROM agentsam_skill
       WHERE id = 'skill_skill_creator' AND is_active = 1 LIMIT 1`,
    ).first();
  } catch {
    return null;
  }
}

async function shouldIncludeRag(env, taskType, tenantId) {
  if (!env.DB) return false;
  try {
    const row = await env.DB.prepare(
      `SELECT include_rag FROM agentsam_prompt_routes
      WHERE is_active = 1
        AND (route_key = ? OR intent_labels LIKE ?)
        AND (tenant_id IS NULL OR tenant_id = ? OR trim(COALESCE(tenant_id,'')) = '')
      ORDER BY priority ASC
      LIMIT 1`,
    )
      .bind(taskType, `%"${taskType}"%`, tenantId ?? '')
      .first();
    return row?.include_rag === 1;
  } catch {
    return false;
  }
}

/** SQL/D1 intents bypass workflow routing (Monaco/code surfaces stay available via tools). */
function isD1SqlIntent(message) {
  const t = String(message || '').toLowerCase();
  const d1SqlKeywords = [
    /\bd1\b/,
    /\bsql\b/,
    /\bdatabase\b/,
    /\btable\b/,
    /\bquery\b/,
    /\bselect\b/,
    /\binsert\b/,
    /\bupdate\b/,
    /\bdelete\b/,
    /\balter\b/,
    /\bcreate table\b/,
    /\bdrop table\b/,
  ];
  return d1SqlKeywords.some((pattern) => pattern.test(t));
}

async function resolveWorkflowForMessage(env, taskType, message, workspaceId, opts = {}) {
  if (!env.DB) return null;
  if (isD1SqlIntent(message)) {
    return null;
  }
  if (isReadOnlyRepoSearchIntent(message)) {
    return null;
  }
  const dashboardRoute =
    opts.dashboardRoute != null ? String(opts.dashboardRoute).trim() : '';
  if (!shouldAllowAgentChatWorkflowGraph(message, { dashboardRoute })) {
    return null;
  }
  const codeWork =
    isCodeImplementationIntent(message) && !messageExplicitlyRequestsBrowserInspection(message);
  if (codeWork) {
    try {
      const wf = await env.DB.prepare(
        `SELECT id, workflow_key, display_name, default_task_type,
                risk_level, requires_approval
         FROM agentsam_workflows
         WHERE workflow_key = ? AND COALESCE(is_active, 1) = 1 LIMIT 1`,
      )
        .bind('i-am-builder-monaco')
        .first();
      if (wf) return wf;
    } catch {
      /* fall through */
    }
  }
  if (dashboardRoute === '/dashboard/agent' || dashboardRoute.startsWith('/dashboard/agent/')) {
    if (!codeWork) {
      const intentRaw = taskType != null ? String(taskType).trim() : '';
      const intent = intentRaw && intentRaw.toLowerCase() !== 'auto' ? intentRaw : '*';
      const wfKey = await resolveWorkflowFromSurfaceMetadata(env, '/dashboard/agent', intent);
      if (wfKey) {
        try {
          const wf = await env.DB.prepare(
            `SELECT id, workflow_key, display_name, default_task_type,
                    risk_level, requires_approval
             FROM agentsam_workflows
             WHERE workflow_key = ? AND COALESCE(is_active, 1) = 1 LIMIT 1`,
          )
            .bind(wfKey)
            .first();
          if (wf) return wf;
        } catch (e) {
          console.warn('[agent] resolveWorkflowForMessage agent_surface', e?.message ?? e);
        }
      }
    }
  }
  const t = String(message || '').toLowerCase();
  if (userExplicitlyRequestsMonacoEditor(message) || codeWork) {
    try {
      const wf = await env.DB.prepare(
        `SELECT id, workflow_key, display_name, default_task_type,
                risk_level, requires_approval
         FROM agentsam_workflows
         WHERE workflow_key = ? AND is_active = 1 LIMIT 1`,
      )
        .bind('i-am-builder-monaco')
        .first();
      if (wf) return wf;
    } catch {
      /* fall through */
    }
  }
  const keywordMap = [
    [
      /\b(implement|build|scaffold|wire)\b.{0,48}\b(dashboard|page|component|route|module|feature)\b/i,
      'i-am-builder-monaco',
    ],
    [/\b(excalidraw|draw|diagram|wireframe|flowchart)\b/, 'i-am-architect-excalidraw'],
    [/\b(architect|plan|design spec)\b/, 'i-am-architect-plan'],
    [/\b(playwright|screenshot|browser test|e2e)\b/, 'i-am-inspector-playwright'],
    [/\b(qa|smoke test|test suite|run tests)\b/, 'i-am-inspector-qa'],
    [/\b(deploy to cloudflare|wrangler deploy|cf deploy)\b/, 'i-am-operator-deploy'],
    [/\b(build on github|push to github|git commit)\b/, 'i-am-builder-github'],
  ];
  for (const [pattern, wfKey] of keywordMap) {
    if (pattern.test(t)) {
      try {
        const wf = await env.DB.prepare(
          `SELECT id, workflow_key, display_name, default_task_type,
                  risk_level, requires_approval
           FROM agentsam_workflows
           WHERE workflow_key = ? AND is_active = 1 LIMIT 1`,
        )
          .bind(wfKey)
          .first();
        if (wf) return wf;
      } catch {
        /* fall through */
      }
    }
  }
  return null;
}

async function loadIntentPattern(env, intentSlug) {
  if (!env.DB || !intentSlug) return null;
  try {
    return await env.DB.prepare(
      `SELECT workflow_agent, tools_json FROM agentsam_routing_arms
       WHERE intent_slug = ? AND is_active = 1 LIMIT 1`
    ).bind(String(intentSlug).trim().toLowerCase()).first();
  } catch (_) {
    return null;
  }
}

function normalizeAgentRuntimeMode(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (['agent', 'plan', 'debug', 'multitask', 'ask', 'auto'].includes(v)) return v;
  return 'agent';
}

/**
 * Ask-mode fast path: no tools; system prompt + model from D1 (`buildSystemPrompt`,
 * `agentsam_prompt_routes`, `agentsam_ai` / defaults). Caller must pass `request` on opts.
 *
 * DEAD CODE (Phase 1 spine refactor): no longer called from `agentChatSseHandler`; retained for audit PR.
 */
async function agentChatDirectSseHandler(env, ctx, opts) {
  const request = opts.request;
  if (!request) return jsonResponse({ error: 'internal_request_missing' }, 500);
  const message = String(opts.message ?? '').trim();
  if (!message) return jsonResponse({ error: 'message required' }, 400);
  if (opts.stream === false) return jsonResponse({ error: 'stream_required' }, 400);

  const systemPrompt =
    String(opts.systemPrompt || '').trim() ||
    'You are Agent Sam, an AI assistant for Inner Animal Media. Be direct, concise, and helpful.';
  const modelKey = String(opts.modelKey ?? opts.model_key ?? opts.model ?? '').trim();
  if (!modelKey) return jsonResponse({ error: 'model_key required' }, 400);

  const workspaceId = opts.workspaceId;
  const tenantId = opts.tenantId ?? null;
  const userId = opts.userId ?? null;
  const sessionId =
    opts.conversationId || opts.session_id || opts.sessionId || null;

  const userPolicy = await loadAgentSamUserPolicy(env, userId, workspaceId);
  const loadedMc = opts.modeConfig && typeof opts.modeConfig === 'object' ? opts.modeConfig : {};
  const modeConfig = {
    ...loadedMc,
    max_tool_calls: 0,
  };

  const intentResult =
    opts.intentResult && typeof opts.intentResult === 'object' ? opts.intentResult : {};
  const promptRouteRow =
    opts.promptRouteRow && typeof opts.promptRouteRow === 'object' ? opts.promptRouteRow : null;
  const routeKey =
    promptRouteRow?.route_key != null && String(promptRouteRow.route_key).trim() !== ''
      ? String(promptRouteRow.route_key).trim()
      : null;
  const routingTaskType = normalizeCanonicalTaskType(intentResult?.taskType || 'ask');
  const routingArmId =
    opts.routingDecision?.selected_arm_id != null &&
    String(opts.routingDecision.selected_arm_id).trim() !== ''
      ? String(opts.routingDecision.selected_arm_id).trim()
      : opts.routingArmId != null && String(opts.routingArmId).trim() !== ''
        ? String(opts.routingArmId).trim()
        : opts.routing_arm_id != null && String(opts.routing_arm_id).trim() !== ''
          ? String(opts.routing_arm_id).trim()
          : null;

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const emit = (type, payload) => {
    try {
      writer.write(encoder.encode(`data: ${JSON.stringify({ type, ...payload })}\n\n`));
    } catch (_) {}
  };

  const chatAgentRunId =
    env.DB && userId && workspaceId ? newChatAgentRunId() : null;
  const runStartedAt = Date.now();

  (async () => {
    const doneGuard = { emitted: false };
    const safeDone = (p) => {
      if (doneGuard.emitted) return;
      doneGuard.emitted = true;
      emit('done', p || {});
    };
    let loopStats = null;
    let finalSuccess = false;
    let finalError = null;
    try {
      if (chatAgentRunId && userId && workspaceId) {
        scheduleAgentsamChatAgentRunStart(env, ctx, {
          runId: chatAgentRunId,
          run_group_id: chatAgentRunId,
          userId,
          tenantId,
          workspaceId,
          conversationId: sessionId ? String(sessionId) : null,
          routingArmId,
          modelKey,
          selectedModel: modelKey,
          taskType: routingTaskType,
          mode: 'ask',
          routeKey,
          intent: intentResult.intent != null ? String(intentResult.intent) : 'question',
          trigger: 'chat_sse',
          requiresTools: false,
          modelSupportsTools: true,
          routingStrategy: 'ask_fast_path',
          fallbackUsed: false,
          planId: opts.planId ?? opts.plan_id ?? null,
          taskId: opts.taskId ?? opts.task_id ?? null,
          workSessionId: sessionId ? String(sessionId) : null,
        });
      }
      emit('context', {
        intent: intentResult.intent != null ? String(intentResult.intent) : 'question',
        task_type: intentResult.taskType != null ? String(intentResult.taskType) : null,
        mode: 'ask',
        prompt_lane: 'ask_fast_path',
        route_key: routeKey,
        minimal_prompt_d1_only: 1,
        model: modelKey,
        tool_count: 0,
        ...(routingArmId ? { routing_arm_id: routingArmId } : {}),
        ...(opts.routingDecision?.routing_decision_id
          ? { routing_decision_id: opts.routingDecision.routing_decision_id }
          : {}),
        ...(chatAgentRunId ? { agent_run_id: chatAgentRunId } : {}),
      });

      const mcpRuntimeContext = {
        userId,
        tenantId,
        workspaceId,
        personUuid: null,
        sessionId,
        isSuperadmin: false,
        routeKey,
      };

      const askMaxRunMs =
        Number(modeConfig.max_runtime_ms) > 0 ? Number(modeConfig.max_runtime_ms) : 25_000;
      const askTimeoutMs = Math.max(5_000, askMaxRunMs - 2_000);
      const askAbort = new AbortController();
      const askTimer = setTimeout(() => askAbort.abort('ask_timeout'), askTimeoutMs);

      loopStats = await Promise.race([
        runAgentToolLoop(env, ctx, emit, {
          request,
          messages: [{ role: 'user', content: message }],
          tools: [],
          systemPrompt,
          modelKey,
          temperature: modeConfig.temperature,
          maxToolCalls: 0,
          mode: 'ask',
          modeConfig,
          userPolicy,
          sessionId,
          tenantId,
          userId,
          workspaceId,
          routingTaskType,
          qualityScore: null,
          mcpRuntimeContext,
          routingArmId,
          thompsonModelKey: opts.routingDecision?.model_key ?? modelKey,
          runStartedAt,
          maxRuntimeMs: askMaxRunMs,
          chatAgentRunId,
          promptAuditContext: {
            route: 'agent_chat_ask_fast',
            session_id: sessionId,
            workspace_id: workspaceId,
            mode: 'ask',
            route_key: routeKey,
            task_type: intentResult.taskType ?? null,
          },
          doneGuard,
          chatRouteKey: routeKey,
          signal: askAbort.signal,
        }),
        new Promise((_, reject) => {
          askAbort.signal.addEventListener('abort', () => {
            const err = new Error('ask_timeout');
            err.name = 'AbortError';
            reject(err);
          });
        }),
      ]).finally(() => clearTimeout(askTimer));
      finalSuccess = loopStats?.timedOut !== true;
      finalError = loopStats?.timedOut === true ? 'agent_run_timeout' : null;
    } catch (e) {
      finalSuccess = false;
      finalError =
        e?.name === 'AbortError' || String(e?.message || '').includes('ask_timeout')
          ? 'ask_timeout'
          : String(e?.message || e || 'error').slice(0, 2000);
      emit('error', { message: finalError, code: finalError === 'ask_timeout' ? 'ask_timeout' : 'model_error' });
      if (!doneGuard.emitted) safeDone({});
    } finally {
      const inputTokens = Math.max(0, Math.floor(Number(loopStats?.totalUsage?.input_tokens) || 0));
      const outputTokens = Math.max(
        0,
        Math.floor(Number(loopStats?.totalUsage?.output_tokens) || 0),
      );
      const cacheReadTokens = Math.max(
        0,
        Math.floor(Number(loopStats?.totalUsage?.cache_read_input_tokens) || 0),
      );
      const timedOut = loopStats?.timedOut === true || finalError === 'agent_run_timeout';
      const costUsd =
        inputTokens > 0 || outputTokens > 0
          ? await fetchModelCostUsd(
              env,
              loopStats?.modelKey || modelKey,
              inputTokens,
              outputTokens,
              cacheReadTokens,
            )
          : 0;
      if (chatAgentRunId && userId && workspaceId) {
        scheduleAgentsamChatAgentRunInsert(env, ctx, {
          runId: chatAgentRunId,
          userId,
          tenantId,
          workspaceId,
          conversationId: sessionId ? String(sessionId) : null,
          routingArmId,
          modelKey: loopStats?.modelKey || modelKey,
          taskType: routingTaskType,
          mode: 'ask',
          routeKey,
          success: finalSuccess,
          inputTokens,
          outputTokens,
          costUsd,
          durationMs: Date.now() - runStartedAt,
          errorMessage: timedOut ? 'agent_run_timeout' : finalError,
          workflowRunId: loopStats?.workflowRunId ?? null,
          chainRootId: loopStats?.chainRootId ?? null,
          timedOut,
          fallbackUsed: false,
          fallbackReason: null,
          modelsTried: [loopStats?.modelKey || modelKey],
          quickstartBatch: null,
        });
      }
      if (tenantId && workspaceId && (inputTokens > 0 || outputTokens > 0)) {
        scheduleAgentsamUsageEventFromChat(env, ctx, {
          tenantId,
          workspaceId,
          userId,
          conversationId: sessionId ? String(sessionId) : null,
          resolvedProvider: providerForModelKey(loopStats?.modelKey || modelKey),
          modelKey: loopStats?.modelKey || modelKey,
          inputTokens,
          outputTokens,
          costUsd,
          streamFailed: !finalSuccess || timedOut,
          refId: chatAgentRunId ?? 'na',
          routingArmId,
          taskType: routingTaskType ?? 'ask',
          mode: 'ask',
        });
      }
      if (routingArmId) {
        await recordArmOutcome(env, ctx, routingArmId, finalSuccess && !timedOut, {
          taskType: routingTaskType ?? 'ask',
          mode: 'ask',
          modelKey: loopStats?.modelKey ?? modelKey,
          workspaceId,
        });
      }
      await writer.close().catch(() => {});
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export async function agentChatSseHandler(env, request, ctx, opts = {}) {
  const { ingestBypass, identity } = opts;
  const contentType = request.headers.get('content-type') || '';
  let body = {};

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    body = Object.fromEntries(formData.entries());
    const files = formData.getAll('files');
    const images = formData.getAll('images');
    if (files.length) body.files = files;
    if (images.length) body.images = images;
  } else {
    body = await request.json().catch(() => ({}));
  }

  /** @type {{ user_id: string, tenant_id: string, workspace_id: string, session_id?: string|null }} */
  let session;
  if (ingestBypass) {
    const tid = body.tenantId ?? body.tenant_id;
    const wid = body.workspaceId ?? body.workspace_id;
    const uid = body.userId ?? body.user_id;
    if (!tid || !wid || !uid) {
      return jsonResponse({ error: 'ingest requires tenantId, workspaceId, userId' }, 400);
    }
    session = {
      user_id: uid,
      tenant_id: tid,
      workspace_id: wid,
      session_id: body.sessionId ?? body.session_id ?? null,
    };
  } else {
    if (!identity) return jsonResponse({ error: 'unauthenticated' }, 401);
    if (!identity.workspaceId) {
      return jsonResponse({ error: 'WORKSPACE_CONTEXT_MISSING', redirect: '/onboarding' }, 400);
    }
    session = {
      user_id: identity.userId,
      tenant_id: identity.tenantId,
      workspace_id: identity.workspaceId,
      session_id: body.sessionId ?? body.session_id ?? null,
    };
  }

  let message = (body.message || '').trim();
  if (!message) return jsonResponse({ error: 'message required' }, 400);

  const quickstartBatch =
    body?.quickstart_batch != null && String(body.quickstart_batch).trim() !== ''
      ? String(body.quickstart_batch).trim()
      : body?.quickstartBatch != null && String(body.quickstartBatch).trim() !== ''
        ? String(body.quickstartBatch).trim()
        : '';

  // Legacy request-shape compatibility:
  // - `agent_mode` / `runtime_intent_mode` were older client fields.
  // - Runtime spine dispatch does NOT use these fields; it dispatches only by the compiled RuntimeProfile.
  const runtimeMode = normalizeAgentRuntimeMode(
    body.mode ?? body.agent_mode ?? body.runtime_intent_mode ?? body.execution_mode,
  );

  const headerWorkspaceId = request.headers.get('x-iam-workspace-id');
  const resolvedWorkspaceId =
    (headerWorkspaceId != null && String(headerWorkspaceId).trim() !== ''
      ? String(headerWorkspaceId).trim()
      : null) ||
    (session?.workspace_id != null && String(session.workspace_id).trim() !== ''
      ? String(session.workspace_id).trim()
      : null) ||
    (body.workspace_id != null && String(body.workspace_id).trim() !== ''
      ? String(body.workspace_id).trim()
      : null);

  let skipCommandResolution = false;
  try {
    const bcRaw = body.browserContext;
    const bc =
      typeof bcRaw === 'string' && bcRaw.trim()
        ? JSON.parse(bcRaw)
        : bcRaw && typeof bcRaw === 'object'
          ? bcRaw
          : null;
    if (bc?.selected_element && typeof bc.selected_element === 'object') skipCommandResolution = true;
  } catch {
    /* ignore */
  }

  const cmdResult = skipCommandResolution
    ? { resolved: false, blocked: false, blockReason: null, requiresConfirmation: false }
    : await resolveAgentCommand(env, {
    message: body.message,
    userId: session?.user_id,
    workspaceId: resolvedWorkspaceId,
    tenantId: session?.tenant_id ?? null,
    mode: runtimeMode,
  });

  if (cmdResult.resolved) {
    if (cmdResult.blocked) {
      return jsonResponse(
        {
          error: cmdResult.blockReason,
          command: cmdResult.mappedCommand,
        },
        403,
      );
    }
    if (cmdResult.requiresConfirmation) {
      return jsonResponse(
        {
          requires_confirmation: true,
          command: cmdResult.mappedCommand,
          risk_level: cmdResult.riskLevel,
          message: 'Confirm execution of: ' + cmdResult.mappedCommand,
        },
        202,
      );
    }
    if (cmdResult.command?.id && env?.DB) {
      env.DB.prepare(
        `UPDATE agentsam_commands
         SET use_count = use_count + 1, last_used_at = datetime('now')
         WHERE id = ?`,
      )
        .bind(cmdResult.command.id)
        .run()
        .catch(() => {});
    }
    body.message = cmdResult.mappedCommand;
    body._resolved_command_id = cmdResult.command?.id || null;
    body._resolved_command_slug = cmdResult.command?.slug || null;
  }

  message = (body.message || '').trim();

  const sessionId = body.conversationId || body.session_id || body.sessionId || null;
  const requestedMode = runtimeMode;

  // Single auth pass: handleAgentApi already resolved identity from edge JWT / session.
  const tenantId =
    session?.tenant_id != null && String(session.tenant_id).trim() !== ''
      ? String(session.tenant_id).trim()
      : identity?.tenantId != null && String(identity.tenantId).trim() !== ''
        ? String(identity.tenantId).trim()
        : null;
  const userId =
    session?.user_id ||
    (ingestBypass ? null : identity?.userId) ||
    null;
  let workspaceId =
    String(resolvedWorkspaceId || '').trim() ||
    String(session?.workspace_id || '').trim() ||
    String(body.workspace_id || '').trim() ||
    (identity?.workspaceId != null && String(identity.workspaceId).trim() !== ''
      ? String(identity.workspaceId).trim()
      : '') ||
    '';
  if (!workspaceId) return jsonResponse({ error: 'WORKSPACE_CONTEXT_MISSING' }, 400);
  if (!userId) return jsonResponse({ error: 'UNAUTHENTICATED_USER' }, 401);

  const chatAuthUser =
    ingestBypass || !identity
      ? { id: userId, tenant_id: tenantId, email: null }
      : {
          id: identity.userId,
          tenant_id: tenantId,
          email: identity.email ?? null,
          name: identity.name ?? null,
          role: identity.isSuperadmin ? 'superadmin' : undefined,
          is_superadmin: identity.isSuperadmin ? 1 : 0,
          person_uuid: identity.personUuid ?? null,
        };

  scheduleChatSessionTitleInsert(env, ctx, {
    conversationId: sessionId,
    tenantId,
    userId,
    workspaceId,
    message,
    body,
  });

  /** @type {{ turnId: string, assistantMessageId: string }|null} */
  let chatTurnMeta = null;

  return startAgentChatEarlySse(
    async ({ emit, pipeResponse, streamLifecycle, bindTurnOutbox }) => {
    const heartbeat = setInterval(() => {
      void emit('status', { phase: 'preflight', heartbeat: true });
    }, 12000);
    const stopHeartbeat = () => clearInterval(heartbeat);

    if (sessionId) {
      try {
        const { beginChatTurn, markChatTurnStatus } = await import('../core/agentsam-chat-sessions.js');
        chatTurnMeta = await beginChatTurn(env, sessionId, {
          model_key: body.model_key ?? body.model ?? null,
          timeoutMs: 4000,
        });
        if (chatTurnMeta) {
          streamLifecycle.setTurnMeta(chatTurnMeta);
          bindTurnOutbox(chatTurnMeta.turnId);
          await emit('turn_meta', {
            turn_id: chatTurnMeta.turnId,
            conversation_id: sessionId,
            assistant_message_id: chatTurnMeta.assistantMessageId,
          });
          void markChatTurnStatus(env, sessionId, 'in_progress', null, {
            assistantMessageId: chatTurnMeta.assistantMessageId,
          });
        }
      } catch (e) {
        console.warn('[agent] beginChatTurn', e?.message ?? e);
      }
    }

    const { isSimpleAskMessage } = await import('../core/runtime-profile.js');
    const casualFastPath = isSimpleAskMessage(message);

    try {
    const chatIsSuperadmin = !!(identity?.isSuperadmin || chatAuthUser?.is_superadmin);
    if (chatTurnMeta) {
      streamLifecycle.setTurnMeta(chatTurnMeta);
    }
    if (!casualFastPath && !ingestBypass && !chatIsSuperadmin && tenantId) {
      try {
        const { assertTenantSpendPolicy } = await import('../core/tenant-spend-policy.js');
        const spendGate = await withD1Retry(() =>
          assertTenantSpendPolicy(env, {
            tenantId,
            userId,
            workspaceId,
            sessionId: sessionId ? String(sessionId) : null,
            isSuperadmin: false,
          }),
        );
        if (!spendGate.ok) {
          return jsonResponse(
            {
              error: spendGate.error || 'spend_policy_denied',
              message: spendGate.message || 'Spend policy blocked this request.',
              spent_usd: spendGate.spent_usd ?? null,
              cap_usd: spendGate.cap_usd ?? null,
              upgrade_url: '/dashboard/settings/integrations',
            },
            402,
          );
        }
      } catch (spendErr) {
        console.warn('[agent] spend_policy_gate', spendErr?.message ?? spendErr);
      }
    }

    let handoffResume = null;
    if (!casualFastPath && sessionId && env.DB) {
      try {
        handoffResume = await withD1Retry(() =>
          resolvePendingHandoffForSession(env, {
            sessionId: String(sessionId),
            workspaceId,
          }),
        );
        if (handoffResume?.fallbackModelKey) {
          body.model = handoffResume.fallbackModelKey;
          body.model_key = handoffResume.fallbackModelKey;
          body.handoff_resume = true;
          const primer = buildHandoffPrimingUserMessage(handoffResume);
          if (primer && !body._handoff_priming_applied) {
            body._handoff_priming_applied = true;
            const trimmedMsg = String(message || '').trim();
            if (!trimmedMsg || trimmedMsg.length < 24 || /^continue$/i.test(trimmedMsg)) {
              message = primer;
              body.message = primer;
            } else {
              message = `${primer}\n\n---\nUser follow-up:\n${trimmedMsg}`;
              body.message = message;
            }
          }
          await markHandoffAccepted(env, handoffResume.spawnId, {
            childRunId: handoffResume.childRunId,
          });
        }
      } catch (e) {
        console.warn('[agent-handoff] resume_pickup', e?.message ?? e);
      }
    }

    let activeFileEnvelope = null;
    try {
      const { parseActiveFileEnvelope } = await import('../core/active-file-envelope.js');
      activeFileEnvelope = parseActiveFileEnvelope(body);
      if (activeFileEnvelope) {
        if (!activeFileEnvelope.content) {
          const extracted = extractOpenFileContentFromMessage(message);
          if (extracted) activeFileEnvelope.content = extracted;
        }
        body.activeFileEnvelope = activeFileEnvelope;
      }
      const {
        parseProjectContextFromBody,
        resolveChatGithubRepoContext,
      } = await import('../core/user-app-runtime.js');
      const projectContext = parseProjectContextFromBody(body);
      if (projectContext) body.projectContext = projectContext;

      const githubRepoContext = await resolveChatGithubRepoContext(env, {
        body,
        projectContext,
        activeFileEnvelope,
        userId: userId != null ? String(userId) : null,
        tenantId: tenantId != null ? String(tenantId) : null,
        workspaceId: workspaceId != null ? String(workspaceId) : null,
        isSuperadmin:
          chatAuthUser?.isSuperadmin === true ||
          chatAuthUser?.is_superadmin === true ||
          String(chatAuthUser?.role || '')
            .trim()
            .toLowerCase() === 'superadmin',
      });
      if (githubRepoContext) body.selectedGithubRepoContext = githubRepoContext;
      if (activeFileEnvelope?.github_repo && userId && workspaceId && tenantId) {
        try {
          const { sanitizeGithubRepoContextForChat } = await import('../core/github-repo-scope.js');
          const safeEnv = await sanitizeGithubRepoContextForChat(env, {
            userId: String(userId),
            tenantId: String(tenantId),
            workspaceId: String(workspaceId),
            clientRepo: activeFileEnvelope.github_repo,
          });
          if (!safeEnv) {
            delete activeFileEnvelope.github_repo;
            delete activeFileEnvelope.github_path;
            body.activeFileEnvelope = activeFileEnvelope;
          }
        } catch (_) {
          /* ignore */
        }
      }
      const localBufferOpen = activeFileIsLocalWorkspaceBuffer(activeFileEnvelope);
      if (githubRepoContext && !localBufferOpen) {
        const projectBranch =
          projectContext?.branch != null && String(projectContext.branch).trim()
            ? String(projectContext.branch).trim()
            : 'main';
        const projectPath =
          projectContext?.active_file != null ? String(projectContext.active_file).trim() : '';
        if (activeFileEnvelope) {
          if (!activeFileEnvelope.github_repo) activeFileEnvelope.github_repo = githubRepoContext;
          if (!activeFileEnvelope.github_branch) activeFileEnvelope.github_branch = projectBranch;
          if (projectPath && !activeFileEnvelope.github_path) activeFileEnvelope.github_path = projectPath;
          body.activeFileEnvelope = activeFileEnvelope;
        } else {
          activeFileEnvelope = parseActiveFileEnvelope({
            active_file_source: 'github',
            active_file_github_repo: githubRepoContext,
            active_file_github_branch: projectBranch,
            ...(projectPath ? { active_file_github_path: projectPath } : {}),
          });
          if (activeFileEnvelope) body.activeFileEnvelope = activeFileEnvelope;
        }
      }
      const {
        parseContextEnvelope,
        mergeContextEnvelopeIntoActiveFile,
      } = await import('../core/context-envelope.js');
      const contextEnvelope = parseContextEnvelope(body);
      if (contextEnvelope) {
        body.contextEnvelope = contextEnvelope;
        activeFileEnvelope = mergeContextEnvelopeIntoActiveFile(activeFileEnvelope, contextEnvelope, {
          parseActiveFileEnvelope,
          activeFileIsLocalWorkspaceBuffer,
        });
        if (activeFileEnvelope) body.activeFileEnvelope = activeFileEnvelope;
      }
    } catch (e) {
      console.warn('[agent] active_file_envelope_parse', e?.message ?? e);
    }

    let subagentProfileRow = null;
    if (!casualFastPath) {
    try {
      subagentProfileRow = await withD1Retry(() =>
        resolveSubagentProfileForChat(env.DB, {
          userId: String(userId),
          workspaceId,
          tenantId,
          profileId: body.subagent_profile_id ?? body.subagentProfileId,
          slug: body.subagent_slug ?? body.subagentSlug,
        }),
      );
      if (subagentProfileRow) {
        body.subagent_profile_id = subagentProfileRow.id;
        body.subagent_slug = subagentProfileRow.slug;
        body.subagent = true;
        applySubagentDefaultModelToBody(body, subagentProfileRow, { useRoutingArms: true });
      } else if (requestedMode === 'ask') {
        subagentProfileRow = await withD1Retry(() =>
          resolveSubagentProfileForChat(env.DB, {
            userId: String(userId),
            workspaceId,
            tenantId,
            profileId: 'codex_builtin_default',
            slug: 'codex-default',
          }),
        );
        if (subagentProfileRow) {
          body.subagent_profile_id = subagentProfileRow.id;
          body.subagent_slug = subagentProfileRow.slug;
          body.subagent = true;
        }
      }
    } catch (e) {
      console.warn('[agent] subagent_profile_resolve', e?.message ?? e);
    }
    }

    const grRoute = casualFastPath
      ? { blocked: false }
      : await withD1Retry(() =>
      evaluateGuardrails(env, ctx, {
        applies_to: 'route',
        tenant_id: tenantId,
        workspace_id: workspaceId,
        user_id: userId,
        session_id: sessionId,
        conversation_id: sessionId,
        request_id: sessionId,
        route_path: '/api/agent/chat',
        project_id:
          body.project_id != null && String(body.project_id).trim() !== ''
            ? String(body.project_id).trim()
            : null,
      }),
    );
    if (grRoute.blocked) {
      return jsonResponse(
        {
          error: grRoute.decision?.reason || 'guardrail_blocked',
          guardrail: grRoute.decision?.guardrail_key,
        },
        403,
      );
    }

    let browserContextPayload = null;
    try {
      const bc = body.browserContext ?? body.browser_context;
      if (typeof bc === 'string' && bc.trim()) browserContextPayload = parseJsonSafe(bc.trim(), null);
      else if (bc && typeof bc === 'object') browserContextPayload = bc;
    } catch (_) {
      browserContextPayload = null;
    }
    try {
      const { resolveDesignStudioChatOverrides } = await import('../core/design-studio-context.js');
      const dsRouteOverrides = resolveDesignStudioChatOverrides(browserContextPayload, body, message);
      if (dsRouteOverrides?.route_key) body.route_key = dsRouteOverrides.route_key;
      if (dsRouteOverrides?.task_type) body.task_type = dsRouteOverrides.task_type;
      if (dsRouteOverrides?.subagent_slug && !body.subagent_slug && !body.subagentSlug) {
        body.subagent_slug = dsRouteOverrides.subagent_slug;
      }
    } catch (_) {
      /* ignore */
    }
    const cmsRaw = body.cms_context ?? body.cmsContext;
    if (cmsRaw && typeof cmsRaw === 'object') {
      browserContextPayload = browserContextPayload && typeof browserContextPayload === 'object'
        ? { ...browserContextPayload, cms_context: cmsRaw }
        : { cms_context: cmsRaw };
    }

    const [userPolicy, surfacePreflight] = casualFastPath
      ? [null, null]
      : await Promise.all([
          withD1Retry(() => loadAgentSamUserPolicy(env, userId, workspaceId)).catch(() => null),
          resolveSurfaceWorkflowPreflightExecution(env, message, requestedMode, browserContextPayload),
        ]);

    if (surfacePreflight?.kind === 'execute') {
      const actor = chatAuthUser || { id: userId, tenant_id: tenantId, email: null };
      return executeWorkflowAndStream(env, surfacePreflight.workflowKey, message, actor, workspaceId, ctx, {
        runtimeMode: requestedMode,
        browserContext: browserContextPayload,
        ptyExecUrl: env.PTY_EXEC_URL,
      });
    }
    if (surfacePreflight?.kind === 'missing_workflow') {
      if (shouldBypassSurfaceWorkflowPreflight(message, requestedMode)) {
        logSurfaceWorkflowPreflightBypass(
          requestedMode,
          surfacePreflight.surface,
          surfacePreflight.reason,
          message,
        );
      } else if (surfacePreflight.surface === 'browser') {
        return streamBrowserPreflightNoWorkflow(message, browserContextPayload);
      } else {
        return streamPreflightSurfaceWorkflowMissing(surfacePreflight.surface, message);
      }
    }

    kickoffModelTierMigration(env, ctx);

    const casualChatTurn = casualFastPath && !activeFileEnvelope;

    const agentChatResolvedContext = casualChatTurn
      ? null
      : await buildAgentChatResolvedContext(env, {
          request,
          userId,
          tenantId,
          workspaceId,
          workSessionId: body.work_session_id ?? body.workSessionId ?? session?.work_session_id ?? null,
          sessionId,
          userPolicy,
        });

    const { executeAgentChatSpine } = await import('./agent-chat-spine.js');
    const { resolveRuntimeLane } = await import('../core/user-app-runtime.js');
    return executeAgentChatSpine(env, request, ctx, {
      body,
      message,
      requestedMode,
      tenantId,
      userId,
      workspaceId,
      sessionId,
      authUser: chatAuthUser,
      subagentProfileRow,
      activeFileEnvelope,
      browserContextPayload,
      handoffResume,
      userPolicy,
      agentChatResolvedContext,
      quickstartBatch,
      streamLifecycle,
      chatTurnMeta,
      projectContext: body.projectContext ?? null,
      runtimeLane: resolveRuntimeLane(body),
    });
    } finally {
      stopHeartbeat();
    }
  }, {
    conversationId: sessionId,
    userId,
    workspaceId,
    env,
    waitUntil: (promise) => ctx.waitUntil(promise),
    onStreamClose: async (result) => {
      if (!sessionId) return;
      const { markChatTurnStatus } = await import('../core/agentsam-chat-sessions.js');
      const turnOpts = {
        assistantMessageId:
          result?.assistantMessageId != null ? String(result.assistantMessageId) : null,
      };
      if (result?.saw_error) {
        await markChatTurnStatus(env, sessionId, 'failed', String(result.reason || 'stream_error'), turnOpts);
      } else if (!result?.saw_token && !result?.saw_done) {
        await markChatTurnStatus(
          env,
          sessionId,
          'interrupted',
          'close_without_token_or_done',
          turnOpts,
        );
      } else if (result?.saw_done && !result?.saw_token) {
        await markChatTurnStatus(env, sessionId, 'done_no_token', 'stream_done_no_text', turnOpts);
      } else if (result?.saw_token && !result?.saw_done) {
        await markChatTurnStatus(
          env,
          sessionId,
          'interrupted',
          'stream_closed_without_done',
          turnOpts,
        );
      } else if (result?.saw_token && result?.saw_done) {
        await markChatTurnStatus(env, sessionId, 'completed', null, turnOpts);
      }
      // Terminal status safety net — run via waitUntil immediately (no artificial delay;
      // a 2.5s sleep here extended isolate lifetime and tipped long turns into CPU cancels).
      try {
        const { finalizeRunningAgentRunsForConversation } = await import(
          '../core/agent-run-routing.js'
        );
        const reason =
          result?.saw_error
            ? 'sse_close_error'
            : !result?.saw_done
              ? 'sse_closed_without_done'
              : 'sse_close_running_sweep';
        const sweep = () =>
          finalizeRunningAgentRunsForConversation(env, {
            conversationId: sessionId,
            userId,
            reason,
          });
        if (ctx?.waitUntil) {
          ctx.waitUntil(
            Promise.resolve()
              .then(sweep)
              .catch((e) => console.warn('[agent] agent_run sse close finalize', e?.message ?? e)),
          );
        } else {
          await sweep();
        }
      } catch (e) {
        console.warn('[agent] agent_run sse close finalize', e?.message ?? e);
      }
    },
  });
}

function isAgentApiPublic(path, method) {
  if (path === '/api/agent/health' && method === 'GET') return true;
  if (path === '/api/agent/modes' && method === 'GET') return true;
  if (path === '/api/agent/commands' && method === 'GET') return true;
  if (path === '/api/agent/conversations/search' && method === 'GET') return true;
  if (path === '/api/agent/telemetry') return true;
  if (path === '/api/agent/cicd') return true;
  if (path === '/api/agent/mcp') return true;
  // Webhook signature or bridge/session auth enforced inside handleAgentMemorySync / sync handler
  if (path === '/api/agent/memory/sync' && method === 'POST') return true;
  return false;
}

/** Valid `profile` values for POST /api/agent/tool-smoke (query or JSON body). Endpoint-local only. */
const TOOL_SMOKE_VALID_PROFILES = new Set([
  'default_safe',
  'read_only',
  'approved_mutation',
  'local_dev_dangerous',
]);

/** Explicit read/catalog/inspect tool names allowed under `read_only` smoke profile (conservative). */
const READ_ONLY_SMOKE_TOOL_NAMES = new Set([
  'd1_query',
  'workspace_read_file',
  'workspace_search',
  'context_search',
  'knowledge_search',
  'platform_info',
  'r2_read',
  'github_file',
  'health_check',
]);

function isProductionLikeEnvironment(env) {
  return String(env?.ENVIRONMENT || '').toLowerCase() === 'production';
}

function toolSmokeDefaultSafeGate(toolName) {
  const t = String(toolName || '').trim().toLowerCase();
  if (TOOL_SMOKE_DEFAULT_SAFE_DENYLIST.has(t)) {
    return { blocked: true, reason: 'blocked_by_default_safe_smoke_profile' };
  }
  return { blocked: false };
}

function toolSmokeReadOnlyGate(toolName) {
  const t = String(toolName || '').trim().toLowerCase();
  if (READ_ONLY_SMOKE_TOOL_NAMES.has(t)) return { blocked: false };
  if (TERM_WRITE_TOOLS.has(t)) return { blocked: true, reason: 'blocked_by_read_only_smoke_profile' };
  if (TOOL_SMOKE_DEFAULT_SAFE_DENYLIST.has(t)) {
    return { blocked: true, reason: 'blocked_by_read_only_smoke_profile' };
  }
  if (WRITE_LIKE_PREFIXES.some((p) => t.startsWith(p))) {
    if (t.endsWith('_query') || t.includes('read')) return { blocked: false };
    return { blocked: true, reason: 'blocked_by_read_only_smoke_profile' };
  }
  if (/(write|delete|deploy|broadcast|send|spawn)/i.test(t) && !t.endsWith('_query')) {
    return { blocked: true, reason: 'blocked_by_read_only_smoke_profile' };
  }
  return { blocked: true, reason: 'blocked_by_read_only_smoke_profile' };
}

/**
 * @returns {Promise<
 *   | { kind: 'execute'; approvalId?: string | null }
 *   | { kind: 'skip'; reason: string }
 *   | { kind: 'error'; status: number; payload: Record<string, unknown> }
 * >}
 */
async function evaluateToolSmokeAccess(env, profileRaw, toolName, body, identity) {
  const p = String(profileRaw || 'default_safe').trim().toLowerCase() || 'default_safe';
  if (!TOOL_SMOKE_VALID_PROFILES.has(p)) {
    return {
      kind: 'error',
      status: 400,
      payload: {
        error: 'invalid_smoke_profile',
        profile: p,
        allowed_profiles: [...TOOL_SMOKE_VALID_PROFILES],
      },
    };
  }

  if (p === 'local_dev_dangerous') {
    if (isProductionLikeEnvironment(env)) {
      return {
        kind: 'error',
        status: 403,
        payload: { error: 'dangerous_smoke_profile_disabled_in_production', profile: p },
      };
    }
    if (String(env?.IAM_ENABLE_DANGEROUS_TOOL_SMOKE || '').toLowerCase() !== 'true') {
      return {
        kind: 'error',
        status: 403,
        payload: {
          error: 'dangerous_smoke_profile_not_enabled',
          profile: p,
          hint: 'Set IAM_ENABLE_DANGEROUS_TOOL_SMOKE=true on non-production workers only',
        },
      };
    }
    return { kind: 'execute' };
  }

  if (p === 'default_safe') {
    const g = toolSmokeDefaultSafeGate(toolName);
    if (g.blocked) return { kind: 'skip', reason: g.reason };
    return { kind: 'execute' };
  }

  if (p === 'read_only') {
    const g = toolSmokeReadOnlyGate(toolName);
    if (g.blocked) return { kind: 'skip', reason: g.reason };
    return { kind: 'execute' };
  }

  if (p === 'approved_mutation') {
    const approvalRaw = body?.approval_id ?? body?.approvalId ?? null;
    const approvalId = approvalRaw != null ? String(approvalRaw).trim() : '';
    if (!approvalId) {
      return {
        kind: 'error',
        status: 403,
        payload: {
          error: 'pending_approval',
          reason: 'approval_id_required_for_approved_mutation_profile',
          profile: p,
        },
      };
    }
    if (!env?.DB || !identity?.userId || !identity?.workspaceId || !identity?.tenantId) {
      return {
        kind: 'error',
        status: 403,
        payload: { error: 'blocked_by_policy', reason: 'auth_or_workspace_required', profile: p },
      };
    }
    const uid = String(identity.userId).trim();
    const ws = String(identity.workspaceId).trim();
    const tid = String(identity.tenantId).trim();
    let row = null;
    try {
      row = await env.DB.prepare(
        `SELECT id, status, tool_name, expires_at FROM agentsam_approval_queue
         WHERE id = ? AND user_id = ? AND workspace_id = ? AND tenant_id = ?
         LIMIT 1`,
      )
        .bind(approvalId, uid, ws, tid)
        .first();
    } catch {
      row = null;
    }
    if (!row?.id) {
      return {
        kind: 'error',
        status: 403,
        payload: { error: 'blocked_by_policy', reason: 'approval_not_found', profile: p },
      };
    }
    const exp = Number(row.expires_at) || 0;
    if (exp > 0 && exp < Math.floor(Date.now() / 1000)) {
      return {
        kind: 'error',
        status: 403,
        payload: { error: 'blocked_by_policy', reason: 'approval_expired', profile: p },
      };
    }
    const st = String(row.status || '').toLowerCase();
    if (st !== 'approved') {
      return {
        kind: 'error',
        status: 403,
        payload: { error: 'pending_approval', reason: `approval_status_${st}`, profile: p },
      };
    }
    const approvedTool = String(row.tool_name || '').trim().toLowerCase();
    if (approvedTool !== toolName) {
      return {
        kind: 'error',
        status: 403,
        payload: {
          error: 'blocked_by_policy',
          reason: 'approval_tool_mismatch',
          profile: p,
          approval_tool: approvedTool,
          requested_tool: toolName,
        },
      };
    }
    const catalogRow = await loadAgentsamToolRow(env, toolName);
    if (!catalogRow?.id) {
      return {
        kind: 'error',
        status: 403,
        payload: { error: 'blocked_by_policy', reason: 'tool_not_in_registry', profile: p },
      };
    }
    const requiresApproval = Number(catalogRow.requires_approval || 0) === 1;
    if (!requiresApproval) {
      return {
        kind: 'error',
        status: 403,
        payload: {
          error: 'blocked_by_policy',
          reason: 'tool_not_approval_gated_in_registry',
          profile: p,
        },
      };
    }
    return { kind: 'execute', approvalId };
  }

  return {
    kind: 'error',
    status: 500,
    payload: { error: 'smoke_profile_internal', profile: p },
  };
}

// ─── Main Dispatcher ──────────────────────────────────────────────────────────

/**
 * @param {Request} request
 * @param {URL} url
 * @param {any} env
 * @param {any} ctx
 * @param {{ authCtx?: import('../core/auth.js').AuthContext | null, authUser?: object | null } | object | null} [routeAuth]
 */
export async function handleAgentApi(request, url, env, ctx, routeAuth = null) {
  const path   = url.pathname.toLowerCase().replace(/\/$/, '') || '/';
  const method = request.method.toUpperCase();
  const ra = routeAuth && typeof routeAuth === 'object' && 'authCtx' in routeAuth ? routeAuth : { authUser: routeAuth, authCtx: null };

  const identity = await resolveIdentity(env, request);
  const ingestChatBypass =
    path === '/api/agent/chat' &&
    method === 'POST' &&
    isIngestSecretAuthorized(request, env);
  if (!isAgentApiPublic(path, method) && !ingestChatBypass) {
    if (!identity) return jsonResponse({ error: 'unauthenticated' }, 401);
    if (!identity.workspaceId) {
      return jsonResponse({ error: 'no_workspace', redirect: '/onboarding' }, 403);
    }
  }

  // GET/PUT /api/agent/scene — agent home background scene config
  if (path === '/api/agent/scene') {
    const { handleAgentHomeSceneApi } = await import('./agent-home-scene.js');
    const sceneRes = await handleAgentHomeSceneApi(request, env, ra);
    if (sceneRes) return sceneRes;
  }

  // GET /api/agent/quickstart/templates — platform-global subagent gallery (D1-driven)
  if (path === '/api/agent/quickstart/templates' && method === 'GET') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const { templates, source } = await listPlatformQuickstartTemplates(env);
    return jsonResponse({
      ok: true,
      source,
      count: templates.length,
      templates,
    });
  }

  // POST /api/agent/catalog-invoke — same dispatch path as /api/mcp/catalog-invoke
  if (path === '/api/agent/catalog-invoke' && method === 'POST') {
    const { handleCatalogInvokeApi } = await import('../core/catalog-invoke-handler.js');
    return handleCatalogInvokeApi(request, env, ctx);
  }

  if (path === '/api/agent/subagent-profiles' && method === 'GET') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const actorCtx = await resolveIamActorContext(request, env).catch(() => null);
    const reqCtx = await resolveRequestContext(request, env);
    if (reqCtx.error || !reqCtx.workspaceId) {
      return jsonResponse({ error: 'no_workspace', redirect: '/onboarding' }, 403);
    }
    const effectiveWs = String(reqCtx.workspaceId).trim();
    const uid = String(authUser.id || '').trim();
    let tid =
      actorCtx?.tenantId != null && String(actorCtx.tenantId).trim() !== ''
        ? String(actorCtx.tenantId).trim()
        : authUser.tenant_id != null && String(authUser.tenant_id).trim() !== ''
          ? String(authUser.tenant_id).trim()
          : '';
    if (!tid) tid = await fetchAuthUserTenantId(env, uid);
    const personUuid =
      actorCtx?.personUuid != null && String(actorCtx.personUuid).trim() !== ''
        ? String(actorCtx.personUuid).trim()
        : authUser.person_uuid != null && String(authUser.person_uuid).trim() !== ''
          ? String(authUser.person_uuid).trim()
          : '';
    const scopedSql = `
      SELECT id, slug, display_name,
             COALESCE(description, '') AS description,
             COALESCE(icon, '') AS icon,
             COALESCE(agent_type, 'custom') AS agent_type,
             default_model_id, is_active,
             COALESCE(sort_order, 0) AS sort_order,
             COALESCE(sandbox_mode, '') AS sandbox_mode,
             mcp_servers_json, modes_json, tool_invocation_style,
             instructions_markdown, allowed_tool_globs, user_id, workspace_id,
             tenant_id, person_uuid
        FROM agentsam_subagent_profile
       WHERE is_active = 1
         AND (
              (user_id = ? AND (workspace_id = ? OR workspace_id = ''))
           OR (tenant_id IS NOT NULL AND tenant_id != '' AND tenant_id = ? AND (workspace_id = ? OR workspace_id = ''))
           OR (person_uuid IS NOT NULL AND person_uuid != '' AND person_uuid = ?)
         )
       ORDER BY sort_order ASC`;

    let rows = [];
    try {
      const q = await env.DB.prepare(scopedSql)
        .bind(uid, effectiveWs, tid, effectiveWs, personUuid)
        .all();
      rows = q.results || [];
    } catch (e) {
      console.warn('[subagent-profiles] scoped query failed, falling back', e?.message ?? e);
      const fb = await env.DB.prepare(
        `SELECT * FROM agentsam_subagent_profile
         WHERE is_active = 1 AND user_id = ? AND (workspace_id = ? OR workspace_id = '')
         ORDER BY COALESCE(sort_order, 9999) ASC`,
      )
        .bind(uid, effectiveWs)
        .all()
        .catch(() => ({ results: [] }));
      rows = fb.results || [];
    }

    try {
      const q2 = await env.DB.prepare(
        `SELECT id, slug, display_name,
                COALESCE(description, '') AS description,
                COALESCE(icon, '') AS icon,
                COALESCE(agent_type, 'custom') AS agent_type,
                default_model_id, is_active,
                COALESCE(sort_order, 0) AS sort_order,
                COALESCE(sandbox_mode, '') AS sandbox_mode,
                mcp_servers_json, modes_json, tool_invocation_style,
                instructions_markdown, allowed_tool_globs, user_id, workspace_id,
                tenant_id, person_uuid, COALESCE(is_platform_global, 0) AS is_platform_global
           FROM agentsam_subagent_profile
          WHERE is_active = 1 AND COALESCE(is_platform_global, 0) = 1
            AND (tenant_id IS NULL OR tenant_id = '' OR tenant_id = ?)
            AND (? = 1)`,
      )
        .bind(tid, authUserIsSuperadmin(authUser) ? 1 : 0)
        .all();
      const extra = q2.results || [];
      const seen = new Set(rows.map((r) => r.id));
      for (const r of extra) {
        if (r?.id && !seen.has(r.id)) {
          seen.add(r.id);
          rows.push(r);
        }
      }
    } catch (_) {
      /* is_platform_global not migrated yet */
    }
    return jsonResponse(rows);
  }

  // GET /api/agent/tools — combined tool exposure (builtin + registered MCP)
  if (path === '/api/agent/tools' && method === 'GET') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);

    const actorCtx = await resolveIamActorContext(request, env).catch(() => null);

    const tools = [];

    try {
      const mcpRows = await selectAgentsamMcpToolsList(
        env.DB,
        {
          userId: actorCtx?.userId,
          tenantId: actorCtx?.tenantId,
          workspaceId: actorCtx?.workspaceId,
          personUuid: actorCtx?.personUuid,
        },
        500,
      );
      for (const r of mcpRows || []) {
        if (!r) continue;
        const name = String(r.tool_name || '').trim();
        if (!name) continue;
        tools.push({
          name,
          description: String(r.description || ''),
          category: String(r.tool_category || 'mcp'),
          handler_type: 'mcp',
          is_active: 1,
          risk_level: Number(r.requires_approval || 0) === 1 ? 'high' : 'medium',
        });
      }
    } catch (_) {}

    // De-dupe by name (prefer builtin if collision)
    const seen = new Set();
    const deduped = [];
    for (const t of tools) {
      const key = String(t.name || '').toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      deduped.push(t);
    }

    return jsonResponse({ tools: deduped, total: deduped.length });
  }

  // POST /api/agent/tool-smoke — builtin dispatcher without LLM (harness only; profiles in evaluateToolSmokeAccess).
  // Runtime Agent Sam must NOT use TOOL_SMOKE_DEFAULT_SAFE_DENYLIST — chat uses route + catalog + approval policy.
  if (path === '/api/agent/tool-smoke') {
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          Allow: 'POST, OPTIONS',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Terminal-Secret',
        },
      });
    }
    if (method !== 'POST') {
      return jsonResponse(
        {
          error: 'method_not_allowed',
          path,
          allowed: 'POST',
          hint: 'POST JSON { "tool": "d1_query", "args": {...}, "profile": "default_safe" } or ?profile=read_only',
        },
        405,
      );
    }

    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!identity?.workspaceId) {
      return jsonResponse({ error: 'no_workspace', redirect: '/onboarding' }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const profileRaw = url.searchParams.get('profile') ?? body.profile ?? 'default_safe';
    const profileNorm = String(profileRaw || 'default_safe').trim().toLowerCase() || 'default_safe';

    const rawTool = body.tool ?? body.tool_name ?? body.name;
    const toolRaw = String(rawTool || '').trim();
    if (!toolRaw) return jsonResponse({ error: 'tool required' }, 400);

    const toolName = normalizeToolName(toolRaw);

    const gate = await evaluateToolSmokeAccess(env, profileNorm, toolName, body, identity);
    if (gate.kind === 'error') {
      return jsonResponse({ ...gate.payload, tool: toolName, profile: profileNorm }, gate.status);
    }
    if (gate.kind === 'skip') {
      const skipPayload = {
        ok: true,
        skipped: true,
        tool: toolName,
        profile: profileNorm,
        reason: gate.reason,
        results: [],
      };
      if (body.dry_run === true) skipPayload.dry_run = true;
      if (toolRaw !== toolName) skipPayload.normalized_from = toolRaw;
      return jsonResponse(skipPayload);
    }

    if (body.dry_run === true) {
      const payload = {
        ok: true,
        tool: toolName,
        profile: profileNorm,
        dry_run: true,
        results: [],
      };
      if (toolRaw !== toolName) payload.normalized_from = toolRaw;
      return jsonResponse(payload);
    }

    const actorCtx = await resolveIamActorContext(request, env).catch(() => null);
    const sess = {
      user_id: identity.userId,
      workspace_id: identity.workspaceId,
      workspaceId: identity.workspaceId,
      tenant_id: identity.tenantId,
      session_id: body.session_id ?? identity.sessionId ?? null,
      person_uuid: actorCtx?.personUuid ?? identity.personUuid ?? null,
      is_superadmin: !!identity.isSuperadmin,
    };
    const args = body.args && typeof body.args === 'object' ? body.args : {};
    const params = {
      ...args,
      session: sess,
      session_id: sess.session_id,
      tenant_id: sess.tenant_id,
      user_id: sess.user_id,
      workspace_id: sess.workspace_id,
      person_uuid: sess.person_uuid,
      request,
    };

    const execT0 = Date.now();
    try {
      const catalogOut = await dispatchByToolCode(env, toolName, params, {
        tenantId: sess.tenant_id,
        userId: sess.user_id,
        workspaceId: sess.workspace_id,
        sessionId: sess.session_id,
      });
      const raw =
        catalogOut?.ok === false
          ? { error: catalogOut.error ?? 'dispatch_failed' }
          : catalogOut?.result ?? catalogOut;
      const execMs = Math.max(0, Date.now() - execT0);
      if (raw && typeof raw === 'object' && raw.error) {
        const errMsg = typeof raw.error === 'string' ? raw.error : JSON.stringify(raw.error);
        return jsonResponse({
          ok: false,
          tool: toolName,
          profile: profileNorm,
          error: errMsg,
          results: [],
        });
      }
      let results = [];
      if (Array.isArray(raw?.results)) {
        results = raw.results;
      } else if (raw != null && typeof raw === 'object') {
        results = [raw];
      } else if (raw != null) {
        results = [raw];
      }
      if (profileNorm === 'approved_mutation' && gate.approvalId && identity?.tenantId && identity?.workspaceId) {
        scheduleAgentsamToolCallLog(env, ctx, {
          tenantId: String(identity.tenantId).trim(),
          workspaceId: String(identity.workspaceId).trim(),
          sessionId: sess.session_id ?? null,
          toolName,
          status: 'success',
          durationMs: execMs,
          userId: identity.userId,
          approval_id: gate.approvalId,
          route_key: 'tool_smoke_approved_mutation',
          policy_decision_json: JSON.stringify({
            profile: 'approved_mutation',
            smoke_harness: true,
            tool: toolName,
          }),
        });
      }
      return jsonResponse({ ok: true, tool: toolName, profile: profileNorm, results });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return jsonResponse({ ok: false, tool: toolName, profile: profileNorm, error: msg, results: [] }, 500);
    }
  }

  // DELETE /api/agent/todo/:id — hard-delete task (scoped to tenant/workspace)
  const todoIdDeleteMatch = path.match(/^\/api\/agent\/todo\/([^/]+)$/);
  if (todoIdDeleteMatch && method === 'DELETE') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const scope = await resolveAgentDataScope(env, authUser, request, {});
    if (!scope.tenantId || !scope.workspaceId) return jsonResponse({ error: 'Tenant/workspace required' }, 403);
    const todoId = String(todoIdDeleteMatch[1]).trim();
    const existing = await env.DB.prepare(
      `SELECT id, title FROM agentsam_todo WHERE id = ? AND tenant_id = ? AND workspace_id = ? LIMIT 1`,
    )
      .bind(todoId, scope.tenantId, scope.workspaceId)
      .first();
    if (!existing) return jsonResponse({ error: 'Not found' }, 404);
    await env.DB.prepare(
      `DELETE FROM agentsam_todo WHERE id = ? AND tenant_id = ? AND workspace_id = ?`,
    )
      .bind(todoId, scope.tenantId, scope.workspaceId)
      .run();
    return jsonResponse({ ok: true, deleted: true, id: todoId }, 200);
  }

  // PATCH /api/agent/todo/:id — update task fields
  const todoIdPatchMatch = path.match(/^\/api\/agent\/todo\/([^/]+)$/);
  if (todoIdPatchMatch && method === 'PATCH') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const scope = await resolveAgentDataScope(env, authUser, request, {});
    if (!scope.tenantId || !scope.workspaceId) return jsonResponse({ error: 'Tenant/workspace required' }, 403);
    const todoId = String(todoIdPatchMatch[1]).trim();
    const body = await request.json().catch(() => ({}));
    const existing = await env.DB.prepare(
      `SELECT * FROM agentsam_todo WHERE id = ? AND tenant_id = ? AND workspace_id = ? LIMIT 1`,
    )
      .bind(todoId, scope.tenantId, scope.workspaceId)
      .first();
    if (!existing) return jsonResponse({ error: 'Not found' }, 404);

    const userId = String(authUser.id || authUser.user_id || authUser.email || 'user').slice(0, 64);
    const { logTaskActivity, taskActivityChangesFromPatch } = await import('../core/task-activity-log.js');

    const fields = [];
    const binds = [];
    const set = (col, val) => {
      if (val !== undefined) {
        fields.push(`${col} = ?`);
        binds.push(val);
      }
    };

    set('title', body.title != null ? String(body.title).trim().slice(0, 500) : undefined);
    set('description', body.description != null ? String(body.description).slice(0, 4000) : undefined);
    set('notes', body.notes != null ? String(body.notes).slice(0, 4000) : undefined);
    set(
      'agent_instructions',
      body.agent_instructions != null ? String(body.agent_instructions).slice(0, 8000) : undefined,
    );
    set('due_date', body.due_date != null ? String(body.due_date).trim().slice(0, 40) : undefined);
    set('category', body.category != null ? String(body.category).trim().slice(0, 120) : undefined);
    set(
      'project_id',
      body.project_id != null ? String(body.project_id).trim().slice(0, 120) || null : undefined,
    );
    set(
      'project_key',
      body.project_key != null ? String(body.project_key).trim().slice(0, 120) || null : undefined,
    );
    set('status', body.status != null ? String(body.status).trim().slice(0, 40) : undefined);
    if (body.status === 'done') {
      set('execution_status', 'done');
      set('completed_at', new Date().toISOString().slice(0, 19).replace('T', ' '));
    } else if (body.status != null && body.status !== 'done') {
      set('execution_status', body.execution_status != null ? String(body.execution_status) : 'queued');
    }
    if (body.starred != null) {
      let tags = [];
      try {
        tags = JSON.parse(existing.tags || '[]');
        if (!Array.isArray(tags)) tags = [];
      } catch {
        tags = [];
      }
      tags = tags.filter((t) => t !== 'starred');
      if (body.starred) tags.push('starred');
      set('tags', JSON.stringify(tags));
    } else if (body.tags != null) {
      set('tags', typeof body.tags === 'string' ? body.tags : JSON.stringify(body.tags));
    }

    if (!fields.length) return jsonResponse({ error: 'No fields to update' }, 400);
    fields.push("updated_at = datetime('now')");
    binds.push(todoId, scope.tenantId, scope.workspaceId);
    await env.DB.prepare(
      `UPDATE agentsam_todo SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ? AND workspace_id = ?`,
    )
      .bind(...binds)
      .run();
    const todo = await env.DB.prepare(`SELECT * FROM agentsam_todo WHERE id = ?`).bind(todoId).first();

    const activityChanges = taskActivityChangesFromPatch(existing, body);
    if (activityChanges) {
      let action = 'updated';
      if (activityChanges.field === 'status') {
        if (body.status === 'done' || body.status === 'completed') action = 'completed';
        else if (body.status === 'in_progress') action = 'started';
        else action = 'updated';
      } else if (activityChanges.field === 'project_id') {
        action = 'project_link';
      }
      await logTaskActivity(env.DB, {
        taskId: todoId,
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        userId,
        action,
        changes: activityChanges,
      });
    }

    return jsonResponse({ ok: true, todo }, 200);
  }

  // POST /api/agent/todo — create task
  if (path === '/api/agent/todo' && method === 'POST') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const scope = await resolveAgentDataScope(env, authUser, request, {});
    if (!scope.tenantId || !scope.workspaceId) return jsonResponse({ error: 'Tenant/workspace required' }, 403);
    const body = await request.json().catch(() => ({}));
    const title = String(body.title || '').trim().slice(0, 500);
    if (!title) return jsonResponse({ error: 'title required' }, 400);
    const id = `todo_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const userId = String(authUser.id || authUser.user_id || authUser.email || 'user').slice(0, 64);
    const category = String(body.category || 'My Tasks').trim().slice(0, 120) || 'My Tasks';
    const projectId =
      body.project_id != null && String(body.project_id).trim()
        ? String(body.project_id).trim().slice(0, 120)
        : null;
    const projectKey =
      body.project_key != null && String(body.project_key).trim()
        ? String(body.project_key).trim().slice(0, 120)
        : projectId;
    let clientId =
      body.client_id != null && String(body.client_id).trim()
        ? String(body.client_id).trim().slice(0, 120)
        : null;
    if (!clientId && projectId) {
      try {
        const prow = await env.DB.prepare(`SELECT client_id FROM projects WHERE id = ? LIMIT 1`)
          .bind(projectId)
          .first();
        if (prow?.client_id) clientId = String(prow.client_id).trim();
      } catch {
        /* non-fatal */
      }
    }
    const agentInstructions =
      body.agent_instructions != null ? String(body.agent_instructions).slice(0, 8000) : null;
    const tags = body.starred ? JSON.stringify(['starred']) : JSON.stringify(body.tags || []);
    await env.DB.prepare(
      `INSERT INTO agentsam_todo (
        id, tenant_id, workspace_id, title, description, status, priority, category, tags,
        due_date, notes, agent_instructions, created_by, sort_order, task_type, execution_status,
        project_id, project_key, client_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'open', 'medium', ?, ?, ?, ?, ?, ?, 50, 'execute', 'queued', ?, ?, ?, datetime('now'), datetime('now'))`,
    )
      .bind(
        id,
        scope.tenantId,
        scope.workspaceId,
        title,
        body.description != null ? String(body.description).slice(0, 4000) : null,
        category,
        tags,
        body.due_date != null ? String(body.due_date).trim().slice(0, 40) : null,
        body.notes != null ? String(body.notes).slice(0, 4000) : null,
        agentInstructions,
        userId,
        projectId,
        projectKey,
        clientId,
      )
      .run();
    const todo = await env.DB.prepare(`SELECT * FROM agentsam_todo WHERE id = ?`).bind(id).first();
    const { logTaskActivity } = await import('../core/task-activity-log.js');
    await logTaskActivity(env.DB, {
      taskId: id,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      userId,
      action: 'created',
      changes: { title, project_id: projectId, category },
    });
    return jsonResponse({ ok: true, todo }, 201);
  }

  // GET /api/agent/todo — multi-tenant agentsam_todo
  if (path === '/api/agent/todo' && method === 'GET') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const scope = await resolveAgentDataScope(env, authUser, request, {});
    if (!scope.tenantId) return jsonResponse({ error: 'Tenant could not be resolved' }, 403);
    if (!scope.workspaceId) return jsonResponse({ todos: [] });
    const reqUrl = new URL(request.url);
    const projectId = reqUrl.searchParams.get('project_id')?.trim() || null;
    const clientId = reqUrl.searchParams.get('client_id')?.trim() || null;
    const clientWork = reqUrl.searchParams.get('client_work') === '1';
    const category = reqUrl.searchParams.get('category')?.trim() || null;
    const includeLegacy = reqUrl.searchParams.get('include_legacy') === '1';
    try {
      let queryWorkspaceId = scope.workspaceId;
      const projectKeys = new Set();
      if (projectId) {
        const prow = await env.DB.prepare(
          `SELECT id, workspace_id, worker_id FROM projects WHERE id = ? LIMIT 1`,
        )
          .bind(projectId)
          .first();
        if (prow?.workspace_id) queryWorkspaceId = String(prow.workspace_id).trim();
        projectKeys.add(projectId);
        if (prow?.worker_id) projectKeys.add(String(prow.worker_id).trim());
        if (prow?.id) projectKeys.add(String(prow.id).trim());
      } else if (clientId) {
        const cpRow = await env.DB.prepare(
          `SELECT p.id, p.workspace_id, p.worker_id
           FROM client_projects cp
           INNER JOIN projects p ON p.id = cp.project_id
           WHERE cp.client_id = ?
           ORDER BY cp.updated_at DESC
           LIMIT 1`,
        )
          .bind(clientId)
          .first();
        if (cpRow?.workspace_id) queryWorkspaceId = String(cpRow.workspace_id).trim();
        if (cpRow?.id) projectKeys.add(String(cpRow.id).trim());
        if (cpRow?.worker_id) projectKeys.add(String(cpRow.worker_id).trim());
      }

      const binds = [scope.tenantId, queryWorkspaceId];
      let sql = `SELECT * FROM agentsam_todo
         WHERE tenant_id = ? AND workspace_id = ?
           AND (status IS NULL OR LOWER(TRIM(status)) NOT IN ('done', 'completed', 'cancelled'))`;
      if (!includeLegacy) {
        sql += ` AND (
             plan_id IS NULL
             OR plan_id NOT IN (
               SELECT id FROM agentsam_plans
               WHERE LOWER(COALESCE(status, '')) IN ('abandoned', 'archived')
             )
           )`;
      }
      if (projectId) {
        const keys = [...projectKeys];
        if (!keys.includes(projectId)) keys.unshift(projectId);
        const ph = keys.map(() => '?').join(', ');
        sql += ` AND (project_id IN (${ph}) OR project_key IN (${ph}))`;
        binds.push(...keys, ...keys);
      }
      if (clientId) {
        sql += ` AND client_id = ?`;
        binds.push(clientId);
      } else if (clientWork) {
        sql += ` AND client_id IS NOT NULL AND TRIM(client_id) != ''
           AND client_id NOT IN ('client_sam_primeaux', 'client_meauxbility')`;
      }
      if (category) {
        sql += ` AND LOWER(TRIM(COALESCE(category, ''))) = LOWER(TRIM(?))`;
        binds.push(category);
      }
      sql += ` ORDER BY sort_order ASC, created_at DESC`;
      const { results } = await env.DB.prepare(sql).bind(...binds).all();
      return jsonResponse({ todos: results || [] });
    } catch (e) {
      console.warn('[agent/todo]', e?.message ?? e);
      return jsonResponse({ error: 'Failed to load todos' }, 500);
    }
  }

  // GET /api/agent/health — first thing Agent Sam queries on session start
  if (path === '/api/agent/health' && method === 'GET') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const { results } = await env.DB.prepare(
      `SELECT component, status, last_checked_at, last_healthy_at,
              error_message, metadata_json
       FROM iam_system_health
       ORDER BY status DESC, component ASC`
    ).all();
    const down = (results || []).filter((r) => r.status === 'down').length;
    const degraded = (results || []).filter((r) => r.status === 'degraded').length;
    return jsonResponse({
      overall: down > 0 ? 'down' : degraded > 0 ? 'degraded' : 'healthy',
      components: results || [],
      queried_at: new Date().toISOString()
    });
  }

  // ── /api/agent/models — canonical agentsam_ai rows (picker + routing metadata)
  if (path === '/api/agent/models') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    if (method !== 'GET') return jsonResponse({ error: 'Method not allowed' }, 405);
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    let tenantForModels =
      authUser.tenant_id != null && String(authUser.tenant_id).trim() !== ''
        ? String(authUser.tenant_id).trim()
        : null;
    if (!tenantForModels && authUser.id) tenantForModels = await fetchAuthUserTenantId(env, authUser.id);
    if (!tenantForModels && authUser.email) tenantForModels = await fetchAuthUserTenantId(env, authUser.email);
    if (!tenantForModels) return jsonResponse({ error: 'Tenant not configured for this account' }, 403);
    const showInPicker = url.searchParams.get('show_in_picker') === '1';
    try {
      const { getTenantLlmByokStatus, llmSecretNameForApiPlatform } = await import('./vault.js');
      const byok = await getTenantLlmByokStatus(env, {
        tenantId: tenantForModels,
        userId: String(authUser.id || '').trim(),
      });
      const { results } = await env.DB.prepare(
        `SELECT id, name, provider, model_key, api_platform, show_in_picker,
                picker_eligible, picker_group,
                input_rate_per_mtok, output_rate_per_mtok, sort_order, context_max_tokens,
                size_class, supports_tools, supports_vision
         FROM agentsam_ai
         WHERE mode = 'model' AND status = 'active'
           AND COALESCE(picker_eligible, 1) = 1
           AND (is_global = 1 OR allowed_tenants_json LIKE ('%"' || ? || '"%'))
           ${showInPicker ? 'AND COALESCE(show_in_picker, 0) = 1' : ''}
         ORDER BY sort_order ASC, name ASC`,
      ).bind(tenantForModels).all();
      const rows = (results || []).map((row) => {
        const secretName = llmSecretNameForApiPlatform(row.api_platform);
        const slot = secretName ? byok[secretName] : null;
        return {
          ...row,
          byok_configured: !!(slot && slot.configured),
          byok_masked: slot?.masked ?? null,
          billing_key_source: slot?.configured ? 'byok' : 'platform',
        };
      });
      return jsonResponse(rows);
    } catch (e) {
      return jsonResponse({ error: e?.message }, 500);
    }
  }

  // ── /api/agent/modes ──────────────────────────────────────────────────────
  if (path === '/api/agent/modes' && method === 'GET') {
    const { listAgentModesForApi } = await import('../core/agent-mode.js');
    return jsonResponse(listAgentModesForApi());
  }

  // ── /api/agent/commands/execute — slash palette dispatch (command_run + use_count)
  if (path === '/api/agent/commands/execute' && method === 'POST') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const slug = String(body.slug ?? body.command_slug ?? '').trim();
    const commandId = String(body.command_id ?? body.commandId ?? '').trim();
    if (!slug && !commandId) {
      return jsonResponse({ error: 'slug_or_command_id_required' }, 400);
    }
    const reqCtx = await resolveRequestContext(request, env);
    if (reqCtx.error) return jsonResponse({ error: 'Unauthorized' }, 401);
    const workspaceId = reqCtx.workspaceId != null ? String(reqCtx.workspaceId).trim() : '';
    if (!workspaceId) return jsonResponse({ error: 'WORKSPACE_CONTEXT_MISSING' }, 400);
    let tenantId =
      reqCtx.tenantId != null && String(reqCtx.tenantId).trim() !== ''
        ? String(reqCtx.tenantId).trim()
        : authUser.tenant_id != null && String(authUser.tenant_id).trim() !== ''
          ? String(authUser.tenant_id).trim()
          : null;
    if (!tenantId) tenantId = await fetchAuthUserTenantId(env, authUser.id);
    let cmdRow = null;
    if (commandId) {
      cmdRow = await env.DB.prepare(
        `SELECT * FROM agentsam_commands WHERE id = ? AND COALESCE(is_active, 1) = 1 LIMIT 1`,
      )
        .bind(commandId)
        .first();
    } else {
      cmdRow = await env.DB.prepare(
        `SELECT * FROM agentsam_commands WHERE slug = ? AND COALESCE(is_active, 1) = 1 LIMIT 1`,
      )
        .bind(slug.startsWith('/') ? slug : `/${slug}`)
        .first();
      if (!cmdRow) {
        cmdRow = await env.DB.prepare(
          `SELECT * FROM agentsam_commands WHERE slug = ? AND COALESCE(is_active, 1) = 1 LIMIT 1`,
        )
          .bind(slug.replace(/^\//, ''))
          .first();
      }
    }
    if (!cmdRow?.id) return jsonResponse({ error: 'command_not_found' }, 404);
    const { executeCommand } = await import('./command-run-telemetry.js');
    const cmdArgs = body.args && typeof body.args === 'object' ? { ...body.args } : {};
    if (Array.isArray(body.messages)) cmdArgs.messages = body.messages;
    const out = await executeCommand(env, ctx, {
      commandId: String(cmdRow.id),
      userId: authUser.id,
      tenantId,
      workspaceId,
      sessionId: body.session_id ?? body.conversation_id ?? body.sessionId ?? null,
      agentRunId: body.agent_run_id ?? body.agentRunId ?? null,
      args: cmdArgs,
      taskType: body.task_type ?? cmdRow.task_type ?? null,
      skipApprovalGate: body.skip_approval === true,
    });
    return jsonResponse(out, out?.ok ? 200 : out?.error === 'pending_approval' ? 202 : 400);
  }

  // ── /api/agent/commands — agentsam_commands (show_in_slash); legacy agentsam_slash_commands retired
  if (path === '/api/agent/commands' && method === 'GET') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    try {
      const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
      let tenantId =
        authUser?.tenant_id != null && String(authUser.tenant_id).trim() !== ''
          ? String(authUser.tenant_id).trim()
          : null;
      if (!tenantId && authUser?.id) tenantId = await fetchAuthUserTenantId(env, authUser.id);
      if (!tenantId && authUser?.email) tenantId = await fetchAuthUserTenantId(env, authUser.email);
      const reqCtx = authUser ? await resolveRequestContext(request, env) : { error: 'unauthenticated' };
      const results = await listAgentsamSlashCommands(env.DB, {
        tenantId,
        workspaceId: reqCtx.error ? null : (reqCtx.workspaceId ?? null),
        limit: 200,
      });
      return jsonResponse(results || []);
    } catch (e) { return jsonResponse({ error: e?.message }, 500); }
  }

  // ── /api/agent/session/mode ───────────────────────────────────────────────
  if (path === '/api/agent/session/mode' && method === 'POST') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    const body           = await request.json().catch(() => ({}));
    const mode           = String(body.mode || '').toLowerCase().trim();
    const conversationId = String(body.conversation_id || body.session_id || '');
    if (!conversationId) return jsonResponse({ error: 'conversation_id required' }, 400);
    if (!env.SESSION_CACHE) return jsonResponse({ error: 'SESSION_CACHE not configured' }, 503);
    await env.SESSION_CACHE.put(`session_mode:${conversationId}`, JSON.stringify({ mode, updated_at: Date.now() }), { expirationTtl: 86400 * 14 });
    return jsonResponse({ mode, persisted: true });
  }

  // ── /api/agent/problems ───────────────────────────────────────────────────
  if (path === '/api/agent/problems' && method === 'GET') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);
    const checkedAt = new Date().toISOString();
    const userId = String(authUser.id || '').trim();
    let error_log = [];
    let mcp_tool_errors = [], audit_failures = [], worker_errors = [];

    try {
      const reqCtx = await resolveRequestContext(request, env);
      const wid = !reqCtx.error && reqCtx.workspaceId != null ? String(reqCtx.workspaceId).trim() : '';
      if (wid) {
        const q = await env.DB.prepare(
          `SELECT id, workspace_id, error_code, error_type, error_message, source, source_id, resolved, created_at
           FROM agentsam_error_log
           WHERE workspace_id = ? AND COALESCE(resolved, 0) = 0
           ORDER BY created_at DESC LIMIT 50`,
        )
          .bind(wid)
          .all();
        error_log = q.results || [];
      }
    } catch (_) {}

    if (authUserIsSuperadmin(authUser)) {
      try { const q = await env.DB.prepare(`SELECT id, tool_name, status, error_message, session_id, created_at FROM agentsam_mcp_tool_execution WHERE lower(COALESCE(status,'')) IN ('error','failed') OR (error_message IS NOT NULL AND length(trim(error_message)) > 0) ORDER BY created_at DESC LIMIT 50`).all(); mcp_tool_errors = q.results || []; } catch (_) {}
      try { const q = await env.DB.prepare(`SELECT id, event_type, message, created_at, metadata_json FROM agentsam_hook_execution WHERE lower(COALESCE(event_type,'')) LIKE '%fail%' OR lower(COALESCE(event_type,'')) LIKE '%error%' OR lower(COALESCE(event_type,'')) LIKE '%denied%' ORDER BY created_at DESC LIMIT 25`).all(); audit_failures = q.results || []; } catch (_) {}
      try { const q = await env.DB.prepare(`SELECT rowid as id, path, method, status_code, error_message, created_at FROM worker_analytics_errors ORDER BY created_at DESC LIMIT 20`).all(); worker_errors = q.results || []; } catch (_) {}
    }

    const { buildUnifiedProblems } = await import('../core/agent-problems.js');
    const problems = buildUnifiedProblems(
      { error_log, mcp_tool_errors, audit_failures, worker_errors },
      { surface: 'terminal' },
    );

    return jsonResponse({
      checked_at: checkedAt,
      error_log,
      mcp_tool_errors,
      audit_failures,
      worker_errors,
      problems,
    });
  }

  // ── /api/agent/problems/resolve ───────────────────────────────────────────
  if (path === '/api/agent/problems/resolve' && method === 'POST') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);

    const body = await request.json().catch(() => ({}));
    const reqCtx = await resolveRequestContext(request, env);
    if (reqCtx.error) return jsonResponse({ error: 'Unauthorized' }, 401);
    const wid = reqCtx.workspaceId != null ? String(reqCtx.workspaceId).trim() : '';
    if (!wid) return jsonResponse({ error: 'workspace_id required' }, 400);

    const ids = [];
    if (Array.isArray(body.ids)) {
      for (const raw of body.ids) {
        const id = raw != null ? String(raw).trim() : '';
        if (id) ids.push(id.slice(0, 120));
      }
    } else if (body.id != null && String(body.id).trim() !== '') {
      ids.push(String(body.id).trim().slice(0, 120));
    }

    const olderThanDays = Number(body.older_than_days);
    const bulkByAge = Number.isFinite(olderThanDays) && olderThanDays > 0;
    const resolveAll = body.resolve_all === true || body.resolve_all === 1 || body.resolve_all === '1';
    if (!ids.length && !bulkByAge && !resolveAll) {
      return jsonResponse({ error: 'id, ids, older_than_days, or resolve_all required' }, 400);
    }

    let resolvedCount = 0;
    let workerErrorsCleared = 0;
    try {
      if (resolveAll) {
        const q = await env.DB.prepare(
          `UPDATE agentsam_error_log
           SET resolved = 1
           WHERE workspace_id = ? AND COALESCE(resolved, 0) = 0`,
        )
          .bind(wid)
          .run();
        resolvedCount = Number(q.meta?.changes) || 0;
        if (authUserIsSuperadmin(authUser)) {
          try {
            const wq = await env.DB.prepare(`DELETE FROM worker_analytics_errors`).run();
            workerErrorsCleared = Number(wq.meta?.changes) || 0;
          } catch (_) {
            /* table optional */
          }
        }
      } else if (bulkByAge) {
        const cutoff = Math.floor(Date.now() / 1000) - Math.floor(olderThanDays) * 86400;
        const q = await env.DB.prepare(
          `UPDATE agentsam_error_log
           SET resolved = 1
           WHERE workspace_id = ? AND COALESCE(resolved, 0) = 0 AND created_at < ?`,
        )
          .bind(wid, cutoff)
          .run();
        resolvedCount = Number(q.meta?.changes) || 0;
        if (authUserIsSuperadmin(authUser)) {
          try {
            const wq = await env.DB.prepare(
              `DELETE FROM worker_analytics_errors WHERE created_at < ?`,
            )
              .bind(cutoff)
              .run();
            workerErrorsCleared = Number(wq.meta?.changes) || 0;
          } catch (_) {
            /* table optional */
          }
        }
      }
      for (const id of ids.slice(0, 100)) {
        const q = await env.DB.prepare(
          `UPDATE agentsam_error_log
           SET resolved = 1
           WHERE id = ? AND workspace_id = ? AND COALESCE(resolved, 0) = 0`,
        )
          .bind(id, wid)
          .run();
        resolvedCount += Number(q.meta?.changes) || 0;
      }
    } catch (e) {
      return jsonResponse({ error: e?.message || 'resolve_failed' }, 500);
    }

    return jsonResponse({
      ok: true,
      resolved_count: resolvedCount,
      worker_errors_cleared: workerErrorsCleared,
      workspace_id: wid,
    });
  }

  // ── /api/agent/notifications (deployments + conversations + connectivity) ──
  if (path === '/api/agent/notifications' && method === 'GET') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);

    let tenantId = authUser.tenant_id != null && String(authUser.tenant_id).trim() !== ''
      ? String(authUser.tenant_id).trim()
      : null;
    if (!tenantId) tenantId = await fetchAuthUserTenantId(env, authUser.id);
    if (!tenantId && authUser.email) tenantId = await fetchAuthUserTenantId(env, authUser.email);

    const userId = String(authUser.id || '').trim();

    try {
      let deployRows = [];
      try {
        const q = await env.DB.prepare(
          `SELECT id, status, deployed_by, environment, worker_name,
                  triggered_by, git_hash, timestamp AS created_at
           FROM deployments
           ORDER BY timestamp DESC LIMIT 10`,
        ).all();
        deployRows = q.results || [];
      } catch {
        try {
          const q = await env.DB.prepare(
            `SELECT * FROM deployments ORDER BY COALESCE(created_at, 0) DESC LIMIT 10`,
          ).all();
          deployRows = q.results || [];
        } catch {
          deployRows = [];
        }
      }

      let convRows = [];
      if (tenantId && userId) {
        try {
          const canonicalUserId = await resolveCanonicalUserId(userId, env).catch(() => userId);
          const q = await env.DB.prepare(
            `SELECT id, title, message_count, last_message_at AS created_at,
                    total_cost_usd, workspace_id
             FROM agent_conversations
             WHERE user_id = ? AND COALESCE(is_archived, 0) = 0
             ORDER BY last_message_at DESC LIMIT 20`,
          ).bind(canonicalUserId).all();
          convRows = q.results || [];
        } catch {
          convRows = [];
        }
      }

      let healthRows = [];
      if (tenantId) {
        try {
          const q = await env.DB.prepare(
            `SELECT wc.workspace_id, wc.service, wc.status,
                    wc.last_checked_at AS created_at, w.display_name
             FROM workspace_connectivity_status wc
             JOIN agentsam_workspace w ON w.id = wc.workspace_id
             WHERE wc.status IN ('degraded','down') AND w.tenant_id = ?
             LIMIT 10`,
          ).bind(tenantId).all();
          healthRows = q.results || [];
        } catch {
          healthRows = [];
        }
      }

      const normalized = [];

      // Canonical in-app inbox spine (D1 notifications) — daily digests / push / billing should land here.
      if (userId) {
        try {
          const inboxQ = await env.DB.prepare(
            `SELECT id, channel, subject, message, status, entity_type, entity_id,
                    priority, sent_at, read_at, created_at, data
             FROM notifications
             WHERE recipient_id = ?
             ORDER BY created_at DESC
             LIMIT 30`,
          ).bind(userId).all();
          for (const r of inboxQ.results || []) {
            const ts = toUnixSeconds(r.created_at ?? r.sent_at);
            const title =
              r.subject != null && String(r.subject).trim()
                ? String(r.subject).trim()
                : r.channel
                  ? `${String(r.channel)} notification`
                  : 'Notification';
            normalized.push({
              id: String(r.id),
              type: 'inbox',
              channel: r.channel ?? null,
              title,
              message: r.message != null ? String(r.message).slice(0, 400) : '',
              created_at: ts,
              read: r.read_at != null,
              status: r.status ?? null,
              meta: r,
              subject: title,
              href:
                r.entity_type === 'conversation' && r.entity_id
                  ? `/dashboard/agent?conversation=${encodeURIComponent(String(r.entity_id))}`
                  : r.channel === 'email'
                    ? '/dashboard/settings/notifications'
                    : null,
            });
          }
        } catch {
          /* notifications table optional */
        }
      }

      // Delivery queue lives on /dashboard/mail → Outbound (notification_outbox).

      for (const r of deployRows) {
        const worker = r.worker_name != null ? String(r.worker_name) : 'worker';
        const gh = r.git_hash != null ? String(r.git_hash) : '';
        const trig = r.triggered_by != null ? String(r.triggered_by) : '';
        const st = r.status != null ? String(r.status) : '';
        const ts = toUnixSeconds(r.created_at ?? r.timestamp);
        normalized.push({
          id: `deploy:${r.id}`,
          type: 'deploy',
          title: `Deploy ${st}: ${worker}`,
          message: `${trig} · ${gh ? gh.slice(0, 7) : '—'}`,
          created_at: ts,
          read: false,
          meta: r,
          subject: `Deploy ${st}: ${worker}`,
        });
      }

      for (const r of convRows) {
        const ts = toUnixSeconds(r.created_at);
        const titleBase =
          r.title != null && String(r.title).trim()
            ? String(r.title).trim()
            : 'Untitled conversation';
        const mc = r.message_count != null ? Number(r.message_count) : 0;
        normalized.push({
          id: `conv:${r.id}`,
          type: 'conversation',
          title: titleBase,
          message: `${mc} messages`,
          created_at: ts,
          read: false,
          meta: r,
          subject: titleBase,
        });
      }

      for (const r of healthRows) {
        const ts = toUnixSeconds(r.created_at);
        const svc = r.service != null ? String(r.service) : 'service';
        const st = r.status != null ? String(r.status) : '';
        const dn = r.display_name != null ? String(r.display_name) : 'workspace';
        normalized.push({
          id: `health:${r.workspace_id}:${svc}`,
          type: 'health',
          title: `${svc} ${st} on ${dn}`,
          message: `Last checked ${formatRelativeCheckedAgo(ts)}`,
          created_at: ts,
          read: false,
          meta: r,
          subject: `${svc} ${st} on ${dn}`,
        });
      }

      if (tenantId) {
        try {
          const calQ = await env.DB.prepare(
            `SELECT id, title, description, start_datetime, end_datetime, event_type, status, color
             FROM calendar_events
             WHERE workspace_id IN (
               SELECT id FROM agentsam_workspace WHERE tenant_id = ? LIMIT 20
             )
               AND event_type IN ('billing_reminder', 'billing_period')
               AND date(start_datetime) <= date('now')
               AND datetime(start_datetime) >= datetime('now', '-14 days')
               AND status IN ('scheduled', 'reminded')
             ORDER BY start_datetime DESC
             LIMIT 10`,
          ).bind(tenantId).all();
          for (const r of calQ.results || []) {
            const ts = toUnixSeconds(r.start_datetime);
            const title = r.title != null ? String(r.title).trim() : 'Calendar reminder';
            const desc = r.description != null ? String(r.description).trim() : '';
            normalized.push({
              id: `cal:${r.id}`,
              type: 'billing',
              title,
              message: desc.slice(0, 240) || 'Billing reminder',
              created_at: ts || Math.floor(Date.now() / 1000),
              read: r.status === 'reminded',
              meta: r,
              subject: title,
            });
          }
        } catch {
          /* calendar_events optional */
        }
      }

      normalized.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
      const top = normalized.slice(0, 50);
      return jsonResponse({ notifications: top });
    } catch (e) {
      return jsonResponse({ error: e?.message ?? String(e) }, 500);
    }
  }

  const notifReadMatch = path.match(/^\/api\/agent\/notifications\/([^/]+)\/read$/);
  if (notifReadMatch && method === 'PATCH') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env?.DB) return jsonResponse({ error: 'D1 unavailable' }, 503);
    const notifId = decodeURIComponent(notifReadMatch[1] || '').trim();
    const userId = String(authUser.id || '').trim();
    // Synthetic ids (deploy:/conv:/…) are UI-only — acknowledge without write.
    if (!notifId || notifId.includes(':')) {
      return jsonResponse({ success: true, synthetic: true });
    }
    try {
      await env.DB.prepare(
        `UPDATE notifications
         SET read_at = COALESCE(read_at, unixepoch()), status = CASE WHEN status = 'pending' THEN 'read' ELSE status END
         WHERE id = ? AND recipient_id = ?`,
      )
        .bind(notifId, userId)
        .run();
      return jsonResponse({ success: true });
    } catch (e) {
      return jsonResponse({ error: String(e?.message || e) }, 500);
    }
  }

  // ── /api/agent/keyboard-shortcuts ────────────────────────────────────────
  if (path === '/api/agent/keyboard-shortcuts' && method === 'GET') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);
    const { results } = await env.DB.prepare(`SELECT * FROM keyboard_shortcuts ORDER BY sort_order ASC, id ASC`).all();
    return jsonResponse({ shortcuts: results || [] });
  }

  const kbMatch = path.match(/^\/api\/agent\/keyboard-shortcuts\/([^/]+)$/);
  if (kbMatch && method === 'PATCH') {
    const rowId    = decodeURIComponent(kbMatch[1] || '').trim();
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);
    const body    = await request.json().catch(() => ({}));
    const en      = body.is_enabled;
    const turnOn  = en === true || en === 1 || en === '1';
    const turnOff = en === false || en === 0 || en === '0';
    if (!turnOn && !turnOff) return jsonResponse({ error: 'is_enabled required' }, 400);
    const existing = await env.DB.prepare(`SELECT id, is_system FROM keyboard_shortcuts WHERE id = ?`).bind(rowId).first();
    if (!existing) return jsonResponse({ error: 'Not found' }, 404);
    if (Number(existing.is_system) === 1) return jsonResponse({ error: 'System shortcut cannot be disabled' }, 403);
    await env.DB.prepare(`UPDATE keyboard_shortcuts SET is_enabled = ? WHERE id = ?`).bind(turnOn ? 1 : 0, rowId).run();
    return jsonResponse({ ok: true });
  }

  // ── /api/agent/browser/registry-tools — D1 agentsam_tools for BrowserView / picker ──
  if (path === '/api/agent/browser/registry-tools' && method === 'GET') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ tools: [], pickers: {} });
    let tenantId =
      authUser.tenant_id != null && String(authUser.tenant_id).trim() !== ''
        ? String(authUser.tenant_id).trim()
        : null;
    if (!tenantId) tenantId = await fetchAuthUserTenantId(env, authUser.id);
    const workspaceId = String(
      url.searchParams.get('workspace_id') || identity?.workspaceId || '',
    ).trim();
    const userId = String(authUser.id || identity?.userId || '').trim();
    const tools = await loadAvailableToolsForCapability(
      env,
      tenantId || '',
      workspaceId,
      userId,
      'browser',
    );
    const pickers = {
      navigate: ['browser_navigate', 'cdt_navigate_page'],
      content: ['browser_content'],
      console: ['cdt_list_console_messages'],
      network: ['cdt_list_network_requests'],
      snapshot: ['cdt_take_snapshot'],
      screenshot: ['playwright_screenshot', 'browser_screenshot', 'cdt_take_screenshot'],
      evaluate: ['cdt_evaluate_script'],
      hover: ['cdt_hover'],
    };
    const names = new Set(tools.map((t) => String(t.tool_name)));
    const resolved = {};
    for (const [lane, candidates] of Object.entries(pickers)) {
      resolved[lane] = candidates.find((c) => names.has(c)) || null;
    }
    return jsonResponse({ tools, pickers: resolved });
  }

  // ── /api/agent/context-picker/catalog ────────────────────────────────────
  if (path === '/api/agent/context-picker/catalog' && method === 'GET') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ tables: [], workflows: [], commands: [], memory_keys: [], workspaces: [] });
    let tenantId =
      authUser.tenant_id != null && String(authUser.tenant_id).trim() !== ''
        ? String(authUser.tenant_id).trim()
        : null;
    if (!tenantId) tenantId = await fetchAuthUserTenantId(env, authUser.id);
    if (!tenantId && authUser.email) tenantId = await fetchAuthUserTenantId(env, authUser.email);
    let tables = [], workflows = [], commands = [], memory_keys = [], workspaces = [];
    await Promise.allSettled([
      env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all().then(r => { tables = (r.results||[]).map(x=>x.name); }),
      env.DB.prepare(`SELECT id, name FROM agentsam_mcp_workflows ORDER BY COALESCE(name,id) LIMIT 100`).all().then(r => { workflows = r.results||[]; }),
      tenantId
        ? listAgentsamSlashCommands(env.DB, { tenantId, limit: 200 }).then((rows) => {
            commands = (rows || []).map((r) => ({
              slug: r.slug,
              name: r.name || r.display_name,
              category: r.category,
            }));
          })
        : Promise.resolve(),
      tenantId ? env.DB.prepare(`SELECT key FROM agentsam_memory WHERE tenant_id = ? ORDER BY COALESCE(importance_score,0) DESC LIMIT 150`).bind(tenantId).all().then(r => { memory_keys = (r.results||[]).map(x=>x.key); }) : Promise.resolve(),
      env.DB.prepare(`SELECT id, name FROM workspaces WHERE id LIKE 'ws_%' ORDER BY name LIMIT 50`).all().then(r => { workspaces = r.results||[]; }),
    ]);
    return jsonResponse({ tables, workflows, commands, memory_keys, workspaces });
  }

  // ── /api/agent/memory/list — D1 compatibility (edge cache keys) ─────────
  if (path === '/api/agent/memory/list' && method === 'GET') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ items: [], surface: 'd1_compat' });
    let tenantId =
      authUser.tenant_id != null && String(authUser.tenant_id).trim() !== ''
        ? String(authUser.tenant_id).trim()
        : null;
    if (!tenantId) tenantId = await fetchAuthUserTenantId(env, authUser.id);
    if (!tenantId && authUser.email) tenantId = await fetchAuthUserTenantId(env, authUser.email);
    if (!tenantId) return jsonResponse({ items: [], surface: 'd1_compat' });
    const surface = String(url.searchParams.get('surface') || 'd1').toLowerCase();
    if (surface === 'private' && identity?.workspaceId && identity?.userId) {
      const { searchPrivateAgentsamMemory } = await import('../core/agentsam-private-memory.js');
      const priv = await searchPrivateAgentsamMemory(env, {
        tenantId,
        workspaceId: identity.workspaceId,
        userId: identity.userId,
        limit: 200,
      });
      return jsonResponse({
        surface: 'private',
        items: (priv.results ?? []).map((r) => ({
          key: r.memory_key,
          memory_type: r.memory_type,
          summary: r.summary,
          importance: r.importance,
          updated_at: r.updated_at,
        })),
      });
    }
    const includeResolved = url.searchParams.get('include_resolved') === '1';
    const activeFilter = includeResolved
      ? '1=1'
      : 'COALESCE(is_archived, 0) = 0 AND COALESCE(is_resolved, 0) = 0';
    const { results } = await env.DB.prepare(
      `SELECT key, memory_type, COALESCE(importance, importance_score, 5) AS importance_score,
              sync_key, COALESCE(is_resolved, 0) AS is_resolved, resolved_at
       FROM agentsam_memory WHERE tenant_id = ? AND ${activeFilter}
       ORDER BY COALESCE(importance, importance_score, 0) DESC LIMIT 200`,
    )
      .bind(tenantId)
      .all()
      .catch(() => ({ results: [] }));
    return jsonResponse({ surface: 'd1_compat', items: (results || []).filter((r) => r.key) });
  }

  // ── GET /api/agent/memory/private/list — canonical private managed memory ─
  if (path === '/api/agent/memory/private/list' && method === 'GET') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!identity?.workspaceId || !identity?.userId || !identity?.tenantId) {
      return jsonResponse({ error: 'no_workspace' }, 403);
    }
    const { searchPrivateAgentsamMemory } = await import('../core/agentsam-private-memory.js');
    const limit = Math.min(Number(url.searchParams.get('limit') || 100), 200);
    const memoryType = url.searchParams.get('memory_type') || undefined;
    const out = await searchPrivateAgentsamMemory(env, {
      tenantId: identity.tenantId,
      workspaceId: identity.workspaceId,
      userId: identity.userId,
      memoryType,
      limit,
    });
    return jsonResponse({ ok: out.ok, surface: 'private', count: out.results?.length ?? 0, items: out.results ?? [] });
  }

  // ── POST /api/agent/memory/private/search — no Vectorize ─────────────────
  if (path === '/api/agent/memory/private/search' && method === 'POST') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!identity?.workspaceId || !identity?.userId || !identity?.tenantId) {
      return jsonResponse({ error: 'no_workspace' }, 403);
    }
    const body = await request.json().catch(() => ({}));
    const q = String(body.query ?? body.q ?? '').trim();
    const { searchPrivateAgentsamMemory } = await import('../core/agentsam-private-memory.js');
    const out = await searchPrivateAgentsamMemory(env, {
      tenantId: identity.tenantId,
      workspaceId: identity.workspaceId,
      userId: identity.userId,
      query: q || undefined,
      memoryType: body.memory_type ?? body.memoryType,
      memoryKey: body.memory_key ?? body.key,
      limit: body.limit ?? 20,
    });
    return jsonResponse({
      ok: out.ok,
      surface: 'private',
      tier: out.tier,
      query: q,
      count: out.results?.length ?? 0,
      results: out.results ?? [],
    });
  }

  // ── POST /api/agent/memory/private/upsert — D1 + private PG mirror ─────
  if (path === '/api/agent/memory/private/upsert' && method === 'POST') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!identity?.workspaceId || !identity?.userId || !identity?.tenantId) {
      return jsonResponse({ error: 'no_workspace' }, 403);
    }
    const body = await request.json().catch(() => ({}));
    const key = String(body.key ?? body.memory_key ?? '').trim();
    const value = String(body.value ?? body.content ?? '').trim();
    if (!key || !value) return jsonResponse({ error: 'key_and_value_required' }, 400);
    const { memoryWrite } = await import('../tools/memory.js');
    const out = await memoryWrite(
      {
        key,
        value,
        memory_type: body.memory_type ?? 'fact',
        tags: body.tags ?? [],
        source: body.source ?? 'dashboard_private_api',
        confidence: body.confidence ?? 1,
        ttl_days: body.ttl_days,
      },
      env,
      {
        tenantId: identity.tenantId,
        userId: identity.userId,
        workspaceId: identity.workspaceId,
        sessionId: body.session_id ?? null,
      },
    );
    return jsonResponse({ ...out, surface: 'private' }, out.error ? 400 : 200);
  }

  // ── POST /api/agent/memory/maintenance — report only ─────────────────────
  if (path === '/api/agent/memory/maintenance' && method === 'POST') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!identity?.workspaceId || !identity?.tenantId) {
      return jsonResponse({ error: 'no_workspace' }, 403);
    }
    const { runAgentsamMemoryMaintenance } = await import('../core/agentsam-memory-maintenance.js');
    const report = await runAgentsamMemoryMaintenance(env, {
      tenantId: identity.tenantId,
      workspaceId: identity.workspaceId,
      userId: identity.userId,
    });
    return jsonResponse(report);
  }

  // ── POST /api/agent/memory/resolve — mark memory closed (excluded from briefs) ─
  if (path === '/api/agent/memory/resolve' && method === 'POST') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'no_db' }, 503);
    let tenantId =
      identity?.tenantId ||
      (authUser.tenant_id != null && String(authUser.tenant_id).trim() !== ''
        ? String(authUser.tenant_id).trim()
        : null);
    if (!tenantId) tenantId = await fetchAuthUserTenantId(env, authUser.id);
    const userId = identity?.userId || authUser.id;
    if (!tenantId || !userId) return jsonResponse({ error: 'no_identity' }, 403);

    const body = await request.json().catch(() => ({}));
    const { resolveAgentsamMemory } = await import('../core/agentsam-memory-resolve.js');
    const out = await resolveAgentsamMemory(env, {
      tenantId,
      userId,
      key: body.key ?? body.memory_key,
      keys: body.keys,
      id: body.id,
      resolvedBy: authUser.id,
      note: body.note ?? body.reason,
    });
    return jsonResponse(out, out.ok ? 200 : 400);
  }

  // ── POST /api/agent/memory/private/backfill — D1 → private PG (owner) ───
  if (path === '/api/agent/memory/private/backfill' && method === 'POST') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!authUserIsSuperadmin(authUser)) {
      return jsonResponse({ error: 'forbidden' }, 403);
    }
    if (!identity?.workspaceId || !identity?.tenantId || !identity?.userId) {
      return jsonResponse({ error: 'no_workspace' }, 403);
    }
    const body = await request.json().catch(() => ({}));
    const { backfillPrivateMemoryFromD1 } = await import('../core/agentsam-private-memory-backfill.js');
    const report = await backfillPrivateMemoryFromD1(env, {
      tenantId: identity.tenantId,
      workspaceId: identity.workspaceId,
      userId: body.all_users ? undefined : identity.userId,
      limit: body.limit ?? 500,
      dryRun: body.dry_run === true,
    });
    return jsonResponse(report, report.ok ? 200 : 500);
  }

  // ── POST /api/agent/memory/upsert — LEGACY public.agent_memory + embedding
  if (path === '/api/agent/memory/upsert' && method === 'POST') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!identity?.workspaceId) {
      return jsonResponse({ error: 'no_workspace', redirect: '/onboarding' }, 403);
    }
    const { isHyperdriveUsable } = await import('../core/hyperdrive-query.js');
    if (!isHyperdriveUsable(env)) {
      return jsonResponse({ error: 'HYPERDRIVE not configured' }, 503);
    }

    const body = await request.json().catch(() => ({}));
    const session_id = String(body.session_id ?? body.sessionId ?? '').trim();
    const content = String(body.content ?? '').trim();
    if (!session_id) return jsonResponse({ error: 'session_id required' }, 400);
    if (!content) return jsonResponse({ error: 'content required' }, 400);

    const workspace_id = String(body.workspace_id ?? identity.workspaceId ?? '').trim();
    const tenant_id = String(body.tenant_id ?? identity.tenantId ?? '').trim();
    const user_id = String(body.user_id ?? identity.userId ?? '').trim();

    const meta =
      body.metadata && typeof body.metadata === 'object' && body.metadata !== null && !Array.isArray(body.metadata)
        ? body.metadata
        : {};

    try {
      const result = await insertCuratedAgentMemory(env, {
        content,
        session_id,
        role: body.role,
        agent_id: body.agent_id,
        metadata: meta,
        workspace_id,
        tenant_id,
        user_id,
      });
      const dims = result.embedding_dims;
      return jsonResponse({
        ok: true,
        id: result.id,
        session_id,
        has_embedding: dims === 1536,
        embedding_dims: dims,
        embed_model: result.embed_model,
        workspace_id,
        tenant_id,
        memory_lane: 'legacy_public_agent_memory',
        deprecation:
          'Use POST /api/agent/memory/private/upsert for managed operational memory (agentsam.agentsam_memory).',
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const lower = msg.toLowerCase();
      const status =
        lower.includes('not configured') || lower.includes('hyperdrive') ? 503 : 400;
      return jsonResponse({ ok: false, error: msg }, status);
    }
  }

  // ── POST /api/agent/memory/search — LEGACY semantic search on public.agent_memory
  if (path === '/api/agent/memory/search' && method === 'POST') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!identity?.workspaceId) {
      return jsonResponse({ error: 'no_workspace', redirect: '/onboarding' }, 403);
    }
    const { isHyperdriveUsable } = await import('../core/hyperdrive-query.js');
    if (!isHyperdriveUsable(env)) {
      return jsonResponse({ error: 'HYPERDRIVE not configured' }, 503);
    }

    const body = await request.json().catch(() => ({}));
    const q = String(body.query ?? body.q ?? '').trim();
    if (!q) return jsonResponse({ error: 'query required' }, 400);

    const workspace_id = String(body.workspace_id ?? identity.workspaceId ?? '').trim();
    const tenant_id = String(body.tenant_id ?? identity.tenantId ?? '').trim();
    const session_id = body.session_id != null ? String(body.session_id).trim() : '';
    const user_id = body.user_id != null ? String(body.user_id).trim() : '';
    const filter_user_id = body.filter_user_id === true;
    const limit = body.limit;

    try {
      const { embed_model, results } = await searchCuratedAgentMemory(env, {
        query: q,
        workspace_id,
        tenant_id: tenant_id || null,
        user_id: filter_user_id ? String(identity.userId || '').trim() || null : user_id || null,
        session_id: session_id || null,
        limit,
      });
      return jsonResponse({
        ok: true,
        query: q,
        embed_model,
        workspace_id,
        tenant_id: tenant_id || null,
        count: results.length,
        results,
        memory_lane: 'legacy_public_agent_memory',
        deprecation:
          'Use POST /api/agent/memory/private/search for managed memory without Vectorize.',
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const lower = msg.toLowerCase();
      const status =
        lower.includes('not configured') || lower.includes('hyperdrive') ? 503 : 400;
      return jsonResponse({ ok: false, error: msg }, status);
    }
  }

  // ── /api/agent/memory/sync — Supabase webhook OR manual D1→pgvector sync ──
  if (path === '/api/agent/memory/sync' && method === 'POST') {
    const webhookSig =
      request.headers.get('x-supabase-signature') ||
      request.headers.get('X-Supabase-Signature') ||
      '';
    if (webhookSig) {
      return handleAgentMemorySync(request, env);
    }
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    const bearer = String(request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
    const bridgeOk =
      env.AGENTSAM_BRIDGE_KEY && bearer === String(env.AGENTSAM_BRIDGE_KEY).trim();
    if (!authUser && !bridgeOk) return jsonResponse({ error: 'Unauthorized' }, 401);
    const { runAgentsamMemoryVectorSync } = await import('../core/agentsam-memory-vector-sync.js');
    try {
      const out = await runAgentsamMemoryVectorSync(env, { skipLedger: true });
      return jsonResponse(out);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return jsonResponse({ ok: false, error: msg, embedded: 0, skipped: 0, failed: 0 }, 500);
    }
  }

  // ── /api/agent/alignment-sync — D1 workflow run + Supabase mirror (+ agentsam_memory) ──
  if (path === '/api/agent/alignment-sync' && method === 'POST') {
    if (!identity?.userId || !identity?.tenantId || !identity?.workspaceId) {
      return jsonResponse({ error: 'WORKSPACE_CONTEXT_MISSING' }, 400);
    }
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const body = await request.json().catch(() => ({}));
    const { recordAlignmentSnapshot } = await import('../core/alignment-sync.js');
    const out = await recordAlignmentSnapshot(env, ctx, {
      tenantId: identity.tenantId,
      workspaceId: identity.workspaceId,
      userId: identity.userId,
      sessionId: body.session_id ?? body.sessionId ?? null,
      todoId: body.todo_id ?? body.todoId ?? null,
      planTaskId: body.plan_task_id ?? body.planTaskId ?? null,
      planId: body.plan_id ?? body.planId ?? null,
      summary: body.summary != null ? String(body.summary) : '',
      filesChanged: Array.isArray(body.files_changed)
        ? body.files_changed
        : Array.isArray(body.filesChanged)
          ? body.filesChanged
          : [],
      memory: body.memory !== false,
    });
    if (!out.ok) return jsonResponse(out, 400);
    return jsonResponse(out);
  }

  // ── /api/agent/db/tables ──────────────────────────────────────────────────
  if (path === '/api/agent/db/tables' && method === 'GET') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ tables: [] });
    const { results } = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all().catch(() => ({ results: [] }));
    return jsonResponse({ tables: (results||[]).map(r=>r.name) });
  }

  // ── /api/agent/db/query-history (agentsam_tool_call_log — d1_* tools only) ─
  if (path === '/api/agent/db/query-history') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ history: [] });
    const uid = String(authUser.id);
    if (method === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT id, tool_name, input_summary AS query_sql, created_at AS executed_at,
                status, output_summary
         FROM agentsam_tool_call_log
         WHERE user_id = ?
           AND (tool_name LIKE 'd1_%' OR tool_category LIKE 'database.d1%')
         ORDER BY created_at DESC
         LIMIT 50`,
      )
        .bind(uid)
        .all()
        .catch(() => ({ results: [] }));
      const history = (results || []).map((r) => ({
        id: r.id,
        query_sql: r.query_sql || '',
        executed_at: r.executed_at,
        row_count: 0,
        status: r.status || 'success',
      }));
      return jsonResponse({ history });
    }
    if (method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const { scheduleToolCallLog } = await import('../core/agentsam-ops-ledger.js');
      scheduleToolCallLog(env, ctx, {
        userId: uid,
        tenantId: authUser.tenant_id || authUser.active_tenant_id,
        workspaceId: authUser.active_workspace_id,
        toolName: 'd1_query',
        toolCategory: 'database.d1.read',
        status: String(body.status || 'success'),
        inputSummary: String(body.query_sql || '').slice(0, 8000),
        outputSummary: JSON.stringify({ row_count: Number(body.row_count || 0) }),
      });
      return jsonResponse({ ok: true });
    }
  }

  // ── /api/agent/db/snippets (agentsam_memory keys db_snippet_*) ───────────
  if (path === '/api/agent/db/snippets') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ snippets: [] });
    const uid = String(authUser.id);
    const tid = String(authUser.tenant_id || authUser.active_tenant_id || '').trim();
    if (method === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT id, key, value, created_at
         FROM agentsam_memory
         WHERE user_id = ? AND key LIKE 'db_snippet_%'
         ORDER BY key ASC
         LIMIT 200`,
      )
        .bind(uid)
        .all()
        .catch(() => ({ results: [] }));
      const snippets = (results || []).map((r) => {
        const name = String(r.key || '').replace(/^db_snippet_/, '');
        return {
          id: r.id,
          name,
          query_sql: r.value || '',
          created_at: r.created_at,
        };
      });
      return jsonResponse({ snippets });
    }
    if (method === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (!body.name || !body.query_sql) return jsonResponse({ error: 'name and query_sql required' }, 400);
      const memKey = `db_snippet_${String(body.name).slice(0, 180)}`;
      const id = `mem_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      await env.DB.prepare(
        `INSERT INTO agentsam_memory (
           id, tenant_id, user_id, workspace_id, memory_type, key, value, source, confidence, created_at, updated_at
         ) VALUES (?,?,?,?,?,?,?,?,?,unixepoch(),unixepoch())
         ON CONFLICT(tenant_id, user_id, key) DO UPDATE SET
           value = excluded.value,
           updated_at = unixepoch()`,
      )
        .bind(
          id,
          tid || 'tenant_unknown',
          uid,
          authUser.active_workspace_id || null,
          'skill',
          memKey,
          String(body.query_sql).slice(0, 50000),
          'agent_db_snippets',
          1.0,
        )
        .run()
        .catch(() => {});
      return jsonResponse({ ok: true, id });
    }
  }

  // ── /api/agent/git/status ─────────────────────────────────────────────────
  // Legacy fallback — production handler is src/api/dashboard.js (live GitHub API).
  if (path === '/api/agent/git/status' && method === 'GET') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);
    try {
      return jsonResponse(await fetchAgentGitStatus(env, authUser, request, url));
    } catch (e) { return jsonResponse({ error: e?.message }, 500); }
  }

  // ── GET /api/agent/pty/health ─────────────────────────────────────────────
  if (path === '/api/agent/pty/health' && method === 'GET') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    return jsonResponse(await pingPtyServiceHealth(env));
  }

  // ── POST /api/agent/git/branch — persist per-user active branch (D1) ─────
  if (path === '/api/agent/git/branch' && method === 'POST') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    try {
      const body = await request.json().catch(() => ({}));
      const result = await setUserWorkspaceActiveBranch(env, authUser, request, body);
      if (result.error) return jsonResponse({ error: result.error, ...result }, result.status || 500);
      return jsonResponse(result);
    } catch (e) {
      return jsonResponse({ error: e?.message || 'Update failed' }, 500);
    }
  }

  // ── GET /api/agent/git/branches ───────────────────────────────────────────
  if (path === '/api/agent/git/branches' && method === 'GET') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);

    const { token, error, status } = await resolveGitHubToken(authUser, env);
    if (error) return jsonResponse({ error }, status);

    const repoCtx = await fetchWorkspaceGithubRepo(env, authUser, request, url);
    if (repoCtx.error) {
      return jsonResponse({ error: repoCtx.error, workspace_id: repoCtx.workspace_id }, repoCtx.status || 500);
    }

    const ghRes = await fetch(
      `https://api.github.com/repos/${repoCtx.repo}/branches?per_page=100`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'inneranimalmedia-agent/1.0',
        },
      },
    );

    if (!ghRes.ok) {
      return jsonResponse({ error: 'GitHub API error', status: ghRes.status, detail: await ghRes.text() }, 502);
    }

    const ghBranches = await ghRes.json();
    const statusPayload = await fetchGitStatusFromGitHub(env, authUser, request, url);
    const currentBranch = statusPayload.branch || 'main';

    // Shape matches existing GitBranchRow type in StatusBar:
    // { ref: string, sha: string, protected: boolean }
    return jsonResponse({
      current: currentBranch,
      repo: repoCtx.repo,
      branches: ghBranches.map((b) => ({
        ref: b.name,
        sha: b.commit.sha.slice(0, 7),
        protected: b.protected ?? false,
      })),
    });
  }

  // ── GET /api/agent/git/repos ──────────────────────────────────────────────
  if (path === '/api/agent/git/repos' && method === 'GET') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);

    const { token, error, status } = await resolveGitHubToken(authUser, env);
    if (error) return jsonResponse({ error }, status);

    const ghRes = await fetch(
      'https://api.github.com/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member',
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'inneranimalmedia-agent/1.0',
        },
      },
    );

    if (!ghRes.ok) {
      return jsonResponse({ error: 'GitHub API error', status: ghRes.status }, 502);
    }

    const ghRepos = await ghRes.json();

    const linkedRows = await env.DB.prepare(
      `SELECT repo_full_name, cloudflare_worker_name
       FROM github_repositories
       WHERE tenant_id = ? AND workspace_id = ?`,
    )
      .bind(authUser.tenant_id, authUser.workspace_id)
      .all();

    const linkedMap = Object.fromEntries(
      (linkedRows.results || []).map((r) => [r.repo_full_name, r.cloudflare_worker_name]),
    );

    return jsonResponse({
      repos: ghRepos.map((r) => ({
        full_name: r.full_name,
        name: r.name,
        owner: r.owner.login,
        private: r.private,
        pushed_at: r.pushed_at,
        default_branch: r.default_branch,
        linked_worker: linkedMap[r.full_name] || null,
      })),
    });
  }

  // ── POST /api/agent/git/clone — clone on healthy PTY lane + bind workspace_root ─
  if (path === '/api/agent/git/clone' && method === 'POST') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    const body = await request.json().catch(() => ({}));
    const { cloneGithubRepository } = await import('../core/github-clone.js');
    const out = await cloneGithubRepository(env, request, body);
    const status = out.status ?? (out.ok ? 200 : 500);
    return jsonResponse(out, status);
  }

  // ── /api/agent/git/sync ───────────────────────────────────────────────────
  if (path === '/api/agent/git/sync' && method === 'POST') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const body = await request.json().catch(() => ({}));
    let tenantId =
      authUser.tenant_id != null && String(authUser.tenant_id).trim() !== ''
        ? String(authUser.tenant_id).trim()
        : null;
    if (!tenantId) tenantId = await fetchAuthUserTenantId(env, authUser.id);
    if (!tenantId && authUser.email) tenantId = await fetchAuthUserTenantId(env, authUser.email);
    if (!tenantId) return jsonResponse({ error: 'Tenant not configured for this account' }, 403);
    const proposalId = 'prop_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    const now = Math.floor(Date.now() / 1000);
    const proposedBy = String(authUser.email || authUser.id || 'user').slice(0, 200);
    const iamOrigin = (env.IAM_ORIGIN || '').replace(/\/$/, '');
    const expGit = now + 86400;
    await env.DB.prepare(
      `INSERT INTO agentsam_approval_queue
       (id, tenant_id, workspace_id, user_id, session_id, tool_name, action_summary,
        risk_level, input_json, expires_at, status, approval_type, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      proposalId,
      tenantId,
      null,
      proposedBy,
      body.session_id || null,
      'git_sync_workflow',
      'User requested Git sync from dashboard.',
      'medium',
      JSON.stringify({
        command_text: 'GitHub sync workflow',
        filled_template: 'GitHub sync workflow',
        command_source: 'dashboard',
      }),
      expGit,
      'pending',
      'tool',
      now,
    ).run();
    notifySam(
      env,
      {
        subject: 'Git sync proposal pending',
        body: `Proposal: ${proposalId}\nApprove: ${iamOrigin}/dashboard/overview?proposal=${proposalId}`,
        category: 'proposal',
      },
      ctx,
    );
    return jsonResponse({ ok: true, proposal_id: proposalId, risk_level: 'medium' });
  }

  // ── POST /api/agent/git/publish — Workers Builds deploy hook (status-bar sync) ─
  if (path === '/api/agent/git/publish' && method === 'POST') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    const body = await request.json().catch(() => ({}));
    const { resolveTerminalWorkspaceId } = await import('../core/bootstrap.js');
    const tw = await resolveTerminalWorkspaceId(
      env,
      request,
      authUser,
      body.workspace_id != null ? String(body.workspace_id).trim() : null,
    );
    if (!tw.workspaceId) {
      return jsonResponse({ error: tw.error || 'workspace_missing' }, tw.error === 'Forbidden' ? 403 : 400);
    }
    const { postWorkersDeployHook, redactDeployHookUrl } = await import('../core/workers-deploy-hook.js');
    const workerName =
      body.worker_name != null ? String(body.worker_name).trim() : body.workerName != null
        ? String(body.workerName).trim()
        : null;
    const result = await postWorkersDeployHook(env, {
      workspaceId: tw.workspaceId,
      workerName: workerName || undefined,
    });
    if (result.error === 'deploy_hook_url not configured') {
      return jsonResponse({ error: result.error, workspace_id: tw.workspaceId }, 503);
    }
    if (result.error && result.status === 0) {
      return jsonResponse({ error: result.error, workspace_id: tw.workspaceId }, 400);
    }
    const buildUuid = result.json?.result?.build_uuid ?? result.json?.build_uuid ?? null;
    const httpOk = result.ok ? 200 : 502;
    return jsonResponse(
      {
        ok: result.ok,
        workspace_id: tw.workspaceId,
        worker_name: workerName,
        build_uuid: buildUuid,
        deploy_hook_url_redacted: redactDeployHookUrl(result.deploy_hook_url),
        deploy_hook_source: result.source ?? null,
        http_status: result.status,
        cloudflare: result.json ?? null,
        detail: result.raw ?? null,
        error: result.error ?? null,
      },
      httpOk,
    );
  }

  // ── /api/agent/boot ───────────────────────────────────────────────────────
  if (path === '/api/agent/boot') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    if (!identity?.tenantId) return jsonResponse({ error: 'unauthenticated' }, 401);
    try {
      const batch = await env.DB.batch([
        env.DB.prepare(`SELECT id, name, role_name, mode, thinking_mode, effort FROM agentsam_ai WHERE status='active' ORDER BY sort_order, name`),
        env.DB.prepare(`SELECT id, service_name, service_type, endpoint_url, is_active, health_status FROM mcp_services WHERE is_active=1 ORDER BY service_name`),
        env.DB.prepare(`SELECT id, model_key, provider, name,
            size_class AS role,
            size_class AS cost_tier,
            input_rate_per_mtok AS input_cost_per_1m,
            output_rate_per_mtok AS output_cost_per_1m,
            context_max_tokens AS context_window,
            supports_tools AS supports_function_calling,
            supports_vision,
            0 AS supports_reasoning
          FROM agentsam_ai
          WHERE mode = 'model' AND status = 'active'
            AND (is_global = 1 OR allowed_tenants_json LIKE ('%"' || ? || '"%'))
          ORDER BY provider, COALESCE(sort_order, 999), COALESCE(input_rate_per_mtok, 999999) ASC`).bind(identity.tenantId),
        env.DB.prepare(
          `SELECT id, COALESCE(trigger, 'chat') AS session_type, status, created_at AS started_at
           FROM agentsam_agent_run
           WHERE user_id = ? AND status IN ('running','queued')
           ORDER BY created_at DESC LIMIT 20`,
        ).bind(identity.userId),
      ]);
      return jsonResponse({ agents: batch[0]?.results||[], mcp_services: batch[1]?.results||[], models: batch[2]?.results||[], sessions: batch[3]?.results||[] });
    } catch (e) { return jsonResponse({ error: e.message }, 500); }
  }

  // ── /api/agent/conversations/search ──────────────────────────────────────
  if (path === '/api/agent/conversations/search' && method === 'GET') {
    if (!env.DB) return jsonResponse([]);
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    const userId = await resolveCanonicalUserId(String(authUser.id || ''), env).catch(() => String(authUser.id || ''));
    const q = (url.searchParams.get('q') || '').trim();
    if (!q) return jsonResponse([]);
    const like = `%${q.replace(/%/g,'\\%').replace(/_/g,'\\_')}%`;
    const { results } = await env.DB.prepare(
      `SELECT id, COALESCE(name,title,'') as title FROM agent_conversations
       WHERE user_id = ? AND (name LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\')
       ORDER BY id DESC LIMIT 20`,
    ).bind(userId, like, like).all().catch(() => ({ results: [] }));
    return jsonResponse((results||[]).map(r=>({ id: r.id, title: r.title||'New Conversation' })));
  }

  // ── /api/agent/sessions/:id/outbox ───────────────────────────────────────
  const sessOutboxMatch = path.match(/^\/api\/agent\/sessions\/([^/]+)\/outbox$/);
  if (sessOutboxMatch && (method === 'GET' || method === 'POST')) {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    const convId = decodeURIComponent(sessOutboxMatch[1] || '').trim();
    if (!convId) return jsonResponse({ error: 'session id required' }, 400);
    if (!env.AGENT_SESSION) return jsonResponse({ error: 'AGENT_SESSION not configured' }, 503);

    const turnId = (url.searchParams.get('turn_id') || '').trim();
    if (!turnId) return jsonResponse({ error: 'turn_id required' }, 400);

    const stub = env.AGENT_SESSION.get(env.AGENT_SESSION.idFromName(convId));
    if (method === 'POST') {
      const body = await request.json().catch(() => ({}));
      return stub.fetch(
        new Request('https://do/outbox', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
      );
    }

    if (url.searchParams.get('stream') === '1') {
      const sinceSeq = url.searchParams.get('since_seq') || '0';
      return stub.fetch(
        new Request(
          `https://do/outbox/stream?turn_id=${encodeURIComponent(turnId)}&since_seq=${encodeURIComponent(sinceSeq)}`,
        ),
      );
    }

    const sinceSeq = url.searchParams.get('since_seq') || '0';
    const limit = url.searchParams.get('limit') || '500';
    return stub.fetch(
      new Request(
        `https://do/outbox?turn_id=${encodeURIComponent(turnId)}&since_seq=${encodeURIComponent(sinceSeq)}&limit=${encodeURIComponent(limit)}`,
      ),
    );
  }

  // ── /api/agent/sessions/:id/messages ─────────────────────────────────────
  const sessMessagesMatch = path.match(/^\/api\/agent\/sessions\/([^/]+)\/messages$/);
  if (sessMessagesMatch && method === 'GET') {
    const convId = decodeURIComponent(sessMessagesMatch[1] || '').trim();
    if (!convId) return jsonResponse({ error: 'session id required' }, 400);
    if (env.AGENT_SESSION) {
      try {
        const doId = env.AGENT_SESSION.idFromName(convId);
        const stub = env.AGENT_SESSION.get(doId);
        const lim  = url.searchParams.get('limit') || '100';
        const resp = await stub.fetch(new Request(`https://do/history?limit=${encodeURIComponent(lim)}`));
        const rows = await resp.json().catch(() => []);
        const list = Array.isArray(rows) ? rows : (rows?.messages || []);
        if (list.length > 0) return jsonResponse(list);
      } catch (_) {}
    }
    // R2 primary storage — fetch messages.jsonl
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    const messages = await getChatMessages(env, convId);
    if (messages.length > 0) return jsonResponse(messages);
    if (env.AGENT_SESSION) {
      try {
        const doId = env.AGENT_SESSION.idFromName(convId);
        const stub = env.AGENT_SESSION.get(doId);
        const lim = url.searchParams.get('limit') || '100';
        const resp = await stub.fetch(new Request(`https://do/history?limit=${encodeURIComponent(lim)}`));
        const rows = await resp.json().catch(() => []);
        const list = Array.isArray(rows) ? rows : (rows?.messages || []);
        return jsonResponse(list);
      } catch (_) {}
    }
    return jsonResponse([]);
  }

  // ── /api/agent/sessions PATCH / DELETE /:id ───────────────────────────────
  const sessionPatchMatch = path.match(/^\/api\/agent\/sessions\/([^/]+)$/);
  if (sessionPatchMatch && (method === 'PATCH' || method === 'DELETE')) {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    let tenantId =
      authUser.tenant_id != null && String(authUser.tenant_id).trim() !== ''
        ? String(authUser.tenant_id).trim()
        : null;
    if (!tenantId) tenantId = await fetchAuthUserTenantId(env, authUser.id);
    if (!tenantId && authUser.email) tenantId = await fetchAuthUserTenantId(env, authUser.email);
    if (!tenantId) return jsonResponse({ error: 'Tenant not configured for this account' }, 403);
    const userId = await resolveCanonicalUserId(String(authUser.id || ''), env).catch(() => String(authUser.id || ''));
    const convId = decodeURIComponent(sessionPatchMatch[1] || '').trim();

    if (method === 'DELETE') {
      const deleteResult = await deleteUserChatSession(env, {
        conversationId: convId,
        userId,
        tenantId,
      });
      if (!deleteResult.ok) {
        const status = deleteResult.error === 'not_found' ? 404 : 400;
        return jsonResponse({ error: deleteResult.error || 'delete_failed' }, status);
      }
      return jsonResponse({ success: true, deleted: true });
    }

    const body = await request.json().catch(() => ({}));
    const patchResult = await patchUserChatSession(env, {
      conversationId: convId,
      userId,
      tenantId,
      patch: body,
    });
    if (!patchResult.ok) {
      const status = patchResult.error === 'not_found' ? 404 : 400;
      return jsonResponse({ error: patchResult.error || 'patch_failed' }, status);
    }
    if (patchResult.deleted) {
      return jsonResponse({ success: true, deleted: true });
    }
    return jsonResponse({ success: true });
  }

  // ── /api/agent/sessions ───────────────────────────────────────────────────
  if (path === '/api/agent/sessions') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    let tenantId =
      authUser.tenant_id != null && String(authUser.tenant_id).trim() !== ''
        ? String(authUser.tenant_id).trim()
        : null;
    if (!tenantId) tenantId = await fetchAuthUserTenantId(env, authUser.id);
    if (!tenantId && authUser.email) tenantId = await fetchAuthUserTenantId(env, authUser.email);
    if (!tenantId) return jsonResponse({ error: 'Tenant not configured for this account' }, 403);
    const userId = await resolveCanonicalUserId(String(authUser.id || ''), env).catch(() => String(authUser.id || ''));
    if (method === 'POST') {
      const body   = await request.json().catch(() => ({}));
      const id     = crypto.randomUUID();
      const name   = (typeof body.name === 'string' && body.name.trim()) ? body.name.trim() : 'New Conversation';
      const wsId =
        authUser.active_workspace_id != null && String(authUser.active_workspace_id).trim() !== ''
          ? String(authUser.active_workspace_id).trim()
          : null;
      await env.DB.prepare(
        `INSERT INTO agentsam_agent_run (
           id, user_id, workspace_id, tenant_id, conversation_id, status, trigger, created_at, started_at
         ) VALUES (?,?,?,?,?,?,?,datetime('now'),datetime('now'))`,
      )
        .bind(id, userId, wsId, tenantId, id, 'running', body.session_type || 'chat')
        .run()
        .catch(() => {});
      // Init R2 primary storage for this session (non-blocking)
      initChatSessionR2(env, {
        conversationId: id,
        userId,
        workspaceId: wsId,
        tenantId,
        title: name,
        modelKey: body.model_key ?? body.modelKey ?? null,
      }).catch(() => {});
      return jsonResponse({ id, status: 'active' });
    }
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '40', 10) || 40, 1), 200);
    const projectId = url.searchParams.get('project_id') || url.searchParams.get('projectId') || null;
    const workspaceId =
      url.searchParams.get('workspace_id') ||
      (authUser.active_workspace_id ? String(authUser.active_workspace_id) : null);
    const results = await listUserChatSessions(env, { userId, tenantId, limit, projectId, workspaceId });
    return jsonResponse(results);
  }

  // ── /api/agent/workspace/:id ──────────────────────────────────────────────
  const workspaceMatch = path.match(/^\/api\/agent\/workspace\/([^/]+)$/);
  if (workspaceMatch) {
    const wsId = decodeURIComponent(workspaceMatch[1] || '').trim();
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

    // ── /api/agent/workspace/:id ────────────────────────────────────────────
    // ── /api/agent/workspace/:id ────────────────────────────────────────────
    if (method === 'GET') {
      try {
        const userId = String(authUser?.id || 'anonymous').trim();
        let tid =
          authUser?.tenant_id != null && String(authUser.tenant_id).trim() !== ''
            ? String(authUser.tenant_id).trim()
            : '';
        if (!tid) tid = (await fetchAuthUserTenantId(env, authUser.id)) || '';
        if (!tid && authUser.email) tid = (await fetchAuthUserTenantId(env, authUser.email)) || '';
        if (!tid) return jsonResponse({ error: 'Tenant not configured for this account' }, 403);

        const safeJson = (v) => {
          if (!v) return {};
          if (typeof v === 'object' && v !== null) return v;
          try { return JSON.parse(String(v)); } catch { return {}; }
        };
        const parseFilesOpen = (raw) => {
          if (Array.isArray(raw)) return raw;
          try {
            const parsed = JSON.parse(String(raw || '[]'));
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        };

        const isWorkspaceKey = /^ws_/i.test(wsId);

        // Platform workspace id (ws_*) — resume spine from agentsam_workspace_state.workspace_id.
        if (isWorkspaceKey) {
          const canWs = await userCanAccessWorkspace(env, authUser, wsId).catch(() => false);
          if (!canWs) return jsonResponse({ error: 'Forbidden' }, 403);

          const awsRow = await env.DB.prepare(
            `SELECT workspace_id, conversation_id, active_file, files_open, state_json, updated_at, created_at
             FROM agentsam_workspace_state
             WHERE workspace_id = ?
             LIMIT 1`,
          )
            .bind(wsId)
            .first()
            .catch(() => null);

          const stateObj = safeJson(awsRow?.state_json);
          const stateJsonStr =
            typeof awsRow?.state_json === 'string' && awsRow.state_json.trim()
              ? awsRow.state_json
              : JSON.stringify(stateObj || {});

          if (!awsRow) {
            return jsonResponse({
              workspace_id: wsId,
              exists: false,
              conversation_id: null,
              active_file: null,
              files_open: [],
              updated_at: null,
              created_at: null,
            });
          }

          return jsonResponse({
            id: wsId,
            workspace_id: wsId,
            exists: true,
            conversation_id: awsRow.conversation_id ?? null,
            active_file: awsRow.active_file ?? null,
            files_open: parseFilesOpen(awsRow.files_open),
            updated_at: awsRow.updated_at ?? null,
            created_at: awsRow.created_at ?? null,
            name: 'Workspace',
            environment: 'local',
            status: 'active',
            settings: {},
            state: stateObj,
            state_json: stateJsonStr,
          });
        }

        // Conversation-scoped IDE bundle (UUID) — legacy uws:* row id.
        const uwsId = `uws:${tid}:${userId}:${wsId}`;
        const personalWs = await env.DB.prepare(
          `SELECT state_json, updated_at, conversation_id, active_file, files_open, workspace_id
           FROM agentsam_workspace_state WHERE id = ? LIMIT 1`,
        )
          .bind(uwsId)
          .first()
          .catch(() => null);

        if (personalWs) {
          const stateObj = safeJson(personalWs.state_json);
          const stateJsonStr =
            typeof personalWs.state_json === 'string' && personalWs.state_json.trim()
              ? personalWs.state_json
              : JSON.stringify(stateObj || {});
          return jsonResponse({
            id: wsId,
            workspace_id: personalWs.workspace_id ?? null,
            conversation_id: personalWs.conversation_id ?? wsId,
            active_file: personalWs.active_file ?? null,
            files_open: parseFilesOpen(personalWs.files_open),
            updated_at: personalWs.updated_at ?? null,
            name: 'Personal',
            environment: 'local',
            status: 'active',
            settings: {},
            state: stateObj,
            state_json: stateJsonStr,
          });
        }

        const globalWs = await env.DB.prepare(
          `SELECT * FROM workspaces WHERE id = ? OR handle = ? LIMIT 1`,
        )
          .bind(wsId, wsId)
          .first()
          .catch(() => null);

        if (globalWs) {
          const stateObj = safeJson(globalWs.state_json);
          const stateJsonStr =
            typeof globalWs.state_json === 'string' && globalWs.state_json.trim()
              ? globalWs.state_json
              : JSON.stringify(stateObj || {});
          return jsonResponse({
            id: globalWs.id,
            workspace_id: globalWs.id,
            conversation_id: null,
            active_file: null,
            files_open: [],
            updated_at: null,
            name: globalWs.name || 'Workspace',
            environment: globalWs.environment || 'local',
            status: globalWs.status || 'active',
            settings: safeJson(globalWs.settings_json),
            state: stateObj,
            state_json: stateJsonStr,
          });
        }

        return jsonResponse({ workspace_id: wsId, exists: false }, 200);
      } catch (e) {
        return jsonResponse({ error: `Fetch error: ${e.message}` }, 500);
      }
    }

    if (method === 'PUT') {
      try {
        const body = await request.json().catch(() => ({}));
        const state = body.state || body.state_json;
        const stateStr = typeof state === 'string' ? state : JSON.stringify(state || {});

        const userId = String(authUser?.id || 'anonymous').trim();
        let tid =
          authUser?.tenant_id != null && String(authUser.tenant_id).trim() !== ''
            ? String(authUser.tenant_id).trim()
            : '';
        if (!tid) tid = (await fetchAuthUserTenantId(env, authUser.id)) || '';
        if (!tid && authUser.email) tid = (await fetchAuthUserTenantId(env, authUser.email)) || '';
        if (!tid) return jsonResponse({ error: 'Tenant not configured for this account' }, 403);

        if (/^ws_/i.test(wsId)) {
          const canWs = await userCanAccessWorkspace(env, authUser, wsId).catch(() => false);
          if (!canWs) return jsonResponse({ error: 'Forbidden' }, 403);
          await env.DB.prepare(
            `INSERT INTO agentsam_workspace_state (
               id, workspace_id, state_json, workspace_type, created_at, updated_at
             ) VALUES ('wss_' || lower(hex(randomblob(8))), ?, ?, 'ide', unixepoch(), unixepoch())
             ON CONFLICT(workspace_id) DO UPDATE SET
               state_json = excluded.state_json,
               updated_at = unixepoch()`,
          )
            .bind(wsId, stateStr)
            .run();
          return jsonResponse({ ok: true, id: wsId, workspace_id: wsId });
        }

        const uwsId = `uws:${tid}:${userId}:${wsId}`;
        try {
          if (env.DB) {
            const upsertConversationWorkspaceState = async () => {
              const existing = await env.DB.prepare(
                `SELECT id FROM agentsam_workspace_state WHERE id = ? LIMIT 1`,
              )
                .bind(uwsId)
                .first()
                .catch(() => null);
              if (existing) {
                await env.DB.prepare(
                  `UPDATE agentsam_workspace_state SET state_json = ?, updated_at = unixepoch() WHERE id = ?`,
                )
                  .bind(stateStr, uwsId)
                  .run();
                return;
              }
              const workspaceRow = await env.DB.prepare(
                `SELECT id FROM agentsam_workspace WHERE id = ? LIMIT 1`,
              )
                .bind(wsId)
                .first()
                .catch(() => null);
              if (!workspaceRow) return;
              let conversationId = null;
              const convCandidate = String(wsId || '').trim();
              if (convCandidate) {
                const convRow = await env.DB.prepare(
                  `SELECT conversation_id FROM agentsam_chat_sessions WHERE conversation_id = ? LIMIT 1`,
                )
                  .bind(convCandidate)
                  .first()
                  .catch(() => null);
                if (convRow) conversationId = convCandidate;
              }
              await env.DB.prepare(
                `INSERT INTO agentsam_workspace_state (id, workspace_id, state_json, conversation_id, workspace_type, created_at, updated_at)
                 VALUES (?, ?, ?, ?, 'ide', unixepoch(), unixepoch())`,
              )
                .bind(uwsId, wsId, stateStr, conversationId)
                .run();
            };
            const results = await Promise.allSettled([
              env.DB.prepare(`UPDATE workspaces SET state_json = ?, updated_at = datetime('now') WHERE id = ?`)
                .bind(stateStr, wsId).run(),
              upsertConversationWorkspaceState(),
            ]);
            results.forEach((r, i) => {
              if (r.status === 'rejected') {
                console.warn('[agent] workspace update op', i, 'rejected:', r.reason);
              }
            });
          }
        } catch (dbErr) {
          console.warn('[agent] non-critical workspace update failure:', dbErr.message);
        }

        return jsonResponse({ ok: true, id: wsId });
      } catch (e) {
        console.error('[agent] workspace PUT error:', e.stack);
        return jsonResponse({ error: e.message }, 500);
      }
    }

    if (method === 'POST') {
      const isAgentsamWs = /^ws_/i.test(wsId);
      if (!isAgentsamWs) {
        return jsonResponse(
          { error: 'Use PUT for conversation workspace snapshots; POST merge is for ws_* workspace ids.' },
          400,
        );
      }
      try {
        const bodyPost = await request.json().catch(() => ({}));
        if (!bodyPost || typeof bodyPost !== 'object') return jsonResponse({ error: 'Invalid JSON' }, 400);
        let awsRow = null;
        try {
          awsRow = await env.DB.prepare(
            `SELECT id, state_json FROM agentsam_workspace_state WHERE workspace_id = ? OR id = ? ORDER BY updated_at DESC LIMIT 1`,
          )
            .bind(wsId, wsId)
            .first();
        } catch (_) {
          awsRow = null;
        }
        const safeJsonState = (v) => {
          if (!v) return {};
          if (typeof v === 'object' && v !== null) return v;
          try { return JSON.parse(String(v)); } catch { return {}; }
        };
        const stringifyState = (state) => (typeof state === 'string' ? state : JSON.stringify(state || {}));
        const cur = safeJsonState(awsRow?.state_json);
        const patch = {};
        for (const k of ['active_agent_slug', 'active_agent_panel', 'last_agent_action', 'agent_id']) {
          if (Object.prototype.hasOwnProperty.call(bodyPost, k) && bodyPost[k] != null) patch[k] = bodyPost[k];
        }
        const merged = { ...cur, ...patch };
        const mergedStr = stringifyState(merged);
        if (awsRow?.id) {
          await env.DB.prepare(
            `UPDATE agentsam_workspace_state SET state_json = ?, updated_at = unixepoch() WHERE id = ?`,
          )
            .bind(mergedStr, awsRow.id)
            .run();
        } else {
          const nid = `aws_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
          try {
            await env.DB.prepare(
              `INSERT INTO agentsam_workspace_state (id, workspace_id, state_json, updated_at) VALUES (?,?,?,unixepoch())`,
            )
              .bind(nid, wsId, mergedStr)
              .run();
          } catch (e3) {
            console.warn('[agent/workspace] agentsam POST insert', e3?.message ?? e3);
            return jsonResponse({ error: 'agentsam_workspace_state write failed' }, 503);
          }
        }
        return jsonResponse({ ok: true, id: wsId });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }
  }

  // Legacy fallback; production GET /api/agent/terminal/config-status is handled by src/api/dashboard.js through production-dispatch before this handler.
  // ── /api/agent/terminal/config-status ────────────────────────────────────
  if (path === '/api/agent/terminal/config-status' && method === 'GET') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!authUserIsSuperadmin(authUser)) {
      return jsonResponse({
        terminal_enabled: false,
        terminal_configured: false,
      });
    }
    if (!env.DB)   return jsonResponse({ terminal_enabled: true, terminal_configured: false });
    try {
      const row = await env.DB.prepare(
        `SELECT id, tunnel_url, shell, cwd, cols, rows
         FROM terminal_sessions
         WHERE user_id = ? AND status = 'active'
           AND tunnel_url IS NOT NULL AND tunnel_url != ''
         ORDER BY updated_at DESC LIMIT 1`
      ).bind(String(authUser.id)).first().catch(() => null);
      if (!row) return jsonResponse({ terminal_enabled: true, terminal_configured: false });
      return jsonResponse({
        terminal_enabled: true,
        terminal_configured: true,
        tunnel_url: row.tunnel_url,
        shell:      row.shell || 'bash',
        cwd:        row.cwd   || '~',
        cols:       row.cols  || 220,
        rows:       row.rows  || 50,
      });
    } catch (e) {
      return jsonResponse({ terminal_enabled: true, terminal_configured: false, error: e.message });
    }
  }

  // ── /api/agent/propose ────────────────────────────────────────────────────
  if (path === '/api/agent/propose' && method === 'POST') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);
    const body        = await request.json().catch(() => ({}));
    const commandText = String(body.command_text || body.command || '').trim();
    if (!commandText) return jsonResponse({ error: 'command_text required' }, 400);
    let tenantId =
      authUser.tenant_id != null && String(authUser.tenant_id).trim() !== ''
        ? String(authUser.tenant_id).trim()
        : null;
    if (!tenantId) tenantId = await fetchAuthUserTenantId(env, authUser.id);
    if (!tenantId && authUser.email) tenantId = await fetchAuthUserTenantId(env, authUser.email);
    if (!tenantId) return jsonResponse({ error: 'Tenant not configured for this account' }, 403);
    const proposalId = 'prop_' + crypto.randomUUID().replace(/-/g,'').slice(0,16);
    const now        = Math.floor(Date.now() / 1000);
    const expProp    = now + 86400;
    const iamOrigin  = (env.IAM_ORIGIN || '').replace(/\/$/,'');
    await env.DB.prepare(
      `INSERT INTO agentsam_approval_queue
       (id, tenant_id, workspace_id, user_id, session_id, tool_name, action_summary,
        risk_level, input_json, expires_at, status, approval_type, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      proposalId,
      tenantId,
      null,
      String(authUser.email || authUser.id || 'iam_agent').slice(0, 200),
      body.session_id || null,
      String(body.command_name || 'proposed').slice(0, 200),
      String(body.rationale || 'Agent proposed command').slice(0, 8000),
      'medium',
      JSON.stringify({
        command_text: commandText,
        filled_template: commandText,
        command_source: 'agent_generated',
      }),
      expProp,
      'pending',
      'tool',
      now,
    ).run();
    notifySam(env, { subject: `Proposal pending: ${commandText.slice(0,80)}`, body: `ID: ${proposalId}\nApprove: ${iamOrigin}/dashboard/overview?proposal=${proposalId}`, category: 'proposal' }, ctx);
    return jsonResponse({ ok: true, proposal_id: proposalId });
  }

  // ── /api/agent/proposals/pending ─────────────────────────────────────────
  if (path === '/api/agent/proposals/pending' && method === 'GET') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse([]);
    const uid = String(authUser.id || '').trim();
    const wsQ = String(url.searchParams.get('workspace_id') || '').trim();
    const tid = String(authUser.tenant_id || '').trim();
    let sql = `SELECT q.id, q.tenant_id, q.session_id AS agent_session_id, q.user_id AS proposed_by,
              q.tool_name AS command_name,
              COALESCE(json_extract(q.input_json, '$.command_text'), q.action_summary) AS command_text,
              q.input_json AS filled_template, q.action_summary AS rationale, q.risk_level, q.status,
              q.created_at
       FROM agentsam_approval_queue q
       WHERE q.status = 'pending' AND q.user_id = ?`;
    const binds = [uid];
    if (wsQ) {
      sql += ` AND (q.workspace_id = ? OR (q.workspace_id IS NULL AND q.tenant_id = ?))`;
      binds.push(wsQ, tid);
    }
    sql += ` ORDER BY q.created_at DESC`;
    const { results } = await env.DB.prepare(sql).bind(...binds).all().catch(() => ({ results: [] }));
    return jsonResponse(results || []);
  }

  const propApproveMatch = path.match(/^\/api\/agent\/proposals\/([^/]+)\/approve$/);
  if (propApproveMatch && method === 'POST') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);
    const propId   = propApproveMatch[1];
    const row = await env.DB
      .prepare(`SELECT id, tool_name AS tool, command_run_id FROM agentsam_approval_queue WHERE id = ?`)
      .bind(propId)
      .first();
    if (!row) return jsonResponse({ error: 'Not found' }, 404);
    const approver = String(authUser.email || authUser.id).slice(0, 200);
    const now = Math.floor(Date.now() / 1000);
    await env.DB
      .prepare(`UPDATE agentsam_approval_queue SET status='approved', approved_by=?, decided_at=? WHERE id=?`)
      .bind(approver, now, propId)
      .run();
    const crid = row.command_run_id != null ? String(row.command_run_id).trim() : '';
    if (crid) {
      await env.DB
        .prepare(`UPDATE agentsam_command_run SET approval_status = 'approved' WHERE id = ?`)
        .bind(crid)
        .run()
        .catch(() => null);
    }
    return jsonResponse({ ok: true, proposal_id: propId });
  }

  const propDenyMatch = path.match(/^\/api\/agent\/proposals\/([^/]+)\/deny$/);
  if (propDenyMatch && method === 'POST') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);
    const propId   = propDenyMatch[1];
    await request.json().catch(() => ({}));
    const row      = await env.DB
      .prepare(`SELECT id, command_run_id, input_json, execution_step_id FROM agentsam_approval_queue WHERE id = ?`)
      .bind(propId)
      .first();
    if (!row) return jsonResponse({ error: 'Not found' }, 404);
    const denier   = String(authUser.email || authUser.id).slice(0,200);
    const now      = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      `UPDATE agentsam_approval_queue SET status='denied', approved_by=?, decided_at=? WHERE id=?`,
    ).bind(denier, now, propId).run();
    const crid = row.command_run_id != null ? String(row.command_run_id).trim() : '';
    if (crid) {
      await env.DB
        .prepare(`UPDATE agentsam_command_run SET approval_status = 'denied' WHERE id = ?`)
        .bind(crid)
        .run()
        .catch(() => null);
    }
    let inj = {};
    try {
      inj = JSON.parse(String(row.input_json || '{}'));
    } catch {
      inj = {};
    }
    const ptid = inj.plan_task_id != null ? String(inj.plan_task_id).trim() : '';
    const esid = inj.execution_step_id != null ? String(inj.execution_step_id).trim() : '';
    const denyNote = '[terminal] Denied — no command execution.';
    if (ptid) {
      await env.DB
        .prepare(
          `UPDATE agentsam_plan_tasks SET status='skipped', completed_at=unixepoch(), output_summary=? WHERE id=?`,
        )
        .bind(denyNote, ptid)
        .run()
        .catch(() => null);
      const prow = await env.DB
        .prepare(`SELECT plan_id FROM agentsam_plan_tasks WHERE id = ? LIMIT 1`)
        .bind(ptid)
        .first()
        .catch(() => null);
      if (prow?.plan_id) {
        scheduleMirrorAgentsamPlanToSupabasePublic(env, ctx, String(prow.plan_id));
      }
    }
    const esTarget = esid || (row.execution_step_id != null ? String(row.execution_step_id).trim() : '');
    if (esTarget) {
      await env.DB
        .prepare(
          `UPDATE agentsam_execution_steps SET status='failed', output_json=?, error_json=? WHERE id=?`,
        )
        .bind(
          JSON.stringify({ denied: true, approval_id: propId }),
          JSON.stringify({ error: denyNote }),
          esTarget,
        )
        .run()
        .catch(() => null);
    }
    return jsonResponse({ ok: true, proposal_id: propId, status: 'denied' });
  }

  // ── /api/agent/approval/pending ───────────────────────────────────────────
  if (method === 'GET' && path === '/api/agent/approval/pending') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401, { 'Cache-Control': 'no-store' });
    const workspaceId = String(url.searchParams.get('workspace_id') || '').trim();
    if (!workspaceId) {
      return jsonResponse({ pending: [] }, 200, { 'Cache-Control': 'no-store' });
    }
    const runId = String(url.searchParams.get('run_id') || '').trim();
    /** When set, only queue rows for this Agent chat session (excludes orphan / background rows with NULL session_id). */
    const sessionId = String(url.searchParams.get('session_id') || '').trim();
    if (!env.DB) {
      return jsonResponse({ approval: null, pending_count: 0 }, 200, { 'Cache-Control': 'no-store' });
    }
    const uid = String(authUser.id || '').trim();
    const tid = String(authUser.tenant_id || '').trim();
    const scopeBinds = [uid, workspaceId, tid];
    const runBinds = runId ? [runId, runId, runId] : [];
    const runFilterTable = runId
      ? ` AND (workflow_run_id = ? OR session_id = ? OR command_run_id = ?)`
      : '';
    const runFilterAlias = runId
      ? ` AND (q.workflow_run_id = ? OR q.session_id = ? OR q.command_run_id = ?)`
      : '';
    const sessionFilterTable = sessionId ? ` AND session_id = ?` : '';
    const sessionFilterAlias = sessionId ? ` AND q.session_id = ?` : '';
    const sessionBinds = sessionId ? [sessionId] : [];

    const countRow = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM agentsam_approval_queue
       WHERE status='pending' AND user_id = ?
         AND (workspace_id = ? OR (workspace_id IS NULL AND tenant_id = ?))${runFilterTable}${sessionFilterTable}`,
    )
      .bind(...scopeBinds, ...runBinds, ...sessionBinds)
      .first()
      .catch(() => ({ c: 0 }));
    const pendingCount = Number(countRow?.c || 0) || 0;

    const row = await env.DB.prepare(
      `SELECT q.id, q.tool_name, q.action_summary AS description, q.risk_level, q.input_json,
              0 AS is_mcp_server, NULL AS server_display_name
       FROM agentsam_approval_queue q
       WHERE q.status='pending' AND q.user_id = ?
         AND (q.workspace_id = ? OR (q.workspace_id IS NULL AND q.tenant_id = ?))${runFilterAlias}${sessionFilterAlias}
       ORDER BY q.created_at ASC LIMIT 1`,
    )
      .bind(...scopeBinds, ...runBinds, ...sessionBinds)
      .first()
      .catch(() => null);
    if (!row) {
      return jsonResponse({ approval: null, pending_count: pendingCount }, 200, { 'Cache-Control': 'no-store' });
    }
    const input = JSON.parse(row.input_json || '{}');
    return jsonResponse(
      {
        approval: {
          ...row,
          queue_count: pendingCount,
          preview_sql: input.sql ?? null,
          preview_command: input.command ?? null,
        },
        pending_count: pendingCount,
      },
      200,
      { 'Cache-Control': 'no-store' },
    );
  }

  const approvalApprovePost = path.match(/^\/api\/agent\/approval\/([^/]+)\/approve$/);
  if (approvalApprovePost && method === 'POST') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const apId = approvalApprovePost[1];
    const row = await env.DB
      .prepare(`SELECT id FROM agentsam_approval_queue WHERE id = ?`)
      .bind(apId)
      .first();
    if (!row) return jsonResponse({ error: 'Not found' }, 404);
    const approver = String(authUser.id || authUser.email || '').slice(0, 200);
    await env.DB
      .prepare(
        `UPDATE agentsam_approval_queue SET status='approved', approved_by=?, decided_at=unixepoch() WHERE id=?`,
      )
      .bind(approver, apId)
      .run();
    return jsonResponse({ ok: true, approval_id: apId });
  }

  const approvalDenyPost = path.match(/^\/api\/agent\/approval\/([^/]+)\/deny$/);
  if (approvalDenyPost && method === 'POST') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const apId = approvalDenyPost[1];
    const row = await env.DB
      .prepare(`SELECT id FROM agentsam_approval_queue WHERE id = ?`)
      .bind(apId)
      .first();
    if (!row) return jsonResponse({ error: 'Not found' }, 404);
    const denier = String(authUser.id || authUser.email || '').slice(0, 200);
    await env.DB
      .prepare(
        `UPDATE agentsam_approval_queue SET status='denied', approved_by=?, decided_at=unixepoch() WHERE id=?`,
      )
      .bind(denier, apId)
      .run();
    return jsonResponse({ ok: true, approval_id: apId });
  }

  // ── PATCH /api/agent/approval/:id ─────────────────────────────────────────
  const approvalMatch = path.match(/^\/api\/agent\/approval\/([^/]+)$/);
  if (method === 'PATCH' && approvalMatch) {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const { status } = await request.json().catch(() => ({}));
    if (!['approved', 'denied'].includes(status)) return jsonResponse({ error: 'invalid status' }, 400);
    const apId = approvalMatch[1];
    const prev = await env.DB
      .prepare(`SELECT command_run_id FROM agentsam_approval_queue WHERE id = ?`)
      .bind(apId)
      .first()
      .catch(() => null);
    await env.DB
      .prepare(`UPDATE agentsam_approval_queue SET status=?, decided_at=unixepoch(), approved_by=? WHERE id=?`)
      .bind(status, String(authUser.email || authUser.id).slice(0, 200), apId)
      .run();
    if (status === 'approved' && prev?.command_run_id) {
      const cr = String(prev.command_run_id).trim();
      if (cr) {
        await env.DB
          .prepare(`UPDATE agentsam_command_run SET approval_status = 'approved' WHERE id = ?`)
          .bind(cr)
          .run()
          .catch(() => null);
      }
    }
    return jsonResponse({ ok: true });
  }

  // ── POST /api/agent/allowlist — ToolApprovalModal “Allow always” (session-scoped workspace)
  if (method === 'POST' && path === '/api/agent/allowlist') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const body = await request.json().catch(() => ({}));
    const command = body.command != null ? String(body.command).trim() : '';
    if (!command) return jsonResponse({ error: 'command required' }, 400);

    const actorCtx = await resolveIamActorContext(request, env).catch(() => null);
    const uid = String(actorCtx?.userId || authUser.id || '').trim();
    if (!uid) return jsonResponse({ error: 'Unauthorized' }, 401);

    const bodyWs = body.workspace_id != null ? String(body.workspace_id).trim() : '';
    const sessionWs = String(actorCtx?.workspaceId || '').trim();
    const wsId =
      bodyWs && sessionWs && bodyWs === sessionWs ? bodyWs : sessionWs;
    if (!wsId) return jsonResponse({ error: 'workspace required' }, 400);

    const id = `acl_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

    await env.DB
      .prepare(
        `INSERT INTO agentsam_command_allowlist (id, user_id, workspace_id, command, created_at)
         VALUES (?, ?, ?, ?, datetime('now'))
         ON CONFLICT(user_id, workspace_id, command) DO NOTHING`,
      )
      .bind(id, uid, wsId, command)
      .run();

    const patId = `acp_${id}`;
    try {
      await env.DB
        .prepare(
          `INSERT OR IGNORE INTO agentsam_command_pattern
           (id, workspace_id, pattern, pattern_type, mapped_command,
            description, category, risk_level, requires_confirmation, is_active)
           VALUES (?, ?, ?, 'exact', ?, 'iam_tool_approval_allowlist', 'misc', 'low', 0, 1)`,
        )
        .bind(patId, wsId, command, command)
        .run();
    } catch {
      /* FK / duplicate — non-fatal */
    }

    return jsonResponse({ ok: true });
  }

  // ── POST /api/agent/plan/intake/submit — Continue/Skip on Questions card (SSE → plan_created) ──
  if (path === '/api/agent/plan/intake/submit' && method === 'POST') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const body = await request.json().catch(() => ({}));
    const batchId = String(body.batch_id ?? body.batchId ?? '').trim();
    if (!batchId) return jsonResponse({ error: 'batch_id required' }, 400);

    const reqCtx = await resolveRequestContext(request, env);
    if (reqCtx.error || !reqCtx.workspaceId) {
      return jsonResponse({ error: 'no_workspace', redirect: '/onboarding' }, 403);
    }
    const workspaceId = String(reqCtx.workspaceId).trim();

    let tenantId =
      authUser.tenant_id != null && String(authUser.tenant_id).trim() !== ''
        ? String(authUser.tenant_id).trim()
        : null;
    if (!tenantId) tenantId = await fetchAuthUserTenantId(env, authUser.id);

    const batch = await env.DB.prepare(
      `SELECT id, tenant_id, workspace_id FROM agentsam_plan_intake_batches WHERE id = ? LIMIT 1`,
    )
      .bind(batchId)
      .first()
      .catch(() => null);
    if (!batch?.id) return jsonResponse({ error: 'batch_not_found' }, 404);
    if (String(batch.tenant_id || '') !== String(tenantId || '')) {
      return jsonResponse({ error: 'Forbidden' }, 403);
    }
    if (String(batch.workspace_id || '') !== workspaceId) {
      return jsonResponse({ error: 'workspace_mismatch' }, 403);
    }

    const uid = String(authUser.id || '').trim();
    const { startPlanIntakeSubmitSseResponse } = await import('../core/plan-intake-stream.js');
    return startPlanIntakeSubmitSseResponse(env, ctx, {
      request,
      batchId,
      selections: body.selections && typeof body.selections === 'object' ? body.selections : {},
      optionalDetails: body.optional_details ?? body.optionalDetails ?? '',
      skip: body.skip === true,
      userId: uid,
      workspaceId,
      tenantId,
      sessionId: body.sessionId ?? body.session_id ?? null,
    });
  }

  // ── POST /api/agent/plan/revert — reset blocked tasks to todo (start over) ──
  if (path === '/api/agent/plan/revert' && method === 'POST') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const body = await request.json().catch(() => ({}));
    const planId = String(body.plan_id ?? body.planId ?? '').trim();
    if (!planId) return jsonResponse({ error: 'plan_id required' }, 400);

    const reqCtx = await resolveRequestContext(request, env);
    if (reqCtx.error || !reqCtx.workspaceId) {
      return jsonResponse({ error: 'no_workspace', redirect: '/onboarding' }, 403);
    }
    const workspaceId = String(reqCtx.workspaceId).trim();

    let tenantId =
      authUser.tenant_id != null && String(authUser.tenant_id).trim() !== ''
        ? String(authUser.tenant_id).trim()
        : null;
    if (!tenantId) tenantId = await fetchAuthUserTenantId(env, authUser.id);

    const planRow = await env.DB.prepare(
      `SELECT id, tenant_id, workspace_id FROM agentsam_plans WHERE id = ? LIMIT 1`,
    )
      .bind(planId)
      .first()
      .catch(() => null);
    if (!planRow?.id) return jsonResponse({ error: 'plan_not_found' }, 404);
    if (String(planRow.tenant_id || '') !== String(tenantId || '')) {
      return jsonResponse({ error: 'Forbidden' }, 403);
    }
    if (String(planRow.workspace_id || '') !== workspaceId) {
      return jsonResponse({ error: 'workspace_mismatch' }, 403);
    }

    const { revertAgentsamPlan } = await import('../core/agentsam-plan-refine.js');
    const out = await revertAgentsamPlan(env, { planId, tenantId, workspaceId });
    return jsonResponse({ ok: true, ...out });
  }

  // ── POST /api/agent/plan/refine — SSE refine existing plan from chat (@plan / refine plan) ──
  if (path === '/api/agent/plan/refine' && method === 'POST') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const body = await request.json().catch(() => ({}));
    const planId = String(body.plan_id ?? body.planId ?? '').trim();
    const refinement = String(body.refinement ?? body.message ?? '').trim();
    if (!planId) return jsonResponse({ error: 'plan_id required' }, 400);
    if (!refinement) return jsonResponse({ error: 'refinement required' }, 400);

    const reqCtx = await resolveRequestContext(request, env);
    if (reqCtx.error || !reqCtx.workspaceId) {
      return jsonResponse({ error: 'no_workspace', redirect: '/onboarding' }, 403);
    }
    const workspaceId = String(reqCtx.workspaceId).trim();

    let tenantId =
      authUser.tenant_id != null && String(authUser.tenant_id).trim() !== ''
        ? String(authUser.tenant_id).trim()
        : null;
    if (!tenantId) tenantId = await fetchAuthUserTenantId(env, authUser.id);

    const planRow = await env.DB.prepare(
      `SELECT id, tenant_id, workspace_id FROM agentsam_plans WHERE id = ? LIMIT 1`,
    )
      .bind(planId)
      .first()
      .catch(() => null);
    if (!planRow?.id) return jsonResponse({ error: 'plan_not_found' }, 404);
    if (String(planRow.tenant_id || '') !== String(tenantId || '')) {
      return jsonResponse({ error: 'Forbidden' }, 403);
    }
    if (String(planRow.workspace_id || '') !== workspaceId) {
      return jsonResponse({ error: 'workspace_mismatch' }, 403);
    }

    const uid = String(authUser.id || '').trim();
    const { startPlanRefineSseResponse } = await import('../core/plan-refine-stream.js');
    return startPlanRefineSseResponse(env, ctx, {
      planId,
      refinement,
      userId: uid,
      workspaceId,
      tenantId,
      sessionId: body.sessionId ?? body.session_id ?? null,
      planningSkillMarkdown: '',
    });
  }

  // ── POST /api/agent/plan/execute — run agentsam_plan_tasks (SSE) ──
  if (path === '/api/agent/plan/execute' && method === 'POST') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const body = await request.json().catch(() => ({}));
    const planId = String(body.plan_id ?? body.planId ?? '').trim();
    if (!planId) return jsonResponse({ error: 'plan_id required' }, 400);

    const reqCtx = await resolveRequestContext(request, env);
    if (reqCtx.error || !reqCtx.workspaceId) {
      return jsonResponse({ error: 'no_workspace', redirect: '/onboarding' }, 403);
    }
    const workspaceId = String(reqCtx.workspaceId).trim();

    let tenantId =
      authUser.tenant_id != null && String(authUser.tenant_id).trim() !== ''
        ? String(authUser.tenant_id).trim()
        : null;
    if (!tenantId) tenantId = await fetchAuthUserTenantId(env, authUser.id);

    const planRow = await env.DB.prepare(
      `SELECT id, tenant_id, workspace_id, workflow_run_id, status FROM agentsam_plans WHERE id = ? LIMIT 1`,
    )
      .bind(planId)
      .first()
      .catch(() => null);
    if (!planRow?.id) return jsonResponse({ error: 'plan_not_found' }, 404);
    if (String(planRow.tenant_id || '') !== String(tenantId || '')) {
      return jsonResponse({ error: 'Forbidden' }, 403);
    }
    if (String(planRow.workspace_id || '') !== workspaceId) {
      return jsonResponse({ error: 'workspace_mismatch' }, 403);
    }

    const uid = String(authUser.id || '').trim();
    const { startPlanExecuteSseResponse } = await import('../core/plan-execute-stream.js');
    return startPlanExecuteSseResponse(env, ctx, {
      planId,
      userId: uid,
      workspaceId,
      tenantId,
      sessionId: body.sessionId ?? body.session_id ?? null,
      workflowRunId: planRow.workflow_run_id ?? body.workflow_run_id ?? null,
    });
  }

  // ── POST /api/agent/plan-task/resume — one plan terminal task after Allow (SSE) ──
  if (path === '/api/agent/plan-task/resume' && method === 'POST') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const body = await request.json().catch(() => ({}));
    const planId = String(body.plan_id ?? body.planId ?? '').trim();
    const taskId = String(body.task_id ?? body.taskId ?? '').trim();
    const commandRunIdIn = String(body.command_run_id ?? body.commandRunId ?? '').trim();
    const approvalId = String(body.approval_id ?? body.approvalId ?? '').trim();
    if (!planId || !taskId || !approvalId) {
      return jsonResponse({ error: 'plan_id, task_id, and approval_id required' }, 400);
    }

    const reqCtx = await resolveRequestContext(request, env);
    if (reqCtx.error || !reqCtx.workspaceId) {
      return jsonResponse({ error: 'no_workspace', redirect: '/onboarding' }, 403);
    }
    const workspaceId = String(reqCtx.workspaceId).trim();

    let tenantId =
      authUser.tenant_id != null && String(authUser.tenant_id).trim() !== ''
        ? String(authUser.tenant_id).trim()
        : null;
    if (!tenantId) tenantId = await fetchAuthUserTenantId(env, authUser.id);

    const uid = String(authUser.id || '').trim();
    const canon = await resolveCanonicalUserId(uid, env).catch(() => uid);

    const qRow = await env.DB
      .prepare(
        `SELECT q.id, q.status, q.command_run_id, q.user_id, q.expires_at, q.execution_step_id
         FROM agentsam_approval_queue q
         WHERE q.id = ? AND lower(q.status) = 'approved'
           AND (q.expires_at IS NULL OR q.expires_at > unixepoch())`,
      )
      .bind(approvalId)
      .first()
      .catch(() => null);

    if (!qRow?.id) {
      return jsonResponse({ error: 'approval_not_verified', message: 'Approve this task first (Allow).' }, 403);
    }

    const qCrid = qRow.command_run_id != null ? String(qRow.command_run_id).trim() : '';
    if (commandRunIdIn && qCrid && qCrid !== commandRunIdIn) {
      return jsonResponse({ error: 'command_run_mismatch' }, 400);
    }
    const effectiveCrid = commandRunIdIn || qCrid;
    if (!effectiveCrid) {
      return jsonResponse({ error: 'command_run_id missing' }, 400);
    }

    const tRow = await env.DB
      .prepare(
        `SELECT id, plan_id, workspace_id, command_run_id, execution_step_id FROM agentsam_plan_tasks WHERE id = ? AND plan_id = ? LIMIT 1`,
      )
      .bind(taskId, planId)
      .first()
      .catch(() => null);

    if (!tRow?.id) return jsonResponse({ error: 'task_not_found' }, 404);
    const tws = String(tRow.workspace_id || '').trim();
    if (tws && tws !== workspaceId) {
      return jsonResponse({ error: 'workspace_mismatch' }, 403);
    }
    const tcr = tRow.command_run_id != null ? String(tRow.command_run_id).trim() : '';
    if (tcr && tcr !== effectiveCrid) {
      return jsonResponse({ error: 'task_command_run_mismatch' }, 400);
    }

    const qEs = qRow.execution_step_id != null ? String(qRow.execution_step_id).trim() : '';
    const tEs = tRow.execution_step_id != null ? String(tRow.execution_step_id).trim() : '';
    if (qEs && tEs && qEs !== tEs) {
      return jsonResponse({ error: 'execution_step_mismatch' }, 400);
    }

    const quid = String(qRow.user_id || '').trim();
    if (quid && quid !== canon && quid !== uid) {
      return jsonResponse({ error: 'approval_user_mismatch' }, 403);
    }

    const planRow = await env.DB
      .prepare(`SELECT workflow_run_id FROM agentsam_plans WHERE id = ? LIMIT 1`)
      .bind(planId)
      .first()
      .catch(() => null);
    const wfResume =
      planRow?.workflow_run_id != null && String(planRow.workflow_run_id).trim() !== ''
        ? String(planRow.workflow_run_id).trim()
        : null;

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const emitResume = (event, data) => {
      try {
        writer.write(encoder.encode(`data: ${JSON.stringify({ type: event, ...data })}\n\n`));
      } catch (_) {}
    };

    (async () => {
      try {
        const { executePlan } = await import('../core/agentsam-task-executor.js');
        await executePlan(env, {
          planId,
          userId: uid,
          workspaceId,
          tenantId,
          emit: emitResume,
          ctx,
          onlyTaskId: taskId,
          sessionId: body.sessionId ?? body.session_id ?? null,
          skipPlanAggregate: true,
          workflowRunId: wfResume,
        });
        emitResume('done', {});
      } catch (e) {
        emitResume('text', { text: `**Resume error:** ${e?.message ?? String(e)}` });
        emitResume('done', {});
      } finally {
        writer.close().catch(() => {});
      }
    })();

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  // ── POST /api/agent/workflow/start — DAG graph executor (agentsam_workflow_*)
  if (path === '/api/agent/workflow/start' && method === 'POST') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const body = await request.json().catch(() => ({}));
    const { workflow_key: workflowKeyBody, input, trigger_type: triggerTypeBody } = body;
    if (!workflowKeyBody) return jsonResponse({ error: 'workflow_key required' }, 400);
    const { executeWorkflowGraph } = await import('../core/workflow-executor.js');
    let tenantId =
      authUser.tenant_id != null && String(authUser.tenant_id).trim() !== ''
        ? String(authUser.tenant_id).trim()
        : null;
    if (!tenantId) tenantId = await fetchAuthUserTenantId(env, authUser.id);
    if (!tenantId) return jsonResponse({ error: 'Tenant could not be resolved' }, 403);
    const reqCtx = await resolveRequestContext(request, env);
    if (reqCtx.error || !reqCtx.workspaceId) {
      return jsonResponse({ error: 'no_workspace', redirect: '/onboarding' }, 403);
    }
    const workspaceId = String(reqCtx.workspaceId).trim();
    const result = await executeWorkflowGraph(env, {
      workflowKey: String(workflowKeyBody).trim(),
      input: input || {},
      tenantId,
      workspaceId,
      userId: authUser.id,
      userEmail: authUser.email,
      triggerType: triggerTypeBody,
    });
    return jsonResponse(result);
  }

  // ── POST /api/agent/workflow/approve — resume workflow after approval_gate
  if (path === '/api/agent/workflow/approve' && method === 'POST') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    const body = await request.json().catch(() => ({}));
    const { approval_id: approvalId, decision } = body;
    if (!approvalId) return jsonResponse({ error: 'approval_id required' }, 400);
    if (!['approved', 'rejected'].includes(decision)) {
      return jsonResponse({ error: 'decision must be approved or rejected' }, 400);
    }
    if (!env.DB) return jsonResponse({ error: 'DB unavailable' }, 503);

    const statusDb = decision === 'approved' ? 'approved' : 'denied';

    const updated = await env.DB.prepare(
      `UPDATE agentsam_approval_queue
       SET status      = ?,
           approved_by = ?,
           decided_at  = unixepoch()
       WHERE id = ? AND status = 'pending'`,
    )
      .bind(statusDb, authUser.id, approvalId)
      .run()
      .catch(() => null);

    const changes = updated?.meta?.changes ?? updated?.changes ?? 0;
    if (!changes) {
      return jsonResponse({ error: 'approval not found or already decided' }, 404);
    }

    const apRow = await env.DB.prepare(`SELECT workflow_run_id FROM agentsam_approval_queue WHERE id = ?`)
      .bind(approvalId)
      .first()
      .catch(() => null);

    if (apRow?.workflow_run_id && decision === 'approved') {
      await env.DB.prepare(
        `UPDATE agentsam_workflow_runs
         SET status = 'running', updated_at = datetime('now')
         WHERE id = ? AND status = 'awaiting_approval'`,
      )
        .bind(apRow.workflow_run_id)
        .run()
        .catch(() => null);
    }

    if (apRow?.workflow_run_id && decision === 'rejected') {
      await env.DB.prepare(
        `UPDATE agentsam_workflow_runs
         SET status = 'failed', kill_reason = 'approval_rejected', updated_at = datetime('now')
         WHERE id = ?`,
      )
        .bind(apRow.workflow_run_id)
        .run()
        .catch(() => null);
    }

    return jsonResponse({
      ok: true,
      decision,
      approval_id: approvalId,
      run_id: apRow?.workflow_run_id ?? null,
      message:
        decision === 'approved'
          ? 'Approved. Workflow will resume on next heartbeat.'
          : 'Rejected. Workflow run marked failed.',
    });
  }

  // ── /api/agent/workflows/trigger ─────────────────────────────────────────
  if (path === '/api/agent/workflows/trigger' && method === 'POST') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);
    const body         = await request.json().catch(() => ({}));
    const workflowName = String(body.workflow_name || '').trim();
    if (!workflowName) return jsonResponse({ error: 'workflow_name required' }, 400);
    let tenantId =
      authUser.tenant_id != null && String(authUser.tenant_id).trim() !== ''
        ? String(authUser.tenant_id).trim()
        : null;
    if (!tenantId) tenantId = await fetchAuthUserTenantId(env, authUser.id);
    if (!tenantId && authUser.email) tenantId = await fetchAuthUserTenantId(env, authUser.email);
    if (!tenantId) return jsonResponse({ error: 'Tenant could not be resolved' }, 403);
    const runId        = 'wfr_' + crypto.randomUUID().replace(/-/g,'').slice(0,16);
    await env.DB.prepare(`INSERT INTO workflow_runs (id, tenant_id, workflow_id, workflow_name, trigger_source, triggered_by, status, input_data, created_at, updated_at) VALUES (?,?,?,?,'api','iam_agent','pending',?,datetime('now'),datetime('now'))`).bind(runId, tenantId, body.workflow_id||null, workflowName, body.input_data ? JSON.stringify(body.input_data) : null).run();
    return jsonResponse({ ok: true, run_id: runId, status: 'pending' });
  }

  // ── /api/agent/rag/query (legacy compat — not normal Agent chat) ───────────
  if (path === '/api/agent/rag/query' && method === 'POST') {
    const body  = await request.json().catch(() => ({}));
    const query = (body.query || body.q || '').trim();
    if (!query) return jsonResponse({ error: 'query required', matches: [], results: [], count: 0 }, 400);
    const out = await legacyUnifiedRagSearch(env, query, {
      topK: body.top_k || 8,
      tenantId: identity?.tenantId ?? null,
      workspaceId: identity?.workspaceId ?? null,
      sessionId: identity?.sessionId ?? null,
      caller: '/api/agent/rag/query',
    });
    return jsonResponse({
      legacy: true,
      matches: out.matches || [],
      results: out.results || [],
      count: out.count || 0,
    });
  }

  // ── /api/agent/workers-ai/image ───────────────────────────────────────────
  if (path === '/api/agent/workers-ai/image' && method === 'POST') {
    if (!env.AI) return jsonResponse({ error: 'Workers AI not configured' }, 503);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    if (!identity?.tenantId) return jsonResponse({ error: 'unauthenticated' }, 401);
    const body   = await request.json().catch(() => ({}));
    const prompt = String(body.prompt || '').trim();
    if (!prompt) return jsonResponse({ error: 'prompt required' }, 400);
    let modelRow = await env.DB.prepare(
      `SELECT model_key FROM agentsam_ai
       WHERE mode = 'model' AND status = 'active'
         AND (is_global = 1 OR allowed_tenants_json LIKE ('%"' || ? || '"%'))
         AND LOWER(COALESCE(api_platform, '')) = 'workers_ai'
         AND (
           LOWER(COALESCE(name, '')) LIKE '%image%'
           OR LOWER(model_key) LIKE '%flux%'
         )
       ORDER BY COALESCE(sort_order, 999), COALESCE(input_rate_per_mtok, 999999) ASC
       LIMIT 1`,
    )
      .bind(identity.tenantId)
      .first()
      .catch(() => null);
    let model = modelRow?.model_key;
    if (!model) {
      modelRow = await env.DB.prepare(
        `SELECT model_key FROM agentsam_ai
         WHERE mode = 'model' AND status = 'active'
           AND (is_global = 1 OR allowed_tenants_json LIKE ('%"' || ? || '"%'))
           AND LOWER(COALESCE(api_platform, '')) = 'workers_ai'
         ORDER BY COALESCE(sort_order, 999), COALESCE(input_rate_per_mtok, 999999) ASC
         LIMIT 1`,
      )
        .bind(identity.tenantId)
        .first()
        .catch(() => null);
      model = modelRow?.model_key;
    }
    if (!model) return jsonResponse({ error: 'No active Workers AI image model in agentsam_ai' }, 503);
    try {
      const result = await env.AI.run(model, { prompt });
      const bytes  = result instanceof ArrayBuffer ? new Uint8Array(result) : result;
      return new Response(bytes, { headers: { 'Content-Type': 'image/png' } });
    } catch (e) { return jsonResponse({ error: e?.message }, 500); }
  }

  // ── /api/agent/do-history ─────────────────────────────────────────────────
  if (path === '/api/agent/do-history' && method === 'GET') {
    if (!identity?.userId) return jsonResponse({ error: 'unauthenticated' }, 401);
    const convId = url.searchParams.get('conversation_id');
    if (!convId) return jsonResponse({ error: 'conversation_id required' }, 400);
    if (!env.AGENT_SESSION) return jsonResponse({ error: 'AGENT_SESSION not configured' }, 503);
    const doId = env.AGENT_SESSION.idFromName(String(convId));
    const stub = env.AGENT_SESSION.get(doId);
    const lim  = url.searchParams.get('limit') || '50';
    const resp = await stub.fetch(new Request(`https://do/history?limit=${encodeURIComponent(lim)}`));
    return new Response(resp.body, { status: resp.status, headers: { 'Content-Type': 'application/json' } });
  }

  // ── /api/agent/telemetry ──────────────────────────────────────────────────
  if (path === '/api/agent/telemetry') {
    if (!env.DB) return jsonResponse([]);
    const { results } = await env.DB.prepare(`SELECT provider, SUM(tokens_in) as total_input, SUM(tokens_out) as total_output, COUNT(*) as total_calls FROM agentsam_usage_events WHERE created_at > unixepoch('now','-7 days') GROUP BY provider`).all().catch(() => ({ results: [] }));
    return jsonResponse(results || []);
  }

  // ── /api/agent/cicd ───────────────────────────────────────────────────────
  if (path === '/api/agent/cicd') {
    if (!env.DB) return jsonResponse([]);
    const { results } = await env.DB.prepare(`SELECT r.id, r.worker_name, r.environment, r.status, r.git_branch, r.git_commit_sha, r.queued_at, r.completed_at, COUNT(e.id) AS activity_count FROM cicd_runs r LEFT JOIN cicd_events e ON e.webhook_event_id = r.id GROUP BY r.id ORDER BY r.queued_at DESC LIMIT 50`).all().catch(() => ({ results: [] }));
    return jsonResponse(results || []);
  }

  // ── /api/agent/mcp ────────────────────────────────────────────────────────
  if (path === '/api/agent/mcp') {
    if (!env.DB) return jsonResponse([]);
    const { results } = await env.DB.prepare(`SELECT id, service_name, service_type, endpoint_url, is_active, health_status FROM mcp_services WHERE is_active=1 ORDER BY service_name`).all().catch(() => ({ results: [] }));
    return jsonResponse(results || []);
  }

  // ── /api/agent/bootstrap ──────────────────────────────────────────────────
  if (path === '/api/agent/bootstrap' && method === 'GET') {
    if (!identity) return jsonResponse({ error: 'unauthenticated' }, 401);
    return handleAgentBootstrapRequest(request, env, ctx, identity);
  }

  // ── POST /api/agent/chat/execute-approved-tool ───────────────────────────
  // Non-plan tool approval path (ChatAssistant.tsx). User already approved in UI.
  if (path === '/api/agent/chat/execute-approved-tool' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const toolName = normalizeToolName(String(body.tool_name ?? body.name ?? '').trim());
    if (!toolName) {
      return jsonResponse({ success: false, error: 'tool_name required' }, 400);
    }
    const toolInput =
      body.tool_input && typeof body.tool_input === 'object'
        ? body.tool_input
        : body.parameters && typeof body.parameters === 'object'
          ? body.parameters
          : body.input && typeof body.input === 'object'
            ? body.input
            : {};
    const conversationId =
      body.conversation_id != null && String(body.conversation_id).trim() !== ''
        ? String(body.conversation_id).trim()
        : null;
    const approvedToolSpine = {
      agent_run_id:
        body.agent_run_id != null && String(body.agent_run_id).trim() !== ''
          ? String(body.agent_run_id).trim()
          : body.agentRunId != null && String(body.agentRunId).trim() !== ''
            ? String(body.agentRunId).trim()
            : null,
      conversation_id: conversationId,
    };

    console.log('[execute-approved-tool] tool_name:', toolName);
    console.log('[execute-approved-tool] tool_input:', JSON.stringify(toolInput).slice(0, 2000));

    const actorCtx = await resolveIamActorContext(request, env).catch(() => null);
    const sessionId = conversationId ?? identity?.sessionId ?? actorCtx?.sessionId ?? null;
    const context = {
      sessionId,
      tenantId: identity?.tenantId ?? actorCtx?.tenantId ?? null,
      userId: identity?.userId ?? actorCtx?.userId ?? null,
      workspaceId: identity?.workspaceId ?? actorCtx?.workspaceId ?? null,
      personUuid: identity?.personUuid ?? actorCtx?.personUuid ?? null,
      isSuperadmin: !!(identity?.isSuperadmin ?? actorCtx?.isSuperadmin),
      request,
      ...approvedToolSpine,
    };

    const toolBudgetMs = resolveToolExecutionBudgetMs(toolName, toolInput);
    const execT0 = Date.now();
    try {
      const result = await dispatchToolCallWithBudget(
        env,
        toolName,
        toolInput,
        context,
        toolBudgetMs,
      );
      const execMs = Math.max(0, Date.now() - execT0);
      console.log('[execute-approved-tool] result:', JSON.stringify(result).slice(0, 2000));

      scheduleRecordMcpToolExecution(env, ctx, {
        tenant_id: context.tenantId,
        workspace_id: context.workspaceId,
        session_id: sessionId,
        tool_name: toolName,
        tool_id: null,
        input_json: JSON.stringify(toolInput || {}),
        output_json: JSON.stringify(result ?? null).slice(0, 50000),
        success: true,
        error_message: null,
        duration_ms: execMs,
        user_id: context.userId,
        invoked_by: context.userId || 'iam_agent',
        status: 'completed',
        // TELEMETRY-001: catalog insertToolCallLog owns agentsam_tool_call_log on this path.
        skip_tool_call_log: true,
        ...approvedToolSpine,
      });

      return jsonResponse({ success: true, tool_name: toolName, result });
    } catch (e) {
      const execMs = Math.max(0, Date.now() - execT0);
      const errMsg =
        e && typeof e === 'object' && 'message' in e && typeof e.message === 'string'
          ? e.message
          : String(e ?? 'unknown_error');
      console.warn('[execute-approved-tool] tool_error', toolName, errMsg);

      scheduleRecordMcpToolExecution(env, ctx, {
        tenant_id: context.tenantId,
        workspace_id: context.workspaceId,
        session_id: sessionId,
        tool_name: toolName,
        tool_id: null,
        input_json: JSON.stringify(toolInput || {}),
        output_json: null,
        success: false,
        error_message: errMsg.slice(0, 4000),
        duration_ms: execMs,
        user_id: context.userId,
        invoked_by: context.userId || 'iam_agent',
        status: 'error',
        // TELEMETRY-001: catalog owns agentsam_tool_call_log on this path (incl. error finalize).
        skip_tool_call_log: true,
        ...approvedToolSpine,
      });

      return jsonResponse({ success: false, tool_name: toolName, error: errMsg }, 200);
    }
  }

  // ── GET /api/agent/routing/recent — last N intent/routing decisions (D1 ground truth) ──
  if (path === '/api/agent/routing/recent' && method === 'GET') {
    if (!identity?.userId) return jsonResponse({ error: 'unauthenticated' }, 401);
    if (!env?.DB) return jsonResponse({ error: 'D1 unavailable' }, 503);
    const url = new URL(request.url);
    const limitRaw = Number(url.searchParams.get('limit') || 12);
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 12, 1), 40);
    const workspaceId =
      String(url.searchParams.get('workspace_id') || identity.workspaceId || '').trim() || null;
    const scopeUser = String(identity.userId).trim();
    try {
      let rows = [];
      if (workspaceId) {
        const { results } = await env.DB.prepare(
          `SELECT id, tenant_id, workspace_id, user_id, conversation_id, task_type,
                  message_excerpt, matched_by, is_match, confidence, model_key, provider,
                  routing_arm_id, reason, latency_ms, created_at
           FROM agentsam_intent_decisions
           WHERE workspace_id = ? AND user_id = ?
           ORDER BY created_at DESC
           LIMIT ?`,
        )
          .bind(workspaceId, scopeUser, limit)
          .all();
        rows = results || [];
      } else {
        const { results } = await env.DB.prepare(
          `SELECT id, tenant_id, workspace_id, user_id, conversation_id, task_type,
                  message_excerpt, matched_by, is_match, confidence, model_key, provider,
                  routing_arm_id, reason, latency_ms, created_at
           FROM agentsam_intent_decisions
           WHERE user_id = ?
           ORDER BY created_at DESC
           LIMIT ?`,
        )
          .bind(scopeUser, limit)
          .all();
        rows = results || [];
      }
      return jsonResponse({
        ok: true,
        count: rows.length,
        decisions: rows.map((r) => ({
          id: r.id,
          task_type: r.task_type,
          matched_by: r.matched_by,
          is_match: Number(r.is_match) === 1,
          confidence: r.confidence,
          model_key: r.model_key,
          provider: r.provider,
          routing_arm_id: r.routing_arm_id,
          reason: r.reason,
          message_excerpt: r.message_excerpt,
          latency_ms: r.latency_ms,
          conversation_id: r.conversation_id,
          workspace_id: r.workspace_id,
          created_at: r.created_at,
        })),
      });
    } catch (e) {
      return jsonResponse({ ok: false, error: String(e?.message || e) }, 500);
    }
  }

  // ── POST /api/agent/routing/apply-eto — flush pending ETO → Thompson arms (test batches) ──
  if (path === '/api/agent/routing/apply-eto' && method === 'POST') {
    if (!identity?.userId) return jsonResponse({ error: 'unauthenticated' }, 401);
    if (!env?.DB) return jsonResponse({ error: 'D1 unavailable' }, 503);
    const owner = await isEtoThompsonOwner(env);
    if (!owner) return jsonResponse({ error: 'eto_table_missing' }, 503);
    try {
      const applied = await applyEtoToRoutingArms(env, {});
      return jsonResponse({ ok: true, ...applied });
    } catch (e) {
      return jsonResponse({ ok: false, error: String(e?.message || e) }, 500);
    }
  }

  // ── POST /api/agent/run/:runId/cancel — flip D1 flag; tool loop polls between steps ──
  const runCancelMatch = path.match(/^\/api\/agent\/run\/([^/]+)\/cancel$/);
  if (runCancelMatch && method === 'POST') {
    if (!identity?.userId) return jsonResponse({ error: 'unauthenticated' }, 401);
    const { requestAgentRunCancel } = await import('../core/agent-run-cancel.js');
    const out = await requestAgentRunCancel(env, runCancelMatch[1], {
      userId: identity.userId,
      workspaceId: identity.workspaceId,
      tenantId: identity.tenantId,
    });
    if (!out.ok) {
      const status = out.error === 'forbidden' ? 403 : out.error === 'run_not_found' ? 404 : 400;
      return jsonResponse(out, status);
    }
    return jsonResponse(out);
  }

  // POST /api/agent/fs/fulfill — browser FSA bridge completes a parked fs_* tool call
  if (path === '/api/agent/fs/fulfill' && method === 'POST') {
    let body = {};
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'invalid_json' }, 400);
    }
    const callId = String(body.callId || body.call_id || '').trim();
    const conversationId = String(
      body.conversationId || body.conversation_id || body.sessionId || body.session_id || '',
    ).trim();
    if (!callId || !conversationId) {
      return jsonResponse({ error: 'callId and conversationId required' }, 400);
    }
    if (!env.AGENT_SESSION) {
      return jsonResponse({ error: 'AGENT_SESSION not configured' }, 503);
    }
    const { getAgentSessionStub, doFulfillFsaRequest } = await import('../core/agent-session-context.js');
    const stub = getAgentSessionStub(env, conversationId);
    if (!stub) return jsonResponse({ error: 'session_stub_unavailable' }, 503);
    const out = await doFulfillFsaRequest(stub, callId, body.result ?? {});
    return jsonResponse(out?.ok === false ? out : { ok: true, callId, ...out });
  }

  // ── /api/agent/chat ───────────────────────────────────────────────────────
  if (path === '/api/agent/chat' && method === 'POST') {
    const ingestBypass = isIngestSecretAuthorized(request, env);
    return agentChatSseHandler(env, request, ctx, { ingestBypass, identity });
  }

  return jsonResponse({ error: 'Agent route not found', path }, 404);
}

export async function handleAgentRequest(request, env, ctx, routeAuth = null) {
  const url = new URL(request.url);
  return handleAgentApi(request, url, env, ctx, routeAuth);
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

async function handleAgentBootstrapRequest(request, env, ctx, identity) {
  try {
    const userId = identity?.userId || 'system';
    const isSuper = !!(identity?.isSuperadmin);
    const tenantId =
      identity?.tenantId ||
      (await fetchAuthUserTenantId(env, userId)) ||
      platformTenantIdFromEnv(env) ||
      null;

    const authUser = {
      id: userId,
      tenant_id: tenantId,
      is_superadmin: isSuper ? 1 : 0,
    };
    const reqCtx = await resolveRequestContext(request, env).catch(() => ({ error: 'unauthenticated' }));
    const workspaceId =
      !reqCtx.error && reqCtx.workspaceId ? reqCtx.workspaceId : (identity?.workspaceId ?? null);

    const bootstrapRow =
      env.DB && workspaceId && userId !== 'system'
        ? await resolveActiveBootstrap(env, {
            userId,
            tenantId,
            workspaceId,
          })
        : null;

    const scoped_context = await buildScopedBootstrapContext(env, {
      authUser,
      workspaceId: workspaceId || '',
      tenantId,
      bootstrapRow,
    });

    if (env.SESSION_CACHE && tenantId && userId !== 'system') {
      const cached = await readAgentBootstrapCache(env, { tenantId, userId, workspaceId });
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed?.scoped_context?.isolation?.user_id === userId) {
            return new Response(cached, {
              headers: {
                'Content-Type': 'application/json',
                'X-Cache': 'HIT',
                'X-Context-Store': 'session_cache',
              },
            });
          }
        } catch (_) {
          /* stale cache shape — rebuild */
        }
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    let dailyLog = '';
    let yesterdayLog = '';
    let schemaMemory = '';
    let todayTodo = '';

    if (env.AUTORAG_BUCKET || env.R2) {
      const fetchMem = async (k) => {
        const bucket = env.AUTORAG_BUCKET || env.R2;
        if (!bucket?.get) return '';
        const o = await bucket.get(k);
        return o ? await o.text() : '';
      };
      const legacyFetch = async (k) => {
        if (!env.R2?.get) return '';
        const o = await env.R2.get(k);
        return o ? await o.text() : '';
      };
      [dailyLog, yesterdayLog] = await Promise.all([
        fetchMem(userId && userId !== 'system' ? `memory/users/${userId}/${today}.md` : `memory/${today}.md`)
          .then((t) => t || fetchMem(`memory/${today}.md`) || legacyFetch(`memory/daily/${today}.md`)),
        fetchMem(userId && userId !== 'system' ? `memory/users/${userId}/${yesterday}.md` : `memory/${yesterday}.md`)
          .then((t) => t || fetchMem(`memory/${yesterday}.md`) || legacyFetch(`memory/daily/${yesterday}.md`)),
      ]);
      if (isSuper && env.R2) {
        schemaMemory = await legacyFetch('memory/schema-and-records.md');
        todayTodo = await legacyFetch('memory/today-todo.md');
      }
    } else if (env.R2 && userId !== 'system') {
      const fetchR2 = async (k) => {
        const o = await env.R2.get(k);
        return o ? await o.text() : '';
      };
      const userPrefix = `users/${userId}/memory/`;
      [dailyLog, yesterdayLog, todayTodo] = await Promise.all([
        fetchR2(`${userPrefix}daily/${today}.md`),
        fetchR2(`${userPrefix}daily/${yesterday}.md`),
        fetchR2(`${userPrefix}today-todo.md`),
      ]);
    }

    if (!todayTodo && env.DB && tenantId && userId !== 'system') {
      const row = await env.DB.prepare(
        `SELECT value FROM agentsam_memory WHERE key = 'today_todo' AND tenant_id = ? AND user_id = ?`,
      )
        .bind(tenantId, userId)
        .first()
        .catch(() => null);
      if (row?.value) todayTodo = String(row.value);
    }

    const context = {
      scoped_context,
      bootstrap_row_id: bootstrapRow?.id ?? null,
      daily_log: dailyLog || null,
      yesterday_log: yesterdayLog || null,
      schema_and_records_memory: isSuper ? schemaMemory || null : null,
      today_todo: todayTodo || null,
      date: today,
    };

    if (env.SESSION_CACHE && ctx?.waitUntil && tenantId && userId !== 'system') {
      ctx.waitUntil(
        writeAgentBootstrapCache(env, {
          tenantId,
          workspaceId,
          userId,
          payload: context,
          createdBy: userId,
        }),
      );
    }
    return jsonResponse(context, 200, { 'X-Context-Store': 'session_cache' });
  } catch (e) {
    return jsonResponse({ error: String(e.message || e) }, 500);
  }
}


export { runAgentToolLoop, buildSystemPrompt, recordArmOutcome, ensureActiveFileCapabilityTools, mcpPanelAgentChatSse, mcpPanelToolMatchesGlob };
