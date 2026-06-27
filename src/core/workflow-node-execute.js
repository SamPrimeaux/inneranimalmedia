/**
 * Single-node workflow execution for durable orchestrator (iam-workflows).
 * Reuses dispatchNode + D1 ledger — handler registry remains SSOT.
 */

import { verifyInternalApiSecret } from './auth.js';
import {
  dispatchNode,
  evaluateEdge,
  normalizeNodeOutput,
} from './workflow-executor.js';

function safeJson(str, fallback = {}) {
  try {
    const o = JSON.parse(String(str || '{}'));
    return o && typeof o === 'object' && !Array.isArray(o) ? o : fallback;
  } catch {
    return fallback;
  }
}

export function isWorkflowInternalAuthorized(request, env) {
  if (verifyInternalApiSecret(request, env)) return true;
  const serviceKey = env?.IAM_SERVICE_KEY != null ? String(env.IAM_SERVICE_KEY).trim() : '';
  const header = (request.headers.get('X-IAM-Service-Key') || '').trim();
  return Boolean(serviceKey && header && header === serviceKey);
}

async function pragmaTableInfo(db, table) {
  try {
    const { results } = await db.prepare(`PRAGMA table_info(${table})`).all();
    return new Set((results || []).map((r) => r.name));
  } catch {
    return new Set();
  }
}

async function insertExecutionStep(db, cols, stepId, runId, node, nodeInput) {
  if (!cols.has('id')) return;
  const binds = {
    id: stepId,
    execution_id: runId,
    workflow_run_id: runId,
    node_key: node.node_key,
    node_type: node.node_type,
    status: 'running',
    input_json: JSON.stringify(nodeInput ?? {}),
  };
  const fields = Object.keys(binds).filter((k) => cols.has(k));
  if (!fields.length) return;
  const placeholders = fields.map(() => '?').join(', ');
  await db
    .prepare(`INSERT INTO agentsam_execution_steps (${fields.join(', ')}) VALUES (${placeholders})`)
    .bind(...fields.map((f) => binds[f]))
    .run()
    .catch(() => null);
}

async function completeExecutionStep(db, cols, stepId, startedAt, nodeOutput) {
  if (!cols.has('id')) return;
  const latency = Math.max(0, Date.now() - startedAt);
  const patch = {
    status: nodeOutput?.ok ? 'completed' : 'failed',
    output_json: JSON.stringify(nodeOutput?.output ?? null),
    error_json: nodeOutput?.error ? JSON.stringify({ message: nodeOutput.error }) : null,
    latency_ms: latency,
  };
  const sets = Object.keys(patch)
    .filter((k) => cols.has(k))
    .map((k) => `${k} = ?`);
  if (!sets.length) return;
  await db
    .prepare(`UPDATE agentsam_execution_steps SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...Object.keys(patch).filter((k) => cols.has(k)).map((k) => patch[k]), stepId)
    .run()
    .catch(() => null);
}

/**
 * @param {any} env
 * @param {Record<string, unknown>} body
 */
export async function executeWorkflowNodeInternal(env, body) {
  if (!env?.DB) return { ok: false, error: 'DB unavailable' };

  const runId = String(body.run_id || '').trim();
  const workflowKey = String(body.workflow_key || '').trim();
  const nodeKey = String(body.node_key || '').trim();
  const node = body.node && typeof body.node === 'object' ? body.node : null;
  const nodeInput = body.input ?? {};
  const runContextExtra = body.run_context && typeof body.run_context === 'object' ? body.run_context : {};

  if (!runId || !nodeKey || !node) {
    return { ok: false, error: 'run_id, node_key, and node required' };
  }

  const run = await env.DB.prepare(`SELECT * FROM agentsam_workflow_runs WHERE id = ? LIMIT 1`)
    .bind(runId)
    .first();
  if (!run) return { ok: false, error: 'run_not_found' };

  const workflowMeta = await env.DB.prepare(
    `SELECT default_task_type, default_mode, workflow_type, risk_level, requires_approval, metadata_json
     FROM agentsam_workflows
     WHERE workflow_key = ? AND COALESCE(is_active, 1) = 1
     LIMIT 1`,
  )
    .bind(workflowKey || run.workflow_key)
    .first()
    .catch(() => null);

  const stepId = `estep_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const stepCols = await pragmaTableInfo(env.DB, 'agentsam_execution_steps');
  const nodeStart = Date.now();

  await insertExecutionStep(env.DB, stepCols, stepId, runId, node, nodeInput);

  const runContext = {
    runId,
    runMeta: {
      tenantId: run.tenant_id,
      workspaceId: run.workspace_id,
      userId: run.user_id,
      ...runContextExtra.runMeta,
    },
    workflowRunId: runId,
    workflowKey: workflowKey || run.workflow_key,
    workflowMeta: workflowMeta ?? null,
    executionStepId: stepId,
    initialInput: safeJson(run.input_json),
    ...runContextExtra,
  };

  let nodeOutput = await dispatchNode(env, node, nodeInput, runContext).catch((e) => ({
    ok: false,
    error: e?.message || String(e),
  }));
  nodeOutput = normalizeNodeOutput(nodeOutput);
  await completeExecutionStep(env.DB, stepCols, stepId, nodeStart, nodeOutput);

  let stepResults = [];
  try {
    stepResults = JSON.parse(String(run.step_results_json || '[]')) || [];
  } catch {
    stepResults = [];
  }
  stepResults.push({
    node_key: nodeKey,
    node_type: node.node_type,
    handler_key: node.handler_key,
    ok: nodeOutput.ok,
    output: nodeOutput.output ?? null,
    error: nodeOutput.error ?? null,
  });
  const stepsCompleted = stepResults.length;

  await env.DB.prepare(
    `UPDATE agentsam_workflow_runs SET
      current_node_key = ?,
      steps_completed = ?,
      step_results_json = ?,
      heartbeat_at = unixepoch(),
      updated_at = datetime('now')
     WHERE id = ?`,
  )
    .bind(nodeKey, stepsCompleted, JSON.stringify(stepResults), runId)
    .run()
    .catch(() => null);

  if (!nodeOutput.ok) {
    return {
      ok: false,
      error: nodeOutput.error || 'node_failed',
      step_results: stepResults,
      handler_key: node.handler_key,
    };
  }

  if (node.node_type === 'approval_gate' && nodeOutput.output?.status === 'pending') {
    await env.DB.prepare(
      `UPDATE agentsam_workflow_runs SET status = 'awaiting_approval', approval_id = ?, updated_at = datetime('now') WHERE id = ?`,
    )
      .bind(nodeOutput.output.approval_id ?? null, runId)
      .run()
      .catch(() => null);
    return {
      ok: true,
      awaiting_approval: true,
      approval_id: nodeOutput.output.approval_id,
      output: nodeOutput.output,
      step_results: stepResults,
      handler_key: node.handler_key,
    };
  }

  return {
    ok: true,
    output: nodeOutput.output ?? null,
    step_results: stepResults,
    handler_key: node.handler_key,
  };
}

/**
 * Compute next node after approval gate (shared by SSE resume + durable events).
 * @param {any} env
 * @param {string} runId
 * @param {'approved'|'denied'} decision
 */
export async function computeNextNodeAfterApproval(env, runId, decision = 'approved') {
  if (!env?.DB) return { ok: false, error: 'DB unavailable' };
  const run = await env.DB.prepare(`SELECT * FROM agentsam_workflow_runs WHERE id = ? LIMIT 1`)
    .bind(runId)
    .first();
  if (!run) return { ok: false, error: 'run_not_found' };

  let stepResults = [];
  try {
    stepResults = JSON.parse(String(run.step_results_json || '[]')) || [];
  } catch {
    stepResults = [];
  }
  const lastStep = stepResults[stepResults.length - 1];
  const gateKey = String(lastStep?.node_key || run.current_node_key || '').trim();
  if (!gateKey) return { ok: false, error: 'resume_missing_gate_node' };

  if (decision !== 'approved') {
    return { ok: true, next_node_key: null, denied: true };
  }

  const workflow = await env.DB.prepare(
    `SELECT * FROM agentsam_workflows WHERE workflow_key = ? AND COALESCE(is_active, 1) = 1 LIMIT 1`,
  )
    .bind(run.workflow_key)
    .first();

  const { loadWorkflowGraphBundle } = await import('./agentsam-workflow-graph.js');
  const bundle = await loadWorkflowGraphBundle(
    env.DB,
    workflow?.id || run.workflow_id,
    run.tenant_id,
    run.workspace_id,
  );
  if (!bundle?.nodes?.length) return { ok: false, error: 'graph_not_found' };

  const edgeMap = {};
  for (const e of bundle.edges || []) {
    if (!edgeMap[e.from_node_key]) edgeMap[e.from_node_key] = [];
    edgeMap[e.from_node_key].push(e);
  }

  const resumeOutput = {
    ok: true,
    output: {
      ...(lastStep?.output && typeof lastStep.output === 'object' ? lastStep.output : {}),
      status: 'approved',
    },
  };

  const outEdges = (edgeMap[gateKey] || []).sort((a, b) => {
    if (a.is_fallback !== b.is_fallback) return a.is_fallback ? 1 : -1;
    return (a.priority || 0) - (b.priority || 0);
  });

  for (const edge of outEdges) {
    if (evaluateEdge(edge, resumeOutput)) {
      return { ok: true, next_node_key: edge.to_node_key, gate_node_key: gateKey };
    }
  }
  return { ok: false, error: 'resume_no_outgoing_edge' };
}

/**
 * @param {any} env
 * @param {Record<string, unknown>} body
 */
export async function finalizeWorkflowRunInternal(env, body) {
  if (!env?.DB) return { ok: false, error: 'DB unavailable' };
  const runId = String(body.run_id || '').trim();
  const status = String(body.status || 'completed').toLowerCase();
  if (!runId) return { ok: false, error: 'run_id required' };

  const run = await env.DB.prepare(`SELECT * FROM agentsam_workflow_runs WHERE id = ? LIMIT 1`)
    .bind(runId)
    .first();
  if (!run) return { ok: false, error: 'run_not_found' };

  const killReason = body.kill_reason != null ? String(body.kill_reason) : null;
  const output = body.output ?? safeJson(run.output_json);
  const stepResults = body.step_results ?? safeJson(run.step_results_json, []);

  await env.DB.prepare(
    `UPDATE agentsam_workflow_runs SET
      status = ?,
      output_json = ?,
      step_results_json = ?,
      steps_completed = ?,
      kill_reason = COALESCE(?, kill_reason),
      completed_at = unixepoch(),
      duration_ms = COALESCE(duration_ms, CAST((unixepoch() - started_at) * 1000 AS INTEGER)),
      updated_at = datetime('now')
     WHERE id = ?`,
  )
    .bind(
      status,
      JSON.stringify(output ?? {}),
      JSON.stringify(stepResults ?? []),
      Array.isArray(stepResults) ? stepResults.length : run.steps_completed,
      killReason,
      runId,
    )
    .run();

  return { ok: true, run_id: runId, status };
}
