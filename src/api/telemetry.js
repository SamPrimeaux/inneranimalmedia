/**
 * API Service: Telemetry & Auditing
 * Handles performance tracking, cost calculation, and spend auditing.
 * Deconstructed from legacy worker.js.
 */
import { resolveTelemetryTenantId } from '../core/auth';
import { pragmaTableInfo } from '../core/retention.js';
import { estimateCostUsdFromCatalog } from '../core/model-catalog-cost.js';

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
export function computeUsdFromModelRatesRow(modelKey, ratesRow, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens) {
  if (!ratesRow) return 0;
  const unit = (ratesRow.pricing_unit || 'usd_per_mtok').toLowerCase();

  if (unit === 'free' || unit === 'subscription') return 0;

  if (unit === 'neurons_per_mtok') {
    const inRate = Number(ratesRow.input_rate_per_mtok) || 0;
    const outRate = Number(ratesRow.output_rate_per_mtok) || 0;
    const inCost = (Number(inputTokens) || 0) * inRate * 0.000011 / 1_000_000;
    const outCost = (Number(outputTokens) || 0) * outRate * 0.000011 / 1_000_000;
    return inCost + outCost;
  }

  if (['per_image', 'per_second', 'per_character'].includes(unit)) {
    return (Number(outputTokens) || 0) * (Number(ratesRow.cost_per_unit) || 0);
  }

  const inR = Number(ratesRow.input_rate_per_mtok) || 0;
  const outR = Number(ratesRow.output_rate_per_mtok) || 0;
  const cr = Number(ratesRow.cache_read_rate_per_mtok) || 0;
  const cw = Number(ratesRow.cache_write_rate_per_mtok) || 0;
  
  return (
    (Number(inputTokens) || 0) * inR +
    (Number(outputTokens) || 0) * outR +
    (Number(cacheReadTokens) || 0) * cr +
    (Number(cacheWriteTokens) || 0) * cw
  ) / 1_000_000;
}

/**
 * Write a unified telemetry event and linked spend record.
 */
export async function writeTelemetry(env, data, modelRates) {
  const {
    sessionId, tenantId, workspaceId, provider, model,
    inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens,
    latencyMs,
    success,
    computedCostUsdOverride,
    routingArmId,
  } = data;

  const modelKey = model != null ? String(model) : '';
  const rates = modelKey && modelRates ? modelRates[modelKey] : null;
  let estimatedCost = null;
  if (computedCostUsdOverride != null && Number.isFinite(Number(computedCostUsdOverride))) {
    estimatedCost = Number(computedCostUsdOverride);
  } else if (rates) {
    estimatedCost = computeUsdFromModelRatesRow(modelKey, rates, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens);
  } else if (env?.DB && modelKey) {
    estimatedCost = await estimateCostUsdFromCatalog(
      env.DB,
      modelKey,
      inputTokens,
      outputTokens,
    );
  }

  const telemetryId = `tel_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const mid = resolveTelemetryTenantId(env, tenantId);
  const sid = sessionId != null ? String(sessionId) : null;

  const tidInsert = mid || 'default';
  const wsInsert =
    (workspaceId != null && String(workspaceId).trim() !== '' ? String(workspaceId).trim() : null) ||
    (typeof env?.WORKSPACE_ID === 'string' && env.WORKSPACE_ID.trim() ? env.WORKSPACE_ID.trim() : null);
  if (!wsInsert) {
    // Hard requirement: never write authenticated telemetry with null/blank workspace_id.
    // If caller didn't provide a workspace and platform isn't configured, skip.
    console.warn('[writeTelemetry] workspace_id missing; skipping agentsam_usage_events insert');
    return null;
  }
  const tokIn =
    Math.floor((Number(inputTokens) || 0) + (Number(cacheReadTokens) || 0) + (Number(cacheWriteTokens) || 0));
  const tokOut = Math.floor(Number(outputTokens) || 0);
  const totalTok = tokIn + tokOut;

  try {
    const usageCols = await pragmaTableInfo(env.DB, 'agentsam_usage_events');
    const armCol =
      routingArmId != null &&
      String(routingArmId).trim() !== '' &&
      usageCols.has('routing_arm_id');

    if (armCol) {
      await env.DB.prepare(
        `INSERT INTO agentsam_usage_events (
          id, tenant_id, workspace_id, session_id, agent_name, provider, model, model_key,
          tokens_in, tokens_out, total_tokens, cost_usd, status,
          event_type, duration_ms, routing_arm_id,
          created_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,unixepoch())`,
      ).bind(
        telemetryId,
        tidInsert,
        wsInsert,
        sid,
        'agent-sam',
        String(provider || 'unknown'),
        modelKey,
        modelKey,
        tokIn,
        tokOut,
        totalTok,
        estimatedCost ?? 0,
        success ? 'ok' : 'error',
        'agent_chat',
        latencyMs != null && Number.isFinite(Number(latencyMs)) ? Math.floor(Number(latencyMs)) : null,
        String(routingArmId).trim().slice(0, 120),
      ).run();
    } else {
      await env.DB.prepare(
        `INSERT INTO agentsam_usage_events (
          id, tenant_id, workspace_id, session_id, agent_name, provider, model, model_key,
          tokens_in, tokens_out, total_tokens, cost_usd, status,
          event_type, duration_ms,
          created_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,unixepoch())`,
      ).bind(
        telemetryId,
        tidInsert,
        wsInsert,
        sid,
        'agent-sam',
        String(provider || 'unknown'),
        modelKey,
        modelKey,
        tokIn,
        tokOut,
        totalTok,
        estimatedCost ?? 0,
        success ? 'ok' : 'error',
        'agent_chat',
        latencyMs != null && Number.isFinite(Number(latencyMs)) ? Math.floor(Number(latencyMs)) : null,
      ).run();
    }

    // PHASE 4B — ai_provider_usage rollup (correct schema: tokens_input/tokens_output/cost_usd/requests)
    // SCHEMA FIX: actual table has NO model or tenant_id column. UNIQUE(provider, date) declared inline.
    // Previous upsert used wrong column names (total_requests, total_tokens_in, etc.) and
    // conflict target (id) — it was silently failing on every call after the first row.
    {
      const spFixed = spendLedgerProvider(String(provider || 'unknown'));
      const dateStr = new Date().toISOString().slice(0, 10);
      const rowId = `${spFixed}-${dateStr}`;
      const tinRoll = Math.floor((inputTokens || 0) + (cacheReadTokens || 0));
      const toutRoll = Math.floor(outputTokens || 0);
      const totRoll = tinRoll + toutRoll;
      await env.DB.prepare(`
        INSERT INTO ai_provider_usage (id, provider, date, requests, tokens_input, tokens_output, cost_usd)
        VALUES (?, ?, ?, 1, ?, ?, ?)
        ON CONFLICT(provider, date) DO UPDATE SET
          requests      = requests + 1,
          tokens_input  = tokens_input  + excluded.tokens_input,
          tokens_output = tokens_output + excluded.tokens_output,
          cost_usd      = cost_usd + excluded.cost_usd
      `).bind(
        rowId, spFixed, dateStr,
        tinRoll,
        toutRoll,
        estimatedCost || 0
      ).run().catch(e => console.warn('[ai_provider_usage] rollup failed:', e.message));

      await env.DB.prepare(`
        INSERT INTO agentsam_usage_events (
          tenant_id, workspace_id, session_id, agent_name, provider, model, model_key,
          tokens_in, tokens_out, total_tokens, cost_usd, status, event_type,
          ref_table, ref_id, created_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, unixepoch())
        ON CONFLICT(ref_table, ref_id) DO UPDATE SET
          tokens_in = tokens_in + excluded.tokens_in,
          tokens_out = tokens_out + excluded.tokens_out,
          total_tokens = tokens_in + excluded.tokens_in + tokens_out + excluded.tokens_out,
          cost_usd = cost_usd + excluded.cost_usd
      `).bind(
        tidInsert,
        wsInsert,
        sid,
        'rollup-agent',
        spFixed,
        'rollup',
        'rollup',
        tinRoll,
        toutRoll,
        totRoll,
        estimatedCost || 0,
        'ok',
        'provider_daily_rollup',
        'ai_provider_usage',
        rowId,
      ).run().catch(e => console.warn('[agentsam_usage_events ai_provider mirror]', e.message));
    }

    if (mid && (estimatedCost ?? 0) > 0) {
      const spFixed = spendLedgerProvider(String(provider || 'unknown'));
      const lid = 'sl_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16).toLowerCase();
      await env.DB.prepare(
        `INSERT INTO spend_ledger (id, tenant_id, workspace_id, brand_id, provider, source, occurred_at, amount_usd, model_key, tokens_in, tokens_out, session_tag, project_id, ref_table, ref_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
         lid, mid, 'default', 'inneranimalmedia', spFixed, 'api_direct',
        Math.floor(Date.now() / 1000), estimatedCost, modelKey, inputTokens, outputTokens,
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
    (typeof env?.WORKSPACE_ID === 'string' && env.WORKSPACE_ID.trim() ? env.WORKSPACE_ID.trim() : null);
  if (!wsInsert) return;

  const id = opts.explicitId || 'aigl_' + crypto.randomUUID().replace(/-/g, '').slice(0, 24);
  const now = Math.floor(Date.now() / 1000);
  
  try {
    const tin = Math.floor(Number(opts.inputTokens) || 0);
    const tout = Math.floor(Number(opts.outputTokens) || 0);
    const mk = String(opts.model || 'unknown').trim() || 'unknown';
    await env.DB.prepare(
      `INSERT INTO agentsam_usage_events (
        id, tenant_id, workspace_id, agent_name, provider, model, model_key,
        tokens_in, tokens_out, total_tokens, cost_usd, status, event_type, tool_name, created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      id,
      tid,
      wsInsert,
      'agent-sam',
      'course_generation',
      mk,
      mk,
      tin,
      tout,
      tin + tout,
      Number(opts.computedCostUsd) || 0,
      (opts.status || 'completed').toLowerCase() === 'completed' ? 'ok' : 'error',
      String(opts.generationType || 'generation').slice(0, 120),
      String(opts.prompt || '').slice(0, 200),
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
