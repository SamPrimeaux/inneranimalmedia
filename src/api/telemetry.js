/**
 * API Service: Telemetry & Auditing
 * Handles performance tracking, cost calculation, and spend auditing.
 * Deconstructed from legacy worker.js.
 */
import { resolveTelemetryTenantId } from '../core/auth';
import { resolveCanonicalUserId } from './auth.js';
import { pragmaTableInfo } from '../core/retention.js';
import { computeUsdFromAgentsamAiRates } from '../core/model-catalog-cost.js';
import {
  estimateModelRunCostUsd,
  resolveCanonicalModelKey,
} from '../core/model-pricing.js';
import { resolveModelKeyFromProviderId } from '../core/model-catalog-cost.js';
import { syncUsageTokenColumns, usageEventExtraColumnSql } from '../core/usage-event-writer.js';
import { incrementAgentsamUsageRollupsDaily } from '../core/agentsam-usage-rollups-daily.js';

/**
 * Standardizes provider names for the spend ledger.
 */
export function spendLedgerProvider(provider) {
  return provider === 'workers_ai' ? 'cloudflare_workers_ai' : provider;
}

/**
 * Log a worker error to the analytics registry.
 */
export async function recordWorkerAnalyticsError(env, { path = '', method = 'GET', status_code = 500, error_message = '' } = {}) {
  if (!env?.DB) return;
  const eventId = crypto.randomUUID();
  const workerName = 'inneranimalmedia';
  const environment = 'production';
  const ts = Math.floor(Date.now() / 1000);
  const pathSlice = String(path || '').slice(0, 500);
  const methodSlice = String(method || 'GET').slice(0, 24);
  const code = Number(status_code);
  const msg = String(error_message || '').slice(0, 8000);

  try {
    await env.DB.prepare(
      `INSERT INTO worker_analytics_errors (
        event_id, worker_name, environment, timestamp,
        error_message, path, method, status_code, resolved, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      eventId, workerName, environment, ts,
      msg, pathSlice, methodSlice,
      Number.isFinite(code) ? code : 500,
      0, ts
    ).run();
  } catch (e) {
    console.warn('[worker_analytics_errors]', e?.message ?? e);
  }
}

/**
 * Compute USD cost based on D1 model rates.
 */
/** @deprecated Prefer {@link computeUsdFromAgentsamAiRates} — kept for callers passing preloaded rate maps. */
export function computeUsdFromModelRatesRow(
  modelKey,
  ratesRow,
  inputTokens,
  outputTokens,
  cacheReadTokens,
  cacheWriteTokens,
  cacheWriteTtl = '5m',
) {
  void modelKey;
  return computeUsdFromAgentsamAiRates(ratesRow, {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    cacheWriteTtl,
  });
}

/**
 * Write a unified telemetry event and linked spend record.
 */
export async function writeTelemetry(env, data, modelRates) {
  const {
    sessionId,
    tenantId,
    workspaceId,
    userId,
    provider,
    model,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    cacheWriteTtl,
    latencyMs,
    success,
    computedCostUsdOverride,
    routingArmId,
    taskType,
    task_type,
    mode,
  } = data;

  const rawModel = model != null ? String(model).trim() : '';
  let catalogModelKey = rawModel;
  if (env?.DB && rawModel) {
    const { modelKey: resolved } = await resolveModelKeyFromProviderId(env.DB, provider, rawModel);
    if (resolved) catalogModelKey = resolved;
  }
  const rates =
    rawModel && modelRates
      ? modelRates[rawModel] || (catalogModelKey ? modelRates[catalogModelKey] : undefined)
      : null;
  let estimatedCost = null;
  if (computedCostUsdOverride != null && Number.isFinite(Number(computedCostUsdOverride))) {
    estimatedCost = Number(computedCostUsdOverride);
  } else if (rates) {
    estimatedCost = computeUsdFromAgentsamAiRates(rates, {
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      cacheWriteTtl: cacheWriteTtl ?? '5m',
    });
  } else if (env?.DB && catalogModelKey) {
    const priced = await estimateModelRunCostUsd(env.DB, {
      modelKey: catalogModelKey,
      provider,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      cacheWriteTtl: cacheWriteTtl ?? '5m',
      pricingKind: data.pricingKind ?? 'standard',
    });
    estimatedCost = priced.costUsd;
    catalogModelKey = priced.canonicalModelKey || catalogModelKey;
  }

  const telemetryId = `tel_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const mid = resolveTelemetryTenantId(env, tenantId);
  const sid = sessionId != null ? String(sessionId) : null;

  const tidInsert = mid || 'default';
  const wsInsert =
    (workspaceId != null && String(workspaceId).trim() !== '' ? String(workspaceId).trim() : null) ||
    'system'; // system-scoped: no authenticated user context at this path
  if (!wsInsert) {
    // Hard requirement: never write authenticated telemetry with null/blank workspace_id.
    // If caller didn't provide a workspace and platform isn't configured, skip.
    console.warn('[writeTelemetry] workspace_id missing; skipping agentsam_usage_events insert');
    return null;
  }
  const tokIn =
    Math.floor((Number(inputTokens) || 0) + (Number(cacheReadTokens) || 0) + (Number(cacheWriteTokens) || 0));
  const tokOut = Math.floor(Number(outputTokens) || 0);
  const tokens = syncUsageTokenColumns(tokIn, tokOut);
  const resolvedTaskType =
    (taskType ?? task_type) != null ? String(taskType ?? task_type).trim() : '';
  const resolvedMode = mode != null ? String(mode).trim() : '';

  try {
    const usageCols = await pragmaTableInfo(env.DB, 'agentsam_usage_events');
    let uidUsage = userId != null ? String(userId).trim() : '';
    if (uidUsage) {
      uidUsage = await resolveCanonicalUserId(uidUsage, env);
    } else {
      uidUsage = null;
    }
    const hasUid = usageCols.has('user_id');
    const uidMid = hasUid ? ', user_id' : '';
    const uidMidPh = hasUid ? ',?' : '';
    const armCol =
      routingArmId != null &&
      String(routingArmId).trim() !== '' &&
      usageCols.has('routing_arm_id');
    const extra = usageEventExtraColumnSql(usageCols, {
      tokens_in: tokens.tokens_in,
      tokens_out: tokens.tokens_out,
      task_type: resolvedTaskType,
      mode: resolvedMode,
    });
    const extraCols = extra.names.length ? `, ${extra.names.join(', ')}` : '';
    const extraPh = extra.names.length ? `, ${extra.placeholders.join(', ')}` : '';

    if (armCol) {
      await env.DB.prepare(
        `INSERT INTO agentsam_usage_events (
          id, tenant_id, workspace_id${uidMid}, session_id, agent_name, provider, model, model_key,
          tokens_in, tokens_out, total_tokens, cost_usd, status,
          event_type, duration_ms, routing_arm_id${extraCols},
          created_at
        ) VALUES (?,?,?,?${uidMidPh},?,?,?,?,?,?,?,?,?,?,?,?${extraPh},unixepoch())`,
      ).bind(
        telemetryId,
        tidInsert,
        wsInsert,
        ...(hasUid ? [uidUsage] : []),
        sid,
        'agent-sam',
        String(provider || 'unknown'),
        rawModel || 'unknown',
        catalogModelKey || rawModel || 'unknown',
        tokens.tokens_in,
        tokens.tokens_out,
        tokens.total_tokens,
        estimatedCost ?? 0,
        success ? 'ok' : 'error',
        'agent_chat',
        latencyMs != null && Number.isFinite(Number(latencyMs)) ? Math.floor(Number(latencyMs)) : null,
        String(routingArmId).trim().slice(0, 120),
        ...extra.binds,
      ).run();
    } else {
      await env.DB.prepare(
        `INSERT INTO agentsam_usage_events (
          id, tenant_id, workspace_id${uidMid}, session_id, agent_name, provider, model, model_key,
          tokens_in, tokens_out, total_tokens, cost_usd, status,
          event_type, duration_ms${extraCols},
          created_at
        ) VALUES (?,?,?,?${uidMidPh},?,?,?,?,?,?,?,?,?,?,?${extraPh},unixepoch())`,
      ).bind(
        telemetryId,
        tidInsert,
        wsInsert,
        ...(hasUid ? [uidUsage] : []),
        sid,
        'agent-sam',
        String(provider || 'unknown'),
        rawModel || 'unknown',
        catalogModelKey || rawModel || 'unknown',
        tokens.tokens_in,
        tokens.tokens_out,
        tokens.total_tokens,
        estimatedCost ?? 0,
        success ? 'ok' : 'error',
        'agent_chat',
        latencyMs != null && Number.isFinite(Number(latencyMs)) ? Math.floor(Number(latencyMs)) : null,
        ...extra.binds,
      ).run();
    }

    await incrementAgentsamUsageRollupsDaily(env.DB, {
      tenantId: tidInsert,
      workspaceId: wsInsert,
      provider: String(provider || 'unknown'),
      tokensIn: tokIn,
      tokensOut: tokOut,
      costUsd: estimatedCost || 0,
      rollupSource: 'telemetry',
    });

    if (mid && (estimatedCost ?? 0) > 0) {
      const spFixed = spendLedgerProvider(String(provider || 'unknown'));
      const lid = 'sl_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16).toLowerCase();
      await env.DB.prepare(
        `INSERT INTO spend_ledger (id, tenant_id, workspace_id, brand_id, provider, source, occurred_at, amount_usd, model_key, tokens_in, tokens_out, session_tag, project_id, ref_table, ref_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
         lid, mid, 'default', 'inneranimalmedia', spFixed, 'api_direct',
        Math.floor(Date.now() / 1000), estimatedCost, catalogModelKey || rawModel, inputTokens, outputTokens,
        sid || 'unknown', 'proj_inneranimalmedia_main_prod_013',
        'agentsam_usage_events', telemetryId
      ).run();
    }
  } catch (e) {
    console.error('[writeTelemetry] failed:', e.message);
  }

  return { telemetryId, estimatedCostUsd: estimatedCost ?? 0 };
}

/**
 * High-level generation log (course/lesson matched).
 */
export async function insertAiGenerationLog(env, opts) {
  if (!env?.DB || !opts?.generationType) return;
  const tid = resolveTelemetryTenantId(env, opts.tenantId);
  if (!tid) return;
  const wsInsert =
    (opts.workspaceId != null && String(opts.workspaceId).trim() !== '' ? String(opts.workspaceId).trim() : null) ||
    'system'; // system-scoped: no authenticated user context at this path
  if (!wsInsert) return;

  const id = opts.explicitId || 'aigl_' + crypto.randomUUID().replace(/-/g, '').slice(0, 24);
  const now = Math.floor(Date.now() / 1000);
  
  try {
    const tokens = syncUsageTokenColumns(opts.inputTokens, opts.outputTokens);
    const mk = String(opts.model || 'unknown').trim() || 'unknown';
    const usageCols = await pragmaTableInfo(env.DB, 'agentsam_usage_events');
    const extra = usageEventExtraColumnSql(usageCols, {
      tokens_in: tokens.tokens_in,
      tokens_out: tokens.tokens_out,
      task_type: opts.taskType ?? opts.task_type ?? 'generation',
      mode: opts.mode ?? 'agent',
    });
    const extraCols = extra.names.length ? `, ${extra.names.join(', ')}` : '';
    const extraPh = extra.names.length ? `, ${extra.placeholders.join(', ')}` : '';
    await env.DB.prepare(
      `INSERT INTO agentsam_usage_events (
        id, tenant_id, workspace_id, agent_name, provider, model, model_key,
        tokens_in, tokens_out, total_tokens, cost_usd, status, event_type, tool_name${extraCols}, created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?${extraPh},?)`
    ).bind(
      id,
      tid,
      wsInsert,
      'agent-sam',
      'course_generation',
      mk,
      mk,
      tokens.tokens_in,
      tokens.tokens_out,
      tokens.total_tokens,
      Number(opts.computedCostUsd) || 0,
      (opts.status || 'completed').toLowerCase() === 'completed' ? 'ok' : 'error',
      String(opts.generationType || 'generation').slice(0, 120),
      String(opts.prompt || '').slice(0, 200),
      ...extra.binds,
      now,
    ).run();

    // PHASE 4D — Snapshot context if requested
    // SCHEMA FIX: actual ai_context_versions columns are (context_id, version_number, value_before,
    // value_after, change_reason, changed_by) — not (slug, content_hash, version_data, tenant_id).
    if (opts.contextToSnap && opts.contextId) {
      const snapId = `ctxv_${crypto.randomUUID().replace(/-/g,'').slice(0,12)}`;
      // Get current max version number for this context_id
      const verRow = await env.DB.prepare(
        `SELECT COALESCE(MAX(version_number), 0) as max_v FROM ai_context_versions WHERE context_id = ?`
      ).bind(opts.contextId).first().catch(() => null);
      const nextVer = (verRow?.max_v ?? 0) + 1;
      await env.DB.prepare(`
        INSERT INTO ai_context_versions
          (id, context_id, version_number, value_before, value_after, change_reason, changed_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        snapId, opts.contextId, nextVer,
        opts.valueBefore ?? null,
        JSON.stringify(opts.contextToSnap),
        opts.changeReason || 'generation_log',
        opts.changedBy || 'worker'
      ).run().catch(() => {});
    }
  } catch (e) {
    console.warn('[insertAiGenerationLog] failed:', e.message);
  }
}
