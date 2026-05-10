/**
 * Single payload for remastered Overview dashboard — maps panels to D1 agentsam tables
 * per platform audit (usage_events, workflow_runs, tool_stats_compacted, webhook_events, etc.).
 */
import { jsonResponse } from '../core/auth.js';

/** @param {import('@cloudflare/workers-types').D1Database} db */
async function first(db, sql, binds = []) {
  try {
    return await db.prepare(sql).bind(...binds).first();
  } catch {
    return null;
  }
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
async function all(db, sql, binds = []) {
  try {
    const { results } = await db.prepare(sql).bind(...binds).all();
    return results || [];
  } catch {
    return [];
  }
}

/** @param {string | null | undefined} errorType */
function mapErrorLogSeverity(errorType) {
  const t = String(errorType || '').toLowerCase();
  if (t.includes('degraded') || t.includes('eval')) return 'medium';
  if (t.includes('fatal') || t.includes('crash')) return 'high';
  return 'low';
}

/** @param {unknown} v */
function errorLogTsMs(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return v > 1e12 ? v : v * 1000;
  const s = String(v).trim();
  const n = Number(s);
  if (Number.isFinite(n) && /^\d+(\.\d+)?$/.test(s)) return n > 1e12 ? n : n * 1000;
  const d = Date.parse(s);
  return Number.isFinite(d) ? d : 0;
}

/**
 * @param {import('../core/auth.js').AuthUser | null} authUser
 * @param {{ DB?: import('@cloudflare/workers-types').D1Database }} env
 * @param {URL} url
 */
export async function handleOverviewDashboardBundle(authUser, env, url) {
  const db = env?.DB;
  if (!db) return jsonResponse({ ok: false, error: 'DB not configured' }, 503);

  const tid = String(authUser?.tenant_id || '').trim();
  const workspaceId = url.searchParams.get('workspace_id')?.trim() || '';

  const usageWs = workspaceId ? ' AND workspace_id = ?' : '';
  const wfWs = workspaceId ? ' AND workspace_id = ?' : '';

  /** @type {Record<string, unknown>} */
  const out = {
    ok: true,
    generated_at: Math.floor(Date.now() / 1000),
    tenant_id: tid || null,
    workspace_id: workspaceId || null,
    kpis: {},
    spend_by_day_provider: [],
    workflow_by_day_status: [],
    workflow_status_pie: [],
    workflow_stats: [],
    workflow_timeseries: [],
    top_services: [],
    tool_waterfall: { run: null, steps: [] },
    error_inbox: [],
    error_log: [],
    tokens_by_day: [],
    token_timeseries: [],
    model_leaderboard: [],
    eval_scatter: [],
    cost_latency: [],
    routing_arms: [],
    routing_timeseries: [],
    cron_latest: [],
    github_push_events: [],
    deployment_stats: { total: 0, succeeded: 0, failed: 0, cancelled: 0, avg_ms: 0 },
    deployment_timeseries: [],
    budget: {},
    active_plans: [],
    _meta: { warnings: [] },
  };

  if (!tid) {
    out._meta.warnings.push('no_tenant_id; returning empty agentsam slices');
    return jsonResponse(out);
  }

  const T = [tid];
  const TW = workspaceId ? [tid, workspaceId] : T;

  // ── KPI strip ───────────────────────────────────────────────────────────
  const monthlyBurn = await first(
    db,
    `SELECT COALESCE(SUM(cost_usd), 0) AS v
     FROM agentsam_usage_events
     WHERE tenant_id = ?
       AND created_at >= unixepoch(datetime('now','start of month'))${usageWs}`,
    TW,
  );
  const agentCalls7d = await first(
    db,
    `SELECT COUNT(*) AS c FROM agentsam_usage_events
     WHERE tenant_id = ? AND created_at >= unixepoch('now', '-7 days')${usageWs}`,
    TW,
  );
  const tokens7d = await first(
    db,
    `SELECT COALESCE(SUM(COALESCE(tokens_in,0)+COALESCE(tokens_out,0)), 0) AS t
     FROM agentsam_usage_events
     WHERE tenant_id = ? AND created_at >= unixepoch('now', '-7 days')${usageWs}`,
    TW,
  );
  const mcpToday = await first(
    db,
    `SELECT COUNT(*) AS c FROM agentsam_mcp_tool_execution
     WHERE tenant_id = ? AND date(created_at) = date('now')`,
    T,
  );
  const hoursWeek = await first(
    db,
    `SELECT COUNT(DISTINCT strftime('%Y-%m-%d %H', datetime(created_at, 'unixepoch'))) AS h
     FROM agentsam_usage_events
     WHERE tenant_id = ? AND created_at >= unixepoch(date('now','weekday 1'))${usageWs}`,
    TW,
  );
  const planWs = workspaceId ? ' AND workspace_id = ?' : '';
  const openTasks = await first(
    db,
    `SELECT COALESCE(SUM(
       CASE WHEN COALESCE(tasks_total,0) > COALESCE(tasks_done,0)
         THEN COALESCE(tasks_total,0) - COALESCE(tasks_done,0) ELSE 0 END), 0) AS o
     FROM agentsam_plans
     WHERE tenant_id = ? AND status IN ('active','draft')${planWs}`,
    workspaceId ? [tid, workspaceId] : T,
  );
  const healthRow = await first(
    db,
    `SELECT
       SUM(CASE WHEN status = 'healthy' THEN 1 ELSE 0 END) * 1.0 / NULLIF(COUNT(*), 0) AS ratio
     FROM (
       SELECT dh.status, dh.worker_name, dh.checked_at
       FROM agentsam_deployment_health dh
       INNER JOIN (
         SELECT worker_name, MAX(checked_at) AS mx
         FROM agentsam_deployment_health
         WHERE tenant_id = ?
         GROUP BY worker_name
       ) x ON x.worker_name = dh.worker_name AND x.mx = dh.checked_at
       WHERE dh.tenant_id = ?
     )`,
    [tid, tid],
  );
  const push7d = await first(
    db,
    `SELECT COUNT(*) AS c FROM agentsam_webhook_events
     WHERE tenant_id = ?
       AND LOWER(COALESCE(provider,'')) = 'github'
       AND (LOWER(COALESCE(event_type,'')) LIKE '%push%' OR LOWER(COALESCE(event_type,'')) = 'push')
       AND datetime(received_at) >= datetime('now', '-7 days')`,
    T,
  );
  const wfToday = await first(
    db,
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS success,
       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
     FROM agentsam_workflow_runs
     WHERE tenant_id = ? AND date(datetime(started_at, 'unixepoch')) = date('now')${wfWs}`,
    TW,
  );

  out.kpis = {
    monthly_burn_usd: Number(monthlyBurn?.v ?? 0) || 0,
    agent_calls_7d: Number(agentCalls7d?.c ?? 0) || 0,
    tokens_7d: Number(tokens7d?.t ?? 0) || 0,
    mcp_calls_today: Number(mcpToday?.c ?? 0) || 0,
    hours_week_distinct: Number(hoursWeek?.h ?? 0) || 0,
    open_tasks: Number(openTasks?.o ?? 0) || 0,
    worker_health_ratio: healthRow?.ratio != null ? Math.round(Number(healthRow.ratio) * 1000) / 10 : null,
    github_push_events_7d: Number(push7d?.c ?? 0) || 0,
    workflow_runs_today_total: Number(wfToday?.total ?? 0) || 0,
    workflow_runs_today_success: Number(wfToday?.success ?? 0) || 0,
    workflow_runs_today_failed: Number(wfToday?.failed ?? 0) || 0,
  };

  // ── AI spend by day + provider ──────────────────────────────────────────
  out.spend_by_day_provider = await all(
    db,
    `SELECT date(datetime(created_at, 'unixepoch')) AS day,
            COALESCE(provider,'unknown') AS provider,
            COALESCE(SUM(cost_usd), 0) AS cost_usd
     FROM agentsam_usage_events
     WHERE tenant_id = ? AND created_at >= unixepoch('now', '-7 days')${usageWs}
     GROUP BY 1, 2 ORDER BY 1 ASC`,
    TW,
  );

  // ── Workflow runs: stats (donut + by-key bars) + daily stack ─────────────
  out.workflow_stats = await all(
    db,
    `SELECT
       COALESCE(status, 'unknown') AS status,
       COALESCE(workflow_key, '(none)') AS workflow_key,
       COUNT(*) AS cnt,
       COALESCE(SUM(cost_usd), 0) AS cost_usd,
       COALESCE(SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)), 0) AS tokens
     FROM agentsam_workflow_runs
     WHERE tenant_id = ? AND started_at >= (unixepoch() - 7 * 86400)${wfWs}
     GROUP BY status, workflow_key
     ORDER BY cnt DESC`,
    TW,
  );

  const wfTsRows = await all(
    db,
    `SELECT
       date(datetime(started_at, 'unixepoch')) AS d,
       SUM(CASE WHEN status IN ('completed') THEN 1 ELSE 0 END) AS succeeded,
       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
       SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running
     FROM agentsam_workflow_runs
     WHERE tenant_id = ? AND started_at >= (unixepoch() - 7 * 86400)${wfWs}
     GROUP BY date(datetime(started_at, 'unixepoch'))
     ORDER BY d ASC`,
    TW,
  );
  out.workflow_timeseries = wfTsRows.map((r) => ({
    date: r.d,
    succeeded: Number(r.succeeded) || 0,
    failed: Number(r.failed) || 0,
    running: Number(r.running) || 0,
  }));

  /** @deprecated Prefer workflow_timeseries — kept empty for older clients */
  out.workflow_by_day_status = [];
  /** @deprecated Prefer workflow_stats — kept empty for older clients */
  out.workflow_status_pie = [];

  // ── Top services (pre-aggregated) ──────────────────────────────────────
  out.top_services = await all(
    db,
    `SELECT tool_name, total_calls, success_rate, avg_duration_ms, p95_duration_ms, total_cost_usd
     FROM agentsam_tool_stats_compacted
     WHERE tenant_id = ?${workspaceId ? ' AND workspace_id = ?' : ''}
     ORDER BY total_calls DESC
     LIMIT 20`,
    workspaceId ? [tid, workspaceId] : T,
  );

  // ── Tool waterfall: latest completed/failed workflow run + execution steps ─
  /** @type {{ run: Record<string, unknown>|null, steps: unknown[] }} */
  const toolWaterfall = { run: null, steps: [] };
  if (workspaceId) {
    const latestRun = await first(
      db,
      `SELECT id, started_at, completed_at, duration_ms, workflow_key, display_name
       FROM agentsam_workflow_runs
       WHERE tenant_id = ? AND workspace_id = ?
         AND status IN ('completed','failed')
       ORDER BY started_at DESC LIMIT 1`,
      [tid, workspaceId],
    );
    if (latestRun?.id) {
      const runId = String(latestRun.id);
      const execParent = await first(
        db,
        `SELECT id FROM agentsam_executions
         WHERE task_id = ? AND execution_type = 'workflow'
         ORDER BY created_at DESC LIMIT 1`,
        [runId],
      );
      const execId = execParent?.id != null ? String(execParent.id) : '';
      let steps = [];
      if (execId) {
        steps = await all(
          db,
          `SELECT node_key, node_type, status, started_at, completed_at,
                  latency_ms, tokens_in, tokens_out, cost_usd, error_json
           FROM agentsam_execution_steps
           WHERE execution_id = ?
           ORDER BY started_at ASC`,
          [execId],
        );
      }
      if (!steps.length) {
        const byWrun = await all(
          db,
          `SELECT node_key, node_type, status, started_at, completed_at,
                  latency_ms, tokens_in, tokens_out, cost_usd, error_json
           FROM agentsam_execution_steps
           WHERE workflow_run_id = ?
           ORDER BY started_at ASC`,
          [runId],
        );
        if (byWrun.length) steps = byWrun;
      }
      toolWaterfall.run = {
        workflow_key: latestRun.workflow_key ?? null,
        display_name: latestRun.display_name ?? null,
        duration_ms: latestRun.duration_ms != null ? Number(latestRun.duration_ms) : null,
      };
      toolWaterfall.steps = steps;
    }
  } else {
    out._meta.warnings.push('tool_waterfall_skipped_no_workspace_id');
  }
  out.tool_waterfall = toolWaterfall;

  // ── Error inbox (D1) ─────────────────────────────────────────────────────
  out.error_inbox = await all(
    db,
    `SELECT error_type, error_message, source, resolved, created_at
     FROM agentsam_error_log
     WHERE tenant_id = ? AND (resolved IS NULL OR resolved = 0)
     ORDER BY created_at DESC LIMIT 25`,
    T,
  );

  // ── Error log (workspace-scoped, severity mapping) ───────────────────────
  if (workspaceId) {
    const rawErr = await all(
      db,
      `SELECT error_type, error_message, source, source_id, resolved, created_at
       FROM agentsam_error_log
       WHERE workspace_id = ? AND resolved = 0
       ORDER BY created_at DESC LIMIT 10`,
      [workspaceId],
    );
    const wfErrRows = await all(
      db,
      `SELECT
         COALESCE(kill_reason, error_message, 'Unknown failure') AS error_message,
         started_at AS created_at
       FROM agentsam_workflow_runs
       WHERE tenant_id = ? AND workspace_id = ?
         AND status IN ('failed', 'timeout')
         AND started_at >= (unixepoch() - 7 * 86400)
       ORDER BY started_at DESC
       LIMIT 5`,
      [tid, workspaceId],
    );
    const fromTable = rawErr.map((r) => ({
      error_type: r.error_type,
      error_message: r.error_message,
      source: r.source,
      resolved: r.resolved,
      created_at: r.created_at,
      severity: mapErrorLogSeverity(r.error_type),
    }));
    const fromWf = wfErrRows.map((r) => ({
      error_type: 'workflow_failure',
      error_message: r.error_message,
      source: 'workflow_runs',
      resolved: 0,
      created_at: r.created_at,
      severity: /** @type {'medium'} */ ('medium'),
    }));
    const mergedErr = [...fromTable, ...fromWf].sort(
      (a, b) => errorLogTsMs(b.created_at) - errorLogTsMs(a.created_at),
    );
    out.error_log = mergedErr.slice(0, 15);
  } else {
    out._meta.warnings.push('error_log_skipped_no_workspace_id');
  }

  // ── Tokens / day ───────────────────────────────────────────────────────
  out.tokens_by_day = await all(
    db,
    `SELECT date(datetime(created_at, 'unixepoch')) AS day,
            COALESCE(SUM(tokens_in),0) AS tin,
            COALESCE(SUM(tokens_out),0) AS tout
     FROM agentsam_usage_events
     WHERE tenant_id = ? AND created_at >= unixepoch('now', '-7 days')${usageWs}
     GROUP BY 1 ORDER BY 1 ASC`,
    TW,
  );

  // ── Token timeseries (workspace, input/output/cached) ─────────────────────
  if (workspaceId) {
    const ttRows = await all(
      db,
      `SELECT
         date(datetime(created_at, 'unixepoch')) AS d,
         COALESCE(SUM(tokens_in),  0) AS input,
         COALESCE(SUM(tokens_out), 0) AS output,
         COALESCE(SUM(CASE WHEN event_type LIKE '%cache%' THEN tokens_in ELSE 0 END), 0) AS cached
       FROM agentsam_usage_events
       WHERE tenant_id = ? AND workspace_id = ?
         AND created_at >= (unixepoch() - 7*86400)
       GROUP BY date(datetime(created_at, 'unixepoch'))
       ORDER BY d ASC`,
      [tid, workspaceId],
    );
    const wfTokRows = await all(
      db,
      `SELECT
         date(datetime(started_at, 'unixepoch')) AS d,
         COALESCE(SUM(input_tokens), 0) AS input,
         COALESCE(SUM(output_tokens), 0) AS output
       FROM agentsam_workflow_runs
       WHERE tenant_id = ? AND workspace_id = ?
         AND started_at >= (unixepoch() - 7 * 86400)
       GROUP BY date(datetime(started_at, 'unixepoch'))
       ORDER BY d ASC`,
      [tid, workspaceId],
    );
    /** @type {Map<string, { date: string; input: number; output: number; cached: number }>} */
    const tokByDay = new Map();
    for (const r of ttRows) {
      const k = String(r.d || '');
      if (!k) continue;
      tokByDay.set(k, {
        date: k,
        input: Number(r.input) || 0,
        output: Number(r.output) || 0,
        cached: Number(r.cached) || 0,
      });
    }
    for (const r of wfTokRows) {
      const k = String(r.d || '');
      if (!k) continue;
      const ex = tokByDay.get(k) || { date: k, input: 0, output: 0, cached: 0 };
      ex.input += Number(r.input) || 0;
      ex.output += Number(r.output) || 0;
      tokByDay.set(k, ex);
    }
    out.token_timeseries = [...tokByDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  } else {
    out._meta.warnings.push('token_timeseries_skipped_no_workspace_id');
  }

  // ── Model leaderboard: agentsam_agent_run + routing_arms + eval_runs ─────
  out.model_leaderboard = [];
  if (workspaceId) {
    const lbRows = await all(
      db,
      `SELECT
         COALESCE(NULLIF(TRIM(ai_model_ref), ''), NULLIF(TRIM(model_id), ''), 'unknown') AS model_key,
         COUNT(*) AS runs,
         ROUND(AVG(CASE WHEN status = 'completed' THEN 1.0 ELSE 0 END) * 100, 1) AS success_pct,
         ROUND(
           AVG(
             CASE
               WHEN started_at IS NOT NULL AND completed_at IS NOT NULL
               THEN (julianday(completed_at) - julianday(started_at)) * 86400000
             END
           ),
           0
         ) AS avg_latency_ms,
         COALESCE(SUM(cost_usd), 0) AS total_cost_usd,
         COALESCE(SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)), 0) AS total_tokens,
         MAX(routing_arm_id) AS routing_arm_id
       FROM agentsam_agent_run
       WHERE workspace_id = ? AND tenant_id = ?
       GROUP BY COALESCE(NULLIF(TRIM(ai_model_ref), ''), NULLIF(TRIM(model_id), ''), 'unknown')
       ORDER BY runs DESC
       LIMIT 10`,
      [workspaceId, tid],
    );

    const wfLbRows = await all(
      db,
      `SELECT
         NULLIF(TRIM(model_used), '') AS model_key,
         COUNT(*) AS runs,
         ROUND(AVG(CASE WHEN status = 'completed' THEN 1.0 ELSE 0 END) * 100, 1) AS success_pct,
         ROUND(AVG(duration_ms), 0) AS avg_latency_ms,
         COALESCE(SUM(cost_usd), 0) AS total_cost_usd,
         COALESCE(SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)), 0) AS total_tokens
       FROM agentsam_workflow_runs
       WHERE tenant_id = ? AND workspace_id = ?
         AND model_used IS NOT NULL AND TRIM(model_used) != ''
         AND started_at >= (unixepoch() - 7 * 86400)
       GROUP BY NULLIF(TRIM(model_used), '')`,
      [tid, workspaceId],
    );

    /** @type {Map<string, Record<string, unknown>>} */
    const lbByModel = new Map();
    for (const r of lbRows) {
      const mk = String(r.model_key || 'unknown');
      lbByModel.set(mk, { ...r });
    }
    for (const w of wfLbRows) {
      const mk = String(w.model_key || 'unknown');
      if (!mk || mk === 'unknown') continue;
      const ex = lbByModel.get(mk);
      if (!ex) {
        lbByModel.set(mk, {
          model_key: mk,
          runs: w.runs,
          success_pct: w.success_pct,
          avg_latency_ms: w.avg_latency_ms,
          total_cost_usd: w.total_cost_usd,
          total_tokens: w.total_tokens,
          routing_arm_id: null,
        });
      } else {
        const r1 = Number(ex.runs) || 0;
        const r2 = Number(w.runs) || 0;
        const tr = r1 + r2;
        ex.runs = tr;
        ex.success_pct =
          tr > 0
            ? Math.round(((r1 * (Number(ex.success_pct) || 0) + r2 * (Number(w.success_pct) || 0)) / tr) * 10) / 10
            : 0;
        ex.avg_latency_ms =
          tr > 0
            ? Math.round((r1 * (Number(ex.avg_latency_ms) || 0) + r2 * (Number(w.avg_latency_ms) || 0)) / tr)
            : 0;
        ex.total_cost_usd = (Number(ex.total_cost_usd) || 0) + (Number(w.total_cost_usd) || 0);
        ex.total_tokens = (Number(ex.total_tokens) || 0) + (Number(w.total_tokens) || 0);
        lbByModel.set(mk, ex);
      }
    }
    const mergedLb = [...lbByModel.values()]
      .sort((a, b) => (Number(b.runs) || 0) - (Number(a.runs) || 0))
      .slice(0, 10);

    const armIds = [...new Set(mergedLb.map((r) => r.routing_arm_id).filter(Boolean).map((x) => String(x)))];
    /** @type {Map<string, Record<string, unknown>>} */
    const armsById = new Map();
    if (armIds.length) {
      const ph = armIds.map(() => '?').join(',');
      const arms = await all(
        db,
        `SELECT id, decayed_score, success_alpha, success_beta, latency_mean, cost_mean, provider
         FROM agentsam_routing_arms
         WHERE id IN (${ph})`,
        armIds,
      );
      for (const a of arms) {
        armsById.set(String(a.id), a);
      }
    }

    const evalAvgs = await all(
      db,
      `SELECT model_key, AVG(score_overall) AS avg_score_overall
       FROM agentsam_eval_runs
       WHERE tenant_id = ? AND passed IS NOT NULL
       GROUP BY model_key`,
      [tid],
    );
    /** @type {Map<string, number | null>} */
    const evalByModel = new Map(
      evalAvgs.map((e) => {
        const v = e.avg_score_overall;
        const n = v == null ? null : Number(v);
        return [String(e.model_key), n != null && Number.isFinite(n) ? n : null];
      }),
    );

    out.model_leaderboard = mergedLb.map((r) => {
      const mk = String(r.model_key || 'unknown');
      const rid = r.routing_arm_id != null ? String(r.routing_arm_id) : '';
      const arm = rid ? armsById.get(rid) : null;
      // When `arm` is set: Bayesian success mean = success_alpha / (success_alpha + success_beta)
      const prov = arm?.provider != null && String(arm.provider).trim() !== '' ? String(arm.provider) : '—';
      const ds = arm?.decayed_score;
      return {
        model_key: mk,
        provider: prov,
        runs: Number(r.runs) || 0,
        success_pct: Number(r.success_pct) || 0,
        avg_latency_ms: Number(r.avg_latency_ms) || 0,
        total_cost_usd: Number(r.total_cost_usd) || 0,
        total_tokens: Number(r.total_tokens) || 0,
        decayed_score: ds != null && Number.isFinite(Number(ds)) ? Number(ds) : null,
        score_overall: evalByModel.get(mk) ?? null,
      };
    });
  } else {
    out._meta.warnings.push('model_leaderboard_skipped_no_workspace_id');
  }

  // ── Cost vs latency: eval runs ───────────────────────────────────────────
  out.eval_scatter = await all(
    db,
    `SELECT model_key, provider, cost_usd, latency_ms, score_overall, passed, run_at
     FROM agentsam_eval_runs
     WHERE tenant_id = ? AND datetime(run_at) >= datetime('now', '-30 days')
     ORDER BY run_at DESC LIMIT 80`,
    T,
  );

  // ── Cost vs latency (routing arms: mean latency/cost per model arm) ─────
  out.cost_latency = [];
  if (workspaceId) {
    const clRows = await all(
      db,
      `SELECT
         model_key,
         provider,
         total_executions AS runs,
         ROUND(latency_mean, 0) AS latency_ms,
         ROUND(cost_mean, 6) AS cost_usd,
         ROUND(decayed_score, 4) AS quality,
         ROUND(success_alpha / NULLIF(success_alpha + success_beta, 0), 3) AS success_rate
       FROM agentsam_routing_arms
       WHERE workspace_id = ? AND is_active = 1 AND total_executions > 0
       ORDER BY total_executions DESC
       LIMIT 50`,
      [workspaceId],
    );
    out.cost_latency = clRows.map((r) => ({
      model_key: String(r.model_key ?? ''),
      provider: String(r.provider ?? ''),
      runs: Number(r.runs) || 0,
      latency_ms: Number(r.latency_ms) || 0,
      cost_usd: Number(r.cost_usd) || 0,
      quality: Number(r.quality) || 0,
      success_rate: r.success_rate == null || r.success_rate === '' ? null : Number(r.success_rate),
    }));
  } else {
    out._meta.warnings.push('cost_latency_skipped_no_workspace_id');
  }

  // ── Routing arms (workspace-scoped; no tenant_id on table) ───────────────
  const raWs = workspaceId ? 'WHERE workspace_id = ?' : '';
  const raBinds = workspaceId ? [workspaceId] : [];
  out.routing_arms = await all(
    db,
    `SELECT model_key, provider, total_executions, decayed_score, is_eligible,
            success_alpha, success_beta, updated_at, workspace_id
     FROM agentsam_routing_arms
     ${raWs}
     ORDER BY decayed_score DESC
     LIMIT 40`,
    raBinds,
  );

  // ── Routing decisions timeseries (updated_at by day, 7d) ──────────────────
  out.routing_timeseries = [];
  if (workspaceId) {
    const rtRows = await all(
      db,
      `SELECT
         date(datetime(updated_at, 'unixepoch')) AS d,
         SUM(CASE WHEN total_executions > 0 THEN total_executions ELSE 0 END) AS total,
         SUM(CASE WHEN is_paused = 0 AND is_eligible = 1 THEN total_executions ELSE 0 END) AS primary_count,
         SUM(CASE WHEN is_paused = 1 THEN total_executions ELSE 0 END) AS fallback_count,
         COUNT(*) AS arm_count
       FROM agentsam_routing_arms
       WHERE workspace_id = ? AND updated_at >= (unixepoch() - 7*86400)
       GROUP BY date(datetime(updated_at, 'unixepoch'))
       ORDER BY d ASC`,
      [workspaceId],
    );
    out.routing_timeseries = rtRows.map((r) => ({
      date: r.d,
      primary: Number(r.primary_count) || 0,
      fallback: Number(r.fallback_count) || 0,
    }));
  } else {
    out._meta.warnings.push('routing_timeseries_skipped_no_workspace_id');
  }

  // ── Cron health (latest row per job; include NULL-tenant platform jobs) ──
  out.cron_latest = await all(
    db,
    `SELECT c.job_name, c.status, c.duration_ms, c.error_message, c.started_at, c.completed_at
     FROM agentsam_cron_runs c
     INNER JOIN (
       SELECT job_name, MAX(started_at) AS mx FROM agentsam_cron_runs
       WHERE tenant_id IS NULL OR tenant_id = ?
       GROUP BY job_name
     ) x ON x.job_name = c.job_name AND x.mx = c.started_at
     WHERE c.tenant_id IS NULL OR c.tenant_id = ?
     ORDER BY c.job_name ASC LIMIT 40`,
    [tid, tid],
  );

  // ── GitHub webhook timeline (richest deploy signal) ─────────────────────
  out.github_push_events = await all(
    db,
    `SELECT event_type, commit_message, author_username, branch, received_at, commit_sha, repo_full_name
     FROM agentsam_webhook_events
     WHERE tenant_id = ?
       AND LOWER(COALESCE(provider,'')) = 'github'
       AND (LOWER(COALESCE(event_type,'')) LIKE '%push%' OR LOWER(COALESCE(event_type,'')) = 'push')
     ORDER BY datetime(received_at) DESC LIMIT 30`,
    T,
  );

  // ── Deployment tracking (7d stats + prod/staging by day) ─────────────────
  const depStatsRow = await first(
    db,
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS succeeded,
       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
       SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
       ROUND(AVG(duration_ms), 0) AS avg_ms
     FROM deployment_tracking
     WHERE tenant_id = ? AND created_at >= date('now', '-7 days')`,
    T,
  );
  out.deployment_stats = {
    total: Number(depStatsRow?.total ?? 0) || 0,
    succeeded: Number(depStatsRow?.succeeded ?? 0) || 0,
    failed: Number(depStatsRow?.failed ?? 0) || 0,
    cancelled: Number(depStatsRow?.cancelled ?? 0) || 0,
    avg_ms: depStatsRow?.avg_ms != null && Number.isFinite(Number(depStatsRow.avg_ms)) ? Number(depStatsRow.avg_ms) : 0,
  };

  const depTsRows = await all(
    db,
    `SELECT date(created_at) AS d,
            SUM(CASE WHEN environment = 'production' THEN 1 ELSE 0 END) AS prod,
            SUM(CASE WHEN environment = 'staging' THEN 1 ELSE 0 END) AS staging
     FROM deployment_tracking
     WHERE tenant_id = ? AND created_at >= date('now', '-7 days')
     GROUP BY date(created_at)
     ORDER BY d ASC`,
    T,
  );
  out.deployment_timeseries = depTsRows.map((r) => ({
    date: r.d,
    prod: Number(r.prod) || 0,
    staging: Number(r.staging) || 0,
  }));

  // ── Budget: 7d spend vs plan token_budget sum (proxy cap) ──────────────
  const spent7d = await first(
    db,
    `SELECT COALESCE(SUM(cost_usd), 0) AS v FROM agentsam_usage_events
     WHERE tenant_id = ? AND created_at >= unixepoch('now', '-7 days')${usageWs}`,
    TW,
  );
  const capRow = await first(
    db,
    `SELECT COALESCE(SUM(COALESCE(token_budget, 0)), 0) AS tok,
            COALESCE(SUM(COALESCE(cost_usd, 0)), 0) AS plan_cost
     FROM agentsam_plans
     WHERE tenant_id = ? AND status IN ('active','draft')${planWs}`,
    workspaceId ? [tid, workspaceId] : T,
  );
  out.budget = {
    spent_7d_usd: Number(spent7d?.v ?? 0) || 0,
    plan_token_budget_sum: Number(capRow?.tok ?? 0) || 0,
    plans_recorded_cost_usd: Number(capRow?.plan_cost ?? 0) || 0,
  };

  // ── Active plans ─────────────────────────────────────────────────────────
  out.active_plans = await all(
    db,
    `SELECT id, title, status, tasks_total, tasks_done, tasks_blocked, plan_date, updated_at, cost_usd
     FROM agentsam_plans
     WHERE tenant_id = ? AND status IN ('active','draft')${planWs}
     ORDER BY COALESCE(updated_at, created_at) DESC LIMIT 12`,
    workspaceId ? [tid, workspaceId] : T,
  );

  return jsonResponse(out);
}
