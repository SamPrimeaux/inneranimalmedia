/**
 * agentsam_command_run + agentsam_execution_context — async telemetry (waitUntil).
 */

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

/** Same default as IAM_DEFAULT_WORKSPACE_ID in worker — agentsam_tool_chain.workspace_id. */
const DEFAULT_AGENT_TOOL_CHAIN_WORKSPACE_ID = 'ws_inneranimalmedia';

/** Sequential dependency edge for tool_chain steps (D1). */
export async function insertExecutionDependencyGraphEdge(env, tenantId, executionId, dependsOnExecutionId) {
  if (!env?.DB || !tenantId || !executionId || !dependsOnExecutionId) return;
  await env.DB
    .prepare(
      `
    INSERT OR IGNORE INTO execution_dependency_graph
      (id, tenant_id, execution_id, depends_on_execution_id,
       dependency_type, created_at)
    VALUES (
      lower(hex(randomblob(8))),
      ?,
      ?,
      ?,
      'sequential',
      unixepoch()
    )
  `,
    )
    .bind(tenantId, executionId, dependsOnExecutionId)
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
    terminalSessionId,
    tenantId = null,
    parentChainId = null,
    ctx = null,
  } = opts || {};
  if (!env?.DB) return null;
  const completedAt = Math.floor(Date.now() / 1000);
  const durSec = Math.max(0, Math.ceil((Number(durationMs) || 0) / 1000));
  const startedAt = Math.max(0, completedAt - durSec);
  const toolStatus = error ? 'failed' : 'completed';
  const chainId = `atc_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const tenant =
    tenantId != null && String(tenantId).trim() !== '' ? String(tenantId).trim() : null;
  const parentId =
    parentChainId != null && String(parentChainId).trim() !== '' ? String(parentChainId).trim() : null;

  const p = env.DB
    .prepare(
      `INSERT INTO agentsam_tool_chain (id, workspace_id, agent_session_id, tool_name, tool_status, started_at, completed_at, cost_usd, mcp_tool_call_id, terminal_session_id, parent_chain_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      chainId,
      DEFAULT_AGENT_TOOL_CHAIN_WORKSPACE_ID,
      agentSessionId != null && String(agentSessionId).trim() !== '' ? String(agentSessionId) : null,
      toolName,
      toolStatus,
      startedAt,
      completedAt,
      costUsd != null && Number.isFinite(Number(costUsd)) ? Number(costUsd) : 0,
      mcpToolCallId || null,
      terminalSessionId != null && String(terminalSessionId).trim() !== '' ? String(terminalSessionId) : null,
      parentId,
    )
    .run()
    .then(() => {
      if (tenant && parentId) {
        return insertExecutionDependencyGraphEdge(env, tenant, chainId, parentId);
      }
    })
    .catch((e) => console.warn('[agentsam_tool_chain]', e?.message ?? e));

  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(p);
  else void p;

  return chainId;
}

/**
 * Upsert execution_performance_metrics after a command run completes (insert path).
 * Skips when commandId is absent.
 */
export async function upsertExecutionPerformanceMetricsAfterCommandRun(env, p) {
  const commandId = p.commandId != null ? String(p.commandId).trim() : '';
  if (!env?.DB || !commandId) return;

  const tenantId = p.tenantId != null && String(p.tenantId).trim() !== '' ? String(p.tenantId).trim() : 'tenant_sam_primeaux';
  const status = p.success ? 'completed' : 'failed';
  const metricDate = new Date().toISOString().slice(0, 10);
  const isSuccess = status === 'completed' ? 1 : 0;
  const isFail = status === 'failed' ? 1 : 0;
  const costUsd = p.costUsd ?? 0;
  const costCents = (costUsd || 0) * 100;
  const durationMs = Math.max(0, Math.floor(Number(p.durationMs) || 0));
  const tokensConsumed = Math.max(0, Math.floor(Number(p.tokensConsumed) || 0));

  await env.DB
    .prepare(
      `
    INSERT INTO execution_performance_metrics
      (id, tenant_id, command_id, metric_date,
       execution_count, success_count, failure_count,
       avg_duration_ms, min_duration_ms, max_duration_ms,
       success_rate_percent, total_tokens_consumed,
       total_cost_cents, last_computed_at)
    VALUES (
      'epm_' || lower(hex(randomblob(8))),
      ?, ?, ?,
      1, ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, unixepoch()
    )
    ON CONFLICT(tenant_id, command_id, metric_date) DO UPDATE SET
      execution_count = execution_count + 1,
      success_count = success_count + ?,
      failure_count = failure_count + ?,
      avg_duration_ms = ((avg_duration_ms * (execution_count - 1)) + ?) / execution_count,
      min_duration_ms = CASE WHEN ? < min_duration_ms OR min_duration_ms = 0
                        THEN ? ELSE min_duration_ms END,
      max_duration_ms = CASE WHEN ? > max_duration_ms
                        THEN ? ELSE max_duration_ms END,
      success_rate_percent = CAST(success_count AS REAL) /
                             CAST(execution_count AS REAL) * 100,
      total_tokens_consumed = total_tokens_consumed + ?,
      total_cost_cents = total_cost_cents + ?,
      last_computed_at = unixepoch()
  `,
    )
    .bind(
      tenantId,
      commandId,
      metricDate,
      isSuccess,
      isFail,
      durationMs,
      durationMs,
      durationMs,
      (isSuccess / 1) * 100,
      tokensConsumed,
      costCents,
      isSuccess,
      isFail,
      durationMs,
      durationMs,
      durationMs,
      durationMs,
      durationMs,
      tokensConsumed,
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
 * }} p
 */
export function scheduleAgentsamCommandRunInsert(env, ctx, p) {
  if (!env?.DB || !ctx?.waitUntil) return;
  const ws = p.workspaceId != null ? String(p.workspaceId).trim() : '';
  if (!ws) return;

  ctx.waitUntil(
    (async () => {
      const commandRunId = `run_${crypto.randomUUID().slice(0, 16)}`;
      const modelId = p.modelKey ?? null;
      try {
        const ins = await env.DB.prepare(
          `INSERT INTO agentsam_command_run
            (id, workspace_id, session_id, conversation_id,
             user_input, normalized_intent, intent_category,
             model_id, commands_json, result_json, output_text,
             confidence_score, success, exit_code, duration_ms,
             input_tokens, output_tokens, cost_usd, error_message,
             selected_command_id, selected_command_slug,
             risk_level, requires_confirmation, approval_status)
           VALUES
            (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
          .bind(
            commandRunId,
            ws,
            p.sessionId ?? null,
            p.conversationId ?? null,
            p.userInput ?? '',
            p.normalizedIntent ?? null,
            sanitizeIntentCategoryForCommandRun(p.intentCategory),
            modelId,
            JSON.stringify(p.commandsExecuted ?? []),
            JSON.stringify(p.result ?? {}),
            p.outputText != null ? String(p.outputText).slice(0, 50000) : null,
            p.confidenceScore ?? null,
            p.success ? 1 : 0,
            p.exitCode ?? null,
            Math.max(0, Math.floor(p.durationMs || 0)),
            p.inputTokens ?? 0,
            p.outputTokens ?? 0,
            p.costUsd ?? 0,
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
          tenantId: 'tenant_sam_primeaux',
          commandId: p.selectedCommandId,
          success: p.success,
          durationMs: Math.max(0, Math.floor(p.durationMs || 0)),
          costUsd: p.costUsd ?? 0,
          tokensConsumed: (p.inputTokens ?? 0) + (p.outputTokens ?? 0),
        });

        await env.DB
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
          .catch(() => {});
      } catch (e) {
        console.warn('[command_run] insert failed', e?.message ?? e);
      }
    })(),
  );
}
