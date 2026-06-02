/**
 * Execute agentsam_tools rows by handler_type + handler_config only.
 * No hardcoded tool_key / tool_name branches.
 *
 * Credential resolution: ./resolve-credential.js (resolveCredential).
 */
export { resolveCredential, parseHandlerConfig, normalizeAuthSource } from './resolve-credential.js';
import { d1_query, d1_write } from './d1.js';
import { handlers as dbToolHandlers } from '../tools/db.js';
import { handlers as termHandlers } from '../tools/terminal.js';
import { handlers as storageHandlers } from '../tools/builtin/storage.js';
import { handlers as aiOpsHandlers } from '../tools/builtin/ai-ops.js';
import { runHyperdriveQuery, isHyperdriveUsable } from './hyperdrive-query.js';
import { scheduleMirrorToolCallEventToSupabase } from './hyperdrive-write.js';
import { resolveMcpServerForTool } from './mcp-servers.js';
import { executeOpenWebCatalogDispatch, isOpenWebCatalogConfig } from './open-web-catalog-dispatch.js';
import { authUserIsSuperadmin } from './auth.js';
import {
  assertOwnerPlatformR2Bucket,
  isPlatformOwner,
  ownerHasPlatformR2Transport,
  resolveRegisteredR2BucketName,
  resolveToolRunAuthUser,
} from './platform-owner-r2-access.js';
import { mergeR2S3EnvFromUserStorage } from './user-storage-r2-credentials.js';
import { executeR2CatalogOperation, isR2ListLikeOperation } from '../tools/builtin/r2-object-crud.js';
import { getR2Binding } from '../api/r2-api.js';

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
 * @param {Record<string, unknown>} mcpRow
 * @param {Record<string, unknown>} params
 * @param {Record<string, unknown>} runContext
 */
export async function executeMcpCatalogRow(env, mcpRow, params, runContext) {
  const toolName = String(mcpRow.tool_key || mcpRow.tool_name || '').trim();
  const tenantId = String(runContext.tenantId ?? runContext.tenant_id ?? '').trim();
  const userId = String(runContext.userId ?? runContext.user_id ?? '').trim();
  const workspaceId = String(runContext.workspaceId ?? runContext.workspace_id ?? '').trim();
  const { url } = await resolveMcpServerForTool(env, {
    tenantId,
    workspaceId,
  }, mcpRow);

  if (url) {
    const headers = { 'Content-Type': 'application/json' };
    const mcpToken = env?.MCP_AUTH_TOKEN != null ? String(env.MCP_AUTH_TOKEN).trim() : '';
    const internalSecret = env?.INTERNAL_API_SECRET != null ? String(env.INTERNAL_API_SECRET).trim() : '';
    const bridgeKey = env?.AGENTSAM_BRIDGE_KEY != null ? String(env.AGENTSAM_BRIDGE_KEY).trim() : '';
    if (mcpToken) {
      headers.Authorization = `Bearer ${mcpToken}`;
    } else if (internalSecret) {
      headers.Authorization = `Bearer ${internalSecret}`;
      headers['X-Internal-Secret'] = internalSecret;
    } else if (bridgeKey) {
      headers['X-Bridge-Key'] = bridgeKey;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: toolName, arguments: params },
      }),
    }).catch((e) => ({ ok: false, status: 0, _err: e }));

    if (!res?.ok) {
      const status = res?.status ?? 0;
      if (
        status === 401 &&
        /memory/i.test(toolName) &&
        tenantId &&
        userId &&
        workspaceId
      ) {
        const { recordMcpMemoryAuthFailure } = await import('./agentsam-private-memory.js');
        const attemptedKey = String(
          params?.key ?? params?.memory_key ?? params?.memoryKey ?? 'unknown',
        );
        const fail = await recordMcpMemoryAuthFailure(env, {
          tenantId,
          workspaceId,
          userId,
          toolName,
          attemptedKey,
          ctx: runContext,
        });
        return {
          ok: false,
          error: fail.error ?? 'reauth_required',
          failed_tool: fail.failed_tool ?? toolName,
          attempted_key: fail.attempted_key,
          manual_fallback: fail.manual_fallback,
          reauth_required: true,
          body: fail,
        };
      }
      return {
        ok: false,
        error: `mcp HTTP ${status}: ${res?._err?.message ?? toolName}`,
        failed_tool: toolName,
        reauth_required: status === 401,
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
  let handlerType = String(row.handler_type || '').toLowerCase();
  let execConfig = { ...config };
  const params = {
    ...rawInput,
    workspace_id: runContext.workspaceId ?? runContext.workspace_id,
    tenant_id: runContext.tenantId ?? runContext.tenant_id,
    user_id: runContext.userId ?? runContext.user_id,
  };
  const toolKey = String(row.tool_key || row.tool_name || '').trim();
  const toolName = String(row.tool_name || row.tool_key || '').trim();

  if (
    toolKey === 'knowledge_search' ||
    ((handlerType === 'hyperdrive' || handlerType === 'supabase') &&
      String(execConfig.dispatcher || '').toLowerCase().includes('semantic'))
  ) {
    handlerType = 'ai';
    execConfig = {
      ...execConfig,
      dispatcher: 'legacy_unified_rag',
      legacy_unified_rag: true,
    };
  }
  config = execConfig;

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
  const { buildAgentsamToolCacheKey, isToolCacheEligible } = await import('./tool-cache-key.js');
  const cacheEligible = isToolCacheEligible(toolKey);
  const { cacheKey, inputHash } = cacheEligible
    ? await buildAgentsamToolCacheKey(toolKey, rawInput)
    : { cacheKey: null, inputHash: null };

  if (env?.DB && toolKey && cacheKey && workspaceId && cacheEligible) {
    try {
      const cached = await env.DB.prepare(
        `SELECT output_json, id FROM agentsam_tool_cache
         WHERE cache_key = ?
           AND workspace_id = ?
           AND (expires_at IS NULL OR expires_at > datetime('now'))
         LIMIT 1`,
      )
        .bind(cacheKey, workspaceId)
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

    if (success && cacheEligible && config.cacheable !== false && cacheKey && inputHash && workspaceId) {
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
        run_id:
          runContext.supabase_run_id ??
          runContext.workflow_run_id ??
          runContext.supabaseRunId ??
          null,
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

    if (success && toolKey) {
      const bumpTools = env.DB.prepare(
        `UPDATE agentsam_tools
         SET use_count = COALESCE(use_count, 0) + 1,
             last_used_at = datetime('now'),
             updated_at = datetime('now')
         WHERE tool_key = ? AND COALESCE(is_active, 1) = 1`,
      )
        .bind(toolKey)
        .run()
        .catch(() => {});
      const wu = runContext?.ctx;
      if (wu && typeof wu.waitUntil === 'function') {
        wu.waitUntil(bumpTools);
      } else {
        await bumpTools;
      }
    }
  };

  switch (handlerType) {
    case 'd1': {
      const { resolveWorkspaceD1Execution, executeWorkspaceD1Query } = await import('./workspace-d1-execution.js');
      const authUser = runContext.authUser ?? runContext.user ?? null;
      const d1Ctx = {
        user_id: userId,
        tenant_id: tenantId,
        workspace_id: workspaceId,
        authUser,
      };

      const op = String(config.operation || 'query').toLowerCase();
      try {
        if (op === 'introspect' || op === 'schema') {
          const resolved = await resolveWorkspaceD1Execution(env, d1Ctx);
          if (!resolved.ok) {
            result = {
              ok: false,
              error: resolved.error,
              user_message: resolved.user_message,
            };
            break;
          }
          if (resolved.mode === 'remote') {
            const tbl = params.table != null ? String(params.table).trim() : '';
            const sql = tbl
              ? `PRAGMA table_info(${tbl})`
              : `SELECT name, type, sql FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name ASC LIMIT 500`;
            const out = await executeWorkspaceD1Query(env, d1Ctx, sql);
            result = out.ok
              ? { ok: true, body: tbl ? { table: tbl, columns: out.rows } : { objects: out.rows } }
              : { ok: false, error: out.error, user_message: out.user_message };
            break;
          }
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
          const resolved = await resolveWorkspaceD1Execution(env, d1Ctx);
          if (!resolved.ok || resolved.mode === 'denied') {
            result = {
              ok: false,
              error: resolved.error || 'access_denied',
              user_message: resolved.user_message,
            };
            break;
          }
          if (resolved.mode === 'remote') {
            result = {
              ok: false,
              error: 'remote_d1_write_not_supported',
              user_message: 'Remote customer D1 writes require dashboard approval flow.',
            };
            break;
          }
          const out = await d1_write({ sql, params: params.params }, env);
          result = { ok: true, body: out };
          break;
        }

        const out = await executeWorkspaceD1Query(env, d1Ctx, sql, params.params);
        result = out.ok
          ? { ok: true, body: { rows: out.rows, data_plane: out.mode, meta: out.meta ?? {} } }
          : { ok: false, error: out.error, user_message: out.user_message };
      } catch (e) {
        result = { ok: false, error: e?.message ?? String(e) };
      }
      break;
    }

    case 'hyperdrive':
    case 'supabase': {
      if (
        toolKey === 'knowledge_search' ||
        String(execConfig.dispatcher || '').toLowerCase().includes('semantic')
      ) {
        const { legacyUnifiedRagSearch } = await import('../api/rag.js');
        const query = String(
          params.query || params.q || params.message || runContext.userMessage || '',
        ).trim();
        if (!query) {
          result = { ok: false, error: 'knowledge_search requires query in input' };
          break;
        }
        const out = await legacyUnifiedRagSearch(env, query, {
          topK: Number(params.top_k ?? params.topK ?? 8) || 8,
          tenantId,
          workspaceId,
          sessionId: conversationId,
          caller: `catalog_tool:${toolKey}`,
        });
        result = {
          ok: true,
          body: {
            matches: out.matches || [],
            results: out.results || [],
            count: out.count || 0,
          },
        };
        break;
      }
      const sql = String(params.sql || params.query || '').trim();
      if (!sql) {
        result = { ok: false, error: 'hyperdrive/supabase tool requires sql in input' };
        break;
      }
      const authUser = runContext.authUser ?? runContext.user ?? null;
      const { dispatchCustomerDataPlaneOperation } = await import('./customer-data-plane-dispatch.js');
      const routed = await dispatchCustomerDataPlaneOperation(env, {
        operation: 'run_readonly_sql',
        sql,
        message: sql,
        authUser,
        user_id: userId,
        tenant_id: tenantId,
        workspace_id: workspaceId,
        agent_run_id: agentRunId,
        requested_provider: config.data_plane || config.provider || null,
      });
      if (!routed.ok) {
        result = {
          ok: false,
          error: routed.error || 'access_denied',
          reason: routed.reason,
          user_message: routed.user_message,
        };
        break;
      }
      result = { ok: true, body: { rows: routed.rows || [], data_plane: routed.data_plane } };
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
      const authUser = await resolveToolRunAuthUser(env, runContext);
      const op = String(config.operation || config.r2_operation || 'write').toLowerCase();
      const authSource = String(config.auth_source || 'platform').toLowerCase();
      const isOwner = await isPlatformOwner(env, authUser);

      if (isR2ListLikeOperation(op)) {
        result = {
          ok: false,
          error: 'r2_list_not_supported',
          body: {
            user_message:
              'Use r2_read, r2_write, or r2_delete with explicit bucket + key. Object listing is not an agent tool (Wrangler: get/put/delete only).',
          },
        };
        break;
      }

      if (authSource === 'platform' && !isOwner) {
        result = {
          ok: false,
          error: 'platform_r2_owner_only',
          body: {
            user_message:
              'IAM platform R2 bindings are owner-only. Connect your Cloudflare R2 API keys in Settings → Storage to use your buckets.',
          },
        };
        break;
      }

      const bucketRaw =
        params.bucket != null
          ? String(params.bucket)
          : config.binding != null
            ? String(config.binding)
            : config.default_bucket != null
              ? String(config.default_bucket)
              : '';
      if (!bucketRaw.trim()) {
        result = {
          ok: false,
          error: 'bucket_required',
          body: {
            user_message:
              'R2 tools require an explicit bucket parameter registered in D1 (r2_bucket_list / r2_bucket_bindings / project_storage).',
          },
        };
        break;
      }
      let bucket = await resolveRegisteredR2BucketName(env, bucketRaw);

      if (authSource === 'platform' && isOwner) {
        const bucketCheck = await assertOwnerPlatformR2Bucket(env, bucket);
        if (!bucketCheck.ok) {
          result = {
            ok: false,
            error: String(bucketCheck.error || 'platform_r2_bucket_not_registered'),
            body: {
              bucket: bucketCheck.bucket,
              allowed_preview: bucketCheck.allowed_preview,
              user_message: bucketCheck.user_message,
            },
          };
          break;
        }
        bucket = bucketCheck.bucket;
      }

      const effectiveEnv = await mergeR2S3EnvFromUserStorage(env, authUser);
      if (authSource === 'customer' && !effectiveEnv.R2_ACCESS_KEY_ID && !getR2Binding(effectiveEnv, bucket)) {
        result = {
          ok: false,
          error: 'customer_r2_not_connected',
          body: {
            user_message: 'Connect your Cloudflare R2 access key + secret in Settings → Storage before R2 tools run.',
          },
        };
        break;
      }

      if (authSource === 'platform' && isOwner) {
        const transport = await ownerHasPlatformR2Transport(effectiveEnv, authUser, bucket);
        if (!transport.ok) {
          result = {
            ok: false,
            error: 'platform_r2_transport_unavailable',
            body: { user_message: transport.user_message, bucket },
          };
          break;
        }
      }

      const out = await executeR2CatalogOperation(
        effectiveEnv,
        { ...params, bucket },
        config,
        op,
      );
      result = out?.ok === false ? { ok: false, error: String(out.error || 'r2_failed'), body: out } : { ok: true, body: out };
      break;
    }

    case 'websearch': {
      result = await executeOpenWebCatalogDispatch(env, config, params, runContext, toolKey);
      break;
    }

    case 'ai': {
      if (isOpenWebCatalogConfig(config, toolKey)) {
        result = await executeOpenWebCatalogDispatch(env, config, params, runContext, toolKey);
        break;
      }
      const dispatcher = String(config.dispatcher || '').trim();
      if (dispatcher === 'search_web' || dispatcher === 'web_fetch') {
        result = await executeOpenWebCatalogDispatch(env, config, params, runContext, toolKey);
        break;
      }
      if (dispatcher === 'fs_search_files') {
        const { executeFsSearchFiles } = await import('./fs-search-files.js');
        const out = await executeFsSearchFiles(env, params, runContext);
        result = out?.error ? { ok: false, error: String(out.error) } : { ok: true, body: out };
        break;
      }
      if (dispatcher === 'fs_read_file') {
        const { executeFsReadFile } = await import('./fs-read-file.js');
        const out = await executeFsReadFile(env, params, runContext);
        result = out?.error ? { ok: false, error: String(out.error) } : { ok: true, body: out };
        break;
      }
      if (dispatcher === 'semantic_retrieval') {
        const { dispatchSemanticRetrieval } = await import('./semantic-retrieval-dispatch.js');
        const lane = String(
          config.semantic_lane || config.execution_lane || toolKey || '',
        ).trim();
        const query = String(params.query || params.q || '').trim();
        if (!query) {
          result = { ok: false, error: 'semantic_retrieval requires query' };
          break;
        }
        const out = await dispatchSemanticRetrieval(env, {
          lane,
          query,
          workspace_id: workspaceId,
          tenant_id: tenantId,
          user_id: userId,
          agent_run_id: agentRunId,
          top_k: Math.min(Math.max(Number(params.top_k ?? params.topK ?? 6) || 6, 1), 24),
        });
        result = { ok: out?.ok !== false, body: out };
        break;
      }
      if (dispatcher === 'database_assistant') {
        const { authUserIsSuperadmin } = await import('./auth.js');
        const authUser = runContext.authUser ?? runContext.user ?? null;
        const isOwner =
          authUserIsSuperadmin(authUser) ||
          String(authUser?.role || '').toLowerCase() === 'owner';
        const cfgPlane = String(config.data_plane || '').trim();
        if ((config.admin_only === true || config.admin_only === 1 || cfgPlane.startsWith('platform_')) && !isOwner) {
          result = {
            ok: false,
            error: 'access_denied',
            reason: 'platform_tool_owner_only',
          };
          break;
        }
      }
      if (dispatcher === 'database_assistant' || dispatcher === 'customer_data_plane') {
        const { dispatchCustomerDataPlaneOperation } = await import('./customer-data-plane-dispatch.js');
        const operation = String(
          params.operation || config.operation || 'inspect_schema',
        ).trim();
        const dataPlane = String(params.data_plane || config.data_plane || '').trim() || null;
        const out = await dispatchCustomerDataPlaneOperation(env, {
          operation,
          message: params.message != null ? String(params.message) : '',
          requested_provider: params.provider || config.provider || null,
          data_plane: dataPlane,
          authUser: runContext.authUser ?? runContext.user ?? null,
          user_id: userId,
          tenant_id: tenantId,
          workspace_id: workspaceId,
          schema: String(params.schema || config.schema || '').trim() || undefined,
          table: params.table != null ? String(params.table).trim() : '',
          sql: params.sql != null ? String(params.sql) : '',
          migration_sql: params.migration_sql != null ? String(params.migration_sql) : '',
          approval_id: params.approval_id ?? null,
          agent_run_id: agentRunId,
        });
        result = { ok: out?.ok !== false, body: out };
        break;
      }
      if (dispatcher === 'legacy_unified_rag' || config.legacy_unified_rag === true) {
        const { legacyUnifiedRagSearch } = await import('../api/rag.js');
        const query = String(params.query || params.q || '').trim();
        if (!query) {
          result = { ok: false, error: 'legacy_unified_rag requires query' };
          break;
        }
        const out = await legacyUnifiedRagSearch(env, query, {
          topK: Number(params.top_k ?? params.topK ?? 8) || 8,
          tenantId,
          workspaceId,
          sessionId: conversationId,
          caller: `catalog_tool:${toolKey}`,
        });
        result = {
          ok: true,
          body: {
            legacy: true,
            matches: out.matches || [],
            results: out.results || [],
            count: out.count || 0,
          },
        };
        break;
      }
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

    case 'builtin': {
      const dispatcher = String(config.dispatcher || toolKey || '').trim();
      const { handlers: webHandlers } = await import('../tools/builtin/web.js');
      const fn = webHandlers[dispatcher];
      if (typeof fn !== 'function') {
        result = { ok: false, error: `builtin dispatcher not registered: ${dispatcher}` };
        break;
      }
      const out = await fn(params, env, runContext);
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
      const op = String(config.operation || '').toLowerCase();
      const { handlers: ghHandlers } = await import('../tools/builtin/github-worker.js');
      const opMap = {
        get_file: 'github_get_file',
        read_file: 'github_get_file',
        list_repos: 'github_repos',
        update_file: 'github_update_file',
        create_file: 'github_update_file',
        create_pr: 'github_create_pr',
      };
      let handlerName = opMap[op] || null;
      if (!handlerName && toolKey === 'github_file') handlerName = 'github_get_file';
      if (!handlerName && toolKey === 'github_update_file') handlerName = 'github_update_file';
      if (!handlerName && toolKey === 'github_create_file') handlerName = 'github_update_file';
      if (!handlerName && toolKey === 'github_repos') handlerName = 'github_repos';
      if (!handlerName && toolKey === 'github_create_pr') handlerName = 'github_create_pr';
      if (!handlerName) {
        result = {
          ok: false,
          error: `unsupported_github_operation:${op || 'unknown'}`,
          body: { user_message: `GitHub operation "${op || 'unknown'}" is not configured for ${toolKey}.` },
        };
        break;
      }
      const fn = ghHandlers[handlerName];
      if (typeof fn !== 'function') {
        result = { ok: false, error: `github_handler_missing:${handlerName}` };
        break;
      }
      const envelope = runContext.activeFileEnvelope || runContext.activeFile || null;
      const { applyActiveFileDefaultsToToolInput } = await import('./active-file-envelope.js');
      const ghParams = applyActiveFileDefaultsToToolInput(toolKey, params, envelope);
      const out = await fn(ghParams, env);
      result = out?.error ? { ok: false, error: String(out.error), body: out } : { ok: true, body: out };
      break;
    }

    case 'mybrowser':
    case 'browser': {
      const toolName = String(row.tool_key || row.tool_name || '').trim();
      const { handlers: webHandlers } = await import('../tools/builtin/web.js');
      const fn = webHandlers[toolName];
      if (typeof fn !== 'function') {
        result = { ok: false, error: `browser handler not registered for tool_key=${toolName}` };
        break;
      }
      const out = await fn(params, env, runContext);
      result = out?.error ? { ok: false, error: String(out.error) } : { ok: true, body: out };
      break;
    }

    case 'cf': {
      if (['agentsam_d1_query', 'agentsam_d1_write', 'agentsam_d1_migrate'].includes(toolKey)) {
        const d1Row = { ...row, handler_type: 'd1' };
        return executeCatalogToolRow(env, d1Row, params, runContext);
      }
      if (['agentsam_r2_get', 'agentsam_r2_put', 'agentsam_r2_delete'].includes(toolKey)) {
        const r2Row = { ...row, handler_type: 'r2' };
        return executeCatalogToolRow(env, r2Row, params, runContext);
      }
      const httpRow = { ...row, handler_type: 'http' };
      return executeCatalogToolRow(env, httpRow, params, runContext);
    }

    case 'deploy': {
      let deployCommand = '';
      if (workspaceId && env?.DB) {
        const settingsRow = await env.DB.prepare(
          'SELECT settings_json FROM workspace_settings WHERE workspace_id = ? LIMIT 1',
        )
          .bind(workspaceId)
          .first()
          .catch(() => null);
        if (settingsRow?.settings_json) {
          try {
            const parsed =
              typeof settingsRow.settings_json === 'string'
                ? JSON.parse(settingsRow.settings_json)
                : settingsRow.settings_json;
            deployCommand = String(parsed?.deploy_command || '').trim();
          } catch (_) {}
        }
      }
      if (!deployCommand) {
        result = {
          ok: false,
          error: 'deploy_command not configured for this workspace',
          body: {
            action:
              'Set workspace_settings.settings_json.deploy_command for this workspace before deploying.',
            workspace_id: workspaceId || 'unknown',
          },
        };
        break;
      }
      const termRow = { ...row, handler_type: 'terminal' };
      return executeCatalogToolRow(
        env,
        termRow,
        { ...params, command: deployCommand },
        runContext,
      );
    }

    case 'git': {
      const termRow = { ...row, handler_type: 'terminal' };
      return executeCatalogToolRow(env, termRow, params, runContext);
    }

    case 'mcp':
    case 'browser_agentic':
    case 'proxy':
    case 'workspace.reader': {
      const op = String(config.operation || '').toLowerCase();
      const memOps = new Set([
        'memory_write',
        'memory_search',
        'memory_read',
        'memory_delete',
      ]);
      if (memOps.has(op)) {
        const { handlers: memoryHandlers } = await import('../tools/memory.js');
        const fn = memoryHandlers[op];
        if (typeof fn !== 'function') {
          result = { ok: false, error: `memory handler not registered: ${op}` };
          break;
        }
        const memCtx = {
          tenantId,
          userId,
          workspaceId,
          agentId: runContext.agentId ?? runContext.agent_id,
          sessionId: runContext.sessionId ?? runContext.session_id,
        };
        let memParams = params;
        if (op === 'memory_write') {
          const { resolveManagedMemoryType } = await import('./mcp-memory-type-compat.js');
          const resolved = resolveManagedMemoryType(params);
          memParams = {
            ...params,
            key: params.key ?? params.memory_key ?? params.memoryKey,
            value: params.value ?? params.content ?? params.body,
            memory_type: resolved.memory_type,
            tags: resolved.tags?.length ? resolved.tags : params.tags,
            source: params.source ?? `mcp:${toolKey}`,
          };
        }
        if (op === 'memory_search') {
          const { DEFAULT_MEMORY_SEARCH_QUERY } = await import('./mcp-memory-search-schema.js');
          memParams = {
            ...params,
            query:
              params.query ??
              params.q ??
              (params.top_k ? DEFAULT_MEMORY_SEARCH_QUERY : ''),
            limit: params.limit ?? params.top_k ?? 20,
          };
        }
        const out = await fn(memParams, env, memCtx);
        result = out?.error ? { ok: false, error: String(out.error), body: out } : { ok: true, body: out };
        break;
      }
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
      const { executeFsReadFile } = await import('./fs-read-file.js');
      const readOut = await executeFsReadFile(env, params, runContext);
      if (!readOut?.error) {
        result = { ok: true, body: readOut };
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
