/**
 * Start a durable workflow run via iam-workflows (Cloudflare Workflows).
 */

import { loadWorkflowGraphBundle } from './agentsam-workflow-graph.js';
import { fetchIamWorkflowsJson, hasIamWorkflowsBinding } from './iam-workflows-service-proxy.js';
import { resolveWorkflowExecutionEngine, parseWorkflowMetadata } from './workflow-execution-mode.js';
import { resolveEntryNode } from './workflow-executor.js';

function safeJson(raw, fallback = {}) {
  try {
    const o = JSON.parse(String(raw || '{}'));
    return o && typeof o === 'object' && !Array.isArray(o) ? o : fallback;
  } catch {
    return fallback;
  }
}

/**
 * @param {any} env
 * @param {{
 *   workflow: Record<string, unknown>,
 *   input: Record<string, unknown>,
 *   authUser: Record<string, unknown>|null,
 *   workspaceId: string|null,
 *   executionEngineOverride?: string,
 * }} opts
 */
export async function startDurableWorkflowRun(env, opts) {
  const { workflow, input, authUser, workspaceId, executionEngineOverride } = opts;
  if (!env?.DB) return { ok: false, error: 'DB unavailable' };
  if (!hasIamWorkflowsBinding(env)) {
    return { ok: false, error: 'IAM_WORKFLOWS binding not configured' };
  }

  const tenantId = authUser?.tenant_id ?? null;
  const bundle = await loadWorkflowGraphBundle(env.DB, workflow.id, tenantId, workspaceId);
  if (!bundle?.nodes?.length) return { ok: false, error: 'no nodes found for workflow' };

  const engine = resolveWorkflowExecutionEngine(workflow, {
    override: executionEngineOverride,
    nodeCount: bundle.nodes.length,
  });
  if (engine !== 'durable') {
    return { ok: false, error: 'execution_engine_not_durable', engine };
  }

  const workflowKey = String(workflow.workflow_key || '');
  const runId = `wrun_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const entryNode = resolveEntryNode(workflow, bundle.nodes, bundle.edges);
  const firstKey = entryNode?.node_key || bundle.nodes[0]?.node_key || '';
  const wfMeta = parseWorkflowMetadata(workflow.metadata_json);

  const runMeta = {
    tenantId,
    workspaceId,
    userId: authUser?.id ?? null,
    userEmail: authUser?.email ?? null,
  };

  const runMetadata = {
    ...wfMeta,
    execution_engine: 'durable',
    source: 'iam_workflows',
  };

  await env.DB.prepare(
    `INSERT INTO agentsam_workflow_runs (
      id, workflow_id, workflow_key, tenant_id, workspace_id,
      run_group_id, user_id, user_email, trigger_type, status,
      input_json, output_json, step_results_json, metadata_json,
      steps_total, steps_completed, environment,
      graph_mode, current_node_key,
      started_at, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, 'manual', 'running',
      ?, '{}', '[]', ?,
      ?, 0, 'production',
      1, ?,
      unixepoch(), datetime('now'), datetime('now')
    )`,
  )
    .bind(
      runId,
      bundle.dag_workflow_id || workflow.id,
      workflowKey,
      tenantId,
      workspaceId,
      `rg_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
      authUser?.id ?? null,
      authUser?.email ?? null,
      JSON.stringify(input ?? {}),
      JSON.stringify(runMetadata),
      bundle.nodes.length,
      firstKey,
    )
    .run();

  const payload = {
    run_id: runId,
    workflow_key: workflowKey,
    workflow_id: workflow.id,
    input: input ?? {},
    nodes: bundle.nodes,
    edges: bundle.edges,
    workflow_metadata: wfMeta,
    run_context: { runMeta },
  };

  const created = await fetchIamWorkflowsJson(env, '/v1/runs', {
    payload,
    metadata: runMetadata,
  });

  if (created.error) {
    await env.DB.prepare(
      `UPDATE agentsam_workflow_runs SET status = 'failed', kill_reason = ?, updated_at = datetime('now') WHERE id = ?`,
    )
      .bind(String(created.error).slice(0, 500), runId)
      .run()
      .catch(() => null);
    return { ok: false, error: created.error, run_id: runId };
  }

  const instanceId = created.instance_id ?? null;
  if (instanceId) {
    runMetadata.cf_workflow_instance_id = instanceId;
    await env.DB.prepare(
      `UPDATE agentsam_workflow_runs SET metadata_json = ?, updated_at = datetime('now') WHERE id = ?`,
    )
      .bind(JSON.stringify(runMetadata), runId)
      .run()
      .catch(() => null);
  }

  return {
    ok: true,
    mode: 'durable',
    run_id: runId,
    instance_id: instanceId,
    status_url: `/api/agentsam/workflow-runs/${runId}`,
    poll_url: `/api/agentsam/workflow-runs/${runId}`,
    steps_total: bundle.nodes.length,
  };
}

/**
 * @param {any} env
 * @param {Record<string, unknown>} workflow
 * @param {{ override?: string, nodeCount?: number }} [opts]
 */
export function shouldUseDurableEngine(env, workflow, opts = {}) {
  if (!hasIamWorkflowsBinding(env)) return false;
  return resolveWorkflowExecutionEngine(workflow, opts) === 'durable';
}
