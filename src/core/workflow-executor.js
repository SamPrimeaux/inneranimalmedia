/**
 * Executes agentsam_workflow_nodes / agentsam_workflow_edges as a directed graph.
 * Persists state to agentsam_workflow_runs row by row.
 */
const TIER_ORDER = ['micro', 'flash', 'standard', 'power', 'reasoning'];

// ── Node type dispatchers ────────────────────────────────────────────

async function dispatchNode(env, node, input, runContext) {
  const { node_type: nodeType, handler_key: handlerKey } = node;

  switch (nodeType) {
    case 'agent': {
      const { agentChatStep } = await import('./agent-step.js').catch(() => ({ agentChatStep: null }));
      if (agentChatStep) {
        return agentChatStep(env, { handler_key: handlerKey, input, runContext });
      }
      const prompt = JSON.stringify(input);
      return { ok: true, output: { result: prompt, note: 'agent_stub' } };
    }

    case 'mcp_tool': {
      const [, method] = String(handlerKey || '').split('.');
      let toolRow = null;
      try {
        toolRow = await env.DB.prepare(
          `SELECT mcp_service_url, handler_config FROM mcp_registered_tools
           WHERE COALESCE(enabled, 0) = 1 AND (tool_name LIKE ? OR tool_name = ?) LIMIT 1`,
        ).bind(`%${method}%`, method).first();
      } catch (_) {
        toolRow = null;
      }
      const baseUrl = toolRow?.mcp_service_url;
      if (!baseUrl) {
        return { ok: false, error: `mcp_tool not found: ${handlerKey}` };
      }
      const url = String(baseUrl).replace(/\/$/, '') + '/invoke';
      const mcpRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, params: input, handler_key: handlerKey }),
      }).catch(() => null);
      if (!mcpRes || !mcpRes.ok) {
        return { ok: false, error: `mcp_tool HTTP ${mcpRes?.status ?? 'fetch_failed'}` };
      }
      const data = await mcpRes.json().catch(() => ({}));
      return { ok: true, output: data };
    }

    case 'terminal': {
      const termUrl = env.TERMINAL_WS_URL
        ? env.TERMINAL_WS_URL.replace('wss://', 'https://').replace('ws://', 'http://')
        : null;
      if (!termUrl) return { ok: false, error: 'terminal not configured' };
      const cmd = input?.command || input?.cmd || '';
      if (!cmd) return { ok: false, error: 'no command in terminal node input' };
      if (/[;&|`$><\\]/.test(cmd)) {
        return { ok: false, error: 'command contains unsafe characters' };
      }
      const tRes = await fetch(`${termUrl.replace(/\/$/, '')}/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.TERMINAL_SECRET || ''}`,
        },
        body: JSON.stringify({ command: cmd, timeout_ms: node.timeout_ms || 30000 }),
      }).catch(() => null);
      if (!tRes?.ok) return { ok: false, error: `terminal HTTP ${tRes?.status}` };
      const out = await tRes.json().catch(() => ({}));
      return { ok: true, output: out };
    }

    case 'db_query': {
      return { ok: true, output: { logged: false, note: 'db_query noop — use dedicated analytics pipeline' } };
    }

    case 'eval': {
      let qg = {};
      try {
        qg = JSON.parse(node.quality_gate_json || '{}');
      } catch (_) {
        qg = {};
      }
      const assertions = qg.assertions || [];
      const passed = assertions.every((a) => {
        const val = input?.[a.field];
        if (a.op === 'exists') return val != null;
        if (a.op === 'eq') return val === a.value;
        if (a.op === 'gt') return Number(val) > Number(a.value);
        return true;
      });
      return { ok: true, output: { passed, assertion_count: assertions.length } };
    }

    case 'branch': {
      return { ok: true, output: { passed: true, branch: 'default' } };
    }

    case 'approval_gate': {
      if (!env.DB) return { ok: false, error: 'DB not available' };
      const approvalId = `appr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      const meta = runContext?.runMeta || {};
      const payload = JSON.stringify({
        node_key: node.node_key,
        handler_key: handlerKey,
        input,
      });
      try {
        await env.DB.prepare(
          `INSERT INTO agentsam_approval_queue
           (id, tenant_id, workspace_id, user_id, workflow_run_id, tool_name, action_summary,
            input_json, risk_level, approval_type, status, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?, 'pending', unixepoch())`,
        ).bind(
          approvalId,
          meta.tenantId,
          meta.workspaceId,
          meta.userId,
          runContext.runId,
          `workflow:${String(node.node_key || 'gate').slice(0, 120)}`,
          `Workflow approval: ${node.node_key || 'gate'}`,
          payload,
          node.risk_level || 'high',
          'workflow',
        ).run();
      } catch (e) {
        return { ok: false, error: e?.message || 'approval_insert_failed' };
      }
      return { ok: true, output: { status: 'pending', approval_id: approvalId } };
    }

    default:
      return { ok: false, error: `unknown node_type: ${nodeType}` };
  }
}

// ── Edge evaluation ──────────────────────────────────────────────────

function evaluateEdge(edge, nodeOutput) {
  let cond = {};
  try {
    cond = JSON.parse(edge.condition_json || '{}');
  } catch (_) {
    cond = {};
  }
  const ctype = String(edge.condition_type || 'always').toLowerCase();
  switch (ctype) {
    case 'always':
      return true;
    case 'status': {
      const expected = cond.from_status;
      const actual = nodeOutput?.ok ? 'success' : 'failed';
      if (Array.isArray(expected)) return expected.includes(actual);
      return actual === expected;
    }
    case 'risk': {
      if (cond.requires_approval) return nodeOutput?.output?.risk_level === 'high';
      if (cond.max_risk_level) {
        const lvl = TIER_ORDER.indexOf(nodeOutput?.output?.risk_level || 'low');
        const max = TIER_ORDER.indexOf(cond.max_risk_level);
        return lvl <= max;
      }
      return true;
    }
    case 'output': {
      const val = nodeOutput?.output?.[cond.field];
      return cond.op === 'eq' ? val === cond.value : val != null;
    }
    default:
      return false;
  }
}

// ── Main executor ────────────────────────────────────────────────────

export async function executeWorkflowGraph(env, opts) {
  const {
    workflowKey,
    input,
    tenantId,
    workspaceId,
    userId,
    userEmail,
  } = opts;

  if (!env.DB) return { ok: false, error: 'DB not available' };

  const workflow = await env.DB.prepare(
    `SELECT * FROM agentsam_workflows WHERE workflow_key = ? AND is_active = 1 LIMIT 1`,
  )
    .bind(workflowKey)
    .first();
  if (!workflow) return { ok: false, error: `workflow not found: ${workflowKey}` };

  const { results: nodes } = await env.DB.prepare(
    `SELECT * FROM agentsam_workflow_nodes
     WHERE workflow_id = ? AND COALESCE(is_active, 1) = 1 ORDER BY sort_order ASC`,
  )
    .bind(workflow.id)
    .all();
  const { results: edges } = await env.DB.prepare(
    `SELECT * FROM agentsam_workflow_edges WHERE workflow_id = ? ORDER BY priority ASC`,
  )
    .bind(workflow.id)
    .all();

  if (!nodes?.length) return { ok: false, error: 'no nodes found for workflow' };

  const runId = `wrun_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const firstKey = nodes[0]?.node_key || '';
  await env.DB.prepare(
    `INSERT INTO agentsam_workflow_runs (
      id, workflow_id, workflow_key, tenant_id, workspace_id,
      user_id, user_email, trigger_type, status,
      input_json, output_json, step_results_json, metadata_json,
      steps_total, steps_completed, environment,
      graph_mode, current_node_key,
      started_at, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, 'agent', 'running',
      ?, '{}', '[]', '{}',
      ?, 0, 'production',
      1, ?,
      unixepoch(), datetime('now'), datetime('now')
    )`,
  )
    .bind(
      runId,
      workflow.id,
      workflowKey,
      tenantId,
      workspaceId,
      userId ?? null,
      userEmail ?? null,
      JSON.stringify(input ?? {}),
      nodes.length,
      firstKey,
    )
    .run();

  const nodeMap = Object.fromEntries(nodes.map((n) => [n.node_key, n]));
  const edgeMap = {};
  for (const e of edges || []) {
    if (!edgeMap[e.from_node_key]) edgeMap[e.from_node_key] = [];
    edgeMap[e.from_node_key].push(e);
  }

  const runMeta = { tenantId, workspaceId, userId };
  const runContext = { runId, runMeta };
  const stepResults = [];
  let currentNodeKey = firstKey;
  let stepsCompleted = 0;
  let totalCostUsd = 0;
  let runOk = true;
  let killReason = null;

  // 5. Walk the graph
  const visited = new Set();
  while (currentNodeKey) {
    if (visited.has(currentNodeKey)) {
      killReason = 'cycle_detected';
      runOk = false;
      break;
    }
    if (stepsCompleted > nodes.length + 5) {
      killReason = 'max_steps_exceeded';
      runOk = false;
      break;
    }
    visited.add(currentNodeKey);

    const node = nodeMap[currentNodeKey];
    if (!node) {
      killReason = `node_not_found:${currentNodeKey}`;
      runOk = false;
      break;
    }

    await env.DB
      .prepare(
        `UPDATE agentsam_workflow_runs SET
        current_node_key = ?,
        heartbeat_at     = unixepoch(),
        updated_at       = datetime('now')
      WHERE id = ?`,
      )
      .bind(currentNodeKey, runId)
      .run()
      .catch(() => null);

    const nodeInput =
      stepResults.length > 0 ? stepResults[stepResults.length - 1].output ?? input : input;

    const nodeOutput = await dispatchNode(env, node, nodeInput, { ...runContext, node }).catch((e) => ({
      ok: false,
      error: e?.message || String(e),
    }));

    stepResults.push({
      node_key: currentNodeKey,
      node_type: node.node_type,
      handler_key: node.handler_key,
      ok: nodeOutput.ok,
      output: nodeOutput.output ?? null,
      error: nodeOutput.error ?? null,
    });
    stepsCompleted += 1;

    await env.DB
      .prepare(
        `UPDATE agentsam_workflow_runs SET
        steps_completed   = ?,
        step_results_json = ?,
        updated_at        = datetime('now')
      WHERE id = ?`,
      )
      .bind(stepsCompleted, JSON.stringify(stepResults), runId)
      .run()
      .catch(() => null);

    if (!nodeOutput.ok) {
      runOk = false;
      killReason = nodeOutput.error || 'node_failed';
      break;
    }

    if (node.node_type === 'approval_gate' && nodeOutput.output?.status === 'pending') {
      await env.DB
        .prepare(
          `UPDATE agentsam_workflow_runs SET
          status     = 'awaiting_approval',
          updated_at = datetime('now')
        WHERE id = ?`,
        )
        .bind(runId)
        .run()
        .catch(() => null);
      return {
        ok: true,
        status: 'awaiting_approval',
        run_id: runId,
        approval_id: nodeOutput.output.approval_id,
        step_results: stepResults,
      };
    }

    const outEdges = (edgeMap[currentNodeKey] || []).sort((a, b) => {
      if (a.is_fallback !== b.is_fallback) return a.is_fallback ? 1 : -1;
      return (a.priority || 0) - (b.priority || 0);
    });

    let nextNodeKey = null;
    for (const edge of outEdges) {
      if (evaluateEdge(edge, nodeOutput)) {
        nextNodeKey = edge.to_node_key;
        break;
      }
    }

    currentNodeKey = nextNodeKey;
  }

  // 6. Finalize run row
  const finalStatus = runOk ? 'completed' : 'failed';
  const lastOutput = stepResults[stepResults.length - 1]?.output ?? {};

  const killClause = killReason ? 'kill_reason = ?,' : '';
  const killBinds = killReason ? [killReason] : [];

  await env.DB
    .prepare(
      `UPDATE agentsam_workflow_runs SET
      status            = ?,
      output_json       = ?,
      step_results_json = ?,
      steps_completed   = ?,
      cost_usd          = ?,
      completed_at      = unixepoch(),
      ${killClause}
      updated_at        = datetime('now')
    WHERE id = ?`,
    )
    .bind(
      finalStatus,
      JSON.stringify(lastOutput),
      JSON.stringify(stepResults),
      stepsCompleted,
      totalCostUsd,
      ...killBinds,
      runId,
    )
    .run()
    .catch(() => null);

  return {
    ok: runOk,
    status: finalStatus,
    run_id: runId,
    steps_completed: stepsCompleted,
    step_results: stepResults,
    kill_reason: killReason ?? null,
  };
}

// ── SSE streaming wrapper ────────────────────────────────────────────

export async function executeWorkflowAndStream(env, workflowKey, message, authUser, workspaceId, controller) {
  const encoder = new TextEncoder();
  const send = (data) => {
    try {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
    } catch {
      /* stream already closed */
    }
  };

  send({ type: 'workflow_start', workflow_key: workflowKey, message });

  const result = await executeWorkflowGraph(env, {
    workflowKey,
    input: { message },
    tenantId: authUser?.tenant_id ?? null,
    workspaceId,
    userId: authUser?.id ?? null,
    userEmail: authUser?.email ?? null,
  }).catch((e) => ({
    ok: false,
    status: 'error',
    run_id: null,
    step_results: [],
    kill_reason: e?.message || String(e),
  }));

  for (const step of result.step_results || []) {
    send({ type: 'workflow_step', ...step });
  }

  if (result.status === 'awaiting_approval') {
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

  send({ type: 'done' });
  try {
    controller.close();
  } catch {
    /* noop */
  }
}
