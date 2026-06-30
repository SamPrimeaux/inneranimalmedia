import { dispatchByToolCode } from './dispatch-by-tool-code.js';
import {
  tryReadAgentsamToolCache,
  writeAgentsamToolCacheAfterSuccess,
} from './mcp-tool-execution.js';
import {
  loadAgentSamUserPolicy,
  isToolAllowedByAllowlist,
  isToolAllowedByPolicyRisk,
  isSubagentToolName,
  collectAllowlistToolKeysForScope,
} from './agent-policy.js';
import { loadAgentsamToolRow } from './agentsam-tools-catalog.js';
import { normalizeToolName } from '../tools/ai-dispatch.js';
import { toolLogFieldsFromValidation } from './agent-prompt-builder.js';
import {
  needsApproval,
  createApprovalRequest,
  pollApprovalQueue,
  checkApprovalGate,
  auditToolDecision,
} from './agent-approval-gate.js';
import { CODEMODE_TOOL_NAME } from './codemode-constants.js';
import { insertAgentRunExecutionStep } from './agent-run-routing.js';

const TERM_WRITE_TOOLS = new Set(['terminal_run', 'terminal_execute', 'run_command', 'bash']);

const WRITE_LIKE_PREFIXES = ['d1_', 'worker_', 'resend_', 'meshyai_'];

/** Legacy workflow_key for historical rows — chat tools no longer INSERT agentsam_workflow_runs. */
export const CHAT_TOOL_SESSION_LEDGER_KIND = 'chat_tool_session';

export function chatToolSessionSseBase(ledger) {
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
export function createChatToolSessionLedger(p) {
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
export async function appendChatToolSessionLedgerStep(env, emit, ledger, stepEntry) {
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

export async function finalizeChatToolSessionLedger(_env, _ctx, emit, ledger, { ok, errorMessage } = {}) {
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
export function formatToolApprovalPreview(toolName, toolInput) {
  const inp = toolInput && typeof toolInput === 'object' ? toolInput : {};
  const cmd =
    inp.command ??
    inp.cmd ??
    inp.shell_command ??
    inp.shell ??
    inp.query ??
    inp.sql;
  if (cmd != null && String(cmd).trim()) return String(cmd).trim().slice(0, 8000);
  const path = inp.path ?? inp.cwd ?? inp.working_directory;
  if (path != null && String(path).trim()) {
    const base = String(path).trim();
    if (cmd != null && String(cmd).trim()) return `cd ${base} && ${String(cmd).trim()}`.slice(0, 8000);
    return base.slice(0, 8000);
  }
  try {
    return JSON.stringify(inp, null, 2).slice(0, 4000);
  } catch {
    return `${String(toolName || 'tool')}()`;
  }
}

export function toolInputHasApprovalId(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return false;
  const id = toolInput.approval_id ?? toolInput.approvalId ?? null;
  return id != null && String(id).trim() !== '';
}

export function inferRiskLevel(toolName, category = '', rowRiskLevel = '') {
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
export async function validateToolCall(env, profileOrMode, toolCallOrName, mcpRuntimeContext = {}, userPolicy = null) {
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
  if (compiledToolPolicy?.require_approval?.includes(name) && !toolInputHasApprovalId(toolInput)) {
    return {
      allowed: true,
      reason: 'requires approval',
      riskLevel: inferRiskLevel(name, '', 'medium'),
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
    const approvalId =
      toolInput?.approval_id ??
      toolInput?.approvalId ??
      toolInput?.approval_id ??
      null;
    if (
      toolBlockedByWritePolicy(writePolicy, name, {
        approvalId: approvalId != null ? String(approvalId).trim() : null,
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

  const requiresConfirmation =
    row != null && Number(row.requires_approval || 0) === 1 && !toolInputHasApprovalId(toolInput);
  const rk = row && typeof row === 'object' ? row : {};
  return {
    allowed: true,
    reason: requiresConfirmation ? 'requires approval' : 'allowed',
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

export async function dispatchToolCall(env, toolName, input, context = {}) {
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
export function resolveToolExecutionBudgetMs(toolName, input) {
  const n = String(toolName || '').toLowerCase();
  const inp = input && typeof input === 'object' ? input : {};
  const rawTimeout = inp.timeout_ms != null ? Number(inp.timeout_ms) : NaN;
  if (n === 'agentsam_terminal_sandbox' || n === 'agentsam_container_exec') {
    if (Number.isFinite(rawTimeout) && rawTimeout > 0) {
      return Math.min(600_000, Math.max(60_000, Math.floor(rawTimeout)));
    }
    return 130_000;
  }
  const terminalNames = new Set([
    'terminal_run',
    'terminal_execute',
    'terminal_wrangler',
    'run_command',
    'bash',
  ]);
  if (terminalNames.has(n)) {
    if (Number.isFinite(rawTimeout) && rawTimeout > 0) {
      return Math.min(600_000, Math.max(60_000, Math.floor(rawTimeout)));
    }
    return 130_000;
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

export async function dispatchToolCallWithBudget(env, toolName, input, context, budgetMs) {
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

