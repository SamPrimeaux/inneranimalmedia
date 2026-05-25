/**
 * Executes agentsam_workflow_nodes / agentsam_workflow_edges as a directed graph.
 * Persists state to agentsam_workflow_runs row by row.
 */
import {
  executeWorkflowDbQuery,
  executeWorkflowScript,
  executeWorkflowUiEmit,
  executeWorkflowEval,
  executeWorkflowBranch,
  executeWorkflowMcpTool,
  flattenWorkflowInput,
} from './workflow-node-handlers.js';
import { dispatchComplete } from './provider.js';
import { resolveModelForTask, normalizeCanonicalTaskType } from './resolveModel.js';
import { pragmaTableInfo } from './retention.js';
import { resolveCanonicalUserId } from '../api/auth.js';
import { insertExecutionDependencyGraphEdge } from '../api/command-run-telemetry.js';
import { extractBrowserNavigateUrl } from './extract-browser-url.js';

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

/** Normalize `agentsam_workflow_nodes.input_schema_json` (D1 may return string or object). */
function readWorkflowNodeInputSchemaJson(node) {
  const raw = node?.input_schema_json;
  if (raw == null) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return /** @type {Record<string, unknown>} */ (raw);
  }
  if (typeof raw === 'string') {
    try {
      const o = JSON.parse(raw || '{}');
      return o && typeof o === 'object' && !Array.isArray(o) ? /** @type {Record<string, unknown>} */ (o) : {};
    } catch (_) {
      return {};
    }
  }
  return {};
}

// ── Node type dispatchers ────────────────────────────────────────────

// ── executePrimitive ─────────────────────────────────────────────────────────
// Called by dispatchNode when a registry row is found for handler_key.
// Keeps dispatchNode thin — all new behavior lives in registry rows.
async function executePrimitive(env, executorKind, handlerKey, config, input, node, runContext) {
  emptyHandlerConfig(config, handlerKey, executorKind);
  switch (executorKind) {

    case 'passthrough':
      if (node?.node_type === 'branch') {
        const runInput = flattenWorkflowInput(runContext?.initialInput);
        const stepInput = flattenWorkflowInput(input);
        return executeWorkflowBranch({ ...runInput, ...stepInput }, node);
      }
      return { ok: true, result: input };

    case 'branch': {
      const runInput = flattenWorkflowInput(runContext?.initialInput);
      const stepInput = flattenWorkflowInput(input);
      return executeWorkflowBranch({ ...runInput, ...stepInput }, node);
    }

    case 'd1_sql': {
      const sql = String(config.sql || '').trim();
      if (!sql) {
        throw new Error(`Handler "${handlerKey}" d1_sql config missing "sql" field`);
      }
      const paramRoot = buildWorkflowParamRoot(input, runContext);
      const params = (config.params || []).map((p) => _resolvePath(paramRoot, p));
      if (/^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(sql)) {
        const runRes = await env.DB.prepare(sql).bind(...params).run();
        return {
          ok: true,
          result: { changes: runRes?.meta?.changes ?? 0, rows: [] },
        };
      }
      const { results } = await env.DB.prepare(sql).bind(...params).all();
      return { ok: true, result: { rows: results, count: results.length } };
    }

    case 'agent_llm': {
      const paramRoot = buildWorkflowParamRoot(input, runContext);
      const taskType = normalizeCanonicalTaskType(
        config.task_type || runContext?.workflowMeta?.default_task_type || 'agent',
      );
      const mode = config.mode || runContext?.workflowMeta?.default_mode || 'agent';
      const userMsg =
        typeof input === 'string'
          ? input
          : config.user_message_field
            ? paramRoot[config.user_message_field]
            : paramRoot.prompt ||
              paramRoot.message ||
              paramRoot.instruction ||
              paramRoot.capture ||
              JSON.stringify(paramRoot).slice(0, 12000);
      const result = await dispatchComplete(env, {
        modelKey: config.model_key,
        taskType,
        mode,
        systemPrompt:
          config.system_prompt ||
          'You are Agent Sam for Inner Animal Media. Return concise structured JSON or markdown.',
        messages: [{ role: 'user', content: String(userMsg ?? '').slice(0, 12000) }],
        userId: runContext?.canonicalUserId ?? paramRoot.user_id,
        options: config.options || { reasoningEffort: 'medium', verbosity: 'low' },
      });
      const text =
        result?.text ||
        result?.content?.[0]?.text ||
        result?.output ||
        JSON.stringify(result);
      return {
        ok: true,
        output: { result: text, model: result?.model, usage: result?.usage },
      };
    }

    case 'mcp_tool': {
      const toolKey = config.tool_key || handlerKey;
      const hkStr = String(toolKey || '').trim();
      const parts = hkStr.split('.');
      const splitKey = parts.length > 1 ? parts[parts.length - 1] : hkStr;
      const underscoreKey = hkStr.replace(/\./g, '_');
      const toolRow = env.DB
        ? await env.DB.prepare(
            `SELECT tool_key, mcp_service_url, handler_type, handler_config
             FROM agentsam_mcp_tools
             WHERE (tool_key = ? OR tool_key = ? OR tool_key = ?)
               AND is_active = 1 AND enabled = 1
             LIMIT 1`,
          )
            .bind(splitKey, underscoreKey, hkStr)
            .first()
            .catch(() => null)
        : null;
      if (!toolRow) {
        return { ok: false, error: `mcp_tool not found in agentsam_mcp_tools: ${handlerKey}` };
      }
      return executeWorkflowMcpTool(env, toolRow, input, runContext, hkStr);
    }

    case 'agent_step': {
      const stepKey = String(config.handler_key || handlerKey || '').trim();
      const stepMod = await import('./agent-step.js');
      if (!stepMod.isRegisteredAgentStepHandler(stepKey)) {
        return { ok: false, error: `agent_step not registered in agent-step.js: ${stepKey}` };
      }
      return stepMod.agentChatStep(env, {
        handler_key: stepKey,
        input,
        runContext,
        node,
        config,
      });
    }

    case 'catalog_tool': {
      const toolKey = String(config.tool_key || config.tool_code || '').trim();
      if (!toolKey) {
        return { ok: false, error: 'catalog_tool executor missing tool_key in handler_config_json' };
      }
      const paramRoot = buildWorkflowParamRoot(input, runContext);
      const { resolveCatalogToolParams } = await import('./extract-browser-url.js');
      const toolParams = resolveCatalogToolParams(config, paramRoot);
      const { dispatchByToolCode } = await import('./dispatch-by-tool-code.js');
      const toolRes = await dispatchByToolCode(
        env,
        toolKey,
        toolParams,
        {
          ...runContext,
          workspaceId: runContext?.runMeta?.workspaceId ?? runContext?.workspace_id,
          tenantId: runContext?.runMeta?.tenantId ?? runContext?.tenant_id,
          userId: runContext?.canonicalUserId ?? runContext?.runMeta?.userId,
        },
      );
      if (toolRes?.error) return { ok: false, error: String(toolRes.error) };
      return { ok: toolRes?.ok !== false, output: toolRes?.result ?? toolRes };
    }

    case 'script': {
      const scriptSlug = String(config.script_slug || config.scriptSlug || '').trim();
      if (!scriptSlug) {
        return {
          ok: false,
          error: 'script executor missing script_slug in handler_config_json',
        };
      }
      const { executeAgentsamScript } = await import('./execute-agentsam-script.js');
      return executeAgentsamScript(
        env,
        {
          scriptSlug,
          workspaceId: runContext?.runMeta?.workspaceId ?? runContext?.workspace_id,
          tenantId: runContext?.runMeta?.tenantId ?? runContext?.tenant_id,
          userId: runContext?.canonicalUserId ?? runContext?.runMeta?.userId,
          smoke: runContext?.smoke,
        },
        input,
        runContext,
      );
    }

    case 'builtin_tool': {
      console.warn(
        `[workflow] deprecated executor_kind=builtin_tool for ${handlerKey} — run migration 384`,
      );
      if (config.delegate === 'script' || String(handlerKey).startsWith('script_')) {
        return executeWorkflowScript(env, handlerKey, input, runContext, node);
      }
      const stepMod = await import('./agent-step.js');
      if (stepMod.isRegisteredAgentStepHandler(handlerKey)) {
        return stepMod.agentChatStep(env, { handler_key: handlerKey, input, runContext, node, config });
      }
      if (config.tool_key) {
        const { dispatchByToolCode } = await import('./dispatch-by-tool-code.js');
        const toolRes = await dispatchByToolCode(
          env,
          config.tool_key,
          { ...buildWorkflowParamRoot(input, runContext), ...(config.input_map || {}) },
          {
            ...runContext,
            workspaceId: runContext?.runMeta?.workspaceId ?? runContext?.workspace_id,
            tenantId: runContext?.runMeta?.tenantId ?? runContext?.tenant_id,
            userId: runContext?.canonicalUserId ?? runContext?.runMeta?.userId,
          },
        );
        if (toolRes?.error) return { ok: false, error: String(toolRes.error) };
        return { ok: toolRes?.ok !== false, output: toolRes?.result ?? toolRes };
      }
      return { ok: false, error: `builtin_tool not registered in agent-step.js: ${handlerKey}` };
    }

    case 'ui_emit': {
      const eventType = config.event_type || handlerKey.replace('ui.emit_', '').replace('ui.', '');
      runContext?.onStep?.({ event: eventType, payload: input });
      return { ok: true, result: { emitted: eventType } };
    }

    case 'eval': {
      const qg = config.quality_gate || config;
      const nodeWithQg = {
        ...node,
        quality_gate_json: JSON.stringify(
          Object.keys(qg).length ? qg : _safeJson(node.quality_gate_json || '{}'),
        ),
      };
      return executeWorkflowEval(env, handlerKey, input, runContext, nodeWithQg);
    }

    case 'terminal':
      return { ok: true, output: { terminal: true, handler_key: handlerKey, ...flattenWorkflowInput(input) } };

    case 'approval': {
      if (!env?.DB) return { ok: false, error: 'DB not available for approval gate' };
      const flat = buildWorkflowParamRoot(input, runContext);
      const approvalId = `appr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      const cols = await pragmaTableInfo(env.DB, 'agentsam_approval_queue');
      if (!cols.size) return { ok: false, error: 'agentsam_approval_queue table missing' };
      const row = {
        id: approvalId,
        tenant_id: flat.tenant_id,
        workspace_id: flat.workspace_id,
        user_id: flat.user_id,
        workflow_run_id: flat.run_id,
        workflow_key: runContext?.workflowKey ?? null,
        handler_key: handlerKey,
        tool_name: config.tool_name || handlerKey,
        action_summary: config.action_summary || node?.title || 'Workflow approval required',
        input_json: JSON.stringify(flat).slice(0, 8000),
        approval_type: config.approval_type || 'workflow',
        risk_level: config.risk_level || 'medium',
        status: 'pending',
        expires_at: Math.floor(Date.now() / 1000) + (Number(config.ttl_sec) || 86400),
      };
      const names = [];
      const ph = [];
      const binds = [];
      for (const [k, v] of Object.entries(row)) {
        if (!cols.has(k) || v === undefined) continue;
        names.push(k);
        ph.push('?');
        binds.push(v);
      }
      if (!names.length) return { ok: false, error: 'no insertable approval columns' };
      await env.DB.prepare(
        `INSERT INTO agentsam_approval_queue (${names.join(', ')}) VALUES (${ph.join(', ')})`,
      )
        .bind(...binds)
        .run();
      if (flat.run_id && cols.has('approval_id')) {
        await env.DB.prepare(
          `UPDATE agentsam_workflow_runs SET approval_id = ?, status = 'awaiting_approval', updated_at = datetime('now') WHERE id = ?`,
        )
          .bind(approvalId, flat.run_id)
          .run()
          .catch(() => null);
      }
      return {
        ok: true,
        output: {
          approval_id: approvalId,
          status: 'pending',
          awaiting_approval: true,
        },
      };
    }

    case 'http': {
      const url = config.url;
      if (!url) return { ok: false, error: 'http handler missing url in handler_config_json' };
      const method  = config.method || 'POST';
      const headers = { 'Content-Type': 'application/json', ...(config.headers || {}) };
      const resp = await fetch(url, {
        method,
        headers,
        body: method !== 'GET' ? JSON.stringify(input) : undefined,
      });
      const body = await resp.json().catch(() => ({}));
      return { ok: resp.ok, result: body, status: resp.status };
    }

    default:
      return { ok: false, error: `unknown executor_kind: ${executorKind} for handler: ${handlerKey}` };
  }
}

function _resolvePath(obj, path) {
  if (!path || !path.startsWith('$.')) return path;
  return path.slice(2).split('.').reduce((o, k) => o?.[k], obj) ?? null;
}

/** Merge run context + step input for d1_sql param bindings ($.run_id, $.workspace_id, …). */
function buildWorkflowParamRoot(input, runContext) {
  const flat = flattenWorkflowInput(input);
  const runId = runContext?.runId ?? runContext?.workflowRunId ?? null;
  const meta = runContext?.runMeta || {};
  return {
    ...flat,
    run_id: runId,
    workflow_run_id: runId,
    workspace_id: meta.workspaceId ?? flat.workspace_id ?? null,
    tenant_id: meta.tenantId ?? flat.tenant_id ?? null,
    user_id: meta.userId ?? runContext?.canonicalUserId ?? flat.user_id ?? null,
    input: flat,
    run: runId ? { id: runId } : {},
  };
}

/** Promote primitive `result` to `output` so step chaining and branch edges see one shape. */
function normalizeNodeOutput(nodeOutput) {
  if (nodeOutput == null || typeof nodeOutput !== 'object') return nodeOutput;
  if (nodeOutput.output != null) return nodeOutput;
  if (nodeOutput.result == null) return nodeOutput;
  return { ...nodeOutput, output: nodeOutput.result };
}

function emptyHandlerConfig(config, handlerKey, executorKind) {
  const passthrough = ['passthrough', 'approval'];
  if (passthrough.includes(executorKind)) return;
  if (!config || typeof config !== 'object' || Object.keys(config).length === 0) {
    throw new Error(
      `[workflow-executor] empty handler_config_json for executor_kind=${executorKind} handler_key=${handlerKey} — add config in agentsam_workflow_handlers`,
    );
  }
}

// ── resolveEntryNode ──────────────────────────────────────────────────────────
function resolveEntryNode(workflow, nodes, edges) {
  const meta = _safeJson(workflow?.metadata_json);
  // 1. Explicit entry in workflow metadata
  if (meta.entry_node_key) {
    const found = nodes.find(n => n.node_key === meta.entry_node_key);
    if (found) return found;
  }
  // 2. Sole trigger node
  const triggers = nodes.filter(n => n.node_type === 'trigger');
  if (triggers.length === 1) return triggers[0];
  // 3. Node with no incoming edges (graph root)
  const toKeys = new Set((edges || []).map(e => e.to_node_key));
  const roots  = nodes.filter(n => !toKeys.has(n.node_key));
  if (roots.length === 1) return roots[0];
  // 4. Legacy: lowest sort_order
  return nodes[0];
}

function _safeJson(str) {
  try { return JSON.parse(str || '{}'); } catch { return {}; }
}

async function dispatchNode(env, node, input, runContext) {
  const nodeType   = node.node_type;
  const handlerKey = node.handler_key;

  // ── Registry-first dispatch ─────────────────────────────────────────────
  // If handler_key is set, resolve from agentsam_workflow_handlers.
  // executor_kind drives the primitive. Falls through to legacy switch on miss.
  if (handlerKey) {
    try {
      const { resolveHandler } = await import('./workflow-handler-registry.js');
      const reg = await resolveHandler(env, handlerKey);
      if (reg) {
        const nodeConfig = _safeJson(node.handler_config_json || node.input_schema_json || '{}');
        const config = { ...reg.config, ...nodeConfig };
        return executePrimitive(env, reg.executor_kind, handlerKey, config, input, node, runContext);
      }
    } catch (regErr) {
      console.warn('[workflow] registry lookup error for', handlerKey, regErr?.message);
    }
    // No registry row → fall through to legacy switch (backward compat)
    console.warn(`[workflow] handler_key "${handlerKey}" not in registry — using legacy switch`);
  }

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
        // Derive task_type: prefer agentsam_workflows.default_task_type, then handler_key, then fallback
        const hkParts = String(handlerKey || '').split('.');
        const taskType = normalizeCanonicalTaskType(
          runContext?.workflowMeta?.default_task_type
          || hkParts[1]
          || hkParts[0]
          || 'agent',
        );
        const mode =
          runContext?.workflowMeta?.default_mode
          || (String(runContext?.workflowKey || '').includes('build') ? 'build' : 'agent');

        const wsId =
          runContext?.runMeta?.workspaceId != null
            ? String(runContext.runMeta.workspaceId).trim()
            : '';
        let resolvedCatalogKey = config.model_key || null;
        if (!resolvedCatalogKey && env?.DB && wsId) {
          try {
            const resolved = await resolveModelForTask(env, {
              task_type: taskType,
              mode: String(mode).trim() || 'agent',
              workspace_id: wsId,
              tenant_id:
                runContext?.runMeta?.tenantId != null
                  ? String(runContext.runMeta.tenantId).trim()
                  : undefined,
            });
            resolvedCatalogKey = resolved?.model_key ?? null;
          } catch (resolveErr) {
            console.warn('[workflow] resolveModelForTask', resolveErr?.message ?? resolveErr);
          }
        }
        if (!resolvedCatalogKey && env?.DB && wsId) {
          const arm = await env.DB.prepare(
            `SELECT model_key FROM agentsam_routing_arms
             WHERE workspace_id = ? AND task_type = ? AND is_active = 1 AND is_eligible = 1
               AND COALESCE(is_paused, 0) = 0 AND COALESCE(budget_exhausted, 0) = 0
             ORDER BY (success_alpha * 1.0 / (success_alpha + success_beta)) DESC
             LIMIT 1`,
          )
            .bind(wsId, taskType)
            .first()
            .catch(() => null);
          resolvedCatalogKey = arm?.model_key ?? null;
        }

        const userMsg = typeof input === 'string'
          ? input
          : input?.prompt || input?.message || input?.instruction || input?.result
          || JSON.stringify(input);

        if (!resolvedCatalogKey) {
          return {
            ok: false,
            error: `agent node: no model resolved for task_type=${taskType} workspace=${wsId || '(missing)'}`,
          };
        }

        const result = await dispatchComplete(env, {
          modelKey: resolvedCatalogKey,
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
      const hkStr = String(handlerKey || '');
      const parts = hkStr.split('.');
      const splitKey = parts.length > 1 ? parts[parts.length - 1] : hkStr;
      const underscoreKey = hkStr.replace(/\./g, '_');

      const toolRow = env.DB
        ? await env.DB.prepare(`
      SELECT tool_key, mcp_service_url, handler_type, handler_config
      FROM agentsam_mcp_tools
      WHERE (tool_key = ? OR tool_key = ? OR tool_key = ?)
        AND is_active = 1 AND enabled = 1
      LIMIT 1
    `)
            .bind(splitKey, underscoreKey, hkStr)
            .first()
            .catch(() => null)
        : null;

      if (!toolRow) {
        return { ok: false, error: `mcp_tool not found in agentsam_mcp_tools: ${handlerKey}` };
      }

      return executeWorkflowMcpTool(env, toolRow, input, runContext, hkStr);
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
      const nodeSchema = readWorkflowNodeInputSchemaJson(node);
      // Also check if previous agent node embedded a command in its JSON result
      let _agentCmd = '';
      if (input?.result) {
        try {
          const _r = JSON.parse(input.result);
          _agentCmd = _r?.command || _r?.cmd || _r?.wrangler_command || '';
        } catch (_) {}
      }
      const command = String(
        input?.command ??
          input?.cmd ??
          input?.default_command ??
          _agentCmd ??
          nodeSchema?.default_command ??
          '',
      ).trim();
      if (!command) throw new Error('no command in terminal node input');
      if (/[;&|`$><\\]/.test(command)) {
        return { ok: false, error: 'command contains unsafe characters' };
      }
      const tRes = await fetch(`${termUrl.replace(/\/$/, '')}/exec`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.TERMINAL_SECRET || ''}`,
        },
        body: JSON.stringify({ command, timeout_ms: node.timeout_ms || 30000 }),
      }).catch(() => null);
      if (!tRes?.ok) return { ok: false, error: `terminal HTTP ${tRes?.status}` };
      const out = await tRes.json().catch(() => ({}));
      return { ok: true, output: out };
    }

    case 'db_query': {
      return executeWorkflowDbQuery(env, hk, input, runContext, node);
    }

    case 'script': {
      return executeWorkflowScript(env, hk, input, runContext, node);
    }

    case 'eval': {
      return executeWorkflowEval(env, hk, input, runContext, node);
    }

    case 'branch': {
      return executeWorkflowBranch(input, node);
    }

    case 'trigger': {
      if (smoke) return { ok: true, output: { smoke: true, skipped: true } };
      const flat = flattenWorkflowInput(input);
      return { ok: true, output: { triggered: true, payload: flat } };
    }

    case 'process': {
      if (smoke) return { ok: true, output: { smoke: true, skipped: true } };
      const flat = flattenWorkflowInput(input);
      if (hk) {
        const scriptOut = await executeWorkflowScript(env, hk, input, runContext, node);
        if (scriptOut.ok) return scriptOut;
      }
      return { ok: true, output: { processed: true, ...flat } };
    }

    case 'output': {
      const flat = flattenWorkflowInput(input);
      return { ok: true, output: { final: flat, node_key: node.node_key } };
    }

    case 'join': {
      if (smoke) return { ok: true, output: { smoke: true, skipped: true } };
      const flat = flattenWorkflowInput(input);
      return { ok: true, output: { joined: true, final: flat, node_key: node.node_key } };
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

    case 'webhook': {
      if (smoke) return { ok: true, output: { smoke: true, skipped: true, note: 'webhook smoke short-circuit' } };
      const config = (() => {
        try { return JSON.parse(node.handler_config || node.config_json || '{}'); } catch { return {}; }
      })();
      const url = config.url || config.endpoint;
      if (!url && (hk.startsWith('ui.') || hk.startsWith('ui_'))) {
        return executeWorkflowUiEmit(env, hk, input, runContext, node);
      }
      if (!url) return { ok: false, error: `webhook node "${node.node_key}" missing url in handler_config` };
      const timeout = node.timeout_ms ?? 15_000;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeout);
      try {
        const resp = await fetch(url, {
          method: config.method ?? 'POST',
          headers: { 'Content-Type': 'application/json', ...(config.headers ?? {}) },
          body: JSON.stringify({
            node_key: node.node_key,
            workflow_run_id: runContext?.runId,
            workflow_id: runContext?.workflowKey,
            ...input,
          }),
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        if (!resp.ok) return { ok: false, error: `webhook HTTP ${resp.status} from ${url}` };
        const text = await resp.text();
        const output = (() => { try { return JSON.parse(text); } catch { return { raw: text }; } })();
        return { ok: true, output };
      } catch (e) {
        clearTimeout(timer);
        return { ok: false, error: `webhook fetch failed: ${e?.message ?? e}` };
      }
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
    case 'field':
    case 'output': {
      const val =
        nodeOutput?.output?.[cond.field] ??
        nodeOutput?.output?.pass ??
        nodeOutput?.[cond.field];
      if (cond.op === 'eq') return val === cond.value;
      if (cond.op === 'neq') return val !== cond.value;
      if (cond.equals != null) return val === cond.equals;
      return val != null;
    }
    case 'branch': {
      const branch = nodeOutput?.output?.branch ?? nodeOutput?.output?.[cond.field];
      if (cond.op === 'eq' || !cond.op) return branch === cond.value;
      if (cond.op === 'neq') return branch !== cond.value;
      return branch != null;
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

function firstUrlFromWorkflowNodeInput(nodeInput) {
  const u = extractBrowserNavigateUrl(nodeInput);
  return u || undefined;
}

/** Map graph node → dashboard surface (SSE surface_open / App.tsx iam:agent-open-surface). */
function classifyWorkflowSurface(node) {
  if (!node || typeof node !== 'object') return null;
  const nk = String(node.node_key || '').toLowerCase();
  const hk = String(node.handler_key || '').toLowerCase();
  const nt = String(node.node_type || '').toLowerCase();

  if (hk.includes('monaco.') || hk.includes('.monaco.') || (hk.includes('monaco') && hk.includes('edit'))) {
    return { surface: 'code', reason: 'workflow_graph_monaco' };
  }
  if (nk.includes('monaco') || nk.includes('code_editor') || nk === 'editor' || nk.includes('app_builder')) {
    return { surface: 'code', reason: 'workflow_graph_code_surface' };
  }
  if (nk.includes('excalidraw') || hk.includes('excalidraw') || (nk.includes('diagram') && nk.includes('canvas'))) {
    return { surface: 'excalidraw', reason: 'workflow_graph_excalidraw' };
  }
  if (
    nk.includes('browser') ||
    nk.includes('playwright') ||
    nk.includes('screenshot') ||
    hk.includes('browser.') ||
    hk.includes('playwright') ||
    (nk.includes('navigate') && (nk.includes('url') || nk.includes('page')))
  ) {
    return { surface: 'browser', reason: 'workflow_graph_browser' };
  }
  if (nt === 'mcp_tool' && hk.startsWith('agentsam.code.') && (nk.includes('write') || nk.includes('apply') || nk.includes('patch'))) {
    return { surface: 'code', reason: 'workflow_graph_code_tool' };
  }
  return null;
}

/** Emit surface_open + agent_surface_open; returns proof for D1 output_json / workflow_step. */
function emitWorkflowGraphSurfaceEvents(onStream, { node, runId, workflowKey, nodeInput }) {
  if (typeof onStream !== 'function') return null;
  const spec = classifyWorkflowSurface(node);
  if (!spec) return null;
  const nodeKey = String(node?.node_key || '');
  const payload = {
    surface: spec.surface,
    reason: spec.reason,
    node_key: nodeKey,
    run_id: runId,
    workflow_key: workflowKey != null ? String(workflowKey) : undefined,
  };
  if (spec.surface === 'browser') {
    const url = firstUrlFromWorkflowNodeInput(nodeInput);
    if (url) payload.url = url;
  }
  try {
    onStream({ type: 'surface_open', ...payload });
    onStream({ type: 'agent_surface_open', ...payload });
  } catch (_) {
    /* stream closed */
  }
  return { ...payload, source: 'workflow_graph_node_start' };
}

function attachSurfaceProofToNodeOutput(nodeOutput, proof) {
  if (!proof) return nodeOutput;
  const base = nodeOutput && typeof nodeOutput === 'object' ? { ...nodeOutput } : { ok: !!nodeOutput?.ok };
  let out = base.output;
  if (out != null && typeof out === 'object' && !Array.isArray(out)) {
    out = { ...out, surface_open_proof: proof };
  } else if (out == null) {
    out = { surface_open_proof: proof };
  } else {
    out = { result: out, surface_open_proof: proof };
  }
  return { ...base, output: out };
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
    onStream = null,
    onRunCreated = null,
    run_group_id: optsRunGroupId,
  } = opts;

  const runGroupId =
    optsRunGroupId ??
    opts?.run_group_id ??
    ('rg_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16));

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
  const entryNode = resolveEntryNode(workflow, nodes, edges);
  const firstKey = entryNode?.node_key || nodes[0]?.node_key || '';
  await env.DB.prepare(
    `INSERT INTO agentsam_workflow_runs (
      id, workflow_id, workflow_key, tenant_id, workspace_id,
      run_group_id,
      user_id, user_email, trigger_type, status,
      input_json, output_json, step_results_json, metadata_json,
      steps_total, steps_completed, environment,
      graph_mode, current_node_key,
      started_at, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?,
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
      runGroupId,
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

  // Fetch workflow row once so every dispatchNode call can read default_task_type / default_mode
  // This is what makes agentsam_workflows drive TIER_ORDER model selection correctly
  const workflowMeta = env.DB
    ? await env.DB
        .prepare(
          `SELECT default_task_type, default_mode, workflow_type, risk_level, requires_approval
           FROM agentsam_workflows
           WHERE (id = ? OR workflow_key = ?) AND COALESCE(is_active, 1) = 1
           LIMIT 1`
        )
        .bind(workflowKey, workflowKey)
        .first()
        .catch(() => null)
    : null;

  const runContext = {
    runId,
    runMeta,
    workflowRunId: runId,
    canonicalUserId,
    workflowExecId,
    toolBridge,
    workflowKey,
    workflowMeta: workflowMeta ?? null,
    initialInput: input ?? {},
  };
  const streamSse =
    typeof onStream === 'function'
      ? onStream
      : toolBridge && typeof toolBridge.emitSse === 'function'
        ? toolBridge.emitSse
        : null;
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

    const surfaceProof = emitWorkflowGraphSurfaceEvents(streamSse, {
      node,
      runId,
      workflowKey,
      nodeInput,
    });

    let nodeOutput = await dispatchNode(env, node, nodeInput, {
      ...runContext,
      node,
      executionStepId: stepId,
    }).catch((e) => ({
      ok: false,
      error: e?.message || String(e),
    }));

    nodeOutput = normalizeNodeOutput(nodeOutput);
    nodeOutput = attachSurfaceProofToNodeOutput(nodeOutput, surfaceProof);

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
        surface_open_proof: surfaceProof || undefined,
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
