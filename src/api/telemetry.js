/**
 * API Layer: Telemetry & AI Usage Auditing
 * Writes per-call AI telemetry, cost calculations, spend ledger entries,
 * and worker error logs. All project/worker identifiers from env.
 *
 * Tables: agent_telemetry, ai_provider_usage, spend_ledger,
 *         worker_analytics_errors, ai_generation_log, ai_context_versions
 */
import { tenantIdFromEnv, projectIdFromEnv } from '../core/auth.js';
import { jsonResponse }                       from '../core/responses.js';
import { getAuthUser }                        from '../core/auth.js';

// ─── Provider Normalization ───────────────────────────────────────────────────

/**
 * Normalize provider name to spend_ledger CHECK constraint values.
 */
export function spendLedgerProvider(provider) {
  const map = {
    workers_ai: 'cloudflare_workers_ai',
    cloudflare: 'cloudflare',
    anthropic:  'anthropic',
    openai:     'openai',
    google:     'google',
    gemini:     'google',
    vertex:     'google',
    cursor:     'cursor',
    stripe:     'stripe',
    supabase:   'supabase',
    resend:     'resend',
  };
  return map[String(provider || '').toLowerCase()] || 'other';
}

// ─── Cost Calculation ─────────────────────────────────────────────────────────

/**
 * Compute USD cost from ai_models rate row.
 * Handles per-mtok, neurons, per-image, per-second, per-character pricing units.
 */
export function computeUsdFromModelRatesRow(modelKey, ratesRow, inputTokens, outputTokens, cacheReadTokens = 0, cacheWriteTokens = 0) {
  if (!ratesRow) return 0;
  const unit = String(ratesRow.pricing_unit || 'usd_per_mtok').toLowerCase();

  if (unit === 'free' || unit === 'subscription') return 0;

  if (unit === 'neurons_per_mtok') {
    const inRate  = Number(ratesRow.input_rate_per_mtok)  || 0;
    const outRate = Number(ratesRow.output_rate_per_mtok) || 0;
    return (
      (Number(inputTokens)  || 0) * inRate  * 0.000011 / 1_000_000 +
      (Number(outputTokens) || 0) * outRate * 0.000011 / 1_000_000
    );
  }

  if (['per_image','per_second','per_character'].includes(unit)) {
    return (Number(outputTokens) || 0) * (Number(ratesRow.cost_per_unit) || 0);
  }

  // Standard per-mtok
  return (
    (Number(inputTokens)       || 0) * (Number(ratesRow.input_rate_per_mtok)        || 0) +
    (Number(outputTokens)      || 0) * (Number(ratesRow.output_rate_per_mtok)       || 0) +
    (Number(cacheReadTokens)   || 0) * (Number(ratesRow.cache_read_rate_per_mtok)   || 0) +
    (Number(cacheWriteTokens)  || 0) * (Number(ratesRow.cache_write_rate_per_mtok)  || 0)
  ) / 1_000_000;
}

// ─── Worker Error Logging ─────────────────────────────────────────────────────

/**
 * Log a worker error to worker_analytics_errors.
 * Uses env for worker_name and environment — never hardcoded.
 */
export async function recordWorkerAnalyticsError(env, { path = '', method = 'GET', status_code = 500, error_message = '' } = {}) {
  if (!env?.DB) return;
  const workerName  = projectIdFromEnv(env) || 'unknown';
  const environment = env.ENVIRONMENT || 'production';
  const ts          = Math.floor(Date.now() / 1000);

  try {
    await env.DB.prepare(
      `INSERT INTO worker_analytics_errors
       (event_id, worker_name, environment, timestamp, error_message, path, method, status_code, resolved, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
    ).bind(
      crypto.randomUUID(),
      workerName,
      environment,
      ts,
      String(error_message || '').slice(0, 8000),
      String(path          || '').slice(0, 500),
      String(method        || 'GET').slice(0, 24),
      Number.isFinite(Number(status_code)) ? Number(status_code) : 500,
      ts
    ).run();
  } catch (e) {
    console.warn('[worker_analytics_errors]', e?.message ?? e);
  }
}

// ─── Core Telemetry Write ─────────────────────────────────────────────────────

/**
 * Write a unified AI telemetry event + spend ledger entry.
 * Called after every LLM API response in the tool loop.
 *
 * @param {object} env
 * @param {object} data - telemetry fields
 * @param {object|null} modelRates - map of model_key → ai_models row (for cost calc)
 * @returns {Promise<string>} telemetryId
 */
export async function writeTelemetry(env, data, modelRates = null) {
  const {
    sessionId, tenantId, provider, model,
    inputTokens = 0, outputTokens = 0,
    cacheReadTokens = 0, cacheWriteTokens = 0,
    latencyMs, toolCallCount, toolNamesUsed,
    promptPreview, responsePreview,
    success = true, errorMessage,
    routingDecisionId, agentRunId,
    computedCostUsdOverride,
  } = data;

  const modelKey = model != null ? String(model) : '';
  const rates    = modelKey && modelRates ? modelRates[modelKey] : null;

  let estimatedCost = 0;
  if (computedCostUsdOverride != null && Number.isFinite(Number(computedCostUsdOverride))) {
    estimatedCost = Number(computedCostUsdOverride);
  } else if (rates) {
    estimatedCost = computeUsdFromModelRatesRow(modelKey, rates, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens);
  }

  const telemetryId = `tel_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const mid = tenantId || tenantIdFromEnv(env);
  const sid = sessionId != null ? String(sessionId) : null;

  const meta = JSON.stringify({
    routing_decision_id: routingDecisionId || null,
    agent_run_id:        agentRunId        || null,
    tool_call_count:     toolCallCount     || 0,
    tool_names_used:     toolNamesUsed     || [],
    prompt_preview:      String(promptPreview   || '').slice(0, 500),
    response_preview:    String(responsePreview || '').slice(0, 500),
    success:             !!success,
    error_message:       errorMessage || null,
    request_latency_ms:  latencyMs ?? null,
  });

  try {
    await env.DB.prepare(
      `INSERT INTO agent_telemetry
       (id, tenant_id, session_id, metric_type, metric_name, metric_value, timestamp, metadata_json,
        model_used, provider, input_tokens, output_tokens, cache_read_input_tokens,
        cache_creation_input_tokens, computed_cost_usd, total_input_tokens,
        event_type, severity, created_at, updated_at)
       VALUES (?,?,?,?,?,?,unixepoch(),?,?,?,?,?,?,?,?,?,?,?,unixepoch(),unixepoch())`
    ).bind(
      telemetryId, mid ?? null, sid,
      'agent_chat', 'llm_turn', 1, meta,
      modelKey, spendLedgerProvider(provider || 'unknown'),
      Math.floor(inputTokens), Math.floor(outputTokens),
      Math.floor(cacheReadTokens), Math.floor(cacheWriteTokens),
      estimatedCost,
      Math.floor(inputTokens) + Math.floor(cacheReadTokens) + Math.floor(cacheWriteTokens),
      'chat', success ? 'info' : 'warning'
    ).run();

    // Daily provider usage rollup
    const provFixed = spendLedgerProvider(provider || 'unknown');
    const dateStr   = new Date().toISOString().slice(0, 10);
    await env.DB.prepare(
      `INSERT INTO ai_provider_usage (id, provider, date, requests, tokens_input, tokens_output, cost_usd)
       VALUES (?, ?, ?, 1, ?, ?, ?)
       ON CONFLICT(provider, date) DO UPDATE SET
         requests      = requests + 1,
         tokens_input  = tokens_input  + excluded.tokens_input,
         tokens_output = tokens_output + excluded.tokens_output,
         cost_usd      = cost_usd      + excluded.cost_usd`
    ).bind(
      `${provFixed}-${dateStr}`, provFixed, dateStr,
      Math.floor(inputTokens + cacheReadTokens),
      Math.floor(outputTokens),
      estimatedCost
    ).run().catch(e => console.warn('[ai_provider_usage]', e?.message));

    // Spend ledger entry
    if (mid && estimatedCost > 0) {
      const projectId = projectIdFromEnv(env) || 'unknown';
      const lid       = 'sl_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
      await env.DB.prepare(
        `INSERT INTO spend_ledger
         (id, tenant_id, workspace_id, brand_id, provider, source, occurred_at, amount_usd,
          model_key, tokens_in, tokens_out, session_tag, project_id, ref_table, ref_id)
         VALUES (?,?,?,?,?,?,unixepoch(),?,?,?,?,?,?,?,?)`
      ).bind(
        lid, mid, 'default', projectId, provFixed, 'api_direct',
        estimatedCost, modelKey,
        Math.floor(inputTokens), Math.floor(outputTokens),
        sid || 'unknown', projectId,
        'agent_telemetry', telemetryId
      ).run().catch(e => console.warn('[spend_ledger]', e?.message));
    }
  } catch (e) {
    console.error('[writeTelemetry]', e?.message);
  }

  return telemetryId;
}

// ─── Generation Log ───────────────────────────────────────────────────────────

/**
 * Log a high-level AI generation event (content generation, embeddings, etc.).
 */
export async function insertAiGenerationLog(env, opts) {
  if (!env?.DB || !opts?.generationType) return;
  const tid = opts.tenantId || tenantIdFromEnv(env);
  if (!tid) return;

  const id  = opts.explicitId || `aigl_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;

  try {
    await env.DB.prepare(
      `INSERT INTO ai_generation_log
       (id, tenant_id, generation_type, prompt, model, response_text,
        input_tokens, output_tokens, computed_cost_usd, status, created_by, context_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, tid, opts.generationType,
      opts.prompt       || '',
      opts.model        || 'unknown',
      opts.responseText || '',
      opts.inputTokens  || 0,
      opts.outputTokens || 0,
      opts.computedCostUsd || 0,
      opts.status       || 'completed',
      opts.createdBy    || 'worker',
      opts.contextId    || null
    ).run();

    // Optional context version snapshot
    if (opts.contextToSnap && opts.contextId) {
      const verRow = await env.DB.prepare(
        `SELECT COALESCE(MAX(version_number),0) AS max_v FROM ai_context_versions WHERE context_id = ?`
      ).bind(opts.contextId).first().catch(() => null);
      const nextVer = (verRow?.max_v ?? 0) + 1;

      await env.DB.prepare(
        `INSERT INTO ai_context_versions
         (id, context_id, version_number, value_before, value_after, change_reason, changed_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        `ctxv_${crypto.randomUUID().replace(/-/g,'').slice(0,12)}`,
        opts.contextId, nextVer,
        opts.valueBefore    ?? null,
        JSON.stringify(opts.contextToSnap),
        opts.changeReason   || 'generation_log',
        opts.changedBy      || 'worker'
      ).run().catch(() => {});
    }
  } catch (e) {
    console.warn('[insertAiGenerationLog]', e?.message);
  }
}

// ─── HTTP Handler ─────────────────────────────────────────────────────────────

export async function handleTelemetryApi(request, url, env, ctx) {
  const path   = url.pathname.toLowerCase().replace(/\/$/, '');
  const method = request.method.toUpperCase();

  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
  if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);

  // GET /api/telemetry/recent — last N telemetry rows
  if (path === '/api/telemetry/recent' && method === 'GET') {
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);
    try {
      const { results } = await env.DB.prepare(
        `SELECT id, provider, model_used, input_tokens, output_tokens, computed_cost_usd,
                event_type, severity, created_at
         FROM agent_telemetry ORDER BY created_at DESC LIMIT ?`
      ).bind(limit).all();
      return jsonResponse({ rows: results || [] });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  // GET /api/telemetry/usage — provider daily rollup
  if (path === '/api/telemetry/usage' && method === 'GET') {
    const days = parseInt(url.searchParams.get('days') || '30', 10);
    try {
      const { results } = await env.DB.prepare(
        `SELECT * FROM ai_provider_usage
         WHERE date >= date('now', ?)
         ORDER BY date DESC, cost_usd DESC`
      ).bind(`-${days} days`).all();
      return jsonResponse({ usage: results || [] });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  // GET /api/agent/telemetry — alias used by App.tsx health polling
  if (path === '/api/agent/telemetry' && method === 'GET') {
    try {
      const [total, today] = await Promise.all([
        env.DB.prepare(`SELECT COALESCE(SUM(computed_cost_usd),0) AS total FROM agent_telemetry`).first(),
        env.DB.prepare(`SELECT COALESCE(SUM(computed_cost_usd),0) AS total FROM agent_telemetry WHERE created_at >= unixepoch() - 86400`).first(),
      ]);
      return jsonResponse({ ok: true, total_cost_usd: total?.total || 0, today_cost_usd: today?.total || 0 });
    } catch (e) {
      return jsonResponse({ ok: true, total_cost_usd: 0, today_cost_usd: 0 });
    }
  }

  return jsonResponse({ error: 'Telemetry route not found', path }, 404);
}
