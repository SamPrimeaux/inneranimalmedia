/**
 * Real implementations for workflow graph node types (db_query, script, eval, ui.*, mcp_tool helpers).
 * Used by workflow-executor dispatchNode and agent-step handler_key registry.
 */
import { runBuiltinTool } from '../tools/ai-dispatch.js';
import { runHyperdriveQuery, isHyperdriveUsable } from './hyperdrive-query.js';
import { appendWorkflowEvent } from './agentsam-workflow-debug-store.js';
import { pragmaTableInfo } from './retention.js';
import { registerAgentStepHandler } from './agent-step.js';

/** @param {unknown} input */
export function flattenWorkflowInput(input) {
  if (input == null) return {};
  if (typeof input === 'string') {
    try {
      const j = JSON.parse(input);
      if (j && typeof j === 'object' && !Array.isArray(j)) return { ...j, result: input };
    } catch {
      return { result: input, message: input };
    }
    return { result: input, message: input };
  }
  if (typeof input !== 'object' || Array.isArray(input)) return { value: input };
  const o = /** @type {Record<string, unknown>} */ ({ ...input });
  if (o.output && typeof o.output === 'object' && !Array.isArray(o.output)) {
    Object.assign(o, /** @type {Record<string, unknown>} */ (o.output));
  }
  if (typeof o.result === 'string') {
    try {
      const inner = JSON.parse(o.result);
      if (inner && typeof inner === 'object' && !Array.isArray(inner)) Object.assign(o, inner);
    } catch {
      /* keep */
    }
  }
  return o;
}

/** @param {Record<string, unknown>} obj @param {string} path */
function getByPath(obj, path) {
  const parts = String(path || '').split('.').filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = /** @type {Record<string, unknown>} */ (cur)[p];
  }
  return cur;
}

function parseNodeConfig(node) {
  const raw = node?.handler_config ?? node?.config_json ?? node?.input_schema_json ?? '{}';
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return /** @type {Record<string, unknown>} */ (raw);
  }
  try {
    const o = JSON.parse(String(raw || '{}'));
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}

function newId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

/** @param {any} env @param {string} sql @param {unknown[]} [binds] */
async function d1All(env, sql, binds = []) {
  if (!env?.DB) return { ok: false, error: 'DB not available', rows: [] };
  try {
    const stmt = env.DB.prepare(sql);
    const { results } = binds.length ? await stmt.bind(...binds).all() : await stmt.all();
    return { ok: true, rows: results || [] };
  } catch (e) {
    return { ok: false, error: e?.message ?? String(e), rows: [] };
  }
}

const DB_QUERY_HANDLERS = {
  async 'db.audit_workflow_tables'(env, _input, ctx) {
    const queries = {
      workflows: `SELECT COUNT(*) AS c FROM agentsam_workflows WHERE COALESCE(is_active, 1) = 1`,
      nodes: `SELECT COUNT(*) AS c FROM agentsam_workflow_nodes WHERE COALESCE(is_active, 1) = 1`,
      edges: `SELECT COUNT(*) AS c FROM agentsam_workflow_edges`,
      runs: `SELECT COUNT(*) AS c FROM agentsam_workflow_runs`,
      runs_failed: `SELECT COUNT(*) AS c FROM agentsam_workflow_runs WHERE status = 'failed'`,
      orphan_nodes: `
        SELECT COUNT(*) AS c FROM agentsam_workflow_nodes n
        WHERE COALESCE(n.is_active, 1) = 1
          AND NOT EXISTS (
            SELECT 1 FROM agentsam_workflows w WHERE w.id = n.workflow_id
          )`,
    };
    const out = {};
    for (const [key, sql] of Object.entries(queries)) {
      const r = await d1All(env, sql);
      out[key] = r.ok ? (r.rows[0]?.c ?? r.rows[0]) : { error: r.error };
    }
    return { ok: true, output: { audit: out, workspace_id: ctx.workspaceId } };
  },

  async 'db.collect_agent_usage_events'(env, _input, ctx) {
    const tid = ctx.tenantId;
    const wid = ctx.workspaceId;
    let sql = `
      SELECT status, COUNT(*) AS c,
             SUM(COALESCE(cost_usd, 0)) AS cost_usd,
             SUM(COALESCE(input_tokens, 0)) AS input_tokens,
             SUM(COALESCE(output_tokens, 0)) AS output_tokens
      FROM agentsam_workflow_runs
      WHERE 1=1`;
    const binds = [];
    if (tid) {
      sql += ` AND tenant_id = ?`;
      binds.push(tid);
    }
    if (wid) {
      sql += ` AND workspace_id = ?`;
      binds.push(wid);
    }
    sql += ` GROUP BY status ORDER BY c DESC`;
    const byStatus = await d1All(env, sql, binds);
    const recent = await d1All(
      env,
      `SELECT id, workflow_key, status, cost_usd, input_tokens, output_tokens,
              steps_completed, steps_total, started_at, completed_at
       FROM agentsam_workflow_runs
       ${tid || wid ? 'WHERE ' + [tid && 'tenant_id = ?', wid && 'workspace_id = ?'].filter(Boolean).join(' AND ') : ''}
       ORDER BY started_at DESC LIMIT 50`,
      binds,
    );
    return {
      ok: true,
      output: {
        by_status: byStatus.rows,
        recent_runs: recent.rows,
        collected_at: new Date().toISOString(),
      },
    };
  },

  async 'db.persist_analytics_rollup'(env, input, ctx) {
    const flat = flattenWorkflowInput(input);
    const rollup = flat.datasets ?? flat.rollup ?? flat;
    const key = `workflow_rollup:${ctx.workspaceId || 'global'}:${Date.now().toString(36)}`;
    if (env?.KV?.put) {
      await env.KV.put(key, JSON.stringify({ rollup, saved_at: Date.now() }), {
        expirationTtl: 60 * 60 * 24 * 14,
      });
    }
    return { ok: true, output: { kv_key: key, persisted: true, rollup_preview: rollup } };
  },

  async 'db.upsert_agentsam_artifact'(env, input, ctx) {
    const flat = flattenWorkflowInput(input);
    const cols = await pragmaTableInfo(env.DB, 'agentsam_artifacts');
    if (!cols.size) return { ok: false, error: 'agentsam_artifacts table missing' };

    const artifactId = String(flat.artifact_id || flat.id || newId('art'));
    const r2Key = String(flat.r2_key || flat.r2Key || '').trim();
    const name = String(flat.name || flat.title || 'workflow artifact').slice(0, 500);
    const content = flat.content ?? flat.body ?? flat.artifact_content;

    const bucket = env.DASHBOARD || env.ASSETS || env.R2;
    if (bucket?.put && r2Key && content != null) {
      const body = typeof content === 'string' ? content : JSON.stringify(content);
      await bucket.put(r2Key, body, {
        httpMetadata: { contentType: flat.content_type || 'application/json' },
      });
    }

    const row = {
      id: artifactId,
      tenant_id: ctx.tenantId,
      workspace_id: ctx.workspaceId,
      user_id: ctx.userId,
      name,
      description: String(flat.description || '').slice(0, 2000) || null,
      artifact_type: String(flat.artifact_type || 'json').slice(0, 64),
      r2_key: r2Key || null,
      public_url: flat.public_url || flat.url || null,
      source: 'workflow_graph',
      source_workflow_id: ctx.workflowKey || null,
      source_run_id: ctx.runId || null,
      file_size_bytes: content != null ? new TextEncoder().encode(String(content)).length : 0,
      is_public: flat.is_public ? 1 : 0,
    };
    if (cols.has('metadata_json')) {
      row.metadata_json = JSON.stringify({ workflow_run_id: ctx.runId, node: flat.node_key });
    }

    const names = [];
    const ph = [];
    const binds = [];
    for (const [k, v] of Object.entries(row)) {
      if (v === undefined) continue;
      if (!cols.has(k.toLowerCase())) continue;
      names.push(k);
      ph.push('?');
      binds.push(v);
    }
    if (!names.length) return { ok: false, error: 'no insertable artifact columns' };

    const sql = cols.has('updated_at')
      ? `INSERT OR REPLACE INTO agentsam_artifacts (${names.join(', ')}) VALUES (${ph.join(', ')})`
      : `INSERT INTO agentsam_artifacts (${names.join(', ')}) VALUES (${ph.join(', ')})`;
    await env.DB.prepare(sql).bind(...binds).run();

    return {
      ok: true,
      output: { artifact_id: artifactId, r2_key: r2Key, name, registered: true },
    };
  },
};

const SCRIPT_HANDLERS = {
  async 'script.r2_put_artifact'(env, input, ctx) {
    const flat = flattenWorkflowInput(input);
    const bucket = env.DASHBOARD || env.ASSETS;
    if (!bucket?.put) return { ok: false, error: 'No R2 binding (DASHBOARD/ASSETS)' };
    const r2Key = String(flat.r2_key || flat.key || `artifacts/workflow/${ctx.runId || 'run'}/${Date.now()}.json`);
    const body =
      flat.content ?? flat.body ?? flat.artifact_content ?? JSON.stringify(flat, null, 2);
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    await bucket.put(r2Key, text, {
      httpMetadata: { contentType: flat.content_type || 'application/json' },
    });
    return {
      ok: true,
      output: {
        r2_key: r2Key,
        bytes: new TextEncoder().encode(text).length,
        bucket: 'DASHBOARD',
      },
    };
  },

  async 'script.audit_hyperdrive_bindings'(env) {
    const bindings = {
      HYPERDRIVE: isHyperdriveUsable(env),
      DB: !!env?.DB,
      KV: !!env?.KV,
      DASHBOARD: !!env?.DASHBOARD,
      ASSETS: !!env?.ASSETS,
      AI: !!env?.AI,
      TERMINAL_WS_URL: !!(env?.TERMINAL_WS_URL && String(env.TERMINAL_WS_URL).trim()),
    };
    let hyperdrive_probe = null;
    if (isHyperdriveUsable(env)) {
      const probe = await runHyperdriveQuery(env, 'SELECT 1 AS ok', []);
      hyperdrive_probe = probe.ok ? 'connected' : probe.error;
    }
    return {
      ok: true,
      output: {
        bindings,
        hyperdrive_probe,
        note: 'Non-secret binding presence only',
      },
    };
  },
};

const EVAL_HANDLERS = {
  'eval.patch_plan_quality'(flat) {
    const text = JSON.stringify(flat);
    const hasPath = /\b(src\/|dashboard\/|\.tsx?|\.jsx?|\.js)\b/i.test(text);
    const hasTest = /\b(test|vitest|playwright|npm run)\b/i.test(text);
    const vague = /\b(maybe|consider|might|possibly)\b/i.test(text);
    return {
      passed: hasPath && !vague,
      has_file_paths: hasPath,
      has_tests_mentioned: hasTest,
      vague_language: vague,
    };
  },
  'eval.workflow_graph_health'(flat, _input, ctx, env) {
    return DB_QUERY_HANDLERS['db.audit_workflow_tables'](env, {}, ctx).then((r) => ({
      passed: r.ok && r.output?.audit?.workflows?.c > 0,
      audit: r.output?.audit,
    }));
  },
  'eval.artifact_payload'(flat) {
    const name = flat.name || flat.title;
    const r2 = flat.r2_key || flat.planned_r2_key;
    const size = Number(flat.size_bytes || flat.file_size_bytes || 0);
    return {
      passed: !!name && !!r2 && size >= 0,
      name,
      r2_key: r2,
      size_bytes: size,
    };
  },
  'eval.chart_dataset_contract'(flat) {
    const ds = flat.datasets || flat.charts || flat;
    const hasSeries = Array.isArray(ds)
      ? ds.length > 0
      : typeof ds === 'object' && ds != null && Object.keys(ds).length > 0;
    return { passed: hasSeries, dataset_keys: typeof ds === 'object' && ds ? Object.keys(ds) : [] };
  },
  'agentsam.qa.assertions'(flat) {
    const ok =
      flat.ok === true ||
      flat.passed === true ||
      (flat.capture != null && flat.screenshot != null) ||
      (flat.output && typeof flat.output === 'object' && flat.output.ok !== false);
    return { passed: ok, ok, evidence_present: ok };
  },
  'eval_cms_live_editor_contract'(flat) {
    const manifest = flat.manifest || flat.dev_app_manifest || flat.output?.manifest;
    const r2 = flat.r2_key || flat.planned_r2_key || flat.output?.r2_key;
    const passed = !!(manifest || r2);
    return { passed, pass: passed ? 1 : 0, has_manifest: !!manifest, has_r2: !!r2 };
  },
};

const MCP_HANDLER_TOOL_ALIASES = {
  'terminal.hyperdrive_connectivity_check': 'hyperdrive_query',
};

/**
 * @param {any} env
 * @param {Record<string, unknown>} runContext
 */
function workflowHandlerContext(env, runContext, node) {
  const meta = runContext?.runMeta || {};
  return {
    tenantId: meta.tenantId ?? runContext?.tenantId ?? null,
    workspaceId: meta.workspaceId ?? runContext?.workspaceId ?? null,
    userId: meta.userId ?? runContext?.userId ?? null,
    runId: runContext?.runId ?? null,
    workflowKey: runContext?.workflowKey ?? null,
    nodeKey: node?.node_key ?? null,
    smoke: Boolean(runContext?.smoke),
    toolBridge: runContext?.toolBridge ?? null,
  };
}

/**
 * @param {any} env
 * @param {string} handlerKey
 * @param {unknown} input
 * @param {Record<string, unknown>} runContext
 * @param {Record<string, unknown>} node
 */
export async function executeWorkflowDbQuery(env, handlerKey, input, runContext, node) {
  if (runContext?.smoke) {
    return { ok: true, output: { smoke: true, skipped: true, handler_key: handlerKey } };
  }
  const ctx = workflowHandlerContext(env, runContext, node);
  const hk = String(handlerKey || '').trim();
  const fn = DB_QUERY_HANDLERS[hk];
  if (fn) return fn(env, input, ctx);

  const cfg = parseNodeConfig(node);
  const flat = flattenWorkflowInput(input);
  const sql = String(cfg.sql || flat.sql || '').trim();
  if (!sql) {
    return { ok: false, error: `db_query: no handler or sql for ${hk || node.node_key}` };
  }
  if (!/^\s*select\b/i.test(sql)) {
    return { ok: false, error: 'db_query: only SELECT allowed inline (use handler or d1_write tool)' };
  }
  const binds = Array.isArray(cfg.params) ? cfg.params : [];
  const r = await d1All(env, sql, binds);
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, output: { rows: r.rows, row_count: r.rows.length, sql: sql.slice(0, 500) } };
}

/**
 * @param {any} env
 * @param {string} handlerKey
 * @param {unknown} input
 * @param {Record<string, unknown>} runContext
 * @param {Record<string, unknown>} node
 */
export async function executeWorkflowScript(env, handlerKey, input, runContext, node) {
  if (runContext?.smoke) {
    return { ok: true, output: { smoke: true, skipped: true, handler_key: handlerKey } };
  }
  const hk = String(handlerKey || '').trim();
  const fn = SCRIPT_HANDLERS[hk];
  if (fn) {
    const ctx = workflowHandlerContext(env, runContext, node);
    return fn(env, input, ctx);
  }
  const toolName = hk.startsWith('script.') ? hk.slice(7) : hk;
  const toolRes = await runBuiltinTool(env, toolName, flattenWorkflowInput(input), runContext);
  if (toolRes?.error) return { ok: false, error: String(toolRes.error) };
  return { ok: true, output: toolRes };
}

/**
 * @param {any} env
 * @param {string} handlerKey
 * @param {unknown} input
 * @param {Record<string, unknown>} runContext
 * @param {Record<string, unknown>} node
 */
export async function executeWorkflowUiEmit(env, handlerKey, input, runContext, node) {
  const flat = flattenWorkflowInput(input);
  const ctx = workflowHandlerContext(env, runContext, node);
  const payload = {
    type: 'workflow_ui_event',
    handler_key: handlerKey,
    node_key: node?.node_key,
    run_id: ctx.runId,
    workflow_key: ctx.workflowKey,
    summary: flat.summary || flat.message || flat.result || node?.title,
    input_preview: JSON.stringify(flat).slice(0, 2000),
    at: new Date().toISOString(),
  };

  if (typeof ctx.toolBridge?.emitSse === 'function') {
    try {
      ctx.toolBridge.emitSse({ type: 'workflow_timeline', ...payload });
    } catch {
      /* stream closed */
    }
  }

  if (isHyperdriveUsable(env) && ctx.tenantId && ctx.workspaceId) {
    try {
      await appendWorkflowEvent(env, {
        run_id: ctx.runId,
        tenant_id: ctx.tenantId,
        workspace_id: ctx.workspaceId,
        event_type: String(handlerKey || 'ui.emit').slice(0, 64),
        event_level: 'info',
        message: String(payload.summary || '').slice(0, 500),
        payload_json: payload,
      });
    } catch (e) {
      console.warn('[workflow-ui-emit] supabase event', e?.message ?? e);
    }
  }

  return { ok: true, output: { emitted: true, ...payload } };
}

/**
 * @param {any} env
 * @param {string} handlerKey
 * @param {unknown} input
 * @param {Record<string, unknown>} runContext
 * @param {Record<string, unknown>} node
 */
export async function executeWorkflowEval(env, handlerKey, input, runContext, node) {
  const flat = flattenWorkflowInput(input);
  const hk = String(handlerKey || '').trim();

  if (hk && EVAL_HANDLERS[hk]) {
    const ctx = workflowHandlerContext(env, runContext, node);
    const out = await EVAL_HANDLERS[hk](flat, input, ctx, env);
    return { ok: true, output: { ...out, handler_key: hk } };
  }

  let qg = {};
  try {
    qg = JSON.parse(node.quality_gate_json || '{}');
  } catch {
    qg = {};
  }
  const assertions = qg.assertions || [];
  const results = assertions.map((a) => {
    const val = getByPath(flat, a.field) ?? flat[a.field];
    let pass = true;
    if (a.op === 'exists') pass = val != null && val !== '';
    else if (a.op === 'eq') pass = val === a.value;
    else if (a.op === 'gt') pass = Number(val) > Number(a.value);
    else if (a.op === 'gte') pass = Number(val) >= Number(a.value);
    else if (a.op === 'contains') pass = String(val ?? '').includes(String(a.value ?? ''));
    return { field: a.field, op: a.op, pass, value: val };
  });
  const passed = results.length ? results.every((r) => r.pass) : true;
  return {
    ok: true,
    output: { passed, assertion_count: results.length, results, handler_key: hk || null },
  };
}

/**
 * @param {unknown} input
 * @param {Record<string, unknown>} node
 */
export async function executeWorkflowBranch(input, node) {
  const flat = flattenWorkflowInput(input);
  let cfg = parseNodeConfig(node);
  try {
    const qg = JSON.parse(node.quality_gate_json || '{}');
    if (qg.branch_field) cfg = { ...cfg, ...qg };
  } catch {
    /* ignore */
  }
  const field = String(cfg.branch_field || 'branch');
  const val = getByPath(flat, field) ?? flat[field];
  const branch =
    val != null && String(val).trim() !== ''
      ? String(val).trim()
      : flat.passed === false
        ? 'failed'
        : 'default';
  return { ok: true, output: { branch, field, value: val, passed: flat.passed !== false } };
}

/**
 * Execute mcp_tool row with real builtin/tool dispatch when possible.
 * @param {any} env
 * @param {Record<string, unknown>} toolRow
 * @param {unknown} input
 * @param {Record<string, unknown>} runContext
 * @param {string} handlerKey
 */
export async function executeWorkflowMcpTool(env, toolRow, input, runContext, handlerKey) {
  if (runContext?.smoke) {
    return {
      ok: true,
      output: { smoke: true, skipped: true, handler_key: handlerKey },
    };
  }

  const flat = flattenWorkflowInput(input);
  const toolKey = String(toolRow.tool_key || '').trim();
  const handlerType = String(toolRow.handler_type || '').trim();

  if (['builtin', 'r2', 'terminal', 'proxy'].includes(handlerType)) {
    const alias = MCP_HANDLER_TOOL_ALIASES[handlerKey] || toolKey;
    const params = {
      ...flat,
      workspace_id: runContext?.workspaceId ?? runContext?.runMeta?.workspaceId,
      tenant_id: runContext?.tenantId ?? runContext?.runMeta?.tenantId,
      user_id: runContext?.userId ?? runContext?.runMeta?.userId,
    };
    if (handlerType === 'terminal' || alias.includes('terminal')) {
      const cmd = flat.command || flat.cmd;
      if (cmd) {
        const termRes = await runBuiltinTool(env, 'terminal_run', { command: cmd, ...params }, runContext);
        if (termRes?.error) return { ok: false, error: String(termRes.error) };
        return { ok: true, output: termRes };
      }
    }
    if (alias === 'hyperdrive_query' && !params.sql) {
      params.sql = 'SELECT 1 AS ok';
    }
    const toolRes = await runBuiltinTool(env, alias, params, runContext);
    if (toolRes?.error) {
      return {
        ok: false,
        error: `mcp_tool ${toolKey}: ${toolRes.error}`,
      };
    }
    return { ok: true, output: { tool: alias, result: toolRes } };
  }

  if (!toolRow.mcp_service_url) {
    return { ok: false, error: `no mcp_service_url for tool: ${handlerKey}` };
  }

  const mcpRes = await fetch(String(toolRow.mcp_service_url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method: toolKey, params: flat }),
  }).catch((e) => ({ ok: false, status: 0, _err: e }));

  if (!mcpRes?.ok) {
    return {
      ok: false,
      error: `mcp_tool HTTP ${mcpRes?.status ?? 0}: ${mcpRes?._err?.message ?? handlerKey}`,
    };
  }
  return { ok: true, output: await mcpRes.json().catch(() => ({})) };
}

const FLOW_PRIMITIVE_HANDLERS = [
  'workflow.trigger.manual',
  'workflow.trigger.agent',
  'workflow.trigger.scheduled',
  'workflow.process.pass_through',
  'workflow.process.merge_upstream',
  'workflow.output.final',
  'workflow.output.emit',
  'workflow.join.finish',
];

/** @param {any} env @param {unknown} input @param {Record<string, unknown>} runContext @param {Record<string, unknown>} node */
async function executeWorkflowTrigger(env, input, runContext, node) {
  if (runContext?.smoke) return { ok: true, output: { smoke: true, skipped: true } };
  const flat = flattenWorkflowInput(input);
  return { ok: true, output: { triggered: true, payload: flat, node_key: node?.node_key } };
}

/** @param {any} env @param {string} handlerKey @param {unknown} input @param {Record<string, unknown>} runContext @param {Record<string, unknown>} node */
async function executeWorkflowProcess(env, handlerKey, input, runContext, node) {
  if (runContext?.smoke) return { ok: true, output: { smoke: true, skipped: true } };
  const flat = flattenWorkflowInput(input);
  const hk = String(handlerKey || '').trim();
  if (hk && !hk.startsWith('workflow.process.')) {
    const scriptOut = await executeWorkflowScript(env, hk, input, runContext, node);
    if (scriptOut.ok) return scriptOut;
  }
  return { ok: true, output: { processed: true, merged: flat, node_key: node?.node_key } };
}

/** @param {unknown} input @param {Record<string, unknown>} node */
function executeWorkflowOutput(input, node) {
  const flat = flattenWorkflowInput(input);
  return { ok: true, output: { final: flat, node_key: node?.node_key } };
}

/**
 * Thompson subagent handlers (`handler_thompson_subagent_master` / `handler_thompson_subagent_worker`)
 * resolve via D1 `agentsam_workflow_handlers` with `executor_kind = agent_llm` in workflow-executor.js —
 * not via this script/eval registry.
 */
/** Register named handlers for agent-step.js (handler_key path). */
export function registerWorkflowStepHandlers() {
  for (const key of Object.keys(DB_QUERY_HANDLERS)) {
    registerAgentStepHandler(key, (env, { input, runContext, node, smoke }) =>
      executeWorkflowDbQuery(env, key, input, { ...runContext, smoke }, node),
    );
  }
  for (const key of Object.keys(SCRIPT_HANDLERS)) {
    registerAgentStepHandler(key, (env, { input, runContext, node, smoke }) =>
      executeWorkflowScript(env, key, input, { ...runContext, smoke }, node),
    );
  }
  for (const key of Object.keys(EVAL_HANDLERS)) {
    registerAgentStepHandler(key, (env, { input, runContext, node }) =>
      executeWorkflowEval(env, key, input, runContext, node),
    );
  }
  registerAgentStepHandler('browser.capture_context', async (env, { input, runContext, smoke }) => {
    if (smoke) return { ok: true, output: { smoke: true, skipped: true } };
    const { executeBrowserCaptureContext } = await import('./browser-capture-context.js');
    return executeBrowserCaptureContext(env, input, runContext);
  });
  for (const key of Object.keys(MCP_HANDLER_TOOL_ALIASES)) {
    registerAgentStepHandler(key, async (env, { input, runContext, node, smoke }) => {
      if (smoke) return { ok: true, output: { smoke: true, skipped: true } };
      const toolRes = await runBuiltinTool(
        env,
        MCP_HANDLER_TOOL_ALIASES[key],
        flattenWorkflowInput(input),
        runContext,
      );
      if (toolRes?.error) return { ok: false, error: String(toolRes.error) };
      return { ok: true, output: toolRes };
    });
  }
  for (const hk of [
    'ui.emit_workflow_timeline_event',
    'ui.emit_audit_card',
    'ui.emit_library_refresh',
    'ui.emit_hyperdrive_report',
  ]) {
    registerAgentStepHandler(hk, (env, args) =>
      executeWorkflowUiEmit(env, hk, args.input, args.runContext, args.node),
    );
  }
  for (const hk of FLOW_PRIMITIVE_HANDLERS) {
    if (hk.startsWith('workflow.trigger.')) {
      registerAgentStepHandler(hk, (env, { input, runContext, node, smoke }) =>
        executeWorkflowTrigger(env, input, { ...runContext, smoke }, node),
      );
    } else if (hk.startsWith('workflow.process.')) {
      registerAgentStepHandler(hk, (env, { input, runContext, node, smoke }) =>
        executeWorkflowProcess(env, hk, input, { ...runContext, smoke }, node),
      );
    } else if (hk.startsWith('workflow.output.') || hk === 'workflow.join.finish') {
      registerAgentStepHandler(hk, (env, { input, node }) =>
        executeWorkflowOutput(input, node),
      );
    }
  }
}

registerWorkflowStepHandlers();
