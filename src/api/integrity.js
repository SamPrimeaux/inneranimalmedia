/**
 * API: System Integrity
 * Runs a full platform health snapshot against D1 and writes to
 * system_health_snapshots. Callable via HTTP or cron.
 *
 * Routes:
 *   POST /api/integrity/snapshot   — trigger a manual snapshot
 *   GET  /api/integrity/latest     — fetch most recent snapshot
 *   GET  /api/integrity/history    — last N snapshots
 *
 * Direct export:
 *   runIntegritySnapshot(env, triggeredBy) — call from cron handler
 */

import { getAuthUser } from '../core/auth.js';
import { jsonResponse } from '../core/responses.js';

// ---------------------------------------------------------------------------
// Health thresholds — read from env vars with sane defaults
// Allows tuning without code changes.
// ---------------------------------------------------------------------------

function thresholds(env) {
  return {
    rd_unknown_model_max:      parseInt(env.INTEGRITY_RD_UNKNOWN_MODEL_MAX      || '5',  10),
    rd_unclassified_task_max:  parseInt(env.INTEGRITY_RD_UNCLASSIFIED_TASK_MAX  || '10', 10),
    rd_pct_complete_valid_min: parseInt(env.INTEGRITY_RD_PCT_COMPLETE_VALID_MIN || '95', 10),
  };
}

// ---------------------------------------------------------------------------
// HTTP entry point
// ---------------------------------------------------------------------------

export async function handleIntegrityApi(request, url, env, ctx) {
  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
  if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);

  const path   = url.pathname.toLowerCase().replace(/\/$/, '');
  const method = request.method.toUpperCase();

  // POST /api/integrity/snapshot — run a manual snapshot
  if (path === '/api/integrity/snapshot' && method === 'POST') {
    try {
      const snapshot = await runIntegritySnapshot(env, 'manual');
      return jsonResponse({ ok: true, snapshot });
    } catch (err) {
      return jsonResponse({ error: err.message }, 500);
    }
  }

  // GET /api/integrity/latest — most recent snapshot
  if (path === '/api/integrity/latest' && method === 'GET') {
    const row = await env.DB.prepare(
      `SELECT * FROM system_health_snapshots ORDER BY snapshot_at DESC LIMIT 1`
    ).first();
    return jsonResponse({ snapshot: row || null });
  }

  // GET /api/integrity/history — last N snapshots
  if (path === '/api/integrity/history' && method === 'GET') {
    const limit = Math.min(100, parseInt(url.searchParams.get('limit') || '20', 10) || 20);
    const { results } = await env.DB.prepare(
      `SELECT * FROM system_health_snapshots ORDER BY snapshot_at DESC LIMIT ?`
    ).bind(limit).all();
    return jsonResponse({ snapshots: results || [] });
  }

  return jsonResponse({ error: 'Integrity route not found' }, 404);
}

// ---------------------------------------------------------------------------
// Core snapshot runner — callable from HTTP handler or cron
// ---------------------------------------------------------------------------

export async function runIntegritySnapshot(env, triggeredBy = 'cron') {
  if (!env?.DB) throw new Error('DB unavailable');

  const tb = ['cron', 'manual', 'deploy', 'api'].includes(String(triggeredBy))
    ? String(triggeredBy)
    : 'api';

  const t = thresholds(env);

  // Run all queries in parallel
  const [r1, r2, r3all, r4, r4b, r5, r5b] = await Promise.all([

    // Routing decisions health
    env.DB.prepare(`
      SELECT
        COUNT(*) AS rd_total,
        COALESCE(SUM(CASE WHEN task_type = 'unclassified' THEN 1 ELSE 0 END), 0)             AS rd_unclassified_task,
        COALESCE(SUM(CASE WHEN model_selected = 'unknown' THEN 1 ELSE 0 END), 0)             AS rd_unknown_model,
        COALESCE(SUM(CASE WHEN rule_source = 'unknown' THEN 1 ELSE 0 END), 0)                AS rd_unknown_rule_source,
        COALESCE(SUM(completed), 0)                                                          AS rd_completed,
        COALESCE(SUM(CASE WHEN completed = 1 AND latency_ms IS NULL THEN 1 ELSE 0 END), 0)  AS rd_missing_latency,
        COALESCE(SUM(CASE WHEN completed = 1 AND cost_usd IS NULL THEN 1 ELSE 0 END), 0)    AS rd_missing_cost,
        COALESCE(SUM(CASE WHEN completed = 1 AND input_tokens IS NULL THEN 1 ELSE 0 END), 0) AS rd_missing_tokens,
        ROUND(
          100.0 * COALESCE(SUM(CASE WHEN completed = 1 AND latency_ms IS NOT NULL AND cost_usd IS NOT NULL THEN 1 ELSE 0 END), 0)
          / NULLIF(COALESCE(SUM(completed), 0), 0),
          1
        ) AS rd_pct_complete_valid
      FROM routing_decisions
    `).first(),

    // Telemetry totals
    env.DB.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN created_at >= (unixepoch() - 86400)  THEN 1 ELSE 0 END), 0)                   AS tel_total_24h,
        COALESCE(SUM(CASE WHEN created_at >= (unixepoch() - 604800) THEN 1 ELSE 0 END), 0)                   AS tel_total_7d,
        COALESCE(SUM(CASE WHEN created_at >= (unixepoch() - 86400)  THEN computed_cost_usd ELSE 0 END), 0)   AS tel_cost_24h,
        COALESCE(SUM(CASE WHEN created_at >= (unixepoch() - 604800) THEN computed_cost_usd ELSE 0 END), 0)   AS tel_cost_7d
      FROM agent_telemetry
    `).first(),

    // Telemetry by provider (7d)
    env.DB.prepare(`
      SELECT provider, COUNT(*) AS n, SUM(computed_cost_usd) AS cost
      FROM agent_telemetry
      WHERE created_at >= (unixepoch() - 604800)
      GROUP BY provider
      ORDER BY n DESC
    `).all(),

    // MCP tool health
    env.DB.prepare(`
      SELECT
        COUNT(*)                                                                               AS tools_total,
        COALESCE(SUM(is_degraded), 0)                                                         AS tools_degraded,
        COALESCE(SUM(CASE WHEN modes_json IS NULL OR modes_json = '' THEN 1 ELSE 0 END), 0)  AS tools_missing_modes
      FROM mcp_registered_tools
      WHERE enabled = 1
    `).first(),

    // Top failing tools
    env.DB.prepare(`
      SELECT
        tool_name,
        SUM(failure_count) AS failure_count,
        SUM(success_count) AS success_count,
        ROUND(100.0 * SUM(failure_count) / NULLIF(SUM(failure_count) + SUM(success_count), 0), 1) AS fail_pct
      FROM mcp_tool_call_stats
      GROUP BY tool_name
      HAVING SUM(failure_count) > 0
      ORDER BY fail_pct DESC
      LIMIT 5
    `).all(),

    // Intent + routing rule counts
    env.DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM agent_intent_patterns)                                          AS intents_total,
        (SELECT COUNT(*) FROM agent_intent_patterns WHERE total_executions > 0)               AS intents_wired,
        (SELECT COUNT(*) FROM model_routing_rules WHERE is_active = 1)                        AS routing_rules_active,
        (SELECT COUNT(*) FROM model_routing_rules WHERE is_active = 1 AND provider = 'google') AS routing_rules_with_google,
        (SELECT COUNT(*) FROM provider_prompt_fragments WHERE is_active = 1)                  AS provider_fragments_active
    `).first(),

    // Top intents by execution count
    env.DB.prepare(`
      SELECT intent_slug, total_executions
      FROM agent_intent_patterns
      WHERE total_executions > 0
      ORDER BY total_executions DESC
      LIMIT 10
    `).all(),
  ]);

  // ---------------------------------------------------------------------------
  // Normalize values
  // ---------------------------------------------------------------------------

  const n = (obj, key) => (obj != null && obj[key] != null ? Number(obj[key]) : 0);

  const rd_total              = n(r1, 'rd_total');
  const rd_unclassified_task  = n(r1, 'rd_unclassified_task');
  const rd_unknown_model      = n(r1, 'rd_unknown_model');
  const rd_unknown_rule_source = n(r1, 'rd_unknown_rule_source');
  const rd_completed          = n(r1, 'rd_completed');
  const rd_missing_latency    = n(r1, 'rd_missing_latency');
  const rd_missing_cost       = n(r1, 'rd_missing_cost');
  const rd_missing_tokens     = n(r1, 'rd_missing_tokens');

  let rd_pct_complete_valid = Number(r1?.rd_pct_complete_valid);
  if (rd_completed === 0)              rd_pct_complete_valid = 100;
  else if (!Number.isFinite(rd_pct_complete_valid)) rd_pct_complete_valid = 0;

  const tel_total_24h       = n(r2, 'tel_total_24h');
  const tel_total_7d        = n(r2, 'tel_total_7d');
  const tel_cost_24h        = n(r2, 'tel_cost_24h');
  const tel_cost_7d         = n(r2, 'tel_cost_7d');
  const tel_providers_json  = JSON.stringify(
    (r3all?.results ?? []).map(row => ({
      provider: row.provider,
      n:        Number(row.n)    || 0,
      cost:     Number(row.cost) || 0,
    }))
  );

  const tools_total          = n(r4, 'tools_total');
  const tools_degraded       = n(r4, 'tools_degraded');
  const tools_missing_modes  = n(r4, 'tools_missing_modes');
  const tool_top_failures_json = JSON.stringify(r4b?.results ?? []);

  const intents_total              = n(r5, 'intents_total');
  const intents_wired              = n(r5, 'intents_wired');
  const routing_rules_active       = n(r5, 'routing_rules_active');
  const routing_rules_with_google  = n(r5, 'routing_rules_with_google');
  const provider_fragments_active  = n(r5, 'provider_fragments_active');
  const intents_top_json           = JSON.stringify(r5b?.results ?? []);

  // ---------------------------------------------------------------------------
  // Health classification — driven by env-configurable thresholds
  // ---------------------------------------------------------------------------

  const notes = [];

  if (rd_missing_cost    > 0) notes.push('completed routing rows missing cost_usd');
  if (rd_missing_latency > 0) notes.push('completed routing rows missing latency_ms');
  if (rd_missing_tokens  > 0) notes.push('completed routing rows missing input_tokens');
  if (rd_unknown_model   > t.rd_unknown_model_max)     notes.push(`rd_unknown_model above ${t.rd_unknown_model_max}`);
  if (rd_unclassified_task > t.rd_unclassified_task_max) notes.push(`rd_unclassified_task above ${t.rd_unclassified_task_max}`);
  if (tools_degraded       > 0)                        notes.push('degraded tools enabled');
  if (rd_pct_complete_valid < t.rd_pct_complete_valid_min) notes.push(`rd_pct_complete_valid below ${t.rd_pct_complete_valid_min}`);
  if (tools_missing_modes  > 0)                        notes.push('enabled tools missing modes_json');

  const isRed    = rd_missing_cost > 0 || rd_missing_latency > 0 || rd_unknown_model > t.rd_unknown_model_max;
  const isYellow = rd_unclassified_task > t.rd_unclassified_task_max || tools_degraded > 0 || rd_pct_complete_valid < t.rd_pct_complete_valid_min;

  const health_status = isRed ? 'red' : isYellow ? 'yellow' : 'green';
  const health_notes  = notes.join(', ');

  // ---------------------------------------------------------------------------
  // Persist snapshot
  // ---------------------------------------------------------------------------

  const snapId      = `snap_${crypto.randomUUID().replace(/-/g, '').slice(0, 24).toLowerCase()}`;
  const snapshot_at = Math.floor(Date.now() / 1000);

  await env.DB.prepare(`
    INSERT INTO system_health_snapshots (
      id, triggered_by, snapshot_at,
      rd_total, rd_unclassified_task, rd_unknown_model, rd_unknown_rule_source, rd_completed,
      rd_missing_latency, rd_missing_cost, rd_missing_tokens, rd_pct_complete_valid,
      tel_total_24h, tel_total_7d, tel_cost_24h, tel_cost_7d, tel_providers_json,
      tools_total, tools_degraded, tools_missing_modes, tool_top_failures_json,
      intents_total, intents_wired, intents_top_json,
      routing_rules_active, routing_rules_with_google, provider_fragments_active,
      health_status, health_notes, created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    snapId, tb, snapshot_at,
    rd_total, rd_unclassified_task, rd_unknown_model, rd_unknown_rule_source, rd_completed,
    rd_missing_latency, rd_missing_cost, rd_missing_tokens, rd_pct_complete_valid,
    tel_total_24h, tel_total_7d, tel_cost_24h, tel_cost_7d, tel_providers_json,
    tools_total, tools_degraded, tools_missing_modes, tool_top_failures_json,
    intents_total, intents_wired, intents_top_json,
    routing_rules_active, routing_rules_with_google, provider_fragments_active,
    health_status, health_notes, snapshot_at
  ).run();

  return await env.DB.prepare(
    `SELECT * FROM system_health_snapshots WHERE id = ?`
  ).bind(snapId).first();
}
