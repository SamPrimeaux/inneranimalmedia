/**
 * Execute agentsam_tools rows by handler_type + handler_config only.
 * No hardcoded tool_key / tool_name branches.
 */
import { d1_query, d1_write } from './d1.js';
import { handlers as dbToolHandlers } from '../tools/db.js';
import { handlers as termHandlers } from '../tools/terminal.js';
import { handlers as storageHandlers } from '../tools/builtin/storage.js';
import { handlers as aiOpsHandlers } from '../tools/builtin/ai-ops.js';
import { runHyperdriveQuery, isHyperdriveUsable } from './hyperdrive-query.js';
import { scheduleMirrorToolCallEventToSupabase } from './hyperdrive-write.js';
import { resolveMcpServerForTool } from './mcp-servers.js';

function parseInput(input) {
  if (input == null) return {};
  if (typeof input === 'object' && !Array.isArray(input)) return { ...input };
  return { value: input };
}

function stableSortValue(value) {
  if (Array.isArray(value)) return value.map(stableSortValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableSortValue(value[key])]),
    );
  }
  return value;
}

async function sha256Hex(value) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeJsonString(value, fallback = '{}') {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return fallback;
  }
}

function summarizeOutput(output) {
  const text =
    output?.content?.[0]?.text ??
    output?.text ??
    output?.message ??
    output?.error ??
    safeJsonString(output, '');
  return String(text || '').slice(0, 1000) || null;
}

function extractUsageMetrics(output, fallbackModel = null, fallbackProvider = null) {
  const usage =
    output?.usage && typeof output.usage === 'object'
      ? output.usage
      : output?.body?.usage && typeof output.body.usage === 'object'
        ? output.body.usage
        : null;
  const inputTokens = Math.max(
    0,
    Math.floor(
      Number(
        usage?.input_tokens ??
          usage?.prompt_tokens ??
          usage?.inputTokens ??
          output?.input_tokens ??
          output?.body?.input_tokens ??
          0,
      ) || 0,
    ),
  );
  const outputTokens = Math.max(
    0,
    Math.floor(
      Number(
        usage?.output_tokens ??
          usage?.completion_tokens ??
          usage?.outputTokens ??
          output?.output_tokens ??
          output?.body?.output_tokens ??
          0,
      ) || 0,
    ),
  );
  const totalCostUsd =
    Number(
      usage?.cost_usd ??
        usage?.costUsd ??
        output?.cost_usd ??
        output?.body?.cost_usd ??
        output?.costUsd ??
        output?.body?.costUsd ??
        0,
    ) || 0;
  const inputCostUsd = Number(usage?.input_cost_usd ?? usage?.inputCostUsd ?? 0) || 0;
  const outputCostUsd = Number(usage?.output_cost_usd ?? usage?.outputCostUsd ?? 0) || 0;
  const modelUsed =
    output?.model_key ??
    output?.modelKey ??
    output?.body?.model_key ??
    output?.body?.modelKey ??
    output?.model ??
    output?.body?.model ??
    fallbackModel;
  const provider =
    output?.provider ??
    output?.body?.provider ??
    fallbackProvider;
  return {
    inputTokens,
    outputTokens,
    inputCostUsd,
    outputCostUsd,
    totalCostUsd,
    modelUsed: modelUsed != null ? String(modelUsed).trim() || null : null,
    provider: provider != null ? String(provider).trim() || null : null,
  };
}

async function writeTelemetryError(env, runContext, source, error) {
  if (!env?.DB) return;
  try {
    await env.DB.prepare(
      `INSERT INTO agentsam_error_log
         (workspace_id, tenant_id, session_id, error_type, error_message, source, created_at)
       VALUES (?,?,?,?,?,?,unixepoch())`,
    )
      .bind(
        String(runContext?.workspaceId ?? runContext?.workspace_id ?? 'unknown').trim() || 'unknown',
        String(runContext?.tenantId ?? runContext?.tenant_id ?? 'system').trim() || 'system',
        runContext?.conversationId ?? runContext?.conversation_id ?? runContext?.sessionId ?? runContext?.session_id ?? null,
        'db_write_failure',
        String(error?.message || error || 'telemetry_failed').slice(0, 1000),
        source,
      )
      .run();
  } catch (_) {}
}

async function insertToolCallLog(env, payload, runContext) {
  const stmt = await env.DB.prepare(
    `INSERT INTO agentsam_tool_call_log
      (tenant_id, workspace_id, user_id, agent_run_id,
       tool_name, tool_key, handler_key, capability_key,
       agentsam_tools_id, routing_arm_id, conversation_id,
       status, input_json, output_json,
       input_summary, output_summary,
       input_tokens, output_tokens,
       input_cost_usd, output_cost_usd, cost_usd,
       duration_ms, timed_out, tool_category)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      payload.tenantId,
      payload.workspaceId,
      payload.userId,
      payload.agentRunId,
      payload.toolName,
      payload.toolKey,
      payload.handlerKey,
      payload.capabilityKey,
      payload.agentsamToolsId,
      payload.routingArmId,
      payload.conversationId,
      payload.status,
      payload.inputJson,
      payload.outputJson,
      payload.inputSummary,
      payload.outputSummary,
      payload.inputTokens,
      payload.outputTokens,
      payload.inputCostUsd,
      payload.outputCostUsd,
      payload.totalCostUsd,
      payload.durationMs,
      payload.timedOut ? 1 : 0,
      payload.toolCategory,
    )
    .run();
  return String(stmt?.meta?.last_row_id ?? stmt?.lastRowId ?? '') || null;
}

function bindingBucket(env, bindingName) {
  const key = String(bindingName || 'DB').trim();
  if (key === 'ASSETS' || key === 'DASHBOARD') return env.DASHBOARD || env.ASSETS;
  if (key === 'AI') return env.AI;
  return env[key] ?? env.DB;
}

/**
 * @param {any} env
 * @param {string | null | undefined} linkedId
 * @param {string | null | undefined} toolKey
 */
async function loadMcpToolRow(env, linkedId, toolKey) {
  if (!env?.DB) return null;
  if (linkedId) {
    const byId = await env.DB.prepare(
      `SELECT * FROM agentsam_mcp_tools WHERE id = ? AND COALESCE(is_active,1)=1 AND COALESCE(enabled,1)=1 LIMIT 1`,
    )
      .bind(String(linkedId).trim())
      .first();
    if (byId) return byId;
  }
  const key = String(toolKey || '').trim();
  if (!key) return null;
  return env.DB.prepare(
    `SELECT * FROM agentsam_mcp_tools
     WHERE COALESCE(is_active,1)=1 AND COALESCE(enabled,1)=1
       AND (tool_key = ? OR tool_name = ? OR capability_key = ?)
     LIMIT 1`,
  )
    .bind(key, key, key)
    .first();
}

/**
 * @param {any} env
 * @param {Record<string, unknown>} mcpRow
 * @param {Record<string, unknown>} params
 * @param {Record<string, unknown>} runContext
 */
export async function executeMcpCatalogRow(env, mcpRow, params, runContext) {
  const toolName = String(mcpRow.tool_key || mcpRow.tool_name || '').trim();
  const { url } = await resolveMcpServerForTool(env, {
    tenantId: runContext.tenantId ?? runContext.tenant_id,
    workspaceId: runContext.workspaceId ?? runContext.workspace_id,
  }, mcpRow);

  if (url) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: toolName, arguments: params },
      }),
    }).catch((e) => ({ ok: false, status: 0, _err: e }));

    if (!res?.ok) {
      return {
        ok: false,
        error: `mcp HTTP ${res?.status ?? 0}: ${res?._err?.message ?? toolName}`,
      };
    }
    const body = await res.json().catch(() => ({}));
    return { ok: true, body };
  }

  return {
    ok: false,
    error: `mcp tool ${toolName}: no mcp_service_url or server row`,
  };
}

/**
 * @param {any} env
 * @param {Record<string, unknown>} row agentsam_tools
 * @param {Record<string, unknown>} config parsed handler_config
 * @param {unknown} input
 * @param {Record<string, unknown>} runContext
 * @param {{ value?: string, auth_source?: string }} credentials
 */
export async function executeCatalogTool(env, row, config, input, runContext, credentials) {
  const rawInput = parseInput(input);
  const handlerType = String(row.handler_type || '').toLowerCase();
  const params = {
    ...rawInput,
    workspace_id: runContext.workspaceId ?? runContext.workspace_id,
    tenant_id: runContext.tenantId ?? runContext.tenant_id,
    user_id: runContext.userId ?? runContext.user_id,
  };
  const toolKey = String(row.tool_key || row.tool_name || '').trim();
  const toolName = String(row.tool_name || row.tool_key || '').trim();
  const workspaceId = String(runContext.workspaceId ?? runContext.workspace_id ?? '').trim();
  const tenantId = String(runContext.tenantId ?? runContext.tenant_id ?? '').trim() || null;
  const userId = String(runContext.userId ?? runContext.user_id ?? '').trim() || null;
  const agentRunId =
    runContext.agentRunId ?? runContext.agent_run_id ?? null;
  const routingArmId =
    runContext.routingArmId ?? runContext.routing_arm_id ?? null;
  const conversationId =
    runContext.conversationId ??
    runContext.conversation_id ??
    runContext.sessionId ??
    runContext.session_id ??
    null;
  const sortedInput = stableSortValue(rawInput);
  const sortedInputJson = safeJsonString(sortedInput);
  const cacheKey = toolKey && workspaceId ? await sha256Hex(toolKey + sortedInputJson) : null;
  const inputHash = sortedInputJson ? await sha256Hex(sortedInputJson) : null;

  if (env?.DB && toolKey && cacheKey && workspaceId) {
    try {
      const cached = await env.DB.prepare(
        `SELECT output_json, id FROM agentsam_tool_cache
         WHERE tool_key = ? AND cache_key = ? AND workspace_id = ?
           AND (expires_at IS NULL OR expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
         LIMIT 1`,
      )
        .bind(toolKey, cacheKey, workspaceId)
        .first();
      if (cached?.output_json) {
        try {
          await env.DB.prepare(
            `UPDATE agentsam_tool_cache SET
               hit_count = hit_count + 1,
               last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id = ?`,
          )
            .bind(cached.id)
            .run();
        } catch (e) {
          await writeTelemetryError(env, runContext, 'agentsam_tool_cache.update', e);
        }

        const cachedBody = JSON.parse(String(cached.output_json));
        const usage = extractUsageMetrics(cachedBody, params.model ?? config.default_model ?? null, config.default_provider ?? null);
        try {
          await insertToolCallLog(
            env,
            {
              tenantId,
              workspaceId,
              userId,
              agentRunId,
              toolName,
              toolKey,
              handlerKey: row.handler_key ?? null,
              capabilityKey: row.capability_key ?? null,
              agentsamToolsId: row.id ?? null,
              routingArmId,
              conversationId,
              status: 'success',
              inputJson: safeJsonString(rawInput),
              outputJson: safeJsonString(cachedBody),
              inputSummary: 'cache_hit',
              outputSummary: summarizeOutput(cachedBody),
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              inputCostUsd: usage.inputCostUsd,
              outputCostUsd: usage.outputCostUsd,
              totalCostUsd: usage.totalCostUsd,
              durationMs: 0,
              timedOut: false,
              toolCategory: row.tool_category ?? null,
            },
            runContext,
          );
        } catch (e) {
          await writeTelemetryError(env, runContext, 'agentsam_tool_call_log.cache_hit', e);
        }
        return { ok: true, body: cachedBody };
      }
    } catch (e) {
      await writeTelemetryError(env, runContext, 'agentsam_tool_cache.lookup', e);
    }
  }

  const started = Date.now();
  let result = null;

  const finalizeTelemetry = async (success, output, errorMessage = null) => {
    if (!env?.DB) return;
    const durationMs = Math.max(0, Date.now() - started);
    const timedOut = false;
    const usage = extractUsageMetrics(
      output,
      params.model ?? config.default_model ?? null,
      config.default_provider ?? null,
    );
    const outputJson = safeJsonString(output);
    const outputSummary = summarizeOutput(output);
    let toolCallLogId = null;

    try {
      toolCallLogId = await insertToolCallLog(
        env,
        {
          tenantId,
          workspaceId,
          userId,
          agentRunId,
          toolName,
          toolKey,
          handlerKey: row.handler_key ?? null,
          capabilityKey: row.capability_key ?? null,
          agentsamToolsId: row.id ?? null,
          routingArmId,
          conversationId,
          status: success ? 'success' : 'error',
          inputJson: safeJsonString(rawInput),
          outputJson,
          inputSummary: null,
          outputSummary,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          inputCostUsd: usage.inputCostUsd,
          outputCostUsd: usage.outputCostUsd,
          totalCostUsd: usage.totalCostUsd,
          durationMs,
          timedOut,
          toolCategory: row.tool_category ?? null,
        },
        runContext,
      );
    } catch (e) {
      await writeTelemetryError(env, runContext, 'agentsam_tool_call_log', e);
    }

    try {
      await env.DB.prepare(
        `INSERT INTO agentsam_tool_chain
          (tenant_id, workspace_id, user_id, agent_run_id,
           tool_name, tool_id, routing_arm_id, conversation_id,
           parent_chain_id, depth,
           tool_status, input_json, result_json,
           error_message, input_tokens, output_tokens,
           cost_usd, duration_ms, timed_out)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
        .bind(
          tenantId,
          workspaceId,
          userId,
          agentRunId,
          toolName,
          row.id ?? null,
          routingArmId,
          conversationId,
          runContext.parentChainId ?? runContext.parent_chain_id ?? null,
          Number(runContext.chainDepth ?? runContext.depth ?? 0) || 0,
          success ? 'completed' : 'failed',
          safeJsonString(rawInput),
          outputJson,
          errorMessage ?? null,
          usage.inputTokens,
          usage.outputTokens,
          usage.totalCostUsd,
          durationMs,
          timedOut ? 1 : 0,
        )
        .run();
    } catch (e) {
      await writeTelemetryError(env, runContext, 'agentsam_tool_chain', e);
    }

    if (success && config.cacheable !== false && cacheKey && inputHash && workspaceId) {
      try {
        const ttlSeconds = row?.token_budget_per_call ? 300 : 60;
        await env.DB.prepare(
          `INSERT OR REPLACE INTO agentsam_tool_cache
            (workspace_id, tenant_id, tool_key, tool_category,
             cache_key, input_hash,
             input_json, output_json, output_summary,
             token_savings_estimate, execution_ms,
             model_used, provider,
             cache_strategy, expires_at,
             source_type, source_identifier)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'ttl',
             strftime('%Y-%m-%dT%H:%M:%fZ','now', '+' || ? || ' seconds'),
             'tool_call_log', ?)`,
        )
          .bind(
            workspaceId,
            tenantId,
            toolKey,
            row.tool_category ?? null,
            cacheKey,
            inputHash,
            safeJsonString(rawInput),
            outputJson,
            outputSummary,
            usage.inputTokens + usage.outputTokens,
            durationMs,
            usage.modelUsed ?? null,
            usage.provider ?? null,
            ttlSeconds,
            toolCallLogId,
          )
          .run();
      } catch (e) {
        await writeTelemetryError(env, runContext, 'agentsam_tool_cache', e);
      }
    }

    try {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO agentsam_performance_eto_events
          (id, tenant_id, workspace_id, user_id,
           source_table, source_id,
           agent_run_id, tool_call_id, routing_arm_id,
           task_type, model_key, provider,
           input_tokens, output_tokens, cost_usd, latency_ms,
           success, failure, timed_out,
           is_training_eligible, reward_score,
           alpha_delta, beta_delta, evidence_json)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
        .bind(
          `pete_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`,
          tenantId,
          workspaceId,
          userId,
          'agentsam_tool_call_log',
          toolCallLogId,
          agentRunId,
          toolCallLogId,
          routingArmId,
          runContext.taskType ?? runContext.task_type ?? 'tool_call',
          usage.modelUsed ?? null,
          usage.provider ?? null,
          usage.inputTokens,
          usage.outputTokens,
          usage.totalCostUsd,
          durationMs,
          success ? 1 : 0,
          success ? 0 : 1,
          timedOut ? 1 : 0,
          usage.inputTokens > 0 || usage.outputTokens > 0 ? 1 : 0,
          success ? 1.0 : 0.0,
          success ? 0.1 : 0.0,
          success ? 0.0 : 0.1,
          safeJsonString({ toolKey, handlerType, durationMs }),
        )
        .run();
    } catch (e) {
      await writeTelemetryError(env, runContext, 'agentsam_performance_eto_events', e);
    }

    try {
      scheduleMirrorToolCallEventToSupabase(env, runContext.ctx ?? null, {
        workspace_id: workspaceId,
        run_id: agentRunId ?? runContext.run_id ?? runContext.workflow_run_id ?? null,
        tool_key: toolKey,
        tool_name: toolName,
        tool_category: row.tool_category ?? null,
        status: success ? 'completed' : 'failed',
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        cost_usd: usage.totalCostUsd,
        duration_ms: durationMs,
      });
    } catch (_) {}
  };

  switch (handlerType) {
    case 'd1': {
      const op = String(config.operation || 'query').toLowerCase();
      try {
        if (op === 'introspect' || op === 'schema') {
          const out = await dbToolHandlers.d1_schema_introspect(params, env);
          result = out?.error ? { ok: false, error: String(out.error) } : { ok: true, body: out };
          break;
        }

        const sql = String(params.sql || params.query || '').trim();
        if (!sql) {
          result = { ok: false, error: `d1 tool requires sql in input (operation=${op})` };
          break;
        }
        if (op === 'execute' || op === 'write') {
          const out = await d1_write({ sql, params: params.params }, env);
          result = { ok: true, body: out };
          break;
        }
        const rows = await d1_query({ sql, params: params.params }, env);
        result = { ok: true, body: { rows } };
      } catch (e) {
        result = { ok: false, error: e?.message ?? String(e) };
      }
      break;
    }

    case 'hyperdrive':
    case 'supabase': {
      if (!isHyperdriveUsable(env)) {
        result = { ok: false, error: 'Hyperdrive binding unavailable' };
        break;
      }
      const sql = String(params.sql || params.query || '').trim();
      if (!sql) {
        result = { ok: false, error: 'hyperdrive/supabase tool requires sql in input' };
        break;
      }
      const out = await runHyperdriveQuery(env, sql, Array.isArray(params.params) ? params.params : []);
      result = !out.ok ? { ok: false, error: out.error } : { ok: true, body: { rows: out.rows } };
      break;
    }

    case 'terminal': {
      const cmd = String(params.command || params.cmd || config.command_template || '').trim();
      if (!cmd) {
        result = { ok: false, error: 'terminal tool requires command in input' };
        break;
      }
      const out = await termHandlers.run_command(
        { command: cmd, session_id: params.session_id },
        env,
      );
      result = out?.error ? { ok: false, error: String(out.error) } : { ok: true, body: out };
      break;
    }

    case 'r2': {
      const op = String(config.operation || config.r2_operation || 'write').toLowerCase();
      const fn =
        storageHandlers[`r2_${op}`] ||
        storageHandlers[op] ||
        storageHandlers.r2_write;
      if (typeof fn !== 'function') {
        result = { ok: false, error: `r2 operation not supported: ${op}` };
        break;
      }
      const bucket = bindingBucket(env, config.binding);
      const out = await fn({ ...params, bucket }, env);
      result = out?.error ? { ok: false, error: String(out.error) } : { ok: true, body: out };
      break;
    }

    case 'ai': {
      const op = String(config.operation || config.ai_operation || 'complete').toLowerCase();
      const fnKey = op === 'embed' ? 'ai_embed' : op === 'compare' ? 'ai_compare' : 'ai_complete';
      const fn = aiOpsHandlers[fnKey];
      if (typeof fn !== 'function') {
        result = { ok: false, error: `ai operation not supported: ${op}` };
        break;
      }
      const out = await fn(params, env);
      result = out?.error ? { ok: false, error: String(out.error) } : { ok: true, body: out };
      break;
    }

    case 'http': {
      const base = String(config.base_url || '').replace(/\/$/, '');
      const path = String(config.endpoint || config.path || '');
      const url = path.startsWith('http') ? path : `${base}${path.startsWith('/') ? '' : '/'}${path}`;
      const method = String(config.method || 'POST').toUpperCase();
      const headers = {
        'Content-Type': 'application/json',
        ...(config.headers && typeof config.headers === 'object' ? config.headers : {}),
      };
      if (credentials?.value) {
        const authType = String(config.auth_type || 'bearer').toLowerCase();
        if (authType === 'bearer') headers.Authorization = `Bearer ${credentials.value}`;
        else if (authType === 'token') headers.Authorization = `token ${credentials.value}`;
      }
      const body =
        params.body != null
          ? typeof params.body === 'string'
            ? params.body
            : JSON.stringify(params.body)
          : method !== 'GET' && method !== 'HEAD'
            ? JSON.stringify(params)
            : undefined;
      const res = await fetch(url, { method, headers, body });
      const text = await res.text().catch(() => '');
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = { raw: text.slice(0, 8000) };
      }
      if (!res.ok) {
        result = { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 500)}`, status: res.status, body: json };
        break;
      }
      result = { ok: true, status: res.status, body: json };
      break;
    }

    case 'github': {
      if (!credentials?.value) {
        result = { ok: false, error: 'github tool requires resolved credential' };
        break;
      }
      const apiBase = String(config.api_base || 'https://api.github.com').replace(/\/$/, '');
      let path = String(config.endpoint || '/');
      const repo = String(config.repo || params.repo || '');
      if (repo.includes('/')) {
        const [owner, name] = repo.split('/');
        path = path.replace('{owner}', owner).replace('{repo}', name);
      }
      path = path.replace('{path}', encodeURIComponent(String(params.path || params.file_path || '')));
      const url = `${apiBase}${path.startsWith('/') ? '' : '/'}${path}`;
      const method = String(config.method || 'GET').toUpperCase();
      const headers = {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'InnerAnimalMedia-AgentSam',
        Authorization: `Bearer ${credentials.value}`,
      };
      const init = { method, headers };
      if (method !== 'GET' && method !== 'HEAD') {
        init.body = JSON.stringify(params.body ?? params);
        headers['Content-Type'] = 'application/json';
      }
      const res = await fetch(url, init);
      const text = await res.text().catch(() => '');
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = { raw: text.slice(0, 8000) };
      }
      if (!res.ok) {
        result = { ok: false, error: `GitHub ${res.status}: ${text.slice(0, 500)}`, status: res.status, body: json };
        break;
      }
      result = { ok: true, status: res.status, body: json };
      break;
    }

    case 'mybrowser': {
      const toolName = String(row.tool_key || row.tool_name || '').trim();
      const { handlers: webHandlers } = await import('../tools/builtin/web.js');
      const fn = webHandlers[toolName];
      if (typeof fn !== 'function') {
        result = { ok: false, error: `mybrowser handler not registered for tool_key=${toolName}` };
        break;
      }
      const out = await fn(params, env);
      result = out?.error ? { ok: false, error: String(out.error) } : { ok: true, body: out };
      break;
    }

    case 'mcp':
    case 'browser_agentic':
    case 'proxy':
    case 'workspace.reader': {
      const op = String(config.operation || '').toLowerCase();
      if (
        handlerType === 'workspace.reader' ||
        ['read', 'list', 'grep', 'write', 'search'].includes(op)
      ) {
        const { handlers: fsHandlers } = await import('../tools/fs.js');
        const fsOp = op === 'write' || op === 'put' ? 'write_file' : 'read_file';
        const fn = fsHandlers[fsOp];
        if (typeof fn !== 'function') {
          result = { ok: false, error: `filesystem operation not available: ${fsOp}` };
          break;
        }
        const out = await fn(params, env, runContext);
        result = out?.error ? { ok: false, error: String(out.error) } : { ok: true, body: out };
        break;
      }

      const moduleKey = String(config.module || config.executor_module || '').toLowerCase();
      if (moduleKey === 'memory' || moduleKey === 'tools/memory.js') {
        const { handlers: memoryHandlers } = await import('../tools/memory.js');
        const memKey = String(config.handler || row.tool_key || '').trim();
        const fn = memoryHandlers[memKey];
        if (typeof fn !== 'function') {
          result = { ok: false, error: `memory handler not registered: ${memKey}` };
          break;
        }
        const out = await fn(params, env, runContext);
        result = out?.error ? { ok: false, error: String(out.error) } : { ok: true, body: out };
        break;
      }
      if (moduleKey === 'context' || String(config.executor || '').includes('context')) {
        const { handlers: contextHandlers } = await import('../tools/builtin/context.js');
        const ctxKey = String(config.handler || config.tool_name || row.tool_key || '').trim();
        const fn = contextHandlers[ctxKey];
        if (typeof fn !== 'function') {
          result = { ok: false, error: `context handler not registered: ${ctxKey}` };
          break;
        }
        const out = await fn(params, env);
        result = out?.error ? { ok: false, error: String(out.error) } : { ok: true, body: out };
        break;
      }

      const mcpUrl = String(row.mcp_service_url || config.mcp_service_url || '').trim();
      if (mcpUrl) {
        const syntheticRow = {
          tool_key: row.tool_key,
          tool_name: row.tool_name || row.tool_key,
          mcp_service_url: mcpUrl,
        };
        result = await executeMcpCatalogRow(env, syntheticRow, params, runContext);
        break;
      }

      if (String(config.binding || '').toLowerCase() === 'internal') {
        result = {
          ok: false,
          error: `internal binding tool_key=${row.tool_key} requires handler_config.module or mcp_service_url`,
        };
        break;
      }

      result = {
        ok: false,
        error: `handler_config not routable for tool_key=${row.tool_key} (need operation+filesystem, module, or mcp_service_url)`,
      };
      break;
    }

    case 'filesystem': {
      const op = String(config.operation || 'read').toLowerCase();
      if (op === 'write' || op === 'put') {
        const { handlers: fsHandlers } = await import('../tools/fs.js');
        const out = await fsHandlers.write_file?.(params, env, runContext);
        result = out?.error ? { ok: false, error: String(out.error) } : { ok: true, body: out };
        break;
      }
      const { handlers: fsHandlers } = await import('../tools/fs.js');
      const out = await fsHandlers.read_file?.(params, env, runContext);
      result = out?.error ? { ok: false, error: String(out.error) } : { ok: true, body: out };
      break;
    }

    default:
      result = {
        ok: false,
        error: `unsupported agentsam_tools.handler_type=${handlerType} (configure handler_config or add executor)`,
      };
      break;
  }

  await finalizeTelemetry(result?.ok === true, result?.body ?? result, result?.ok === true ? null : result?.error || null);
  return result;
}
