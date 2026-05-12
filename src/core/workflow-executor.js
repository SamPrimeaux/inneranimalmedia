/**
 * Executes agentsam_workflow_nodes / agentsam_workflow_edges as a directed graph.
 * Persists state to agentsam_workflow_runs row by row.
 */
import { pragmaTableInfo } from './retention.js';
import { resolveCanonicalUserId } from '../api/auth.js';
import { insertExecutionDependencyGraphEdge } from '../api/command-run-telemetry.js';

const TIER_ORDER = ['micro', 'flash', 'standard', 'power', 'reasoning'];

const TRIGGER_TYPES_SAFE = new Set([
  'manual',
  'agent',
  'cursor',
  'github_push',
  'scheduled',
  'cicd',
  'deploy',
  'api',
  'smoke',
]);

/**
 * MCP catalog row that owns agentsam_workflow_nodes.workflow_id (D1 FK).
 * Prefers tenant + workspace match, then tenant-scoped, then platform-global rows.
 */
async function resolveMcpWorkflowRow(db, workflowKey, tenantId, workspaceId) {
  if (!db) return null;
  const key = String(workflowKey || '').trim();
  if (!key) return null;
  const tid = tenantId != null ? String(tenantId).trim() : '';
  const wid = workspaceId != null ? String(workspaceId).trim() : '';

  const first = async (sql, binds) =>
    db
      .prepare(sql)
      .bind(...binds)
      .first()
      .catch(() => null);

  if (tid && wid) {
    const exact = await first(
      `SELECT * FROM agentsam_mcp_workflows
       WHERE workflow_key = ? AND COALESCE(is_active, 1) = 1
         AND tenant_id = ? AND (workspace_id = ? OR workspace_id IS NULL)
       ORDER BY CASE WHEN workspace_id = ? THEN 0 ELSE 1 END, updated_at DESC
       LIMIT 1`,
      [key, tid, wid, wid],
    );
    if (exact) return exact;
  }
  if (tid) {
    const tenantRow = await first(
      `SELECT * FROM agentsam_mcp_workflows
       WHERE workflow_key = ? AND COALESCE(is_active, 1) = 1 AND tenant_id = ?
       ORDER BY (workspace_id IS NOT NULL) DESC, updated_at DESC
       LIMIT 1`,
      [key, tid],
    );
    if (tenantRow) return tenantRow;
  }
  return first(
    `SELECT * FROM agentsam_mcp_workflows
     WHERE workflow_key = ? AND COALESCE(is_active, 1) = 1
       AND tenant_id IS NULL AND workspace_id IS NULL
     ORDER BY updated_at DESC
     LIMIT 1`,
    [key],
  );
}

function normalizeTriggerType(raw) {
  const t = String(raw || 'agent').toLowerCase().trim();
  return TRIGGER_TYPES_SAFE.has(t) ? t : 'agent';
}

// ── Node type dispatchers ────────────────────────────────────────────

async function dispatchNode(env, node, input, runContext) {
  const { node_type: nodeType, handler_key: handlerKey } = node;
  const smoke = Boolean(input?.smoke);
  const hk = String(handlerKey || '').trim();

  if (hk) {
    try {
      const stepMod = await import('./agent-step.js');
      if (stepMod.isRegisteredAgentStepHandler?.(hk)) {
        return stepMod.agentChatStep(env, { handler_key: hk, input, runContext, node, smoke });
      }
    } catch (e) {
      console.warn('[workflow-graph] agent-step', e?.message ?? e);
    }
  }

  switch (nodeType) {
    case 'agent': {
      if (smoke) return { ok: true, output: { smoke: true, skipped: true, note: 'agent smoke short-circuit' } };
      try {
        const { dispatchComplete } = await import('./provider.js');

        // Derive task_type from handler_key: 'agentsam.code.map_file' -> 'code'
        const hkParts = String(handlerKey || '').split('.');
        const taskType = hkParts[1] || hkParts[0] || 'code';
        const mode = String(runContext?.workflowKey || '').includes('build') ? 'build' : 'agent';

        const userMsg = typeof input === 'string'
          ? input
          : input?.prompt || input?.message || input?.instruction || input?.result
          || JSON.stringify(input);

        const result = await dispatchComplete(env, {
          modelKey: 'auto',
          taskType,
          mode,
          systemPrompt: 'You are Agent Sam, an autonomous AI developer for Inner Animal Media. Complete the task and return concise structured output.',
          messages: [{ role: 'user', content: String(userMsg).slice(0, 12000) }],
          userId: runContext?.canonicalUserId,
          options: { reasoningEffort: 'medium', verbosity: 'low' },
        });

        const text = result?.text
          || result?.content?.[0]?.text
          || result?.output
          || JSON.stringify(result);

        return { ok: true, output: { result: text, model: result?.model, tokens: result?.usage } };
      } catch (e) {
        return { ok: false, error: `agent node failed: ${e?.message ?? e}` };
      }
    }

    case 'mcp_tool': {
      if (smoke) {
        return {
          ok: true,
          output: {
            smoke: true,
            skipped: true,
            handler_key: handlerKey,
            note: 'mcp_tool smoke short-circuit',
          },
        };
      }
      const [, method] = (handlerKey || '').split('.');
      const toolKey = method || handlerKey;

      const toolRow = env.DB
        ? await env.DB.prepare(`
      SELECT tool_key, mcp_service_url, handler_type, handler_config
      FROM agentsam_mcp_tools
      WHERE tool_key = ? AND is_active = 1 AND enabled = 1
      LIMIT 1
    `)
            .bind(toolKey)
            .first()
            .catch(() => null)
        : null;

      if (!toolRow) {
        return { ok: false, error: `mcp_tool not found in agentsam_mcp_tools: ${handlerKey}` };
      }

      // Builtin/proxy/r2/terminal handlers — dispatch internally
      if (['builtin', 'r2', 'terminal', 'proxy'].includes(toolRow.handler_type)) {
        // These are handled by the existing tool dispatch system
        // Emit a tool call event and let the agent handler execute it
        return {
          ok: true,
          output: {
            tool_dispatched: toolRow.tool_key,
            handler_type: toolRow.handler_type,
            handler_config: JSON.parse(toolRow.handler_config || '{}'),
            input,
          },
        };
      }

      // HTTP/MCP server tools
      if (!toolRow.mcp_service_url) {
        return { ok: false, error: `no mcp_service_url for tool: ${handlerKey}` };
      }

      const mcpRes = await fetch(toolRow.mcp_service_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: toolRow.tool_key, params: input }),
      }).catch(() => null);

      if (!mcpRes?.ok) {
        return { ok: false, error: `mcp_tool HTTP ${mcpRes?.status}: ${handlerKey}` };
      }

      return { ok: true, output: await mcpRes.json().catch(() => ({})) };
    }

    case 'terminal': {
      if (smoke) {
        return {
          ok: true,
          output: { smoke: true, skipped: true, note: 'terminal smoke short-circuit' },
        };
      }
      const termUrl = env.TERMINAL_WS_URL
        ? env.TERMINAL_WS_URL.replace('wss://', 'https://').replace('ws://', 'http://')
        : null;
      if (!termUrl) return { ok: false, error: 'terminal not configured' };
      let nodeSchema = {};
      try { nodeSchema = JSON.parse(node?.input_schema_json || '{}'); } catch (_) {}
      // Also check if previous agent node embedded a command in its JSON result
      let _agentCmd = '';
      if (input?.result) {
        try {
          const _r = JSON.parse(input.result);
          _agentCmd = _r?.command || _r?.cmd || _r?.wrangler_command || '';
        } catch (_) {}
      }
      const cmd = input?.command || input?.cmd || _agentCmd || nodeSchema?.default_command || '';
      if (!cmd) return { ok: false, error: 'no command in terminal node input' };
      if (/[;&|`$><\\]/.test(cmd)) {
        return { ok: false, error: 'command contains unsafe characters' };
      }
      const tRes = await fetch(`${termUrl.replace(/\/$/, '')}/exec`, {
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
      if (smoke) {
        return {
          ok: true,
          output: { status: 'approved', smoke: true, skipped: true },
        };
      }
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

function pickUsageFromNodeOutput(nodeOutput) {
  const o = nodeOutput?.output;
  if (!o || typeof o !== 'object') return { tin: 0, tout: 0, cost: 0 };
  const u = o.usage && typeof o.usage === 'object' ? o.usage : o;
  const tin = Number(u.input_tokens ?? u.prompt_tokens ?? o.tokens_in ?? 0) || 0;
  const tout = Number(u.output_tokens ?? u.completion_tokens ?? o.tokens_out ?? 0) || 0;
  const cost = Number(o.cost_usd ?? u.cost_usd ?? 0) || 0;
  return { tin, tout, cost };
}

function pickModelFromNodeOutput(nodeOutput) {
  const o = nodeOutput?.output;
  if (!o || typeof o !== 'object') return null;
  const u = o.usage && typeof o.usage === 'object' ? o.usage : o;
  const m = o.model_key ?? o.model ?? u.model_key ?? u.model ?? null;
  if (m == null || String(m).trim() === '') return null;
  return String(m).slice(0, 500);
}

/**
 * Canonical execution ledger row — agentsam_execution_steps.execution_id FK targets this id (not wrun_*).
 * Mirrors src/core/workflows.js flat runner.
 */
async function insertAgentsamExecutionForGraph(env, execCols, { tenantId, workspaceId, userId, runId, workflowKey }) {
  if (!env?.DB || !execCols?.size || !execCols.has('task_id')) return null;
  const workflowExecId = `exec_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const wfKey = workflowKey != null ? String(workflowKey).slice(0, 500) : '';
  const uid =
    userId != null && String(userId).trim() !== ''
      ? await resolveCanonicalUserId(String(userId).trim(), env)
      : null;
  try {
    if (execCols.has('model_key')) {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO agentsam_executions
         (id, tenant_id, workspace_id, user_id, command_run_id, task_id, execution_type, command,
          status, duration_ms, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,unixepoch())`,
      )
        .bind(
          workflowExecId,
          tenantId ?? null,
          workspaceId,
          uid,
          null,
          runId,
          'workflow',
          wfKey || null,
          'running',
          0,
        )
        .run();
    } else {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO agentsam_executions
         (id, tenant_id, workspace_id, user_id, task_id, execution_type, command, duration_ms, created_at)
         VALUES (?,?,?,?,?,?,?,?,unixepoch())`,
      )
        .bind(workflowExecId, tenantId ?? null, workspaceId, uid, runId, 'workflow', wfKey || null, 0)
        .run();
    }
    return workflowExecId;
  } catch (e) {
    console.warn('[workflow-graph] agentsam_executions insert failed', e?.message ?? e);
    return null;
  }
}

/** Pending step row — execution_id references agentsam_workflow_runs.id (runId). */
function ffPendingExecutionStep(db, cols, stepId, executionParentId, workflowRunId, node, inputPayload) {
  if (!db || !cols?.size) return;
  const hasExecCol = cols.has('execution_id');
  const hasWrunCol = cols.has('workflow_run_id');
  if (!hasExecCol && !hasWrunCol) return;
  if (hasExecCol && !executionParentId) return;

  const nk = String(node?.node_key ?? '').slice(0, 500);
  const nt = String(node?.node_type ?? '').slice(0, 120);
  const ij = JSON.stringify(inputPayload ?? {}).slice(0, 8000);

  const colNames = [];
  const placeholders = [];
  const binds = [];

  colNames.push('id');
  placeholders.push('?');
  binds.push(stepId);
  if (hasExecCol) {
    colNames.push('execution_id');
    placeholders.push('?');
    binds.push(executionParentId);
  }
  if (hasWrunCol) {
    colNames.push('workflow_run_id');
    placeholders.push('?');
    binds.push(workflowRunId);
  }
  colNames.push('node_key', 'node_type', 'status', 'input_json');
  placeholders.push('?', '?', '?', '?');
  binds.push(nk, nt, 'running', ij);
  if (cols.has('attempt')) {
    colNames.push('attempt');
    placeholders.push('?');
    binds.push(1);
  }
  if (cols.has('started_at')) {
    colNames.push('started_at');
    placeholders.push('?');
    binds.push(Math.floor(Date.now() / 1000));
  }
  colNames.push('created_at');
  placeholders.push(`datetime('now')`);

  const sql = `INSERT INTO agentsam_execution_steps (${colNames.join(', ')}) VALUES (${placeholders.join(', ')})`;
  void db
    .prepare(sql)
    .bind(...binds)
    .run()
    .catch((e) => console.warn('[workflow-graph] execution_steps insert', e?.message ?? e));
}

/** Fire-and-forget completion update — keyed by step id. */
function ffCompleteExecutionStep(db, cols, stepId, nodeStartMs, nodeOutput) {
  if (!db || !cols?.size || !stepId) return;
  const ok = !!nodeOutput?.ok;
  const latency = Math.max(0, Date.now() - nodeStartMs);
  const outJson = JSON.stringify(nodeOutput ?? {}).slice(0, 16000);
  const errObj = ok ? '{}' : JSON.stringify({ message: String(nodeOutput?.error ?? 'failed') }).slice(0, 8000);
  const { tin, tout, cost } = pickUsageFromNodeOutput(nodeOutput);
  const sets = [];
  const binds = [];
  sets.push('status = ?');
  binds.push(ok ? 'success' : 'failed');
  if (cols.has('output_json')) {
    sets.push('output_json = ?');
    binds.push(outJson);
  }
  if (cols.has('error_json')) {
    sets.push('error_json = ?');
    binds.push(errObj);
  }
  if (cols.has('completed_at')) sets.push('completed_at = unixepoch()');
  if (cols.has('latency_ms')) {
    sets.push('latency_ms = ?');
    binds.push(latency);
  }
  if (cols.has('tokens_in')) {
    sets.push('tokens_in = ?');
    binds.push(tin);
  }
  if (cols.has('tokens_out')) {
    sets.push('tokens_out = ?');
    binds.push(tout);
  }
  if (cols.has('cost_usd')) {
    sets.push('cost_usd = ?');
    binds.push(cost);
  }
  binds.push(stepId);
  const sql = `UPDATE agentsam_execution_steps SET ${sets.join(', ')} WHERE id = ?`;
  void db
    .prepare(sql)
    .bind(...binds)
    .run()
    .catch((e) => console.warn('[workflow-graph] execution_steps complete', e?.message ?? e));
}

function ffPatchExecutionStepEdge(db, cols, stepId, edge) {
  if (!db || !cols?.has?.('edge_taken') || !stepId || !edge) return;
  const label = String(edge.edge_key ?? edge.id ?? `${edge.from_node_key}->${edge.to_node_key}`).slice(0, 500);
  void db
    .prepare(`UPDATE agentsam_execution_steps SET edge_taken = ? WHERE id = ?`)
    .bind(label, stepId)
    .run()
    .catch((e) => console.warn('[workflow-graph] execution_steps edge_taken', e?.message ?? e));
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
    triggerType: triggerTypeRaw,
    toolBridge = null,
    onStep = null,
    onRunCreated = null,
  } = opts;

  if (!env.DB) return { ok: false, error: 'DB not available' };

  const triggerType = normalizeTriggerType(triggerTypeRaw);

  const workflow = await env.DB.prepare(
    `SELECT * FROM agentsam_workflows WHERE workflow_key = ? AND is_active = 1 LIMIT 1`,
  )
    .bind(workflowKey)
    .first();
  if (!workflow) return { ok: false, error: `workflow not found: ${workflowKey}` };

  const mcpRow = await resolveMcpWorkflowRow(env.DB, workflowKey, tenantId, workspaceId);
  const dagIds = [mcpRow?.id, workflow.id].filter(Boolean);
  const seen = new Set();
  const orderedDagIds = dagIds.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  let nodes = [];
  let edges = [];
  let dagWorkflowId = null;
  for (const wid of orderedDagIds) {
    const nRes = await env.DB.prepare(
      `SELECT * FROM agentsam_workflow_nodes
       WHERE workflow_id = ? AND COALESCE(is_active, 1) = 1 ORDER BY sort_order ASC`,
    )
      .bind(wid)
      .all();
    const eRes = await env.DB.prepare(
      `SELECT * FROM agentsam_workflow_edges WHERE workflow_id = ? ORDER BY priority ASC`,
    )
      .bind(wid)
      .all();
    const nl = nRes?.results || [];
    if (nl.length) {
      nodes = nl;
      edges = eRes?.results || [];
      dagWorkflowId = wid;
      break;
    }
  }

  if (!nodes?.length) return { ok: false, error: 'no nodes found for workflow' };

  const runWorkflowId = mcpRow?.id ?? dagWorkflowId ?? workflow.id;

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
      ?, ?, ?, 'running',
      ?, '{}', '[]', '{}',
      ?, 0, 'production',
      1, ?,
      unixepoch(), datetime('now'), datetime('now')
    )`,
  )
    .bind(
      runId,
      runWorkflowId,
      workflowKey,
      tenantId,
      workspaceId,
      userId ?? null,
      userEmail ?? null,
      triggerType,
      JSON.stringify(input ?? {}),
      nodes.length,
      firstKey,
    )
    .run();

  const runStartedAt = Date.now();
  try {
    onRunCreated?.(runId, { steps_total: nodes.length });
  } catch (_) {
    /* non-fatal */
  }

  const canonicalUserId = await resolveCanonicalUserId(userId, env);
  const stepCols = await pragmaTableInfo(env.DB, 'agentsam_execution_steps');
  const execCols = await pragmaTableInfo(env.DB, 'agentsam_executions');
  const workflowExecId = await insertAgentsamExecutionForGraph(env, execCols, {
    tenantId,
    workspaceId,
    userId,
    runId,
    workflowKey,
  });

  const nodeMap = Object.fromEntries(nodes.map((n) => [n.node_key, n]));
  const edgeMap = {};
  for (const e of edges || []) {
    if (!edgeMap[e.from_node_key]) edgeMap[e.from_node_key] = [];
    edgeMap[e.from_node_key].push(e);
  }

  const runMeta = { tenantId, workspaceId, userId: canonicalUserId };
  const runContext = {
    runId,
    runMeta,
    workflowRunId: runId,
    canonicalUserId,
    workflowExecId,
    toolBridge,
    workflowKey,
  };
  const stepResults = [];
  let currentNodeKey = firstKey;
  let stepsCompleted = 0;
  let totalCostUsd = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let lastModelUsed = null;
  let runOk = true;
  let killReason = null;
  let previousStepId = null;

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

    const stepId = `estep_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const nodeStartTime = Date.now();
    ffPendingExecutionStep(env.DB, stepCols, stepId, runId, runId, node, nodeInput);

    if (false && tenantId && previousStepId && workspaceId) {
      // dep_graph FKs to agentsam_tool_chain — not estep IDs. Disabled.
      void insertExecutionDependencyGraphEdge(env, tenantId, stepId, previousStepId, workspaceId).catch(
        () => {},
      );
    }

    const nodeOutput = await dispatchNode(env, node, nodeInput, {
      ...runContext,
      node,
      executionStepId: stepId,
    }).catch((e) => ({
      ok: false,
      error: e?.message || String(e),
    }));

    ffCompleteExecutionStep(env.DB, stepCols, stepId, nodeStartTime, nodeOutput);

    const usage = pickUsageFromNodeOutput(nodeOutput);
    totalInputTokens += usage.tin;
    totalOutputTokens += usage.tout;
    totalCostUsd += usage.cost;
    const stepModel = pickModelFromNodeOutput(nodeOutput);
    if (stepModel) lastModelUsed = stepModel;

    previousStepId = stepId;

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

    try {
      onStep?.({
        run_id: runId,
        workflow_key: workflowKey,
        node_key: currentNodeKey,
        current_node_key: currentNodeKey,
        steps_completed: stepsCompleted,
        steps_total: nodes.length,
        input_tokens: totalInputTokens,
        output_tokens: totalOutputTokens,
        cost_usd: totalCostUsd,
        ok: nodeOutput.ok,
      });
    } catch (_) {
      /* ignore stream errors */
    }

    if (!nodeOutput.ok) {
      runOk = false;
      killReason = nodeOutput.error || 'node_failed';
      break;
    }

    if (node.node_type === 'approval_gate' && nodeOutput.output?.status === 'pending') {
      await env.DB
        .prepare(
          `UPDATE agentsam_workflow_runs SET
          status         = 'awaiting_approval',
          input_tokens   = ?,
          output_tokens  = ?,
          cost_usd       = ?,
          model_used     = ?,
          updated_at     = datetime('now')
        WHERE id = ?`,
        )
        .bind(totalInputTokens, totalOutputTokens, totalCostUsd, lastModelUsed, runId)
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
    let chosenEdge = null;
    for (const edge of outEdges) {
      if (evaluateEdge(edge, nodeOutput)) {
        nextNodeKey = edge.to_node_key;
        chosenEdge = edge;
        break;
      }
    }

    ffPatchExecutionStepEdge(env.DB, stepCols, stepId, chosenEdge);

    currentNodeKey = nextNodeKey;
  }

  // 6. Finalize run row
  const finalStatus = runOk ? 'completed' : 'failed';
  const lastOutput = stepResults[stepResults.length - 1]?.output ?? {};
  const runDurationMs = Math.max(0, Date.now() - runStartedAt);

  const killClause = killReason ? 'kill_reason = ?,' : '';
  const killBinds = killReason ? [killReason] : [];
  const errClause = !runOk && killReason ? 'error_message = ?,' : '';
  const errBinds = !runOk && killReason ? [String(killReason).slice(0, 4000)] : [];

  await env.DB
    .prepare(
      `UPDATE agentsam_workflow_runs SET
      status            = ?,
      output_json       = ?,
      step_results_json = ?,
      steps_completed   = ?,
      input_tokens      = ?,
      output_tokens     = ?,
      cost_usd          = ?,
      model_used        = ?,
      duration_ms       = ?,
      completed_at      = unixepoch(),
      ${killClause}
      ${errClause}
      updated_at        = datetime('now')
    WHERE id = ?`,
    )
    .bind(
      finalStatus,
      JSON.stringify(lastOutput),
      JSON.stringify(stepResults),
      stepsCompleted,
      totalInputTokens,
      totalOutputTokens,
      totalCostUsd,
      lastModelUsed,
      runDurationMs,
      ...killBinds,
      ...errBinds,
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

export async function executeWorkflowAndStream(
  env,
  workflowKey,
  inputOrMessage,
  authUser,
  workspaceId,
  controller,
  streamOpts = {},
) {
  const encoder = new TextEncoder();
  const send = (data) => {
    try {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
    } catch {
      /* stream already closed */
    }
  };

  const input =
    typeof inputOrMessage === 'string'
      ? { message: inputOrMessage }
      : inputOrMessage && typeof inputOrMessage === 'object'
        ? inputOrMessage
        : { message: String(inputOrMessage || '') };

  const { toolBridge: streamToolBridge } = streamOpts;
  const mergedBridge =
    streamToolBridge && typeof streamToolBridge === 'object'
      ? { ...streamToolBridge, emitSse: send }
      : { emitSse: send };

  const result = await executeWorkflowGraph(env, {
    workflowKey,
    input,
    tenantId: authUser?.tenant_id ?? null,
    workspaceId,
    userId: authUser?.id ?? null,
    userEmail: authUser?.email ?? null,
    toolBridge: mergedBridge,
    onRunCreated: (runId, meta) =>
      send({
        type: 'workflow_start',
        workflow_key: workflowKey,
        run_id: runId,
        steps_total: meta?.steps_total ?? null,
      }),
    onStep: (evt) => send({ type: 'workflow_step', ...evt }),
  }).catch((e) => ({
    ok: false,
    status: 'error',
    run_id: null,
    step_results: [],
    kill_reason: e?.message || String(e),
  }));

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
