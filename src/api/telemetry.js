/**
 * API Service: Telemetry & Auditing
 * Handles performance tracking, cost calculation, and spend auditing.
 * Deconstructed from legacy worker.js.
 */
import { resolveTelemetryTenantId } from '../core/auth';

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
    sessionId, tenantId, provider, model,
    inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens,
    latencyMs, toolCallCount, toolNamesUsed,
    promptPreview, responsePreview,
    success, errorMessage,
    routingDecisionId, agentRunId,
    computedCostUsdOverride,
  } = data;

  const modelKey = model != null ? String(model) : '';
  const rates = modelKey && modelRates ? modelRates[modelKey] : null;
  let estimatedCost = null;
  if (computedCostUsdOverride != null && Number.isFinite(Number(computedCostUsdOverride))) {
    estimatedCost = Number(computedCostUsdOverride);
  } else if (rates) {
    estimatedCost = computeUsdFromModelRatesRow(modelKey, rates, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens);
  }

  const telemetryId = `tel_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const metaObj = {
    routing_decision_id: routingDecisionId || null,
    agent_run_id: agentRunId || null,
    tool_call_count: toolCallCount || 0,
    tool_names_used: toolNamesUsed || [],
    prompt_preview: (promptPreview || '').slice(0, 500),
    response_preview: (responsePreview || '').slice(0, 500),
    success: !!success,
    error_message: errorMessage || null,
    request_latency_ms: latencyMs ?? null,
  };
  
  const mid = resolveTelemetryTenantId(env, tenantId);
  const sid = sessionId != null ? String(sessionId) : null;

  try {
    await env.DB.prepare(
      `INSERT INTO agent_telemetry (
        id, tenant_id, session_id, metric_type, metric_name, metric_value, timestamp, metadata_json,
        model_used, provider, input_tokens, output_tokens,
        cache_read_input_tokens, cache_creation_input_tokens,
        computed_cost_usd, total_input_tokens,
        event_type, severity, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,unixepoch(),?,?,?,?,?,?,?,?,?,?,?,unixepoch(),unixepoch())`
    ).bind(
      telemetryId, mid ?? null, sid,
      'agent_chat', 'llm_turn', 1, JSON.stringify(metaObj),
      modelKey, String(provider || 'unknown'),
      Math.floor(inputTokens || 0), Math.floor(outputTokens || 0), 
      Math.floor(cacheReadTokens || 0), Math.floor(cacheWriteTokens || 0),
      estimatedCost ?? 0, (inputTokens || 0) + (cacheReadTokens || 0) + (cacheWriteTokens || 0),
      'chat', success ? 'info' : 'warning'
    ).run();

    // PHASE 4B — ai_provider_usage rollup (correct schema: tokens_input/tokens_output/cost_usd/requests)
    // SCHEMA FIX: actual table has NO model or tenant_id column. UNIQUE(provider, date) declared inline.
    // Previous upsert used wrong column names (total_requests, total_tokens_in, etc.) and
    // conflict target (id) — it was silently failing on every call after the first row.
    {
      const spFixed = spendLedgerProvider(String(provider || 'unknown'));
      const dateStr = new Date().toISOString().slice(0, 10);
      const rowId = `${spFixed}-${dateStr}`;
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
        Math.floor((inputTokens || 0) + (cacheReadTokens || 0)),
        Math.floor(outputTokens || 0),
        estimatedCost || 0
      ).run().catch(e => console.warn('[ai_provider_usage] rollup failed:', e.message));
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
        'agent_telemetry', telemetryId
      ).run();
    }
  } catch (e) {
    console.error('[writeTelemetry] failed:', e.message);
  }

  return telemetryId;
}

/**
 * High-level generation log (course/lesson matched).
 */
export async function insertAiGenerationLog(env, opts) {
  if (!env?.DB || !opts?.generationType) return;
  const tid = resolveTelemetryTenantId(env, opts.tenantId);
  if (!tid) return;

  const id = opts.explicitId || 'aigl_' + crypto.randomUUID().replace(/-/g, '').slice(0, 24);
  const now = Math.floor(Date.now() / 1000);
  
  try {
    await env.DB.prepare(
      `INSERT INTO ai_generation_log (
        id, tenant_id, generation_type, prompt, model, response_text,
        input_tokens, output_tokens, computed_cost_usd, status, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
       id, tid, opts.generationType, opts.prompt || '', opts.model || 'unknown', opts.responseText || '',
       opts.inputTokens || 0, opts.outputTokens || 0, opts.computedCostUsd || 0, opts.status || 'completed',
       opts.createdBy || 'worker', now
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
