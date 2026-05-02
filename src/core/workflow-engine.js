/**
 * Canonical Workflow Execution Layer
 *
 * Tables (D1):
 *   - agentsam_mcp_workflows
 *   - agentsam_workflow_runs
 *   - agentsam_approval_queue
 *
 * This module intentionally contains all workflow execution logic.
 * HTTP routes and cron dispatchers should be "thin" and call into these exports.
 */

import { dispatchToolCall } from '../tools/builtin/index.js';
import { sendEmail } from '../integrations/resend.js';

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute a workflow (or enqueue for approval).
 *
 * @param {object} env
 * @param {string} workflowId
 * @param {object} input
 * @param {string} triggeredBy
 */
export async function executeWorkflow(env, workflowId, input = {}, triggeredBy = 'manual') {
  if (!env?.DB) throw new Error('DB not configured');
  if (!workflowId) throw new Error('workflow_id_required');

  const startedAtMs = Date.now();
  const workflow = await getWorkflow(env, workflowId);
  if (!workflow) throw new Error('workflow_not_found');

  // 2) Concurrency check
  const maxConc = Number(workflow.max_concurrent_runs ?? 1);
  if (maxConc === 1) {
    const running = await env.DB.prepare(
      `SELECT id FROM agentsam_workflow_runs
       WHERE workflow_id = ? AND status = 'running'
       ORDER BY started_at DESC LIMIT 1`
    ).bind(workflow.id).first().catch(() => null);
    if (running?.id) throw new Error('workflow_already_running');
  }

  const skipApproval = String(triggeredBy || '').toLowerCase() === 'approval';

  // 3) Approval queue
  if (!skipApproval && Number(workflow.requires_approval ?? 0) === 1) {
    const approvalId = 'appr_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    const payload = {
      workflow_id: workflow.id,
      workflow_key: workflow.workflow_key ?? null,
      input: input ?? {},
      triggered_by: triggeredBy || 'manual',
    };

    await env.DB.prepare(
      `INSERT INTO agentsam_approval_queue
         (id, tenant_id, user_id, tool_name, action_summary, risk_level, input_json, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`
    ).bind(
      approvalId,
      workflow.tenant_id ?? env.TENANT_ID ?? 'tenant_sam_primeaux',
      String(triggeredBy || 'system').slice(0, 200),
      'workflow_execute',
      `Execute workflow: ${workflow.workflow_key || workflow.id}`.slice(0, 400),
      String(workflow.risk_level || 'medium').slice(0, 20),
      JSON.stringify(payload)
    ).run();

    return { status: 'pending_approval', approval_id: approvalId };
  }

  // 4) Create run
  const runId = 'wfr_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const workspaceId = workflow.workspace_id ?? workflow.workspaceId ?? null;
  const environment = workflow.environment ?? env.DEPLOY_ENV ?? 'unknown';
  const steps = safeParseJsonArray(workflow.steps_json);
  const triggerType = workflow.trigger_type ?? 'manual';
  const tenantId = workflow.tenant_id ?? env.TENANT_ID ?? 'tenant_sam_primeaux';

  await env.DB.prepare(
    `INSERT INTO agentsam_workflow_runs
       (id, workflow_id, tenant_id, user_id, session_id, trigger_type, status,
        input_json, output_json, steps_completed, steps_total, cost_usd,
        workspace_id, step_results_json, environment, retry_count)
     VALUES (?, ?, ?, ?, ?, ?, 'running',
             ?, '{}', 0, ?, 0,
             ?, '[]', ?, 0)`
  ).bind(
    runId,
    workflow.id,
    tenantId,
    String(triggeredBy || 'workflow').slice(0, 200),
    null,
    String(triggerType || 'manual').slice(0, 40),
    JSON.stringify(input ?? {}),
    steps.length,
    workspaceId,
    String(environment || 'unknown').slice(0, 40)
  ).run();

  let stepResults = [];
  let costUsd = 0;

  try {
    // 5) Execute steps
    const retryPolicy = safeParseJsonObj(workflow.retry_policy_json);
    const onFailure = safeParseJsonObj(workflow.on_failure_json);

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i] || {};
      const stepIndex = Number(step.step ?? (i + 1));
      const action = String(step.action || '').toLowerCase();
      const stepStarted = Date.now();

      const runContext = {
        sessionId: `wf:${runId}`,
        tenantId: workspaceId || env.TENANT_ID || 'system',
        userId: 'workflow',
        agentId: 'workflow-engine',
        role: 'superadmin',
      };

      const baseStepInput = {
        workflow_id: workflow.id,
        workflow_key: workflow.workflow_key ?? null,
        run_id: runId,
        step: stepIndex,
        input: input ?? {},
        prior_results: stepResults,
      };

      const result = await runStepWithRetry({
        env,
        workflow,
        step,
        action,
        baseStepInput,
        runContext,
        retryPolicy,
        onFailure,
      });

      const durationMs = Date.now() - stepStarted;
      const entry = {
        step: stepIndex,
        action: step.action || action || 'unknown',
        ok: !result?.error,
        result,
        duration_ms: durationMs,
        at: new Date().toISOString(),
      };

      stepResults.push(entry);
      costUsd += Number(result?.cost_usd ?? 0) || 0;

      await updateRunProgress(env, runId, stepResults, {
        steps_completed: stepResults.length,
      });
    }

    // 7) Completion
    const durationMs = Date.now() - startedAtMs;
    const completedAt = Math.floor(Date.now() / 1000);

    await env.DB.prepare(
      `UPDATE agentsam_workflow_runs
       SET status='completed',
           completed_at=?,
           duration_ms=?,
           cost_usd=?,
           step_results_json=?,
           output_json=?
       WHERE id=?`
    ).bind(
      completedAt,
      durationMs,
      costUsd,
      JSON.stringify(stepResults),
      JSON.stringify({ ok: true }),
      runId
    ).run();

    await updateWorkflowStats(env, workflow.id, {
      status: 'success',
      durationMs,
      error: null,
    });

    return {
      run_id: runId,
      status: 'completed',
      duration_ms: durationMs,
      step_results: stepResults,
      cost_usd: costUsd,
    };
  } catch (err) {
    // 8) Unhandled error
    const msg = String(err?.message ?? err);
    const failedAt = Math.floor(Date.now() / 1000);
    const durationMs = Date.now() - startedAtMs;

    await env.DB.prepare(
      `UPDATE agentsam_workflow_runs
       SET status='failed',
           error_message=?,
           completed_at=?,
           duration_ms=?,
           cost_usd=?,
           step_results_json=?,
           output_json=?
       WHERE id=?`
    ).bind(
      msg.slice(0, 2000),
      failedAt,
      durationMs,
      costUsd,
      JSON.stringify(stepResults),
      JSON.stringify({ ok: false, error: msg.slice(0, 2000) }),
      runId
    ).run().catch(() => {});

    await updateWorkflowStats(env, workflow.id, {
      status: 'failed',
      durationMs,
      error: msg,
    }).catch(() => {});

    throw err;
  }
}

/**
 * Fetch a workflow by id OR workflow_key.
 * Returns the full row.
 */
export async function getWorkflow(env, workflowIdOrKey) {
  if (!env?.DB) throw new Error('DB not configured');
  const key = String(workflowIdOrKey || '').trim();
  if (!key) return null;

  return env.DB.prepare(
    `SELECT *
     FROM agentsam_mcp_workflows
     WHERE (id = ? OR workflow_key = ?)
       AND is_active = 1
     LIMIT 1`
  ).bind(key, key).first().catch(() => null);
}

/**
 * List workflows with optional filters.
 * filters: { category, tag, status, trigger_type, workspace_id }
 */
export async function listWorkflows(env, filters = {}) {
  if (!env?.DB) throw new Error('DB not configured');

  const where = [`is_active = 1`];
  const binds = [];

  if (filters.category) {
    where.push(`category = ?`);
    binds.push(String(filters.category));
  }
  if (filters.status) {
    where.push(`status = ?`);
    binds.push(String(filters.status));
  }
  if (filters.trigger_type) {
    where.push(`trigger_type = ?`);
    binds.push(String(filters.trigger_type));
  }
  if (filters.workspace_id) {
    where.push(`workspace_id = ?`);
    binds.push(String(filters.workspace_id));
  }
  if (filters.tag) {
    // tags_json is expected to be a JSON array
    where.push(`EXISTS (SELECT 1 FROM json_each(tags_json) WHERE value = ?)`);
    binds.push(String(filters.tag));
  }

  const sql = `
    SELECT *
    FROM agentsam_mcp_workflows
    WHERE ${where.join(' AND ')}
    ORDER BY
      CASE lower(COALESCE(priority, 'medium'))
        WHEN 'critical' THEN 4
        WHEN 'high'     THEN 3
        WHEN 'medium'   THEN 2
        WHEN 'low'      THEN 1
        ELSE 0
      END DESC,
      updated_at DESC
    LIMIT 500
  `;

  const { results } = await env.DB.prepare(sql).bind(...binds).all().catch(() => ({ results: [] }));
  return results || [];
}

/**
 * List workflow runs (recent first) with parsed step_results_json.
 */
export async function getWorkflowRuns(env, workflowId, limit = 20) {
  if (!env?.DB) throw new Error('DB not configured');
  if (!workflowId) throw new Error('workflow_id_required');

  const lim = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 200);
  const { results } = await env.DB.prepare(
    `SELECT *
     FROM agentsam_workflow_runs
     WHERE workflow_id = ?
     ORDER BY started_at DESC
     LIMIT ?`
  ).bind(String(workflowId), lim).all().catch(() => ({ results: [] }));

  return (results || []).map(r => ({
    ...r,
    step_results: safeParseJsonArray(r.step_results_json),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────────────────────────────────────

async function invokeMcpTool(env, toolName, stepInput, context) {
  const name = String(toolName || '').trim();
  if (!name) return { error: 'tool_name_required' };
  const out = await dispatchToolCall(env, name, stepInput || {}, context || {});
  // Builtin dispatcher sometimes returns stringified JSON for CDT tools; normalize.
  if (typeof out === 'string') {
    try { return JSON.parse(out); } catch { return { output: out }; }
  }
  return out;
}

async function runSqlStep(env, step, baseStepInput) {
  if (!env?.DB) return { error: 'DB not configured' };
  const sql = String(step.sql || step.query || '').trim();
  const params = Array.isArray(step.params) ? step.params : [];
  if (!sql) return { error: 'sql_required' };
  try {
    const stmt = env.DB.prepare(sql).bind(...params);
    const isSelect = /^\s*select\b/i.test(sql);
    if (isSelect) {
      const { results, meta } = await stmt.all();
      return { ok: true, results: results || [], meta, input: baseStepInput };
    }
    const r = await stmt.run();
    return { ok: true, changes: r.meta?.changes ?? 0, meta: r.meta, input: baseStepInput };
  } catch (e) {
    return { error: `sql_step_failed:${e.message}` };
  }
}

async function getDefaultModelForTask(env, taskType) {
  if (!env?.DB) return null;
  const t = String(taskType || '').trim();
  if (!t) return null;
  try {
    const rule = await env.DB.prepare(
      `SELECT primary_model AS model_key
       FROM model_routing_rules
       WHERE task_type = ? AND is_active = 1
       LIMIT 1`
    ).bind(t).first().catch(() => null);
    if (!rule?.model_key) return null;
    const model = await env.DB.prepare(
      `SELECT * FROM ai_models WHERE model_key = ? AND is_active = 1 LIMIT 1`
    ).bind(rule.model_key).first().catch(() => null);
    return model || null;
  } catch (_) {
    return null;
  }
}

async function runModelStep(env, workflow, step, baseStepInput, context) {
  const modelRow = await getDefaultModelForTask(env, workflow.task_type);
  const modelKey = modelRow?.model_key || null;
  const prompt = String(step.prompt || '').trim();
  const messages = Array.isArray(step.messages) ? step.messages : null;

  if (!prompt && !messages) return { error: 'model_step_requires_prompt_or_messages' };

  // Route through the built-in AI handler to avoid hardcoding providers.
  const payload = {
    model: modelKey,
    messages: messages || [{ role: 'user', content: prompt }],
    stream: false,
    ...(step.temperature != null ? { temperature: step.temperature } : {}),
  };

  const out = await invokeMcpTool(env, 'ai_chat', payload, context);
  if (out?.error) return { error: out.error, model: modelKey };
  return { ok: true, model: modelKey, output: out };
}

async function sleepMs(ms) {
  const n = Math.min(Math.max(parseInt(ms, 10) || 0, 0), 60000);
  if (!n) return;
  await new Promise(r => setTimeout(r, n));
}

function computeBackoffMs(baseMs, attempt) {
  const base = Math.min(Math.max(parseInt(baseMs, 10) || 0, 0), 30000);
  const a = Math.min(Math.max(parseInt(attempt, 10) || 0, 0), 10);
  return Math.min(30000, Math.floor(base * Math.pow(2, Math.max(0, a - 1))));
}

async function runStepWithRetry(opts) {
  const {
    env,
    workflow,
    step,
    action,
    baseStepInput,
    runContext,
    retryPolicy,
    onFailure,
  } = opts;

  const policy = {
    max_retries: Number(step.max_retries ?? retryPolicy.max_retries ?? 0),
    backoff_ms: Number(step.backoff_ms ?? retryPolicy.backoff_ms ?? 0),
  };

  const maxRetries = Math.min(Math.max(policy.max_retries, 0), 10);
  let attempt = 0;

  while (true) {
    attempt++;
    const stepInput = {
      ...baseStepInput,
      attempt,
      ...(typeof step.input === 'object' && step.input ? { step_input: step.input } : {}),
    };

    let out;
    try {
      if (action === 'tool') {
        out = await invokeMcpTool(env, step.tool, stepInput, runContext);
      } else if (action === 'query' || action === 'sql') {
        out = await runSqlStep(env, step, stepInput);
      } else if (action === 'model') {
        out = await runModelStep(env, workflow, step, stepInput, runContext);
      } else {
        // Best-effort fallback: if tool is present, treat as tool step
        if (step.tool) out = await invokeMcpTool(env, step.tool, stepInput, runContext);
        else out = { error: `unknown_step_action:${action || '(missing)'}` };
      }
    } catch (e) {
      out = { error: e?.message ?? String(e) };
    }

    const failed = !!out?.error;
    if (!failed) return out;

    if (attempt <= maxRetries) {
      const delay = computeBackoffMs(policy.backoff_ms, attempt);
      if (delay) await sleepMs(delay);
      continue;
    }

    // After max retries: on_failure policy
    const failureAction = String(onFailure.action || 'stop').toLowerCase();
    if (failureAction === 'notify') {
      await notifyWorkflowFailure(env, workflow, step, out?.error);
      // notify does not imply stop; default to stop after notify unless explicit continue
      if (String(onFailure.after_notify || '').toLowerCase() === 'continue') return { error: out?.error, notified: true };
      throw new Error(out?.error || 'step_failed');
    }
    if (failureAction === 'continue') {
      return { error: out?.error, continued: true };
    }
    // stop
    throw new Error(out?.error || 'step_failed');
  }
}

async function notifyWorkflowFailure(env, workflow, step, errMsg) {
  const to = env.WORKFLOW_ALERT_EMAIL || env.ADMIN_EMAIL || null;
  if (!to) return;

  const subject = `[Workflow failed] ${workflow.workflow_key || workflow.id}`;
  const text = [
    `Workflow: ${workflow.workflow_key || workflow.id}`,
    `Step: ${step?.step ?? ''} ${step?.action ?? ''}`.trim(),
    `Error: ${String(errMsg || '').slice(0, 4000)}`,
    '',
    `Environment: ${env.DEPLOY_ENV || 'unknown'}`,
    `Time: ${new Date().toISOString()}`,
  ].join('\n');

  await sendEmail(env, { to, subject, text, tag: 'workflow_failure' }).catch(() => {});
}

async function updateRunProgress(env, runId, stepResults, extra = {}) {
  if (!env?.DB) return;
  await env.DB.prepare(
    `UPDATE agentsam_workflow_runs
     SET step_results_json = ?,
         steps_completed = ?
     WHERE id = ?`
  ).bind(
    JSON.stringify(stepResults || []),
    Number(extra.steps_completed ?? (stepResults?.length || 0)),
    runId
  ).run().catch(() => {});
}

async function updateWorkflowStats(env, workflowId, { status, durationMs, error }) {
  if (!env?.DB || !workflowId) return;
  const now = Math.floor(Date.now() / 1000);

  // read current run_count + avg_duration_ms to compute a simple rolling average
  const row = await env.DB.prepare(
    `SELECT run_count, avg_duration_ms FROM agentsam_mcp_workflows WHERE id = ? LIMIT 1`
  ).bind(workflowId).first().catch(() => null);

  const runCount = Number(row?.run_count ?? 0);
  const avgPrev = Number(row?.avg_duration_ms ?? 0);
  const avgNext = runCount >= 0
    ? Math.round(((avgPrev * runCount) + Number(durationMs || 0)) / (runCount + 1))
    : Number(durationMs || 0);

  const successInc = status === 'success' ? 1 : 0;
  await env.DB.prepare(
    `UPDATE agentsam_mcp_workflows
     SET run_count = COALESCE(run_count, 0) + 1,
         success_count = COALESCE(success_count, 0) + ?,
         last_run_at = ?,
         last_run_status = ?,
         avg_duration_ms = ?,
         last_error = ?
     WHERE id = ?`
  ).bind(
    successInc,
    now,
    String(status || 'unknown').slice(0, 40),
    avgNext,
    error ? String(error).slice(0, 2000) : null,
    workflowId
  ).run().catch(() => {});
}

function safeParseJsonObj(raw) {
  if (!raw) return {};
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch (_) {
    return {};
  }
}

function safeParseJsonArray(raw) {
  if (!raw) return [];
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? v : [];
  } catch (_) {
    return [];
  }
}

