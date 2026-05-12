/**
 * agentsam_command_run + agentsam_execution_context — async telemetry (waitUntil).
 */
import { resolveCanonicalUserId } from './auth.js';
import { isFeatureEnabled } from '../core/features.js';
import { scheduleAgentsamErrorLog } from '../core/agentsam-error-log.js';
import { pragmaTableInfo } from '../core/retention.js';
import { estimateCostUsdFromCatalog, resolveModelKeyFromProviderId } from '../core/model-catalog-cost.js';

import { thompsonSample, recordCallOutcome } from '../core/thompson.js';
import { recordSpan } from '../core/tracer.js';

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
          costUsdIns = await estimateCostUsdFromCatalog(env.DB, modelIdForRow, inTok, outTok);
        } else {
          costUsdIns = 0;
        }
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
            sanitizeIntentCategoryForCommandRun(p.intentCategory),
            modelIdForRow,
            JSON.stringify(p.commandsExecuted ?? []),
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
      .prepare(`SELECT workspace_id FROM agent_sessions WHERE id = ? LIMIT 1`)
      .bind(sessionId)
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

  if (needsApproval) {
    const approvalId = 'appr_' + crypto.randomUUID().slice(0, 16);
    await env.DB
      .prepare(
        `INSERT INTO agentsam_approval_queue
        (id, tenant_id, user_id, session_id, tool_name, action_summary,
         risk_level, input_json, expires_at, status)
        VALUES (?,?,?,?,?,?,?,?, unixepoch() + 300, 'pending')`,
      )
      .bind(
        approvalId,
        tenantId,
        canonicalCmdUser ?? userId,
        sessionId,
        cmd.mapped_command,
        `${cmd.display_name}: ${JSON.stringify(args).slice(0, 300)}`,
        cmd.risk_level,
        JSON.stringify(args),
      )
      .run();
    return { ok: true, status: 'pending_approval', approval_id: approvalId };
  }

  const effectiveTaskType = taskType || (cmd.task_type != null ? String(cmd.task_type) : null) || 'tool_use';
  const arm = await thompsonSample(env, effectiveTaskType, 'agent', resolvedWorkspace).catch(() => null);
  const modelKey = arm?.model_key || 'gpt-5.4-mini';
  const provider = arm?.provider || 'openai';

  const chainId = 'atc_' + crypto.randomUUID().slice(0, 16);

  const tidIns =
    tenantId != null && String(tenantId).trim() !== '' ? String(tenantId).trim() : null;
  const inputPayload =
    canonicalCmdUser == null
      ? {
          ...(typeof args === 'object' && args && !Array.isArray(args) ? args : { args }),
          telemetry_actor: 'system',
        }
      : args;

  const insRunning = await env.DB
    .prepare(
      `INSERT INTO agentsam_tool_chain
      (id, plan_id, todo_id, workspace_id, tenant_id, user_id, agent_session_id, tool_name, tool_id,
       tool_status, input_json, started_at, requires_approval, depth)
      VALUES (?,?,?,?,?,?,?,?,?,?,?, unixepoch(), ?, ?)`,
    )
    .bind(
      chainId,
      planId,
      todoId,
      resolvedWorkspace,
      tidIns,
      canonicalCmdUser,
      sessionId || null,
      cmd.mapped_command,
      null,
      'running',
      JSON.stringify(inputPayload),
      0,
      0,
    )
    .run()
    .catch(() => null);

  if (!insRunning?.success) {
    await env.DB
      .prepare(
        `INSERT INTO agentsam_tool_chain
      (id, plan_id, todo_id, workspace_id, agent_session_id, tool_name, tool_id,
       tool_status, input_json, started_at, requires_approval, depth)
      VALUES (?,?,?,?,?,?,?,?,?, unixepoch(), ?, ?)`,
      )
      .bind(
        chainId,
        planId,
        todoId,
        resolvedWorkspace,
        sessionId || null,
        cmd.mapped_command,
        null,
        'running',
        JSON.stringify(inputPayload),
        0,
        0,
      )
      .run();
  }

  if (planId && todoId) {
    await registerExecutionDependency(env, chainId, planId, todoId, tenantId).catch(() => {});
  }

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

  const sbUrl = env.SUPABASE_URL;
  const sbKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (sbUrl && sbKey) {
    ctx.waitUntil(
      fetch(`${sbUrl}/rest/v1/agentsam_tool_call_events`, {
        method: 'POST',
        headers: {
          apikey: sbKey,
          Authorization: `Bearer ${sbKey}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify({
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
        }),
      }).catch(() => {}),
    );
  }

  return {
    ok: true,
    status: 'running',
    chain_id: chainId,
    model_key: modelKey,
    provider,
    task_type: effectiveTaskType,
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
  try {
    const crow = await env.DB
      .prepare(
        `SELECT tc.workspace_id AS workspace_id, w.tenant_id AS tenant_id
         FROM agentsam_tool_chain tc
         INNER JOIN workspaces w ON w.id = tc.workspace_id
         WHERE tc.id = ?
         LIMIT 1`,
      )
      .bind(chainId)
      .first();
    const tw = crow?.workspace_id != null ? String(crow.workspace_id).trim() : '';
    const tt = crow?.tenant_id != null ? String(crow.tenant_id).trim() : '';
    if (tw && tt) traceTenantWorkspace = { tenant_id: tt, workspace_id: tw };
  } catch {
    traceTenantWorkspace = null;
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

  const execOut = await executeCommand(env, ctx, {
    commandId: cmd.id,
    userId: row.user_id,
    sessionId: row.session_id,
    tenantId: row.tenant_id,
    workspaceId: null,
    args,
    taskType: 'tool_use',
    skipApprovalGate: true,
  });

  return { ok: true, decision: 'approved', execute: execOut };
}
