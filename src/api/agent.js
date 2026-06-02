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
import { authUserFromRequest, getSession,
         isIngestSecretAuthorized,
         fetchAuthUserTenantId,
         authUserIsSuperadmin,
         platformTenantIdFromEnv }    from '../core/auth.js';
import { resolveGitHubToken } from '../core/github-token.js';
import {
  fetchGitStatusFromGitHub,
  fetchWorkspaceGithubRepo,
  pingPtyServiceHealth,
} from '../core/status-bar-runtime.js';
import { resolveIdentity, resolveIamActorContext } from '../core/identity.js';
import { selectAgentsamMcpToolsList } from '../core/agentsam-mcp-tools.js';
import { maxModelToolsForAgentTask } from '../core/mcp-tools-branded.js';
import {
  resolveAgentChatRouteToolRequirements,
  effectiveAgentChatToolCap,
} from '../core/agentsam-route-tool-resolver.js';
import { resolveEffectiveWorkspaceId } from '../core/bootstrap.js';
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
  extractCompactionFromAnthropicUsage,
  scheduleCompactionFromAnthropicUsage,
  scheduleInsertAgentCost,
} from '../core/agent-costs.js';
import { evaluateGuardrails } from '../core/guardrails.js';
import { extractBrowserNavigateUrl } from '../core/extract-browser-url.js';
import { scheduleAgentsamErrorLog } from '../core/agentsam-error-log.js';
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
  shouldUseCodemodeForRequest,
  getOrBuildCodemodeRuntime,
  buildHybridCodemodeManifest,
  enqueueCodemodePendingActions,
  CODEMODE_TOOL_NAME,
} from '../core/codemode-agent-bridge.js';
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
import { userCanAccessWorkspace } from '../core/cms-theme-resolve.js';

/**
 * Map resolveModelForTask() → legacy routing pick shape used by chat chain assembly.
 * @param {any} env
 * @param {{ taskType: string, mode?: string, workspaceId: string, tenantId?: string|null, toolRequired?: boolean }} opts
 */
async function routingPickFromResolveModelForTask(env, {
  taskType,
  mode,
  workspaceId,
  tenantId,
  toolRequired,
}) {
  if (!env?.DB || !taskType || !workspaceId) return null;
  try {
    const resolved = await resolveModelForTask(env, {
      task_type: normalizeCanonicalTaskType(taskType),
      mode: mode != null && String(mode).trim() !== '' ? String(mode).trim() : 'agent',
      workspace_id: String(workspaceId).trim(),
      tenant_id: tenantId != null && String(tenantId).trim() !== '' ? String(tenantId).trim() : undefined,
      require_tools: !!toolRequired,
    });
    const aiRow = await resolveAgentsamAiRowByModelKey(env, tenantId, resolved.model_key);
    const modelIdRaw = aiRow?.id != null ? String(aiRow.id).trim() : '';
    if (!modelIdRaw) return null;
    return {
      source: resolved.resolution_source === 'thompson' ? 'thompson' : resolved.resolution_source,
      modelId: modelIdRaw,
      modelKey: resolved.model_key,
      provider: resolved.provider ?? aiRow?.provider ?? null,
      armId: resolved.routing_arm_id != null ? String(resolved.routing_arm_id).trim() : '',
      taskType: String(taskType).trim(),
      fallbackModelKey: null,
    };
  } catch (e) {
    console.warn('[agent] routingPickFromResolveModelForTask', e?.message ?? e);
    return null;
  }
}

/** USD from agentsam_model_pricing (via estimateModelRunCostUsd pricing spine). */
async function fetchModelCostUsd(env, modelKey, inputTokens, outputTokens, cacheReadTokens = 0) {
  if (!env?.DB || !modelKey || (!inputTokens && !outputTokens)) return 0;
  try {
    const priced = await estimateModelRunCostUsd(env.DB, {
      modelKey: String(modelKey),
      inputTokens: Math.max(0, Math.floor(Number(inputTokens) || 0)),
      outputTokens: Math.max(0, Math.floor(Number(outputTokens) || 0)),
      cacheReadTokens: Math.max(0, Math.floor(Number(cacheReadTokens) || 0)),
    });
    return Number(priced?.costUsd) || 0;
  } catch {
    return 0;
  }
}

const WRITE_LIKE_PREFIXES = ['d1_', 'worker_', 'resend_', 'meshyai_'];
const TERM_WRITE_TOOLS = new Set(['terminal_run', 'terminal_execute', 'run_command', 'bash']);

/**
 * POST /api/agent/tool-smoke ONLY — default-safe denylist for blind / unaudited smoke runs.
 *
 * Do NOT import or reuse this set for: /api/agent/chat, MCP dispatch, branded catalog routing,
 * workflow execution, approvals, or any runtime tool selection. Agent runtime safety is
 * route requirements + branded MCP catalog + approval + entitlements (see mcp-tools-branded,
 * resolveAgentChatRouteToolRequirements, validateToolCall).
 *
 * Smoke safety is a test-harness concern; collapsing it into global Agent Sam policy is wrong.
 */
const TOOL_SMOKE_DEFAULT_SAFE_DENYLIST = new Set([
  'cdt_evaluate_script',
  'cdt_upload_file',
  'd1_write',
  'd1_batch_write',
  'worker_deploy',
  'resend_send_broadcast',
  'resend_create_api_key',
  'meshyai_image_to_3d',
  'meshyai_text_to_3d',
  'agentsam_run_agent',
  'python_execute',
  'terminal_run',
  'terminal_execute',
  'run_command',
  'bash',
]);

/** Registry keys in `agentsam_prompt_versions.prompt_key` — content always loaded from D1. */
const TENANT_KNOWLEDGE_PLATFORM = 'tenant_knowledge_platform';
const TENANT_SHINSHU = 'tenant_jake_waalk';

/**
 * Effective workspace_id via resolveEffectiveWorkspaceId (header/session/tenant/membership).
 * @param {any} env
 * @param {Request} request
 * @param {string|null|undefined} userId
 * @param {Record<string, unknown>} [cache]
 */
/** Derives cost tier label from agentsam_ai.features_json for workspace tier gating. */
function modelCostTierFromRow(row) {
  const meta = parseJsonSafe(row?.features_json ?? row?.metadata_json, {}) || {};
  const t = meta.cost_tier;
  if (t != null && String(t).trim() !== '') return String(t).trim();
  return 'free';
}

/**
 * Restricts the candidate model chain to tiers allowed for this workspace (agentsam_model_tier).
 */
async function filterWorkspaceModelTierPool(env, workspaceId, chainRows) {
  if (!env?.DB || !workspaceId || !chainRows?.length) return chainRows || [];
  try {
    const count = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM agentsam_model_tier',
    ).first();
    if (!count?.n) return chainRows;
  } catch {
    return chainRows;
  }
  try {
    const { results } = await env.DB.prepare(
      `SELECT cost_tier FROM agentsam_model_tier
       WHERE workspace_id = ? AND is_active = 1
       ORDER BY tier_level ASC`,
    )
      .bind(String(workspaceId).trim())
      .all();
    const rows = results || [];
    if (!rows.length) return chainRows;
    const allowed = new Set(
      rows
        .map((r) => r?.cost_tier)
        .filter((t) => t != null && String(t).trim() !== '')
        .map((t) => String(t).trim()),
    );
    if (!allowed.size) return chainRows;
    return chainRows.filter((r) => { const ct = modelCostTierFromRow(r); return !ct || allowed.has(ct); });
  } catch (e) {
    console.warn('[agent] model tier filter', e?.message ?? e);
    return chainRows;
  }
}

function parseRuleTriggerCondition(raw) {
  const obj = parseJsonSafe(raw, {}) || {};
  const keywords = Array.isArray(obj.keywords)
    ? obj.keywords.map((k) => String(k).trim()).filter(Boolean)
    : [];
  const minMatches = Math.max(1, Number(obj.min_matches ?? obj.minMatches ?? 1) || 1);
  return { keywords, minMatches };
}

function countKeywordsInMessage(message, keywords) {
  const hay = String(message || '').toLowerCase();
  if (!hay || !keywords.length) return 0;
  let hits = 0;
  for (const kw of keywords) {
    const needle = String(kw).toLowerCase();
    if (needle && hay.includes(needle)) hits += 1;
  }
  return hits;
}

function ruleMatchesKeywordTrigger(message, triggerConditionJson) {
  const { keywords, minMatches } = parseRuleTriggerCondition(triggerConditionJson);
  if (!keywords.length) return false;
  return countKeywordsInMessage(message, keywords) >= minMatches;
}

/**
 * Loads agentsam_rules_document rows for system prompt injection:
 * apply_mode=always, trigger_type=system (always) or keyword (message match).
 */
async function fetchTriggeredRulesForSystemPrompt(env, opts = {}) {
  if (!env?.DB) return [];
  const ws = opts.workspaceId != null ? String(opts.workspaceId).trim() : '';
  const uid = opts.userId != null ? String(opts.userId).trim() : '';
  if (!ws) return [];
  const message = String(opts.message ?? '');

  let rows = [];
  try {
    const rRes = await env.DB.prepare(
      `SELECT id, title, body_markdown, trigger_type, trigger_condition_json, sort_order
       FROM agentsam_rules_document
       WHERE is_active = 1
         AND apply_mode = 'always'
         AND trigger_type IN ('system', 'keyword')
         AND (workspace_id = ? OR workspace_id IS NULL OR TRIM(COALESCE(workspace_id, '')) = '')
         AND (user_id = ? OR user_id IS NULL OR TRIM(COALESCE(user_id, '')) = '')
       ORDER BY COALESCE(sort_order, 0) ASC, updated_at_epoch DESC`,
    )
      .bind(ws, uid || '')
      .all();
    rows = rRes.results || [];
  } catch (e) {
    console.warn('[agent] triggered rules query', e?.message ?? e);
    return [];
  }

  return rows.filter((r) => {
    const tt = String(r.trigger_type || '').toLowerCase();
    if (tt === 'system') return true;
    if (tt === 'keyword') return ruleMatchesKeywordTrigger(message, r.trigger_condition_json);
    return false;
  });
}

async function appendTriggeredRulesToSystemPrompt(env, systemPrompt, opts = {}) {
  const rules = await fetchTriggeredRulesForSystemPrompt(env, opts);
  if (!rules.length) return systemPrompt;
  const blocks = rules.map((r) => {
    const title = String(r.title || r.id || 'Rule');
    const body = String(r.body_markdown || '');
    return `### ${title}\n${body}`;
  });
  return `${systemPrompt}\n\n## Workspace Rules\n${blocks.join('\n\n')}\n`;
}

function skillTokenEstimate(row) {
  const te = Number(row?.token_estimate);
  if (Number.isFinite(te) && te > 0) return Math.floor(te);
  const body = String(row?.content_markdown || '');
  return body ? Math.max(1, Math.ceil(body.length / 4)) : 0;
}

function normalizeBlendedTaskTypes(taskTypes, taskType) {
  const out = new Set();
  if (Array.isArray(taskTypes)) {
    for (const t of taskTypes) {
      const s = String(t ?? '').trim();
      if (s) out.add(s);
    }
  }
  const single = String(taskType ?? '').trim();
  if (single) out.add(single);
  return [...out];
}

/**
 * Tier 1 (always_apply + token budget) + Tier 2/3 (json_each task/route match + budget).
 * Single loader for agent chat — replaces loadSkillsForTaskType + appendSkills duplicate queries.
 */
async function loadBlendedSkillsForRequest(env, opts = {}) {
  if (!env?.DB) return { skills: [], tier1Tokens: 0, tier23Tokens: 0 };
  const {
    userId,
    workspaceId,
    routeKey = null,
    taskTypes = [],
    taskType = null,
    tier1Budget = 800,
    tier23Budget = 2000,
    maxSkills = 6,
  } = opts;
  const uid = userId != null ? String(userId).trim() : '';
  const ws = workspaceId != null ? String(workspaceId).trim() : '';
  if (!ws) return { skills: [], tier1Tokens: 0, tier23Tokens: 0 };

  const types = normalizeBlendedTaskTypes(taskTypes, taskType);
  const rk = String(routeKey ?? '').trim();
  const selected = [];
  const seen = new Set();
  let tier1Tokens = 0;
  let tier23Tokens = 0;

  const pushRow = (row, tier) => {
    const id = String(row?.id ?? '');
    if (!id || seen.has(id) || selected.length >= maxSkills) return false;
    const cost = skillTokenEstimate(row);
    if (tier === 1) {
      if (tier1Tokens + cost > tier1Budget) return false;
      tier1Tokens += cost;
    } else {
      if (tier23Tokens + cost > tier23Budget) return false;
      tier23Tokens += cost;
    }
    seen.add(id);
    selected.push({ ...row, _blended_tier: tier });
    return true;
  };

  try {
    const tier1Res = await env.DB.prepare(
      `SELECT id, name, content_markdown, always_apply, token_estimate,
              retrieval_strategy, file_path, sort_order
       FROM agentsam_skill
       WHERE is_active = 1
         AND always_apply = 1
         AND (workspace_id = ? OR workspace_id IS NULL OR TRIM(COALESCE(workspace_id, '')) = '')
       ORDER BY sort_order ASC`,
    )
      .bind(ws)
      .all();
    for (const row of tier1Res.results || []) {
      if (selected.length >= maxSkills) break;
      pushRow(row, 1);
    }
  } catch (e) {
    console.warn('[agent] blended_skills tier1', e?.message ?? e);
  }

  if (selected.length >= maxSkills) {
    return { skills: selected, tier1Tokens, tier23Tokens };
  }

  const matchParts = [];
  const binds = [ws];
  if (uid) {
    matchParts.push(`(user_id = ? AND TRIM(COALESCE(user_id, '')) != '')`);
    binds.push(uid);
  }
  if (rk) {
    matchParts.push(
      `EXISTS (
         SELECT 1 FROM json_each(COALESCE(NULLIF(TRIM(route_keys_json), ''), '[]')) je
         WHERE je.value = ?
       )`,
    );
    binds.push(rk);
  }
  if (types.length) {
    const ph = types.map(() => '?').join(', ');
    matchParts.push(
      `EXISTS (
         SELECT 1 FROM json_each(COALESCE(NULLIF(TRIM(task_types_json), ''), '[]')) je
         WHERE je.value IN (${ph})
       )`,
    );
    binds.push(...types);
  }
  if (!matchParts.length) {
    return { skills: selected, tier1Tokens, tier23Tokens };
  }

  try {
    const tier23Res = await env.DB.prepare(
      `SELECT id, name, content_markdown, always_apply, token_estimate,
              retrieval_strategy, file_path, sort_order, user_id
       FROM agentsam_skill
       WHERE is_active = 1
         AND always_apply = 0
         AND (workspace_id = ? OR workspace_id IS NULL OR TRIM(COALESCE(workspace_id, '')) = '')
         AND (${matchParts.join(' OR ')})
       ORDER BY sort_order ASC`,
    )
      .bind(...binds)
      .all();
    for (const row of tier23Res.results || []) {
      if (selected.length >= maxSkills) break;
      pushRow(row, 23);
    }
  } catch (e) {
    console.warn('[agent] blended_skills tier23', e?.message ?? e);
  }

  return { skills: selected, tier1Tokens, tier23Tokens };
}

function formatBlendedSkillsPromptBlock(skillRows) {
  if (!skillRows?.length) return '';
  const blocks = skillRows.map((r) => {
    const title = String(r.name || r.id || 'skill');
    const body = String(r.content_markdown || '').trim();
    if (!body) return `### ${title}\n(skill content loaded via ${String(r.retrieval_strategy || 'db')})\n`;
    return `### ${title}\n${body}`;
  });
  return `\n## Skills\n${blocks.join('\n\n')}\n`;
}

async function recordBlendedSkillInvocations(env, ctx, skillRows, opts) {
  if (!skillRows?.length || !env?.DB) return;
  const {
    userId, tenantId, workspaceId, conversationId,
  } = opts;
  const uid = String(userId ?? '').trim();
  const ws = String(workspaceId ?? '').trim();
  if (!uid || !ws) return;
  const ids = skillRows.map((r) => r.id);
  env.DB.prepare(
    `UPDATE agentsam_skill
     SET invocation_count = invocation_count + 1,
         last_invoked_at = datetime('now')
     WHERE id IN (${ids.map(() => '?').join(',')})`,
  )
    .bind(...ids)
    .run()
    .catch(() => {});
  if (!ctx?.waitUntil) return;
  const conv = conversationId != null ? String(conversationId) : null;
  ctx.waitUntil(
    Promise.all(
      skillRows.map((row) =>
        env.DB.prepare(
          `INSERT INTO agentsam_skill_invocation
           (skill_id, user_id, workspace_id, conversation_id, trigger_method, success, tenant_id)
           VALUES (?, ?, ?, ?, ?, 1, ?)`,
        )
          .bind(
            String(row.id),
            uid,
            ws,
            conv,
            row._blended_tier === 1 ? 'always_apply' : 'auto',
            tenantId ?? null,
          )
          .run()
          .catch((e) => console.warn('[agentsam_skill_invocation]', e?.message ?? e)),
      ),
    ).catch(() => {}),
  );
}

/**
 * Appends blended skills to the system prompt; records invocations (waitUntil).
 * Rules are injected in buildSystemPrompt via appendTriggeredRulesToSystemPrompt (D1 triggers).
 */
async function appendSkillsAndRulesToSystemPrompt(env, ctx, systemPrompt, opts) {
  const {
    userId,
    tenantId,
    workspaceId,
    conversationId,
    taskType,
    routeKey = null,
    taskTypes = null,
    tier1Budget = 800,
    tier23Budget = 2000,
    maxSkills = 6,
    preloadedSkills = null,
  } = opts;
  if (!env?.DB) return systemPrompt;
  const uid = userId != null ? String(userId).trim() : '';
  const ws = workspaceId != null ? String(workspaceId).trim() : '';
  if (!uid || !ws) return systemPrompt;

  let skillRows = preloadedSkills;
  if (!skillRows) {
    try {
      const blended = await loadBlendedSkillsForRequest(env, {
        userId: uid,
        workspaceId: ws,
        routeKey,
        taskTypes: taskTypes ?? (taskType ? [taskType] : []),
        taskType,
        tier1Budget,
        tier23Budget,
        maxSkills,
      });
      skillRows = blended.skills;
    } catch (e) {
      console.warn('[agent] blended_skills prompt', e?.message ?? e);
      return systemPrompt;
    }
  }
  if (!skillRows?.length) return systemPrompt;

  try {
    skillRows = await hydrateSkillsFromR2(env, skillRows);
  } catch (e) {
    console.warn('[agent] hydrate skills r2', e?.message ?? e);
  }

  try {
    await recordBlendedSkillInvocations(env, ctx, skillRows, {
      userId: uid,
      tenantId,
      workspaceId: ws,
      conversationId,
    });
  } catch (e) {
    console.warn('[agent] blended_skills invocation', e?.message ?? e);
  }

  const extra = formatBlendedSkillsPromptBlock(skillRows);
  return extra ? `${systemPrompt}${extra}` : systemPrompt;
}

function inferArtifactFromAssistantText(text) {
  if (!text || typeof text !== 'string' || !text.includes('```')) return null;
  const m = text.match(/```([\w+#.-]*)/);
  const rawLang = m && m[1] ? String(m[1]).toLowerCase().replace(/^language-/, '') : '';
  let artifact_type = 'other';
  if (rawLang.includes('html')) artifact_type = 'html';
  else if (rawLang === 'js' || rawLang === 'javascript') artifact_type = 'js';
  else if (rawLang === 'ts' || rawLang === 'typescript') artifact_type = 'ts';
  else if (rawLang === 'css') artifact_type = 'css';
  else if (rawLang === 'json') artifact_type = 'json';
  else if (rawLang === 'sql') artifact_type = 'sql';
  const name =
    rawLang && rawLang.length > 0 && rawLang.length < 80 ? rawLang : 'untitled';
  return { artifact_type, name };
}

async function logPromptCacheUsage(env, tenantId, layerKeys, routeKey, provider, modelKey) {
  if (!env.DB || !layerKeys?.length) return;
  try {
    const layerKeysJson = JSON.stringify(layerKeys);
    // Use the routeKey or a hash of the layer keys as the cache identifier
    const hashInput = `${tenantId || 'global'}:${layerKeysJson}`;
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(hashInput));
    const hash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    
    // Check if we already have this combination
    const existing = await env.DB.prepare(`
      SELECT id FROM agentsam_prompt_cache_keys 
      WHERE cache_key_hash = ? AND tenant_id = ? 
      LIMIT 1
    `).bind(hash, tenantId || '').first().catch(() => null);

    if (existing) {
      await env.DB.prepare(`
        UPDATE agentsam_prompt_cache_keys 
        SET read_count = read_count + 1, last_read_at = datetime('now')
        WHERE id = ?
      `).bind(existing.id).run();
    } else {
      await env.DB.prepare(`
        INSERT INTO agentsam_prompt_cache_keys 
        (tenant_id, provider, model_key, cache_key_hash, layer_keys_json, route_key)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(tenantId || '', provider || 'unknown', modelKey || 'unknown', hash, layerKeysJson, routeKey || null).run();
    }
  } catch (e) {
    console.warn('[agent] logPromptCacheUsage failed:', e.message);
  }
}

function scheduleAgentsamArtifactFromChatOutput(env, ctx, opts) {
  if (!env?.DB || !ctx?.waitUntil) return;
  const { outputText, userId, tenantId, workspaceId, sourceAgentRunId } = opts;
  const meta = inferArtifactFromAssistantText(outputText || '');
  if (!meta) return;
  const uid = userId != null ? String(userId).trim() : '';
  const tid = tenantId != null ? String(tenantId).trim() : '';
  if (!uid || !tid) return;
  const ws = workspaceId != null ? String(workspaceId).trim() : null;
  const srcRun =
    sourceAgentRunId != null && String(sourceAgentRunId).trim() !== ''
      ? String(sourceAgentRunId).trim().slice(0, 120)
      : null;
  ctx.waitUntil(
    (async () => {
      try {
        const cols = await pragmaTableInfo(env.DB, 'agentsam_artifacts');
        if (srcRun && cols.has('source_run_id')) {
          await env.DB
            .prepare(
              `INSERT INTO agentsam_artifacts
               (user_id, tenant_id, workspace_id, name, artifact_type, r2_key, source, source_run_id)
               VALUES (?, ?, ?, ?, ?, '', 'agent_response', ?)`,
            )
            .bind(uid, tid, ws, meta.name, meta.artifact_type, srcRun)
            .run();
        } else {
          await env.DB
            .prepare(
              `INSERT INTO agentsam_artifacts
               (user_id, tenant_id, workspace_id, name, artifact_type, r2_key, source)
               VALUES (?, ?, ?, ?, ?, '', 'agent_response')`,
            )
            .bind(uid, tid, ws, meta.name, meta.artifact_type)
            .run();
        }
      } catch (e) {
        console.warn('[agentsam_artifacts]', e?.message ?? e);
      }
    })(),
  );
}

function scheduleAgentsamToolCallLog(env, ctx, fields) {
  const {
    tenantId,
    sessionId,
    toolName,
    status,
    durationMs,
    costUsd,
    inputTokens,
    outputTokens,
    userId,
    workspaceId,
    errorMessage,
    inputSummary,
    agent_run_id,
    agentRunId,
    conversation_id,
    conversationId,
    routingArmId,
    routing_arm_id,
  } = fields;
  const tid = tenantId != null && String(tenantId).trim() !== '' ? String(tenantId).trim() : '';
  const ws =
    workspaceId != null && String(workspaceId).trim() !== '' ? String(workspaceId).trim() : '';
  if (!tid || !ws) return;
  let stat = 'success';
  if (status === 'error') stat = 'error';
  else if (status === 'timeout') stat = 'timeout';
  else if (status === 'blocked') stat = 'blocked';
  else if (status === 'pending') stat = 'pending';
  const summary = String(inputSummary ?? '').slice(0, 200);
  const errMsg = errorMessage != null ? String(errorMessage).slice(0, 8000) : null;
  const correlationId = `tcl_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  scheduleToolCallLog(env, ctx, {
    tenantId,
    workspaceId,
    sessionId,
    toolName,
    status: stat,
    durationMs,
    costUsd,
    inputTokens,
    outputTokens,
    userId,
    errorMessage: errMsg,
    inputSummary: summary,
    tool_key: fields.tool_key,
    capability_key: fields.capability_key,
    handler_key: fields.handler_key,
    route_key: fields.route_key,
    agentsam_tools_id: fields.agentsam_tools_id,
    mcp_server_id: fields.mcp_server_id,
    server_key: fields.server_key,
    approval_id: fields.approval_id,
    policy_decision_json: fields.policy_decision_json,
    agent_run_id: agent_run_id ?? agentRunId,
    conversation_id: conversation_id ?? conversationId ?? sessionId,
    routing_arm_id: routing_arm_id ?? routingArmId ?? null,
  });
  if (stat === 'error' && errMsg && ctx?.waitUntil) {
    scheduleAgentsamErrorLog(env, ctx, {
      workspaceId: ws,
      tenantId: tid,
      sessionId: sessionId ?? null,
      errorCode: 'tool_call_log_error',
      errorType: 'tool_execution',
      errorMessage: errMsg,
      source: 'tool_call_log',
      sourceId: correlationId,
      contextJson: JSON.stringify({ tool_name: toolName, input_summary: summary, correlation_id: correlationId }),
    });
  }
}

/** Maps validateToolCall result into agentsam_tool_call_log identity columns (D1 PRAGMA-filtered insert). */
function toolLogFieldsFromValidation(validation) {
  if (!validation || typeof validation !== 'object') return {};
  const v = /** @type {Record<string, unknown>} */ (validation);
  const policy = {
    allowed: v.allowed === true,
    reason: v.reason ?? null,
    riskLevel: v.riskLevel ?? null,
    requiresConfirmation: v.requiresConfirmation === true,
  };
  /** @type {Record<string, unknown>} */
  const out = {
    tool_key: v.toolKey != null ? String(v.toolKey) : undefined,
    capability_key: v.capabilityKey != null ? String(v.capabilityKey) : undefined,
    handler_key: v.handlerKey != null ? String(v.handlerKey) : undefined,
    route_key: v.routeKey != null ? String(v.routeKey) : undefined,
    agentsam_tools_id: v.agentsamToolsId != null ? v.agentsamToolsId : undefined,
    mcp_server_id: v.mcpServerId != null ? v.mcpServerId : undefined,
    server_key: v.serverKey != null ? String(v.serverKey) : undefined,
    policy_decision_json: JSON.stringify(policy),
  };
  for (const k of Object.keys(out)) {
    if (out[k] === undefined) delete out[k];
  }
  return out;
}

async function resolveBootstrapWorkspaceIdForAgentApi(env, request, userId, cache) {
  const uid = userId != null ? String(userId).trim() : '';
  if (!uid || !env?.DB || !request) return null;
  if (cache && cache.__iamBootWs != null) return cache.__iamBootWs;
  try {
    const authUser = await authUserFromRequest(request, env).catch(() => null);
    const wr = await resolveEffectiveWorkspaceId(env, request, authUser, cache || {});
    const ws =
      wr.workspaceId != null && String(wr.workspaceId).trim() !== ''
        ? String(wr.workspaceId).trim()
        : null;
    if (cache && typeof cache === 'object') cache.__iamBootWs = ws;
    return ws;
  } catch {
    return null;
  }
}

/** Minimal fallback if D1 has no core row (same intent as legacy single-line base). */
const FALLBACK_CORE_SYSTEM = 'You are Agent Sam, an autonomous AI coding and operations assistant for Inner Animal Media.';

/** Appended in buildSystemPrompt — Python + parallel tool use (Anthropic guidance). */
const AGENT_SAM_PYTHON_PARALLEL_BLOCK = `You are a Python professional. When a task involves data processing, scripting, automation, analysis, or any computation that Python handles well, use python_execute without being asked. You write clean, well-commented Python — proper imports at the top, error handling with try/except, f-strings for formatting, and type hints for function signatures. You know the standard library deeply (pathlib, json, csv, datetime, itertools, collections) and reach for pandas, requests, or other packages when they make the solution cleaner. You never apologize for using Python — you use it because it is the right tool.

For maximum efficiency, whenever you perform multiple independent operations, invoke all relevant tools simultaneously rather than sequentially. When reading multiple files, checking multiple endpoints, or running independent lookups, call all tools in parallel. Err on the side of more parallel tool calls rather than fewer sequential ones.`;

/** Prefer `browser` prompt route when heuristics say browser but generic route would win. */
async function resolvePromptRouteRowForAgentChat(env, tenantId, modeSlug, intentResult, message) {
  const promptRouteIntentSlug =
    String(intentResult?.taskType || 'auto')
      .toLowerCase()
      .trim() || 'auto';
  let row = await resolveAgentsamPromptRoute(env, tenantId, modeSlug, promptRouteIntentSlug);
  if (isReadOnlyFileContextIntent(message)) {
    const rk = String(row?.route_key || '').toLowerCase();
    if (rk === 'browser') {
      const askRow =
        (await resolveAgentsamPromptRoute(env, tenantId, modeSlug, 'ask')) ||
        (await resolveAgentsamPromptRoute(env, tenantId, modeSlug, 'chat'));
      if (askRow && String(askRow.route_key || '').toLowerCase() !== 'browser') {
        console.log(
          '[agent] prompt_route_read_only_file_override',
          JSON.stringify({ from: rk, to: askRow.route_key }),
        );
        row = askRow;
      }
    }
    return row;
  }
  const taskType = String(intentResult?.taskType || '').toLowerCase();
  const needsBrowserRoute = taskType === 'browser' || messageHasBrowserUrlNavigation(message);
  if (!needsBrowserRoute || row?.route_key === 'browser') return row;
  if (!env?.DB) return row;
  try {
    const browserRow = await env.DB.prepare(
      `SELECT r.*
       FROM agentsam_prompt_routes r
       WHERE r.route_key = 'browser'
         AND r.is_active = 1
         AND (r.tenant_id IS NULL OR r.tenant_id = ?)
       ORDER BY CASE WHEN r.tenant_id IS NOT NULL THEN 0 ELSE 1 END,
                COALESCE(r.priority, 0) ASC
       LIMIT 1`,
    )
      .bind(tenantId != null ? String(tenantId).trim() : '')
      .first();
    if (browserRow) return browserRow;
  } catch (e) {
    console.warn('[agent] prompt_route_browser_fallback', e?.message ?? e);
  }
  return row;
}

/**
 * Match `agentsam_prompt_routes` to mode / intent (intent_labels JSON array + tenant tie-break).
 * `priority`: lower numeric value wins among otherwise-equally-specific matches (see ORDER BY).
 */
async function resolveAgentsamPromptRoute(env, tenantId, modeSlug, intentSlug) {
  if (!env?.DB) return null;
  const tid = tenantId != null ? String(tenantId).trim() : '';
  const mode = String(modeSlug || '').trim();
  const intent = String(intentSlug || '').trim();
  const routeByKeySql = `
      SELECT r.*
      FROM agentsam_prompt_routes r
      WHERE r.route_key = ?
        AND r.is_active = 1
        AND (r.tenant_id IS NULL OR r.tenant_id = ?)
      ORDER BY CASE WHEN r.tenant_id IS NOT NULL THEN 0 ELSE 1 END,
               COALESCE(r.priority, 0) ASC
      LIMIT 1
    `;
  try {
    // 1. Mode is primary — user explicitly chose this
    if (mode) {
      const modeRoute = await env.DB.prepare(routeByKeySql).bind(mode, tid).first();
      if (modeRoute) return modeRoute;
    }

    // 2. Only fall through to task_type if no mode route exists
    if (intent && intent !== mode) {
      const taskRoute = await env.DB.prepare(routeByKeySql).bind(intent, tid).first();
      if (taskRoute) return taskRoute;
    }

    return null;
  } catch (e) {
    console.warn('[agent] prompt_route', e?.message ?? e);
    return null;
  }
}

async function fetchActivePlanContextFragment(env, tenantId, options = {}) {
  const { sessionId, planId, taskId, workspaceId } = options;
  if (!env.DB) return '';

  let activePlan = null;
  if (planId) {
    let planSql = 'SELECT * FROM agentsam_plans WHERE id = ?';
    const planBinds = [planId];
    if (tenantId) {
      planSql += ' AND tenant_id = ?';
      planBinds.push(tenantId);
    }
    if (workspaceId) {
      planSql += ' AND workspace_id = ?';
      planBinds.push(workspaceId);
    }
    planSql += ' LIMIT 1';
    activePlan = await env.DB.prepare(planSql).bind(...planBinds).first().catch(() => null);
  } else if (sessionId) {
    let planSql = `
      SELECT * FROM agentsam_plans 
      WHERE session_id = ? AND status = 'active'`;
    const planBinds = [sessionId];
    if (tenantId) {
      planSql += ' AND tenant_id = ?';
      planBinds.push(tenantId);
    }
    if (workspaceId) {
      planSql += ' AND workspace_id = ?';
      planBinds.push(workspaceId);
    }
    planSql += ' ORDER BY created_at DESC LIMIT 1';
    activePlan = await env.DB.prepare(planSql).bind(...planBinds).first().catch(() => null);
  }

  if (!activePlan) return '';

  let activeTask = null;
  if (taskId) {
    activeTask = await env.DB.prepare(
      'SELECT * FROM agentsam_plan_tasks WHERE id = ? AND plan_id = ? LIMIT 1',
    )
      .bind(taskId, activePlan.id)
      .first()
      .catch(() => null);
  } else {
    activeTask = await env.DB.prepare(`
      SELECT * FROM agentsam_plan_tasks 
      WHERE plan_id = ? AND status IN ('todo', 'in_progress')
      ORDER BY order_index ASC LIMIT 1
    `).bind(activePlan.id).first().catch(() => null);
  }

  let fragment = `\n\n## Active Plan: ${activePlan.title || 'Untitled Plan'}\n`;
  if (activePlan.session_notes) fragment += `Plan Notes: ${activePlan.session_notes}\n`;
  
  if (activeTask) {
    fragment += `\n### Current Task: ${activeTask.title}\n`;
    if (activeTask.description) fragment += `Task Description: ${activeTask.description}\n`;
    const files = parseJsonSafe(activeTask.files_involved, []);
    if (files.length) fragment += `Files involved: ${files.join(', ')}\n`;
    const tables = parseJsonSafe(activeTask.tables_involved, []);
    if (tables.length) fragment += `Tables involved: ${tables.join(', ')}\n`;
  }
  
  return fragment;
}

function isSimpleAskMessage(message = "") {
  const s = String(message || "").trim().toLowerCase();
  if (!s || s.length > 80) return false;
  return ["hi","hello","hey","yo","sup","thanks","thank you","ok","okay","test","ping"].includes(s);
}

async function buildSystemPrompt(env, tenantId, mode, contextBlock, modeConfig, promptRouteRow = null, options = {}) {
  const _kv = env.SESSION_CACHE ?? null;
  const _wsId = options?.workspaceId ?? '';
  const _minimal = options?.minimalAsk ? 'min' : 'full';
  const _routeKey = promptRouteRow?.route_key ?? 'default';
  const _ver = _kv ? (await _kv.get(`sp:version:${tenantId}`).catch(() => '0') ?? '0') : '0';
  const _kvKey = `sp:v1:${tenantId}:${mode}:${_wsId}:${_routeKey}:${_minimal}:${_ver}`;

  let cachedPrompt = null;
  if (_kv && !options?._skipCache) {
    try {
      const hit = await _kv.get(_kvKey);
      if (hit) cachedPrompt = hit;
    } catch (_) {}
  }

  const routeDerivedMinimal =
    promptRouteRow &&
    Number(promptRouteRow.max_tools ?? 8) === 0 &&
    Number(promptRouteRow.include_rag ?? 1) === 0 &&
    Number(promptRouteRow.include_active_plan ?? 1) === 0 &&
    Number(promptRouteRow.include_recent_memory ?? 1) === 0 &&
    Number(promptRouteRow.include_workspace_ctx ?? 1) === 0;

  const minimalAsk = Boolean(options?.minimalAsk) || Boolean(routeDerivedMinimal);

  const rulesPromptOpts = {
    workspaceId: options?.workspaceId,
    userId: options?.userId,
    message: options?.message,
  };

  const appendRulesContextBlock = async (systemPrompt) =>
    appendTriggeredRulesToSystemPrompt(env, systemPrompt, rulesPromptOpts);

  const appendProjectContextBlock = async (systemPrompt) => {
    if (minimalAsk || !options?.workspaceId) return systemPrompt;
    try {
      const { appendActiveProjectsToSystemPrompt } = await import('../core/agent-prompt-context.js');
      return appendActiveProjectsToSystemPrompt(env, systemPrompt, {
        workspaceId: options.workspaceId,
        tenantId: options.tenantId,
      });
    } catch (e) {
      console.warn('[agent] project_context inject', e?.message ?? e);
      return systemPrompt;
    }
  };

  const finalizeSystemPrompt = async (systemPrompt) => {
    let out = await appendRulesContextBlock(systemPrompt);
    out = await appendProjectContextBlock(out);
    return out;
  };

  if (cachedPrompt != null) {
    return finalizeSystemPrompt(cachedPrompt);
  }

  try {
    const layerKeys = (() => {
      if (promptRouteRow?.prompt_layer_keys) {
        try {
          const parsed = JSON.parse(promptRouteRow.prompt_layer_keys);
          if (Array.isArray(parsed) && parsed.length) return parsed;
        } catch { /* fall through */ }
      }
      if (minimalAsk) return ['core_identity'];
      // Default layers for mode
      const base = ['core_identity', 'db_safety', 'security', 'tool_loop'];
      if (['build', 'deploy', 'agent'].includes(mode)) base.push('deploy_safety');
      if (mode === 'billing') base.push('billing');
      return base;
    })();

    // Add tenant-specific layers (skip for minimal_ask: use route layer_keys only)
    if (!minimalAsk) {
      if (tenantId === TENANT_KNOWLEDGE_PLATFORM) layerKeys.push('learning');
      if (tenantId === TENANT_SHINSHU) layerKeys.push('shinshu');
      const platformTid = platformTenantIdFromEnv(env);
      if (platformTid && tenantId && tenantId !== platformTid) layerKeys.push('client_work');
    }

    if (!minimalAsk && !layerKeys.includes('company_no_emojis')) layerKeys.push('company_no_emojis');

    // Pipeline flags from promptRouteRow
    const includeActivePlan  = Number(promptRouteRow?.include_active_plan  ?? 1) === 1;
    const includeWorkspace   = Number(promptRouteRow?.include_workspace_ctx ?? 1) === 1;

    // Load all needed prompt versions in one query (tenant_id NULL = global rows; tenant match may override per key in map below)
    const placeholders = layerKeys.map(() => '?').join(', ');
    const rows = await env.DB.prepare(`
      SELECT prompt_key, body
      FROM agentsam_prompt_versions
      WHERE is_active = 1
        AND prompt_key IN (${placeholders})
        AND (tenant_id IS NULL OR tenant_id = ?)
      ORDER BY CASE WHEN tenant_id IS NULL THEN 1 ELSE 0 END DESC
    `).bind(...layerKeys, tenantId || '').all().catch(() => ({ results: [] }));

    const byKey = Object.fromEntries((rows.results || []).map(r => [r.prompt_key, r.body]));

    // Assemble in layer order
    const parts = layerKeys
      .map(k => byKey[k])
      .filter(Boolean);

    if (!parts.length) parts.push(FALLBACK_CORE_SYSTEM);

    // Inject Plan & Task Context if enabled by route or requested by options
    if (!minimalAsk && includeActivePlan && env.DB) {
      const planWs =
        options.workspaceId ||
        (await resolveBootstrapWorkspaceIdForAgentApi(
          env,
          options.request ?? null,
          options.userId,
          options.cache,
        ));
      const planContext = await fetchActivePlanContextFragment(env, tenantId, {
        ...options,
        workspaceId: planWs,
      });
      if (planContext) parts.push(planContext);
    }

    if (!minimalAsk && (includeActivePlan || (Number(promptRouteRow?.max_tools ?? 8) > 0))) {
      parts.push(AGENT_SAM_PYTHON_PARALLEL_BLOCK);
    }

    if (!minimalAsk && modeConfig?.system_prompt_fragment) parts.push(modeConfig.system_prompt_fragment);
    if (!minimalAsk && includeWorkspace && contextBlock) parts.push(contextBlock);

    let result = parts.join('\n\n---\n\n');

    // Workspace session digest (cache-miss path only; not stored in KV — stays fresh per build)
    if (!minimalAsk && options?.workspaceId && env.DB) {
      try {
        const wsDigest = String(options.workspaceId).trim();
        if (wsDigest) {
          const digest = await env.DB.prepare(
            `SELECT digest_text FROM agentsam_context_digest
             WHERE workspace_id = ? AND digest_type = 'session'
             ORDER BY created_at DESC LIMIT 1`,
          )
            .bind(wsDigest)
            .first();
          if (digest?.digest_text?.trim()) {
            result += `\n## Workspace Context\n${digest.digest_text.trim()}\n`;
          }
        }
      } catch {
        /* non-fatal */
      }
    }

    if (_kv) _kv.put(_kvKey, parts.join('\n\n---\n\n'), { expirationTtl: 300 }).catch(() => {});

    // Fire-and-forget prompt cache tracking
    if (env.DB && layerKeys.length) {
      void logPromptCacheUsage(env, tenantId, layerKeys, promptRouteRow?.route_key, options?.provider ?? null, options?.modelKey ?? null).catch(() => {});
    }

    return finalizeSystemPrompt(result);
  } catch (e) {
    console.warn('[agent] buildSystemPrompt failed:', e?.message);
    const fallback = FALLBACK_CORE_SYSTEM + (!minimalAsk && contextBlock ? `\n\n${contextBlock}` : '');
    return finalizeSystemPrompt(fallback);
  }
}

function projectIdFromEnv(env) {
  const candidates = [env?.PROJECT_ID, env?.WORKER_NAME, env?.CLOUDFLARE_WORKER_NAME];
  for (const c of candidates) {
    if (c != null && String(c).trim()) return String(c).trim();
  }
  return 'inneranimalmedia';
}

function parseJsonSafe(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function normalizeModeToolPolicy(raw) {
  const policy = parseJsonSafe(raw, {}) || {};
  const allowTools = policy.allow_tools || policy.allowlist || policy.allowed_tools || [];
  const denyTools = policy.deny_tools || policy.blocklist || policy.blocked_tools || [];
  const requireApprovalTools = policy.require_approval_tools || policy.confirmation_required_tools || [];
  return {
    allowTools: Array.isArray(allowTools) ? allowTools.map((v) => String(v)) : [],
    denyTools: Array.isArray(denyTools) ? denyTools.map((v) => String(v)) : [],
    requireApprovalTools: Array.isArray(requireApprovalTools) ? requireApprovalTools.map((v) => String(v)) : [],
  };
}

async function loadModeToolPolicy(env, modeSlug, opts = {}) {
  const { loadModeToolPolicy: loadPolicy } = await import('../core/agent-mode-tool-policy.js');
  return loadPolicy(env, modeSlug, opts);
}

/**
 * Plain URL + navigation verb → browser (not web_search). Passive links / search phrases excluded.
 * @param {string} text
 */
function messageHasBrowserUrlNavigation(text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t || !/https?:\/\//i.test(t)) return false;
  return (
    /\b(go\s+to|visit|open|navigate|load|head\s+to|check\s+out|browse\s+to)\b/i.test(t) ||
    /(?:^|\s)to\s+https?:\/\//i.test(t)
  );
}

const BROWSER_CAPABILITY_TOOL_NAMES = [
  'browser_navigate',
  'browser_content',
  'cdt_take_snapshot',
  'cdt_navigate_page',
];

function shouldEnsureBrowserCapabilityTools(message, intentResult, capabilityDecision, promptRouteRow) {
  if (isReadOnlyFileContextIntent(message)) return false;
  if (messageRequestsOpenWebSearch(message) || messageRequestsWebFetch(message)) {
    return false;
  }
  if (messageRequestsWorkspaceGrep(message) && !messageExplicitlyRequestsBrowserInspection(message)) {
    return false;
  }
  if (
    isCodeImplementationIntent(message) &&
    !messageExplicitlyRequestsBrowserInspection(message)
  ) {
    return false;
  }
  if (String(intentResult?.taskType || '').toLowerCase() === 'browser') return true;
  if (messageHasBrowserUrlNavigation(message)) return true;
  if (capabilityDecision?.should_use_browser === true) return true;
  if (String(promptRouteRow?.route_key || '').toLowerCase() === 'browser') return true;
  return false;
}

function shouldEnsureCodeCapabilityTools(message, intentResult, capabilityDecision) {
  if (messageExplicitlyRequestsBrowserInspection(message)) return false;
  if (messageRequestsOpenWebSearch(message) && !messageRequestsWorkspaceGrep(message)) return false;
  if (messageRequestsWebFetch(message)) return false;
  if (isCodeImplementationIntent(message)) return true;
  if (messageRequestsWorkspaceGrep(message)) return true;
  if (capabilityDecision?.should_use_monaco === true) return true;
  if (String(intentResult?.taskType || '').toLowerCase() === 'code') return true;
  return false;
}

function inferIntentHeuristically(text) {
  const stripped = stripUserTextForIntent(text);
  if (isReadOnlyFileContextIntent(stripped)) {
    return { taskType: 'ask', mode: 'agent' };
  }
  const t = stripped.toLowerCase();
  if (!t) return { taskType: 'ask', mode: 'auto' };

  const is = (pattern) => pattern.test(t);
  const hasUrlNavigate = messageHasBrowserUrlNavigation(t);

  // ── Infra / orchestration ────────────────────────────────────────────────
  const hasDeploy    = is(/(deploy|wrangler deploy|npm run deploy|push to prod|promote|release|cf build|cloudflare build)/);
  const hasCfOps     = is(/(wrangler|kv namespace|durable object|cloudflare queue|r2 bucket list|cf worker|worker binding|workers ai|pages project|d1 create|d1 migrate|secret put|tail log)/);
  const hasWorkflow  = is(/(run workflow|start workflow|trigger workflow|execute workflow|agentic run)/);
  const hasMultitask = is(/(orchestrate|multi[- ]?step|multi[- ]?agent|automate|end[- ]?to[- ]?end|full[- ]?stack|build[- ]?and[- ]?deploy|chain of tasks?|sequence of tasks?|parallel tasks?|run everything|autonomous)/);

  // ── Database ─────────────────────────────────────────────────────────────
  const hasDbWrite   = is(/(add to|insert into|seed|write to|upsert into|add records?|add rows?|add lessons?|add entries|add data|create records?|put into|store in d1|d1 write|populate table|bulk insert)/) ||
                       (is(/(add|insert|create|put|seed|upload)/) && is(/(d1|database|table|record|row|lesson|entry|entries)/));
  const hasDbRead    = is(/(select|count|show me|list all|fetch all|retrieve|look up|query the|read from).*(table|row|record|d1|database|agentsam_)/) ||
                       is(/agentsam_[a-z_]+/) || is(/d1_query/);
  const hasSupabase  = is(/(supabase|postgres|postgresql|hyperdrive|pg query|pgvector|neon)/);
  const hasSql       = is(/(select|insert|update|delete|upsert|create table|drop table|alter table|migrate|pragma|join|where\s+\w|group by|order by)/);

  // ── Terminal / shell ─────────────────────────────────────────────────────
  const hasShell     = is(/(run command|bash|zsh|terminal|shell|pm2|npm run|pnpm|yarn run|git\s|ls|cat\s|chmod|curl|ssh|exec)/);

  // ── R2 / storage ─────────────────────────────────────────────────────────
  const hasR2        = is(/(r2|upload to|put file|store file|get from bucket|read from r2|list r2|r2 object|r2 bucket)/);

  // ── Image generation (before browser — "generate mockup" is not browser screenshot) ──
  if (isPrimaryImageGenerationIntent(t)) {
    return { taskType: 'agent', mode: 'agent' };
  }

  // ── Web / browser ─────────────────────────────────────────────────────────
  // URL alone → not web_search; URL + go to|visit|open|navigate → browser (checked before hasWebSearch).
  const hasWebSearch =
    is(
      /(search the web|look it up online|google|find online|search online|web search|look up.*online|find.*article|current news|latest.*on)/,
    ) ||
    (is(/https?:\/\//) &&
      is(/(search|google|look\s+up|find\s+online)/) &&
      !hasUrlNavigate);
  const hasBrowser =
    hasUrlNavigate ||
    is(
      /(screenshot|inspect\s+https?:\/\/|inspect.*url|navigate\s+to|open\s+(the\s+)?browser|browser.*inspect|playwright|puppeteer|headless)/,
    );

  // ── Vector / RAG ─────────────────────────────────────────────────────────
  const hasVectorize = is(/(vectorize|embed|embedding|semantic search|rag|index.*knowledge|upsert.*vector|similarity search|knowledge base)/);

  // ── GitHub ───────────────────────────────────────────────────────────────
  const hasGitHub    = is(/(github|pull request|open pr|merge pr|git commit|git push|diff|branch|repo|repository|git blame|git log)/);

  // ── Codebase search ───────────────────────────────────────────────────────
  const hasSearchCode = is(/(grep|find in codebase|which file|where is|search.*src|find.*function|locate.*file|find.*component|codebase.*search|search.*codebase)/);

  // ── Code ops (lower priority than db_write) ───────────────────────────────
  const hasCode      = is(/(edit file|fix file|create file|implement|worker\.js|\.js|\.ts|\.jsx|\.tsx|function\s+\w|class\s+\w|component)/) ||
    (is(/\bmonaco\b/) && is(/\b(edit|change|modify|patch|save|sync|write|apply)\b/));
  const hasRefactor  = is(/(refactor|restructure|rename|reorganize|extract function|clean up code|move file|split|decompose)/);
  const hasReview    = is(/(review|code review|audit|check quality|analyze.*code|quality check|is this correct)/);
  const hasExplain   = is(/(explain|what is|how does|describe|tell me about|what does|how do i|walk me through|break down|eli5|summarize how)/);

  // ── Debug ────────────────────────────────────────────────────────────────
  const hasDebug     = is(/(debug|error|trace|why.*fail|not working|broken|exception|crash|stack trace|404|500|bug|fix.*error|diagnose)/);

  // ── Planning ─────────────────────────────────────────────────────────────
  const hasPlan      = is(/(plan|roadmap|architect|diagram|excalidraw|spec|wireframe|flowchart|sprint|task breakdown|prioritize|what should i work on)/);

  // ── Memory / recall ───────────────────────────────────────────────────────
  const hasRecall    = is(/(recall|remember|what did|history|past session|previous|last time|earlier today|what was|remind me)/);

  // ── CMS ───────────────────────────────────────────────────────────────────
  const hasCms       = is(/(cms|theme|liquid|shopify|content edit|cms page|cms section|cms component)/);

  // ── Agent / skill / tool ─────────────────────────────────────────────────
  const hasSkillCreate =
    is(/(create|make|build|write|add|new).{0,40}(skill|skills)/) &&
    !is(/(SKILL\.md|src\/skills\/|agentsam_skill|playwright)/);
  const hasTool      = is(/(use tool|invoke|mcp tool|call tool|run tool|tool call)/);
  const hasSkill     = is(/(use skill|apply skill|run skill|invoke skill|skill:)/);
  const hasSpawn     = is(/(spawn subagent|delegate to|assign to agent|run.*agent|subagent|agent.*handle|have.*agent|let.*agent)/);

  // ── Priority-ordered classification ──────────────────────────────────────
  if (hasWorkflow)    return { taskType: 'agent', mode: 'agent' };
  if (hasDeploy)      return { taskType: 'agent', mode: 'agent' };
  if (hasMultitask)   return { taskType: 'multitask', mode: 'agent' };
  if (hasSpawn)       return { taskType: 'multitask', mode: 'agent' };
  if (hasDbWrite)     return { taskType: 'agent', mode: 'agent' };
  if (hasSupabase)    return { taskType: 'agent', mode: 'agent' };
  if (hasDbRead && !hasSql) return { taskType: 'agent', mode: 'agent' };
  if (hasR2)          return { taskType: 'agent', mode: 'agent' };
  if (hasCfOps)       return { taskType: 'agent', mode: 'agent' };
  if (hasShell && !hasCode) return { taskType: 'agent', mode: 'agent' };
  if (hasBrowser)     return { taskType: 'browser', mode: 'agent' };
  if (hasWebSearch)   return { taskType: 'web_search', mode: 'agent' };
  if (hasVectorize)   return { taskType: 'agent', mode: 'agent' };
  if (hasGitHub)      return { taskType: 'agent', mode: 'agent' };
  if (hasSql)         return { taskType: 'agent', mode: 'agent' };
  if (hasDebug)       return { taskType: 'debug', mode: 'agent' };
  if (hasSearchCode)  return { taskType: 'search_code', mode: 'agent' };
  if (hasRefactor)    return { taskType: 'agent', mode: 'agent' };
  if (hasReview)      return { taskType: 'agent', mode: 'agent' };
  if (hasCode)        return { taskType: 'agent', mode: 'agent' };
  if (hasSkillCreate) return { taskType: 'plan', mode: 'agent' };
  if (hasPlan)        return { taskType: 'plan', mode: 'agent' };
  if (hasSkill)       return { taskType: 'agent', mode: 'agent' };
  if (hasTool)        return { taskType: 'agent', mode: 'agent' };
  if (hasCms)         return { taskType: 'agent', mode: 'agent' };
  if (hasRecall)      return { taskType: 'ask', mode: 'auto' };
  if (hasExplain)     return { taskType: 'ask', mode: 'auto' };
  return { taskType: 'ask', mode: 'agent' };
}

async function classifyIntent(_env, lastMessageText) {
  const { taskType: rawTt, mode } = inferIntentHeuristically(lastMessageText);
  const taskType =
    rawTt != null && String(rawTt).trim() !== '' ? normalizeCanonicalTaskType(rawTt) : 'ask';
  // Route intent directly — no collapsing to legacy 3-value set
  const intentRouteMap = {
    workflow_orchestration: 'workflow_orchestration',
    deploy:                 'deploy',
    multitask:              'multitask',
    agent_spawn:            'agent_spawn',
    db_write:               'db_write',
    db_read:                'db_read',
    supabase:               'supabase',
    r2_ops:                 'r2_ops',
    cf_ops:                 'cf_ops',
    terminal_execution:     'terminal_execution',
    browser:                'browser',
    web_search:             'agent_research',
    vectorize:              'vectorize',
    github:                 'github',
    sql_d1_generation:      'db_query',
    debug:                  'debug',
    search_code:            'search_code',
    refactor:               'refactor',
    review:                 'review',
    code:                   'code',
    plan:                   'plan',
    skill_use:              'skill_use',
    tool_use:               'tool_use',
    cms_edit:               'cms_edit',
    image_generation:       'image_generation',
    summary:                'summary',
    explain:                'explain',
    chat:                   'chat',
  };
  return { intent: intentRouteMap[taskType] ?? taskType, taskType, mode: mode || 'agent' };
}

/** Heuristic capability families for merging registry tools before routing (runs before nano capability router). */
function capabilityFamiliesFromUserMessage(message, intentResult) {
  const m = String(message || '').toLowerCase();
  const fams = new Set();
  const tt = String(intentResult?.taskType || '').toLowerCase();
  if (
    /\bd1\b|agentsam_|hyperdrive|\bsql\b|query the (?:d1 )?database|from agentsam_/i.test(m) ||
    tt.includes('sql')
  ) {
    fams.add('d1');
  }
  if (
    isCodeImplementationIntent(message) ||
    /\bgithub\b|github\.com\/|raw\.githubusercontent/i.test(m)
  ) {
    fams.add('github');
  }
  if (
    isCodeImplementationIntent(message) ||
    /\bterminal\b|run_command|\brun ls\b|\bwrangler\b|\bnpm run\b|\bbash\b/i.test(m) ||
    tt.includes('shell')
  ) {
    fams.add('terminal');
  }
  if (isCodeImplementationIntent(message)) {
    fams.add('r2');
  }
  if (
    !isCodeImplementationIntent(message) ||
    messageExplicitlyRequestsBrowserInspection(message)
  ) {
    if (
      messageHasBrowserUrlNavigation(m) ||
      /\b(browser|screenshot|inspect).*\bhttps?:\/\//i.test(m) ||
      (extractBrowserNavigateUrl(m) && /\b(inspect|screenshot|navigate|open|visit)\b/i.test(m))
    ) {
      fams.add('browser');
    }
  }
  if (hasImageGenerationIntent(message)) fams.add('image');
  if (hasVideoGenerationIntent(message)) fams.add('video');
  if (messageRequestsOpenWebSearch(message) && !messageRequestsBrowserInspect(message)) {
    fams.add('openweb');
    fams.delete('browser');
  }
  if (messageRequestsWebFetch(message)) {
    fams.add('webfetch');
    fams.delete('browser');
  }
  if (messageRequestsWorkspaceGrep(message)) {
    fams.add('workspace_grep');
    fams.delete('browser');
    fams.delete('openweb');
  }
  return [...fams];
}

/** D1 agentsam_tools-backed minimum bar + schema source of truth for agent chat. */

function agentToolDebugEnabled(env) {
  return String(env?.AGENTSAM_TOOL_DEBUG || env?.AGENT_TOOL_DEBUG || '').trim() === '1';
}

function agentToolNameOf(t) {
  return String(t?.name || t?.tool_name || '').trim();
}

function agentToolCategoryOf(t) {
  return String(t?.tool_category || t?.category || '').trim().toLowerCase();
}

function agentToolFamily(t) {
  const n = agentToolNameOf(t).toLowerCase();
  const c = agentToolCategoryOf(t);

  if (n === 'd1_query' || n.startsWith('d1_') || c.includes('d1') || c.includes('database')) return 'd1';
  if (n.startsWith('github_') || n === 'github_file' || c.includes('github')) return 'github';
  if (n === 'terminal_run' || n === 'terminal_execute' || n === 'run_command' || n === 'bash' || c.includes('terminal')) return 'terminal';
  if (
    n === 'workspace_read_file' ||
    n.startsWith('workspace_') ||
    n.startsWith('r2_') ||
    c.includes('r2') ||
    c.includes('storage')
  ) {
    return 'r2';
  }
  if (n === 'search_web') return 'openweb';
  if (n === 'web_fetch') return 'webfetch';
  if (WORKSPACE_GREP_TOOL_NAMES.has(n)) return 'workspace_grep';
  if (n.startsWith('browser_') || n.startsWith('cdt_') || n.startsWith('playwright_') || n === 'browser_content' || c.includes('browser')) return 'browser';
  if (n.startsWith('imgx_') || c.includes('image') || (c.includes('media') && !n.startsWith('moviemode_') && !n.startsWith('veo_'))) {
    return 'image';
  }
  if (n.startsWith('moviemode_') || n.startsWith('veo_') || c.includes('video')) return 'video';
  if (n.startsWith('agentsam_')) return 'agentsam';
  if (n.startsWith('ai_')) return 'ai';
  return 'general';
}

function requestedFamiliesForAgentTools(message, intentResult, capabilityDecision = null) {
  const fams = new Set(capabilityFamiliesFromUserMessage(message, intentResult));
  const d = capabilityDecision && typeof capabilityDecision === 'object' ? capabilityDecision : {};

  if (d.should_use_d1) fams.add('d1');
  if (d.should_use_github) fams.add('github');
  if (d.should_use_terminal) fams.add('terminal');
  if (d.should_use_open_web_search) {
    fams.add('openweb');
    fams.delete('browser');
  }
  if (d.should_use_web_fetch) {
    fams.add('webfetch');
    fams.delete('browser');
  }
  if (d.should_use_workspace_grep) {
    fams.add('workspace_grep');
    fams.delete('browser');
    fams.delete('openweb');
  }
  if (d.should_use_artifact_r2 || d.should_use_monaco) fams.add('r2');
  if (isCodeImplementationIntent(message) && !messageExplicitlyRequestsBrowserInspection(message)) {
    fams.add('github');
    fams.add('terminal');
    fams.add('r2');
    fams.delete('browser');
  } else if (d.should_use_browser) {
    fams.add('browser');
  }
  if (hasImageGenerationIntent(message)) fams.add('image');
  if (hasVideoGenerationIntent(message)) fams.add('video');

  return [...fams].filter(Boolean);
}

function filterAgentToolsForRequest(env, tools, message, intentResult, capabilityDecision = null) {
  if (!Array.isArray(tools) || tools.length === 0) return [];

  const families = requestedFamiliesForAgentTools(message, intentResult, capabilityDecision);
  if (!families.length) return tools;

  const wanted = new Set(families);
  const m = String(message || '').toLowerCase();

  const hardD1Ask =
    /\bd1\b|agentsam_|hyperdrive|\bsql\b|query the (?:d1 )?database|from agentsam_|pragma|select\s+count/i.test(m) ||
    String(intentResult?.taskType || '').toLowerCase().includes('sql');

  let out = tools.filter((t) => {
    const fam = agentToolFamily(t);
    if (wanted.has(fam)) return true;

    // Important: for explicit D1/database asks, do not let generic agentsam_* or ai_* tools steal the turn.
    if (hardD1Ask) return false;

    if (wanted.has('workspace_grep') && fam === 'workspace_grep') return true;
    if (wanted.has('openweb') && fam === 'openweb') return true;
    if (wanted.has('webfetch') && fam === 'webfetch') return true;

    return fam === 'general';
  });

  if (hardD1Ask) {
    const hasD1 = out.some((t) => agentToolNameOf(t) === 'd1_query');
    const d1FromOriginal = tools.find((t) => agentToolNameOf(t) === 'd1_query');
    if (!hasD1 && d1FromOriginal) out.unshift(d1FromOriginal);

    const allowImage = hasImageGenerationIntent(message);
    const allowVideo = hasVideoGenerationIntent(message);
    out = out.filter(
      (t) =>
        agentToolNameOf(t) === 'd1_query' ||
        agentToolFamily(t) === 'd1' ||
        (allowImage && agentToolFamily(t) === 'image') ||
        (allowVideo && agentToolFamily(t) === 'video'),
    );

    out.sort((a, b) => {
      const an = agentToolNameOf(a);
      const bn = agentToolNameOf(b);
      if (an === 'd1_query') return -1;
      if (bn === 'd1_query') return 1;
      return an.localeCompare(bn);
    });
  }

  if (!out.length) {
    out = tools.filter((t) => agentToolFamily(t) === 'general');
    if (!out.length) out = tools;
  }

  if (agentToolDebugEnabled(env)) {
    console.log('[agent-tools] request_scope', JSON.stringify({
      families,
      hardD1Ask,
      before_count: tools.length,
      after_count: out.length,
      before_tools: tools.map(agentToolNameOf).filter(Boolean).slice(0, 80),
      after_tools: out.map(agentToolNameOf).filter(Boolean).slice(0, 80),
    }));
  }

  return out;
}


/** Legacy workflow_key for historical rows only — chat tools no longer INSERT agentsam_workflow_runs. */
const CHAT_TOOL_SESSION_LEDGER_KIND = 'chat_tool_session';

const AGENT_CHAT_MINIMUM_AGENTSAM_TOOLS = [
  'd1_query',
  'github_file',
  'terminal_run',
  'r2_read',
  'r2_write',
  'cdt_take_screenshot',
];

/** /dashboard/agent surface capability → concrete tool names (ensure in chat tool bar). */
const AGENT_DASHBOARD_SURFACE_CAPABILITY_TOOLS = {
  open_browser: ['cdt_take_screenshot', 'browser_navigate'],
  workspace_read_file: ['workspace_read_file'],
  terminal_execute: ['terminal_execute'],
  d1_query: ['d1_query'],
};

const AGENT_DASHBOARD_SURFACE_CAPABILITY_REQUIRES_APPROVAL = new Set(['terminal_execute']);

const TOOL_OUTPUT_SSE_MAX = 12000;

function inputSchemaFromAgentsamToolRow(row) {
  const parsed = parseJsonSafe(row?.input_schema, null);
  if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
    const o = { ...parsed };
    if (!o.type) o.type = 'object';
    return o;
  }
  const hc = parseJsonSafe(row?.handler_config, null);
  if (hc && typeof hc === 'object') {
    if (hc.parameters && typeof hc.parameters === 'object') {
      const o = { ...hc.parameters };
      if (!o.type) o.type = 'object';
      return o;
    }
    if (hc.input_schema && typeof hc.input_schema === 'object') {
      const o = { ...hc.input_schema };
      if (!o.type) o.type = 'object';
      return o;
    }
  }
  return { type: 'object', properties: {} };
}

async function fetchAgentsamToolRowsByName(env, names) {
  if (!env?.DB || !names.length) return [];
  const placeholders = names.map(() => '?').join(',');
  try {
    const { results } = await env.DB.prepare(
      `SELECT tool_name, description, input_schema, handler_config, tool_category, requires_approval
       FROM agentsam_tools
       WHERE COALESCE(is_active, 1) = 1 AND tool_name IN (${placeholders})`,
    )
      .bind(...names)
      .all();
    return results || [];
  } catch (e) {
    console.warn('[agent] fetchAgentsamToolRowsByName', e?.message ?? e);
    return [];
  }
}

function chatModeUsesToolLoop(mode) {
  const m = String(mode || '').toLowerCase();
  return m === 'agent' || m === 'debug' || m === 'multitask' || m === 'ask';
}

function shouldOpenChatToolSessionLedger({ chatAgentRunId, mode, tools, chatToolLedger }) {
  if (!chatAgentRunId || chatToolLedger) return false;
  const m = String(mode || '').toLowerCase();
  if (m === 'plan') return false;
  if (!chatModeUsesToolLoop(mode)) return false;
  return Array.isArray(tools) && tools.length > 0;
}

async function enrichToolsFromAgentsamCatalog(env, tools, mode, effectiveMaxTools, opts = {}) {
  if (!chatModeUsesToolLoop(mode) || !env?.DB) return tools;
  const nameSet = new Set(tools.map((t) => String(t.name)));
  const imageCapabilityTools =
    opts.imageCapabilityIntent && opts.workspaceId
      ? await getCapabilityTools(env, opts.workspaceId, mode, 'image_capability')
      : [];
  const videoCapabilityTools =
    opts.videoCapabilityIntent && opts.workspaceId
      ? await getCapabilityTools(env, opts.workspaceId, mode, 'video_capability')
      : [];
  const fetchNames = [
    ...new Set([
      ...nameSet,
      ...AGENT_CHAT_MINIMUM_AGENTSAM_TOOLS,
      ...imageCapabilityTools,
      ...videoCapabilityTools,
    ]),
  ];
  const rows = await fetchAgentsamToolRowsByName(env, fetchNames);
  const byName = Object.fromEntries(rows.map((r) => [String(r.tool_name), r]));

  const out = [];
  for (const t of tools) {
    const row = byName[t.name];
    if (row) {
      out.push({
        ...t,
        description: String(row.description || t.description || t.name).slice(0, 4000),
        input_schema: inputSchemaFromAgentsamToolRow(row),
      });
    } else {
      out.push(t);
    }
  }
  const seen = new Set(out.map((x) => x.name));
  const minimumBar = opts.codeImplementationIntent
    ? [...CODE_IMPLEMENTATION_TOOL_NAMES]
    : [...AGENT_CHAT_MINIMUM_AGENTSAM_TOOLS];
  if (opts.imageCapabilityIntent && imageCapabilityTools.length) {
    for (const t of imageCapabilityTools) {
      if (!minimumBar.includes(t)) minimumBar.unshift(t);
    }
  }
  if (opts.videoCapabilityIntent && videoCapabilityTools.length) {
    for (const t of videoCapabilityTools) {
      if (!minimumBar.includes(t)) minimumBar.unshift(t);
    }
  }
  for (const req of minimumBar) {
    if (seen.has(req)) continue;
    if (out.length >= effectiveMaxTools) break;
    const row = byName[req];
    if (!row) continue;
    seen.add(req);
    out.push({
      name: req,
      description: String(row.description || req).slice(0, 4000),
      input_schema: inputSchemaFromAgentsamToolRow(row),
      tool_category: String(row.tool_category || 'builtin'),
      requires_approval: Number(row.requires_approval || 0) === 1,
    });
  }
  return out;
}

/** Guarantee DB-tagged capability tools survive narrowing (image / video families). */
async function ensureCapabilityTools(
  env,
  tools,
  intentFlag,
  intentCategoryTag,
  effectiveMaxTools,
  workspaceId,
  mode,
) {
  if (!intentFlag || !env?.DB || !Array.isArray(tools)) return tools;
  const have = new Set(tools.map((t) => agentToolNameOf(t)).filter(Boolean));
  const capabilityTools = await getCapabilityTools(env, workspaceId, mode, intentCategoryTag);
  const missing = capabilityTools.filter((n) => !have.has(n));
  if (!missing.length) return tools;
  const rows = await fetchAgentsamToolRowsByName(env, missing);
  const out = [...tools];
  const seen = new Set(have);
  for (const row of rows) {
    const nm = String(row.tool_name || '');
    if (!nm || seen.has(nm)) continue;
    if (out.length >= effectiveMaxTools) break;
    seen.add(nm);
    out.push({
      name: nm,
      description: String(row.description || nm).slice(0, 4000),
      input_schema: inputSchemaFromAgentsamToolRow(row),
      tool_category: String(row.tool_category || 'builtin'),
      requires_approval: Number(row.requires_approval || 0) === 1,
    });
  }
  return out;
}

async function ensureImageCapabilityTools(env, tools, imageCapabilityIntent, effectiveMaxTools, workspaceId, mode) {
  return ensureCapabilityTools(
    env,
    tools,
    imageCapabilityIntent,
    'image_capability',
    effectiveMaxTools,
    workspaceId,
    mode,
  );
}

async function ensureVideoCapabilityTools(env, tools, videoCapabilityIntent, effectiveMaxTools, workspaceId, mode) {
  return ensureCapabilityTools(
    env,
    tools,
    videoCapabilityIntent,
    'video_capability',
    effectiveMaxTools,
    workspaceId,
    mode,
  );
}

/** Guarantee Monaco / GitHub / R2 / terminal tools for in-repo implementation work. */
async function ensureCodeCapabilityTools(env, tools, effectiveMaxTools) {
  if (!env?.DB || !Array.isArray(tools)) return tools;
  const have = new Set(tools.map((t) => agentToolNameOf(t)).filter(Boolean));
  const missing = CODE_IMPLEMENTATION_TOOL_NAMES.filter((n) => !have.has(n));
  if (!missing.length) return tools;
  const rows = await fetchAgentsamToolRowsByName(env, missing);
  const out = [...tools];
  const seen = new Set(have);
  for (const row of rows) {
    const nm = String(row.tool_name || '');
    if (!nm || seen.has(nm)) continue;
    if (out.length >= effectiveMaxTools) break;
    seen.add(nm);
    out.unshift({
      name: nm,
      description: String(row.description || nm).slice(0, 4000),
      input_schema: inputSchemaFromAgentsamToolRow(row),
      tool_category: String(row.tool_category || 'builtin'),
      requires_approval: Number(row.requires_approval || 0) === 1,
    });
  }
  return out;
}

/** Inject GitHub/R2 tools when the editor has an open bound buffer. */
export async function ensureActiveFileCapabilityTools(env, tools, effectiveMaxTools, envelope) {
  if (!env?.DB || !Array.isArray(tools) || !envelope) return tools;
  const names = [];
  if (activeFileIsGithubBound(envelope)) {
    names.push('github_file', 'github_update_file');
  } else if (activeFileIsLocalWorkspaceBuffer(envelope)) {
    names.push('fs_search_files', 'terminal_execute');
  }
  if (envelope.r2_key) {
    names.push('r2_read', 'r2_write');
  }
  if (!names.length) return tools;
  const have = new Set(tools.map((t) => agentToolNameOf(t)).filter(Boolean));
  const missing = names.filter((n) => !have.has(n));
  if (!missing.length) return tools;
  const rows = await fetchAgentsamToolRowsByName(env, missing);
  const out = [...tools];
  const seen = new Set(have);
  for (const row of rows) {
    const nm = String(row.tool_name || '');
    if (!nm || seen.has(nm)) continue;
    if (out.length >= effectiveMaxTools) break;
    seen.add(nm);
    out.unshift({
      name: nm,
      description: String(row.description || nm).slice(0, 4000),
      input_schema: inputSchemaFromAgentsamToolRow(row),
      tool_category: String(row.tool_category || 'builtin'),
      requires_approval: Number(row.requires_approval || 0) === 1,
    });
  }
  return out;
}

/** Inject open-web / web_fetch catalog tools when lane routing requires them. */
async function ensureWebLaneTools(env, tools, effectiveMaxTools, laneResult, openWebBackend) {
  if (!env?.DB || !Array.isArray(tools) || !laneResult) return tools;
  const lane = laneResult.primary_lane;
  const names = [];
  if (lane === 'open_web_search' && laneResult.open_web_allowed && openWebBackend?.available) {
    names.push('search_web');
  }
  if (lane === 'web_fetch' || lane === 'open_web_search') {
    names.push('web_fetch');
  }
  if (!names.length) return tools;
  const have = new Set(tools.map((t) => agentToolNameOf(t)).filter(Boolean));
  const missing = names.filter((n) => !have.has(n));
  if (!missing.length) return tools;
  const rows = await fetchAgentsamToolRowsByName(env, missing);
  const out = [...tools];
  const seen = new Set(have);
  for (const row of rows) {
    const nm = String(row.tool_name || '');
    if (!nm || seen.has(nm)) continue;
    if (out.length >= effectiveMaxTools) break;
    seen.add(nm);
    out.unshift({
      name: nm,
      description: String(row.description || nm).slice(0, 4000),
      input_schema: inputSchemaFromAgentsamToolRow(row),
      tool_category: String(row.tool_category || 'research'),
      requires_approval: Number(row.requires_approval || 0) === 1,
    });
  }
  return out;
}

/** Guarantee browser_navigate survives lane/cap narrowing when URL navigation is intended. */
async function ensureBrowserCapabilityTools(env, tools, effectiveMaxTools) {
  if (!env?.DB || !Array.isArray(tools)) return tools;
  const have = new Set(tools.map((t) => agentToolNameOf(t)).filter(Boolean));
  const missing = BROWSER_CAPABILITY_TOOL_NAMES.filter((n) => !have.has(n));
  if (!missing.length) return tools;
  const rows = await fetchAgentsamToolRowsByName(env, missing);
  const out = [...tools];
  const seen = new Set(have);
  for (const row of rows) {
    const nm = String(row.tool_name || '');
    if (!nm || seen.has(nm)) continue;
    seen.add(nm);
    out.unshift({
      name: nm,
      description: String(row.description || nm).slice(0, 4000),
      input_schema: inputSchemaFromAgentsamToolRow(row),
      tool_category: String(row.tool_category || 'browser'),
      requires_approval: Number(row.requires_approval || 0) === 1,
    });
  }
  const cap = Math.max(1, Number(effectiveMaxTools) || 8);
  return out.slice(0, cap);
}

/** Merge agentsam_prompt_routes.tool_keys into the model manifest (D1 route contract). */
async function mergeToolsFromPromptRouteKeys(env, tools, promptRouteRow, effectiveMaxTools) {
  const keys = parseJsonSafe(promptRouteRow?.tool_keys, null);
  if (!Array.isArray(keys) || !keys.length || !env?.DB) return tools;
  const have = new Set((tools || []).map((t) => agentToolNameOf(t)).filter(Boolean));
  const missing = keys
    .map((k) => String(k || '').trim())
    .filter((k) => k && !have.has(k));
  if (!missing.length) return tools;
  const rows = await fetchAgentsamToolRowsByName(env, missing);
  const out = [...(tools || [])];
  const seen = new Set(have);
  for (const row of rows) {
    const nm = String(row.tool_name || '');
    if (!nm || seen.has(nm)) continue;
    seen.add(nm);
    out.unshift({
      name: nm,
      description: String(row.description || nm).slice(0, 4000),
      input_schema: inputSchemaFromAgentsamToolRow(row),
      tool_category: String(row.tool_category || 'browser'),
      requires_approval: Number(row.requires_approval || 0) === 1,
    });
  }
  const cap = Math.max(1, Number(effectiveMaxTools) || 8);
  return out.slice(0, cap);
}

function isAgentDashboardSurfaceRoute(dashboardRoute) {
  const r = dashboardRoute != null ? String(dashboardRoute).trim() : '';
  return r === '/dashboard/agent' || r.startsWith('/dashboard/agent/');
}

/** Guarantee /dashboard/agent capability tools survive narrowing; terminal_execute requires approval. */
async function ensureAgentDashboardSurfaceCapabilityTools(env, tools, effectiveMaxTools, dashboardRoute) {
  if (!isAgentDashboardSurfaceRoute(dashboardRoute) || !env?.DB || !Array.isArray(tools)) {
    return tools;
  }
  const have = new Set(tools.map((t) => agentToolNameOf(t)).filter(Boolean));
  const required = [
    ...new Set(
      Object.values(AGENT_DASHBOARD_SURFACE_CAPABILITY_TOOLS).flatMap((names) => names),
    ),
  ];
  const missing = required.filter((n) => !have.has(n));
  if (!missing.length) {
    return tools.map((t) => {
      const nm = agentToolNameOf(t);
      if (nm && AGENT_DASHBOARD_SURFACE_CAPABILITY_REQUIRES_APPROVAL.has(nm)) {
        return { ...t, requires_approval: true };
      }
      return t;
    });
  }
  const rows = await fetchAgentsamToolRowsByName(env, missing);
  const out = [...tools];
  const seen = new Set(have);
  for (const row of rows) {
    const nm = String(row.tool_name || '');
    if (!nm || seen.has(nm)) continue;
    if (out.length >= effectiveMaxTools) break;
    seen.add(nm);
    out.push({
      name: nm,
      description: String(row.description || nm).slice(0, 4000),
      input_schema: inputSchemaFromAgentsamToolRow(row),
      tool_category: String(row.tool_category || 'builtin'),
      requires_approval:
        AGENT_DASHBOARD_SURFACE_CAPABILITY_REQUIRES_APPROVAL.has(nm) ||
        Number(row.requires_approval || 0) === 1,
    });
  }
  return out.map((t) => {
    const nm = agentToolNameOf(t);
    if (nm && AGENT_DASHBOARD_SURFACE_CAPABILITY_REQUIRES_APPROVAL.has(nm)) {
      return { ...t, requires_approval: true };
    }
    return t;
  });
}

function chatToolSessionSseBase(ledger) {
  const runId = ledger?.runId != null ? String(ledger.runId).trim() : '';
  return {
    run_id: runId,
    agent_run_id: runId,
    spine: 'agent_run',
    ledger_kind: CHAT_TOOL_SESSION_LEDGER_KIND,
    requested_mode: ledger?.requestedMode != null ? String(ledger.requestedMode) : null,
  };
}

/** In-memory tool-session ledger keyed on agentsam_agent_run.id (no agentsam_workflow_runs row). */
function createChatToolSessionLedger(p) {
  const {
    tenantId,
    workspaceId,
    userId,
    sessionId,
    modelKey,
    stepsTotal,
    chatAgentRunId,
    requestedMode,
  } = p;
  const runId = chatAgentRunId != null ? String(chatAgentRunId).trim() : '';
  if (!runId || !tenantId || !workspaceId) return null;

  const routingArmId =
    p.routingArmId != null
      ? String(p.routingArmId).trim()
      : p.routing_arm_id != null
        ? String(p.routing_arm_id).trim()
        : null;

  return {
    runId,
    steps: [],
    startedAt: Date.now(),
    stepsTotal: Math.max(1, Number(stepsTotal) || 1),
    tenantId: String(tenantId).trim(),
    workspaceId: String(workspaceId).trim(),
    modelKey: modelKey != null ? String(modelKey) : null,
    sessionId: sessionId != null ? String(sessionId) : null,
    conversationId: sessionId != null ? String(sessionId) : null,
    chatAgentRunId: runId,
    routingArmId: routingArmId || null,
    requestedMode: requestedMode != null ? String(requestedMode) : 'agent',
  };
}

/** @returns {Promise<null>} execution_step id (unused; tool rows via scheduleAgentsamToolCallLog). */
async function appendChatToolSessionLedgerStep(env, emit, ledger, stepEntry) {
  if (!ledger?.runId) return null;
  ledger.steps.push(stepEntry);
  emit('workflow_step', {
    ...chatToolSessionSseBase(ledger),
    node_key: stepEntry.tool_name,
    current_node_key: stepEntry.tool_name,
    tool_name: stepEntry.tool_name,
    steps_completed: ledger.steps.length,
    steps_total: ledger.stepsTotal,
    ok: stepEntry.ok,
    output_preview: String(stepEntry.output_preview || '').slice(0, 4000),
  });
  if (env?.DB) {
    const dur = Math.max(0, Math.floor(Number(stepEntry.duration_ms) || 0));
    const outJson = JSON.stringify({
      ok: !!stepEntry.ok,
      output_preview: String(stepEntry.output_preview || '').slice(0, 12000),
      duration_ms: dur,
    }).slice(0, 16000);
    const errJson = stepEntry.ok
      ? null
      : JSON.stringify({ message: String(stepEntry.error || 'failed').slice(0, 4000) }).slice(0, 8000);
    void insertAgentRunExecutionStep(env, {
      agentRunId: ledger.runId,
      nodeKey: stepEntry.tool_name,
      nodeType: 'mcp_tool',
      status: stepEntry.ok ? 'success' : 'failed',
      latencyMs: dur,
      outputJson: outJson,
      errorJson: errJson,
    });
  }
  return null;
}

async function finalizeChatToolSessionLedger(_env, _ctx, emit, ledger, { ok, errorMessage } = {}) {
  if (!ledger?.runId) return;
  const err = ok ? null : String(errorMessage || 'chat_tool_session_failed').slice(0, 4000);
  const base = chatToolSessionSseBase(ledger);
  if (ok) {
    emit('workflow_complete', {
      ...base,
      status: 'completed',
      message: `Executed ${ledger.steps.length} tool call(s).`,
      steps_completed: ledger.steps.length,
    });
  } else {
    emit('workflow_error', {
      ...base,
      status: 'failed',
      message: err || 'failed',
    });
  }
}

/**
 * Workspace MCP tool library: global workspace_scope + workspace-specific overrides.
 * Workspace-scoped rows win on duplicate tool_name.
 */
async function loadAgentsamMcpToolsWorkspaceLibrary(env, workspaceId, limit = 200) {
  const ws = workspaceId != null ? String(workspaceId).trim() : '';
  if (!env?.DB || !ws) return [];
  const lim = Math.max(1, Math.min(500, Number(limit) || 200));
  try {
    const { results } = await env.DB.prepare(
      `SELECT COALESCE(tool_name, tool_key) AS tool_name, description, input_schema, tool_category,
              requires_approval, workspace_scope
       FROM agentsam_tools
       WHERE COALESCE(is_active, 1) = 1
         AND COALESCE(is_degraded, 0) = 0
         AND (
           COALESCE(is_global, 1) = 1
           OR workspace_scope IS NULL OR trim(workspace_scope) IN ('', '[]')
           OR workspace_scope LIKE '%"*"%'
           OR instr(COALESCE(workspace_scope, ''), ?) > 0
         )
       ORDER BY COALESCE(tool_name, tool_key) ASC
       LIMIT ?`,
    )
      .bind(ws, lim * 4)
      .all();
    const rows = results || [];
    const byName = new Map();
    const isGlobalScope = (scopeRaw) => {
      const s = scopeRaw != null ? String(scopeRaw).trim() : '';
      return !s || s === '[]' || s.includes('"*"');
    };
    for (const r of rows) {
      const key = String(r.tool_name || '').trim();
      if (!key) continue;
      if (isGlobalScope(r.workspace_scope)) {
        if (!byName.has(key)) byName.set(key, r);
      }
    }
    for (const r of rows) {
      const key = String(r.tool_name || '').trim();
      if (!key) continue;
      const scope = r.workspace_scope != null ? String(r.workspace_scope) : '';
      if (scope && scope.includes(ws) && !isGlobalScope(scope)) {
        byName.set(key, r);
      }
    }
    return [...byName.values()].slice(0, lim);
  } catch (e) {
    console.warn('[agent] loadAgentsamMcpToolsWorkspaceLibrary', e?.message ?? e);
    return [];
  }
}

async function loadToolsForRequest(env, modeSlug, _intent, opts = {}) {
  const lim = Math.max(0, Math.min(200, Number(opts.limit ?? 20) || 20));
  if (!env.DB) return { tools: [], toolRoutingError: null, routeToolRequirements: null };
  const policy = await loadModeToolPolicy(env, modeSlug, {
    routeKey: opts.routeKey,
    taskType: opts.taskType,
  });
  const mcpScope = {
    userId: opts.userId,
    tenantId: opts.tenantId,
    workspaceId: opts.workspaceId,
    personUuid: opts.personUuid,
  };
  const catalogLimit = Math.min(200, Math.max(lim, Number(opts.catalogLimit) || Math.min(96, lim * 4)));
  const useBranded = opts.useBrandedCatalog !== false;
  /** @type {any} */
  let routeToolRequirements = null;
  /** @type {{ code: string, message: string, missing: string[] }|null} */
  let toolRoutingError = null;
  let rows = [];

  let allowlistKeys = null;
  const uid = opts.userId != null ? String(opts.userId).trim() : '';
  const wsId = opts.workspaceId != null ? String(opts.workspaceId).trim() : '';
  const tid = opts.tenantId != null ? String(opts.tenantId).trim() : '';
  const pid = opts.personUuid != null ? String(opts.personUuid).trim() : '';
  if (wsId && (uid || tid || pid)) {
    try {
      allowlistKeys = await collectAllowlistToolKeysForScope(env.DB, {
        userId: uid,
        workspaceId: wsId,
        tenantId: tid,
        personUuid: pid,
      });
    } catch (e) {
      console.warn('[agent] mcp allowlist preload', e?.message ?? e);
    }
  }

  let mcpServerKeys = parseMcpTemplateServerKeys(opts.mcpTemplate);
  if (!mcpServerKeys.length && opts.routeKey) {
    mcpServerKeys = await loadPromptRouteMcpServerKeys(env.DB, opts.routeKey, opts.tenantId);
  }

  if (opts.agentChat && useBranded) {
    routeToolRequirements = await resolveAgentChatRouteToolRequirements(env, {
      routeKey: opts.routeKey,
      taskType: opts.taskType,
      modeSlug,
    });
    const modelCap = maxModelToolsForAgentTask(opts.taskType, modeSlug);
    const prMax =
      opts.promptRouteMaxTools != null && Number.isFinite(Number(opts.promptRouteMaxTools))
        ? Number(opts.promptRouteMaxTools)
        : null;
    const mergedMax = effectiveAgentChatToolCap({
      promptRouteMax: prMax,
      routeReqMax: routeToolRequirements?.max_tools,
      modelCap,
      requestLimit: lim,
    });
    routeToolRequirements = {
      ...routeToolRequirements,
      max_tools: mergedMax,
    };
    if (mergedMax === 0) {
      return { tools: [], toolRoutingError: null, routeToolRequirements };
    }
    const det = await selectAgentsamToolsForAgentChat(env.DB, mcpScope, {
      routeToolRequirements,
      message: opts.message,
      taskType: opts.taskType,
      modeSlug,
      catalogLimit,
      outputLimit: mergedMax,
      allowlistKeys,
      mcpServerKeys,
    });
    if (det.missingRequiredCapabilities?.length) {
      const miss = det.missingRequiredCapabilities;
      console.error(
        '[agent] tool_routing_missing_required',
        JSON.stringify({
          missing: miss,
          route_key: routeToolRequirements.route_key,
          task_type: routeToolRequirements.task_type,
        }),
      );
      toolRoutingError = {
        code: 'MISSING_REQUIRED_CAPABILITY',
        message: `Missing required tool capabilities for this route: ${miss.join(', ')}`,
        missing: miss,
      };
      rows = [];
    } else {
      rows = det.rows;
    }
  } else if (useBranded) {
    rows = await selectAgentsamToolsForChatRuntime(env.DB, mcpScope, {
      outputLimit: lim,
      message: opts.message,
      modeSlug,
      allowlistKeys,
    });
  } else {
    rows = await selectAgentsamToolsForChatRuntime(env.DB, mcpScope, {
      outputLimit: lim,
      message: opts.message,
      modeSlug,
      allowlistKeys,
    });
  }

  if (!toolRoutingError && opts.agentChat && opts.taskType && routeToolRequirements?.max_tools != null) {
    const effCap = Math.max(0, Math.floor(Number(routeToolRequirements.max_tools)));
    if (effCap === 0) {
      rows = [];
    } else if (rows.length > effCap) {
      rows = rows.slice(0, effCap);
    }
  }
  if (allowlistKeys?.size) {
    rows = rows.filter((r) => {
      const name = String(r.tool_name || r.name || '').trim();
      const key = String(r.tool_key || name).trim();
      return allowlistKeys.has(name) || allowlistKeys.has(key);
    });
  }
  if (policy.allowTools.length) {
    const allow = new Set(policy.allowTools);
    rows = rows.filter((r) => allow.has(String(r.tool_name || r.name || '')));
  }
  if (policy.denyTools.length) {
    const deny = new Set(policy.denyTools);
    rows = rows.filter((r) => !deny.has(String(r.tool_name || r.name || '')));
  }
  const preferredKeys = Array.isArray(opts.preferredToolKeys)
    ? opts.preferredToolKeys.map((k) => String(k || '').trim()).filter(Boolean)
    : [];
  if (preferredKeys.length && rows.length) {
    const prefSet = new Set(preferredKeys);
    const preferred = [];
    const rest = [];
    for (const r of rows) {
      const name = String(r.tool_name || r.name || '').trim();
      if (prefSet.has(name)) preferred.push(r);
      else rest.push(r);
    }
    rows = [...preferred, ...rest];
  }
  const tools = rows.map((r) => ({
    name: String(r.tool_name || r.name || ''),
    description: String(r.description || ''),
    input_schema: parseJsonSafe(r.input_schema, { type: 'object', properties: {} }),
    tool_category: String(r.tool_category || 'builtin'),
    requires_approval: Number(r.requires_approval || 0) === 1,
  }));
  return { tools, toolRoutingError, routeToolRequirements };
}

function inferRiskLevel(toolName, category = '', rowRiskLevel = '') {
  const r = String(rowRiskLevel || '').toLowerCase();
  if (r === 'critical' || r === 'high') return r;
  const t = String(toolName || '').toLowerCase();
  const c = String(category || '').toLowerCase();
  if (WRITE_LIKE_PREFIXES.some((p) => t.startsWith(p))) return 'high';
  if (TERM_WRITE_TOOLS.has(t)) return 'high';
  if (c === 'terminal' || c === 'deploy') return 'high';
  if (c === 'd1' || c === 'r2') return 'medium';
  return 'low';
}

/**
 * Tool-call validator (hot path)
 *
 * New contract (runtime spine): validateToolCall(env, profile, toolCall, mcpRuntimeContext, userPolicy)
 * - Enforces compiled RuntimeProfile.tool_policy + write_policy (+ debug_policy phase gates)
 * - Honors require_approval tools by returning `requiresConfirmation: true` (not allowed)
 *
 * Compatibility (legacy callers): validateToolCall(env, modeSlug, toolName, ...)
 * - Must not be used by the runtime spine/controllers path.
 *
 * @param {any} env
 * @param {import('../core/runtime-profile.types.js').RuntimeProfile|string} profileOrMode
 * @param {{ name?: string }|string} toolCallOrName
 * @param {Record<string, unknown>} mcpRuntimeContext
 * @param {any} userPolicy
 */
async function validateToolCall(env, profileOrMode, toolCallOrName, mcpRuntimeContext = {}, userPolicy = null) {
  const ctxRouteKey =
    mcpRuntimeContext.routeKey != null && String(mcpRuntimeContext.routeKey).trim() !== ''
      ? String(mcpRuntimeContext.routeKey).trim()
      : '';
  const routeKeyOut = (rk) =>
    (rk != null && String(rk).trim() !== '' ? String(rk).trim() : null) || ctxRouteKey || null;
  const name =
    typeof toolCallOrName === 'string'
      ? String(toolCallOrName || '').trim()
      : String(toolCallOrName?.name || '').trim();
  if (name === CODEMODE_TOOL_NAME && env?.LOADER) {
    return {
      allowed: true,
      reason: 'allowed',
      riskLevel: 'low',
      requiresConfirmation: false,
      mcpToolId: null,
      toolKey: CODEMODE_TOOL_NAME,
      capabilityKey: null,
      handlerKey: null,
      routeKey: routeKeyOut(null),
      serverKey: null,
      mcpServerId: null,
      agentsamToolsId: null,
    };
  }
  if (!name) {
    return {
      allowed: false,
      reason: 'missing tool name',
      riskLevel: 'blocked',
      requiresConfirmation: false,
      mcpToolId: null,
      toolKey: null,
      capabilityKey: null,
      handlerKey: null,
      routeKey: routeKeyOut(null),
      serverKey: null,
      mcpServerId: null,
      agentsamToolsId: null,
    };
  }

  const toolInput =
    typeof toolCallOrName === 'object' && toolCallOrName && typeof toolCallOrName.input === 'object'
      ? toolCallOrName.input
      : null;
  if (name === 'knowledge_search' || name === 'ss_search_knowledge') {
    const query =
      toolInput?.query ??
      toolInput?.q ??
      toolInput?.search_query ??
      toolInput?.search ??
      toolInput?.text ??
      '';
    if (!String(query).trim()) {
      return {
        allowed: false,
        reason: 'knowledge_search_query_missing',
        riskLevel: 'blocked',
        requiresConfirmation: false,
        mcpToolId: null,
        toolKey: name,
        capabilityKey: null,
        handlerKey: null,
        routeKey: routeKeyOut(null),
        serverKey: null,
        mcpServerId: null,
        agentsamToolsId: null,
      };
    }
  }

  const uid = mcpRuntimeContext.userId != null ? String(mcpRuntimeContext.userId).trim() : '';
  const ws =
    mcpRuntimeContext.workspaceId != null ? String(mcpRuntimeContext.workspaceId).trim() : '';
  const policyRow = userPolicy || (await loadAgentSamUserPolicy(env, uid, ws));

  if (isSubagentToolName(name) && Number(policyRow.allow_subagent_spawn ?? 1) !== 1) {
    return {
      allowed: false,
      reason: 'subagent spawn disabled by policy',
      riskLevel: 'blocked',
      requiresConfirmation: false,
      mcpToolId: null,
      toolKey: name,
      capabilityKey: null,
      handlerKey: null,
      routeKey: routeKeyOut(null),
      serverKey: null,
      mcpServerId: null,
      agentsamToolsId: null,
    };
  }

  const runtimeProfile =
    typeof profileOrMode === 'object' && profileOrMode
      ? profileOrMode
      : (mcpRuntimeContext.runtimeProfile || mcpRuntimeContext.runtime_profile || null);

  // Enforce the compiled RuntimeProfile tool policy first (no guessing, no promotions).
  const compiledToolPolicy = runtimeProfile?.tool_policy || null;
  if (compiledToolPolicy?.denylist?.includes(name)) {
    return {
      allowed: false,
      reason: 'blocked by profile tool_policy denylist',
      riskLevel: 'blocked',
      requiresConfirmation: false,
      mcpToolId: null,
      toolKey: name,
      capabilityKey: null,
      handlerKey: null,
      routeKey: routeKeyOut(null),
      serverKey: null,
      mcpServerId: null,
      agentsamToolsId: null,
    };
  }
  if (compiledToolPolicy?.require_approval?.includes(name)) {
    return {
      allowed: false,
      reason: 'requires approval',
      riskLevel: 'blocked',
      requiresConfirmation: true,
      mcpToolId: null,
      toolKey: name,
      capabilityKey: null,
      handlerKey: null,
      routeKey: routeKeyOut(null),
      serverKey: null,
      mcpServerId: null,
      agentsamToolsId: null,
    };
  }
  if (compiledToolPolicy?.allowlist?.length && !compiledToolPolicy.allowlist.includes(name)) {
    return {
      allowed: false,
      reason: 'not in profile tool_policy allowlist',
      riskLevel: 'blocked',
      requiresConfirmation: false,
      mcpToolId: null,
      toolKey: name,
      capabilityKey: null,
      handlerKey: null,
      routeKey: routeKeyOut(null),
      serverKey: null,
      mcpServerId: null,
      agentsamToolsId: null,
    };
  }

  // Legacy (non-spine) compatibility: deny by mode policy when a modeSlug is explicitly passed.
  const modeSlug = typeof profileOrMode === 'string' ? profileOrMode : runtimeProfile?.mode;
  const policy =
    typeof profileOrMode === 'string'
      ? await loadModeToolPolicy(env, modeSlug, {
          routeKey: ctxRouteKey || null,
          taskType:
            mcpRuntimeContext.taskType != null && String(mcpRuntimeContext.taskType).trim() !== ''
              ? String(mcpRuntimeContext.taskType).trim()
              : mcpRuntimeContext.task_type != null && String(mcpRuntimeContext.task_type).trim() !== ''
                ? String(mcpRuntimeContext.task_type).trim()
                : null,
        })
      : { denyTools: [], allowTools: [] };
  if (policy.denyTools.includes(name)) {
    return {
      allowed: false,
      reason: 'blocked by legacy mode policy',
      riskLevel: 'blocked',
      requiresConfirmation: false,
      mcpToolId: null,
      toolKey: name,
      capabilityKey: null,
      handlerKey: null,
      routeKey: routeKeyOut(null),
      serverKey: null,
      mcpServerId: null,
      agentsamToolsId: null,
    };
  }
  const writePolicy =
    mcpRuntimeContext.writePolicy != null
      ? mcpRuntimeContext.writePolicy
      : mcpRuntimeContext.write_policy != null
        ? mcpRuntimeContext.write_policy
        : null;
  const debugPolicy = runtimeProfile?.debug_policy || null;

  if (
    debugPolicy &&
    (runtimeProfile?.mode === 'debug' ||
      runtimeProfile?.execution_kind === 'debug_investigation_loop')
  ) {
    const t = String(name || '').toLowerCase();
    const isTerminal = TERM_WRITE_TOOLS.has(t);
    const isWriteLike = WRITE_LIKE_PREFIXES.some((p) => t.startsWith(p));
    const isDeployLike = t.includes('deploy') || t === 'worker_deploy' || t.startsWith('worker_deploy');

    if (debugPolicy.evidence_required_before_write && (isTerminal || isWriteLike)) {
      if (debugPolicy.phase === 'hypothesize' || debugPolicy.phase === 'inspect' || debugPolicy.phase === 'instrument') {
        return {
          allowed: false,
          reason: `debug phase gate: writes blocked in ${debugPolicy.phase}`,
          riskLevel: 'blocked',
          requiresConfirmation: false,
          mcpToolId: null,
          toolKey: name,
          capabilityKey: null,
          handlerKey: null,
          routeKey: routeKeyOut(null),
          serverKey: null,
          mcpServerId: null,
          agentsamToolsId: null,
        };
      }
    }

    if (debugPolicy.evidence_required_before_deploy && isDeployLike) {
      if (debugPolicy.phase !== 'verify' && debugPolicy.phase !== 'cleanup') {
        return {
          allowed: false,
          reason: `debug phase gate: deploy blocked in ${debugPolicy.phase}`,
          riskLevel: 'blocked',
          requiresConfirmation: false,
          mcpToolId: null,
          toolKey: name,
          capabilityKey: null,
          handlerKey: null,
          routeKey: routeKeyOut(null),
          serverKey: null,
          mcpServerId: null,
          agentsamToolsId: null,
        };
      }
    }
  }
  if (writePolicy) {
    const { toolBlockedByWritePolicy } = await import('../core/agent-mode-tool-policy.js');
    if (
      toolBlockedByWritePolicy(writePolicy, name, {
        userMessage:
          mcpRuntimeContext.userMessage != null
            ? String(mcpRuntimeContext.userMessage)
            : mcpRuntimeContext.message != null
              ? String(mcpRuntimeContext.message)
              : null,
      })
    ) {
      return {
        allowed: false,
        reason: 'blocked by write policy',
        riskLevel: 'blocked',
        requiresConfirmation: false,
        mcpToolId: null,
        toolKey: name,
        capabilityKey: null,
        handlerKey: null,
        routeKey: routeKeyOut(null),
        serverKey: null,
        mcpServerId: null,
        agentsamToolsId: null,
      };
    }
  }
  let row = null;
  if (env.DB) {
    row = await loadAgentsamToolRow(env, name);
    if (!row) {
      return {
        allowed: false,
        reason: 'agentsam_tools not found',
        riskLevel: 'blocked',
        requiresConfirmation: false,
        mcpToolId: null,
        toolKey: name,
        capabilityKey: null,
        handlerKey: null,
        routeKey: routeKeyOut(null),
        serverKey: null,
        mcpServerId: null,
        agentsamToolsId: null,
      };
    }
  }

  const allowRes = await isToolAllowedByAllowlist(
    env,
    policyRow,
    {
      userId: mcpRuntimeContext.userId,
      workspaceId: mcpRuntimeContext.workspaceId,
      tenantId: mcpRuntimeContext.tenantId,
      personUuid: mcpRuntimeContext.personUuid,
      isSuperadmin: !!mcpRuntimeContext.isSuperadmin,
    },
    name,
    row ? { ...row, enabled: 1 } : null,
    { agentMode: String(modeSlug || '').toLowerCase() === 'agent' },
  );
  if (!allowRes.allowed) {
    const rk = row && typeof row === 'object' ? row : {};
    return {
      allowed: false,
      reason: allowRes.reason || 'tool not in allowlist',
      riskLevel: 'blocked',
      requiresConfirmation: false,
      mcpToolId: row?.id ?? null,
      toolKey: rk.tool_key != null ? String(rk.tool_key) : name,
      capabilityKey: rk.capability_key != null ? String(rk.capability_key) : null,
      handlerKey: rk.handler_key != null ? String(rk.handler_key) : null,
      routeKey: routeKeyOut(rk.route_key),
      serverKey: rk.server_key != null ? String(rk.server_key) : null,
      mcpServerId: rk.mcp_server_id ?? rk.server_id ?? null,
      agentsamToolsId: rk.id ?? null,
    };
  }

  const riskLevel = inferRiskLevel(name, row?.tool_category, row?.risk_level);
  if (!isToolAllowedByPolicyRisk(policyRow, riskLevel)) {
    const rk = row && typeof row === 'object' ? row : {};
    return {
      allowed: false,
      reason: 'blocked by tool_risk_level_max',
      riskLevel: 'blocked',
      requiresConfirmation: false,
      mcpToolId: row?.id ?? null,
      toolKey: rk.tool_key != null ? String(rk.tool_key) : name,
      capabilityKey: rk.capability_key != null ? String(rk.capability_key) : null,
      handlerKey: rk.handler_key != null ? String(rk.handler_key) : null,
      routeKey: routeKeyOut(rk.route_key),
      serverKey: rk.server_key != null ? String(rk.server_key) : null,
      mcpServerId: rk.mcp_server_id ?? rk.server_id ?? null,
      agentsamToolsId: rk.id ?? null,
    };
  }

  const requiresConfirmation = false;
  const rk = row && typeof row === 'object' ? row : {};
  return {
    allowed: true,
    reason: 'allowed',
    riskLevel,
    requiresConfirmation,
    mcpToolId: null,
    toolKey: rk.tool_key != null ? String(rk.tool_key) : name,
    capabilityKey: rk.capability_key != null ? String(rk.capability_key) : null,
    handlerKey: rk.handler_key != null ? String(rk.handler_key) : null,
    routeKey: routeKeyOut(rk.route_key),
    serverKey: null,
    mcpServerId: null,
    agentsamToolsId: rk.id != null ? String(rk.id) : null,
  };
}

async function dispatchToolCall(env, toolName, input, context = {}) {
  const t0 = Date.now();
  const cached = await tryReadAgentsamToolCache(env, {
    workspaceId: context.workspaceId,
    tenantId: context.tenantId,
    toolName,
    toolInput: input,
  });
  if (cached.hit) return cached.value;

  const sess = {
    user_id: context.userId,
    workspace_id: context.workspaceId,
    workspaceId: context.workspaceId,
    tenant_id: context.tenantId,
    session_id: context.sessionId,
    person_uuid: context.personUuid,
    is_superadmin: context.isSuperadmin,
  };
  const params = {
    ...(input && typeof input === 'object' ? input : {}),
    session: sess,
    session_id: context.sessionId || input?.session_id || null,
    tenant_id: context.tenantId || input?.tenant_id || null,
    user_id: context.userId || input?.user_id || null,
    workspace_id: context.workspaceId ?? input?.workspace_id ?? null,
    person_uuid: context.personUuid ?? input?.person_uuid ?? null,
    request: context.request || null,
    agent_run_id:
      context.agent_run_id ?? context.agentRunId ?? input?.agent_run_id ?? input?.agentRunId ?? null,
    conversation_id:
      context.conversation_id ??
      context.conversationId ??
      context.sessionId ??
      input?.conversation_id ??
      input?.conversationId ??
      null,
  };
  const catalogOut = await dispatchByToolCode(env, toolName, params, context);
  let out =
    catalogOut?.ok === false
      ? { error: catalogOut.error ?? 'dispatch_failed' }
      : catalogOut?.result ?? catalogOut;
  if (out && typeof out === 'object' && out.error) {
    throw new Error(typeof out.error === 'string' ? out.error : JSON.stringify(out.error));
  }
  await writeAgentsamToolCacheAfterSuccess(env, {
    workspaceId: context.workspaceId,
    tenantId: context.tenantId,
    toolName,
    toolInput: input,
    toolOutput: out,
    durationMs: Date.now() - t0,
    execErr: null,
  });
  return out;
}

/** Per-tool wall-clock budget for Promise.race around dispatchToolCall (ms). */
function resolveToolExecutionBudgetMs(toolName, input) {
  const n = String(toolName || '').toLowerCase();
  const inp = input && typeof input === 'object' ? input : {};
  const rawTimeout = inp.timeout_ms != null ? Number(inp.timeout_ms) : NaN;
  const terminalNames = new Set(['terminal_run', 'terminal_execute', 'run_command', 'bash']);
  if (terminalNames.has(n)) {
    if (Number.isFinite(rawTimeout) && rawTimeout > 0 && rawTimeout < 20000) return Math.floor(rawTimeout);
    return 20000;
  }
  if (
    n === 'd1_query' ||
    n === 'd1_explain' ||
    n === 'd1_schema_introspect' ||
    (n.startsWith('d1_') && n.includes('query'))
  ) {
    if (Number.isFinite(rawTimeout) && rawTimeout > 0 && rawTimeout <= 10000) return Math.floor(rawTimeout);
    return 10000;
  }
  if (n.startsWith('r2_')) {
    if (Number.isFinite(rawTimeout) && rawTimeout > 0 && rawTimeout < 20000) return Math.floor(rawTimeout);
    return 20000;
  }
  if (
    n.startsWith('browser_') ||
    n.startsWith('playwright') ||
    n.startsWith('cdt_') ||
    n === 'preview_in_browser' ||
    n === 'playwright_screenshot'
  ) {
    if (Number.isFinite(rawTimeout) && rawTimeout > 0 && rawTimeout < 30000) return Math.floor(rawTimeout);
    return 30000;
  }
  if (n === 'search_web') return 12_000;
  if (n === 'web_fetch') return 15_000;
  if (n === 'excalidraw_plan_map_create') return 15000;
  if (n.startsWith('github_')) {
    if (Number.isFinite(rawTimeout) && rawTimeout > 0 && rawTimeout < 30000) return Math.floor(rawTimeout);
    return 30000;
  }
  if (Number.isFinite(rawTimeout) && rawTimeout > 0 && rawTimeout < 30000) return Math.floor(rawTimeout);
  return 30000;
}

async function dispatchToolCallWithBudget(env, toolName, input, context, budgetMs) {
  let tid;
  const err = /** @type {Error & { code?: string; budgetMs?: number }} */ (
    Object.assign(new Error(`Tool timed out after ${budgetMs}ms`), {
      code: 'tool_timeout',
      budgetMs,
    })
  );
  try {
    return await Promise.race([
      dispatchToolCall(env, toolName, input, context),
      new Promise((_, reject) => {
        tid = setTimeout(() => reject(err), budgetMs);
      }),
    ]);
  } finally {
    if (tid) clearTimeout(tid);
  }
}

// ─── Request-scoped Context Loaders ──────────────────────────────────────────

async function loadModeConfig(env, modeSlug, workspaceId = null) {
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

async function resolveDefaultModel(env, tenantId) {
  if (!env.DB || !tenantId || String(tenantId).trim() === '') return null;
  try {
    const row = await env.DB.prepare(
      `SELECT model_key FROM agentsam_ai
       WHERE mode = 'model' AND status = 'active'
         AND COALESCE(supports_tools, 0) = 1
         AND LOWER(COALESCE(api_platform, '')) != 'workers_ai'
         AND (is_global = 1 OR allowed_tenants_json LIKE ('%"' || ? || '"%'))
       ORDER BY COALESCE(input_rate_per_mtok, 999999) ASC
       LIMIT 1`,
    ).bind(tenantId).first();
    if (row?.model_key) return row.model_key;
    const fb = await env.DB.prepare(
      `SELECT model_key FROM agentsam_ai
       WHERE mode = 'model' AND status = 'active'
         AND COALESCE(supports_tools, 0) = 1
         AND (is_global = 1 OR allowed_tenants_json LIKE ('%"' || ? || '"%'))
       ORDER BY COALESCE(input_rate_per_mtok, 999999) ASC LIMIT 1`,
    ).bind(tenantId).first();
    return fb?.model_key || null;
  } catch (_) {
    return null;
  }
}

const AI_MODEL_ROW_SQL = `id, name, provider, model_key, api_platform,
  secret_key_name, supports_tools, supports_vision,
  supports_cache, context_max_tokens, output_max_tokens,
  input_rate_per_mtok, output_rate_per_mtok,
  cache_write_rate_per_mtok, cache_read_rate_per_mtok,
  cache_write_1h_rate_per_mtok, pricing_extras_json,
  size_class, sort_order, tool_invocation_style,
  thinking_mode, effort, system_prompt,
  features_json, picker_group, is_global,
  allowed_tenants_json`;

async function resolveAiModelRowById(env, id, tenantIdOpt) {
  if (!env.DB || id == null || id === '') return null;
  const tenantId =
    tenantIdOpt != null && String(tenantIdOpt).trim() !== ''
      ? String(tenantIdOpt).trim()
      : null;
  if (!tenantId) return null;
  try {
    return await env.DB.prepare(
      `SELECT ${AI_MODEL_ROW_SQL}
       FROM agentsam_ai
       WHERE id = ?
         AND mode = 'model' AND status = 'active'
         AND (is_global = 1 OR allowed_tenants_json LIKE ('%"' || ? || '"%'))
       LIMIT 1`,
    ).bind(id, tenantId).first();
  } catch (_) {
    return null;
  }
}

function metadataObject(row) {
  return parseJsonSafe(row?.features_json ?? row?.metadata_json, {}) || {};
}

function rowIsGranite(row) {
  const mk = String(row?.model_key || '').toLowerCase();
  if (mk.includes('granite')) return true;
  const meta = metadataObject(row);
  if (meta.fallback_only === true) return true;
  return false;
}

/** External paid/cloud APIs — excludes Workers AI / Cloudflare-hosted chat fallbacks. */
function rowIsExternalProvider(row) {
  const plat = String(row?.api_platform || '').toLowerCase();
  const prov = String(row?.provider || '').toLowerCase();
  if (plat === 'workers_ai' || prov === 'cloudflare') return false;
  return true;
}

async function resolveAiModelFromRequest(env, body, tenantIdCtx) {
  const tenantId =
    tenantIdCtx != null && String(tenantIdCtx).trim() !== ''
      ? String(tenantIdCtx).trim()
      : body?.tenant_id != null && String(body.tenant_id).trim() !== ''
        ? String(body.tenant_id).trim()
        : null;
  if (!tenantId) {
    return { row: null, rawRequestedKey: null, rawRequestedId: null };
  }
  const rawId =
    body?.model_id != null && String(body.model_id).trim() !== ''
      ? String(body.model_id).trim()
      : body?.modelId != null && String(body.modelId).trim() !== ''
        ? String(body.modelId).trim()
        : '';
  let rawKey =
    body?.model != null && String(body.model).trim() !== ''
      ? String(body.model).trim()
      : body?.model_key != null && String(body.model_key).trim() !== ''
        ? String(body.model_key).trim()
        : body?.modelKey != null && String(body.modelKey).trim() !== ''
          ? String(body.modelKey).trim()
          : '';
  if (/^auto$/i.test(rawKey)) rawKey = '';
  if (!env.DB) {
    return { row: null, rawRequestedKey: rawKey || null, rawRequestedId: rawId || null };
  }
  try {
    if (rawId || rawKey) {
      const needle = rawId || rawKey;
      const row = await env.DB.prepare(
        `SELECT ${AI_MODEL_ROW_SQL}
         FROM agentsam_ai
         WHERE (id = ? OR model_key = ?)
           AND mode = 'model' AND status = 'active'
           AND (is_global = 1 OR allowed_tenants_json LIKE ('%"' || ? || '"%'))
         LIMIT 1`,
      )
        .bind(needle, needle, tenantId)
        .first();
      if (row) {
        if (rawId) {
          return { row, rawRequestedKey: rawKey || row.model_key, rawRequestedId: rawId };
        }
        return { row, rawRequestedKey: rawKey, rawRequestedId: rawId || null };
      }
    }
  } catch (_) {
    /* fallthrough */
  }
  return { row: null, rawRequestedKey: rawKey || null, rawRequestedId: rawId || null };
}

/** Ask SSE fast path: explicit request or route preference, then canonical routing resolution. */
async function resolveAskFastModelKey(env, body, tenantId, workspaceId, promptRouteRow) {
  const { row } = await resolveAiModelFromRequest(env, body, tenantId);
  const tid = tenantId != null ? String(tenantId).trim() : '';
  const ws = workspaceId != null ? String(workspaceId).trim() : '';
  const requestedModelKey = row?.model_key ? String(row.model_key).trim() : '';
  if (!env?.DB) {
    return requestedModelKey
      ? { model_key: requestedModelKey, routing_arm_id: null }
      : null;
  }
  try {
    let requestedForResolver = requestedModelKey || null;
    if (!requestedForResolver && promptRouteRow?.preferred_model) {
      const pref = String(promptRouteRow.preferred_model).trim();
      if (pref) {
        const pr = await resolveAgentsamAiRowByModelKey(env, tid, pref);
        if (pr?.model_key) requestedForResolver = String(pr.model_key).trim();
      }
    }
    if (!requestedForResolver && promptRouteRow?.fallback_model) {
      const fb = String(promptRouteRow.fallback_model).trim();
      if (fb) {
        const fr = await resolveAgentsamAiRowByModelKey(env, tid, fb);
        if (fr?.model_key) requestedForResolver = String(fr.model_key).trim();
      }
    }
    const resolved = await resolveModelForTask(env, {
      task_type: 'ask',
      mode: 'ask',
      requested_model_key: requestedForResolver,
      workspace_id: ws || null,
      tenant_id: tid || null,
      require_tools: false,
    });
    return resolved?.model_key ? resolved : null;
  } catch (_) {
    /* fall through */
  }
  return null;
}

function normalizeGateParseFailure(originalMessage) {
  return { intent: 'auto', rewritten_query: originalMessage, confidence: 0.75 };
}

/** Map heuristic taskType + mode → routing arm intent_slug prefix (e.g. code_agent). */
function intentSlugFromHeuristic(taskType, mode, modeConfig) {
  const tt = normalizeCanonicalTaskType(taskType || 'ask');
  const md =
    String(mode || modeConfig?.slug || modeConfig?.mode || 'agent').trim().toLowerCase() || 'agent';
  return `${tt}_${md}`;
}

async function gateRewriteAndClassify(_env, modeConfig, message, _tenantId) {
  const { taskType, mode } = inferIntentHeuristically(message);
  const intentSlug = intentSlugFromHeuristic(taskType, mode, modeConfig);
  return {
    intent: intentSlug,
    rewritten_query: message,
    confidence: 0.85,
    taskType,
    mode,
  };
}

/**
 * D1 agentsam_capability_aliases → preferred tool_key names for a classified taskType.
 * @param {any} env
 * @param {string} taskType
 * @returns {Promise<string[]>}
 */
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

export async function recordArmOutcome(env, ctx, armId, success, routingInfo) {
  if (!env.DB || !armId) return;
  try {
    const etoOwner = await isEtoThompsonOwner(env);
    if (etoOwner) {
      await env.DB.prepare(
        `UPDATE agentsam_routing_arms SET
          total_executions = COALESCE(total_executions, 0) + 1,
          updated_at = unixepoch()
         WHERE id = ?`,
      )
        .bind(armId)
        .run();
    } else {
      await env.DB.prepare(
        `UPDATE agentsam_routing_arms SET
          total_executions = total_executions + 1,
          success_alpha = success_alpha + CASE WHEN ? THEN 0.5 ELSE 0 END,
          success_beta  = success_beta  + CASE WHEN ? THEN 0 ELSE 0.5 END,
          decayed_score = (success_alpha + CASE WHEN ? THEN 0.5 ELSE 0 END) /
            (success_alpha + success_beta + 1.0) *
            pow(0.995, CAST((unixepoch() - last_decay_at) AS REAL) / 86400.0),
          last_decay_at = unixepoch(),
          updated_at = unixepoch()
        WHERE id = ?`,
      )
        .bind(success ? 1 : 0, success ? 1 : 0, success ? 1 : 0, armId)
        .run();
    }

    if (ctx?.waitUntil && routingInfo) {
      ctx.waitUntil(triggerEvalAfterNRuns(env, ctx, {
        armId,
        taskType: routingInfo.taskType,
        mode: routingInfo.mode,
        modelKey: routingInfo.modelKey,
        workspaceId: routingInfo.workspaceId
      }).catch(e => console.warn('[eval] triggerEvalAfterNRuns failed:', e?.message)));
    }
  } catch (e) {
    console.warn('[routing] recordArmOutcome failed:', e?.message);
  }
}

/** Vague "create a skill" requests should interview first, not auto-run the plan executor. */
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

function dedupeModelsByKey(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows || []) {
    const k = r?.model_key;
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

/** DB-driven tool-capable fallback chain (canonical agentsam_ai only). */
async function loadToolFallbackChain(env, opts = {}) {
  if (!env.DB) return [];
  const tenantId =
    opts.tenantId != null && String(opts.tenantId).trim() !== ''
      ? String(opts.tenantId).trim()
      : '';
  if (!tenantId) return [];
  const excludeModelKeys = Array.isArray(opts.excludeModelKeys)
    ? [...new Set(opts.excludeModelKeys.map((k) => String(k || '').trim()).filter(Boolean))]
    : [];
  const limRaw = Number(opts.limit);
  const lim = Number.isFinite(limRaw) && limRaw > 0 ? Math.min(Math.floor(limRaw), 50) : 3;
  try {
    let sql = `SELECT ${AI_MODEL_ROW_SQL}
       FROM agentsam_ai
       WHERE mode = 'model' AND status = 'active'
         AND supports_tools = 1
         AND model_key IS NOT NULL
         AND (is_global = 1 OR allowed_tenants_json LIKE ('%"' || ? || '"%'))
         AND api_platform NOT IN ('workers_ai', 'ollama')`;
    const binds = [tenantId];
    if (excludeModelKeys.length) {
      sql += ` AND model_key NOT IN (${excludeModelKeys.map(() => '?').join(',')})`;
      binds.push(...excludeModelKeys);
    }
    sql += ` ORDER BY COALESCE(sort_order, 999999) ASC LIMIT ?`;
    binds.push(lim);
    const { results } = await env.DB.prepare(sql).bind(...binds).all();
    return results || [];
  } catch (_) {
    return [];
  }
}

async function resolveAgentsamAiRowByModelKey(env, tenantId, modelKey) {
  if (!env.DB || !tenantId || !modelKey) return null;
  const mk = String(modelKey).trim();
  if (!mk) return null;
  try {
    return await env.DB.prepare(
      `SELECT ${AI_MODEL_ROW_SQL}
       FROM agentsam_ai
       WHERE model_key = ?
         AND mode = 'model' AND status = 'active'
         AND (is_global = 1 OR allowed_tenants_json LIKE ('%"' || ? || '"%'))
       LIMIT 1`,
    ).bind(mk, tenantId).first();
  } catch (_) {
    return null;
  }
}

async function loadAgentsamAiActiveModelKeysOrdered(env) {
  if (!env?.DB) return [];
  try {
    const { results } = await env.DB.prepare(
      `SELECT model_key FROM agentsam_ai WHERE mode = 'model' AND status = 'active' ORDER BY sort_order ASC, name ASC LIMIT 40`,
    ).all();
    return (results || []).map((r) => String(r.model_key || '').trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Chat SSE tail of the model chain: `agentsam_routing_arms` (chat + mode + is_eligible, decayed_score),
 * resolved to `agentsam_ai` rows; then catalog-ordered keys and active `agentsam_ai` rows from D1 (no hardcoded SKUs).
 */
async function loadChatRoutingFallbackRows(env, opts = {}) {
  const tenantId =
    opts.tenantId != null && String(opts.tenantId).trim() !== ''
      ? String(opts.tenantId).trim()
      : '';
  if (!tenantId) return [];
  const mode = opts.mode;
  const excludeModelKeys = Array.isArray(opts.excludeModelKeys)
    ? opts.excludeModelKeys.map((k) => String(k || '').trim()).filter(Boolean)
    : [];
  const excludeSet = new Set(excludeModelKeys);
  const requireTools = !!opts.requireTools;

  const ws =
    opts.workspaceId != null && String(opts.workspaceId).trim() !== ''
      ? String(opts.workspaceId).trim()
      : '';
  let keyOrder = await loadChatRoutingArmsModelKeyOrder(env, mode, ws, {
    toolRequired: requireTools,
    routeKey: opts.routeKey ?? null,
  });
  keyOrder = keyOrder.filter((k) => !excludeSet.has(k));

  const rows = [];
  const seen = new Set();
  const enrichWithRoutingArmId = async (r) => {
    if (!r?.model_key) return r;
    const lookup = await resolveRoutingArmByModelKey(env, {
      modelKey: String(r.model_key).trim(),
      taskType: 'chat',
      mode,
      workspaceId: ws,
    });
    return { ...r, routing_arm_id: lookup?.armId ?? null };
  };
  for (const mk of keyOrder) {
    const r = await resolveAgentsamAiRowByModelKey(env, tenantId, mk);
    if (r?.model_key && !seen.has(r.model_key)) {
      seen.add(r.model_key);
      rows.push(await enrichWithRoutingArmId(r));
    }
  }

  if (!rows.length) {
    for (const mk of await loadAgentsamAiActiveModelKeysOrdered(env)) {
      if (excludeSet.has(mk)) continue;
      const r = await resolveAgentsamAiRowByModelKey(env, tenantId, mk);
      if (r?.model_key && !seen.has(r.model_key)) {
        seen.add(r.model_key);
        rows.push(await enrichWithRoutingArmId(r));
      }
    }
  }

  return filterChainToolPolicy(rows, requireTools);
}

function filterChainToolPolicy(rows, requireTools) {
  if (!requireTools || !rows?.length) return rows || [];
  return rows.filter((r) => Number(r.supports_tools) === 1);
}

/** AUTO routing: drop Granite when any non-Granite external provider is available in the pool. */
function filterGraniteAutoChain(rows, externalNonGraniteExists) {
  if (!rows?.length) return [];
  if (!externalNonGraniteExists) return rows;
  return rows.filter((r) => !rowIsGranite(r));
}

function withTimeout(promise, ms) {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(`timeout_after_${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

let modelTierMigrationStarted = false;
async function runModelTierMigration(env) {
  // No-op: model tiers are managed and seeded in D1 (agentsam_model_tier).
  // Kept to avoid breaking older code paths that still call this function.
  void env;
}

function kickoffModelTierMigration(env, ctx) {
  if (modelTierMigrationStarted) return;
  modelTierMigrationStarted = true;
  try {
    const p = runModelTierMigration(env).catch((e) => {
      console.warn('[agent] model tier migration failed:', e?.message);
    });
    ctx?.waitUntil?.(p);
  } catch (e) {
    console.warn('[agent] model tier migration kickoff failed:', e?.message);
  }
}

// ─── Approval Gate ────────────────────────────────────────────────────────────

function needsApproval(validationResult, modeConfig, userPolicy) {
  void validationResult;
  void modeConfig;
  void userPolicy;
  return false;
}

async function createApprovalRequest(env, ctx, opts) {
  const {
    tenantId,
    sessionId,
    userId,
    workspaceId,
    personUuid,
    toolName,
    toolArgs,
    toolCallId,
    riskLevel,
    rationale,
    ledgerExtras,
    agentRunId,
    agent_run_id,
    conversationId,
    conversation_id,
  } = opts;
  const approvalSpine = {
    agent_run_id:
      (agent_run_id ?? agentRunId) != null ? String(agent_run_id ?? agentRunId).trim() : null,
    conversation_id:
      (conversation_id ?? conversationId ?? sessionId) != null
        ? String(conversation_id ?? conversationId ?? sessionId).trim()
        : null,
  };
  const proposalId  = 'prop_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const now         = Math.floor(Date.now() / 1000);
  const expiresAt   = now + 3600;
  if (!env.DB) return proposalId;
  const argsStr = typeof toolArgs === 'string' ? toolArgs : JSON.stringify(toolArgs || {});
  if (!workspaceId) {
    throw new Error('WORKSPACE_CONTEXT_MISSING');
  }
  try {
    let uidResolved = userId != null && String(userId).trim() !== '' ? String(userId).trim() : null;
    if (uidResolved) {
      uidResolved = await resolveCanonicalUserId(uidResolved, env);
    }
    const uid = uidResolved ?? 'iam_agent';
    const summary = rationale || `Tool call requires approval: ${toolName}`;
    const inputJson = JSON.stringify({
      command_text: `${toolName}(${argsStr.slice(0, 500)})`,
      filled_template: argsStr,
      command_source: 'agent_generated',
      tool: toolName,
    });
    await env.DB.prepare(
      `INSERT INTO agentsam_approval_queue
       (id, tenant_id, workspace_id, user_id, session_id, tool_name, action_summary,
        risk_level, input_json, expires_at, status, approval_type, created_at,
        agent_run_id, conversation_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      proposalId,
      tenantId,
      workspaceId,
      uid,
      sessionId || null,
      toolName,
      summary,
      riskLevel || 'medium',
      inputJson,
      expiresAt,
      'pending',
      'tool',
      now,
      approvalSpine.agent_run_id,
      approvalSpine.conversation_id,
    ).run();
    scheduleRecordMcpToolExecution(env, ctx, {
      tenant_id: tenantId,
      workspace_id: workspaceId,
      user_id: uidResolved ?? userId,
      person_uuid: personUuid,
      session_id: sessionId,
      tool_name: toolName,
      input_json: argsStr.slice(0, 10000),
      output_json: '',
      success: false,
      status: 'awaiting_approval',
      requires_approval: 1,
      error_message: null,
      ...approvalSpine,
    });
    scheduleAgentsamToolCallLog(env, ctx, {
      tenantId,
      sessionId,
      toolName,
      status: 'pending',
      durationMs: 0,
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      userId,
      workspaceId,
      errorMessage: null,
      inputSummary: argsStr.slice(0, 200),
      ...approvalSpine,
      ...(ledgerExtras && typeof ledgerExtras === 'object' ? ledgerExtras : {}),
    });
  } catch (e) { console.warn('[agent] createApprovalRequest:', e?.message); }
  return proposalId;
}

/** Poll agentsam_approval_queue until approved, denied/expired, or timeout. */
async function pollApprovalQueue(env, approvalId, maxSeconds = 180) {
  if (!env?.DB || !approvalId) return false;
  const deadline = Date.now() + Math.max(1, Number(maxSeconds) || 180) * 1000;
  while (Date.now() < deadline) {
    const row = await env.DB.prepare(
      `SELECT status, expires_at FROM agentsam_approval_queue WHERE id = ? LIMIT 1`,
    )
      .bind(approvalId)
      .first()
      .catch(() => null);
    if (!row) return false;
    const st = String(row.status || '').toLowerCase();
    if (st === 'approved') return true;
    if (st === 'denied' || st === 'expired') return false;
    const exp = Number(row.expires_at);
    if (Number.isFinite(exp) && exp > 0 && exp <= Math.floor(Date.now() / 1000)) return false;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

/** Pending row in agentsam_approval_queue blocks duplicate execution until approved/denied. */
async function checkApprovalGate(env, userId, toolName) {
  if (!env?.DB || !userId || !toolName) return null;
  return env.DB.prepare(
    `SELECT id, status, expires_at FROM agentsam_approval_queue
     WHERE user_id = ? AND tool_name = ? AND status = 'pending'
       AND expires_at > unixepoch()
     ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(userId, toolName)
    .first()
    .catch(() => null);
}

async function auditToolDecision(env, opts) {
  if (!env.DB) return;
  const tid = opts.tenantId != null && String(opts.tenantId).trim() !== '' ? String(opts.tenantId).trim() : '';
  const wid =
    opts.workspaceId != null && String(opts.workspaceId).trim() !== ''
      ? String(opts.workspaceId).trim()
      : '';
  const uid =
    opts.userId != null && String(opts.userId).trim() !== '' ? String(opts.userId).trim() : '';
  if (!tid || !wid || !uid) return;
  try {
    const hook = await env.DB.prepare(
      `SELECT id FROM agentsam_hook
       WHERE is_active = 1 AND trigger IN ('tool_audit','agent_tool_audit')
         AND (tenant_id IS NULL OR tenant_id = '' OR tenant_id = ?)
         AND (workspace_id IS NULL OR workspace_id = '' OR workspace_id = ?)
       ORDER BY CASE WHEN workspace_id IS NOT NULL AND workspace_id != '' THEN 0 ELSE 1 END
       LIMIT 1`,
    )
      .bind(tid, wid)
      .first()
      .catch(() => null);
    if (!hook?.id) return;
    const execId = `hexec_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const blocked = String(opts.eventType || '').includes('blocked');
    await env.DB.prepare(
      `INSERT INTO agentsam_hook_execution (
         id, hook_id, tenant_id, workspace_id, user_id,
         event_type, status, payload_json, metadata_json, ran_at
       ) VALUES (?,?,?,?,?,?,?,?,?, datetime('now'))`,
    )
      .bind(
        execId,
        String(hook.id),
        tid,
        wid,
        uid,
        String(opts.eventType || 'tool_audit'),
        blocked ? 'blocked' : 'success',
        JSON.stringify({
          message: opts.message ?? null,
          tool: opts.toolName ?? null,
        }),
        JSON.stringify({ reason: opts.reason ?? null, risk: opts.riskLevel ?? null }),
      )
      .run();
  } catch (_) {}
}

/** Dedup key pairs with UNIQUE(ref_table, ref_id) on agentsam_usage_events. */
function scheduleAgentsamUsageEventFromChat(env, ctx, opts) {
  writeUsageEventFromChat(env, ctx, {
    tenantId: opts.tenantId,
    workspaceId: opts.workspaceId,
    userId: opts.userId,
    conversationId: opts.conversationId,
    resolvedProvider: opts.resolvedProvider,
    modelKey: opts.modelKey,
    inputTokens: opts.inputTokens,
    outputTokens: opts.outputTokens,
    costUsd: opts.costUsd,
    streamFailed: opts.streamFailed,
    refId: opts.refId,
    routingArmId: opts.routingArmId,
    taskType: opts.taskType,
    mode: opts.mode,
  });
}

// ─── OpenAI streaming (chat.completions): accumulate tool_calls + text ───────

/** Concatenated `function.arguments` from OpenAI chat.completions stream; repairable failures keep raw. */
function safeJsonParse(value) {
  if (!value || typeof value !== 'string') return {};
  try {
    return JSON.parse(value);
  } catch {
    return { __raw: value, __parse_error: true };
  }
}

/**
 * OpenAI Chat Completions SSE stream (`delta.tool_calls`). Merges tool call fragments by `index`
 * (id may be omitted on later chunks). Not for Responses API — use a separate adapter there.
 * Without reconstructing tool_calls here, pendingToolCalls stay empty and no tools run.
 */
async function consumeOpenAIChatCompletionsSse(readable, emit) {
  const reader = readable.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  /** @type {Map<number, { id?: string, name?: string, args: string }>} */
  const tcByIndex = new Map();
  let textBuf = '';
  /** @type {string|null} */
  let finishReason = null;

  const mergeDelta = (delta) => {
    if (delta == null || typeof delta !== 'object') return;
    const content = delta.content;
    if (typeof content === 'string' && content) {
      textBuf += content;
      emit('text', { text: content });
    }
    if (!Array.isArray(delta.tool_calls)) return;
    for (const part of delta.tool_calls) {
      const idx = Number(part.index ?? 0);
      if (!Number.isFinite(idx)) continue;
      if (!tcByIndex.has(idx)) tcByIndex.set(idx, { args: '' });
      const slot = tcByIndex.get(idx);
      if (typeof part.id === 'string' && part.id) slot.id = part.id;
      const fn = part.function;
      if (fn && typeof fn === 'object') {
        if (typeof fn.name === 'string' && fn.name) slot.name = fn.name;
        if (typeof fn.arguments === 'string' && fn.arguments) slot.args += fn.arguments;
      }
    }
  };

  const processPayload = (payload) => {
    if (payload === '[DONE]') return;
    let json;
    try {
      json = JSON.parse(payload);
    } catch {
      return;
    }
    const choices = json?.choices;
    if (!Array.isArray(choices) || !choices.length) return;
    const ch = choices[0];
    if (ch.finish_reason != null && String(ch.finish_reason).trim() !== '') {
      finishReason = String(ch.finish_reason);
    }
    if (ch.delta) mergeDelta(ch.delta);
  };

  /** One SSE event: join all `data:` lines (spec allows multi-line data fields). */
  const processEventBlock = (blockText) => {
    const lines = blockText.split('\n').map((l) => l.trim()).filter(Boolean);
    const dataLines = lines.filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart());
    if (!dataLines.length) return;
    processPayload(dataLines.join('\n').trim());
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let sep;
    while ((sep = buf.indexOf('\n\n')) >= 0) {
      const part = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      processEventBlock(part);
    }
  }
  const tail = buf.trim();
  if (tail) processEventBlock(tail);

  const pendingToolCalls = [...tcByIndex.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, slot]) => ({
      type: 'tool_use',
      id: slot.id || `openai_tool_${index}`,
      name: slot.name,
      input: safeJsonParse(slot.args || '{}'),
      raw_input: slot.args || '{}',
      provider: 'openai_chat_completions',
      index,
    }))
    .filter((c) => c.name);

  return { text: textBuf, finishReason, pendingToolCalls };
}

/**
 * OpenAI /v1/responses SSE — NOT chat.completions. Events like `response.output_text.delta`,
 * `response.output_item.added` (function_call), `response.completed`.
 * Normalizes to the same bridge as consumeOpenAIChatCompletionsSse; adds `responseId` for chaining.
 */
async function consumeOpenAIResponsesSse(readable, emit) {
  const reader = readable.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let textBuf = '';
  let streamFinish = null;
  let responseId = null;

  const slots = [];
  const byCallId = new Map();
  const byItemId = new Map();

  const mergeSlot = (callId, itemId, name, outputIndex) => {
    let idx;
    if (callId && byCallId.has(callId)) idx = byCallId.get(callId);
    else if (itemId && byItemId.has(itemId)) idx = byItemId.get(itemId);
    if (idx == null) {
      idx = slots.length;
      slots.push({
        id: itemId || null,
        call_id: callId || null,
        name: name || '',
        args: '',
        outputIndex: outputIndex != null ? Number(outputIndex) : null,
      });
      if (callId) byCallId.set(callId, idx);
      if (itemId) byItemId.set(itemId, idx);
    }
    const s = slots[idx];
    if (callId) {
      s.call_id = callId;
      byCallId.set(callId, idx);
    }
    if (itemId) {
      s.id = itemId;
      byItemId.set(itemId, idx);
    }
    if (name) s.name = name;
    if (outputIndex != null && s.outputIndex == null) s.outputIndex = Number(outputIndex);
    return s;
  };

  const handleObj = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    const t = String(obj.type || '');

    if (t === 'response.created' || t === 'response.in_progress') {
      const rid = obj.response?.id;
      if (rid) responseId = String(rid);
      return;
    }

    if (t === 'response.output_text.delta') {
      const d = typeof obj.delta === 'string' ? obj.delta : '';
      if (d) {
        textBuf += d;
        emit('text', { text: d });
      }
      return;
    }

    if (t === 'response.output_item.added' || t === 'response.output_item.done') {
      const item = obj.item;
      if (item?.type === 'function_call') {
        const s = mergeSlot(item.call_id, item.id, item.name, obj.output_index);
        if (typeof item.arguments === 'string' && item.arguments) s.args = item.arguments;
      }
      return;
    }

    if (t.includes('function_call_arguments') && t.includes('delta')) {
      const callId = obj.call_id || obj.callId;
      const itemId = obj.item_id || obj.itemId;
      const delta =
        typeof obj.delta === 'string'
          ? obj.delta
          : typeof obj.arguments_delta === 'string'
            ? obj.arguments_delta
            : '';
      if ((callId || itemId) && delta) {
        const s = mergeSlot(callId, itemId, undefined, obj.output_index);
        s.args += delta;
      }
      return;
    }

    if (t === 'response.completed') {
      const resp = obj.response;
      if (resp?.id) responseId = String(resp.id);
      if (Array.isArray(resp?.output)) {
        resp.output.forEach((it, i) => {
          if (it?.type === 'function_call') {
            const s = mergeSlot(it.call_id, it.id, it.name, i);
            if (typeof it.arguments === 'string' && it.arguments) s.args = it.arguments;
          }
        });
      }
      const st = resp?.status != null ? String(resp.status) : '';
      if (st) streamFinish = st;
      if (resp?.usage) {
        streamFinish = {
          status: st,
          input_tokens:  Number(resp.usage.input_tokens)  || 0,
          output_tokens: Number(resp.usage.output_tokens) || 0,
        };
      }
    }
  };

  const processEventBlock = (blockText) => {
    const dataParts = [];
    for (const line of blockText.split(/\r?\n/)) {
      const s = line.trim();
      if (s.startsWith('data:')) dataParts.push(s.slice(5).trimStart());
    }
    if (!dataParts.length) return;
    const payload = dataParts.join('\n').trim();
    if (!payload || payload === '[DONE]') return;
    try {
      handleObj(JSON.parse(payload));
    } catch {
      /* ignore non-JSON */
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let sep;
    while ((sep = buf.indexOf('\n\n')) >= 0) {
      processEventBlock(buf.slice(0, sep));
      buf = buf.slice(sep + 2);
    }
  }
  if (buf.trim()) processEventBlock(buf.trim());

  slots.sort((a, b) => (a.outputIndex ?? 1e9) - (b.outputIndex ?? 1e9));

  const pendingToolCalls = slots
    .filter((s) => s.name)
    .map((s, index) => {
      const raw = s.args || '';
      const itemId = s.id || `openai_response_tool_${index}`;
      return {
        type: 'tool_use',
        id: itemId,
        call_id: s.call_id || null,
        name: s.name,
        input: safeJsonParse(raw || '{}'),
        raw_input: raw || '{}',
        provider: 'openai_responses',
        index,
      };
    });

  let finishReason = 'end_turn';
  if (pendingToolCalls.length) finishReason = 'tool_use';
  else if (streamFinish === 'completed') finishReason = 'end_turn';

  const _sfObj = typeof streamFinish === 'object' && streamFinish !== null ? streamFinish : {};
  return {
    text: textBuf,
    finishReason,
    pendingToolCalls,
    responseId,
    input_tokens:  _sfObj.input_tokens  ?? 0,
    output_tokens: _sfObj.output_tokens ?? 0,
  };
}

/** Emit structured diff preview when tool JSON includes before/after + path. */
function tryEmitCodeDiffFromToolOutput(emit, toolName, toolOutput) {
  if (!emit) return;
  let parsed;
  try {
    parsed = JSON.parse(String(toolOutput || 'null'));
  } catch {
    return;
  }
  if (!parsed || typeof parsed !== 'object') return;
  const path =
    (typeof parsed.path === 'string' && parsed.path.trim()) ||
    (typeof parsed.file_path === 'string' && parsed.file_path.trim()) ||
    (typeof parsed.file === 'string' && parsed.file.trim()) ||
    (Array.isArray(parsed.files_touched) && typeof parsed.files_touched[0] === 'string'
      ? String(parsed.files_touched[0]).trim()
      : '');
  const before =
    typeof parsed.before === 'string'
      ? parsed.before
      : typeof parsed.content_before === 'string'
        ? parsed.content_before
        : typeof parsed.original === 'string'
          ? parsed.original
          : typeof parsed.original_content === 'string'
            ? parsed.original_content
            : null;
  const after =
    typeof parsed.after === 'string'
      ? parsed.after
      : typeof parsed.content_after === 'string'
        ? parsed.content_after
        : typeof parsed.modified === 'string'
          ? parsed.modified
          : typeof parsed.patched_content === 'string'
            ? parsed.patched_content
            : typeof parsed.content === 'string'
              ? parsed.content
              : null;
  if (!path || before == null || after == null || before === after) return;
  const language =
    typeof parsed.language === 'string' && parsed.language.trim()
      ? parsed.language.trim()
      : (() => {
          const m = path.match(/\.([a-z0-9]+)$/i);
          return m ? m[1].toLowerCase() : 'plaintext';
        })();
  emit('code_diff', {
    path: path.slice(0, 500),
    before: before.slice(0, 120_000),
    after: after.slice(0, 120_000),
    language,
    tool_name: toolName ? String(toolName).slice(0, 120) : undefined,
  });
}

// ─── SSE Tool Loop ────────────────────────────────────────────────────────────

async function runAgentToolLoop(env, ctx, emit, params) {
  const {
    request,
    messages, tools, systemPrompt, modelKey,
    temperature, maxToolCalls,
    mode, modeConfig, userPolicy,
    sessionId, tenantId, userId,
    workspaceId,
    routingTaskType,
    qualityScore,
    mcpRuntimeContext,
    routingArmId: routingArmIdParam,
    agentSlug: agentSlugParam = null,
    thompsonModelKey: thompsonModelKeyParam,
    runStartedAt: runStartedAtParam,
    maxRuntimeMs: maxRuntimeMsParam,
    chatAgentRunId,
    dispatchSpine: dispatchSpineParam = null,
    codemodeRuntime: codemodeRuntimeParam = null,
    /** @type {Record<string, unknown>|null|undefined} */
    promptAuditContext: promptAuditContextParam,
    cacheWriteTtl: cacheWriteTtlParam,
    activeFileEnvelope: activeFileEnvelopeParam = null,
    resolvedContext: resolvedContextParam = null,
    handoffDepth: handoffDepthParam = 0,
    rootSessionId: rootSessionIdParam = null,
    signal: abortSignalParam = null,
  } = params;
  const cacheWriteTtlForBilling =
    cacheWriteTtlParam != null && String(cacheWriteTtlParam).trim() !== ''
      ? String(cacheWriteTtlParam).trim()
      : '5m';
  const routingWs = workspaceId != null ? String(workspaceId).trim() : '';
  const loopT0 = Date.now();
  const runStartedAt = runStartedAtParam != null ? Number(runStartedAtParam) : loopT0;
  const maxRunMs =
    Number(modeConfig?.max_runtime_ms) ||
    Number(maxRuntimeMsParam) ||
    90000;
  const maxTurns = Math.max(1, Math.min(20, Number(modeConfig?.max_turns) || 6));
  const doneGuard = params.doneGuard ?? { emitted: false };
  const safeDone = (payload) => {
    if (doneGuard.emitted) return;
    doneGuard.emitted = true;
    emit('done', payload);
  };
  const dispatchSpine = normalizeChatDispatchSpine(
    dispatchSpineParam && typeof dispatchSpineParam === 'object'
      ? dispatchSpineParam
      : {
          agent_run_id: chatAgentRunId,
          routing_arm_id: routingArmIdParam,
          mode,
        },
  );
  const routingArmIdStr = dispatchSpine.routing_arm_id || '';
  const openWebBudget = { turnCalls: 0, runCalls: 0 };
  const runSpineIds = {
    agent_run_id: dispatchSpine.agent_run_id,
    conversation_id: sessionId != null ? String(sessionId).trim() : null,
    routing_arm_id: routingArmIdStr || null,
    openWebBudget,
    activeFileEnvelope: activeFileEnvelopeParam,
    resolvedContext: resolvedContextParam,
    ctx,
  };

  const attributedRoutingArmId = () => routingArmIdStr || null;

  const routeArmOutcome = (success) => {
    const aid = attributedRoutingArmId();
    if (aid) {
      ctx.waitUntil?.(
        applyRoutingArmUsageFeedback(env, {
          armId: aid,
          success,
          costUsd: 0,
          durationMs: Math.max(0, Date.now() - loopT0),
        }),
      );
    } else if (routingWs) {
      scheduleRoutingArmBanditUpdate(env, ctx, {
        taskType: routingTaskType || 'ask',
        mode: mode || 'ask',
        modelKey,
        workspaceId: routingWs,
        success,
        lastChainId: null,
      });
    }
  };

  /** Treat explicit 0 as zero tool turns (minimal-ask / fast-path); `||` would wrongly upgrade 0 → 15. */
  const modeMax = (() => {
    if (maxToolCalls === 0 || maxToolCalls === '0') return 0;
    const n = Number(maxToolCalls);
    if (Number.isFinite(n) && n > 0) return Math.max(1, Math.floor(n));
    return Math.max(1, Math.floor(Number(maxToolCalls) || 15));
  })();
  const polMax = Math.floor(Number(userPolicy?.max_tool_chain_depth));
  const effectiveMaxToolCalls =
    Number.isFinite(polMax) && polMax > 0 ? Math.min(modeMax, polMax) : modeMax;

  const mcpBase =
    mcpRuntimeContext && typeof mcpRuntimeContext === 'object' ? { ...mcpRuntimeContext } : {};
  if (params.chatRouteKey != null && String(params.chatRouteKey).trim() !== '') {
    mcpBase.routeKey = String(params.chatRouteKey).trim();
  }
  const mcpCtx = mcpBase;

  const conversationMessages = [...messages];
  let toolCallsUsed = 0;
  const executedToolNames = [];
  let totalUsage    = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  let turnCount     = 0;
  let chatToolLedger = null;
  let toolChainRootId = null;
  let ledgerLoopThrew = false;
  let ledgerErrorMsg = null;
  let openaiPreviousResponseId = null;

  try {
  while (turnCount < maxTurns) {
    turnCount++;
    if (Date.now() - runStartedAt > maxRunMs) {
      emit('error', { message: 'Agent run timed out', code: 'agent_run_timeout' });
      safeDone({ tool_calls_used: toolCallsUsed, turns: turnCount, code: 'agent_run_timeout' });
      return {
        totalUsage,
        toolCallsUsed,
        executedToolNames,
        modelKey,
        turnCount,
        timedOut: true,
        workflowRunId: null,
        agentRunId: chatAgentRunId != null ? String(chatAgentRunId) : null,
        chainRootId: toolChainRootId,
      };
    }
    const modelT0 = Date.now();
    let stream;
    let isWorkersAiStream = false;
    try {
      const grModel = await evaluateGuardrails(env, ctx, {
        applies_to: 'model',
        tenant_id: tenantId,
        workspace_id: workspaceId,
        user_id: userId,
        session_id: sessionId,
        conversation_id: sessionId,
        request_id:
          chatAgentRunId != null ? String(chatAgentRunId) : sessionId,
        run_group_id: chatAgentRunId != null ? String(chatAgentRunId) : null,
        route_path: '/api/agent/chat',
        model_key: modelKey,
      });
      if (grModel.blocked) {
        throw new Error(`GUARDRAIL_BLOCKED:${grModel.decision?.reason || 'model_blocked'}`);
      }
      // Provider resolved inside dispatchStream from agentsam_ai.api_platform (Workers AI → OAI-shaped SSE).
      stream = await dispatchStream(env, request, {
        modelKey,
        systemPrompt,
        messages: conversationMessages,
        tools,
        reasoningEffort:
          dispatchSpineParam?.routing_decision?.reasoning_effort ??
          modeConfig?.gate_reasoning_effort ??
          null,
        temperature,
        userId,
        tenantId,
        workspaceId: routingWs || null,
        agentRunId: chatAgentRunId ?? null,
        routingArmId: routingArmIdParam ?? dispatchSpine.routing_arm_id ?? null,
        taskType: routingTaskType || 'ask',
        mode: (dispatchSpineParam?.routing_decision?.mode ?? mode) || 'auto',
        lane:
          dispatchSpineParam?.routing_decision?.lane ??
          (['debug', 'plan'].includes(
            String((dispatchSpineParam?.routing_decision?.mode ?? mode) || '').toLowerCase(),
          )
            ? 'premium'
            : null),
        signal: abortSignalParam ?? null,
        openaiPreviousResponseId,
        promptAuditContext:
          promptAuditContextParam && typeof promptAuditContextParam === 'object'
            ? { ...promptAuditContextParam, loop_turn: turnCount }
            : promptAuditContextParam,
      });
      isWorkersAiStream = false;
    } catch (e) {
      console.warn('[agent] model call failed:', e?.message ?? e);
      routeArmOutcome(false);
      const detail = e?.message != null ? String(e.message).slice(0, 8000) : String(e).slice(0, 8000);
      emit('error', { message: detail || 'Model call failed', detail });

      const eidFail = String(params.chatAgentRunId || sessionId || 'unknown').slice(0, 200);
      const lat = Math.max(0, Date.now() - modelT0);
      const errPayload = JSON.stringify({ model_key: modelKey, message: detail.slice(0, 4000) });
      ctx.waitUntil?.(
        (async () => {
          try {
            const cols = await pragmaTableInfo(env.DB, 'agentsam_execution_steps');
            if (!cols.has('execution_id') || !cols.has('node_key')) return;
            const parts = [];
            const vals = [];
            const binds = [];
            const q = (name, val) => {
              if (!cols.has(name)) return;
              parts.push(name);
              vals.push('?');
              binds.push(val);
            };
            q('execution_id', eidFail);
            q('agent_run_id', runSpineIds.agent_run_id);
            q('node_key', 'model_dispatch_failed');
            q('node_type', 'model');
            q('status', 'failed');
            if (cols.has('error_json')) {
              parts.push('error_json');
              vals.push('?');
              binds.push(errPayload);
            } else if (cols.has('output_json')) {
              parts.push('output_json');
              vals.push('?');
              binds.push(errPayload);
            }
            q('latency_ms', lat);
            const nowSec = Math.floor(Date.now() / 1000);
            q('started_at', nowSec);
            q('completed_at', nowSec);
            if (cols.has('created_at')) {
              parts.push('created_at');
              vals.push(`datetime('now')`);
            }
            if (cols.has('created_at_unix')) {
              parts.push('created_at_unix');
              vals.push('?');
              binds.push(nowSec);
            }
            await env.DB.prepare(
              `INSERT INTO agentsam_execution_steps (${parts.join(', ')}) VALUES (${vals.join(', ')})`,
            )
              .bind(...binds)
              .run();
          } catch (_) {}
        })(),
      );

      const fail = new Error('MODEL_DISPATCH_FAILED');
      fail.code = 'MODEL_DISPATCH_FAILED';
      throw fail;
    }

    const pendingToolCalls = [];
    let stopReason = null, turnUsage = null, containerId = null;
    const assistantContent = [];

    const extractWorkersAiLineToken = (obj) => {
      if (!obj || typeof obj !== 'object') return '';
      const c0 = Array.isArray(obj.choices) ? obj.choices[0] : null;
      const t =
        c0?.delta?.content ??
        c0?.text ??
        (typeof obj.response === 'string' ? obj.response : obj.response != null ? String(obj.response) : '') ??
        '';
      return typeof t === 'string' ? t : String(t || '');
    };

    const consumeWorkersAiText = async (readable) => {
      const reader = readable.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          const t = line.trim();
          if (!t) continue;
          let piece = '';
          try {
            piece = extractWorkersAiLineToken(JSON.parse(t));
          } catch {
            piece = t;
          }
          if (!piece) continue;
          const last = assistantContent.findLast(b => b.type === 'text');
          if (last) last.text += piece;
          emit('text', { text: piece });
        }
      }
      const tail = buf.trim();
      if (tail) {
        let piece = '';
        try {
          piece = extractWorkersAiLineToken(JSON.parse(tail));
        } catch {
          piece = tail;
        }
        if (piece) {
          const last = assistantContent.findLast(b => b.type === 'text');
          if (last) last.text += piece;
          emit('text', { text: piece });
        }
      }
    };

    const consumeSseText = async (readable) => {
      const reader = readable.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() || '';
        for (const part of parts) {
          const lines = part.split('\n').map(l => l.trim()).filter(Boolean);
          const dataLines = lines.filter(l => l.startsWith('data:')).map(l => l.slice(5).trim());
          if (!dataLines.length) continue;
          const payload = dataLines.join('\n');
          if (payload === '[DONE]') return;
          try {
            const json = JSON.parse(payload);
            const text =
              json?.choices?.[0]?.delta?.content ??
              json?.choices?.[0]?.text ??
              json?.response ??
              json?.text ??
              '';
            if (text) {
              const last = assistantContent.findLast(b => b.type === 'text');
              if (last) last.text += text;
              emit('text', { text });
            }
          } catch {
            // ignore non-JSON SSE frames
          }
        }
      }
    };

    if (stream instanceof Response) {
      if (!stream.ok) {
        const detailRaw = await stream.text().catch(() => '');
        let detailMsg = String(detailRaw || '').slice(0, 8000);
        try {
          const j = JSON.parse(detailRaw);
          const m = j?.error?.message ?? (typeof j?.error === 'string' ? j.error : null) ?? j?.message ?? j?.detail;
          if (m) detailMsg = String(m).slice(0, 8000);
        } catch {
          /* keep detailRaw slice */
        }
        console.warn('[agent] model stream HTTP error', stream.status, detailMsg.slice(0, 500));
        routeArmOutcome(false);
        emit('error', {
          message: detailMsg || 'Model stream failed',
          status: stream.status,
          detail: detailRaw.slice(0, 8000),
        });
        const hard = new Error('__IAM_PROVIDER_HTTP__');
        hard.code = 'IAM_PROVIDER_HTTP';
        hard.status = stream.status;
        hard.detail = detailRaw.slice(0, 8000);
        throw hard;
      }
      const streamMeta = await resolveModelMeta(env, modelKey);
      const platform = String(streamMeta?.api_platform || '').toLowerCase();
      const useOpenAIResponses = platform === 'openai_responses' || platform === 'responses';
      const useOpenAIChatCompletions =
        platform === 'openai' || platform === 'openai_chat_completions';
      const useOpenAiShapedToolStream =
        tools.length > 0 &&
        (useOpenAIChatCompletions || platform === 'gemini_api');

      const applyNormalizedOpenAI = (parsed) => {
        const textBlock = assistantContent[assistantContent.length - 1];
        if (textBlock && textBlock.type === 'text') textBlock.text = parsed.text || '';
        for (const tc of parsed.pendingToolCalls) {
          const linkId = String(tc.call_id || tc.id || '').trim() || tc.id;
          assistantContent.push({ type: 'tool_use', id: linkId, name: tc.name, input: tc.input });
          pendingToolCalls.push({ ...tc, id: linkId, _done: true, _server: false });
        }
        const fr = parsed.finishReason || '';
        stopReason =
          fr === 'tool_use' || fr === 'tool_calls'
            ? 'tool_use'
            : fr === 'stop' || fr === '' || fr === 'end_turn' || fr === 'completed'
              ? 'end_turn'
              : fr || 'end_turn';
      };

      if (stream.body && useOpenAIResponses) {
        assistantContent.push({ type: 'text', text: '' });
        const parsed = await consumeOpenAIResponsesSse(stream.body, emit);
        if (parsed.input_tokens || parsed.output_tokens) {
          totalUsage.input_tokens  += parsed.input_tokens;
          totalUsage.output_tokens += parsed.output_tokens;
        }
        applyNormalizedOpenAI(parsed);
        if (parsed.responseId) openaiPreviousResponseId = parsed.responseId;
      } else if (stream.body && useOpenAiShapedToolStream) {
        assistantContent.push({ type: 'text', text: '' });
        const parsed = await consumeOpenAIChatCompletionsSse(stream.body, emit);
        applyNormalizedOpenAI(parsed);
      } else if (stream.body) {
        assistantContent.push({ type: 'text', text: '' });
        await consumeSseText(stream.body);
        stopReason = 'end_turn';
      } else {
        assistantContent.push({ type: 'text', text: '' });
        stopReason = 'end_turn';
      }
    } else if (
      stream &&
      typeof stream[Symbol.asyncIterator] === 'function' &&
      !(stream instanceof ReadableStream)
    ) {
      const handleAnthropicChunk = (chunk) => {
        if (chunk.type === 'message_start') {
          if (chunk.message?.id) emit('id', { id: chunk.message.id });
          if (chunk.message?.container?.id) containerId = chunk.message.container.id;
        }
        if (chunk.type === 'message_stop' && chunk.message?.container?.id) {
          containerId = chunk.message.container.id;
        }
        if (chunk.type === 'content_block_start') {
          if (chunk.content_block?.type === 'thinking') emit('thinking_start', {});
          if (chunk.content_block?.type === 'compaction') {
            assistantContent.push({ ...chunk.content_block });
            emit('compaction', { phase: 'block_start' });
          }
          if (chunk.content_block?.type === 'tool_use') {
            pendingToolCalls.push({ id: chunk.content_block.id, name: chunk.content_block.name, _args: '', _server: false });
            assistantContent.push({ type: 'tool_use', id: chunk.content_block.id, name: chunk.content_block.name, input: {} });
          }
          if (chunk.content_block?.type === 'server_tool_use') {
            pendingToolCalls.push({ id: chunk.content_block.id, name: chunk.content_block.name, _args: '', _server: true });
            assistantContent.push({
              type: 'server_tool_use',
              id: chunk.content_block.id,
              name: chunk.content_block.name,
              input: {},
            });
          }
          {
            const cb = chunk.content_block;
            const passthroughResults = new Set([
              'tool_search_tool_result',
              'code_execution_tool_result',
              'bash_code_execution_tool_result',
              'text_editor_code_execution_tool_result',
            ]);
            if (cb && passthroughResults.has(cb.type)) {
              assistantContent.push({ ...cb });
            }
          }
          if (chunk.content_block?.type === 'text') assistantContent.push({ type: 'text', text: '' });
        }
        if (chunk.type === 'content_block_delta') {
          const delta = chunk.delta;
          if (delta.type === 'text_delta') {
            const last = assistantContent.findLast(b => b.type === 'text');
            if (last) last.text += delta.text;
            emit('text', { text: delta.text });
          }
          if (delta.type === 'thinking_delta') emit('thinking', { text: delta.thinking });
          if (delta.type === 'input_json_delta') {
            const call = pendingToolCalls.findLast(c => !c._done);
            if (call) call._args += delta.partial_json;
          }
          if (delta.type === 'signature_delta') emit('signature', { signature: delta.signature });
        }
        if (chunk.type === 'content_block_stop') {
          const call = pendingToolCalls.findLast(c => !c._done);
          if (call) {
            call._done = true;
            try { call.input = JSON.parse(call._args || '{}'); } catch { call.input = {}; }
            const blk = assistantContent.find(
              (b) => (b.type === 'tool_use' || b.type === 'server_tool_use') && b.id === call.id,
            );
            if (blk) blk.input = call.input;
          }
        }
        if (chunk.type === 'message_delta') {
          if (chunk.usage) turnUsage = chunk.usage;
          if (chunk.delta?.stop_reason) stopReason = chunk.delta.stop_reason;
          if (chunk.delta?.container?.id) containerId = chunk.delta.container.id;
        }
      };
      const compactionMeta = {
        tenantId,
        workspaceId,
        userId,
        sessionId,
        modelKey,
        provider: 'anthropic',
      };
      const mergeTurnUsage = () => {
        if (!turnUsage) return;
        const u = aggregateAnthropicUsageTokens(turnUsage);
        totalUsage.input_tokens += u.input_tokens;
        totalUsage.output_tokens += u.output_tokens;
        totalUsage.cache_read_input_tokens += u.cache_read_input_tokens;
        totalUsage.cache_creation_input_tokens += u.cache_creation_input_tokens;
        if (scheduleCompactionFromAnthropicUsage(env, ctx, turnUsage, compactionMeta)) {
          const compacted = extractCompactionFromAnthropicUsage(turnUsage);
          emit('compaction', {
            phase: 'recorded',
            tokens_before: compacted?.tokens_before ?? null,
            tokens_after: compacted?.tokens_after ?? null,
          });
        }
        turnUsage = null;
      };
      const drainAnthropicStream = async (s) => {
        stopReason = null;
        turnUsage = null;
        for await (const chunk of s) handleAnthropicChunk(chunk);
        mergeTurnUsage();
      };
      await drainAnthropicStream(stream);
      // Anthropic code execution may stop with pause_turn; continue via SDK (same model/tools/system as dispatchStream → chatWithAnthropic).
      const PAUSE_TURN_MAX = 8;
      let pauseIterations = 0;
      while (stopReason === 'pause_turn' && containerId && pauseIterations < PAUSE_TURN_MAX) {
        pauseIterations += 1;
        console.log(`[agent] pause_turn continuation ${pauseIterations} container=${containerId}`);
        emit('pause_turn', { container_id: containerId, iteration: pauseIterations });
        let continueMessages;
        try {
          continueMessages = [...conversationMessages, { role: 'assistant', content: JSON.parse(JSON.stringify(assistantContent)) }];
        } catch {
          continueMessages = [...conversationMessages, { role: 'assistant', content: assistantContent }];
        }
        pendingToolCalls.length = 0;
        let nextStream;
        try {
          nextStream = await dispatchStream(env, request, {
            modelKey,
            systemPrompt,
            messages: continueMessages,
            tools,
            reasoningEffort: modeConfig?.gate_reasoning_effort || null,
            temperature,
            userId,
            tenantId,
            workspaceId: routingWs || null,
            agentRunId: chatAgentRunId ?? null,
            routingArmId: routingArmIdParam ?? null,
            taskType: routingTaskType || 'ask',
            mode: mode || 'auto',
            lane:
              dispatchSpineParam?.routing_decision?.lane ??
              (['debug', 'plan'].includes(String(mode || '').toLowerCase()) ? 'premium' : null),
            signal: abortSignalParam ?? null,
            anthropicContainerId: containerId,
            promptAuditContext:
              promptAuditContextParam && typeof promptAuditContextParam === 'object'
                ? {
                    ...promptAuditContextParam,
                    loop_turn: turnCount,
                    pause_turn_continuation: true,
                  }
                : promptAuditContextParam,
          });
        } catch (e) {
          console.warn('[agent] pause_turn continuation request failed:', e?.message ?? e);
          break;
        }
        if (!nextStream || typeof nextStream[Symbol.asyncIterator] !== 'function') {
          console.warn('[agent] pause_turn: continuation stream is not async-iterable');
          break;
        }
        await drainAnthropicStream(nextStream);
      }
      if (pauseIterations >= PAUSE_TURN_MAX && stopReason === 'pause_turn') {
        console.warn('[agent] pause_turn max iterations reached, forcing end_turn');
        stopReason = 'end_turn';
      }
    } else if (stream && typeof stream.getReader === 'function') {
      assistantContent.push({ type: 'text', text: '' });
      if (isWorkersAiStream) {
        await consumeWorkersAiText(stream);
      } else {
        await consumeSseText(stream);
      }
      stopReason = 'end_turn';
    } else if (stream != null) {
      const ctor = stream.constructor ? stream.constructor.name : typeof stream;
      console.warn('[agent] stream not iterable/reader/Response:', ctor, Object.prototype.toString.call(stream));
    }

    if (turnUsage) {
      const u = aggregateAnthropicUsageTokens(turnUsage);
      totalUsage.input_tokens += u.input_tokens;
      totalUsage.output_tokens += u.output_tokens;
      totalUsage.cache_read_input_tokens += u.cache_read_input_tokens;
      totalUsage.cache_creation_input_tokens += u.cache_creation_input_tokens;
      scheduleCompactionFromAnthropicUsage(env, ctx, turnUsage, {
        tenantId,
        workspaceId,
        userId,
        sessionId,
        modelKey,
        provider: 'anthropic',
      });
    }

    conversationMessages.push({ role: 'assistant', content: assistantContent });

    if (chatAgentRunId && routingWs && env?.DB) {
      const progressCost = await fetchModelCostUsd(
        env,
        modelKey,
        totalUsage.input_tokens,
        totalUsage.output_tokens,
        totalUsage.cache_read_input_tokens,
      );
      ctx.waitUntil?.(
        patchAgentRunBudgetProgress(env, String(chatAgentRunId), {
          inputTokens: totalUsage.input_tokens,
          outputTokens: totalUsage.output_tokens,
          costUsd: progressCost,
          status: 'running',
        }),
      );
      const handoffResult = await executeAgentHandoffFromLoop(env, ctx, emit, safeDone, {
        chatAgentRunId,
        modelKey,
        workspaceId: routingWs,
        routingTaskType,
        mode,
        agentSlug: agentSlugParam,
        totalUsage,
        toolCallsUsed,
        executedToolNames,
        turnCount,
        conversationMessages,
        goal: messages?.[0]?.content ?? null,
        userId,
        tenantId,
        toolChainRootId,
        sessionId,
        rootSessionId: rootSessionIdParam ?? sessionId,
        handoffDepth: Number(handoffDepthParam) || 0,
      });
      if (handoffResult) return handoffResult;
    }

    const clientToolCalls = pendingToolCalls.filter((c) => !c._server);
    if (!clientToolCalls.length) {
      if (routingWs) {
        const qs = Number(qualityScore);
        if (Number.isFinite(qs)) {
          scheduleRoutingArmQualityUpdate(env, ctx, {
            taskType: routingTaskType || 'ask',
            mode: mode || 'ask',
            modelKey,
            workspaceId: routingWs,
            qualityScore: qs,
          });
        }
      }
      break;
    }

    const toolResults = [];
    let previousToolChainId = null;
    for (const call of clientToolCalls) {
      if (toolCallsUsed >= effectiveMaxToolCalls) {
        emit('tool_blocked', { tool: call.name, reason: 'max_tool_calls_reached' });
        toolResults.push({ type: 'tool_result', tool_use_id: call.id, content: 'Tool call limit reached.' });
        continue;
      }
      if (call.input && typeof call.input === 'object' && call.input.__parse_error === true) {
        const raw = String(call.raw_input != null ? call.raw_input : call.input.__raw || '').slice(0, 2000);
        scheduleRecordMcpToolExecution(env, ctx, {
          tenant_id: tenantId,
          workspace_id: workspaceId,
          user_id: userId,
          session_id: sessionId,
          tool_name: call.name,
          tool_id: null,
          input_json: JSON.stringify({ __parse_error: true, __raw: raw }),
          success: false,
          error_message: 'tool_arguments_json_parse_error',
          duration_ms: 0,
          status: 'error',
          ...runSpineIds,
        });
        emit('tool_error', { tool: call.name, error: 'tool_arguments_json_parse_error' });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: call.id,
          content: `Tool arguments are not valid JSON (repairable). Raw: ${raw}`,
          is_error: true,
        });
        continue;
      }
      const validation = await validateToolCall(
        env,
        mcpCtx?.runtimeProfile || mode,
        call,
        mcpCtx,
        userPolicy,
      );
      if (!validation.allowed) {
        scheduleRecordMcpToolExecution(env, ctx, {
          tenant_id: tenantId,
          workspace_id: workspaceId,
          user_id: userId,
          session_id: sessionId,
          tool_name: call.name,
          tool_id: validation.mcpToolId ?? null,
          input_json: JSON.stringify(call.input || {}),
          success: false,
          error_message: validation.reason,
          duration_ms: 0,
          status: 'error',
          ...runSpineIds,
        });
        scheduleAgentsamToolCallLog(env, ctx, {
          tenantId,
          sessionId,
          toolName: call.name,
          status: 'blocked',
          durationMs: 0,
          costUsd: 0,
          inputTokens: 0,
          outputTokens: 0,
          userId,
          workspaceId,
          errorMessage: validation.reason,
          inputSummary: JSON.stringify(call.input || {}).slice(0, 200),
          routingArmId: attributedRoutingArmId(),
          ...toolLogFieldsFromValidation(validation),
          ...runSpineIds,
        });
        await auditToolDecision(env, {
          tenantId,
          workspaceId,
          userId,
          toolName: call.name,
          eventType: 'tool_blocked',
          message: `Blocked: ${call.name} — ${validation.reason}`,
          riskLevel: 'blocked',
          reason: validation.reason,
        });
        emit('tool_blocked', { tool: call.name, reason: validation.reason });
        toolResults.push({ type: 'tool_result', tool_use_id: call.id, content: `Tool not available in ${mode} mode: ${validation.reason}` });
        continue;
      }
      const grTool = await evaluateGuardrails(env, ctx, {
        applies_to: 'mcp_tool',
        tenant_id: tenantId,
        workspace_id: workspaceId,
        user_id: userId,
        session_id: sessionId,
        conversation_id: sessionId,
        request_id:
          chatAgentRunId != null
            ? String(chatAgentRunId)
            : toolChainRootId != null
              ? String(toolChainRootId)
              : sessionId,
        run_group_id: chatAgentRunId != null ? String(chatAgentRunId) : null,
        route_path: '/api/agent/chat',
        tool_name: call.name,
        tool_input: call.input,
        model_key: modelKey,
      });
      if (grTool.blocked) {
        scheduleRecordMcpToolExecution(env, ctx, {
          tenant_id: tenantId,
          workspace_id: workspaceId,
          user_id: userId,
          session_id: sessionId,
          tool_name: call.name,
          tool_id: validation.mcpToolId ?? null,
          input_json: JSON.stringify(call.input || {}),
          success: false,
          error_message: grTool.decision?.reason || 'guardrail_blocked',
          duration_ms: 0,
          status: 'blocked',
          ...runSpineIds,
        });
        scheduleAgentsamToolCallLog(env, ctx, {
          tenantId,
          sessionId,
          toolName: call.name,
          status: 'blocked',
          durationMs: 0,
          costUsd: 0,
          inputTokens: 0,
          outputTokens: 0,
          userId,
          workspaceId,
          errorMessage: grTool.decision?.reason || 'guardrail_blocked',
          inputSummary: JSON.stringify(call.input || {}).slice(0, 200),
          routingArmId: attributedRoutingArmId(),
          ...toolLogFieldsFromValidation(validation),
          ...runSpineIds,
        });
        await auditToolDecision(env, {
          tenantId,
          workspaceId,
          userId,
          toolName: call.name,
          eventType: 'tool_blocked',
          message: `Guardrail blocked: ${call.name}`,
          riskLevel: 'blocked',
          reason: grTool.decision?.reason || 'guardrail',
        });
        emit('tool_blocked', { tool: call.name, reason: grTool.decision?.reason || 'guardrail' });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: call.id,
          content: grTool.decision?.reason || 'Blocked by guardrail.',
          is_error: true,
        });
        continue;
      }
      if (needsApproval(validation, modeConfig, userPolicy)) {
        const proposalId = await createApprovalRequest(env, ctx, {
          tenantId,
          sessionId,
          userId,
          workspaceId,
          personUuid: mcpCtx.personUuid,
          toolName: call.name,
          toolArgs: call.input,
          toolCallId: call.id,
          riskLevel: validation.riskLevel,
          rationale: `Agent requested ${call.name} (${validation.riskLevel} risk)`,
          ledgerExtras: toolLogFieldsFromValidation(validation),
          ...runSpineIds,
        });
        notifySam(env, { subject: `Approval required: ${call.name}`, body: `Tool: ${call.name}\nRisk: ${validation.riskLevel}\nArgs: ${JSON.stringify(call.input||{}).slice(0,500)}\n\nApprove: ${(env.IAM_ORIGIN||'').replace(/\/$/,'')}/dashboard/overview?proposal=${proposalId}`, category: 'approval' }).catch(() => {});
        emit('approval_required', { proposal_id: proposalId, tool_name: call.name, tool_args: call.input, risk_level: validation.riskLevel, message: 'This action requires your approval.' });
        toolResults.push({ type: 'tool_result', tool_use_id: call.id, content: `Awaiting approval (proposal_id: ${proposalId}).` });
        continue;
      }
      if (
        shouldOpenChatToolSessionLedger({
          chatAgentRunId,
          mode,
          tools,
          chatToolLedger,
        })
      ) {
        try {
          chatToolLedger = createChatToolSessionLedger({
            tenantId,
            workspaceId,
            userId,
            sessionId,
            modelKey,
            stepsTotal: effectiveMaxToolCalls,
            chatAgentRunId,
            routingArmId: attributedRoutingArmId(),
            requestedMode: mode,
          });
          if (chatToolLedger) {
            emit('workflow_start', {
              ...chatToolSessionSseBase(chatToolLedger),
              steps_total: chatToolLedger.stepsTotal,
            });
          }
        } catch (e) {
          console.warn('[agent] chat_tool_session_ledger_create', e?.message ?? e);
        }
      }
      toolCallsUsed++;
      executedToolNames.push(call.name);
      emit('tool_call', { tool: call.name, args: call.input });
      await auditToolDecision(env, {
        tenantId,
        workspaceId,
        userId,
        toolName: call.name,
        eventType: 'tool_executed',
        message: `Executing: ${call.name}`,
        riskLevel: validation.riskLevel,
        reason: 'allowed',
      });
      const toolT0 = Date.now();
      const toolStartNs = toolT0 * 1_000_000;
      let toolOutput = '';
      let execErr = null;
      emit('tool_start', {
        tool_name: call.name,
        input_preview: JSON.stringify(call.input || {}).slice(0, 200),
      });
      let toolRows = null;
      let execResult = null;
      const toolBudgetMs = resolveToolExecutionBudgetMs(call.name, call.input);
      try {
        if (call.name === CODEMODE_TOOL_NAME && codemodeRuntimeParam?.execute) {
          execResult = await codemodeRuntimeParam.execute(call.input || {});
          if (execResult?.ok === false) {
            execErr = new Error(String(execResult.error || 'codemode_execution_failed'));
          }
          if (execResult?.pending_actions?.length) {
            const proposalIds = await enqueueCodemodePendingActions(
              env,
              ctx,
              {
                tenantId,
                workspaceId,
                userId,
                sessionId,
                agent_run_id: chatAgentRunId,
                conversationId: sessionId,
              },
              execResult.pending_actions,
            );
            if (proposalIds.length) {
              emit('approval_required', {
                proposal_ids: proposalIds,
                tool_name: CODEMODE_TOOL_NAME,
                message: 'Codemode queued actions require approval.',
              });
            }
          }
        } else if (isImageGenerationTool(call.name)) {
          execResult = await streamImageGenerationSse(emit, env, call.name, call.input || {}, {
            authUser: { id: userId },
            workspaceId,
            tenantId,
            userId,
            origin: (env.IAM_ORIGIN || request?.url ? new URL(request.url).origin : '').replace(/\/$/, ''),
          });
        } else {
          let toolInput = call.input && typeof call.input === 'object' ? { ...call.input } : {};
          if (call.name === 'fs_search_files') {
            const { normalizeFsSearchFilesParams } = await import('../core/fs-search-files.js');
            toolInput = normalizeFsSearchFilesParams(toolInput, {
              userMessage: mcpCtx.userMessage ?? mcpCtx.message ?? null,
              activeFileEnvelope: activeFileEnvelopeParam ?? null,
            });
          } else if (activeFileEnvelopeParam) {
            const { applyActiveFileDefaultsToToolInput } = await import('../core/active-file-envelope.js');
            toolInput = applyActiveFileDefaultsToToolInput(call.name, toolInput, activeFileEnvelopeParam);
          }
          execResult = await dispatchToolCallWithBudget(
            env,
            call.name,
            toolInput,
              mergeResolvedContextIntoRunContext(
              {
                sessionId,
                tenantId,
                userId,
                workspaceId,
                personUuid: mcpCtx.personUuid,
                isSuperadmin: mcpCtx.isSuperadmin,
                request,
                activeFileEnvelope: activeFileEnvelopeParam,
                userMessage: mcpCtx.userMessage ?? mcpCtx.message ?? null,
                ...runSpineIds,
              },
              resolvedContextParam,
            ),
            toolBudgetMs,
          );
        }
        if (execResult && typeof execResult === 'object') {
          if (Array.isArray(execResult.rows)) toolRows = execResult.rows;
          else if (Array.isArray(execResult.results)) toolRows = execResult.results;
        }
        toolOutput = typeof execResult === 'string' ? execResult : JSON.stringify(execResult);
        if (
          execResult &&
          typeof execResult === 'object' &&
          (execResult.code === 'browser_origin_not_trusted' ||
            String(execResult.error || '').includes('Browser origin not trusted'))
        ) {
          emit('browser_trust_required', {
            origin: execResult.origin ?? null,
            tool_name: call.name,
            message:
              'Trust this origin in the IAM browser consent modal (Browser tab), then retry.',
          });
        }
        if (call.name === 'excalidraw_plan_map_create') {
          try {
            const parsed =
              execResult && typeof execResult === 'object'
                ? execResult
                : JSON.parse(String(toolOutput || '{}'));
            if (
              parsed &&
              !parsed.error &&
              parsed.open_draw &&
              (parsed.artifact_id || parsed.public_url)
            ) {
              const origin = (env.IAM_ORIGIN || '').replace(/\/$/, '') || '';
              const loadUrl =
                typeof parsed.public_url === 'string' && parsed.public_url.trim()
                  ? parsed.public_url.trim()
                  : origin && parsed.artifact_id
                    ? `${origin}/api/artifacts/${encodeURIComponent(String(parsed.artifact_id))}/content`
                    : '';
              emit('surface_open', {
                surface: 'excalidraw',
                reason: 'excalidraw_plan_map_create',
                artifact_id: parsed.artifact_id ?? null,
                load_url: loadUrl,
                artifact_type: 'excalidraw',
              });
              emit('agent_surface_open', {
                surface: 'excalidraw',
                reason: 'excalidraw_plan_map_create',
                artifact_id: parsed.artifact_id ?? null,
                load_url: loadUrl,
                artifact_type: 'excalidraw',
              });
            }
          } catch (_) {
            /* ignore malformed tool JSON */
          }
        }
        if (!execErr) {
          const surfaceFromTool = (() => {
            if (call.name === 'browser_navigate') {
              return { surface: 'browser', reason: 'browser_navigate', tool_name: call.name };
            }
            if (call.name === 'monaco_open' || call.name === 'monaco_open_file') {
              return { surface: 'monaco', reason: call.name, tool_name: call.name };
            }
            if (call.name === 'excalidraw_open') {
              return { surface: 'excalidraw', reason: 'excalidraw_open', tool_name: call.name };
            }
            if (call.name === 'image_generate' || isImageGenerationTool(call.name)) {
              return { surface: 'image', reason: call.name, tool_name: call.name };
            }
            return null;
          })();
          if (surfaceFromTool) {
            emit('surface_open', surfaceFromTool);
            emit('agent_surface_open', surfaceFromTool);
          }
        }
      } catch (e) {
        execErr = e;
        const isTimeout =
          e &&
          typeof e === 'object' &&
          'code' in e &&
          /** @type {{ code?: string }} */ (e).code === 'tool_timeout';
        const detail = isTimeout
          ? `Tool timed out after ${toolBudgetMs}ms`
          : e && typeof e === 'object' && 'message' in e && typeof e.message === 'string'
            ? e.message
            : String(e ?? 'unknown_error');
        toolOutput = `Tool execution failed: ${detail}`;
        console.warn('[agent] tool_error', call.name, detail);
        emit('tool_error', {
          tool: call.name,
          error: detail,
          ...(isTimeout ? { code: 'tool_timeout' } : {}),
        });
      }
      const toolDurMs = Date.now() - toolT0;
      let toolDoneExtra = {};
      if (!execErr && call.name === 'excalidraw_plan_map_create') {
        try {
          const parsed = JSON.parse(String(toolOutput || '{}'));
          if (parsed && parsed.artifact_id && !parsed.error) {
            toolDoneExtra = {
              artifact_type: 'excalidraw',
              artifact_id: String(parsed.artifact_id),
              public_url: parsed.public_url != null ? String(parsed.public_url) : null,
            };
          }
        } catch (_) {
          /* ignore */
        }
      }
      if (call.name === 'search_web') {
        try {
          const parsed = (() => {
            if (execResult && typeof execResult === 'object') return execResult;
            return JSON.parse(String(toolOutput || '{}'));
          })();
          const tel = parsed?.telemetry;
          if (tel && typeof tel === 'object') {
            toolDoneExtra = {
              lane: 'open_web_search',
              backend: tel.backend ?? parsed.provider ?? 'tavily',
              cache_hit: !!parsed.cache_hit,
              search_depth: tel.search_depth ?? 'basic',
              result_count: tel.result_count ?? 0,
              estimated_credits: tel.estimated_credits ?? 1,
            };
            console.log(
              '[agent] execution_lane_selected',
              JSON.stringify({
                lane: 'open_web_search',
                backend: toolDoneExtra.backend,
                reason: parsed.cache_hit ? 'tavily_cache_hit' : 'tavily_search_complete',
                cache_hit: toolDoneExtra.cache_hit,
                max_results: parsed.max_results ?? 5,
                search_depth: toolDoneExtra.search_depth,
                query_hash: tel.query_hash ?? null,
                duration_ms: tel.duration_ms ?? toolDurMs,
              }),
            );
            if (!execErr) {
              emit('execution_lane_selected', {
                lane: 'open_web_search',
                backend: toolDoneExtra.backend,
                reason: parsed.cache_hit ? 'tavily_cache_hit' : 'tavily_search_complete',
                cache_hit: toolDoneExtra.cache_hit,
                max_results: parsed.max_results ?? 5,
                search_depth: toolDoneExtra.search_depth,
              });
            }
          }
        } catch (_) {
          /* ignore */
        }
      }
      emit('tool_output', {
        tool_name: call.name,
        chunk: String(toolOutput || '').slice(0, TOOL_OUTPUT_SSE_MAX),
      });
      emit('tool_done', {
        tool_name: call.name,
        status: execErr ? 'error' : 'ok',
        duration_ms: toolDurMs,
        rows: toolRows ?? null,
        ...toolDoneExtra,
        ...(execErr
          ? {
              error:
                execErr && typeof execErr === 'object' && 'message' in execErr
                  ? String(execErr.message || '').slice(0, 4000)
                  : String(execErr || '').slice(0, 4000),
            }
          : {}),
      });
      if (!execErr) {
        try {
          const parsed = JSON.parse(String(toolOutput || 'null'));
          if (parsed && typeof parsed === 'object') {
            const url =
              isImageGenerationTool(call.name)
                ? null
                : typeof parsed.screenshot_url === 'string' && parsed.screenshot_url.trim()
                  ? parsed.screenshot_url.trim()
                  : typeof parsed.result_url === 'string' && parsed.result_url.trim()
                    ? parsed.result_url.trim()
                    : typeof parsed.image_url === 'string'
                      ? parsed.image_url
                      : typeof parsed.public_url === 'string'
                        ? parsed.public_url
                        : typeof parsed.url === 'string' && /^(https?:|data:)/i.test(parsed.url)
                          ? parsed.url
                          : null;
            if (url && url.length < 8000) {
              emit('preview_artifact', {
                artifact: {
                  id: `sse_${call.id || crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
                  kind: 'image',
                  title: call.name,
                  imageUrl: url,
                },
              });
            }
            tryEmitCodeDiffFromToolOutput(emit, call.name, toolOutput);
          }
        } catch (_) {
          /* not JSON — skip preview */
        }
      }
      if (chatToolLedger) {
        try {
          await appendChatToolSessionLedgerStep(env, emit, chatToolLedger, {
            tool_name: call.name,
            ok: !execErr,
            duration_ms: toolDurMs,
            output_preview: String(toolOutput || '').slice(0, 8000),
            error: execErr ? String(execErr.message || execErr).slice(0, 2000) : null,
            input_json:
              call.input && typeof call.input === 'object'
                ? call.input
                : call.input != null
                  ? { value: call.input }
                  : {},
          });
        } catch (e) {
          console.warn('[agent] chat_tool_session_ledger_step', e?.message ?? e);
        }
      }
      scheduleAgentsamToolCallLog(env, ctx, {
        tenantId,
        sessionId,
        toolName: call.name,
        status: execErr
          ? execErr &&
              typeof execErr === 'object' &&
              'code' in execErr &&
              /** @type {{ code?: string }} */ (execErr).code === 'tool_timeout'
            ? 'timeout'
            : 'error'
          : 'success',
        durationMs: toolDurMs,
        costUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
        userId,
        workspaceId,
        errorMessage: execErr ? String(execErr.message || execErr).slice(0, 4000) : null,
        inputSummary: JSON.stringify(call.input || {}).slice(0, 200),
        routingArmId: attributedRoutingArmId(),
        ...toolLogFieldsFromValidation(validation),
        ...runSpineIds,
      });
      const mcpExecId = scheduleRecordMcpToolExecution(env, ctx, {
        tenant_id: tenantId,
        workspace_id: workspaceId,
        session_id: sessionId,
        tool_name: call.name,
        tool_id: validation.mcpToolId ?? null,
        input_json: JSON.stringify(call.input || {}),
        output_json: toolOutput.slice(0, 50000),
        success: !execErr,
        error_message: execErr ? String(execErr.message || execErr).slice(0, 4000) : null,
        duration_ms: toolDurMs,
        user_id: userId,
        invoked_by: userId || 'iam_agent',
        status: execErr ? 'error' : 'completed',
        ...runSpineIds,
      });
      const canonicalToolChainUserId = await resolveCanonicalUserId(userId, env);
      previousToolChainId = await fireForgetAgentToolChainRow(env, {
        toolName: call.name,
        agentSessionId: sessionId,
        workspaceId,
        userId: canonicalToolChainUserId,
        error: execErr,
        costUsd: 0,
        mcpToolCallId: mcpExecId,
        durationMs: toolDurMs,
        terminalSessionId: null,
        tenantId,
        parentChainId: previousToolChainId,
        toolInputJson: JSON.stringify(call.input || {}),
        workflowRunId: null,
        executionStepId: null,
        ...runSpineIds,
        ctx,
      });
      if (previousToolChainId && !toolChainRootId) toolChainRootId = previousToolChainId;
      recordMcpToolOtlpSpan(env, ctx, {
        tenant_id: tenantId,
        workspace_id: workspaceId,
        toolName: call.name,
        start_time_unix_nano: toolStartNs,
        end_time_unix_nano: Date.now() * 1_000_000,
        execErr,
      });
      emit('tool_result', { tool: call.name, output: toolOutput.slice(0, TOOL_OUTPUT_SSE_MAX) });
      const tr = { type: 'tool_result', tool_use_id: call.id, content: toolOutput };
      if (execErr) tr.is_error = true;
      toolResults.push(tr);

      if (Date.now() - runStartedAt > maxRunMs) {
        emit('error', { message: 'Agent run timed out', code: 'agent_run_timeout' });
        if (toolResults.length) conversationMessages.push({ role: 'user', content: toolResults });
        safeDone({ tool_calls_used: toolCallsUsed, turns: turnCount, code: 'agent_run_timeout' });
        return {
          totalUsage,
          toolCallsUsed,
          executedToolNames,
          modelKey,
          turnCount,
          timedOut: true,
          workflowRunId: null,
          agentRunId: chatAgentRunId != null ? String(chatAgentRunId) : null,
          chainRootId: toolChainRootId,
        };
      }
    }
    if (toolResults.length) conversationMessages.push({ role: 'user', content: toolResults });

    if (routingWs) {
      if (!attributedRoutingArmId()) {
        scheduleRoutingArmBanditUpdate(env, ctx, {
          taskType: routingTaskType || 'ask',
          mode: mode || 'ask',
          modelKey,
          workspaceId: routingWs,
          success: true,
          lastChainId: previousToolChainId,
        });
      }
      const qs = Number(qualityScore);
      if (Number.isFinite(qs)) {
        scheduleRoutingArmQualityUpdate(env, ctx, {
          taskType: routingTaskType || 'ask',
          mode: mode || 'ask',
          modelKey,
          workspaceId: routingWs,
          qualityScore: qs,
        });
      }
    }

    if (stopReason === 'end_turn') break;
  }
  } catch (e) {
    ledgerLoopThrew = true;
    ledgerErrorMsg = e?.message != null ? String(e.message) : String(e);
    throw e;
  } finally {
    if (chatToolLedger?.runId) {
      try {
        await finalizeChatToolSessionLedger(env, ctx, emit, chatToolLedger, {
          ok: !ledgerLoopThrew,
          errorMessage: ledgerErrorMsg,
        });
      } catch (fe) {
        console.warn('[agent] chat_tool_session_ledger_finalize', fe?.message ?? fe);
      }
    }
  }

  if (totalUsage.input_tokens || totalUsage.output_tokens) {
    const aid = attributedRoutingArmId();
    ctx.waitUntil?.(
      (async () => {
        const telemetryProvider = await resolveProviderForModelKey(env, modelKey, null);
        const out = await writeTelemetry(
          env,
          {
            sessionId,
            tenantId,
            workspaceId: routingWs || undefined,
            userId,
            provider: telemetryProvider,
            model: modelKey,
            inputTokens: totalUsage.input_tokens,
            outputTokens: totalUsage.output_tokens,
            cacheReadTokens: totalUsage.cache_read_input_tokens,
            cacheWriteTokens: totalUsage.cache_creation_input_tokens,
            cacheWriteTtl: cacheWriteTtlForBilling,
            toolCallCount: toolCallsUsed,
            success: true,
            routingArmId: aid,
            latencyMs: Date.now() - loopT0,
            taskType: routingTaskType || 'ask',
            mode: mode || 'agent',
          },
          null,
        );
        if (aid) {
          await applyRoutingArmUsageFeedback(env, {
            armId: aid,
            success: true,
            costUsd: Number(out?.estimatedCostUsd) || 0,
            durationMs: Date.now() - loopT0,
          });
        }
      })(),
    );
  }

  safeDone({ tool_calls_used: toolCallsUsed, turns: turnCount });
  return {
    totalUsage,
    toolCallsUsed,
    executedToolNames,
    modelKey,
    turnCount,
    timedOut: false,
    workflowRunId: null,
    agentRunId: chatAgentRunId != null ? String(chatAgentRunId) : null,
    chainRootId: toolChainRootId,
  };
}

async function executeWorkflowAndStream(env, workflowKey, message, actor, workspaceId, ctx, extras = {}) {
  void ctx;
  const runtimeModeTag =
    extras && typeof extras === 'object' && extras.runtimeMode != null
      ? String(extras.runtimeMode).trim().toLowerCase()
      : undefined;
  const uid = actor?.id ?? actor?.user_id ?? null;
  let tid =
    actor?.tenant_id != null && String(actor.tenant_id).trim() !== ''
      ? String(actor.tenant_id).trim()
      : null;
  if (!tid && uid) tid = await fetchAuthUserTenantId(env, uid);

  const authLike = {
    id: uid,
    tenant_id: tid,
    email: actor?.email ?? null,
  };

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  const send = (data) => {
    try {
      writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
    } catch (_) {}
  };

  const browserCtx =
    extras && typeof extras === 'object' && extras.browserContext != null && typeof extras.browserContext === 'object'
      ? extras.browserContext
      : null;

  (async () => {
    try {
      const { executeWorkflowGraph } = await import('../core/workflow-executor.js');
      const result = await executeWorkflowGraph(env, {
        workflowKey,
        input: {
          message,
          ...(runtimeModeTag ? { runtime_mode: runtimeModeTag } : {}),
          ...(browserCtx ? { browser_context: browserCtx } : {}),
        },
        tenantId: tid,
        workspaceId,
        userId: uid,
        userEmail: authLike.email ?? null,
        triggerType: 'agent',
        onRunCreated: (runId, meta) =>
          send({
            type: 'workflow_start',
            workflow_key: workflowKey,
            run_id: runId,
            steps_total: meta?.steps_total ?? null,
          }),
        onStep: (evt) => send({ type: 'workflow_step', ...evt }),
        onStream: send,
      });
      const finalText = formatWorkflowStreamFinalText(result);
      if (String(finalText).trim()) {
        send({ type: 'text', text: finalText });
      }
      const navFromProof = (result?.step_results ?? [])
        .map((s) => s?.output?.surface_open_proof)
        .filter(Boolean)
        .map((p) => extractBrowserNavigateUrl(p))
        .find(Boolean);
      const navUrl = navFromProof || extractBrowserNavigateUrl(message);
      if (navUrl) {
        send({ type: 'browser_navigate', url: navUrl });
      }
      if (result?.status === 'awaiting_approval') {
        send({
          type: 'workflow_approval_required',
          run_id: result.run_id,
          approval_id: result.approval_id,
          message:
            'This workflow requires approval before continuing. Use /api/agent/workflow/approve to proceed.',
        });
      } else {
        send({
          type: result.ok ? 'workflow_complete' : 'workflow_error',
          status: result.status,
          run_id: result.run_id,
          message: result.ok
            ? `Workflow ${workflowKey} completed (${result.steps_completed} steps).`
            : `Workflow failed: ${result.kill_reason || 'unknown error'}`,
        });
      }
    } catch (e) {
      send({
        type: 'text',
        text: `Workflow stream error: ${e?.message ?? String(e)}`,
      });
    } finally {
      send({ type: 'done' });
      try {
        await writer.close();
      } catch (_) {}
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

/**
 * Smoke: explicit Monaco/code path must hit workflow graph (no LLM tool loop).
 *   curl -N -sS https://inneranimalmedia.com/api/agent/chat \
 *     -H "Cookie: session=$IAM_SESSION" \
 *     -H "Accept: text/event-stream" \
 *     -F "message=Open Monaco and generate a tiny task tracker app" \
 *     -F "mode=agent" \
 *     -F "agent_mode=agent" \
 *     -F "runtime_intent_mode=agent" \
 *     -F "model=auto" \
 *     | tee /tmp/agent-mode-monaco-sse.txt
 * Expect: workflow_key i-am-builder-monaco, surface_open / agent_surface_open before any model tool dispatch.
 *
 * Browser surface smoke (no a11y tool roulette):
 *   curl -N -sS https://inneranimalmedia.com/api/agent/chat \
 *     -H "Cookie: session=$IAM_SESSION" \
 *     -H "Accept: text/event-stream" \
 *     -F "message=Open the browser and inspect https://inneranimalmedia.com" \
 *     -F "mode=agent" -F "agent_mode=agent" -F "runtime_intent_mode=agent" -F "model=auto" \
 *     | tee /tmp/agent-browser-sse.txt
 * Expect: surface_open + agent_surface_open (browser), browser_navigate with URL; no a11y_get_summary.
 */

/**
 * @param {Record<string, unknown>} meta
 * @param {string} surf
 * @param {string|null} intent
 */
function surfaceRoutesMetadataMatch(meta, surf, intent) {
  const sr = meta?.surface_routes;
  if (!sr) return false;
  if (Array.isArray(sr)) {
    return sr.includes(surf) || sr.includes('*');
  }
  if (typeof sr === 'object' && sr !== null) {
    const routes = /** @type {Record<string, string[]>} */ (sr)[surf] ?? [];
    return !intent || routes.includes(intent) || routes.includes('*');
  }
  return false;
}

/**
 * Resolve workflow_id from agentsam_workflows.metadata_json.surface_routes (DB-driven).
 * @param {any} env
 * @param {string} surface
 * @param {string|null} [intent]
 * @returns {Promise<string|null>} workflow_key
 */
async function resolveWorkflowFromSurfaceMetadata(env, surface, intent = null) {
  if (!env?.DB || !surface) return null;
  const surf = String(surface).trim();
  if (!surf) return null;
  try {
    const { results } = await env.DB.prepare(
      `SELECT workflow_key, metadata_json
       FROM agentsam_workflows
       WHERE COALESCE(is_active, 1) = 1
       ORDER BY updated_at DESC`,
    ).all();
    for (const row of results || []) {
      let meta = {};
      try {
        meta =
          typeof row.metadata_json === 'object'
            ? row.metadata_json
            : JSON.parse(row.metadata_json || '{}');
      } catch {
        meta = {};
      }
      if (surfaceRoutesMetadataMatch(meta, surf, intent)) {
        return String(row.workflow_key || '').trim() || null;
      }
    }
  } catch (e) {
    console.warn('[agent] resolveWorkflowFromSurfaceMetadata', e?.message ?? e);
  }
  console.warn(`[agent] no workflow for surface=${surf} intent=${intent ?? ''}`);
  return null;
}

/**
 * User explicitly wants the in-dashboard Monaco / code editor surface — not generic
 * "write a file" / "edit file" work (those use normal agent tools + file_updated UI).
 */
function userExplicitlyRequestsMonacoEditor(message) {
  const raw = String(message || '').trim();
  const t = raw.toLowerCase();
  if (!t) return false;
  if (/\bopen\s+monaco\b/i.test(t)) return true;
  if (/\bopen\s+(the\s+)?code\s+editor\b/i.test(t)) return true;
  if (/\bopen\s+the\s+editor\b/i.test(t) || /^\s*open\s+editor\s*$/i.test(raw)) return true;
  if (
    /\bopen\b/i.test(t) &&
    /\b(the\s+)?editor\b/i.test(t) &&
    !/\bbrowser\b/i.test(t) &&
    !/\bproject\b/i.test(t)
  )
    return true;
  return false;
}

/**
 * Deterministic surface → workflow routing before tool catalog / model dispatch.
 * @returns {null | { route: 'monaco' | 'browser' | 'excalidraw', reason: string }}
 */
function resolveSurfaceWorkflowForMessage(message, requestedMode) {
  const mode = String(requestedMode || 'agent').trim().toLowerCase();
  const raw = String(message || '').trim();
  const t = raw.toLowerCase();
  if (!t) return null;

  if (shouldSkipSurfaceWorkflowPreflight(raw, mode)) return null;

  if (mode === 'plan') return null;

  const isAsk = mode === 'ask';
  const isDebug = mode === 'debug';
  const isAgentLike = mode === 'agent' || mode === 'multitask';

  const askBrowser =
    /\bopen\s+(the\s+)?browser\b/i.test(t) ||
    /\bopen\s+browser\b/i.test(t) ||
    /\binspect\s+(the\s+)?(site|page)\b/i.test(t) ||
    /\bdebug\s+(the\s+)?(site|page)\b/i.test(t) ||
    /\bdebug\s+this\s+site\b/i.test(t) ||
    /\bscreenshot\b/i.test(t) ||
    /\bcapture\s+(the\s+)?page\b/i.test(t) ||
    /\bnavigate\s+to\b/i.test(t) ||
    /\b(check|inspect)\s+(the\s+)?(console|network)\b/i.test(t) ||
    /\binspect\s+(the\s+)?dom\b/i.test(t) ||
    /\binspect\s+https?:\/\//i.test(t);

  if (isAsk) {
    if (/\bopen\s+excalidraw\b/i.test(t)) return { route: 'excalidraw', reason: 'ask_explicit_open_excalidraw' };
    if (askBrowser) return { route: 'browser', reason: 'ask_explicit_browser_surface' };
    if (userExplicitlyRequestsMonacoEditor(raw)) return { route: 'monaco', reason: 'ask_explicit_monaco_editor' };
    return null;
  }

  if (isDebug) {
    if (isCodeImplementationIntent(raw) && !messageExplicitlyRequestsBrowserInspection(raw)) {
      return { route: 'monaco', reason: 'debug_code_implementation_surface' };
    }
    const dbgBrowser =
      /\bopen\s+(the\s+)?browser\b/i.test(t) ||
      /\bdebug\s+this\s+site\b/i.test(t) ||
      (/\b(debug|inspect)\b/i.test(t) &&
        /\b(url|site|page|browser|dom|console|network)\b/i.test(t) &&
        !/\b(route|component|migration|\.tsx|app\.tsx)\b/i.test(t)) ||
      /\b(screenshot|screen\s*grab)\b/i.test(t) ||
      /\binspect\s+https?:\/\//i.test(t) ||
      (!!extractBrowserNavigateUrl(t) && /\b(inspect|debug|browser)\b/i.test(t));
    if (!dbgBrowser) return null;
    return { route: 'browser', reason: 'debug_explicit_browser' };
  }

  if (!isAgentLike) return null;

  if (
    isCodeImplementationIntent(raw) &&
    !messageExplicitlyRequestsBrowserInspection(raw)
  ) {
    return { route: 'monaco', reason: 'agent_code_implementation_surface' };
  }

  const excal =
    /\bopen\s+excalidraw\b/i.test(t) ||
    /\bexcalidraw\b/i.test(t) ||
    /\b(make|create|draw)\s+(a\s+)?diagram\b/i.test(t) ||
    /\bflowchart\b/i.test(t) ||
    /\bwireframe\b/i.test(t) ||
    /\barchitecture\s+diagram\b/i.test(t) ||
    (/\b(open|show|launch)\b/i.test(t) && /\b(canvas|whiteboard)\b/i.test(t));
  if (excal) return { route: 'excalidraw', reason: 'agent_excalidraw_surface' };

  const browser =
    messageExplicitlyRequestsBrowserInspection(raw) ||
    /\bopen\s+(the\s+)?browser\b/i.test(t) ||
    /\bdebug\s+this\s+site\b/i.test(t) ||
    /\binspect\s+(the\s+)?(site|page)\b/i.test(t) ||
    /\bdebug\s+(the\s+)?(site|page)\b/i.test(t) ||
    (/\b(debug|inspect)\b/i.test(t) &&
      /\b(site|page|url|browser|dom|console|network)\b/i.test(t) &&
      !/\b(route|component|migration|\.tsx|app\.tsx|components\/)\b/i.test(t)) ||
    /\b(screenshot|screen\s*grab)\b/i.test(t) ||
    /\bcapture\s+(the\s+)?page\b/i.test(t) ||
    (/\bnavigate\b/i.test(t) && /\b(to\s+)?(url|page|site|https?:)/i.test(t)) ||
    /\bnavigate\s+to\b/i.test(t) ||
    /\b(check|inspect)\s+(the\s+)?(console|network)\b/i.test(t) ||
    /\binspect\s+(the\s+)?dom\b/i.test(t) ||
    /\binspect\s+https?:\/\//i.test(t) ||
    (!!extractBrowserNavigateUrl(t) &&
      /\b(inspect|debug|open\s+the\s+browser|open\s+browser|screenshot|navigate)\b/i.test(t));
  if (browser) return { route: 'browser', reason: 'agent_browser_surface' };

  if (userExplicitlyRequestsMonacoEditor(raw)) return { route: 'monaco', reason: 'agent_monaco_code_surface' };

  return null;
}

/** URL from message text or structured browser_context (dashboard BrowserView). */
function extractPrimaryUrlForBrowserPreflight(message, browserContext) {
  const fromMsg = extractBrowserNavigateUrl(message);
  if (fromMsg) return fromMsg;
  return extractBrowserNavigateUrl(browserContext) || '';
}

/** Human-readable workflow SSE text — never dump surface_open_proof JSON into chat. */
function formatWorkflowStreamFinalText(result) {
  const steps = Array.isArray(result?.step_results) ? result.step_results : [];
  const lines = [];
  for (const s of steps) {
    const nk = s?.node_key ? String(s.node_key) : 'step';
    if (s?.ok === false && s?.error) {
      lines.push(`**${nk}** failed: ${String(s.error).slice(0, 500)}`);
      continue;
    }
    const proof = s?.output?.surface_open_proof;
    if (proof && typeof proof === 'object') {
      const url = typeof proof.url === 'string' ? proof.url.trim() : '';
      const surface = typeof proof.surface === 'string' ? proof.surface : 'browser';
      lines.push(url ? `Opened **${surface}** → ${url}` : `Opened **${surface}** workspace.`);
      continue;
    }
    const text = s?.output?.result ?? s?.output?.text;
    if (typeof text === 'string' && text.trim()) {
      const t = text.trim();
      if (!t.startsWith('{') && !t.startsWith('[')) {
        lines.push(t);
        continue;
      }
      try {
        const parsed = JSON.parse(t);
        const summary =
          (typeof parsed.summary === 'string' && parsed.summary) ||
          (typeof parsed.message === 'string' && parsed.message) ||
          (typeof parsed.issue_summary === 'string' && parsed.issue_summary) ||
          '';
        if (summary) lines.push(summary);
      } catch {
        /* skip opaque JSON blobs */
      }
    }
  }
  if (lines.length) return lines.join('\n\n');
  const lastProof = steps[steps.length - 1]?.output?.surface_open_proof;
  if (lastProof?.url) return `Opened browser → ${lastProof.url}`;
  return '';
}

/** Prefer seeded keys, then registry / node graph heuristics. */
async function resolveBrowserWorkflowKeyFromDb(env) {
  const metaRouted = await resolveWorkflowFromSurfaceMetadata(env, 'browser', '*');
  if (metaRouted) {
    try {
      const wf = await env.DB.prepare(
        `SELECT workflow_key FROM agentsam_workflows WHERE workflow_key = ? AND COALESCE(is_active, 1) = 1 LIMIT 1`,
      )
        .bind(metaRouted)
        .first();
      if (wf?.workflow_key) return String(wf.workflow_key);
    } catch {
      /* fall through */
    }
  }
  if (!env?.DB) return null;
  try {
    const row = await env.DB.prepare(
      `SELECT workflow_key FROM agentsam_workflows
       WHERE COALESCE(is_active, 1) = 1
         AND (
           LOWER(workflow_key) LIKE '%browser%'
           OR LOWER(workflow_key) LIKE '%playwright%'
           OR LOWER(workflow_key) LIKE '%inspector%'
         )
       ORDER BY CASE WHEN LOWER(workflow_key) LIKE '%browser%' THEN 0 ELSE 1 END,
                workflow_key ASC
       LIMIT 1`,
    ).first();
    if (row?.workflow_key) return String(row.workflow_key);
  } catch (e) {
    console.warn('[agent] resolveBrowserWorkflowKeyFromDb registry', e?.message ?? e);
  }
  try {
    const row2 = await env.DB.prepare(
      `SELECT w.workflow_key FROM agentsam_workflows w
       INNER JOIN agentsam_workflow_nodes n ON n.workflow_id = w.id
       WHERE COALESCE(w.is_active, 1) = 1
         AND (
           LOWER(COALESCE(n.node_key, '')) LIKE '%browser%'
           OR LOWER(COALESCE(n.handler_key, '')) LIKE '%browser%'
           OR LOWER(COALESCE(n.handler_key, '')) LIKE '%playwright%'
           OR LOWER(COALESCE(n.node_key, '')) LIKE '%screenshot%'
           OR LOWER(COALESCE(n.node_key, '')) LIKE '%inspect%'
         )
       GROUP BY w.workflow_key
       ORDER BY w.workflow_key ASC
       LIMIT 1`,
    ).first();
    if (row2?.workflow_key) return String(row2.workflow_key);
  } catch (e2) {
    console.warn('[agent] resolveBrowserWorkflowKeyFromDb nodes', e2?.message ?? e2);
  }
  return null;
}

function userRequestedAccessibilityTools(message) {
  return /\b(a11y|accessibility|wcag|aria|screen\s*reader|axe)\b/i.test(String(message || ''));
}

function shouldStripA11yForPlainSurfaceMessage(message, requestedMode) {
  if (userRequestedAccessibilityTools(message)) return false;
  const mode = String(requestedMode || '').toLowerCase();
  if (mode === 'plan') return false;
  const tagged = resolveSurfaceWorkflowForMessage(message, requestedMode);
  if (!tagged) return false;
  if (tagged.route === 'excalidraw') return false;
  return true;
}

function stripSurfaceA11yTools(tools) {
  if (!Array.isArray(tools)) return tools;
  return tools.filter((t) => {
    const n = String(t?.name || '');
    if (n.startsWith('a11y_')) return false;
    if (n === 'accessibilityExpert') return false;
    return true;
  });
}

function isAgentLikeSurfacePreflightMode(requestedMode) {
  const mode = String(requestedMode || 'agent').trim().toLowerCase();
  return mode === 'agent' || mode === 'debug' || mode === 'multitask' || mode === 'ask';
}

function logSurfacePreflightIntentDebug(message, requestedMode) {
  const strippedUserText = stripUserTextForIntent(message);
  const tagged = resolveSurfaceWorkflowForMessage(message, requestedMode);
  console.log(
    '[agent] surface_preflight_intent_debug',
    JSON.stringify({
      userText: String(message || '').slice(0, 200),
      strippedUserText: strippedUserText.slice(0, 200),
      isReadOnlyRepoSearchIntent: isReadOnlyRepoSearchIntent(message),
      isReadOnlyFileContextIntent: isReadOnlyFileContextIntent(message),
      isCodeImplementationIntent: isCodeImplementationIntent(message),
      shouldSkipSurfaceWorkflowPreflight: shouldSkipSurfaceWorkflowPreflight(message, requestedMode),
      reason: tagged?.reason ?? null,
    }),
  );
}

function shouldBypassSurfaceWorkflowPreflight(message, requestedMode) {
  if (!isAgentLikeSurfacePreflightMode(requestedMode)) return false;
  return isReadOnlyRepoSearchIntent(message) || isReadOnlyFileContextIntent(message);
}

function surfaceWorkflowPreflightBypassReason(message) {
  if (isReadOnlyRepoSearchIntent(message)) return 'read_only_workspace_grep';
  if (isReadOnlyFileContextIntent(message)) return 'read_only_file_context';
  return 'read_only_surface';
}

function logSurfaceWorkflowPreflightBypass(requestedMode, missingSurface, surfaceRouteReason, message) {
  console.log(
    '[agent] surface_workflow_preflight_bypass',
    JSON.stringify({
      reason: surfaceWorkflowPreflightBypassReason(message),
      requestedMode,
      missingSurface,
      surfaceRouteReason: surfaceRouteReason ?? null,
      activeFilePresent: /\[Active file envelope/i.test(String(message || '')),
    }),
  );
}

/**
 * Map surface route to concrete workflow_key (or missing).
 * @returns {Promise<null | { kind: 'execute', workflowKey: string, reason: string } | { kind: 'missing_workflow', surface: string, reason: string }>}
 */
async function resolveSurfaceWorkflowPreflightExecution(env, message, requestedMode, browserContext) {
  const dashboardRoute =
    browserContext && typeof browserContext === 'object' && browserContext.dashboard_route != null
      ? String(browserContext.dashboard_route).trim()
      : '';
  if (shouldSkipSurfaceWorkflowPreflight(message, requestedMode, { dashboardRoute })) return null;
  const tagged = resolveSurfaceWorkflowForMessage(message, requestedMode);
  if (!tagged) return null;
  if (tagged.route === 'monaco') {
    const key = await resolveWorkflowFromSurfaceMetadata(env, 'monaco', '*');
    if (key) return { kind: 'execute', workflowKey: key, reason: tagged.reason };
    if (
      shouldBypassSurfaceWorkflowPreflight(message, requestedMode) ||
      isCodeImplementationIntent(message)
    ) {
      logSurfaceWorkflowPreflightBypass(requestedMode, 'monaco', tagged.reason, message);
      return null;
    }
    return { kind: 'missing_workflow', surface: 'monaco', reason: tagged.reason };
  }
  if (tagged.route === 'browser') {
    const key = await resolveBrowserWorkflowKeyFromDb(env);
    if (key) return { kind: 'execute', workflowKey: key, reason: tagged.reason };
    return { kind: 'missing_workflow', surface: 'browser', reason: tagged.reason };
  }
  if (tagged.route === 'excalidraw') {
    const key = await resolveWorkflowFromSurfaceMetadata(env, 'excalidraw', '*');
    if (key) return { kind: 'execute', workflowKey: key, reason: tagged.reason };
    return { kind: 'missing_workflow', surface: 'excalidraw', reason: tagged.reason };
  }
  return null;
}

/** When no browser workflow is registered: open Browser tab + navigate without entering LLM tool loop. */
function streamBrowserPreflightNoWorkflow(message, browserContext) {
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const runId = `wrun_browser_preflight_${Date.now().toString(36)}`;
  const url = extractPrimaryUrlForBrowserPreflight(message, browserContext);
  (async () => {
    try {
      const ctxPayload =
        browserContext && typeof browserContext === 'object'
          ? {
              url: browserContext.url ?? null,
              route_path: browserContext.route_path ?? null,
              selected_element: browserContext.selected_element ?? null,
              dashboard_route: browserContext.dashboard_route ?? null,
            }
          : {};
      writer.write(
        encoder.encode(
          `data: ${JSON.stringify({
            type: 'context',
            scope: 'browser_preflight',
            browser_context: ctxPayload,
          })}\n\n`,
        ),
      );
      const surf = {
        surface: 'browser',
        reason: 'browser_preflight',
        node_key: 'preflight',
        run_id: runId,
        workflow_key: null,
      };
      writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'surface_open', ...surf })}\n\n`));
      writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'agent_surface_open', ...surf })}\n\n`));
      if (url) {
        writer.write(
          encoder.encode(`data: ${JSON.stringify({ type: 'browser_navigate', url, run_id: runId })}\n\n`),
        );
      }
      writer.write(
        encoder.encode(
          `data: ${JSON.stringify({
            type: 'text',
            text:
              '**Browser workflow graph is not active in D1** — deterministic automation steps are unavailable until a browser/playwright workflow is seeded and `is_active=1`. The dashboard should still open the Browser tab above.\n\n' +
              (url ? `_Target URL:_ ${url}\n\n` : '_No URL parsed from message or browser context._\n\n') +
              `_Message:_ ${String(message || '').slice(0, 400)}`,
          })}\n\n`,
        ),
      );
      writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
    } catch (_) {
      /* ignore */
    } finally {
      try {
        await writer.close();
      } catch (_) {}
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

function streamPreflightSurfaceWorkflowMissing(surface, userMessage) {
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const runId = `wrun_preflight_${Date.now().toString(36)}`;
  (async () => {
    try {
      const payload = {
        surface,
        reason: 'surface_workflow_preflight_missing',
        node_key: 'preflight',
        run_id: runId,
      };
      writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'surface_open', ...payload })}\n\n`));
      writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'agent_surface_open', ...payload })}\n\n`));
      const label =
        surface === 'browser'
          ? 'Browser inspection'
          : surface === 'excalidraw'
            ? 'Excalidraw / diagram'
            : String(surface);
      writer.write(
        encoder.encode(
          `data: ${JSON.stringify({
            type: 'text',
            text: `**${label} workflow is missing** — no active matching workflow_key in D1 for this deployment. Add or activate the workflow graph, then retry.\n\n_Message:_ ${String(userMessage || '').slice(0, 480)}`,
          })}\n\n`,
        ),
      );
      writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
    } catch (_) {
      /* ignore */
    } finally {
      try {
        await writer.close();
      } catch (_) {}
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

/** Wildcard glob match for MCP panel tool allowlists (e.g. `d1_*`, `*`). */
export function mcpPanelToolMatchesGlob(toolName, pattern) {
  const n = String(toolName || '').trim();
  const p = String(pattern || '').trim();
  if (!n || !p) return false;
  if (p === '*' || p === '**') return true;
  const esc = p
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  try {
    return new RegExp(`^${esc}$`, 'i').test(n);
  } catch {
    return false;
  }
}

function filterToolsForMcpPanelGlobs(tools, globs) {
  if (!Array.isArray(tools) || !tools.length) return [];
  if (!Array.isArray(globs) || !globs.length) return tools;
  const list = globs.map((g) => String(g || '').trim()).filter(Boolean);
  if (!list.length) return tools;
  return tools.filter((t) => list.some((g) => mcpPanelToolMatchesGlob(t?.name, g)));
}

/**
 * MCP dashboard subagent chat — reuses {@link runAgentToolLoop} / dispatchStream (same path as agent chat).
 * Called only from server-side routes with a trusted panel payload (not client-spoofed overrides).
 *
 * @param {Record<string, unknown>} panel
 */
export async function mcpPanelAgentChatSse(env, request, ctx, panel) {
  const tenantId = panel.tenantId != null ? String(panel.tenantId).trim() : '';
  const userId = panel.userId != null ? String(panel.userId).trim() : '';
  const workspaceId = panel.workspaceId != null ? String(panel.workspaceId).trim() : '';
  const personUuid =
    panel.personUuid != null && String(panel.personUuid).trim() !== ''
      ? String(panel.personUuid).trim()
      : null;
  const sessionPkId = panel.sessionPkId != null ? String(panel.sessionPkId).trim() : '';
  const slug = panel.slug != null ? String(panel.slug).trim() : '';
  const profile = panel.profile && typeof panel.profile === 'object' ? panel.profile : {};
  const modelKey = panel.modelKey != null ? String(panel.modelKey).trim() : '';
  /** @type {{ role: string, content: string }[]} */
  const messages = Array.isArray(panel.messages) ? panel.messages : [];
  let toolGlobs = [];
  try {
    const raw = profile.allowed_tool_globs;
    if (typeof raw === 'string') {
      const j = JSON.parse(raw || '[]');
      toolGlobs = Array.isArray(j) ? j : [];
    } else if (Array.isArray(raw)) toolGlobs = raw;
  } catch {
    toolGlobs = [];
  }
  if (Array.isArray(panel.toolGlobsOverride) && panel.toolGlobsOverride.length) {
    toolGlobs = panel.toolGlobsOverride.map((x) => String(x || '').trim()).filter(Boolean);
  }

  if (!tenantId || !userId || !workspaceId || !sessionPkId || !slug || !modelKey) {
    return jsonResponse({ error: 'mcp_panel_chat: missing tenant/user/workspace/session/model' }, 400);
  }
  if (!messages.length) return jsonResponse({ error: 'messages required' }, 400);

  const requestedMode = 'agent';
  const [modeConfig, userPolicy] = await Promise.all([
    loadModeConfig(env, requestedMode, workspaceId),
    loadAgentSamUserPolicy(env, userId, workspaceId),
  ]);

  const effectiveMaxTools = Math.max(1, Math.min(200, Number(modeConfig.max_tool_calls || 20) || 20));

  const lastUserMsg =
    messages.length && String(messages[messages.length - 1]?.role || '') === 'user'
      ? String(messages[messages.length - 1]?.content || '')
      : '';
  const {
    tools: dbToolsRaw,
    toolRoutingError: panelToolRoutingError,
  } = await loadToolsForRequest(env, requestedMode, 'question', {
    limit: effectiveMaxTools,
    includeSchemas: false,
    userId,
    workspaceId,
    tenantId,
    personUuid,
    message: lastUserMsg,
    taskType: 'agent',
    agentChat: true,
    routeKey: 'mcp_panel',
  });
  if (panelToolRoutingError) {
    return jsonResponse(
      {
        error: panelToolRoutingError.message,
        code: panelToolRoutingError.code,
        missing_capabilities: panelToolRoutingError.missing,
      },
      422,
    );
  }
  let tools = dbToolsRaw.map((t) => {
    const raw = t.input_schema && typeof t.input_schema === 'object' ? t.input_schema : {};
    return {
      name: t.name,
      description: t.description || t.name,
      input_schema: Object.assign({ type: 'object', properties: {} }, raw, { type: 'object' }),
    };
  });
  tools = filterToolsForMcpPanelGlobs(tools, toolGlobs);

  const sysInst = String(profile.instructions_markdown || '').trim();
  const systemPrompt =
    sysInst +
    '\n\n## Current Session\n' +
    `Tenant: ${tenantId}\n` +
    `Workspace: ${workspaceId}\n` +
    `Date: ${new Date().toISOString()}\n`;

  const mcpRuntimeContext = {
    userId,
    tenantId,
    workspaceId,
    personUuid,
    sessionId: sessionPkId,
    isSuperadmin: false,
    routeKey: 'mcp_panel',
  };

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  const emit = (type, payload) => {
    try {
      writer.write(encoder.encode(`data: ${JSON.stringify({ type, ...payload })}\n\n`));
    } catch (_) {}
  };

  emit('context', {
    intent: 'mcp_panel',
    mode: requestedMode,
    model: modelKey,
    tool_count: tools.length,
    slug,
  });

  const MCP_CHAT_LOOP_MS = 300000;

  ;(async () => {
    let assistantAccum = '';
    try {
      let textEmitted = 0;
      const emitWrapped = (type, payload) => {
        if (type === 'text' && payload?.text) {
          textEmitted += String(payload.text).length;
          assistantAccum += String(payload.text);
        }
        emit(type, payload);
      };

      const lastLoopStats = await withTimeout(
        runAgentToolLoop(env, ctx, emitWrapped, {
          request,
          messages,
          tools,
          systemPrompt,
          modelKey,
          temperature: modeConfig.temperature || 0.7,
          maxToolCalls: effectiveMaxTools,
          mode: requestedMode,
          modeConfig,
          userPolicy,
          sessionId: sessionPkId,
          tenantId,
          userId,
          workspaceId,
          routingTaskType: 'agent',
          qualityScore: 1,
          mcpRuntimeContext,
          routingArmId: null,
          thompsonModelKey: null,
          chatRouteKey: 'mcp_panel',
          promptAuditContext: {
            route: 'mcp_panel_chat',
            mcp_slug: slug,
            session_id: sessionPkId,
            workspace_id: workspaceId,
            mode: requestedMode,
          },
        }),
        MCP_CHAT_LOOP_MS,
      );

      const toolCallsUsed = Number(lastLoopStats?.toolCallsUsed) || 0;
      const tokensIn = Number(lastLoopStats?.totalUsage?.input_tokens) || 0;
      const tokensOut = Number(lastLoopStats?.totalUsage?.output_tokens) || 0;

      if (textEmitted <= 0) {
        emit('error', { message: 'empty_stream' });
      }

      ctx.waitUntil?.(
        (async () => {
          try {
            if (!env.DB) return;
            const nextMsgs = [
              ...messages.map((m) => ({
                role: String(m?.role || ''),
                content: String(m?.content || ''),
              })),
              ...(assistantAccum ? [{ role: 'assistant', content: assistantAccum }] : []),
            ].filter((m) => m.content && (m.role === 'user' || m.role === 'assistant'));
            const capped = nextMsgs.slice(-40);

            await env.DB.prepare(
              `UPDATE mcp_agent_sessions SET
                 status = 'idle',
                 messages_json = ?,
                 cost_usd = COALESCE(cost_usd, 0) + ?,
                 tool_calls_count = COALESCE(tool_calls_count, 0) + ?,
                 last_activity = datetime('now'),
                 updated_at = unixepoch(),
                 current_task = NULL
               WHERE id = ? AND tenant_id = ?`,
            )
              .bind(
                JSON.stringify(capped),
                0,
                toolCallsUsed,
                sessionPkId,
                tenantId,
              )
              .run();
          } catch (e) {
            console.warn('[mcp_panel_chat] session update failed:', e?.message ?? e);
          }
        })(),
      );

      void tokensIn;
      void tokensOut;
    } catch (e) {
      console.warn('[mcp_panel_chat]', e?.message ?? e);
      emit('error', { message: String(e?.message || e || 'chat_failed') });
      ctx.waitUntil?.(
        (async () => {
          try {
            if (!env.DB) return;
            await env.DB.prepare(
              `UPDATE mcp_agent_sessions SET status = 'idle', updated_at = unixepoch(), last_activity = datetime('now') WHERE id = ? AND tenant_id = ?`,
            )
              .bind(sessionPkId, tenantId)
              .run();
          } catch (_) {}
        })(),
      );
    } finally {
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

// ─── SSE Chat Handler ─────────────────────────────────────────────────────────

/** Composer runtime contract (lowercase): ask | plan | agent | debug | multitask */
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
    if (files.length) body.files = files;
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

  const actorCtx = await resolveIamActorContext(request, env).catch(() => null);
  const authUser = ingestBypass ? null : await authUserFromRequest(request, env).catch(() => null);

  let tenantId =
    (session?.tenant_id != null && String(session.tenant_id).trim() !== ''
      ? String(session.tenant_id).trim()
      : null) ||
    (actorCtx?.tenantId != null && String(actorCtx.tenantId).trim() !== ''
      ? String(actorCtx.tenantId).trim()
      : null);
  if (!tenantId && session?.user_id) {
    tenantId = await fetchAuthUserTenantId(env, session.user_id);
  }
  const userId =
    session?.user_id ||
    (ingestBypass ? null : identity?.userId) ||
    actorCtx?.userId ||
    null;
  const wsCache = {};
  const bootstrapWorkspaceId = userId ? await resolveBootstrapWorkspaceIdForAgentApi(env, request, userId, wsCache) : null;
  let workspaceId =
    String(resolvedWorkspaceId || '').trim() ||
    String(session?.workspace_id || '').trim() ||
    String(body.workspace_id || '').trim() ||
    (actorCtx?.workspaceId != null && String(actorCtx.workspaceId).trim() !== ''
      ? String(actorCtx.workspaceId).trim()
      : '') ||
    '';
  if (!workspaceId) workspaceId = String(bootstrapWorkspaceId || '').trim();
  if (!workspaceId) return jsonResponse({ error: 'WORKSPACE_CONTEXT_MISSING' }, 400);
  // All PTY execution paths MUST have an authenticated userId
  if (!userId) return jsonResponse({ error: 'UNAUTHENTICATED_USER' }, 401);

  let handoffResume = null;
  if (sessionId && env.DB) {
    try {
      handoffResume = await resolvePendingHandoffForSession(env, {
        sessionId: String(sessionId),
        workspaceId,
      });
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
        console.log(
          '[agent-handoff] resume',
          JSON.stringify({
            session_id: sessionId,
            spawn_id: handoffResume.spawnId,
            model: handoffResume.fallbackModelKey,
            depth: handoffResume.depth,
          }),
        );
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
    const githubRepoContext = String(body.github_repo_context || body.githubRepoContext || '').trim();
    if (githubRepoContext) body.selectedGithubRepoContext = githubRepoContext;
    const localBufferOpen = activeFileIsLocalWorkspaceBuffer(activeFileEnvelope);
    if (githubRepoContext && !localBufferOpen) {
      if (activeFileEnvelope) {
        if (!activeFileEnvelope.github_repo) activeFileEnvelope.github_repo = githubRepoContext;
      } else {
        activeFileEnvelope = parseActiveFileEnvelope({
          active_file_source: 'github',
          active_file_github_repo: githubRepoContext,
        });
        if (activeFileEnvelope) body.activeFileEnvelope = activeFileEnvelope;
      }
    }
  } catch (e) {
    console.warn('[agent] active_file_envelope_parse', e?.message ?? e);
  }

  /** Custom / platform subagent profile (composer slug or profile id). */
  let subagentProfileRow = null;
  try {
    subagentProfileRow = await resolveSubagentProfileForChat(env.DB, {
      userId: String(userId),
      workspaceId,
      tenantId,
      profileId: body.subagent_profile_id ?? body.subagentProfileId,
      slug: body.subagent_slug ?? body.subagentSlug,
    });
    if (subagentProfileRow) {
      body.subagent_profile_id = subagentProfileRow.id;
      body.subagent_slug = subagentProfileRow.slug;
      body.subagent = true;
      applySubagentDefaultModelToBody(body, subagentProfileRow, { useRoutingArms: true });
    }
  } catch (e) {
    console.warn('[agent] subagent_profile_resolve', e?.message ?? e);
  }

  // Legacy compatibility: default ask subagent selection for the /api/agent/chat endpoint.
  // Runtime spine (`executeAgentChatSpine`) uses compiled RuntimeProfile and does not route by requestedMode.
  if (!subagentProfileRow && requestedMode === 'ask') {
    try {
      subagentProfileRow = await resolveSubagentProfileForChat(env.DB, {
        userId: String(userId),
        workspaceId,
        tenantId,
        profileId: 'codex_builtin_default',
        slug: 'codex-default',
      });
      if (subagentProfileRow) {
        body.subagent_profile_id = subagentProfileRow.id;
        body.subagent_slug = subagentProfileRow.slug;
        body.subagent = true;
      }
    } catch (e) {
      console.warn('[agent] ask_default_subagent_resolve', e?.message ?? e);
    }
  }

  const grRoute = await evaluateGuardrails(env, ctx, {
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
  });
  if (grRoute.blocked) {
    return jsonResponse(
      { error: grRoute.decision?.reason || 'guardrail_blocked', guardrail: grRoute.decision?.guardrail_key },
      403,
    );
  }

  /** @type {Record<string, unknown>|null} */
  let browserContextPayload = null;
  try {
    const bc = body.browserContext ?? body.browser_context;
    if (typeof bc === 'string' && bc.trim()) browserContextPayload = parseJsonSafe(bc.trim(), null);
    else if (bc && typeof bc === 'object') browserContextPayload = bc;
  } catch (_) {
    browserContextPayload = null;
  }

  logSurfacePreflightIntentDebug(message, requestedMode);
  const surfacePreflight = await resolveSurfaceWorkflowPreflightExecution(
    env,
    message,
    requestedMode,
    browserContextPayload,
  );
  const surfaceTagForLog = resolveSurfaceWorkflowForMessage(message, requestedMode);
  if (surfaceTagForLog?.route === 'browser') {
    console.log(
      '[agent] browser_surface_preflight',
      JSON.stringify({
        requestedMode,
        workflowKey: surfacePreflight?.kind === 'execute' ? surfacePreflight.workflowKey : null,
        url: extractPrimaryUrlForBrowserPreflight(message, browserContextPayload) || null,
        reason: surfaceTagForLog.reason,
      }),
    );
  }
  console.log(
    '[agent] surface_workflow_preflight',
    JSON.stringify({
      requestedMode,
      workflowKey: surfacePreflight?.kind === 'execute' ? surfacePreflight.workflowKey : null,
      missingSurface: surfacePreflight?.kind === 'missing_workflow' ? surfacePreflight.surface : null,
      reason: surfacePreflight?.reason ?? null,
      hit: surfacePreflight != null,
      message: String(message || '').slice(0, 200),
    }),
  );
  if (surfacePreflight?.kind === 'execute') {
    const actor = authUser || { id: userId, tenant_id: tenantId, email: null };
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

  const userPolicy = await loadAgentSamUserPolicy(env, userId, workspaceId);
  const agentChatResolvedContext = await buildAgentChatResolvedContext(env, {
    request,
    userId,
    tenantId,
    workspaceId,
    workSessionId: body.work_session_id ?? body.workSessionId ?? session?.work_session_id ?? null,
    sessionId,
    userPolicy,
  });

  const { executeAgentChatSpine } = await import('./agent-chat-spine.js');
  return executeAgentChatSpine(env, request, ctx, {
    body,
    message,
    requestedMode,
    tenantId,
    userId,
    workspaceId,
    sessionId,
    authUser,
    subagentProfileRow,
    activeFileEnvelope,
    browserContextPayload,
    handoffResume,
    userPolicy,
    agentChatResolvedContext,
    quickstartBatch,
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

  if (path === '/api/agent/subagent-profiles' && method === 'GET') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const actorCtx = await resolveIamActorContext(request, env).catch(() => null);
    const wsRes = await resolveEffectiveWorkspaceId(env, request, authUser, {});
    if (wsRes.error || !wsRes.workspaceId) {
      return jsonResponse({ error: wsRes.error || 'no_workspace', redirect: '/onboarding' }, 403);
    }
    const effectiveWs = String(wsRes.workspaceId).trim();
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

  // GET /api/agent/todo — multi-tenant agentsam_todo
  if (path === '/api/agent/todo' && method === 'GET') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const scope = await resolveAgentDataScope(env, authUser, request, {});
    if (!scope.tenantId) return jsonResponse({ error: 'Tenant could not be resolved' }, 403);
    if (!scope.workspaceId) return jsonResponse({ todos: [] });
    try {
      const { results } = await env.DB.prepare(
        `SELECT * FROM agentsam_todo
         WHERE tenant_id = ? AND workspace_id = ?
           AND (status IS NULL OR LOWER(TRIM(status)) != 'done')
         ORDER BY priority ASC`,
      )
        .bind(scope.tenantId, scope.workspaceId)
        .all();
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
    return jsonResponse([
      { slug: 'agent', label: 'Agent', description: 'Execute and open surfaces', color: null, icon: null, temperature: 0.7, auto_run: 0, max_tool_calls: 15 },
      { slug: 'plan', label: 'Plan', description: 'Design technical plans', color: null, icon: null, temperature: 0.7, auto_run: 0, max_tool_calls: 15 },
      { slug: 'debug', label: 'Debug', description: 'Inspect, prove, and fix', color: null, icon: null, temperature: 0.7, auto_run: 0, max_tool_calls: 15 },
      { slug: 'ask', label: 'Ask', description: 'Talk and answer questions', color: null, icon: null, temperature: 0.7, auto_run: 0, max_tool_calls: 15 },
      { slug: 'auto', label: 'Auto', description: 'Automatic routing', color: null, icon: null, temperature: 0.7, auto_run: 0, max_tool_calls: 15 },
    ]);
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
    const wsRes = await resolveEffectiveWorkspaceId(env, request, authUser, body);
    const workspaceId = wsRes?.workspaceId != null ? String(wsRes.workspaceId).trim() : '';
    if (!workspaceId) return jsonResponse({ error: 'WORKSPACE_CONTEXT_MISSING' }, 400);
    let tenantId =
      authUser.tenant_id != null && String(authUser.tenant_id).trim() !== ''
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
    const out = await executeCommand(env, ctx, {
      commandId: String(cmdRow.id),
      userId: authUser.id,
      tenantId,
      workspaceId,
      sessionId: body.session_id ?? body.conversation_id ?? body.sessionId ?? null,
      agentRunId: body.agent_run_id ?? body.agentRunId ?? null,
      args: body.args && typeof body.args === 'object' ? body.args : {},
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
      const wsRes = authUser
        ? await resolveEffectiveWorkspaceId(env, request, authUser, {})
        : { workspaceId: null };
      const results = await listAgentsamSlashCommands(env.DB, {
        tenantId,
        workspaceId: wsRes?.workspaceId ?? null,
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
      const wsRes = await resolveEffectiveWorkspaceId(env, request, authUser, {});
      const wid = wsRes.workspaceId != null ? String(wsRes.workspaceId).trim() : '';
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
    const problems = buildUnifiedProblems({ error_log, mcp_tool_errors, audit_failures, worker_errors });

    return jsonResponse({
      checked_at: checkedAt,
      error_log,
      mcp_tool_errors,
      audit_failures,
      worker_errors,
      problems,
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
    return jsonResponse({ success: true });
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
    const { results } = await env.DB.prepare(
      `SELECT key, memory_type, COALESCE(importance, importance_score, 5) AS importance_score, sync_key
       FROM agentsam_memory WHERE tenant_id = ? ORDER BY COALESCE(importance, importance_score, 0) DESC LIMIT 200`,
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
      const payload = await fetchGitStatusFromGitHub(env, authUser, request, url);
      if (payload.error) {
        return jsonResponse(
          { error: payload.error, detail: payload.detail, workspace_id: payload.workspace_id },
          payload.status || 500,
        );
      }
      return jsonResponse({
        branch: payload.branch,
        repo: payload.repo,
        repo_full_name: payload.repo_full_name,
        workspace_id: payload.workspace_id,
      });
    } catch (e) { return jsonResponse({ error: e?.message }, 500); }
  }

  // ── GET /api/agent/pty/health ─────────────────────────────────────────────
  if (path === '/api/agent/pty/health' && method === 'GET') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    return jsonResponse(await pingPtyServiceHealth(env));
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

  // ── /api/agent/git/sync ───────────────────────────────────────────────────
  if (path === '/api/agent/git/sync' && method === 'POST') {
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);
    const body       = await request.json().catch(() => ({}));
    let tenantId =
      authUser.tenant_id != null && String(authUser.tenant_id).trim() !== ''
        ? String(authUser.tenant_id).trim()
        : null;
    if (!tenantId) tenantId = await fetchAuthUserTenantId(env, authUser.id);
    if (!tenantId && authUser.email) tenantId = await fetchAuthUserTenantId(env, authUser.email);
    if (!tenantId) return jsonResponse({ error: 'Tenant not configured for this account' }, 403);
    const proposalId = 'prop_' + crypto.randomUUID().replace(/-/g,'').slice(0,16);
    const now        = Math.floor(Date.now() / 1000);
    const proposedBy = String(authUser.email || authUser.id || 'user').slice(0,200);
    const iamOrigin  = (env.IAM_ORIGIN || '').replace(/\/$/,'');
    const expGit = now + 86400;
    await env.DB.prepare(
      `INSERT INTO agentsam_approval_queue
       (id, tenant_id, workspace_id, user_id, session_id, tool_name, action_summary,
        risk_level, input_json, expires_at, status, approval_type, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
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
    notifySam(env, { subject: 'Git sync proposal pending', body: `Proposal: ${proposalId}\nApprove: ${iamOrigin}/dashboard/overview?proposal=${proposalId}`, category: 'proposal' }, ctx);
    return jsonResponse({ ok: true, proposal_id: proposalId, risk_level: 'medium' });
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
        return jsonResponse(Array.isArray(rows) ? rows : (rows.messages || []));
      } catch (_) {}
    }
    if (!env.DB) return jsonResponse([]);
    const authUser = await authUserFromRequest(request, env, ra.authCtx, ra.authUser ?? null);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    const userId = await resolveCanonicalUserId(String(authUser.id || ''), env).catch(() => String(authUser.id || ''));
    const run = await env.DB.prepare(
      `SELECT id FROM agentsam_agent_run
       WHERE (id = ? OR conversation_id = ?) AND user_id = ?
       LIMIT 1`,
    )
      .bind(convId, convId, userId)
      .first()
      .catch(() => null);
    if (!run?.id) return jsonResponse([]);
    return jsonResponse([]);
  }

  // ── /api/agent/sessions PATCH /:id ───────────────────────────────────────
  const sessionPatchMatch = path.match(/^\/api\/agent\/sessions\/([^/]+)$/);
  if (sessionPatchMatch && method === 'PATCH') {
    const convId = sessionPatchMatch[1];
    const body   = await request.json().catch(() => ({}));
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    await env.DB.prepare(`UPDATE mcp_agent_sessions SET status = ?, last_activity = ?, updated_at = unixepoch() WHERE conversation_id = ?`).bind(String(body.status||'completed'), new Date().toISOString(), convId).run().catch(() => {});
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
      const now    = Math.floor(Date.now() / 1000);
      const name   = (typeof body.name === 'string' && body.name.trim()) ? body.name.trim() : 'New Conversation';
      const r2Key  = `agent-sessions/${id}/context.json`;
      const sessCtx = JSON.stringify({ session_id: id, name, created_at: Date.now(), message_count: 0, messages: [] });
      if (env.R2) await env.R2.put(r2Key, sessCtx, { httpMetadata: { contentType: 'application/json' } }).catch(() => {});
      if (env.SESSION_CACHE) await env.SESSION_CACHE.put(`sess_ctx:${id}`, sessCtx, { expirationTtl: 86400 }).catch(() => {});
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
      await env.DB.prepare(
        `INSERT OR IGNORE INTO agent_conversations (id, user_id, title, name, created_at, updated_at, is_archived)
         VALUES (?, ?, ?, ?, ?, ?, 0)`,
      )
        .bind(id, userId, name, name, now, now)
        .run()
        .catch(() => null);
      return jsonResponse({ id, status: 'active' });
    }
    const { results } = await env.DB.prepare(
      `SELECT id, COALESCE(trigger, 'chat') AS session_type, status,
              created_at AS started_at, conversation_id,
              COALESCE(conversation_id, id) AS name_key,
              0 AS message_count
       FROM agentsam_agent_run
       WHERE user_id = ? AND tenant_id = ?
       ORDER BY created_at DESC
       LIMIT 50`,
    )
      .bind(userId, tenantId)
      .all()
      .catch(() => ({ results: [] }));
    return jsonResponse(results || []);
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
        const uwsId  = `uws:${tid}:${userId}:${wsId}`;

        // Attempt retrieval from both tables
        const [globalWs, personalWs] = await Promise.all([
          env.DB.prepare(`SELECT * FROM workspaces WHERE id = ? OR handle = ? LIMIT 1`).bind(wsId, wsId).first().catch(() => null),
          env.DB.prepare(`SELECT state_json FROM agentsam_workspace_state WHERE id = ?`).bind(uwsId).first().catch(() => null)
        ]);
        
        const row = globalWs || (personalWs ? { id: wsId, state_json: personalWs.state_json, name: 'Personal' } : null);
        if (!row) {
          const canWs =
            wsId &&
            (await userCanAccessWorkspace(env, authUser, wsId).catch(() => false));
          if (canWs) {
            return jsonResponse({
              id: wsId,
              name: 'Workspace',
              environment: 'local',
              status: 'active',
              settings: {},
              state: {},
              state_json: '{}',
            });
          }
          return jsonResponse({ error: 'Workspace not found' }, 404);
        }
        
        const safeJson = (v) => { 
          if (!v) return {}; 
          if (typeof v === 'object' && v !== null) return v;
          try { return JSON.parse(v); } catch(e) { return {}; }
        };

        const stateObj = safeJson(row.state_json);
        const stateJsonStr =
          typeof row.state_json === 'string' && row.state_json.trim()
            ? row.state_json
            : JSON.stringify(stateObj || {});

        return jsonResponse({
          id: row.id,
          name: row.name || 'Workspace',
          environment: row.environment || 'local',
          status: row.status || 'active',
          settings: safeJson(row.settings_json),
          state:    stateObj,
          state_json: stateJsonStr,
        });
      } catch (e) { 
        return jsonResponse({ error: `Fetch error: ${e.message}` }, 500); 
      }
    }

    if (method === 'PUT') {
      try {
        const body    = await request.json().catch(() => ({}));
        const state   = body.state || body.state_json;
        const stateStr = typeof state === 'string' ? state : JSON.stringify(state || {});
        
        const userId = String(authUser?.id || 'anonymous').trim();
        let tid =
          authUser?.tenant_id != null && String(authUser.tenant_id).trim() !== ''
            ? String(authUser.tenant_id).trim()
            : '';
        if (!tid) tid = (await fetchAuthUserTenantId(env, authUser.id)) || '';
        if (!tid && authUser.email) tid = (await fetchAuthUserTenantId(env, authUser.email)) || '';
        if (!tid) return jsonResponse({ error: 'Tenant not configured for this account' }, 403);
        const uwsId  = `uws:${tid}:${userId}:${wsId}`;

        // Attempt update in both locations (idempotent for the relevant table)
        try {
          if (env.DB) {
            const results = await Promise.allSettled([
              env.DB.prepare(`UPDATE workspaces SET state_json = ?, updated_at = datetime('now') WHERE id = ?`)
                .bind(stateStr, wsId).run(),
              env.DB.prepare(`UPDATE agentsam_workspace_state SET state_json = ?, updated_at = unixepoch() WHERE id = ?`)
                .bind(stateStr, uwsId).run()
            ]);
            results.forEach((r, i) => {
              if (r.status === 'rejected') {
                console.warn('[agent] workspace update op', i, 'rejected:', r.reason);
              }
            });
            console.log('[agent] workspace update results:', results.map(r => r.status));
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
      const defaultWs =
        env?.DEFAULT_WORKSPACE_ID != null && String(env.DEFAULT_WORKSPACE_ID).trim() !== ''
          ? String(env.DEFAULT_WORKSPACE_ID).trim()
          : '';
      const isAgentsamWs = /^ws_/i.test(wsId) || (defaultWs !== '' && wsId === defaultWs);
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

    const wsRes = await resolveEffectiveWorkspaceId(env, request, authUser, {}).catch(() => null);
    const workspaceId =
      (authUser.active_workspace_id != null && String(authUser.active_workspace_id).trim() !== ''
        ? String(authUser.active_workspace_id).trim()
        : null) ||
      (wsRes && !wsRes.error && wsRes.workspaceId ? String(wsRes.workspaceId).trim() : null);
    if (!workspaceId) return jsonResponse({ error: 'no_workspace', redirect: '/onboarding' }, 403);

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
    const wsRes = await resolveEffectiveWorkspaceId(env, request, authUser, {}).catch(() => null);
    const workspaceId =
      (authUser.active_workspace_id != null && String(authUser.active_workspace_id).trim() !== ''
        ? String(authUser.active_workspace_id).trim()
        : null) ||
      (wsRes && !wsRes.error && wsRes.workspaceId ? String(wsRes.workspaceId).trim() : null);
    if (!workspaceId) return jsonResponse({ error: 'no_workspace', redirect: '/onboarding' }, 403);
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
        ...approvedToolSpine,
      });

      return jsonResponse({ success: false, tool_name: toolName, error: errMsg }, 200);
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
    const tenantId =
      identity?.tenantId ||
      (await fetchAuthUserTenantId(env, userId)) ||
      platformTenantIdFromEnv(env) ||
      null;
    if (env.DB && tenantId) {
      const cached = await readAgentBootstrapCache(env.DB, { tenantId, userId });
      if (cached) {
        return new Response(cached, {
          headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT', 'X-Context-Store': 'agentsam_project_context' },
        });
      }
    }
    const today     = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    let dailyLog = '', yesterdayLog = '', schemaMemory = '', todayTodo = '';
    if (env.R2) {
      const fetchR2 = async k => { const o = await env.R2.get(k); return o ? await o.text() : ''; };
      [dailyLog, yesterdayLog, schemaMemory, todayTodo] = await Promise.all([
        fetchR2(`memory/daily/${today}.md`),
        fetchR2(`memory/daily/${yesterday}.md`),
        fetchR2('memory/schema-and-records.md'),
        fetchR2('memory/today-todo.md'),
      ]);
    }
    if (!todayTodo && env.DB) {
      const row = await env.DB.prepare(`SELECT value FROM agentsam_memory WHERE key = 'today_todo' AND tenant_id = ?`).bind(identity?.tenantId || null).first().catch(() => null);
      if (row?.value) todayTodo = String(row.value);
    }
    const context = { daily_log: dailyLog || null, yesterday_log: yesterdayLog || null, schema_and_records_memory: schemaMemory || null, today_todo: todayTodo || null, date: today };
    if (env.DB && ctx?.waitUntil && tenantId) {
      ctx.waitUntil(
        writeAgentBootstrapCache(env.DB, {
          tenantId,
          workspaceId: identity?.workspaceId ?? null,
          userId,
          payload: context,
          createdBy: userId,
        }),
      );
    }
    return jsonResponse(context, 200, { 'X-Context-Store': 'agentsam_project_context' });
  } catch (e) {
    return jsonResponse({ error: String(e.message || e) }, 500);
  }
}

export { runAgentToolLoop, buildSystemPrompt };
