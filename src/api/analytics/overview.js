import { parseRange, analyticsResponse } from './sources/normalize.js';
import { d1CountLatest } from './sources/d1.js';
import { supabaseCountLatest } from './sources/supabase.js';

function safePct(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  return Math.max(0, Math.min(100, Math.round(v * 10) / 10));
}

async function d1First(db, sql, binds = []) {
  if (!db) return null;
  try {
    return await db.prepare(sql).bind(...binds).first();
  } catch {
    return null;
  }
}

export async function handleAnalyticsOverview(_request, url, env, { tenantId }) {
  const range = parseRange(url);
  const warnings = [];
  const db = env?.DB || null;
  const hasHyperdrive = !!env?.HYPERDRIVE && typeof env.HYPERDRIVE.query === 'function';

  if (!db) {
    return analyticsResponse({
      ok: true,
      backend: 'mixed',
      range,
      summary: {},
      rows: [],
      warnings: [
        {
          code: 'D1_BINDING_MISSING',
          message: 'D1 binding env.DB is not configured; overview is not available.',
          backend: 'd1',
          severity: 'critical',
        },
      ],
    });
  }

  const tid = tenantId && String(tenantId).trim() ? String(tenantId).trim() : null;
  if (!tid) {
    warnings.push({
      code: 'TENANT_ID_MISSING',
      message: 'No tenant_id resolved; overview may be unscoped.',
      backend: 'mixed',
      severity: 'warn',
    });
  }

  // D1 core KPIs
  const wf = await d1First(
    db,
    `SELECT COUNT(*) AS workflow_run_count
     FROM agentsam_workflow_runs
     WHERE (? IS NULL OR tenant_id = ?)
       AND started_at >= unixepoch('now', ${
         range === '24h' ? "'-24 hours'" : range === '30d' ? "'-30 days'" : range === 'all' ? "'-3650 days'" : "'-7 days'"
       });`,
    [tid, tid],
  );

  const usage = await d1First(
    db,
    `SELECT
      COALESCE(SUM(total_cost_usd), 0) AS total_cost_usd,
      COALESCE(SUM(total_tokens), 0) AS total_tokens
     FROM agentsam_usage_events
     WHERE (? IS NULL OR tenant_id = ?)
       AND created_at >= unixepoch('now', ${
         range === '24h' ? "'-24 hours'" : range === '30d' ? "'-30 days'" : range === 'all' ? "'-3650 days'" : "'-7 days'"
       });`,
    [tid, tid],
  );

  const tool = await d1First(
    db,
    `SELECT
      COUNT(*) AS call_count,
      SUM(CASE WHEN status IN ('success','completed') THEN 1 ELSE 0 END) AS success_count
     FROM agentsam_mcp_tool_execution
     WHERE (? IS NULL OR tenant_id = ?)
       AND created_at >= unixepoch('now', ${
         range === '24h' ? "'-24 hours'" : range === '30d' ? "'-30 days'" : range === 'all' ? "'-3650 days'" : "'-7 days'"
       });`,
    [tid, tid],
  );

  const err = await d1First(
    db,
    `SELECT COUNT(*) AS open_error_count
     FROM agentsam_error_log
     WHERE (? IS NULL OR tenant_id = ?)
       AND COALESCE(status,'') NOT IN ('resolved','closed')
       AND created_at >= unixepoch('now', ${
         range === '24h' ? "'-24 hours'" : range === '30d' ? "'-30 days'" : range === 'all' ? "'-3650 days'" : "'-7 days'"
       });`,
    [tid, tid],
  );

  const perf = await d1First(
    db,
    `SELECT ROUND(AVG(avg_duration_ms), 0) AS avg_latency_ms
     FROM agentsam_execution_performance_metrics
     WHERE (? IS NULL OR tenant_id = ?)
       AND metric_date >= date('now', ${range === '30d' ? "'-30 days'" : range === 'all' ? "'-3650 days'" : "'-7 days'"});`,
    [tid, tid],
  );

  // Supabase KPIs via Hyperdrive
  let ragDocs = { ok: false, count: 0 };
  let codeFiles = { ok: false, count: 0 };
  let evalRuns = { ok: false, count: 0 };
  let deployEvents = { ok: false, count: 0 };
  if (hasHyperdrive) {
    [ragDocs, codeFiles, evalRuns, deployEvents] = await Promise.all([
      supabaseCountLatest(env, 'documents', { tenantId: tid, range: range === 'all' ? null : range }),
      supabaseCountLatest(env, 'codebase_files', { tenantId: tid, range: null }),
      supabaseCountLatest(env, 'agentsam_eval_runs', { tenantId: tid, range }),
      supabaseCountLatest(env, 'build_deploy_events', { tenantId: tid, range }),
    ]);
  } else {
    warnings.push({
      code: 'HYPERDRIVE_BINDING_MISSING',
      message: 'Hyperdrive is not configured; Supabase-backed overview KPIs are unavailable.',
      backend: 'supabase',
      severity: 'warn',
    });
  }

  const toolCalls = Number(tool?.call_count ?? 0) || 0;
  const toolSuccess = toolCalls > 0 ? safePct((Number(tool?.success_count ?? 0) || 0) / toolCalls * 100) : null;

  return analyticsResponse({
    ok: true,
    backend: hasHyperdrive ? 'mixed' : 'd1',
    range,
    summary: {
      workflow_run_count: Number(wf?.workflow_run_count ?? 0) || 0,
      tool_success_rate: toolSuccess,
      open_error_count: Number(err?.open_error_count ?? 0) || 0,
      total_tokens: Number(usage?.total_tokens ?? 0) || 0,
      total_cost_usd: Math.round((Number(usage?.total_cost_usd ?? 0) || 0) * 1000000) / 1000000,
      avg_latency_ms: Number(perf?.avg_latency_ms ?? 0) || 0,
      rag_document_count: ragDocs?.count ?? 0,
      codebase_file_count: codeFiles?.count ?? 0,
      eval_run_count: evalRuns?.count ?? 0,
      deploy_event_count: deployEvents?.count ?? 0,
    },
    rows: [
      { key: 'workflowRuns', backend: 'd1', value: Number(wf?.workflow_run_count ?? 0) || 0, table: 'agentsam_workflow_runs' },
      { key: 'toolSuccess', backend: 'd1', value: toolSuccess, table: 'agentsam_mcp_tool_execution' },
      { key: 'openErrors', backend: 'd1', value: Number(err?.open_error_count ?? 0) || 0, table: 'agentsam_error_log' },
      { key: 'tokenUsage', backend: 'd1', value: Number(usage?.total_tokens ?? 0) || 0, table: 'agentsam_usage_events' },
      { key: 'aiCost', backend: 'd1', value: Math.round((Number(usage?.total_cost_usd ?? 0) || 0) * 1000000) / 1000000, table: 'agentsam_usage_events' },
      { key: 'avgLatency', backend: 'd1', value: Number(perf?.avg_latency_ms ?? 0) || 0, table: 'agentsam_execution_performance_metrics' },
      { key: 'ragDocuments', backend: 'supabase', value: ragDocs?.count ?? 0, table: 'documents', ok: !!ragDocs?.ok },
      { key: 'codebaseFiles', backend: 'supabase', value: codeFiles?.count ?? 0, table: 'codebase_files', ok: !!codeFiles?.ok },
      { key: 'evalRuns', backend: 'supabase', value: evalRuns?.count ?? 0, table: 'agentsam_eval_runs', ok: !!evalRuns?.ok },
      { key: 'deployEvents', backend: 'supabase', value: deployEvents?.count ?? 0, table: 'build_deploy_events', ok: !!deployEvents?.ok },
    ],
    warnings,
  });
}

