/**
 * Agent Sam Task Executor
 * Runs agentsam_plan_tasks sequentially, emitting SSE events per task.
 * Each task uses its handler_type to decide execution path.
 */

import { dispatchComplete } from './provider.js';
import { resolveModelForTask } from './resolveModel.js';
import { resolveCanonicalUserId } from '../api/auth.js';
import { fetchAuthUserTenantId } from './auth.js';
import { executeCommand, completeCommand } from '../api/command-run-telemetry.js';
import { runTerminalCommandViaHttpExec } from './terminal.js';
import { pragmaTableInfo } from './retention.js';
import { normalizeR2ObjectKey } from './r2-keys.js';
import { r2PutViaBindingOrS3 } from './r2.js';
import { getR2Binding } from '../api/r2-api.js';
import { insertPlanExecutionStep, resolvePlanTaskCapabilityType } from './agentsam-planner.js';
import { scheduleMirrorAgentChatPlanToSupabase, scheduleMirrorAgentsamPlanToSupabasePublic } from './agentsam-plan-supabase-public-sync.js';
import * as agentApiModule from '../api/agent.js';

const PLAN_ARTIFACT_R2_BUCKET = 'inneranimalmedia';

const TASK_AGENT_SYSTEM = `You are Agent Sam executing a specific task. Complete it thoroughly and concisely. Return your result as plain text.`;

async function resolveTaskExecutorModelKey(env, workspaceId) {
  const resolved = await resolveModelForTask(env, {
    task_type: 'agent',
    mode: 'agent',
    workspace_id:
      workspaceId != null && String(workspaceId).trim() !== ''
        ? String(workspaceId).trim()
        : null,
    require_tools: true,
  });
  if (!resolved?.model_key) {
    throw new Error('agentsam-task-executor: resolveModelForTask returned no model');
  }
  return resolved;
}

function extractCodexUsage(result) {
  const usage =
    result?.usage && typeof result.usage === 'object'
      ? result.usage
      : result?.response?.usage && typeof result.response.usage === 'object'
        ? result.response.usage
        : null;
  if (!usage) {
    return {
      usageAvailable: false,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    };
  }
  return {
    usageAvailable: true,
    inputTokens: Math.max(
      0,
      Math.floor(
        Number(
          usage.input_tokens ??
            usage.inputTokens ??
            usage.prompt_tokens ??
            usage.promptTokens ??
            0,
        ) || 0,
      ),
    ),
    outputTokens: Math.max(
      0,
      Math.floor(
        Number(
          usage.output_tokens ??
            usage.outputTokens ??
            usage.completion_tokens ??
            usage.completionTokens ??
            0,
        ) || 0,
      ),
    ),
    costUsd: Number(usage.cost_usd ?? usage.costUsd ?? result?.cost_usd ?? result?.costUsd ?? 0) || 0,
  };
}

function scheduleCodexTaskCompletionMetrics(env, ctx, input) {
  if (!env?.DB) return;
  const runId = `run_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const etoId = `eto_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const op = (async () => {
    const usage = extractCodexUsage(input.result);
    const startedAt = String(input.startedAt || new Date().toISOString());
    const completedAt = new Date().toISOString();
    const modelKey = input.modelKey != null ? String(input.modelKey).trim() : '';
    const userId = input.userId != null ? String(input.userId).trim() : '';
    const workspaceId = input.workspaceId != null ? String(input.workspaceId).trim() : '';
    const tenantId =
      input.tenantId != null && String(input.tenantId).trim() !== ''
        ? String(input.tenantId).trim()
        : null;
    if (!modelKey || !userId || !workspaceId) return;

    await env.DB.prepare(
      `INSERT INTO agentsam_agent_run
        (id, user_id, workspace_id, tenant_id, status, trigger,
         model_id, task_type, input_tokens, output_tokens,
         cost_usd, started_at, completed_at, created_at)
       VALUES (?, ?, ?, ?, 'completed', 'codex_task', ?,
               'codex', ?, ?, ?, ?, ?, datetime('now'))`,
    )
      .bind(
        runId,
        userId,
        workspaceId,
        tenantId,
        modelKey,
        usage.inputTokens,
        usage.outputTokens,
        usage.costUsd,
        startedAt,
        completedAt,
      )
      .run();

    await env.DB.prepare(
      `INSERT INTO agentsam_performance_eto_events
        (id, source_table, source_id, agent_run_id, task_type,
         model_key, provider, input_tokens, output_tokens,
         cost_usd, success, is_training_eligible, created_at)
       VALUES (?, 'agentsam_agent_run', ?, ?, 'codex',
               ?, 'openai', ?, ?, ?, 1, ?, datetime('now'))`,
    )
      .bind(
        etoId,
        runId,
        runId,
        modelKey,
        usage.inputTokens,
        usage.outputTokens,
        usage.costUsd,
        usage.usageAvailable ? 1 : 0,
      )
      .run();
  })().catch((e) => {
    console.warn('[codex_task_metrics]', e?.message ?? e);
  });
  if (ctx?.waitUntil) ctx.waitUntil(op);
  else void op;
}

/**
 * Tenant/workspace for plan execution: caller params → agentsam_plans → logged-in user (auth_users.tenant_id).
 */
async function resolvePlanTenantWorkspace(env, { planId, tenantId, workspaceId, userId }) {
  let tid = tenantId != null && String(tenantId).trim() !== '' ? String(tenantId).trim() : null;
  let wid = workspaceId != null && String(workspaceId).trim() !== '' ? String(workspaceId).trim() : '';

  if (env?.DB && planId) {
    const prow = await env.DB
      .prepare(`SELECT tenant_id, workspace_id FROM agentsam_plans WHERE id = ? LIMIT 1`)
      .bind(planId)
      .first()
      .catch(() => null);
    if (!tid && prow?.tenant_id != null && String(prow.tenant_id).trim() !== '') {
      tid = String(prow.tenant_id).trim();
    }
    if (!wid && prow?.workspace_id != null && String(prow.workspace_id).trim() !== '') {
      wid = String(prow.workspace_id).trim();
    }
  }

  const uid = userId != null && String(userId).trim() !== '' ? String(userId).trim() : '';
  if (!tid && uid) {
    tid = await fetchAuthUserTenantId(env, uid).catch(() => null);
  }

  return { tenantId: tid, workspaceId: wid };
}

/** Shell text to run after authorization (quality_gate.proposed_shell, cmd:, agentsam_commands id, or description). */
function shellCommandForTerminalTask(task) {
  try {
    const qg = JSON.parse(String(task.quality_gate_json || '{}'));
    if (qg.proposed_shell && String(qg.proposed_shell).trim()) {
      return String(qg.proposed_shell).trim().slice(0, 4000);
    }
  } catch {
    /* ignore */
  }
  const hk = task.handler_key != null ? String(task.handler_key).trim() : '';
  const desc = String(task.description || '').trim();
  if (hk.startsWith('cmd:')) return desc.slice(0, 4000);
  if (hk && /^[a-zA-Z0-9_.-]{4,80}$/.test(hk) && !/[;&|`$]/.test(hk)) {
    return desc.slice(0, 4000);
  }
  return (hk || desc).slice(0, 4000);
}

/**
 * Planner-generated shell: create command_run + approval_queue and attach to the plan task.
 * @param {any} env
 * @param {{ task: Record<string, unknown>, planId: string, userId: string|null, workspaceId: string, tenantId: string|null, sessionId: string|null, cmd: string, emit: (ev: string, data: Record<string, unknown>) => void }} p
 * @returns {Promise<{ ok: boolean, reused?: boolean, created?: boolean, command_run_id?: string, approval_id?: string }>}
 */
async function ensurePlanTerminalApprovalProposal(env, p) {
  const { task, planId, userId, workspaceId, tenantId, sessionId, cmd, emit } = p;
  if (!env.DB || !cmd.trim()) return { ok: false };

  const ws = String(workspaceId || '').trim();
  if (!ws) return { ok: false };

  let tid = tenantId != null && String(tenantId).trim() !== '' ? String(tenantId).trim() : null;
  let workflowRunId = null;
  const prow = await env.DB
    .prepare(`SELECT tenant_id, workflow_run_id FROM agentsam_plans WHERE id = ? LIMIT 1`)
    .bind(planId)
    .first()
    .catch(() => null);
  if (!tid && prow?.tenant_id != null) tid = String(prow.tenant_id).trim();
  if (prow?.workflow_run_id != null && String(prow.workflow_run_id).trim() !== '') {
    workflowRunId = String(prow.workflow_run_id).trim();
  }

  const uidRaw = userId != null && String(userId).trim() !== '' ? String(userId).trim() : null;
  if (!uidRaw) return { ok: false };
  const canonicalUser = await resolveCanonicalUserId(uidRaw, env).catch(() => uidRaw);

  if (!tid) {
    tid = await fetchAuthUserTenantId(env, canonicalUser).catch(() => null);
  }
  if (!tid) {
    tid = await fetchAuthUserTenantId(env, uidRaw).catch(() => null);
  }
  if (!tid) return { ok: false };

  const existingCrid = task.command_run_id != null ? String(task.command_run_id).trim() : '';
  if (existingCrid) {
    const run = await env.DB
      .prepare(`SELECT approval_status FROM agentsam_command_run WHERE id = ? LIMIT 1`)
      .bind(existingCrid)
      .first()
      .catch(() => null);
    const q = await env.DB
      .prepare(
        `SELECT id, status FROM agentsam_approval_queue WHERE command_run_id = ? AND lower(status) = 'pending' LIMIT 1`,
      )
      .bind(existingCrid)
      .first()
      .catch(() => null);
    if (run && String(run.approval_status || '').toLowerCase() === 'pending_approval' && q?.id) {
      emit('approval_required', {
        task_id: task.id,
        command_run_id: existingCrid,
        approval_id: String(q.id),
        title: String(task.title || 'Terminal'),
        command_preview: cmd.slice(0, 2000),
        risk_level: 'high',
        action_summary: `Plan terminal task needs explicit approval before execution.`,
        plan_id: planId,
        workflow_run_id: workflowRunId,
        execution_step_id: task.execution_step_id != null ? String(task.execution_step_id) : undefined,
      });
      return { ok: true, reused: true, command_run_id: existingCrid, approval_id: String(q.id) };
    }
  }

  const runId = 'run_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const approvalId = 'appr_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const commandsJson = JSON.stringify([{ proposed_shell: cmd.slice(0, 4000), source: 'plan_terminal', plan_task_id: task.id }]);
  const userInput = String(task.title || 'Plan terminal').slice(0, 2000);

  let estepId = task.execution_step_id != null ? String(task.execution_step_id).trim() : '';
  const stepCols = await pragmaTableInfo(env.DB, 'agentsam_execution_steps');
  const apprCols = await pragmaTableInfo(env.DB, 'agentsam_approval_queue');
  const planTaskCols = await pragmaTableInfo(env.DB, 'agentsam_plan_tasks');

  try {
    if (!estepId && workflowRunId) {
      estepId =
        (await insertPlanExecutionStep(env, stepCols, {
          workflowRunId,
          nodeKey: `plan_terminal_dynamic_${String(task.id || 'task').slice(0, 40)}`,
          nodeType: 'terminal',
          inputObj: { plan_task_id: task.id, plan_id: planId, source: 'plan_terminal_dynamic' },
        })) || '';
      if (estepId && planTaskCols.has('execution_step_id')) {
        await env.DB
          .prepare(`UPDATE agentsam_plan_tasks SET execution_step_id = ? WHERE id = ?`)
          .bind(estepId, task.id)
          .run();
      }
    }

    const inputJson = JSON.stringify({
      command_text: cmd.slice(0, 4000),
      plan_task_id: task.id,
      plan_id: planId,
      execution_step_id: estepId || null,
    });

    await env.DB
      .prepare(
        `INSERT INTO agentsam_command_run
          (id, tenant_id, workspace_id, user_id, session_id, conversation_id,
           user_input, normalized_intent, intent_category, model_id,
           commands_json, result_json, output_text, confidence_score,
           success, exit_code, duration_ms, input_tokens, output_tokens, cost_usd, error_message,
           selected_command_id, selected_command_slug, risk_level, requires_confirmation, approval_status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        runId,
        tid,
        ws,
        canonicalUser,
        sessionId || null,
        null,
        userInput,
        'plan_terminal',
        'misc',
        null,
        commandsJson,
        '{}',
        null,
        null,
        0,
        null,
        null,
        0,
        0,
        0,
        null,
        null,
        null,
        'high',
        1,
        'pending_approval',
      )
      .run();

    const ac = [
      'id',
      'tenant_id',
      'workspace_id',
      'user_id',
      'session_id',
      'plan_id',
    ];
    const ab = [approvalId, tid, ws, canonicalUser, sessionId || null, planId];
    if (apprCols.has('workflow_run_id') && workflowRunId) {
      ac.push('workflow_run_id');
      ab.push(workflowRunId);
    }
    ac.push('command_run_id');
    ab.push(runId);
    if (apprCols.has('execution_step_id') && estepId) {
      ac.push('execution_step_id');
      ab.push(estepId);
    }
    ac.push('tool_name', 'action_summary', 'input_json', 'risk_level', 'status', 'expires_at');
    ab.push(
      'terminal.plan_task',
      `Approve shell for plan task: ${String(task.title || '').slice(0, 200)}`,
      inputJson,
      'high',
      'pending',
      null,
    );
    const apprPh = ac.map(() => '?').join(', ');
    await env.DB
      .prepare(`INSERT INTO agentsam_approval_queue (${ac.join(', ')}) VALUES (${apprPh})`)
      .bind(...ab)
      .run();

    if (estepId) {
      await env.DB
        .prepare(
          `UPDATE agentsam_execution_steps SET approval_id = ?, status = 'approval_pending' WHERE id = ?`,
        )
        .bind(approvalId, estepId)
        .run();
    }

    await env.DB
      .prepare(
        `UPDATE agentsam_plan_tasks SET command_run_id = ?, output_summary = ?, status = 'todo' WHERE id = ?`,
      )
      .bind(runId, '[terminal] Awaiting explicit approval (Allow) before execution.', task.id)
      .run();

    emit('approval_required', {
      task_id: task.id,
      command_run_id: runId,
      approval_id: approvalId,
      title: String(task.title || 'Terminal'),
      command_preview: cmd.slice(0, 2000),
      risk_level: 'high',
      action_summary: `Plan terminal task needs explicit approval before execution.`,
      plan_id: planId,
      workflow_run_id: workflowRunId,
      execution_step_id: estepId || (task.execution_step_id != null ? String(task.execution_step_id) : undefined),
    });

    return { ok: true, created: true, command_run_id: runId, approval_id: approvalId };
  } catch (e) {
    console.warn('[executePlan] terminal approval proposal failed', e?.message ?? e);
    return { ok: false };
  }
}

/**
 * Approval queue is the source of truth when execution_step_id is present on the plan task.
 * @param {any} env
 * @param {string} commandRunId
 * @param {string} executionStepId
 */
async function approvalQueueApprovedForCommandRun(env, commandRunId, executionStepId) {
  const cr = String(commandRunId || '').trim();
  const es = executionStepId != null ? String(executionStepId).trim() : '';
  if (!cr || !env.DB) return false;
  const qcols = await pragmaTableInfo(env.DB, 'agentsam_approval_queue');
  try {
    if (es && qcols.has('execution_step_id')) {
      const row = await env.DB
        .prepare(
          `SELECT id FROM agentsam_approval_queue
           WHERE command_run_id = ? AND execution_step_id = ?
             AND lower(status) = 'approved'
             AND (expires_at IS NULL OR expires_at > unixepoch())
           LIMIT 1`,
        )
        .bind(cr, es)
        .first();
      return !!row?.id;
    }
    const row = await env.DB
      .prepare(
        `SELECT id FROM agentsam_approval_queue
         WHERE command_run_id = ?
           AND lower(status) = 'approved'
           AND (expires_at IS NULL OR expires_at > unixepoch())
         LIMIT 1`,
      )
      .bind(cr)
      .first();
    return !!row?.id;
  } catch {
    return false;
  }
}

/**
 * @param {any} env
 * @param {string} commandRunId
 * @param {Record<string, unknown>|null} task
 */
async function isCommandRunApprovedForTerminal(env, commandRunId, task = null) {
  const id = String(commandRunId || '').trim();
  if (!id || !env.DB) return false;
  const run = await env.DB
    .prepare(`SELECT * FROM agentsam_command_run WHERE id = ? LIMIT 1`)
    .bind(id)
    .first()
    .catch(() => null);
  if (!run) return false;

  const st = run.approval_status != null ? String(run.approval_status).toLowerCase().trim() : '';
  const esid = task?.execution_step_id != null ? String(task.execution_step_id).trim() : '';
  if (esid) {
    return approvalQueueApprovedForCommandRun(env, id, esid);
  }
  if (st === 'approved') return true;

  try {
    return await approvalQueueApprovedForCommandRun(env, id, '');
  } catch {
    return false;
  }
}

/**
 * Opt-in terminal: only after an approved agentsam_command_run, or executeCommand() did not
 * return pending_approval (same approval gate as the command pipeline).
 *
 * @param {any} env
 * @param {any} ctx
 * @param {{ task: Record<string, unknown>, planId: string, userId: string|null, workspaceId: string, tenantId: string|null, sessionId: string|null }} p
 */
async function authorizePlanTerminalExecution(env, ctx, p) {
  const { task, planId, userId, workspaceId, tenantId, sessionId } = p;
  const stubCtx =
    ctx && typeof ctx.waitUntil === 'function'
      ? ctx
      : { waitUntil: (fn) => void Promise.resolve(typeof fn === 'function' ? fn() : fn).catch(() => {}) };

  const crid = task.command_run_id != null ? String(task.command_run_id).trim() : '';
  if (crid && (await isCommandRunApprovedForTerminal(env, crid, task))) {
    return {
      allowed: true,
      via: task.execution_step_id ? 'approval_queue' : 'approved_command_run',
      command_run_id: crid,
      chain_id: null,
      commandId: null,
    };
  }

  let commandId = '';
  const hkRaw = task.handler_key != null ? String(task.handler_key).trim() : '';
  if (hkRaw.startsWith('cmd:')) commandId = hkRaw.slice(4).trim();
  else if (hkRaw && !hkRaw.includes(' ')) commandId = hkRaw;

  if (!commandId && crid && env.DB) {
    const run = await env.DB
      .prepare(`SELECT selected_command_id FROM agentsam_command_run WHERE id = ? LIMIT 1`)
      .bind(crid)
      .first()
      .catch(() => null);
    if (run?.selected_command_id != null && String(run.selected_command_id).trim() !== '') {
      commandId = String(run.selected_command_id).trim();
    }
  }

  if (!commandId || !env.DB) {
    return {
      allowed: false,
      reason: 'no_gate',
      userMessage:
        '[terminal] NOT EXECUTED: link an approved agentsam_command_run (set plan task command_run_id after approval), or set handler_key to an agentsam_commands.id so the command approval gate can run.',
    };
  }

  const cmdRow = await env.DB
    .prepare(`SELECT id FROM agentsam_commands WHERE id = ? AND COALESCE(is_active, 1) = 1 LIMIT 1`)
    .bind(commandId)
    .first()
    .catch(() => null);
  if (!cmdRow?.id) {
    return {
      allowed: false,
      reason: 'command_not_found',
      userMessage: `[terminal] NOT EXECUTED: agentsam_commands id not found or inactive: ${commandId}`,
    };
  }

  const execOut = await executeCommand(env, stubCtx, {
    commandId,
    userId,
    tenantId,
    workspaceId,
    sessionId: sessionId || null,
    planId,
    todoId: null,
    skipApprovalGate: false,
  });

  if (!execOut || execOut.ok === false) {
    return {
      allowed: false,
      reason: 'executeCommand_failed',
      userMessage: `[terminal] NOT EXECUTED: executeCommand failed — ${execOut?.error ?? JSON.stringify(execOut)}`,
    };
  }
  if (execOut.status === 'pending_approval') {
    return {
      allowed: false,
      reason: 'pending_approval',
      approval_id: execOut.approval_id ?? null,
      command_run_id: execOut.command_run_id ?? null,
      command_preview: execOut.command_preview != null ? String(execOut.command_preview).slice(0, 2000) : null,
      userMessage:
        '[terminal] NOT EXECUTED: command requires human approval (executeCommand returned pending_approval). Click Allow on the approval card, then run resume for this task.',
    };
  }
  if (execOut.status === 'running' && task.execution_step_id) {
    return {
      allowed: false,
      reason: 'planner_requires_explicit_queue',
      userMessage:
        '[terminal] NOT EXECUTED: planner-linked tasks require an approved agentsam_approval_queue row (not catalog auto-run).',
    };
  }

  return {
    allowed: true,
    via: 'executeCommand',
    chain_id: execOut.chain_id ?? null,
    agent_run_id: execOut.agent_run_id ?? null,
    command_run_id: execOut.command_run_id ?? null,
    commandId,
    modelKey: execOut.model_key ?? null,
    provider: execOut.provider ?? null,
    task_type: execOut.task_type ?? null,
  };
}

async function patchPlanExecutionStep(env, task, status, extra = {}) {
  const eid = task?.execution_step_id != null ? String(task.execution_step_id).trim() : '';
  if (!eid || !env?.DB) return;
  const cols = await pragmaTableInfo(env.DB, 'agentsam_execution_steps');
  const sets = [];
  const binds = [];
  if (cols.has('status')) {
    sets.push('status = ?');
    binds.push(status);
  }
  if (extra.outputJson != null && cols.has('output_json')) {
    sets.push('output_json = ?');
    binds.push(String(extra.outputJson).slice(0, 16000));
  }
  if (extra.errorJson != null && cols.has('error_json')) {
    sets.push('error_json = ?');
    binds.push(String(extra.errorJson).slice(0, 16000));
  }
  if (extra.latencyMs != null && cols.has('latency_ms')) {
    sets.push('latency_ms = ?');
    binds.push(extra.latencyMs);
  }
  if (!extra.skipCompleted && cols.has('completed_at')) {
    sets.push('completed_at = unixepoch()');
  }
  if (!sets.length) return;
  binds.push(eid);
  await env.DB
    .prepare(`UPDATE agentsam_execution_steps SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...binds)
    .run()
    .catch(() => {});
}

/**
 * D1 agentsam_capability_aliases → tool_key rows for an abstract capability (monaco_edit, browser_capture).
 * @param {any} env
 * @param {string} abstractCapability
 */
async function resolveCapabilityAliasToolKeys(env, abstractCapability) {
  if (!env?.DB) return [];
  const cap = String(abstractCapability || '').trim().toLowerCase();
  if (!cap) return [];
  try {
    const { results } = await env.DB.prepare(
      `SELECT match_kind, match_value, priority, requires_approval, is_mutation
       FROM agentsam_capability_aliases
       WHERE abstract_capability = ? AND is_active = 1
       ORDER BY priority ASC`,
    )
      .bind(cap)
      .all();
    return results || [];
  } catch {
    return [];
  }
}

/** @param {string} workspaceId @param {string} planId @param {string} filePath */
function planArtifactObjectKey(workspaceId, planId, filePath) {
  const base = String(filePath || '')
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    ?.trim();
  const safe = (base || 'file.txt').replace(/[^a-zA-Z0-9._-]+/g, '_');
  return `workspaces/${String(workspaceId).trim()}/plans/${String(planId).trim()}/${safe}`;
}

function contentTypeForPlanFile(filePath) {
  const p = String(filePath || '').toLowerCase();
  if (p.endsWith('.html') || p.endsWith('.htm')) return 'text/html; charset=utf-8';
  if (p.endsWith('.css')) return 'text/css; charset=utf-8';
  if (p.endsWith('.js') || p.endsWith('.mjs')) return 'application/javascript; charset=utf-8';
  if (p.endsWith('.json')) return 'application/json; charset=utf-8';
  if (p.endsWith('.svg')) return 'image/svg+xml';
  if (p.endsWith('.md')) return 'text/markdown; charset=utf-8';
  return 'text/plain; charset=utf-8';
}

function languageForPlanFile(filePath) {
  const p = String(filePath || '').toLowerCase();
  if (p.endsWith('.html') || p.endsWith('.htm')) return 'html';
  if (p.endsWith('.css')) return 'css';
  if (p.endsWith('.js') || p.endsWith('.mjs') || p.endsWith('.cjs')) return 'javascript';
  if (p.endsWith('.ts') || p.endsWith('.tsx')) return 'typescript';
  if (p.endsWith('.json')) return 'json';
  if (p.endsWith('.md')) return 'markdown';
  if (p.endsWith('.svg')) return 'xml';
  return 'plaintext';
}

/** R2 file API URLs are not valid BrowserView targets until published/saved. */
function isR2ApiPreviewUrl(url) {
  if (!isAbsoluteHttpUrl(url)) return false;
  try {
    return new URL(url).pathname.includes('/api/r2/file');
  } catch {
    return false;
  }
}

function iamOrigin(env) {
  return String(env?.IAM_ORIGIN || 'https://inneranimalmedia.com').replace(/\/$/, '');
}

/** @param {any} env @param {string} bucket @param {string} key */
function planArtifactPreviewUrl(env, bucket, key) {
  return `${iamOrigin(env)}/api/r2/file?bucket=${encodeURIComponent(bucket)}&key=${encodeURIComponent(key)}`;
}

function isAbsoluteHttpUrl(url) {
  const u = String(url || '').trim();
  return u.startsWith('http://') || u.startsWith('https://');
}

/** True when URL is the product homepage — not a plan artifact preview target. */
function isHomepagePreviewUrl(url, env) {
  if (!isAbsoluteHttpUrl(url)) return false;
  try {
    const u = new URL(url);
    const home = new URL(`${iamOrigin(env)}/`);
    if (u.origin !== home.origin) return false;
    const path = u.pathname.replace(/\/+$/, '') || '/';
    return path === '/' || path === '';
  } catch {
    return false;
  }
}

/**
 * Write plan deliverable bytes to workspace R2 (DASHBOARD binding).
 * @returns {Promise<{ ok: boolean, bucket: string, key: string, error?: string }>}
 */
async function writePlanFileToWorkspaceR2(env, { workspaceId, planId, filePath, content }) {
  const ws = String(workspaceId || '').trim();
  const pid = String(planId || '').trim();
  if (!ws || !pid) return { ok: false, bucket: PLAN_ARTIFACT_R2_BUCKET, key: '', error: 'missing_workspace_or_plan' };
  const keyNorm = normalizeR2ObjectKey(planArtifactObjectKey(ws, pid, filePath), { workspaceId: ws });
  if (!keyNorm.ok || !keyNorm.key) {
    return { ok: false, bucket: PLAN_ARTIFACT_R2_BUCKET, key: '', error: keyNorm.error || 'invalid_key' };
  }
  const body = String(content ?? '');
  if (!body.length) return { ok: false, bucket: PLAN_ARTIFACT_R2_BUCKET, key: keyNorm.key, error: 'empty_content' };
  const binding = getR2Binding(env, PLAN_ARTIFACT_R2_BUCKET) || env.DASHBOARD;
  if (!binding?.put) {
    return { ok: false, bucket: PLAN_ARTIFACT_R2_BUCKET, key: keyNorm.key, error: 'r2_binding_unavailable' };
  }
  const ct = contentTypeForPlanFile(filePath);
  const ok = await r2PutViaBindingOrS3(env, binding, PLAN_ARTIFACT_R2_BUCKET, keyNorm.key, body, ct);
  if (!ok) return { ok: false, bucket: PLAN_ARTIFACT_R2_BUCKET, key: keyNorm.key, error: 'r2_put_failed' };
  return { ok: true, bucket: PLAN_ARTIFACT_R2_BUCKET, key: keyNorm.key };
}

/**
 * @typedef {{ path: string, bucket?: string, key?: string, previewUrl?: string, content?: string, language?: string, draft?: boolean }} PlanWrittenArtifact
 */

async function markPlanTaskSkipped(env, task, message, emit, cap) {
  const msg = String(message || 'skipped').slice(0, 4000);
  await env.DB.prepare(
    `UPDATE agentsam_plan_tasks SET status='skipped', completed_at=unixepoch(), output_summary=? WHERE id=?`,
  )
    .bind(msg, task.id)
    .run();
  emit('task_complete', {
    task_id: task.id,
    title: task.title,
    status: 'skipped',
    output: msg,
    order_index: task.order_index,
  });
  await patchPlanExecutionStep(env, task, 'success', {
    outputJson: JSON.stringify({ capability_type: cap, skipped: true, message: msg }),
  });
}

async function markPlanTaskFailed(env, task, message, emit, cap) {
  const msg = String(message || 'failed').slice(0, 4000);
  await env.DB.prepare(
    `UPDATE agentsam_plan_tasks SET status='blocked', completed_at=unixepoch(), output_summary=?, error_trace=? WHERE id=?`,
  )
    .bind(msg, msg, task.id)
    .run();
  emit('task_complete', {
    task_id: task.id,
    title: task.title,
    status: 'failed',
    error: msg,
    order_index: task.order_index,
  });
  await patchPlanExecutionStep(env, task, 'failed', {
    outputJson: JSON.stringify({ capability_type: cap, error: msg }),
    errorJson: JSON.stringify({ error: msg }),
  });
}

export async function executePlan(
  env,
  {
    planId,
    userId,
    workspaceId: workspaceIdIn,
    tenantId: tenantIdIn,
    emit,
    ctx = null,
    onlyTaskId = null,
    sessionId = null,
    skipPlanAggregate = false,
    workflowRunId = null,
  },
) {
  if (!env.DB) {
    emit('text', { text: '[Agent Sam] Database is not available; plan tasks were not executed.' });
    return;
  }

  let tenantId = tenantIdIn != null && String(tenantIdIn).trim() !== '' ? String(tenantIdIn).trim() : null;
  let workspaceId =
    workspaceIdIn != null && String(workspaceIdIn).trim() !== '' ? String(workspaceIdIn).trim() : '';

  try {
  const resolvedTw = await resolvePlanTenantWorkspace(env, { planId, tenantId, workspaceId, userId });
  tenantId = resolvedTw.tenantId;
  workspaceId = resolvedTw.workspaceId;
  if (!tenantId) {
    emit('text', {
      text: '[Agent Sam] **Tenant not resolved** for this plan. Ensure you are logged in and have a tenant on your account, or that the plan has `tenant_id` set.',
    });
    return;
  }

  const wfStarted = Date.now();
  let wfRun = workflowRunId != null && String(workflowRunId).trim() !== '' ? String(workflowRunId).trim() : null;
  if (!wfRun) {
    const pr = await env.DB
      .prepare(`SELECT workflow_run_id FROM agentsam_plans WHERE id = ? LIMIT 1`)
      .bind(planId)
      .first()
      .catch(() => null);
    if (pr?.workflow_run_id != null && String(pr.workflow_run_id).trim() !== '') {
      wfRun = String(pr.workflow_run_id).trim();
    }
  }

  let taskSql = `SELECT * FROM agentsam_plan_tasks
    WHERE plan_id = ? AND status IN ('todo','in_progress')
    ORDER BY order_index ASC`;
  const binds = [planId];
  if (onlyTaskId != null && String(onlyTaskId).trim() !== '') {
    taskSql = `SELECT * FROM agentsam_plan_tasks
    WHERE plan_id = ? AND id = ? AND status IN ('todo','in_progress','skipped')
    ORDER BY order_index ASC LIMIT 1`;
    binds.push(String(onlyTaskId).trim());
  }

  const { results: tasks } = await env.DB.prepare(taskSql).bind(...binds).all();

  if (!tasks || tasks.length === 0) {
    emit('text', { text: onlyTaskId ? '[Agent Sam] No runnable plan task found for resume.' : '[Agent Sam] No pending plan tasks.' });
    return;
  }

  let completed = 0;
  let failed = 0;
  let skipped = 0;
  /** @type {PlanWrittenArtifact[]} */
  const planWrittenArtifacts = [];

  for (const task of tasks || []) {
    const capForStart = resolvePlanTaskCapabilityType(task);
    emit('task_start', {
      task_id: task.id,
      title: task.title,
      description: task.description,
      order_index: task.order_index,
      handler_type: task.handler_type,
      capability_type: capForStart,
      execution_step_id: task.execution_step_id,
      command_run_id: task.command_run_id,
      total_tasks: tasks.length,
    });

    await env.DB
      .prepare(`UPDATE agentsam_plan_tasks SET status='in_progress', started_at=unixepoch() WHERE id=?`)
      .bind(task.id)
      .run();

    await patchPlanExecutionStep(env, task, 'running', { skipCompleted: true });

    let output = null;
    let ok = true;

    const cap = resolvePlanTaskCapabilityType(task);
    const isPlaywrightScript = task.handler_type === 'script' && cap === 'playwright_validation';
    const terminalLike = task.handler_type === 'terminal' || isPlaywrightScript;

    try {
      if (cap === 'browser_capture') {
        if (!planWrittenArtifacts.length) {
          skipped++;
          await markPlanTaskSkipped(
            env,
            task,
            'Generated files are ready in the code editor. Browser preview was skipped because no saved preview URL exists yet.',
            emit,
            cap,
          );
          continue;
        }

        const urlMatch = String(task.description || '').match(/https?:\/\/[^\s"'<>)]+/i);
        let previewUrl = urlMatch ? urlMatch[0].replace(/[.,;]+$/, '') : '';
        if (!isAbsoluteHttpUrl(previewUrl)) {
          const htmlArt =
            planWrittenArtifacts.find((a) => /\.html?$/i.test(a.path)) || planWrittenArtifacts[0];
          previewUrl = htmlArt?.previewUrl || '';
        }
        if (!isAbsoluteHttpUrl(previewUrl)) {
          skipped++;
          await markPlanTaskSkipped(
            env,
            task,
            'Generated files are ready in the code editor. Browser preview was skipped because no saved preview URL exists yet.',
            emit,
            cap,
          );
          continue;
        }
        if (isR2ApiPreviewUrl(previewUrl)) {
          skipped++;
          await markPlanTaskSkipped(
            env,
            task,
            'Generated files are ready in the code editor. Browser preview was skipped — save or publish for a preview URL.',
            emit,
            cap,
          );
          continue;
        }
        if (isHomepagePreviewUrl(previewUrl, env)) {
          skipped++;
          await markPlanTaskSkipped(
            env,
            task,
            'Preview skipped — homepage is not a valid artifact target. Open files in the code editor.',
            emit,
            cap,
          );
          continue;
        }
        if (!wfRun) {
          skipped++;
          await markPlanTaskSkipped(
            env,
            task,
            'No deployable preview URL — workflow run missing. Open files in the code editor.',
            emit,
            cap,
          );
          continue;
        }

        emit('surface_open', { surface: 'browser', reason: 'plan_task_browser_capture', url: previewUrl });
        emit('agent_surface_open', { surface: 'browser', reason: 'plan_task_browser_capture', url: previewUrl });
        const { runBrowserCapabilityAction } = await import('./workspace-capability-actions/browser.js');
        const br = await runBrowserCapabilityAction({
          env,
          runId: wfRun,
          tenantId,
          workspaceId: workspaceId || '',
          userId: userId || '',
          message: `${task.title}\n${task.description || ''}`,
          browserContext: { url: previewUrl },
          emit,
        });
        const bout = br?.output && typeof br.output === 'object' ? br.output : {};
        const screenshotUrl =
          bout.screenshot_url != null
            ? String(bout.screenshot_url)
            : bout.screenshot?.screenshot_url != null
              ? String(bout.screenshot.screenshot_url)
              : null;
        const domSummary =
          typeof bout.content_excerpt === 'string'
            ? bout.content_excerpt.slice(0, 12000)
            : typeof bout.title === 'string'
              ? bout.title.slice(0, 2000)
              : null;
        const consoleErrors = Array.isArray(bout.console_errors)
          ? bout.console_errors
          : Array.isArray(bout.console)
            ? bout.console
            : [];
        const summaryText = br?.ok
          ? `[browser_capture] ${previewUrl}\nScreenshot: ${screenshotUrl || 'n/a'}\nDOM excerpt length: ${domSummary ? domSummary.length : 0}`
          : `[browser_capture] failed: ${String(br?.error || 'unknown')}`;
        await env.DB
          .prepare(
            `UPDATE agentsam_plan_tasks SET status=?, completed_at=unixepoch(), output_summary=? WHERE id=?`,
          )
          .bind(br?.ok ? 'done' : 'blocked', String(summaryText).slice(0, 4000), task.id)
          .run();
        if (br?.ok) {
          completed++;
          emit('task_complete', {
            task_id: task.id,
            title: task.title,
            status: 'done',
            output: String(summaryText).slice(0, 2000),
            order_index: task.order_index,
          });
          await patchPlanExecutionStep(env, task, 'success', {
            outputJson: JSON.stringify({
              capability_type: cap,
              screenshot_url: screenshotUrl,
              dom_summary: domSummary,
              console_errors: consoleErrors,
              artifact_pointer: screenshotUrl,
              url: previewUrl,
            }),
            latencyMs: null,
          });
        } else {
          failed++;
          emit('task_complete', {
            task_id: task.id,
            title: task.title,
            status: 'failed',
            error: String(br?.error || 'browser_capture_failed').slice(0, 2000),
            order_index: task.order_index,
          });
          await patchPlanExecutionStep(env, task, 'failed', {
            outputJson: JSON.stringify({ capability_type: cap, error: String(br?.error || '') }),
            errorJson: JSON.stringify({ error: String(br?.error || '') }),
          });
        }
        continue;
      }

      if (cap === 'excalidraw_diagram') {
        if (!wfRun) {
          skipped++;
          emit('task_complete', {
            task_id: task.id,
            title: task.title,
            status: 'skipped',
            output: '[excalidraw_diagram] workflow_run_id missing',
            order_index: task.order_index,
          });
          continue;
        }
        emit('surface_open', { surface: 'excalidraw', reason: 'plan_task_excalidraw_diagram' });
        emit('agent_surface_open', { surface: 'excalidraw', reason: 'plan_task_excalidraw_diagram' });
        const { runExcalidrawCapabilityAction } = await import('./workspace-capability-actions/excalidraw.js');
        const xr = await runExcalidrawCapabilityAction({
          env,
          runId: wfRun,
          tenantId,
          workspaceId: workspaceId || '',
          userId: userId || '',
          message: `${task.title}\n${task.description || ''}`,
          emit,
        });
        const scene = xr?.output?.scene ?? null;
        const summaryText = xr?.ok
          ? `[excalidraw_diagram] scene elements: ${scene?.elements?.length ?? 0}`
          : `[excalidraw_diagram] failed: ${String(xr?.error || 'unknown')}`;
        await env.DB
          .prepare(
            `UPDATE agentsam_plan_tasks SET status=?, completed_at=unixepoch(), output_summary=? WHERE id=?`,
          )
          .bind(xr?.ok ? 'done' : 'blocked', String(summaryText).slice(0, 4000), task.id)
          .run();
        if (xr?.ok) {
          completed++;
          emit('task_complete', {
            task_id: task.id,
            title: task.title,
            status: 'done',
            output: String(summaryText).slice(0, 2000),
            order_index: task.order_index,
          });
          await patchPlanExecutionStep(env, task, 'success', {
            outputJson: JSON.stringify({
              capability_type: cap,
              diagram_json: scene,
              artifact_pointer: scene ? 'inline:excalidraw_scene' : null,
            }),
          });
        } else {
          failed++;
          emit('task_complete', {
            task_id: task.id,
            title: task.title,
            status: 'failed',
            error: String(xr?.error || '').slice(0, 2000),
            order_index: task.order_index,
          });
          await patchPlanExecutionStep(env, task, 'failed', {
            outputJson: JSON.stringify({ capability_type: cap, error: String(xr?.error || '') }),
            errorJson: JSON.stringify({ error: String(xr?.error || '') }),
          });
        }
        continue;
      }

      if (
        cap === 'monaco_edit' &&
        (task.handler_type === 'agent' ||
          !task.handler_type ||
          (task.handler_type === 'mcp_tool' && String(task.handler_key || '').startsWith('cap:')))
      ) {
        emit('surface_open', { surface: 'code', reason: 'plan_task_monaco_edit' });
        emit('agent_surface_open', { surface: 'code', reason: 'plan_task_monaco_edit' });

        let mergedFiles = [];
        try {
          const existing = JSON.parse(String(task.files_involved || '[]'));
          if (Array.isArray(existing)) {
            mergedFiles = existing.map((x) => String(x).trim()).filter(Boolean);
          }
        } catch {
          /* ignore */
        }
        if (!mergedFiles.length) {
          failed++;
          await markPlanTaskFailed(env, task, 'monaco_edit: no files_involved paths to write', emit, cap);
          continue;
        }

        const fileGenSys = `You are Agent Sam implementing files for a plan task.
Return ONLY valid JSON (no markdown fences):
{"patch_summary":"one short paragraph","files":[{"path":"relative/path.ext","content":"full file body as a string"}]}
Rules:
- Include every path listed in files_involved with complete, production-ready content.
- path must be a simple filename or relative path (no .. segments).
- content must be the entire file (not a diff).`;
        const resolved = await resolveTaskExecutorModelKey(env, workspaceId);
        const modelKey = resolved.model_key;
        const llmStartedAt = new Date().toISOString();
        const genResult = await dispatchComplete(env, {
          modelKey,
          taskType: 'agent',
          systemPrompt: fileGenSys,
          messages: [
            {
              role: 'user',
              content: `Task: ${task.title}\nfiles_involved: ${JSON.stringify(mergedFiles)}\n\n${task.description || ''}`,
            },
          ],
          options: { reasoningEffort: 'medium', verbosity: 'low' },
        });
        try {
          if (resolved?.routing_arm_id && agentApiModule?.recordArmOutcome) {
            await agentApiModule.recordArmOutcome(
              env, ctx, resolved.routing_arm_id, genResult?.ok ?? true,
              { model_key: resolved.model_key }
            );
          }
        } catch (_) {}
        scheduleCodexTaskCompletionMetrics(env, ctx, {
          userId,
          workspaceId,
          tenantId,
          modelKey,
          result: genResult,
          startedAt: llmStartedAt,
        });
        const genRaw = genResult?.text || genResult?.output_text || '';
        let parsedGen = null;
        try {
          parsedGen = JSON.parse(genRaw.replace(/```json|```/g, '').trim());
        } catch {
          parsedGen = { patch_summary: genRaw.slice(0, 2000), files: [] };
        }
        const generatedByPath = new Map();
        if (Array.isArray(parsedGen?.files)) {
          for (const f of parsedGen.files) {
            const p = f?.path != null ? String(f.path).trim() : '';
            const c = f?.content != null ? String(f.content) : '';
            if (p && c) generatedByPath.set(p, c);
          }
        }

        const editorFiles = [];
        for (const relPath of mergedFiles) {
          const content =
            generatedByPath.get(relPath) ||
            generatedByPath.get(relPath.split('/').pop() || '') ||
            '';
          if (!content) {
            failed++;
            await markPlanTaskFailed(env, task, `Generation failed: ${relPath} (no generated content)`, emit, cap);
            editorFiles.length = 0;
            break;
          }
          const filename = relPath.split('/').pop() || relPath;
          editorFiles.push({
            filename,
            path: relPath,
            language: languageForPlanFile(relPath),
            content,
          });
        }

        if (!editorFiles.length) {
          continue;
        }

        const monacoPayload = {
          type: 'monaco_files_generated',
          surface: 'monaco',
          plan_id: planId,
          task_id: task.id,
          workflow_run_id: wfRun || null,
          files: editorFiles,
        };
        emit('monaco_files_generated', monacoPayload);
        for (const f of editorFiles) {
          emit('monaco_file_generated', {
            type: 'monaco_file_generated',
            surface: 'monaco',
            filename: f.filename,
            path: f.path,
            language: f.language,
            content: f.content,
            plan_id: planId,
            task_id: task.id,
            workflow_run_id: wfRun || null,
          });
        }

        for (const f of editorFiles) {
          planWrittenArtifacts.push({
            path: f.path,
            content: f.content,
            language: f.language,
            draft: true,
          });
        }
        await env.DB
          .prepare(`UPDATE agentsam_plan_tasks SET files_involved = ? WHERE id = ?`)
          .bind(JSON.stringify(mergedFiles), task.id)
          .run()
          .catch(() => {});

        const summary = String(
          parsedGen?.patch_summary ||
            `Generated ${editorFiles.length} file(s) in the code editor (unsaved draft).`,
        ).slice(0, 4000);
        output = summary;
        await env.DB
          .prepare(
            `UPDATE agentsam_plan_tasks SET status='done', completed_at=unixepoch(), output_summary=? WHERE id=?`,
          )
          .bind(summary, task.id)
          .run();
        completed++;
        emit('task_complete', {
          task_id: task.id,
          title: task.title,
          status: 'done',
          output: summary.slice(0, 2000),
          order_index: task.order_index,
        });
        await patchPlanExecutionStep(env, task, 'success', {
          outputJson: JSON.stringify({
            capability_type: cap,
            storage: 'editor_draft',
            files_generated: editorFiles.map((f) => ({
              path: f.path,
              language: f.language,
              bytes: f.content.length,
            })),
            patch_summary: summary,
          }),
        });
        continue;
      }

      if (task.handler_type === 'agent' || !task.handler_type) {
        const resolved = await resolveTaskExecutorModelKey(env, workspaceId);
        const modelKey = resolved.model_key;
        const llmStartedAt = new Date().toISOString();
        const result = await dispatchComplete(env, {
          modelKey,
          taskType: 'agent',
          systemPrompt: TASK_AGENT_SYSTEM,
          messages: [
            {
              role: 'user',
              content: `Task: ${task.title}\n\n${task.description || ''}`,
            },
          ],
          options: { reasoningEffort: 'medium', verbosity: 'low' },
        });
        try {
          if (resolved?.routing_arm_id && agentApiModule?.recordArmOutcome) {
            await agentApiModule.recordArmOutcome(
              env, ctx, resolved.routing_arm_id, result?.ok ?? true,
              { model_key: resolved.model_key }
            );
          }
        } catch (_) {}
        scheduleCodexTaskCompletionMetrics(env, ctx, {
          userId,
          workspaceId,
          tenantId,
          modelKey,
          result,
          startedAt: llmStartedAt,
        });
        output = result?.text || result?.output_text || '';
      } else if (terminalLike) {
        const cmd = shellCommandForTerminalTask(task).trim();

        const stubCtx =
          ctx && typeof ctx.waitUntil === 'function'
            ? ctx
            : { waitUntil: (fn) => void Promise.resolve(typeof fn === 'function' ? fn() : fn).catch(() => {}) };

        const authz = await authorizePlanTerminalExecution(env, ctx, {
          task,
          planId,
          userId,
          workspaceId,
          tenantId,
          sessionId: sessionId || null,
        });

        if (authz.allowed && !cmd) {
          output =
            '[terminal] NOT EXECUTED: put the shell command in the task description when handler_key is an agentsam_commands id (cmd:… prefix).';
          await env.DB
            .prepare(
              `UPDATE agentsam_plan_tasks
        SET status='skipped', completed_at=unixepoch(), output_summary=?
        WHERE id=?`,
            )
            .bind(String(output || '').slice(0, 4000), task.id)
            .run();
          skipped++;
          emit('task_complete', {
            task_id: task.id,
            title: task.title,
            status: 'skipped',
            output: String(output || '').slice(0, 2000),
            order_index: task.order_index,
          });
          continue;
        }

        if (!authz.allowed) {
          if (cmd && (authz.reason === 'no_gate' || authz.reason === 'command_not_found')) {
            const prop = await ensurePlanTerminalApprovalProposal(env, {
              task,
              planId,
              userId,
              workspaceId,
              tenantId,
              sessionId,
              cmd,
              emit,
            });
            if (prop?.ok) {
              skipped++;
              await env.DB
                .prepare(
                  `UPDATE agentsam_plan_tasks SET status='todo', started_at=NULL, completed_at=NULL,
                   output_summary = CASE WHEN trim(coalesce(output_summary,'')) = '' THEN ? ELSE output_summary END WHERE id=?`,
                )
                .bind('[terminal] Awaiting explicit approval — use Allow, then resume this task.', task.id)
                .run()
                .catch(() => {});
              await patchPlanExecutionStep(env, task, 'approval_pending', { skipCompleted: true });
              emit('task_complete', {
                task_id: task.id,
                title: task.title,
                status: 'skipped',
                output:
                  '[terminal] Approval required — click **Allow** on the card, then confirm execution resumes for this task.',
                order_index: task.order_index,
              });
              continue;
            }
          }

          if (authz.reason === 'pending_approval' && authz.approval_id) {
            const pre = authz.command_preview || cmd.slice(0, 2000);
            const cr = authz.command_run_id != null ? String(authz.command_run_id).trim() : '';
            if (cr) {
              await env.DB
                .prepare(
                  `UPDATE agentsam_plan_tasks SET command_run_id = COALESCE(?, command_run_id), output_summary = ?, status = 'skipped', completed_at = unixepoch() WHERE id = ?`,
                )
                .bind(
                  cr,
                  '[terminal] Catalog command awaiting explicit approval — click Allow, then use resume for this task.',
                  task.id,
                )
                .run();
            } else {
              await env.DB
                .prepare(
                  `UPDATE agentsam_plan_tasks SET output_summary = ?, status = 'skipped', completed_at = unixepoch() WHERE id = ?`,
                )
                .bind(authz.userMessage || '[terminal] Awaiting approval.', task.id)
                .run();
            }
            skipped++;
            emit('approval_required', {
              task_id: task.id,
              command_run_id: cr || undefined,
              approval_id: authz.approval_id,
              title: String(task.title || 'Terminal'),
              command_preview: pre,
              risk_level: 'medium',
              action_summary: 'Approve catalog-linked terminal command before execution.',
              plan_id: planId,
              workflow_run_id: wfRun || undefined,
              execution_step_id: task.execution_step_id != null ? String(task.execution_step_id) : undefined,
            });
            emit('task_complete', {
              task_id: task.id,
              title: task.title,
              status: 'skipped',
              output: authz.userMessage || '[terminal] Awaiting approval.',
              order_index: task.order_index,
            });
            continue;
          }

          output = authz.userMessage || `[terminal] NOT EXECUTED (${authz.reason || 'denied'})`;
          await env.DB
            .prepare(
              `UPDATE agentsam_plan_tasks
        SET status='skipped', completed_at=unixepoch(), output_summary=?
        WHERE id=?`,
            )
            .bind(String(output || '').slice(0, 4000), task.id)
            .run();
          skipped++;
          emit('task_complete', {
            task_id: task.id,
            title: task.title,
            status: 'skipped',
            output: String(output || '').slice(0, 2000),
            order_index: task.order_index,
          });
          continue;
        }

        const t0 = Date.now();
        const http = await runTerminalCommandViaHttpExec(env, cmd);
        const durationMs = Math.max(0, Date.now() - t0);

        const commandRunIdForTelemetry =
          (authz.command_run_id != null && String(authz.command_run_id).trim()) ||
          (task.command_run_id != null && String(task.command_run_id).trim()) ||
          '';
        if (commandRunIdForTelemetry) {
          try {
            if (http?.ok) {
              await env.DB
                .prepare(
                  `UPDATE agentsam_command_run SET approval_status = 'approved', success = 1, exit_code = 0, duration_ms = ?, output_text = ?, error_message = NULL WHERE id = ?`,
                )
                .bind(durationMs, String(http.text || '').slice(0, 50000), commandRunIdForTelemetry)
                .run();
            } else {
              await env.DB
                .prepare(
                  `UPDATE agentsam_command_run SET approval_status = 'approved', success = 0, exit_code = COALESCE(exit_code, 1), duration_ms = ?, error_message = ? WHERE id = ?`,
                )
                .bind(durationMs, 'terminal_http_exec_failed', commandRunIdForTelemetry)
                .run();
            }
          } catch (_) {}
        }

        if (authz.chain_id) {
          await completeCommand(env, stubCtx, {
            chainId: authz.chain_id,
            commandId: authz.commandId,
            agentRunId: authz.agent_run_id ?? null,
            success: !!http?.ok,
            durationMs,
            outputSummary: http?.ok ? String(http.text || '').slice(0, 8000) : null,
            errorMessage: http?.ok ? null : 'terminal_http_exec_failed',
            taskType: 'agent',
            modelKey: authz.modelKey,
            provider: authz.provider,
          });
        }

        if (!http?.ok) {
          failed++;
          output = `[terminal] Authorized but execution failed (HTTP exec / PTY bridge). Command: ${cmd.slice(0, 400)}`;
          await env.DB
            .prepare(
              `UPDATE agentsam_plan_tasks
        SET status='blocked', error_trace=?, completed_at=unixepoch()
        WHERE id=?`,
            )
            .bind(String(output || '').slice(0, 2000), task.id)
            .run();
          emit('task_complete', {
            task_id: task.id,
            title: task.title,
            status: 'failed',
            error: String(output || '').slice(0, 2000),
            order_index: task.order_index,
          });
          await patchPlanExecutionStep(env, task, 'failed', {
            outputJson: JSON.stringify({ error: String(output || '').slice(0, 2000) }),
          });
          continue;
        }

        output = `[terminal] executed (${authz.via || 'authorized'})\n${String(http.text || '').slice(0, 3500)}`;
        await env.DB
          .prepare(
            `UPDATE agentsam_plan_tasks
        SET status='done', completed_at=unixepoch(), output_summary=?
        WHERE id=?`,
          )
          .bind(String(output || '').slice(0, 4000), task.id)
          .run();
        completed++;
        emit('task_complete', {
          task_id: task.id,
          title: task.title,
          status: 'done',
          output: String(output || '').slice(0, 2000),
          order_index: task.order_index,
        });
        await patchPlanExecutionStep(env, task, 'success', {
          outputJson: JSON.stringify({
            terminal: true,
            preview: String(http.text || '').slice(0, 4000),
          }),
          latencyMs: durationMs,
        });
        continue;
      } else if (task.handler_type === 'db_query') {
        const crDb = task.command_run_id != null ? String(task.command_run_id).trim() : '';
        const esDb = task.execution_step_id != null ? String(task.execution_step_id).trim() : '';
        if (crDb && esDb) {
          const okApr = await isCommandRunApprovedForTerminal(env, crDb, task);
          if (!okApr) {
            skipped++;
            const qDb = await env.DB
              .prepare(
                `SELECT id FROM agentsam_approval_queue WHERE command_run_id = ? AND lower(status) = 'pending' LIMIT 1`,
              )
              .bind(crDb)
              .first()
              .catch(() => null);
            await env.DB
              .prepare(
                `UPDATE agentsam_plan_tasks SET status='todo', output_summary = ? WHERE id = ?`,
              )
              .bind('[db_query] Awaiting approval for linked command_run before execution.', task.id)
              .run();
            emit('approval_required', {
              task_id: task.id,
              command_run_id: crDb,
              approval_id: qDb?.id != null ? String(qDb.id) : undefined,
              title: String(task.title || 'Database'),
              command_preview: String(task.description || '').slice(0, 2000),
              risk_level: 'high',
              action_summary: 'Approve risky db_query plan task before execution.',
              plan_id: planId,
              workflow_run_id: wfRun || undefined,
              execution_step_id: task.execution_step_id != null ? String(task.execution_step_id) : undefined,
            });
            emit('task_complete', {
              task_id: task.id,
              title: task.title,
              status: 'skipped',
              output: '[db_query] Awaiting approval — click **Allow**, then resume this task.',
              order_index: task.order_index,
            });
            await patchPlanExecutionStep(env, task, 'approval_pending', { skipCompleted: true });
            continue;
          }
        }
        const resolved = await resolveTaskExecutorModelKey(env, workspaceId);
        const modelKey = resolved.model_key;
        const llmStartedAt = new Date().toISOString();
        const result = await dispatchComplete(env, {
          modelKey,
          systemPrompt:
            'You are a D1 database assistant. Describe what query you would run and what it returns.',
          messages: [{ role: 'user', content: task.description || task.title }],
          options: { reasoningEffort: 'low', verbosity: 'low' },
        });
        try {
          if (resolved?.routing_arm_id && agentApiModule?.recordArmOutcome) {
            await agentApiModule.recordArmOutcome(
              env, ctx, resolved.routing_arm_id, result?.ok ?? true,
              { model_key: resolved.model_key }
            );
          }
        } catch (_) {}
        scheduleCodexTaskCompletionMetrics(env, ctx, {
          userId,
          workspaceId,
          tenantId,
          modelKey,
          result,
          startedAt: llmStartedAt,
        });
        output = result?.text || result?.output_text || '';
      } else if (task.handler_type === 'mcp_tool') {
        const wk = String(task.handler_key || '').trim();
        if (wk && !wk.startsWith('cap:')) {
          const { executeWorkflowGraph } = await import('./workflow-executor.js');
          const wResult = await executeWorkflowGraph(env, {
            workflowKey: wk,
            input: { message: task.description || task.title },
            tenantId,
            workspaceId: workspaceId || '',
            userId,
            triggerType: 'agent',
          });
          output = wResult?.ok
            ? JSON.stringify(
                wResult.step_results?.length
                  ? wResult.step_results[wResult.step_results.length - 1]?.output ?? wResult.step_results
                  : {},
              )
            : `Workflow failed: ${wResult?.error ?? wResult?.kill_reason ?? 'unknown'}`;
          ok = !!wResult?.ok;
        } else {
          const resolved = await resolveTaskExecutorModelKey(env, workspaceId);
          const modelKey = resolved.model_key;
          const llmStartedAt = new Date().toISOString();
          const result = await dispatchComplete(env, {
            modelKey,
            systemPrompt: TASK_AGENT_SYSTEM,
            messages: [{ role: 'user', content: task.description || task.title }],
            options: { reasoningEffort: 'low' },
          });
          try {
            if (resolved?.routing_arm_id && agentApiModule?.recordArmOutcome) {
              await agentApiModule.recordArmOutcome(
                env, ctx, resolved.routing_arm_id, result?.ok ?? true,
                { model_key: resolved.model_key }
              );
            }
          } catch (_) {}
          scheduleCodexTaskCompletionMetrics(env, ctx, {
            userId,
            workspaceId,
            tenantId,
            modelKey,
            result,
            startedAt: llmStartedAt,
          });
          output = result?.text || result?.output_text || '';
        }
      } else {
        const resolved = await resolveTaskExecutorModelKey(env, workspaceId);
        const modelKey = resolved.model_key;
        const llmStartedAt = new Date().toISOString();
        const result = await dispatchComplete(env, {
          modelKey,
          systemPrompt: TASK_AGENT_SYSTEM,
          messages: [{ role: 'user', content: task.description || task.title }],
          options: { reasoningEffort: 'low' },
        });
        try {
          if (resolved?.routing_arm_id && agentApiModule?.recordArmOutcome) {
            await agentApiModule.recordArmOutcome(
              env, ctx, resolved.routing_arm_id, result?.ok ?? true,
              { model_key: resolved.model_key }
            );
          }
        } catch (_) {}
        scheduleCodexTaskCompletionMetrics(env, ctx, {
          userId,
          workspaceId,
          tenantId,
          modelKey,
          result,
          startedAt: llmStartedAt,
        });
        output = result?.text || result?.output_text || '';
      }

      if (ok) {
        await env.DB
          .prepare(
            `UPDATE agentsam_plan_tasks
        SET status='done', completed_at=unixepoch(), output_summary=?
        WHERE id=?`,
          )
          .bind(String(output || '').slice(0, 4000), task.id)
          .run();

        completed++;
        emit('task_complete', {
          task_id: task.id,
          title: task.title,
          status: 'done',
          output: String(output || '').slice(0, 2000),
          order_index: task.order_index,
        });
        await patchPlanExecutionStep(env, task, 'success', {
          outputJson: JSON.stringify({ summary: String(output || '').slice(0, 4000) }),
        });
      } else {
        failed++;
        const errMsg = String(output || 'workflow failed').slice(0, 2000);
        await env.DB
          .prepare(
            `UPDATE agentsam_plan_tasks
        SET status='blocked', error_trace=?, completed_at=unixepoch()
        WHERE id=?`,
          )
          .bind(errMsg, task.id)
          .run();

        emit('task_complete', {
          task_id: task.id,
          title: task.title,
          status: 'failed',
          error: errMsg,
          order_index: task.order_index,
        });
        await patchPlanExecutionStep(env, task, 'failed', {
          outputJson: JSON.stringify({ error: errMsg }),
        });
      }
    } catch (e) {
      failed++;
      const errMsg = e?.message ?? String(e);
      await env.DB
        .prepare(
          `UPDATE agentsam_plan_tasks
        SET status='blocked', error_trace=?, completed_at=unixepoch()
        WHERE id=?`,
        )
        .bind(errMsg.slice(0, 2000), task.id)
        .run();

      emit('task_complete', {
        task_id: task.id,
        title: task.title,
        status: 'failed',
        error: errMsg,
        order_index: task.order_index,
      });
      await patchPlanExecutionStep(env, task, 'failed', {
        outputJson: JSON.stringify({ error: errMsg }),
      });
    }
  }

  if (!skipPlanAggregate) {
    await env.DB
      .prepare(
        `UPDATE agentsam_plans
    SET tasks_done=?,
        tasks_blocked = COALESCE(tasks_blocked, 0) + ?,
        status=CASE WHEN ?=0 THEN 'complete' ELSE 'active' END,
        updated_at=unixepoch()
    WHERE id=?`,
      )
      .bind(completed, skipped, failed, planId)
      .run();

    if (wfRun) {
      const dur = Math.max(0, Date.now() - wfStarted);
      const summary = JSON.stringify({ completed, failed, skipped, plan_id: planId });
      const outJ = JSON.stringify({
        plan_id: planId,
        tasks_completed: completed,
        tasks_failed: failed,
        tasks_skipped: skipped,
      });
      await env.DB
        .prepare(
          `UPDATE agentsam_workflow_runs SET status = ?, duration_ms = ?, steps_completed = ?,
           step_results_json = ?, output_json = ?, completed_at = unixepoch(), updated_at = datetime('now')
           WHERE id = ?`,
        )
        .bind('completed', dur, completed, summary, outJ, wfRun)
        .run()
        .catch(() => {});
      emit('workflow_complete', {
        workflow_run_id: wfRun,
        plan_id: planId,
        tasks_completed: completed,
        tasks_failed: failed,
        tasks_skipped: skipped,
        status: failed === 0 ? 'completed' : 'partial',
      });
      scheduleMirrorAgentChatPlanToSupabase(env, ctx, wfRun);
    }

    emit('plan_complete', {
      plan_id: planId,
      tasks_completed: completed,
      tasks_failed: failed,
      tasks_skipped: skipped,
      status: failed === 0 ? 'complete' : 'partial',
    });
  } else {
    emit('plan_task_resume_complete', {
      plan_id: planId,
      task_id: onlyTaskId,
      tasks_completed: completed,
      tasks_failed: failed,
      tasks_skipped: skipped,
      status: failed === 0 ? 'ok' : 'partial',
    });
  }
  } finally {
    scheduleMirrorAgentsamPlanToSupabasePublic(env, ctx, planId);
  }
}
