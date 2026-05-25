/**
 * agentsam_command_run + agentsam_execution_context — async telemetry (waitUntil).
 */
import { resolveCanonicalUserId } from './auth.js';
import { isFeatureEnabled } from '../core/features.js';
import { scheduleAgentsamErrorLog } from '../core/agentsam-error-log.js';
import { pragmaTableInfo } from '../core/retention.js';
import { resolveModelKeyFromProviderId } from '../core/model-catalog-cost.js';
import { estimateModelRunCostUsd } from '../core/model-pricing.js';

import { thompsonSample, recordCallOutcome } from '../core/thompson.js';
import { recordSpan } from '../core/tracer.js';
import {
  newChatAgentRunId,
  scheduleAgentsamChatAgentRunInsert,
  scheduleAgentsamChatAgentRunStart,
} from '../core/agent-run-routing.js';
import { scheduleRecordMcpToolExecution } from '../core/mcp-tool-execution.js';
import { scheduleToolCallLog } from '../core/agentsam-ops-ledger.js';
import { pickRunSpineIds } from '../core/run-spine-ids.js';
import { supabasePostJson } from './health/supabaseRest.js';

/** Must match CHECK on agentsam_command_run.intent_category (or NULL). */
const VALID_INTENT_CATEGORIES = [
  'deploy',
  'debug',
  'db',
  'r2',
  'git',
  'worker',
  'search',
  'file',
  'misc',
];

function sanitizeIntentCategoryForCommandRun(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  return VALID_INTENT_CATEGORIES.includes(s) ? s : 'misc';
}

function unresolvedCommandResult() {
  return {
    resolved: false,
    command: null,
    mappedCommand: null,
    blocked: false,
    blockReason: null,
    requiresConfirmation: false,
    riskLevel: 'low',
  };
}

/**
 * Resolve slash / pattern input to agentsam_commands + allowlist (D1).
 * @param {any} env
 * @param {{ message?: string, userId?: string | null, workspaceId?: string | null, tenantId?: string | null, mode?: string }} opts
 */
export async function resolveAgentCommand(env, opts) {
  const msg = String(opts?.message || '').trim();
  if (!msg) return unresolvedCommandResult();

  // Slash commands only — free-text chat (browser element picks, questions) must not hit allowlist/patterns.
  if (!msg.startsWith('/')) return unresolvedCommandResult();

  const ws =
    opts?.workspaceId != null && String(opts.workspaceId).trim() !== ''
      ? String(opts.workspaceId).trim()
      : null;
  if (!ws) return unresolvedCommandResult();

  if (!env?.DB) return unresolvedCommandResult();

  const patterns = await env.DB.prepare(
    `
    SELECT pattern, pattern_type, mapped_command,
           risk_level, requires_confirmation
    FROM agentsam_command_pattern
    WHERE workspace_id = ? AND is_active = 1
    ORDER BY use_count DESC, created_at ASC
  `,
  )
    .bind(ws)
    .all()
    .catch(() => ({ results: [] }));

  let mappedCommand = null;
  let patternRow = null;
  for (const p of patterns.results || []) {
    const pt = String(p.pattern_type || 'exact');
    const pat = String(p.pattern || '');
    let hit = false;
    if (pt === 'exact') hit = msg === pat;
    else if (pt === 'prefix') hit = msg.startsWith(pat);
    else if (pt === 'regex') {
      try {
        hit = new RegExp(pat).test(msg);
      } catch {
        hit = false;
      }
    } else if (pt === 'glob') {
      try {
        const rx = new RegExp(
          `^${pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`,
        );
        hit = rx.test(msg);
      } catch {
        hit = false;
      }
    }
    if (hit) {
      mappedCommand = p.mapped_command != null ? String(p.mapped_command) : null;
      patternRow = p;
      break;
    }
  }

  let commandRow = null;
  if (!mappedCommand && msg.startsWith('/')) {
    commandRow = await env.DB.prepare(
      `
      SELECT id, slug, display_name, mapped_command,
             risk_level, requires_confirmation, category,
             modes_json, show_in_slash
      FROM agentsam_commands
      WHERE slug = ? AND is_active = 1
      LIMIT 1
    `,
    )
      .bind(msg)
      .first()
      .catch(() => null);
    if (commandRow) mappedCommand = String(commandRow.mapped_command || '');
  }

  if (!mappedCommand) return unresolvedCommandResult();

  const riskLevel = String((patternRow || commandRow)?.risk_level || 'low');
  const requiresConfirmation = !!(
    Number((patternRow || commandRow)?.requires_confirmation || 0) ||
    riskLevel === 'high' ||
    riskLevel === 'critical'
  );

  const uid = opts?.userId != null ? String(opts.userId) : '';
  const allowed = await env.DB.prepare(
    `
    SELECT 1 FROM agentsam_command_allowlist
    WHERE user_id = ? AND workspace_id = ? AND command = ?
    LIMIT 1
  `,
  )
    .bind(uid, ws, mappedCommand)
    .first()
    .catch(() => null);

  if (!allowed) {
    return {
      resolved: true,
      command: commandRow,
      mappedCommand,
      blocked: true,
      blockReason: 'Command not in your allowlist for this workspace',
      requiresConfirmation: false,
      riskLevel,
    };
  }

  return {
    resolved: true,
    command: commandRow,
    mappedCommand,
    blocked: false,
    blockReason: null,
    requiresConfirmation,
    riskLevel,
  };
}

/** Sequential dependency edge for tool_chain steps (D1). */
export async function insertExecutionDependencyGraphEdge(env, tenantId, chainId, dependsOnChainId, workspaceId = null) {
  if (!env?.DB || !tenantId || !chainId || !dependsOnChainId) return;
  const ws = workspaceId != null && String(workspaceId).trim() !== '' ? String(workspaceId).trim() : null;
  const sql = ws
    ? `
    INSERT OR IGNORE INTO agentsam_execution_dependency_graph
      (tenant_id, workspace_id, chain_id, depends_on_chain_id, dependency_type)
    VALUES (?, ?, ?, ?, 'sequential')
  `
    : `
    INSERT OR IGNORE INTO agentsam_execution_dependency_graph
      (tenant_id, chain_id, depends_on_chain_id, dependency_type)
    VALUES (?, ?, ?, 'sequential')
  `;
  const stmt = env.DB.prepare(sql);
  await (ws ? stmt.bind(tenantId, ws, chainId, dependsOnChainId) : stmt.bind(tenantId, chainId, dependsOnChainId))
    .run()
    .catch((e) => console.warn('[tool_chain] dep_graph insert', e?.message));
}

/** Fire-and-forget agentsam_tool_chain row (D1 telemetry). Ported from worker.js. */
export async function fireForgetAgentToolChainRow(env, opts) {
  const {
    toolName,
    agentSessionId,
    error,
    costUsd,
    mcpToolCallId,
    durationMs,
    inputTokens = 0,
    outputTokens = 0,
    terminalSessionId,
    tenantId = null,
    userId = null,
    parentChainId = null,
    ctx = null,
    toolInputJson = null,
    workflowRunId = null,
    executionStepId = null,
    commandRunId = null,
    command_run_id = null,
    agentRunId = null,
    agent_run_id = null,
    conversationId = null,
    conversation_id = null,
  } = opts || {};
  if (!env?.DB) return null;
  const ws =
    opts?.workspaceId != null && String(opts.workspaceId).trim() !== ''
      ? String(opts.workspaceId).trim()
      : '';
  if (!ws) return null;
  const tcCols = await pragmaTableInfo(env.DB, 'agentsam_tool_chain');
  const wrId =
    workflowRunId != null && String(workflowRunId).trim() !== '' ? String(workflowRunId).trim() : null;
  const esId =
    executionStepId != null && String(executionStepId).trim() !== ''
      ? String(executionStepId).trim()
      : null;
  let scopeMid = '';
  const scopeMidBinds = [];
  if (tcCols.has('workflow_run_id')) {
    scopeMid += ', workflow_run_id';
    scopeMidBinds.push(wrId);
  }
  if (tcCols.has('execution_step_id')) {
    scopeMid += ', execution_step_id';
    scopeMidBinds.push(esId);
  }
  const arId =
    (agentRunId ?? agent_run_id) != null && String(agentRunId ?? agent_run_id).trim() !== ''
      ? String(agentRunId ?? agent_run_id).trim()
      : null;
  const convId =
    (conversationId ?? conversation_id) != null && String(conversationId ?? conversation_id).trim() !== ''
      ? String(conversationId ?? conversation_id).trim()
      : null;
  if (tcCols.has('agent_run_id')) {
    scopeMid += ', agent_run_id';
    scopeMidBinds.push(arId);
  }
  if (tcCols.has('conversation_id')) {
    scopeMid += ', conversation_id';
    scopeMidBinds.push(convId);
  }
  const cmdRunId =
    (commandRunId ?? command_run_id) != null && String(commandRunId ?? command_run_id).trim() !== ''
      ? String(commandRunId ?? command_run_id).trim()
      : null;
  if (tcCols.has('command_run_id')) {
    scopeMid += ', command_run_id';
    scopeMidBinds.push(cmdRunId);
  }
  const completedAt = Math.floor(Date.now() / 1000);
  const durSec = Math.max(0, Math.ceil((Number(durationMs) || 0) / 1000));
  const startedAt = Math.max(0, completedAt - durSec);
  const toolStatus = error ? 'failed' : 'completed';
  const chainId = `atc_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const tenant =
    tenantId != null && String(tenantId).trim() !== '' ? String(tenantId).trim() : null;
  let uid =
    userId != null && String(userId).trim() !== '' ? String(userId).trim() : null;
  if (uid) {
    uid = await resolveCanonicalUserId(uid, env);
  }
  const parentId =
    parentChainId != null && String(parentChainId).trim() !== '' ? String(parentChainId).trim() : null;
  const errorMessage =
    error != null
      ? String(error?.message ?? error).slice(0, 8000)
      : null;
  const errorType =
    error != null && typeof error === 'object' && error?.name
      ? String(error.name).slice(0, 120)
      : error != null
        ? 'Error'
        : null;

  let afterCompletedCols = '';
  const afterCompletedVals = [];
  const durMs = Math.max(0, Math.floor(Number(durationMs) || 0));
  if (tcCols.has('duration_ms')) {
    afterCompletedCols += ', duration_ms';
    afterCompletedVals.push(durMs);
  }
  if (tcCols.has('input_tokens')) {
    afterCompletedCols += ', input_tokens';
    afterCompletedVals.push(Math.max(0, Math.floor(Number(inputTokens) || 0)));
  }
  if (tcCols.has('output_tokens')) {
    afterCompletedCols += ', output_tokens';
    afterCompletedVals.push(Math.max(0, Math.floor(Number(outputTokens) || 0)));
  }

  const tryInsert = (sql, binds) => env.DB.prepare(sql).bind(...binds).run();

  const tailBinds = [
    agentSessionId != null && String(agentSessionId).trim() !== '' ? String(agentSessionId) : null,
    toolName,
    toolStatus,
    startedAt,
    completedAt,
    ...afterCompletedVals,
    costUsd != null && Number.isFinite(Number(costUsd)) ? Number(costUsd) : 0,
    mcpToolCallId || null,
    terminalSessionId != null && String(terminalSessionId).trim() !== '' ? String(terminalSessionId) : null,
    parentId,
    errorMessage,
    errorType,
  ];
  const primaryBinds = [chainId, ws, tenant, uid, ...scopeMidBinds, ...tailBinds];
  const primaryPlaceholders = primaryBinds.map(() => '?').join(', ');
  const fallbackBinds = [chainId, ws, ...scopeMidBinds, ...tailBinds];
  const fallbackPlaceholders = fallbackBinds.map(() => '?').join(', ');

  const colAfterTime = `started_at, completed_at${afterCompletedCols}, cost_usd`;

  const p = tryInsert(
    `INSERT INTO agentsam_tool_chain (id, workspace_id, tenant_id, user_id${scopeMid}, agent_session_id, tool_name, tool_status, ${colAfterTime}, mcp_tool_call_id, terminal_session_id, parent_chain_id, error_message, error_type)
     VALUES (${primaryPlaceholders})`,
    primaryBinds,
  )
    .catch(() =>
      tryInsert(
        `INSERT INTO agentsam_tool_chain (id, workspace_id${scopeMid}, agent_session_id, tool_name, tool_status, ${colAfterTime}, mcp_tool_call_id, terminal_session_id, parent_chain_id, error_message, error_type)
     VALUES (${fallbackPlaceholders})`,
        fallbackBinds,
      ),
    )
    .then(() => {
      if (tenant && parentId) {
        return insertExecutionDependencyGraphEdge(env, tenant, chainId, parentId, ws);
      }
    })
    .then(() => {
      if (!error || !ctx || typeof ctx.waitUntil !== 'function' || !tenant || !ws) return;
      scheduleAgentsamErrorLog(env, ctx, {
        workspaceId: ws,
        tenantId: tenant,
        sessionId: agentSessionId != null ? String(agentSessionId) : null,
        errorCode: 'tool_chain_failed',
        errorType: 'tool_execution',
        errorMessage: errorMessage || 'tool_execution_failed',
        source: 'tool_chain',
        sourceId: chainId,
        contextJson: JSON.stringify({
          tool_name: toolName,
          input_json:
            toolInputJson != null
              ? String(toolInputJson).slice(0, 8000)
              : null,
        }),
      });
    })
    .catch((e) => console.warn('[agentsam_tool_chain]', e?.message ?? e));

  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(p);
  else void p;

  return chainId;
}

/**
 * Upsert agentsam_execution_performance_metrics after a command run completes (insert path).
 * Skips when commandId is absent.
 */
export async function upsertExecutionPerformanceMetricsAfterCommandRun(env, p) {
  const commandId = p.commandId != null ? String(p.commandId).trim() : '';
  if (!env?.DB || !commandId) return;

  const tenantId = p.tenantId != null && String(p.tenantId).trim() !== '' ? String(p.tenantId).trim() : null;
  if (!tenantId) return;
  const workspaceId =
    p.workspaceId != null && String(p.workspaceId).trim() !== '' ? String(p.workspaceId).trim() : null;
  if (!workspaceId) return;
  const commandSlug =
    p.commandSlug != null && String(p.commandSlug).trim() !== '' ? String(p.commandSlug).trim() : null;
  const status = p.success ? 'completed' : 'failed';
  const metricDate = new Date().toISOString().slice(0, 10);
  const isSuccess = status === 'completed' ? 1 : 0;
  const isFail = status === 'failed' ? 1 : 0;
  const costUsd = Number(p.costUsd) || 0;
  const costCents = costUsd * 100;
  const durationMs = Math.max(0, Math.floor(Number(p.durationMs) || 0));
  const tokensConsumed = Math.max(0, Math.floor(Number(p.tokensConsumed) || 0));

  await env.DB
    .prepare(
      `
    INSERT INTO agentsam_execution_performance_metrics
      (id, tenant_id, workspace_id, metric_date, metric_grain, source_table,
       command_id, command_slug,
       execution_count, success_count, failure_count,
       avg_duration_ms, min_duration_ms, max_duration_ms,
       success_rate_percent, total_tokens_consumed,
       total_cost_usd, total_cost_cents, last_computed_at)
    VALUES (
      'epm_' || lower(hex(randomblob(8))),
      ?, ?, ?,
      'daily', 'agentsam_command_run',
      ?, ?,
      1, ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, ?, unixepoch()
    )
    ON CONFLICT(
      tenant_id,
      workspace_id,
      metric_date,
      metric_grain,
      source_table,
      command_id,
      command_slug,
      tool_name,
      tool_category,
      workflow_id,
      task_type,
      intent_category,
      model_key,
      provider,
      trigger_key
    ) DO UPDATE SET
      execution_count = execution_count + 1,
      success_count = success_count + ?,
      failure_count = failure_count + ?,
      avg_duration_ms = ((avg_duration_ms * (execution_count - 1)) + ?) / execution_count,
      min_duration_ms = CASE WHEN ? < min_duration_ms OR min_duration_ms = 0
                        THEN ? ELSE min_duration_ms END,
      max_duration_ms = CASE WHEN ? > max_duration_ms
                        THEN ? ELSE max_duration_ms END,
      success_rate_percent = 100.0 * (success_count + ?) / (execution_count + 1),
      total_tokens_consumed = total_tokens_consumed + ?,
      total_cost_usd = total_cost_usd + ?,
      total_cost_cents = total_cost_cents + ?,
      last_computed_at = unixepoch()
  `,
    )
    .bind(
      tenantId,
      workspaceId,
      metricDate,
      commandId,
      commandSlug,
      isSuccess,
      isFail,
      durationMs,
      durationMs,
      durationMs,
      (isSuccess / 1) * 100,
      tokensConsumed,
      costUsd,
      costCents,
      isSuccess,
      isFail,
      durationMs,
      durationMs,
      durationMs,
      durationMs,
      durationMs,
      isSuccess,
      tokensConsumed,
      costUsd,
      costCents,
    )
    .run()
    .catch((e) => console.warn('[cmd_run] perf_metrics upsert', e?.message));
}

/**
 * @param {any} env
 * @param {any} ctx
 * @param {{
 *   workspaceId: string,
 *   sessionId: string | null,
 *   conversationId: string | null,
 *   userInput: string,
 *   normalizedIntent: string | null,
 *   intentCategory: string | null,
 *   modelKey: string | null,
 *   commandsExecuted: unknown[],
 *   result: unknown,
 *   outputText: string | null,
 *   confidenceScore: number | null,
 *   success: boolean,
 *   exitCode: number | null,
 *   durationMs: number,
 *   inputTokens: number,
 *   outputTokens: number,
 *   costUsd: number,
 *   errorMessage: string | null,
 *   selectedCommandId: string | null,
 *   selectedCommandSlug: string | null,
 *   riskLevel: string,
 *   requiresConfirmation: boolean,
 *   approvalStatus: string,
 *   cwd: string | null,
 *   filesOpen: unknown[],
 *   recentError: string | null,
 *   goal: string | null,
 *   contextTokenEstimate: number,
 *   userId?: string | null,
 *   taskId?: string | null,
 *   command?: string | null,
 *   provider?: string | null,
 * }} p
 */
export function scheduleAgentsamCommandRunInsert(env, ctx, p) {
  if (!env?.DB || !ctx?.waitUntil) return;
  const ws = p.workspaceId != null ? String(p.workspaceId).trim() : '';
  if (!ws) return;
  if (p.tenantId == null || String(p.tenantId).trim() === '') return;

  ctx.waitUntil(
    (async () => {
      const commandRunId = `run_${crypto.randomUUID().slice(0, 16)}`;
      const rawModelKey = p.modelKey != null ? String(p.modelKey).trim() : '';
      const provForResolve =
        p.provider != null && String(p.provider).trim() !== '' ? String(p.provider).trim() : '';

      let resultMerged =
        p.result !== undefined && p.result !== null && typeof p.result === 'object' && !Array.isArray(p.result)
          ? { ...p.result }
          : p.result !== undefined
            ? { _command_result: p.result }
            : {};

      let modelIdForRow = rawModelKey || null;
      if (rawModelKey) {
        const { modelKey: canonMk, rawModelId } = await resolveModelKeyFromProviderId(
          env.DB,
          provForResolve,
          rawModelKey,
        );
        const telemBase =
          typeof resultMerged.telemetry_model === 'object' && resultMerged.telemetry_model
            ? resultMerged.telemetry_model
            : {};
        if (canonMk && canonMk !== rawModelKey) {
          resultMerged.telemetry_model = {
            ...telemBase,
            provider_model_id: rawModelId,
            catalog_model_key: canonMk,
          };
          modelIdForRow = canonMk;
        } else if (canonMk) {
          modelIdForRow = canonMk;
        } else {
          resultMerged.telemetry_model = {
            ...telemBase,
            provider_model_id: rawModelId,
            catalog_model_key: null,
          };
        }
      }

      const canonicalUserId = await resolveCanonicalUserId(p.userId ?? null, env);
      const inTok = Math.max(0, Math.floor(Number(p.inputTokens) || 0));
      const outTok = Math.max(0, Math.floor(Number(p.outputTokens) || 0));
      let costUsdIns = Number(p.costUsd);
      if (!Number.isFinite(costUsdIns) || costUsdIns <= 0) {
        if (modelIdForRow && (inTok > 0 || outTok > 0)) {
          const priced = await estimateModelRunCostUsd(env.DB, {
            modelKey: modelIdForRow,
            inputTokens: inTok,
            outputTokens: outTok,
          });
          costUsdIns = priced.costUsd;
        } else {
          costUsdIns = 0;
        }
      }
      const commandsExecutedForRun = Array.isArray(p.commandsExecuted) ? p.commandsExecuted : [];
      const intentCategoryForRun = sanitizeIntentCategoryForCommandRun(p.intentCategory);
      const hasSelectedCommandForRun = Boolean(p.selectedCommandId || p.selectedCommandSlug);
      const hasExecutableIntentForRun = ['deploy', 'debug', 'db', 'r2', 'git', 'worker', 'search', 'file'].includes(
        String(intentCategoryForRun || '').toLowerCase(),
      );
      const approvalStatusForRun = String(p.approvalStatus || 'not_required').toLowerCase();
      const hasApprovalNeedForRun = approvalStatusForRun !== 'not_required';
      const riskLevelForRun = String(p.riskLevel || 'low').toLowerCase();
      const hasRiskForRun = ['medium', 'high', 'critical'].includes(riskLevelForRun);
      const shouldCreateCommandRun =
        commandsExecutedForRun.length > 0 ||
        hasSelectedCommandForRun ||
        hasExecutableIntentForRun ||
        hasApprovalNeedForRun ||
        hasRiskForRun ||
        Boolean(p.requiresConfirmation);

      if (!shouldCreateCommandRun) {
        return;
      }

      try {
        const ins = await env.DB.prepare(
          `INSERT INTO agentsam_command_run
            (id, tenant_id, workspace_id, user_id, session_id, conversation_id,
             user_input, normalized_intent, intent_category,
             model_id, commands_json, result_json, output_text,
             confidence_score, success, exit_code, duration_ms,
             input_tokens, output_tokens, cost_usd, error_message,
             selected_command_id, selected_command_slug,
             risk_level, requires_confirmation, approval_status)
           VALUES
            (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
          .bind(
            commandRunId,
            String(p.tenantId),
            ws,
            canonicalUserId,
            p.sessionId ?? null,
            p.conversationId ?? null,
            p.userInput ?? '',
            p.normalizedIntent ?? null,
            intentCategoryForRun,
            modelIdForRow,
            JSON.stringify(commandsExecutedForRun),
            JSON.stringify(resultMerged),
            p.outputText != null ? String(p.outputText).slice(0, 50000) : null,
            p.confidenceScore ?? null,
            p.success ? 1 : 0,
            p.exitCode ?? null,
            Math.max(0, Math.floor(p.durationMs || 0)),
            inTok,
            outTok,
            costUsdIns,
            p.errorMessage != null ? String(p.errorMessage).slice(0, 8000) : null,
            p.selectedCommandId ?? null,
            p.selectedCommandSlug ?? null,
            p.riskLevel || 'low',
            p.requiresConfirmation ? 1 : 0,
            p.approvalStatus || 'not_required',
          )
          .run();
        if (!ins?.success) return;

        await upsertExecutionPerformanceMetricsAfterCommandRun(env, {
          tenantId: p.tenantId,
          workspaceId: ws,
          commandId: p.selectedCommandId,
          commandSlug: p.selectedCommandSlug ?? null,
          success: p.success,
          durationMs: Math.max(0, Math.floor(p.durationMs || 0)),
          costUsd: costUsdIns,
          tokensConsumed: inTok + outTok,
        });

        if (!p.success && p.errorMessage != null && String(p.errorMessage).trim() !== '') {
          scheduleAgentsamErrorLog(env, ctx, {
            workspaceId: ws,
            tenantId: String(p.tenantId),
            sessionId: p.sessionId ?? null,
            errorCode: 'command_run_failed',
            errorType: 'agent_run',
            errorMessage: String(p.errorMessage).slice(0, 8000),
            source: 'agent_run',
            sourceId: commandRunId,
            contextJson: JSON.stringify({
              normalized_intent: p.normalizedIntent,
              intent_category: p.intentCategory,
            }),
          });
        }

        const execId = `exec_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
        const taskId =
          p.taskId != null && String(p.taskId).trim() !== '' ? String(p.taskId).trim() : commandRunId;
        const cmd =
          p.command != null && String(p.command).trim() !== ''
            ? String(p.command).trim().slice(0, 4000)
            : (p.selectedCommandSlug != null ? String(p.selectedCommandSlug).slice(0, 4000) : null);
        const prov =
          p.provider != null && String(p.provider).trim() !== '' ? String(p.provider).trim() : null;
        const exeCols = await pragmaTableInfo(env.DB, 'agentsam_executions');
        const durMs = Math.max(0, Math.floor(p.durationMs || 0));
        const stat = p.success ? 'completed' : 'failed';
        const mk = modelIdForRow;
        try {
          if (exeCols.has('model_key') && exeCols.has('status')) {
            await env.DB
              .prepare(
                `INSERT OR IGNORE INTO agentsam_executions
                 (id, tenant_id, workspace_id, user_id, command_run_id, task_id, execution_type, command,
                  model_key, provider, status, input_tokens, output_tokens, cost_usd, duration_ms, created_at)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,unixepoch())`,
              )
              .bind(
                execId,
                String(p.tenantId),
                ws,
                canonicalUserId,
                commandRunId,
                taskId,
                'command',
                cmd,
                mk,
                prov,
                stat,
                inTok,
                outTok,
                costUsdIns,
                durMs,
              )
              .run();
          } else {
            await env.DB
              .prepare(
                `INSERT OR IGNORE INTO agentsam_executions
                 (id, tenant_id, workspace_id, user_id, command_run_id, task_id, execution_type, command, duration_ms, created_at)
                 VALUES (?,?,?,?,?,?,?,?,?,unixepoch())`,
              )
              .bind(
                execId,
                String(p.tenantId),
                ws,
                canonicalUserId,
                commandRunId,
                taskId,
                'command',
                cmd,
                durMs,
              )
              .run();
          }
        } catch (e) {
          console.warn('[agentsam_executions]', e?.message ?? e);
        }

        void env.DB
          .prepare(
            `INSERT INTO agentsam_execution_context
              (command_run_id, cwd, files_json, recent_error, goal, context_tokens)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            commandRunId,
            p.cwd ?? null,
            JSON.stringify(p.filesOpen ?? []),
            p.recentError ?? null,
            p.goal ?? null,
            p.contextTokenEstimate ?? 0,
          )
          .run()
          .catch((e) => console.warn('[agentsam_execution_context]', e?.message ?? e));
      } catch (e) {
        console.warn('[command_run] insert failed', e?.message ?? e);
      }
    })(),
  );
}

/**
 * Link sequential plan/todo steps in agentsam_execution_dependency_graph (after prior tool_chain in same plan).
 * @param {any} env
 * @param {string} chainId
 * @param {string} planId
 * @param {string} [todoId]
 * @param {string} [tenantId]
 */
export async function registerExecutionDependency(env, chainId, planId, todoId, tenantId) {
  void todoId;
  if (!env?.DB || !chainId || !planId) return;
  let tid = tenantId != null && String(tenantId).trim() !== '' ? String(tenantId).trim() : null;
  if (!tid) {
    const p = await env.DB
      .prepare(`SELECT tenant_id FROM agentsam_plans WHERE id = ? LIMIT 1`)
      .bind(planId)
      .first()
      .catch(() => null);
    tid = p?.tenant_id != null ? String(p.tenant_id).trim() : null;
  }
  if (!tid) return;
  const prev = await env.DB
    .prepare(
      `SELECT id FROM agentsam_tool_chain
       WHERE plan_id = ? AND id != ?
       ORDER BY started_at DESC
       LIMIT 1`,
    )
    .bind(planId, chainId)
    .first()
    .catch(() => null);
  if (prev?.id) {
    const wsRow = await env.DB
      .prepare(`SELECT workspace_id FROM agentsam_tool_chain WHERE id = ? LIMIT 1`)
      .bind(chainId)
      .first()
      .catch(() => null);
    const wsId = wsRow?.workspace_id != null ? String(wsRow.workspace_id).trim() : null;
    await insertExecutionDependencyGraphEdge(env, tid, chainId, String(prev.id), wsId || undefined);
  }
}

function mintCommandRunId() {
  return `run_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

/**
 * @param {Record<string, unknown>} o
 */
function resolveCommandPipelineSpine(o) {
  const spine = pickRunSpineIds(o);
  const agentRunId =
    spine.agent_run_id ||
    (o.agentRunId != null && String(o.agentRunId).trim() !== '' ? String(o.agentRunId).trim() : null) ||
    newChatAgentRunId();
  const conversationId =
    spine.conversation_id ||
    (o.sessionId != null && String(o.sessionId).trim() !== '' ? String(o.sessionId).trim() : null);
  const commandRunId =
    o.commandRunId != null && String(o.commandRunId).trim() !== ''
      ? String(o.commandRunId).trim()
      : o.command_run_id != null && String(o.command_run_id).trim() !== ''
        ? String(o.command_run_id).trim()
        : mintCommandRunId();
  return { agentRunId, commandRunId, conversationId };
}

/**
 * Start agentsam_agent_run for slash / command pipeline paths.
 */
function scheduleCommandPipelineAgentRunStart(env, ctx, p) {
  if (!ctx?.waitUntil) return;
  scheduleAgentsamChatAgentRunStart(env, ctx, {
    runId: p.agentRunId,
    userId: p.userId,
    tenantId: p.tenantId,
    workspaceId: p.workspaceId,
    conversationId: p.conversationId,
    routingArmId: p.routingArmId ?? null,
    modelKey: p.modelKey ?? null,
    taskType: p.taskType ?? 'tool_use',
    commandId: p.commandId ?? null,
    trigger: 'slash_command',
    sourceTool: 'execute_command',
  });
}

/**
 * PRAGMA-safe INSERT into agentsam_command_run (optional agent_run_id column).
 */
async function insertAgentsamCommandRunRow(env, fields) {
  if (!env?.DB) return false;
  const cols = await pragmaTableInfo(env.DB, 'agentsam_command_run');
  if (!cols.size) return false;

  const valuesByCol = {
    id: fields.id,
    tenant_id: fields.tenant_id,
    workspace_id: fields.workspace_id,
    user_id: fields.user_id,
    session_id: fields.session_id ?? null,
    conversation_id: fields.conversation_id ?? null,
    user_input: fields.user_input ?? '',
    normalized_intent: fields.normalized_intent ?? null,
    intent_category: fields.intent_category ?? null,
    model_id: fields.model_id ?? null,
    commands_json: fields.commands_json ?? '[]',
    result_json: fields.result_json ?? '{}',
    output_text: fields.output_text ?? null,
    confidence_score: fields.confidence_score ?? null,
    success: fields.success != null ? Number(fields.success) : 0,
    exit_code: fields.exit_code ?? null,
    duration_ms: fields.duration_ms ?? null,
    input_tokens: fields.input_tokens ?? 0,
    output_tokens: fields.output_tokens ?? 0,
    cost_usd: fields.cost_usd ?? 0,
    error_message: fields.error_message ?? null,
    selected_command_id: fields.selected_command_id ?? null,
    selected_command_slug: fields.selected_command_slug ?? null,
    risk_level: fields.risk_level ?? 'low',
    requires_confirmation: fields.requires_confirmation ?? 0,
    approval_status: fields.approval_status ?? 'not_required',
    agent_run_id: fields.agent_run_id ?? null,
  };

  const parts = [];
  const binds = [];
  for (const colName of cols) {
    if (!Object.prototype.hasOwnProperty.call(valuesByCol, colName)) continue;
    const v = valuesByCol[colName];
    if (v === undefined) continue;
    parts.push(colName);
    binds.push(v);
  }
  if (parts.length < 2) return false;

  try {
    await env.DB.prepare(
      `INSERT INTO agentsam_command_run (${parts.join(', ')}) VALUES (${parts.map(() => '?').join(', ')})`,
    )
      .bind(...binds)
      .run();
    return true;
  } catch (e) {
    console.warn('[insertAgentsamCommandRunRow]', e?.message ?? e);
    return false;
  }
}

/**
 * Insert a running agentsam_tool_chain row for executeCommand (replaces hardcoded INSERTs).
 * @returns {Promise<string|null>}
 */
export async function insertCommandToolChainRunning(env, opts) {
  if (!env?.DB) return null;
  const ws =
    opts?.workspaceId != null && String(opts.workspaceId).trim() !== ''
      ? String(opts.workspaceId).trim()
      : '';
  if (!ws) return null;

  const tcCols = await pragmaTableInfo(env.DB, 'agentsam_tool_chain');
  const chainId =
    opts.chainId != null && String(opts.chainId).trim() !== ''
      ? String(opts.chainId).trim()
      : `atc_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

  let uid =
    opts.userId != null && String(opts.userId).trim() !== '' ? String(opts.userId).trim() : null;
  if (uid) uid = await resolveCanonicalUserId(uid, env);

  const spine = pickRunSpineIds(opts);
  const valuesByCol = {
    id: chainId,
    plan_id: opts.planId ?? opts.plan_id ?? null,
    todo_id: opts.todoId ?? opts.todo_id ?? null,
    workspace_id: ws,
    tenant_id: opts.tenantId ?? opts.tenant_id ?? null,
    user_id: uid,
    agent_session_id: opts.sessionId ?? opts.agent_session_id ?? null,
    tool_name: String(opts.toolName ?? opts.tool_name ?? 'unknown'),
    tool_id: opts.toolId ?? opts.tool_id ?? null,
    tool_status: 'running',
    input_json:
      opts.inputJson != null
        ? typeof opts.inputJson === 'string'
          ? opts.inputJson
          : JSON.stringify(opts.inputJson)
        : '{}',
    started_at: Math.floor(Date.now() / 1000),
    requires_approval: opts.requiresApproval ? 1 : 0,
    depth: opts.depth != null ? Math.floor(Number(opts.depth)) : 0,
    command_run_id: opts.commandRunId ?? opts.command_run_id ?? null,
    agent_run_id: spine.agent_run_id,
    conversation_id: spine.conversation_id,
    workflow_run_id: opts.workflowRunId ?? opts.workflow_run_id ?? null,
    execution_step_id: opts.executionStepId ?? opts.execution_step_id ?? null,
  };

  const parts = [];
  const binds = [];
  for (const colName of tcCols) {
    if (!Object.prototype.hasOwnProperty.call(valuesByCol, colName)) continue;
    let v = valuesByCol[colName];
    if (v === undefined) continue;
    if (colName === 'tool_name' && (v === null || v === '')) v = 'unknown';
    if (colName === 'input_json' && (v === null || v === '')) v = '{}';
    parts.push(colName);
    binds.push(v);
  }
  if (parts.length < 2) return null;

  try {
    await env.DB.prepare(
      `INSERT INTO agentsam_tool_chain (${parts.join(', ')}) VALUES (${parts.map(() => '?').join(', ')})`,
    )
      .bind(...binds)
      .run();
    return chainId;
  } catch (e) {
    console.warn('[insertCommandToolChainRunning]', e?.message ?? e);
    return null;
  }
}

/**
 * Full command execution pipeline: approval queue, Thompson model, tool_chain, Supabase event.
 * @param {any} env
 * @param {any} ctx
 * @param {Record<string, unknown>} o
 */
export async function executeCommand(env, ctx, o) {
  const {
    commandId,
    userId,
    sessionId,
    tenantId,
    workspaceId,
    args = {},
    planId = null,
    todoId = null,
    taskType = null,
    skipApprovalGate = false,
  } = o || {};
  if (!env?.DB || !commandId) return { ok: false, error: 'missing_params' };

  const wid = workspaceId != null && String(workspaceId).trim() !== '' ? String(workspaceId).trim() : null;
  let sessionWorkspace = null;
  if (!wid && sessionId) {
    const srow = await env.DB
      .prepare(
        `SELECT workspace_id FROM agentsam_agent_run
         WHERE id = ? OR conversation_id = ?
         LIMIT 1`,
      )
      .bind(sessionId, sessionId)
      .first()
      .catch(() => null);
    sessionWorkspace = srow?.workspace_id != null ? String(srow.workspace_id).trim() : null;
  }
  const resolvedWorkspace = wid || sessionWorkspace;
  if (!resolvedWorkspace) {
    return { ok: false, error: 'workspace_required' };
  }

  const cmd = await env.DB
    .prepare(`SELECT * FROM agentsam_commands WHERE id = ? AND COALESCE(is_active, 1) = 1 LIMIT 1`)
    .bind(commandId)
    .first();
  if (!cmd) return { ok: false, error: 'command_not_found' };

  const approvalEnabled =
    !skipApprovalGate && (await isFeatureEnabled(env, 'approval_queue', { userId, tenantId }));
  const reqApr = Number(cmd.requires_approval) === 1;
  const critical = String(cmd.risk_level || '').toLowerCase() === 'critical';
  const needsApproval = approvalEnabled && (reqApr || critical);

  const canonicalCmdUser =
    userId != null && String(userId).trim() !== ''
      ? await resolveCanonicalUserId(String(userId).trim(), env)
      : null;

  const tidForRun =
    tenantId != null && String(tenantId).trim() !== '' ? String(tenantId).trim() : (env?.TENANT_ID || '');
  const { agentRunId, commandRunId, conversationId } = resolveCommandPipelineSpine({
    ...o,
    sessionId,
  });
  const userInput = String(cmd.display_name || cmd.slug || 'command').slice(0, 2000);
  const commandsExecuted = [
    {
      catalog_command_id: String(commandId),
      mapped_command: cmd.mapped_command != null ? String(cmd.mapped_command) : '',
      args,
    },
  ];

  if (needsApproval) {
    scheduleCommandPipelineAgentRunStart(env, ctx, {
      agentRunId,
      userId: canonicalCmdUser ?? userId,
      tenantId: tidForRun,
      workspaceId: resolvedWorkspace,
      conversationId,
      commandId: String(commandId),
      taskType: taskType || cmd.task_type || 'tool_use',
    });

    const commandRunOk = await insertAgentsamCommandRunRow(env, {
      id: commandRunId,
      tenant_id: tidForRun,
      workspace_id: resolvedWorkspace,
      user_id: canonicalCmdUser ?? userId,
      session_id: sessionId || null,
      conversation_id: conversationId,
      user_input: userInput,
      intent_category: sanitizeIntentCategoryForCommandRun(cmd.category),
      commands_json: JSON.stringify(commandsExecuted),
      selected_command_id: String(commandId),
      selected_command_slug: cmd.slug != null ? String(cmd.slug) : null,
      risk_level: cmd.risk_level != null ? String(cmd.risk_level) : 'low',
      requires_confirmation: Number(cmd.requires_confirmation) === 1 ? 1 : 0,
      approval_status: 'pending_approval',
      agent_run_id: agentRunId,
    });

    const approvalId = 'appr_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    await env.DB
      .prepare(
        `INSERT INTO agentsam_approval_queue
        (id, tenant_id, workspace_id, user_id, session_id, plan_id, command_run_id, tool_name, action_summary,
         risk_level, input_json, expires_at, status)
        VALUES (?,?,?,?,?,?,?,?,?,?,?, unixepoch() + 300, 'pending')`,
      )
      .bind(
        approvalId,
        tidForRun,
        resolvedWorkspace,
        canonicalCmdUser ?? userId,
        sessionId || null,
        planId || null,
        commandRunOk ? commandRunId : null,
        cmd.mapped_command,
        `${cmd.display_name}: ${JSON.stringify(args).slice(0, 300)}`,
        cmd.risk_level,
        JSON.stringify(args),
      )
      .run()
      .catch((e) => console.warn('[executeCommand] approval_queue insert', e?.message ?? e));

    const apprCols = await pragmaTableInfo(env.DB, 'agentsam_approval_queue');
    if (apprCols.has('agent_run_id') || apprCols.has('conversation_id')) {
      const sets = [];
      const binds = [];
      if (apprCols.has('agent_run_id')) {
        sets.push('agent_run_id = ?');
        binds.push(agentRunId);
      }
      if (apprCols.has('conversation_id')) {
        sets.push('conversation_id = ?');
        binds.push(conversationId);
      }
      if (sets.length) {
        binds.push(approvalId);
        await env.DB
          .prepare(`UPDATE agentsam_approval_queue SET ${sets.join(', ')} WHERE id = ?`)
          .bind(...binds)
          .run()
          .catch(() => {});
      }
    }

    return {
      ok: true,
      status: 'pending_approval',
      approval_id: approvalId,
      agent_run_id: agentRunId,
      command_run_id: commandRunOk ? commandRunId : null,
      command_preview: cmd.mapped_command != null ? String(cmd.mapped_command).slice(0, 2000) : null,
    };
  }

  const effectiveTaskType = taskType || (cmd.task_type != null ? String(cmd.task_type) : null) || 'tool_use';
  const arm = await thompsonSample(env, effectiveTaskType, 'agent', resolvedWorkspace, {
    userId,
    tenantId,
  }).catch(() => null);
  const modelKey = arm?.model_key || 'gpt-5.4-nano'; // baseline; arm resolution preferred
  // Resolve provider from catalog — never hardcode 'openai' as default
  const provider = arm?.provider || (
    await env.DB.prepare(
      'SELECT provider FROM agentsam_model_catalog WHERE model_key = ? AND is_active = 1 LIMIT 1'
    ).bind(modelKey).first().catch(() => null)
  )?.provider || 'openai'; // true last resort only

  scheduleCommandPipelineAgentRunStart(env, ctx, {
    agentRunId,
    userId: canonicalCmdUser ?? userId,
    tenantId: tidForRun,
    workspaceId: resolvedWorkspace,
    conversationId,
    routingArmId: arm?.id ?? null,
    modelKey,
    commandId: String(commandId),
    taskType: effectiveTaskType,
  });

  await insertAgentsamCommandRunRow(env, {
    id: commandRunId,
    tenant_id: tidForRun,
    workspace_id: resolvedWorkspace,
    user_id: canonicalCmdUser ?? userId,
    session_id: sessionId || null,
    conversation_id: conversationId,
    user_input: userInput,
    intent_category: sanitizeIntentCategoryForCommandRun(cmd.category),
    commands_json: JSON.stringify(commandsExecuted),
    model_id: modelKey,
    selected_command_id: String(commandId),
    selected_command_slug: cmd.slug != null ? String(cmd.slug) : null,
    risk_level: cmd.risk_level != null ? String(cmd.risk_level) : 'low',
    requires_confirmation: Number(cmd.requires_confirmation) === 1 ? 1 : 0,
    approval_status: 'not_required',
    agent_run_id: agentRunId,
  });

  const inputPayload =
    canonicalCmdUser == null
      ? {
          ...(typeof args === 'object' && args && !Array.isArray(args) ? args : { args }),
          telemetry_actor: 'system',
        }
      : args;

  const chainId = await insertCommandToolChainRunning(env, {
    workspaceId: resolvedWorkspace,
    tenantId: tidForRun,
    userId: canonicalCmdUser ?? userId,
    sessionId,
    planId,
    todoId,
    toolName: cmd.mapped_command,
    inputJson: inputPayload,
    commandRunId,
    agentRunId,
    conversationId,
    requiresApproval: false,
  });
  if (!chainId) {
    return { ok: false, error: 'tool_chain_insert_failed' };
  }

  if (planId && todoId) {
    await registerExecutionDependency(env, chainId, planId, todoId, tenantId).catch(() => {});
  }

  const dispatchRunContext = {
    tenantId: tidForRun,
    workspaceId: resolvedWorkspace,
    userId: canonicalCmdUser ?? userId,
    sessionId,
    commandRunId,
    agentRunId,
    chainId,
  };

  let dispatchResult = null;
  let dispatchError = null;
  const dispatchStarted = Date.now();
  try {
    const { dispatchAgentsamCommand } = await import('../core/agentsam-command-dispatch.js');
    dispatchResult = await dispatchAgentsamCommand(env, cmd, args, dispatchRunContext);
  } catch (e) {
    dispatchError = e?.message ?? String(e);
    console.warn('[executeCommand] dispatchAgentsamCommand', dispatchError);
  }

  const dispatchOk = dispatchError == null;
  const outputText = dispatchOk
    ? JSON.stringify(dispatchResult ?? { ok: true })
    : String(dispatchError).slice(0, 8000);
  const durationMs = Math.max(0, Date.now() - dispatchStarted);

  await env.DB
    .prepare(
      `UPDATE agentsam_command_run SET
        success = ?,
        exit_code = ?,
        output_text = ?,
        duration_ms = ?,
        error_message = ?
      WHERE id = ?`,
    )
    .bind(
      dispatchOk ? 1 : 0,
      dispatchOk ? 0 : 1,
      outputText.slice(0, 16000),
      durationMs,
      dispatchOk ? null : outputText.slice(0, 8000),
      commandRunId,
    )
    .run()
    .catch((e) => console.warn('[executeCommand] command_run update', e?.message ?? e));

  await env.DB
    .prepare(
      `UPDATE agentsam_tool_chain SET
        tool_status = ?, completed_at = unixepoch(),
        duration_ms = ?, output_summary = ?, error_message = ?
      WHERE id = ?`,
    )
    .bind(
      dispatchOk ? 'completed' : 'failed',
      durationMs,
      outputText.slice(0, 4000),
      dispatchOk ? null : outputText.slice(0, 8000),
      chainId,
    )
    .run()
    .catch(() => {});

  ctx.waitUntil(
    env.DB
      .prepare(
        `UPDATE agentsam_commands SET
        use_count = COALESCE(use_count, 0) + 1,
        last_used_at = datetime('now'),
        updated_at = datetime('now')
      WHERE id = ?`,
      )
      .bind(commandId)
      .run()
      .catch(() => {}),
  );

  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    ctx.waitUntil(
      supabasePostJson(
        env,
        '/rest/v1/agentsam_tool_call_events',
        {
          tool_name: cmd.mapped_command,
          tool_category: cmd.category,
          session_id: sessionId,
          workspace_id: resolvedWorkspace,
          tenant_id: tenantId,
          provider,
          model_key: modelKey,
          success: true,
          duration_ms: 0,
          created_at: new Date().toISOString(),
        },
        'agentsam',
      ).catch(() => {}),
    );
  }

  return {
    ok: dispatchOk,
    status: dispatchOk ? 'completed' : 'failed',
    chain_id: chainId,
    agent_run_id: agentRunId,
    command_run_id: commandRunId,
    model_key: modelKey,
    provider,
    task_type: effectiveTaskType,
    result: dispatchResult,
    error: dispatchError,
  };
}

/**
 * @param {any} env
 * @param {any} ctx
 * @param {Record<string, unknown>} o
 */
export async function completeCommand(env, ctx, o) {
  const {
    chainId,
    commandId,
    success,
    durationMs,
    costUsd = 0,
    inputTokens = 0,
    outputTokens = 0,
    outputSummary = null,
    errorMessage = null,
    errorType = null,
    taskType = 'tool_use',
    modelKey = null,
    provider = null,
  } = o || {};
  if (!env?.DB || !chainId) return;

  let traceTenantWorkspace = null;
  let chainRow = null;
  try {
    chainRow = await env.DB
      .prepare(
        `SELECT tc.id, tc.workspace_id, tc.tenant_id, tc.user_id, tc.agent_session_id, tc.tool_name,
                tc.agent_run_id, tc.conversation_id, tc.command_run_id,
                w.tenant_id AS workspace_tenant_id
         FROM agentsam_tool_chain tc
         LEFT JOIN workspaces w ON w.id = tc.workspace_id
         WHERE tc.id = ?
         LIMIT 1`,
      )
      .bind(chainId)
      .first();
    const tw = chainRow?.workspace_id != null ? String(chainRow.workspace_id).trim() : '';
    const tt =
      chainRow?.tenant_id != null && String(chainRow.tenant_id).trim() !== ''
        ? String(chainRow.tenant_id).trim()
        : chainRow?.workspace_tenant_id != null
          ? String(chainRow.workspace_tenant_id).trim()
          : '';
    if (tw && tt) traceTenantWorkspace = { tenant_id: tt, workspace_id: tw };
  } catch {
    traceTenantWorkspace = null;
    chainRow = null;
  }

  const status = success ? 'completed' : 'failed';
  const errTypeFinal =
    success || errorMessage == null
      ? null
      : errorType != null && String(errorType).trim() !== ''
        ? String(errorType).slice(0, 120)
        : 'tool_execution_failed';

  await env.DB
    .prepare(
      `UPDATE agentsam_tool_chain SET
      tool_status = ?, completed_at = unixepoch(),
      duration_ms = ?, cost_usd = ?,
      input_tokens = ?, output_tokens = ?,
      output_summary = ?, error_message = ?, error_type = ?
    WHERE id = ?`,
    )
    .bind(
      status,
      durationMs,
      costUsd,
      inputTokens,
      outputTokens,
      outputSummary,
      errorMessage,
      errTypeFinal,
      chainId,
    )
    .run()
    .catch(() => {});

  const agentRunId =
    o.agentRunId != null && String(o.agentRunId).trim() !== ''
      ? String(o.agentRunId).trim()
      : chainRow?.agent_run_id != null && String(chainRow.agent_run_id).trim() !== ''
        ? String(chainRow.agent_run_id).trim()
        : null;
  const conversationId =
    chainRow?.conversation_id != null && String(chainRow.conversation_id).trim() !== ''
      ? String(chainRow.conversation_id).trim()
      : chainRow?.agent_session_id != null
        ? String(chainRow.agent_session_id).trim()
        : null;
  const commandRunId =
    chainRow?.command_run_id != null && String(chainRow.command_run_id).trim() !== ''
      ? String(chainRow.command_run_id).trim()
      : null;
  const toolName =
    chainRow?.tool_name != null ? String(chainRow.tool_name) : 'slash_command';
  const spineUserId = chainRow?.user_id != null ? String(chainRow.user_id) : null;

  if (agentRunId && traceTenantWorkspace && spineUserId && ctx?.waitUntil) {
    scheduleAgentsamChatAgentRunInsert(env, ctx, {
      runId: agentRunId,
      userId: spineUserId,
      tenantId: traceTenantWorkspace.tenant_id,
      workspaceId: traceTenantWorkspace.workspace_id,
      conversationId,
      routingArmId: null,
      modelKey: modelKey != null ? String(modelKey) : null,
      taskType: taskType || 'tool_use',
      success: !!success,
      inputTokens,
      outputTokens,
      costUsd,
      durationMs,
      errorMessage: success ? null : errorMessage,
      chainRootId: chainId,
    });
  }

  if (traceTenantWorkspace) {
    const spine = { agent_run_id: agentRunId, conversation_id: conversationId };
    scheduleRecordMcpToolExecution(env, ctx, {
      tenant_id: traceTenantWorkspace.tenant_id,
      workspace_id: traceTenantWorkspace.workspace_id,
      user_id: spineUserId,
      session_id: chainRow?.agent_session_id ?? null,
      tool_name: toolName,
      input_json: JSON.stringify({ chain_id: chainId, command_id: commandId ?? null }),
      output_json: outputSummary != null ? JSON.stringify({ summary: outputSummary }) : null,
      success: !!success,
      error_message: success ? null : errorMessage,
      duration_ms: Math.max(0, Math.floor(Number(durationMs) || 0)),
      invoked_by: spineUserId || 'execute_command',
      status: success ? 'completed' : 'error',
      ...spine,
    });
    scheduleToolCallLog(env, ctx, {
      tenantId: traceTenantWorkspace.tenant_id,
      workspaceId: traceTenantWorkspace.workspace_id,
      sessionId: chainRow?.agent_session_id ?? null,
      userId: spineUserId,
      toolName,
      status: success ? 'success' : 'error',
      durationMs: Math.max(0, Math.floor(Number(durationMs) || 0)),
      costUsd,
      inputTokens,
      outputTokens,
      errorMessage: success ? null : errorMessage,
      inputSummary: outputSummary != null ? String(outputSummary).slice(0, 200) : '',
      ...spine,
    });
  }

  if (commandRunId && env.DB) {
    const crCols = await pragmaTableInfo(env.DB, 'agentsam_command_run');
    const sets = ['success = ?', 'duration_ms = ?', 'cost_usd = ?', 'input_tokens = ?', 'output_tokens = ?'];
    const binds = [
      success ? 1 : 0,
      Math.max(0, Math.floor(Number(durationMs) || 0)),
      Number(costUsd) || 0,
      Math.max(0, Math.floor(Number(inputTokens) || 0)),
      Math.max(0, Math.floor(Number(outputTokens) || 0)),
    ];
    if (crCols.has('output_text')) {
      sets.push('output_text = ?');
      binds.push(outputSummary != null ? String(outputSummary).slice(0, 50000) : null);
    }
    if (crCols.has('error_message')) {
      sets.push('error_message = ?');
      binds.push(success ? null : errorMessage != null ? String(errorMessage).slice(0, 8000) : null);
    }
    if (crCols.has('approval_status')) {
      sets.push("approval_status = 'completed'");
    }
    binds.push(commandRunId);
    await env.DB
      .prepare(`UPDATE agentsam_command_run SET ${sets.join(', ')} WHERE id = ?`)
      .bind(...binds)
      .run()
      .catch(() => {});
  }

  if (commandId) {
    ctx.waitUntil(
      (async () => {
        try {
          if (success) {
            await env.DB
              .prepare(
                `UPDATE agentsam_commands SET
                success_count = COALESCE(success_count, 0) + 1,
                avg_duration_ms = (
                  COALESCE(avg_duration_ms, 0) * COALESCE(success_count, 0) + ?
                ) / (COALESCE(success_count, 0) + 1),
                updated_at = datetime('now')
              WHERE id = ?`,
              )
              .bind(durationMs, commandId)
              .run();
          } else {
            await env.DB
              .prepare(
                `UPDATE agentsam_commands SET
                failure_count = COALESCE(failure_count, 0) + 1,
                updated_at = datetime('now')
              WHERE id = ?`,
              )
              .bind(commandId)
              .run();
          }
        } catch {
          await env.DB
            .prepare(`UPDATE agentsam_commands SET updated_at = datetime('now') WHERE id = ?`)
            .bind(commandId)
            .run()
            .catch(() => {});
        }
      })(),
    );
  }

  if (modelKey && taskType && traceTenantWorkspace?.workspace_id) {
    ctx.waitUntil(
      recordCallOutcome(env, {
        taskType,
        mode: 'agent',
        modelKey,
        provider,
        success,
        costUsd,
        durationMs,
        workspaceId: traceTenantWorkspace.workspace_id,
      }),
    );
  }

  if (traceTenantWorkspace) {
    const endNs = Date.now() * 1_000_000;
    const durMs = Math.max(0, Math.floor(Number(durationMs) || 0));
    const startNs = endNs - durMs * 1_000_000;
    recordSpan(env, ctx, {
      tenant_id: traceTenantWorkspace.tenant_id,
      workspace_id: traceTenantWorkspace.workspace_id,
      operation_name: 'agentsam.command.complete',
      kind: 'internal',
      status_code: success ? 'ok' : 'error',
      status_message:
        success || errorMessage == null ? null : String(errorMessage).slice(0, 2000),
      start_time_unix_nano: startNs,
      end_time_unix_nano: endNs,
      attributes_json: JSON.stringify({
        chain_id: chainId,
        command_id: commandId ?? null,
        task_type: taskType,
        model_key: modelKey,
        provider,
        duration_ms: durMs,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
      }),
    });
  }
}

/**
 * Approve/deny queued action; on approve, re-run through executeCommand when a matching agentsam_commands row exists.
 * @param {any} env
 * @param {any} ctx
 * @param {{ approval_id: string, decision: string, userId?: string | null }} opts
 */
export async function handleAgentApprovalDecision(env, ctx, opts) {
  const approval_id = opts?.approval_id != null ? String(opts.approval_id).trim() : '';
  const decision = opts?.decision != null ? String(opts.decision).trim().toLowerCase() : '';
  const userId = opts?.userId != null ? String(opts.userId).trim() : '';
  if (!env?.DB || !approval_id || !['approved', 'denied'].includes(decision)) {
    return { ok: false, error: 'invalid_params' };
  }

  const newStatus = decision === 'approved' ? 'approved' : 'denied';
  const up = await env.DB
    .prepare(
      `UPDATE agentsam_approval_queue
     SET status = ?, approved_by = ?, decided_at = unixepoch()
     WHERE id = ? AND status = 'pending'
       AND (expires_at IS NULL OR expires_at > unixepoch())`,
    )
    .bind(newStatus, userId || null, approval_id)
    .run()
    .catch(() => null);

  const changes = up?.meta?.changes ?? up?.meta?.rows_written ?? 0;
  if (!changes) return { ok: false, error: 'not_found_or_not_pending' };

  if (decision !== 'approved') return { ok: true, decision };

  const row = await env.DB
    .prepare(`SELECT * FROM agentsam_approval_queue WHERE id = ? LIMIT 1`)
    .bind(approval_id)
    .first()
    .catch(() => null);
  if (!row) return { ok: true, decision: 'approved' };

  const toolName = row.tool_name != null ? String(row.tool_name) : '';
  let args = {};
  try {
    args = JSON.parse(row.input_json || '{}');
  } catch {
    args = {};
  }

  const cmd =
    (await env.DB
      .prepare(
        `SELECT id FROM agentsam_commands WHERE mapped_command = ? AND COALESCE(is_active, 1) = 1 LIMIT 1`,
      )
      .bind(toolName)
      .first()
      .catch(() => null)) ||
    (await env.DB
      .prepare(`SELECT id FROM agentsam_commands WHERE slug = ? AND COALESCE(is_active, 1) = 1 LIMIT 1`)
      .bind(toolName)
      .first()
      .catch(() => null));

  if (!cmd?.id) {
    return { ok: true, decision: 'approved', rerun: 'skipped_no_command' };
  }

  let approvalAgentRunId = null;
  try {
    const apprCols = await pragmaTableInfo(env.DB, 'agentsam_approval_queue');
    if (apprCols.has('agent_run_id') && row.agent_run_id) {
      approvalAgentRunId = String(row.agent_run_id).trim();
    }
  } catch {
    approvalAgentRunId = null;
  }

  const execOut = await executeCommand(env, ctx, {
    commandId: cmd.id,
    userId: row.user_id,
    sessionId: row.session_id,
    tenantId: row.tenant_id,
    workspaceId: null,
    args,
    taskType: 'tool_use',
    skipApprovalGate: true,
    agentRunId: approvalAgentRunId || undefined,
    commandRunId: row.command_run_id != null ? String(row.command_run_id) : undefined,
  });

  return { ok: true, decision: 'approved', execute: execOut };
}
