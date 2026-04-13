/**
 * API: Overview & Analytics
 * Activity strip, deployment history, and platform stats for the dashboard.
 * Routes: /api/overview/*
 */

import { getAuthUser } from '../core/auth.js';
import { jsonResponse } from '../core/responses.js';

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function handleOverviewApi(request, url, env, ctx) {
  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
  if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);

  const path = url.pathname.toLowerCase().replace(/\/$/, '');

  try {
    if (path === '/api/overview/activity-strip') return activityStrip(authUser, env);
    if (path === '/api/overview/deployments')     return deployments(env);
    if (path === '/api/overview/stats')           return stats(env);
    if (path === '/api/overview/command-center')  return commandCenter(env);
    return jsonResponse({ error: 'Overview route not found' }, 404);
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Safely execute a D1 query. Returns null on error instead of throwing.
 * Analytics endpoints should degrade gracefully if one query fails.
 */
function safe(promise) {
  return promise.catch(() => null);
}

/**
 * Extract a numeric value from a D1 result row.
 * Handles both named columns and the common COUNT(*) → `c` pattern.
 */
function num(row, key = 'c') {
  if (row == null) return 0;
  const val = row[key] ?? row['c'];
  return val != null ? Number(val) : 0;
}

/**
 * Build user ID variants to handle user_/non-prefixed IDs stored inconsistently.
 */
function userIdVariants(userId) {
  const base    = userId.replace(/^user_/, '');
  const prefixed = `user_${base}`;
  return [...new Set([userId, base, prefixed])].filter(Boolean);
}

// ---------------------------------------------------------------------------
// /api/overview/activity-strip
// ---------------------------------------------------------------------------

async function activityStrip(authUser, env) {
  const variants     = userIdVariants(authUser.id || 'anonymous');
  const placeholders = variants.map(() => '?').join(',');
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  const [
    deployCountWeek,
    agentCallsWeek,
    taskCountWeek,
    timeWeekRow,
    timeTodayRow,
    dailyRows,
    projectsActiveRow,
    projectsTopRows,
  ] = await Promise.all([
    safe(env.DB.prepare(
      `SELECT COUNT(*) AS c FROM deployments
       WHERE date(timestamp) >= date(?) AND status = 'success'`
    ).bind(sevenDaysAgo).first()),

    safe(env.DB.prepare(
      `SELECT COUNT(*) AS c FROM agent_telemetry
       WHERE created_at >= unixepoch(?)`
    ).bind(sevenDaysAgo).first()),

    safe(env.DB.prepare(
      `SELECT COUNT(*) AS c FROM cicd_pipeline_runs
       WHERE triggered_at >= datetime(?) AND status = 'passed'`
    ).bind(sevenDaysAgo).first()),

    safe(env.DB.prepare(
      `SELECT COALESCE(SUM(duration_seconds), 0) / 3600.0 AS h
       FROM project_time_entries
       WHERE start_time >= date('now', 'weekday 1')
         AND user_id IN (${placeholders})
         AND is_active = 0`
    ).bind(...variants).first()),

    safe(env.DB.prepare(
      `SELECT COALESCE(SUM(duration_seconds), 0) / 3600.0 AS h
       FROM project_time_entries
       WHERE date(start_time) = date('now')
         AND user_id IN (${placeholders})
         AND is_active = 0`
    ).bind(...variants).first()),

    safe(env.DB.prepare(
      `SELECT date(start_time) AS d,
              COALESCE(SUM(duration_seconds), 0) / 3600.0 AS h
       FROM project_time_entries
       WHERE start_time >= date('now', 'weekday 1')
         AND user_id IN (${placeholders})
         AND is_active = 0
       GROUP BY date(start_time)
       ORDER BY d ASC`
    ).bind(...variants).all()),

    safe(env.DB.prepare(
      `SELECT COUNT(*) AS c FROM projects
       WHERE status NOT IN ('archived', 'maintenance')`
    ).first()),

    safe(env.DB.prepare(
      `SELECT name, status, priority FROM projects
       WHERE status NOT IN ('archived')
       ORDER BY COALESCE(priority, 0) DESC, created_at DESC
       LIMIT 4`
    ).all()),
  ]);

  return jsonResponse({
    weekly_activity: {
      deploys:         num(deployCountWeek),
      tasks_completed: num(taskCountWeek),
      agent_calls:     num(agentCallsWeek),
    },
    worked_this_week: {
      hours_this_week: Math.round(num(timeWeekRow, 'h')  * 100) / 100,
      hours_today:     Math.round(num(timeTodayRow, 'h') * 100) / 100,
      daily:           dailyRows?.results || [],
    },
    projects: {
      active: num(projectsActiveRow),
      top:    projectsTopRows?.results || [],
    },
  });
}

// ---------------------------------------------------------------------------
// /api/overview/deployments
// ---------------------------------------------------------------------------

async function deployments(env) {
  const [deploys, cicdRuns] = await Promise.all([
    env.DB.prepare(
      `SELECT worker_name, environment, status,
              timestamp AS deployed_at, notes AS deployment_notes
       FROM deployments
       ORDER BY timestamp DESC LIMIT 20`
    ).all(),

    env.DB.prepare(
      `SELECT run_id AS id, env AS environment, status,
              triggered_at AS started_at, completed_at
       FROM cicd_pipeline_runs
       ORDER BY triggered_at DESC LIMIT 10`
    ).all(),
  ]);

  return jsonResponse({
    deployments: deploys.results  || [],
    cicd_runs:   cicdRuns.results || [],
  });
}

// ---------------------------------------------------------------------------
// /api/overview/stats
// ---------------------------------------------------------------------------

async function stats(env) {
  const [tasks, deploys, agentCalls, healthRow] = await Promise.all([
    safe(env.DB.prepare(
      `SELECT COUNT(*) AS c FROM cicd_pipeline_runs WHERE status = 'passed'`
    ).first()),

    safe(env.DB.prepare(
      `SELECT COUNT(*) AS c FROM deployments WHERE status = 'success'`
    ).first()),

    safe(env.DB.prepare(
      `SELECT COUNT(*) AS c FROM agent_telemetry`
    ).first()),

    safe(env.DB.prepare(
      `SELECT health_status, health_notes, snapshot_at
       FROM system_health_snapshots
       ORDER BY snapshot_at DESC LIMIT 1`
    ).first()),
  ]);

  return jsonResponse({
    tasks_completed: num(tasks),
    deploys_total:   num(deploys),
    agent_calls_total: num(agentCalls),
    platform_health: healthRow || { health_status: 'unknown', health_notes: '', snapshot_at: null },
  });
}

// ---------------------------------------------------------------------------
// /api/overview/command-center
// ---------------------------------------------------------------------------

async function commandCenter(env) {
  const [
    spendHistory,
    modelReliability,
    toolReliability,
    roadmapProgress,
    cicdHistory,
  ] = await Promise.all([
    // 30d AI Spend History
    safe(env.DB.prepare(
      `SELECT date(created_at, 'unixepoch') AS d, SUM(computed_cost_usd) AS cost
       FROM agent_telemetry
       WHERE created_at >= unixepoch('now', '-30 days')
       GROUP BY d ORDER BY d ASC`
    ).all()),

    // Model Reliability (Completion/Fail)
    safe(env.DB.prepare(
      `SELECT model_used, status, COUNT(*) AS count
       FROM agentsam_agent_run
       WHERE created_at >= unixepoch('now', '-7 days')
       GROUP BY model_used, status`
    ).all()),

    // MCP Tool Reliability
    safe(env.DB.prepare(
      `SELECT tool_name, status, COUNT(*) AS count
       FROM mcp_tool_calls
       WHERE created_at >= unixepoch('now', '-7 days')
       GROUP BY tool_name, status`
    ).all()),

    // Roadmap Progress
    safe(env.DB.prepare(
      `SELECT p.name AS plan, 
              COUNT(s.id) AS total,
              SUM(CASE WHEN s.status = 'completed' THEN 1 ELSE 0 END) AS completed
       FROM roadmap_plans p
       LEFT JOIN roadmap_steps s ON p.id = s.plan_id
       WHERE p.status != 'archived'
       GROUP BY p.id`
    ).all()),

    // CI/CD 14d History
    safe(env.DB.prepare(
      `SELECT date(triggered_at) AS d, status, COUNT(*) AS count
       FROM cicd_pipeline_runs
       WHERE triggered_at >= date('now', '-14 days')
       GROUP BY d, status ORDER BY d ASC`
    ).all()),
  ]);

  return jsonResponse({
    spend_history: spendHistory?.results || [],
    model_reliability: modelReliability?.results || [],
    tool_reliability: toolReliability?.results || [],
    roadmap: roadmapProgress?.results || [],
    cicd: cicdHistory?.results || [],
  });
}

