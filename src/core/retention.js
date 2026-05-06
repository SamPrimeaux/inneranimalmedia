/**
 * Daily retention: rollup tables + hot-log purge + optional Supabase warehouse offload.
 * Uses PRAGMA table_info before writes — column names are never guessed.
 */

import { decayRoutingArms, updateArmsFromMetrics } from './thompson.js';

const DEFAULT_TENANT = 'system';

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function pragmaTableInfo(db, tableName) {
  const safe = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(String(tableName || '')) ? String(tableName) : '';
  if (!safe || !db) return new Set();
  try {
    const { results } = await db.prepare(`PRAGMA table_info(${safe})`).all();
    return new Set((results || []).map((r) => String(r.name || '').toLowerCase()));
  } catch {
    return new Set();
  }
}

export async function tableExists(db, tableName) {
  const cols = await pragmaTableInfo(db, tableName);
  return cols.size > 0;
}

function pickDateColumn(cols, preferences) {
  for (const p of preferences) {
    if (cols.has(p)) return p;
  }
  return null;
}

async function ensureAgentsamUsageRollupsDaily(db) {
  if (await tableExists(db, 'agentsam_usage_rollups_daily')) return true;
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS agentsam_usage_rollups_daily (
        tenant_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        day TEXT NOT NULL,
        ai_calls INTEGER DEFAULT 0,
        tokens_in INTEGER DEFAULT 0,
        tokens_out INTEGER DEFAULT 0,
        cost_usd REAL DEFAULT 0,
        tool_calls INTEGER DEFAULT 0,
        tool_successes INTEGER DEFAULT 0,
        tool_failures INTEGER DEFAULT 0,
        mcp_calls INTEGER DEFAULT 0,
        deployments INTEGER DEFAULT 0,
        webhook_events INTEGER DEFAULT 0,
        error_count INTEGER DEFAULT 0,
        provider_breakdown_json TEXT,
        top_tools_json TEXT,
        rollup_source TEXT,
        rolled_up_at INTEGER,
        PRIMARY KEY (tenant_id, workspace_id, day)
      )
    `).run();
    return true;
  } catch {
    return false;
  }
}

export async function rollupAgentsamUsageDaily(env) {
  if (!env?.DB) return { ok: false, skipped: true, reason: 'no_db' };
  await ensureAgentsamUsageRollupsDaily(env.DB);

  const telCols = await pragmaTableInfo(env.DB, 'agentsam_usage_events');
  if (!telCols.has('created_at')) {
    return { ok: false, skipped: true, reason: 'agentsam_usage_events_missing_created_at' };
  }

  const costExpr = telCols.has('cost_usd') ? 'SUM(COALESCE(t.cost_usd,0))' : '0';
  const wsExpr = telCols.has('workspace_id')
    ? "COALESCE(t.workspace_id, 'default')"
    : "'default'";
  const tenantGroup = telCols.has('tenant_id')
    ? `COALESCE(t.tenant_id, '${DEFAULT_TENANT}')`
    : `'${DEFAULT_TENANT}'`;

  const toolCols = await pragmaTableInfo(env.DB, 'agentsam_tool_call_log');
  const toolDay =
    toolCols.has('created_at')
      ? `date(datetime(created_at, 'unixepoch')) = date('now','-1 day')`
      : '1=0';
  const succExpr = toolCols.has('status')
    ? `(LOWER(COALESCE(status,'')) IN ('success','ok','completed'))`
    : null;

  const depCols = await pragmaTableInfo(env.DB, 'deployments');
  const depDay =
    depCols.has('created_at')
      ? `date(datetime(created_at, 'unixepoch')) = date('now','-1 day')`
      : '1=0';

  const whCols = await pragmaTableInfo(env.DB, 'agentsam_webhook_events');
  const whCol = pickDateColumn(whCols, ['received_at', 'processed_at', 'created_at']);
  const whDay = whCol ? `date(${whCol}) = date('now','-1 day')` : '1=0';

  const errCols = await pragmaTableInfo(env.DB, 'worker_analytics_errors');
  const errDay =
    errCols.has('created_at')
      ? `date(datetime(created_at, 'unixepoch')) = date('now','-1 day')`
      : '1=0';

  const sql = `
    INSERT INTO agentsam_usage_rollups_daily (
      tenant_id, workspace_id, day, ai_calls, tokens_in, tokens_out, cost_usd,
      tool_calls, tool_successes, tool_failures, mcp_calls, deployments,
      webhook_events, error_count, provider_breakdown_json, top_tools_json, rollup_source, rolled_up_at
    )
    SELECT
      ${tenantGroup} AS tenant_id,
      ${wsExpr} AS workspace_id,
      date('now','-1 day') AS day,
      COUNT(*) AS ai_calls,
      SUM(COALESCE(t.tokens_in,0)) AS tokens_in,
      SUM(COALESCE(t.tokens_out,0)) AS tokens_out,
      ${costExpr} AS cost_usd,
      (SELECT COUNT(*) FROM agentsam_tool_call_log WHERE ${toolDay}) AS tool_calls,
      (SELECT ${succExpr ? `COUNT(*) FROM agentsam_tool_call_log WHERE ${toolDay} AND ${succExpr}` : '0'}) AS tool_successes,
      (SELECT ${succExpr ? `COUNT(*) FROM agentsam_tool_call_log WHERE ${toolDay} AND NOT (${succExpr})` : '0'}) AS tool_failures,
      (SELECT COUNT(*) FROM agentsam_tool_call_log WHERE ${toolDay} AND COALESCE(tool_category,'') = 'mcp') AS mcp_calls,
      (SELECT COUNT(*) FROM deployments WHERE ${depDay}) AS deployments,
      (SELECT COUNT(*) FROM agentsam_webhook_events WHERE ${whDay}) AS webhook_events,
      (SELECT COUNT(*) FROM worker_analytics_errors WHERE ${errDay}) AS error_count,
      '{}' AS provider_breakdown_json,
      '[]' AS top_tools_json,
      'nightly_cron' AS rollup_source,
      unixepoch() AS rolled_up_at
    FROM agentsam_usage_events t
    WHERE date(datetime(t.created_at, 'unixepoch')) = date('now','-1 day')
    GROUP BY ${tenantGroup}, ${wsExpr}
    ON CONFLICT(tenant_id, workspace_id, day) DO UPDATE SET
      ai_calls = excluded.ai_calls,
      tokens_in = excluded.tokens_in,
      tokens_out = excluded.tokens_out,
      cost_usd = excluded.cost_usd,
      tool_calls = excluded.tool_calls,
      tool_successes = excluded.tool_successes,
      tool_failures = excluded.tool_failures,
      mcp_calls = excluded.mcp_calls,
      deployments = excluded.deployments,
      webhook_events = excluded.webhook_events,
      error_count = excluded.error_count,
      provider_breakdown_json = excluded.provider_breakdown_json,
      top_tools_json = excluded.top_tools_json,
      rollup_source = excluded.rollup_source,
      rolled_up_at = excluded.rolled_up_at
  `;

  try {
    const r = await env.DB.prepare(sql).run();
    return { ok: true, changes: r.meta?.changes ?? r.changes ?? 0 };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

export async function rollupMcpToolCallStats(env) {
  // Disabled in V1: this path expects a `date` column contract that does not exist in the live
  // agentsam_tool_stats_compacted table and creates a second writer.
  // Canonical writer is `src/core/tool-stats-rollup.js`.
  return { ok: false, skipped: true, reason: 'disabled_v1_use_canonical_tool_stats_rollup' };
}

export async function rollupWorkspaceUsageMetrics(env) {
  if (!env?.DB) return { ok: false, skipped: true };
  const wCols = await pragmaTableInfo(env.DB, 'workspace_usage_metrics');
  if (!wCols.has('workspace_id') || !wCols.has('metric_date')) {
    return { ok: false, skipped: true, reason: 'workspace_usage_metrics_schema' };
  }
  if (!(await tableExists(env.DB, 'agentsam_usage_rollups_daily'))) {
    return { ok: false, skipped: true, reason: 'no_rollups_source' };
  }

  const wfCols = await pragmaTableInfo(env.DB, 'workflow_runs');
  const wfSql =
    wfCols.has('created_at') && wfCols.has('workspace_id')
      ? `(SELECT COUNT(*) FROM workflow_runs wf WHERE date(wf.created_at) = r.day AND wf.workspace_id = r.workspace_id)`
      : wfCols.has('created_at')
        ? `(SELECT COUNT(*) FROM workflow_runs wf WHERE date(wf.created_at) = r.day)`
        : '0';

  const rdCols = await pragmaTableInfo(env.DB, 'routing_decisions');
  const rdSql = rdCols.has('created_at')
    ? `(SELECT COUNT(*) FROM routing_decisions WHERE date(datetime(created_at,'unixepoch')) = r.day)`
    : '0';

  const parts = [
    'INSERT INTO workspace_usage_metrics (',
    [
      'workspace_id',
      'metric_date',
      wCols.has('ai_calls') && 'ai_calls',
      wCols.has('tokens_used') && 'tokens_used',
      wCols.has('cost_estimate_cents') && 'cost_estimate_cents',
      wCols.has('tool_calls') && 'tool_calls',
      wCols.has('workflow_runs') && 'workflow_runs',
      wCols.has('deployments_count') && 'deployments_count',
      wCols.has('mcp_calls') && 'mcp_calls',
      wCols.has('routing_decisions_count') && 'routing_decisions_count',
      wCols.has('top_models_json') && 'top_models_json',
      wCols.has('top_tools_json') && 'top_tools_json',
      wCols.has('rollup_source') && 'rollup_source',
      wCols.has('updated_at') && 'updated_at',
    ]
      .filter(Boolean)
      .join(', '),
    ') SELECT ',
    [
      'r.workspace_id',
      'r.day',
      wCols.has('ai_calls') && 'r.ai_calls',
      wCols.has('tokens_used') && '(r.tokens_in + r.tokens_out)',
      wCols.has('cost_estimate_cents') && 'CAST(r.cost_usd * 100 AS REAL)',
      wCols.has('tool_calls') && 'r.tool_calls',
      wCols.has('workflow_runs') && wfSql,
      wCols.has('deployments_count') && 'r.deployments',
      wCols.has('mcp_calls') && 'r.mcp_calls',
      wCols.has('routing_decisions_count') && rdSql,
      wCols.has('top_models_json') && `'[]'`,
      wCols.has('top_tools_json') && 'r.top_tools_json',
      wCols.has('rollup_source') && `'nightly_cron'`,
      wCols.has('updated_at') && 'unixepoch()',
    ]
      .filter(Boolean)
      .join(', '),
    ` FROM agentsam_usage_rollups_daily r WHERE r.day = date('now','-1 day')`,
    ` ON CONFLICT(workspace_id, metric_date) DO UPDATE SET `,
    [
      wCols.has('ai_calls') && 'ai_calls = excluded.ai_calls',
      wCols.has('tokens_used') && 'tokens_used = excluded.tokens_used',
      wCols.has('cost_estimate_cents') && 'cost_estimate_cents = excluded.cost_estimate_cents',
      wCols.has('tool_calls') && 'tool_calls = excluded.tool_calls',
      wCols.has('workflow_runs') && 'workflow_runs = excluded.workflow_runs',
      wCols.has('deployments_count') && 'deployments_count = excluded.deployments_count',
      wCols.has('mcp_calls') && 'mcp_calls = excluded.mcp_calls',
      wCols.has('routing_decisions_count') && 'routing_decisions_count = excluded.routing_decisions_count',
      wCols.has('top_models_json') && 'top_models_json = excluded.top_models_json',
      wCols.has('top_tools_json') && 'top_tools_json = excluded.top_tools_json',
      wCols.has('rollup_source') && 'rollup_source = excluded.rollup_source',
      wCols.has('updated_at') && 'updated_at = excluded.updated_at',
    ]
      .filter(Boolean)
      .join(', '),
  ].join('');

  try {
    const r = await env.DB.prepare(parts).run();
    return { ok: true, changes: r.meta?.changes ?? r.changes ?? 0 };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

export async function rollupModelPerformanceScores(env) {
  if (!env?.DB) return { ok: false, skipped: true };
  const out = await pragmaTableInfo(env.DB, 'agentsam_model_drift_signals');
  const tel = await pragmaTableInfo(env.DB, 'agentsam_usage_events');
  if (!out.size || !tel.has('created_at') || (!tel.has('model') && !tel.has('model_key'))) {
    return { ok: false, skipped: true, reason: 'schema' };
  }

  const modelDest = out.has('model') ? 'model' : out.has('model_key') ? 'model_key' : null;
  if (!modelDest) return { ok: false, skipped: true, reason: 'no_model_column' };

  const insertCols = [];
  const selectExprs = [];
  if (out.has('tenant_id') && tel.has('tenant_id')) {
    insertCols.push('tenant_id');
    selectExprs.push(`COALESCE(NULLIF(trim(tenant_id), ''), '')`);
  }
  insertCols.push(modelDest);
  const modelExpr = tel.has('model_key') && tel.has('model')
    ? `COALESCE(model_key, model, 'unknown')`
    : tel.has('model_key')
      ? `COALESCE(model_key, 'unknown')`
      : `COALESCE(model, 'unknown')`;
  selectExprs.push(modelExpr);
  if (tel.has('provider') && out.has('provider')) {
    insertCols.push('provider');
    selectExprs.push(`COALESCE(provider,'unknown')`);
  }
  if ((tel.has('event_type') || tel.has('metric_type')) && out.has('task_type')) {
    insertCols.push('task_type');
    selectExprs.push(
      tel.has('event_type') ? `COALESCE(event_type,'general')` : `COALESCE(metric_type,'general')`,
    );
  }
  if (out.has('period_start')) {
    insertCols.push('period_start');
    selectExprs.push(`unixepoch(date('now','-7 days'))`);
  }
  if (out.has('period_end')) {
    insertCols.push('period_end');
    selectExprs.push(`unixepoch('now')`);
  }
  if (out.has('calls')) {
    insertCols.push('calls');
    selectExprs.push('COUNT(*)');
  } else if (out.has('call_count')) {
    insertCols.push('call_count');
    selectExprs.push('COUNT(*)');
  }
  if (out.has('error_count') && tel.has('status')) {
    insertCols.push('error_count');
    selectExprs.push(`SUM(CASE WHEN LOWER(COALESCE(status,'')) IN ('error','blocked','timeout') THEN 1 ELSE 0 END)`);
  }
  if (out.has('error_rate') && tel.has('status')) {
    insertCols.push('error_rate');
    selectExprs.push(
      `CAST(SUM(CASE WHEN LOWER(COALESCE(status,'')) IN ('error','blocked','timeout') THEN 1 ELSE 0 END) AS REAL) / NULLIF(COUNT(*), 0)`,
    );
  }
  if (out.has('avg_cost_usd')) {
    insertCols.push('avg_cost_usd');
    selectExprs.push('AVG(COALESCE(cost_usd,0))');
  }
  if (out.has('total_cost_usd')) {
    insertCols.push('total_cost_usd');
    selectExprs.push('SUM(COALESCE(cost_usd,0))');
  }
  if (out.has('avg_input_tokens')) {
    insertCols.push('avg_input_tokens');
    selectExprs.push(
      tel.has('tokens_in') ? 'AVG(COALESCE(tokens_in,0))' : 'AVG(COALESCE(input_tokens,0))',
    );
  }
  if (out.has('avg_output_tokens')) {
    insertCols.push('avg_output_tokens');
    selectExprs.push(
      tel.has('tokens_out') ? 'AVG(COALESCE(tokens_out,0))' : 'AVG(COALESCE(output_tokens,0))',
    );
  }
  if (out.has('avg_latency_ms')) {
    insertCols.push('avg_latency_ms');
    selectExprs.push(
      tel.has('duration_ms') ? 'AVG(COALESCE(duration_ms,0))' : 'NULL',
    );
  }
  if (out.has('data_quality')) {
    insertCols.push('data_quality');
    selectExprs.push(`CASE WHEN COUNT(*) >= 10 THEN 'sufficient' ELSE 'insufficient' END`);
  }
  if (out.has('computed_at')) {
    insertCols.push('computed_at');
    selectExprs.push('unixepoch()');
  }

  const groupParts = [];
  if (tel.has('tenant_id') && out.has('tenant_id')) {
    groupParts.push(`COALESCE(NULLIF(trim(tenant_id), ''), '')`);
  }
  groupParts.push(modelExpr);
  if (tel.has('provider')) groupParts.push('provider');
  if (tel.has('event_type')) groupParts.push('event_type');
  else if (tel.has('metric_type')) groupParts.push('metric_type');

  const sql = `
    INSERT INTO agentsam_model_drift_signals (${insertCols.join(', ')})
    SELECT ${selectExprs.join(', ')}
    FROM agentsam_usage_events
    WHERE created_at >= unixepoch(date('now','-7 days'))
      AND length(trim(COALESCE(model_key, model, ''))) > 0
      ${tel.has('tenant_id') ? `AND length(trim(COALESCE(tenant_id,''))) > 0` : ''}
    GROUP BY ${groupParts.join(', ')}
  `;

  try {
    const r = await env.DB.prepare(sql).run();
    return { ok: true, changes: r.meta?.changes ?? r.changes ?? 0 };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

export async function updateModelRoutingRulesFromScores(env) {
  if (!env?.DB) return { ok: false, skipped: true };
  const rules = await pragmaTableInfo(env.DB, 'agentsam_routing_arms');
  const scores = await pragmaTableInfo(env.DB, 'agentsam_model_drift_signals');
  if (!rules.has('task_type') || !scores.has('task_type')) {
    return { ok: false, skipped: true };
  }
  const modelCol = scores.has('model') ? 'model' : scores.has('model_key') ? 'model_key' : null;
  const primaryCol = rules.has('primary_model') ? 'primary_model' : rules.has('model_key') ? 'model_key' : null;
  if (!modelCol || !primaryCol) return { ok: false, skipped: true };

  try {
    const orderCol = scores.has('calls')
      ? 'calls'
      : scores.has('call_count')
        ? 'call_count'
        : scores.has('total_cost_usd')
          ? 'total_cost_usd'
          : null;
    if (!orderCol) return { ok: false, skipped: true, reason: 'no_score_order_column' };

    const sql = `
      UPDATE agentsam_routing_arms SET
        is_active = CASE
          WHEN ${primaryCol} IN (
            SELECT ${modelCol} FROM agentsam_model_drift_signals
            WHERE ${scores.has('data_quality') ? "data_quality = 'sufficient' AND" : ''}
              ${scores.has('error_rate') ? 'error_rate < 0.1 AND' : ''}
              task_type = agentsam_routing_arms.task_type
            ORDER BY ${orderCol} DESC
            LIMIT 1
          ) THEN 1 ELSE is_active END
      WHERE task_type IN (SELECT DISTINCT task_type FROM agentsam_model_drift_signals WHERE task_type IS NOT NULL)
    `;
    const r = await env.DB.prepare(sql).run();
    return { ok: true, changes: r.meta?.changes ?? r.changes ?? 0 };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

export async function rollupAgentsamHealthDaily(env) {
  if (!env?.DB) return { ok: false, skipped: true };
  const out = await pragmaTableInfo(env.DB, 'agentsam_health_daily');
  if (!out.size) return { ok: false, skipped: true };

  const iam = await pragmaTableInfo(env.DB, 'iam_system_health');
  const iamInsertCols = [
    out.has('tenant_id') && 'tenant_id',
    out.has('day') && 'day',
    out.has('health_status') && 'health_status',
    out.has('snapshot_count') && 'snapshot_count',
    out.has('green_count') && 'green_count',
    out.has('yellow_count') && 'yellow_count',
    out.has('red_count') && 'red_count',
    out.has('worst_status') && 'worst_status',
    out.has('rolled_up_at') && 'rolled_up_at',
  ].filter(Boolean);

  if (
    iam.has('last_checked_at') &&
    iam.has('status') &&
    iamInsertCols.length >= 4 &&
    out.has('tenant_id') &&
    out.has('day')
  ) {
    try {
      const r = await env.DB.prepare(`
        INSERT INTO agentsam_health_daily (
          ${iamInsertCols.join(', ')}
        )
        SELECT
          ${[
            out.has('tenant_id') && `'${DEFAULT_TENANT}'`,
            out.has('day') && `date('now','-1 day')`,
            out.has('health_status') &&
              `CASE
            WHEN SUM(CASE WHEN status='red' THEN 1 ELSE 0 END) > 0 THEN 'red'
            WHEN SUM(CASE WHEN status='yellow' THEN 1 ELSE 0 END) > 2 THEN 'yellow'
            ELSE 'green' END`,
            out.has('snapshot_count') && 'COUNT(*)',
            out.has('green_count') && `SUM(CASE WHEN status='green' THEN 1 ELSE 0 END)`,
            out.has('yellow_count') && `SUM(CASE WHEN status='yellow' THEN 1 ELSE 0 END)`,
            out.has('red_count') && `SUM(CASE WHEN status='red' THEN 1 ELSE 0 END)`,
            out.has('worst_status') && 'MAX(status)',
            out.has('rolled_up_at') && `datetime('now')`,
          ]
            .filter(Boolean)
            .join(', ')}
        FROM iam_system_health
        WHERE date(last_checked_at) = date('now','-1 day')
        ON CONFLICT(tenant_id, day) DO UPDATE SET
          ${[
            out.has('health_status') && 'health_status = excluded.health_status',
            out.has('snapshot_count') && 'snapshot_count = excluded.snapshot_count',
            out.has('green_count') && 'green_count = excluded.green_count',
            out.has('yellow_count') && 'yellow_count = excluded.yellow_count',
            out.has('red_count') && 'red_count = excluded.red_count',
            out.has('worst_status') && 'worst_status = excluded.worst_status',
            out.has('rolled_up_at') && 'rolled_up_at = excluded.rolled_up_at',
          ]
            .filter(Boolean)
            .join(', ')}
      `).run();
      return { ok: true, changes: r.meta?.changes ?? r.changes ?? 0 };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  }

  const snap = await pragmaTableInfo(env.DB, 'system_health_snapshots');
  const statusField = snap.has('health_status')
    ? 'health_status'
    : snap.has('status')
      ? 'status'
      : null;
  if (!statusField || !snap.has('snapshot_at')) {
    return { ok: false, skipped: true, reason: 'no_health_source' };
  }

  const snapFallbackCols = [
    'tenant_id',
    'day',
    'snapshot_count',
    'green_count',
    'yellow_count',
    'red_count',
    'avg_tools_degraded',
    'avg_tel_cost_24h',
    'health_status',
  ];
  if (!snapFallbackCols.every((c) => out.has(c))) {
    return { ok: false, skipped: true, reason: 'agentsam_health_daily_missing_snapshot_fallback_columns' };
  }

  const snapDayExpr = snap.has('snapshot_at')
    ? `date(datetime(snapshot_at,'unixepoch')) = date('now','-1 day')`
    : '1=0';

  try {
    const r = await env.DB.prepare(`
      INSERT INTO agentsam_health_daily (
        tenant_id, day, snapshot_count, green_count, yellow_count, red_count,
        avg_tools_degraded, avg_tel_cost_24h, health_status
      )
      SELECT
        '${DEFAULT_TENANT}',
        date('now','-1 day'),
        COUNT(*),
        SUM(CASE WHEN ${statusField}='green' THEN 1 ELSE 0 END),
        SUM(CASE WHEN ${statusField}='yellow' THEN 1 ELSE 0 END),
        SUM(CASE WHEN ${statusField}='red' THEN 1 ELSE 0 END),
        0,
        0,
        CASE
          WHEN SUM(CASE WHEN ${statusField}='red' THEN 1 ELSE 0 END) > 0 THEN 'red'
          WHEN SUM(CASE WHEN ${statusField}='yellow' THEN 1 ELSE 0 END) > 0 THEN 'yellow'
          ELSE 'green' END
      FROM system_health_snapshots
      WHERE ${snapDayExpr}
      ON CONFLICT(tenant_id, day) DO UPDATE SET
        snapshot_count = excluded.snapshot_count,
        green_count = excluded.green_count,
        yellow_count = excluded.yellow_count,
        red_count = excluded.red_count,
        health_status = excluded.health_status
    `).run();
    return { ok: true, changes: r.meta?.changes ?? r.changes ?? 0 };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/**
 * Daily dashboard aggregates from agentsam_usage_rollups_daily — binds workspace_id per tenant/workspace row.
 */
export async function rollupAgentsamAnalyticsDaily(env) {
  if (!env?.DB) return { ok: false, skipped: true };
  const ana = await pragmaTableInfo(env.DB, 'agentsam_analytics');
  if (!ana.size || !ana.has('workspace_id')) return { ok: true, skipped: true, reason: 'analytics_workspace' };
  const src = await pragmaTableInfo(env.DB, 'agentsam_usage_rollups_daily');
  if (!src.has('tenant_id') || !src.has('workspace_id') || !src.has('day')) {
    return { ok: true, skipped: true, reason: 'rollups_source' };
  }

  const parts = [
    `SELECT
      'aan_' || lower(hex(randomblob(8))) AS id,
      r.tenant_id AS tenant_id,
      r.workspace_id AS workspace_id,
      'daily' AS period,
      r.day AS period_date`,
  ];
  if (ana.has('total_cost_usd')) parts.push(', COALESCE(r.cost_usd, 0) AS total_cost_usd');
  if (ana.has('total_input_tokens')) parts.push(', COALESCE(r.tokens_in, 0) AS total_input_tokens');
  if (ana.has('total_output_tokens')) parts.push(', COALESCE(r.tokens_out, 0) AS total_output_tokens');
  if (ana.has('computed_at')) parts.push(', unixepoch() AS computed_at');

  const inner = `${parts.join('')}
    FROM agentsam_usage_rollups_daily r
    WHERE r.day = date('now','-1 day')
      AND r.workspace_id IS NOT NULL AND trim(r.workspace_id) != ''
      AND r.tenant_id IS NOT NULL AND trim(r.tenant_id) != ''`;

  const insertCols = ['id', 'tenant_id', 'workspace_id', 'period', 'period_date'];
  const selCols = ['id', 'tenant_id', 'workspace_id', 'period', 'period_date'];
  if (ana.has('total_cost_usd')) {
    insertCols.push('total_cost_usd');
    selCols.push('total_cost_usd');
  }
  if (ana.has('total_input_tokens')) {
    insertCols.push('total_input_tokens');
    selCols.push('total_input_tokens');
  }
  if (ana.has('total_output_tokens')) {
    insertCols.push('total_output_tokens');
    selCols.push('total_output_tokens');
  }
  if (ana.has('computed_at')) {
    insertCols.push('computed_at');
    selCols.push('computed_at');
  }

  const conflictTarget =
    ana.has('tenant_id') && ana.has('period') && ana.has('period_date')
      ? '(tenant_id, period, period_date)'
      : null;

  const updates = [
    ana.has('total_cost_usd') && 'total_cost_usd = excluded.total_cost_usd',
    ana.has('total_input_tokens') && 'total_input_tokens = excluded.total_input_tokens',
    ana.has('total_output_tokens') && 'total_output_tokens = excluded.total_output_tokens',
    ana.has('computed_at') && 'computed_at = excluded.computed_at',
    ana.has('workspace_id') && 'workspace_id = excluded.workspace_id',
  ].filter(Boolean);

  const sqlWithConflict =
    conflictTarget && updates.length
      ? `
    INSERT INTO agentsam_analytics (${insertCols.join(', ')})
    SELECT ${selCols.join(', ')} FROM (${inner}) AS x
    ON CONFLICT${conflictTarget} DO UPDATE SET ${updates.join(', ')}
  `
      : null;

  try {
    if (sqlWithConflict) {
      const r = await env.DB.prepare(sqlWithConflict).run();
      return { ok: true, changes: r.meta?.changes ?? r.changes ?? 0 };
    }
    const r = await env.DB.prepare(`
      INSERT INTO agentsam_analytics (${insertCols.join(', ')})
      SELECT ${selCols.join(', ')} FROM (${inner}) AS x
    `).run();
    return { ok: true, changes: r.meta?.changes ?? r.changes ?? 0 };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

export async function rollupDeploymentsWeekly(env) {
  if (!env?.DB) return { ok: false, skipped: true };
  const utcDow = new Date().getUTCDay();
  if (utcDow !== 0) {
    return { ok: true, skipped: true, reason: 'weekly_runs_sunday_utc_only' };
  }

  const out = await pragmaTableInfo(env.DB, 'deployments_weekly_rollup');
  const dep = await pragmaTableInfo(env.DB, 'deployments');
  if (!out.size || !dep.has('created_at')) return { ok: false, skipped: true };

  const statusOkExpr = `(LOWER(COALESCE(status,'')) IN ('success','ok','completed'))`;

  const insertCols = [];
  const selectExprs = [];
  if (out.has('tenant_id')) {
    insertCols.push('tenant_id');
    selectExprs.push(`'${DEFAULT_TENANT}'`);
  }
  if (out.has('week_start')) {
    insertCols.push('week_start');
    selectExprs.push(`date('now','weekday 0','-7 days')`);
  }
  if (out.has('week_end')) {
    insertCols.push('week_end');
    selectExprs.push(`date('now','weekday 0','-1 day')`);
  }
  if (out.has('total_deploys')) {
    insertCols.push('total_deploys');
    selectExprs.push('COUNT(*)');
  }
  if (out.has('success_count')) {
    insertCols.push('success_count');
    selectExprs.push(
      dep.has('status')
        ? `SUM(CASE WHEN ${statusOkExpr} THEN 1 ELSE 0 END)`
        : '0',
    );
  }
  if (out.has('failed_count')) {
    insertCols.push('failed_count');
    selectExprs.push(
      dep.has('status')
        ? `SUM(CASE WHEN NOT (${statusOkExpr}) THEN 1 ELSE 0 END)`
        : '0',
    );
  }
  if (out.has('total_duration_ms')) {
    insertCols.push('total_duration_ms');
    selectExprs.push('0');
  }
  if (out.has('avg_duration_ms')) {
    insertCols.push('avg_duration_ms');
    selectExprs.push('0');
  }
  if (out.has('notes')) {
    insertCols.push('notes');
    selectExprs.push(`'retention_weekly'`);
  }
  if (out.has('rolled_up_at')) {
    insertCols.push('rolled_up_at');
    selectExprs.push('unixepoch()');
  }

  if (insertCols.length === 0) {
    return { ok: false, skipped: true, reason: 'deployments_weekly_empty_columns' };
  }

  const sql = `
    INSERT OR IGNORE INTO deployments_weekly_rollup (${insertCols.join(', ')})
    SELECT ${selectExprs.join(', ')}
    FROM deployments
    WHERE date(datetime(created_at,'unixepoch')) >= date('now','weekday 0','-7 days')
      AND date(datetime(created_at,'unixepoch')) < date('now','weekday 0')
  `;

  try {
    const r = await env.DB.prepare(sql).run();
    return { ok: true, changes: r.meta?.changes ?? r.changes ?? 0 };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

export async function purgeHotLogs(env) {
  if (!env?.DB) return { purges: {}, ok: false };
  const purges = {};
  const specs = [
    { table: 'agentsam_usage_events', days: 7, prefs: ['created_at'] },
    { table: 'agentsam_mcp_tool_execution', days: 7, prefs: ['created_at'] },
    { table: 'agentsam_webhook_events', days: 7, prefs: ['received_at', 'processed_at'] },
    { table: 'spend_ledger', days: 30, prefs: ['occurred_at', 'created_at'] },
    { table: 'worker_analytics_events', days: 7, prefs: ['timestamp', 'created_at'] },
    { table: 'worker_analytics_errors', days: 30, prefs: ['created_at'] },
    { table: 'routing_decisions', days: 30, prefs: ['created_at'] },
    { table: 'rag_query_log', days: 60, prefs: ['created_at'] },
    { table: 'rag_ingest_log', days: 60, prefs: ['created_at'] },
    { table: 'email_logs', days: 90, prefs: ['created_at'] },
  ];

  for (const spec of specs) {
    const cols = await pragmaTableInfo(env.DB, spec.table);
    if (!cols.size) {
      purges[spec.table] = { skipped: true };
      continue;
    }
    const dc = pickDateColumn(cols, spec.prefs);
    if (!dc) {
      purges[spec.table] = { skipped: true, reason: 'no_date_column' };
      continue;
    }

    let sql;
    if (dc === 'date' && cols.has('date')) {
      sql = `DELETE FROM ${spec.table} WHERE date(${dc}) < date('now', '-${spec.days} days')`;
    } else if (['created_at', 'timestamp', 'occurred_at'].includes(dc)) {
      sql = `DELETE FROM ${spec.table} WHERE ${dc} < unixepoch('now', '-${spec.days} days')`;
    } else {
      sql = `DELETE FROM ${spec.table} WHERE ${dc} < datetime('now', '-${spec.days} days')`;
    }

    try {
      const r = await env.DB.prepare(sql).run();
      purges[spec.table] = { deleted: r.meta?.changes ?? r.changes ?? 0 };
    } catch (e) {
      purges[spec.table] = { error: String(e?.message || e) };
    }
  }
  return { purges, ok: true };
}

export async function offloadRetentionToSupabase(env) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !env?.DB) return { ok: false, skipped: true };

  try {
    const dayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    const usage = await env.DB.prepare(
      `SELECT * FROM agentsam_usage_rollups_daily WHERE day = ? LIMIT 100`,
    )
      .bind(dayStr)
      .all()
      .catch(() => ({ results: [] }));

    const perf = await env.DB.prepare(
      `SELECT * FROM agentsam_model_drift_signals LIMIT 100`,
    )
      .all()
      .catch(() => ({ results: [] }));

    const headers = {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    };

    if (usage.results?.length) {
      await fetch(`${String(url).replace(/\/$/, '')}/rest/v1/cost_forecasts`, {
        method: 'POST',
        headers,
        body: JSON.stringify(
          usage.results.map((row) => ({
            ...row,
            metric_date: row.day,
            offload_source: 'retention',
          })),
        ),
      }).catch(() => {});
    }

    if (perf.results?.length) {
      await fetch(`${String(url).replace(/\/$/, '')}/rest/v1/agent_decisions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(
          perf.results.map((row) => ({
            ...row,
            offload_source: 'agentsam_model_drift_signals',
          })),
        ),
      }).catch(() => {});
    }

    return { ok: true };
  } catch {
    return { ok: false, skipped: true };
  }
}

export async function runMasterDailyRetention(env) {
  const started = Date.now();
  const rollups = {
    agentsam_usage_rollups_daily: await rollupAgentsamUsageDaily(env),
    agentsam_analytics: await rollupAgentsamAnalyticsDaily(env),
    agentsam_tool_stats_compacted: await rollupMcpToolCallStats(env),
    workspace_usage_metrics: await rollupWorkspaceUsageMetrics(env),
    agentsam_model_drift_signals: await rollupModelPerformanceScores(env),
    agentsam_routing_arms: await updateModelRoutingRulesFromScores(env),
    thompson_arm_update: await updateArmsFromMetrics(env),
    thompson_decay: await decayRoutingArms(env),
    agentsam_health_daily: await rollupAgentsamHealthDaily(env),
    deployments_weekly_rollup: await rollupDeploymentsWeekly(env),
  };

  try {
    await offloadRetentionToSupabase(env);
  } catch {
    /* never block purge */
  }

  let purges = {};
  try {
    purges = (await purgeHotLogs(env)).purges || {};
  } catch (e) {
    purges = { error: String(e?.message || e) };
  }

  return {
    rollups,
    purges,
    duration_ms: Date.now() - started,
  };
}
