/**
 * agentsam_command_run + agentsam_execution_context — async telemetry (waitUntil).
 */
import { isFeatureEnabled } from '../core/features.js';
import { thompsonSample, recordCallOutcome } from '../core/thompson.js';

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

/** Resolve workspace for runtime telemetry (env override → explicit → default). */
export function resolveRuntimeWorkspaceId(env, workspaceId) {
  const w = workspaceId != null && String(workspaceId).trim() !== '' ? String(workspaceId).trim() : '';
  if (w) return w;
  const def = env?.DEFAULT_WORKSPACE_ID != null && String(env.DEFAULT_WORKSPACE_ID).trim() !== ''
    ? String(env.DEFAULT_WORKSPACE_ID).trim()
    : '';
  return def || 'ws_inneranimalmedia';
}

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
      resolveRuntimeWorkspaceId(env, opts?.workspaceId),
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
 * Link sequential plan/todo steps in execution_dependency_graph (after prior tool_chain in same plan).
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
    await insertExecutionDependencyGraphEdge(env, tid, chainId, String(prev.id));
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
  const resolvedWorkspace = resolveRuntimeWorkspaceId(env, wid || sessionWorkspace);

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
        userId,
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
  const arm = await thompsonSample(env, effectiveTaskType, 'agent').catch(() => null);
  const modelKey = arm?.model_key || 'gpt-4.1-mini';
  const provider = arm?.provider || 'openai';

  const chainId = 'atc_' + crypto.randomUUID().slice(0, 16);

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
      JSON.stringify(args),
      0,
      0,
    )
    .run();

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
    taskType = 'tool_use',
    modelKey = null,
    provider = null,
  } = o || {};
  if (!env?.DB || !chainId) return;

  const status = success ? 'completed' : 'failed';

  await env.DB
    .prepare(
      `UPDATE agentsam_tool_chain SET
      tool_status = ?, completed_at = unixepoch(),
      duration_ms = ?, cost_usd = ?,
      input_tokens = ?, output_tokens = ?,
      output_summary = ?, error_message = ?
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

  if (modelKey && taskType) {
    ctx.waitUntil(
      recordCallOutcome(env, {
        taskType,
        mode: 'agent',
        modelKey,
        provider,
        success,
        costUsd,
        durationMs,
      }),
    );
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
     WHERE id = ? AND status = 'pending'`,
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
