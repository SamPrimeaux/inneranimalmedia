/**
 * Daily plan email — Gemini-only generation, owner notify, push alerts.
 */

import { getSuperadminAuthIds } from '../../core/auth.js';
import {
  EMPTY_ALL,
  resolveDailyDigestScope,
  workspaceIdInSql,
} from '../../core/daily-digest-scope.js';
import { notifySam } from '../../core/notifications.js';
import { sendWebPushToUser } from '../../core/web-push.js';
import { snapshotGmailInboxForUser } from '../../core/gmail-inbox-snapshot.js';
import { agentsamMemoryActiveSqlOrEmpty } from '../../core/agentsam-memory-resolve.js';
import { buildGeminiGenerationConfig, parseGeminiResponseText } from '../../integrations/gemini.js';

export { resolveDailyDigestScope } from '../../core/daily-digest-scope.js';

export class DailyPlanError extends Error {
  constructor(message, { stage = 'unknown', model = '', detail = '' } = {}) {
    super(message);
    this.name = 'DailyPlanError';
    this.stage = stage;
    this.model = model;
    this.detail = detail;
  }
}

function geminiApiKey(env) {
  return (
    (env?.GOOGLE_AI_API_KEY && String(env.GOOGLE_AI_API_KEY).trim()) ||
    (env?.GEMINI_API_KEY && String(env.GEMINI_API_KEY).trim()) ||
    ''
  );
}

/** @param {*} env */
export async function resolveDailyPlanNotifyUser(env) {
  const resendTo = env?.RESEND_TO ? String(env.RESEND_TO).trim().toLowerCase() : '';
  if (resendTo && env?.DB) {
    const row = await env.DB.prepare(
      `SELECT id, email FROM auth_users WHERE lower(email) = ? LIMIT 1`
    ).bind(resendTo).first().catch(() => null);
    if (row?.id) {
      return { userId: String(row.id), email: String(row.email || resendTo) };
    }
  }
  const sup = await getSuperadminAuthIds(env);
  const userId = sup.authIds.size ? [...sup.authIds][0] : null;
  const email = sup.emails.size ? [...sup.emails][0] : (resendTo || null);
  return { userId, email };
}

/**
 * Users who should receive their own scoped daily digest + Gmail triage.
 * Primary: active google_gmail OAuth linked to auth_users.email (all connected accounts per user).
 * Fallback: platform notify user (RESEND_TO / superadmin) if not already listed.
 * Context is isolated per recipient — never cross-tenant / cross-user platform data.
 * @param {*} env
 * @returns {Promise<Array<{ userId: string, email: string, tenantId?: string|null, hasGmail?: boolean }>>}
 */
export async function listDailyMemoryRecipients(env) {
  if (!env?.DB) return [];
  const seen = new Map();

  const { results } = await env.DB.prepare(
    `SELECT DISTINCT
       u.id AS user_id,
       lower(trim(u.email)) AS email,
       COALESCE(NULLIF(trim(u.active_tenant_id), ''), NULLIF(trim(u.tenant_id), '')) AS tenant_id
     FROM user_oauth_tokens t
     INNER JOIN auth_users u ON u.id = t.user_id
     WHERE lower(t.provider) IN ('google_gmail', 'gmail')
       AND u.email IS NOT NULL AND trim(u.email) != ''
       AND (
         COALESCE(trim(t.refresh_token), '') != ''
         OR COALESCE(trim(t.refresh_token_encrypted), '') != ''
         OR COALESCE(trim(t.access_token), '') != ''
         OR COALESCE(trim(t.access_token_encrypted), '') != ''
       )`,
  ).all().catch(() => ({ results: [] }));

  for (const row of results || []) {
    const userId = String(row.user_id || '').trim();
    const email = String(row.email || '').trim().toLowerCase();
    if (!userId || !email.includes('@')) continue;
    seen.set(userId, {
      userId,
      email,
      tenantId: row.tenant_id ? String(row.tenant_id).trim() : null,
      hasGmail: true,
    });
  }

  const platform = await resolveDailyPlanNotifyUser(env);
  if (platform?.userId && platform?.email) {
    const userId = String(platform.userId).trim();
    const email = String(platform.email).trim().toLowerCase();
    if (userId && email.includes('@') && !seen.has(userId)) {
      seen.set(userId, {
        userId,
        email,
        tenantId: null,
        hasGmail: false,
      });
    }
  }

  return [...seen.values()];
}

/** @param {*} env @param {string} sql @param  {...*} bind */
async function d1All(env, sql, ...bind) {
  if (!env?.DB) return { results: [] };
  return env.DB.prepare(sql).bind(...bind).all().catch(() => ({ results: [] }));
}

/** @param {*} env @param {string} sql @param  {...*} bind */
async function d1First(env, sql, ...bind) {
  if (!env?.DB) return null;
  return env.DB.prepare(sql).bind(...bind).first().catch(() => null);
}

/** @param {*} env @param {string} tenantId @param {{ userId?: string|null, email?: string|null }} owner @param {import('../../core/daily-digest-scope.js').DailyDigestScope|null} [presetScope] */
export async function gatherMorningPlanContext(env, tenantId, owner, presetScope = null) {
  const safe = (p) => (p ? p.catch(() => null) : Promise.resolve(null));
  const today = new Date().toISOString().slice(0, 10);
  const digestScope = presetScope || await resolveDailyDigestScope(env, owner);
  const isOp = digestScope.isPlatformOperator;
  const effectiveTenant = digestScope.tenantId || tenantId;
  const wsIn = workspaceIdInSql(digestScope.workspaceIds);
  const memoryActiveSql = await agentsamMemoryActiveSqlOrEmpty(env.DB);
  const emptyAll = () => Promise.resolve(EMPTY_ALL);
  const emptyFirst = () => Promise.resolve(null);

  const [
    memoryRows,
    platformCtx,
    clientCtxRows,
    recentRuns,
    runCostToday,
    cronHealth,
    mcpActivity,
    spawnJobs,
    migrations,
    velocityRecent,
    emailLogs24h,
    pendingNotifications,
    gmailSnapshot,
    usageToday,
    usage7d,
    billingMonth,
    clientRevenue,
    financeMonthly,
    deploys24h,
    deploys7d,
    verifiedDeploys24h,
    planTasks,
    execPerf24h,
    healthDaily,
    compaction24h,
    errors24h,
    guardrails24h,
    modelHealth,
    analytics7d,
    toolStatsFlaky,
    eto24h,
    openTodosByProject,
    calendarUpcoming,
    stripeWebhooks,
    founderToday,
    taskActivityRecent,
    trackedTimeToday,
  ] = await Promise.all([
    env.DB.prepare(
      `SELECT key, value, memory_type, updated_at FROM agentsam_memory
       WHERE tenant_id = ?
         AND ${memoryActiveSql}
         AND memory_type IN ('decision','skill','state','policy')
         AND decay_score > 0
       ORDER BY updated_at DESC LIMIT 12`
    ).bind(effectiveTenant).all(),

    isOp
      ? safe(env.DB.prepare(
        `SELECT project_name, status, description, current_blockers, goals, notes, updated_at
         FROM agentsam_project_context WHERE id = 'ctx_inneranimalmedia'`
      ).first())
      : emptyFirst(),

    env.DB.prepare(
      `SELECT project_name, status, current_blockers, goals, updated_at
       FROM agentsam_project_context
       WHERE tenant_id = ?
         AND id != 'ctx_inneranimalmedia'
         AND status IN ('active','blocked_live_platform_regression')
         AND project_type != 'cms_site'
       ORDER BY updated_at DESC LIMIT 6`
    ).bind(effectiveTenant).all(),

    wsIn.binds.length
      ? safe(env.DB.prepare(
        `SELECT COUNT(*) as total_runs,
                ROUND(SUM(cost_usd), 4) as total_cost,
                SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failed,
                SUM(CASE WHEN status='running' THEN 1 ELSE 0 END) as stuck_running
         FROM agentsam_agent_run
         WHERE ${wsIn.clause}
           AND created_at_unix > unixepoch('now','-24 hours')`
      ).bind(...wsIn.binds).first())
      : emptyFirst(),

    wsIn.binds.length
      ? safe(env.DB.prepare(
        `SELECT ROUND(SUM(cost_usd), 4) as week_cost
         FROM agentsam_agent_run
         WHERE ${wsIn.clause}
           AND created_at_unix > unixepoch('now','-7 days')`
      ).bind(...wsIn.binds).first())
      : emptyFirst(),

    isOp
      ? env.DB.prepare(
        `SELECT job_name, status, started_at, duration_ms, error_message
         FROM agentsam_cron_runs
         WHERE started_at = (
           SELECT MAX(c2.started_at) FROM agentsam_cron_runs c2
           WHERE c2.job_name = agentsam_cron_runs.job_name
         )
         ORDER BY started_at DESC LIMIT 12`
      ).all()
      : emptyAll(),

    wsIn.binds.length
      ? env.DB.prepare(
        `SELECT tool_name, COUNT(*) as calls,
                SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as ok,
                SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as errors
         FROM agentsam_mcp_tool_execution
         WHERE ${wsIn.clause}
           AND COALESCE(created_at_unix, unixepoch(created_at)) > unixepoch('now','-24 hours')
         GROUP BY tool_name ORDER BY calls DESC LIMIT 10`
      ).bind(...wsIn.binds).all()
      : emptyAll(),

    wsIn.binds.length
      ? env.DB.prepare(
        `SELECT master_agent_slug, status, subagents_spawned,
                subagents_succeeded, subagents_failed, started_at, completed_at
         FROM agentsam_spawn_job
         WHERE ${wsIn.clause}
         ORDER BY started_at DESC LIMIT 5`
      ).bind(...wsIn.binds).all()
      : emptyAll(),

    isOp
      ? env.DB.prepare(
        `SELECT id, name, applied_at FROM d1_migrations ORDER BY applied_at DESC LIMIT 5`
      ).all()
      : emptyAll(),

    isOp
      ? env.DB.prepare(
        `SELECT date, velocity_score, momentum, github_commits, deploys_production,
                migrations_applied, mcp_tool_calls, time_minutes, cost_usd, notes
         FROM task_velocity ORDER BY date DESC LIMIT 7`
      ).all()
      : emptyAll(),

    isOp
      ? safe(env.DB.prepare(
        `SELECT subject, status, to_email, from_email, created_at
         FROM email_logs
         WHERE datetime(created_at) >= datetime('now', '-24 hours')
         ORDER BY created_at DESC LIMIT 15`
      ).all())
      : safe(env.DB.prepare(
        `SELECT subject, status, to_email, from_email, created_at
         FROM email_logs
         WHERE user_id = ?
           AND datetime(created_at) >= datetime('now', '-24 hours')
         ORDER BY created_at DESC LIMIT 15`
      ).bind(digestScope.userId).all()),

    isOp
      ? safe(env.DB.prepare(
        `SELECT channel, subject, status, priority, created_at
         FROM notification_outbox
         WHERE status IN ('pending','queued','failed')
         ORDER BY created_at DESC LIMIT 10`
      ).all())
      : safe(env.DB.prepare(
        `SELECT channel, subject, status, priority, created_at
         FROM notification_outbox
         WHERE status IN ('pending','queued','failed')
           AND (tenant_id = ? OR user_id = ?)
         ORDER BY created_at DESC LIMIT 10`
      ).bind(effectiveTenant, digestScope.userId).all()),

    snapshotGmailInboxForUser(env, {
      email: owner.email || digestScope.email || undefined,
      userId: owner.userId || digestScope.userId || undefined,
      maxPerAccount: 100,
      searchAnywhere: true,
      hoursBack: 24,
    }),

    isOp
      ? d1First(env,
        `SELECT day,
                MAX(cost_usd) as cost_usd, MAX(ai_calls) as ai_calls,
                MAX(tool_calls) as tool_calls, MAX(tool_failures) as tool_failures,
                MAX(deployments) as deployments
         FROM agentsam_usage_rollups_daily WHERE day = ? GROUP BY day`,
        today)
      : (effectiveTenant && wsIn.binds.length
        ? d1First(env,
          `SELECT day,
                  MAX(cost_usd) as cost_usd, MAX(ai_calls) as ai_calls,
                  MAX(tool_calls) as tool_calls, MAX(tool_failures) as tool_failures,
                  MAX(deployments) as deployments
           FROM agentsam_usage_rollups_daily
           WHERE tenant_id = ? AND ${wsIn.clause} AND day = ?
           GROUP BY day`,
          effectiveTenant, ...wsIn.binds, today)
        : emptyFirst()),

    isOp
      ? d1First(env,
        `SELECT ROUND(SUM(sub.cost_usd), 4) as week_cost,
                ROUND(AVG(sub.cost_usd), 4) as avg_daily_cost
         FROM (
           SELECT day, MAX(cost_usd) as cost_usd
           FROM agentsam_usage_rollups_daily
           WHERE day >= date(?, '-7 days') AND day < ?
           GROUP BY day
         ) sub`,
        today, today)
      : (effectiveTenant && wsIn.binds.length
        ? d1First(env,
          `SELECT ROUND(SUM(sub.cost_usd), 4) as week_cost,
                  ROUND(AVG(sub.cost_usd), 4) as avg_daily_cost
           FROM (
             SELECT day, MAX(cost_usd) as cost_usd
             FROM agentsam_usage_rollups_daily
             WHERE tenant_id = ? AND ${wsIn.clause}
               AND day >= date(?, '-7 days') AND day < ?
             GROUP BY day
           ) sub`,
          effectiveTenant, ...wsIn.binds, today, today)
        : emptyFirst()),

    isOp
      ? d1All(env,
        `SELECT provider, period_month, subscription_usd, usage_usd, total_usd, status
         FROM billing_summary
         WHERE period_month = strftime('%Y-%m', ?)
         ORDER BY total_usd DESC LIMIT 12`,
        today)
      : emptyAll(),

    isOp
      ? d1All(env,
        `SELECT client_id, client_name, mrr_usd, payment_status, profit_margin_pct, updated_at
         FROM client_revenue
         WHERE payment_status != 'churned'
         ORDER BY mrr_usd DESC LIMIT 12`)
      : emptyAll(),

    isOp
      ? d1All(env,
        `SELECT month, net_cashflow_usd, revenue_usd, expenses_usd
         FROM financial_monthly_summaries
         ORDER BY month DESC LIMIT 2`)
      : emptyAll(),

    isOp
      ? d1First(env,
        `SELECT COUNT(*) as cnt FROM deployments
         WHERE datetime(created_at) >= datetime('now', '-24 hours')`)
      : emptyFirst(),

    isOp
      ? d1First(env,
        `SELECT COUNT(*) as cnt FROM deployments
         WHERE datetime(created_at) >= datetime('now', '-7 days')`)
      : emptyFirst(),

    isOp
      ? d1All(env,
        `SELECT git_hash, description, status,
                COALESCE(deploy_time_seconds, duration_seconds) AS deploy_time_seconds,
                COALESCE(created_at, unixepoch(timestamp)) AS created_at,
                timestamp, version, environment
         FROM deployments
         WHERE COALESCE(created_at, unixepoch(timestamp), 0) >= unixepoch('now', '-24 hours')
         ORDER BY COALESCE(created_at, unixepoch(timestamp), 0) DESC
         LIMIT 30`)
      : emptyAll(),

    d1All(env,
      `SELECT status, COUNT(*) as cnt
       FROM agentsam_plan_tasks
       WHERE tenant_id = ?
       GROUP BY status`,
      effectiveTenant),

    isOp
      ? d1All(env,
        `SELECT task_type,
                COUNT(*) as runs,
                ROUND(AVG(CASE WHEN success = 1 THEN 1.0 ELSE 0 END), 3) as success_rate,
                ROUND(AVG(latency_ms)) as avg_latency_ms
         FROM agentsam_execution_performance_metrics
         WHERE created_at_unix > unixepoch('now', '-24 hours')
         GROUP BY task_type ORDER BY runs DESC LIMIT 10`)
      : emptyAll(),

    isOp
      ? d1All(env,
        `SELECT day, green_count, yellow_count, red_count, overall_score
         FROM agentsam_health_daily
         ORDER BY day DESC LIMIT 8`)
      : emptyAll(),

    isOp
      ? d1First(env,
        `SELECT COUNT(*) as events, COALESCE(SUM(tokens_saved), 0) as tokens_saved
         FROM agentsam_compaction_events
         WHERE created_at_unix > unixepoch('now', '-24 hours')`)
      : emptyFirst(),

    isOp
      ? d1All(env,
        `SELECT error_type, COUNT(*) as cnt
         FROM agentsam_error_log
         WHERE created_at_unix > unixepoch('now', '-24 hours')
         GROUP BY error_type ORDER BY cnt DESC LIMIT 8`)
      : emptyAll(),

    isOp
      ? d1All(env,
        `SELECT guardrail_key, decision, COUNT(*) as cnt
         FROM agentsam_guardrail_events
         WHERE created_at_unix > unixepoch('now', '-24 hours')
           AND decision != 'allowed'
         GROUP BY guardrail_key, decision ORDER BY cnt DESC LIMIT 8`)
      : emptyAll(),

    isOp
      ? d1All(env,
        `SELECT model_key, status, error_rate, p95_latency_ms, updated_at
         FROM agentsam_model_health
         WHERE status != 'healthy'
         ORDER BY error_rate DESC LIMIT 8`)
      : emptyAll(),

    isOp
      ? d1All(env,
        `SELECT model_key, intent, bucket_date,
                ROUND(AVG(success_rate), 3) as success_rate,
                ROUND(AVG(avg_cost_usd), 4) as avg_cost_usd
         FROM agentsam_analytics
         WHERE bucket_date >= date(?, '-7 days')
         GROUP BY model_key, intent
         ORDER BY success_rate ASC LIMIT 12`,
        today)
      : emptyAll(),

    isOp
      ? d1All(env,
        `SELECT tool_name, failure_count, success_count, last_failure_at
         FROM agentsam_tool_stats_compacted
         WHERE failure_count > 0
         ORDER BY failure_count DESC LIMIT 10`)
      : emptyAll(),

    isOp
      ? d1First(env,
        `SELECT COUNT(*) as events,
                ROUND(AVG(reward_score), 3) as avg_reward,
                ROUND(SUM(cost_usd), 4) as cost_usd,
                ROUND(AVG(latency_ms)) as avg_latency_ms,
                SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as ok,
                SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed
         FROM agentsam_performance_eto_events
         WHERE created_at_unix > unixepoch('now', '-24 hours')`)
      : emptyFirst(),

    d1All(env,
      `SELECT COALESCE(project_id, 'unassigned') as project_id, COUNT(*) as open_cnt
       FROM agentsam_todo
       WHERE tenant_id = ? AND status NOT IN ('done','completed','cancelled')
       GROUP BY COALESCE(project_id, 'unassigned')
       ORDER BY open_cnt DESC LIMIT 12`,
      effectiveTenant),

    wsIn.binds.length
      ? d1All(env,
        `SELECT id, title, start_datetime, end_datetime, event_type
         FROM calendar_events
         WHERE ${wsIn.clause}
           AND date(start_datetime) BETWEEN date('now') AND date('now', '+1 day')
         ORDER BY start_datetime ASC LIMIT 12`,
        ...wsIn.binds)
      : emptyAll(),

    isOp
      ? d1All(env,
        `SELECT event_type, status, created_at
         FROM agentsam_webhook_events
         WHERE provider = 'stripe'
           AND datetime(created_at) >= datetime('now', '-48 hours')
         ORDER BY created_at DESC LIMIT 10`)
      : emptyAll(),

    isOp
      ? d1First(env,
        `SELECT date, deep_work_hours, burnout_risk, productivity_ratio,
                energy_level, stress_level, days_since_break, late_night_commits
         FROM founder_metrics
         WHERE date >= date(?, '-7 days')
         ORDER BY date DESC LIMIT 1`,
        today)
      : emptyFirst(),

    d1All(env,
      `SELECT action, COUNT(*) as cnt
       FROM task_activity
       WHERE tenant_id = ? AND created_at > unixepoch('now', '-24 hours')
       GROUP BY action ORDER BY cnt DESC`,
      effectiveTenant),

    isOp
      ? d1First(env,
        `SELECT ROUND(COALESCE(SUM(
           CASE
             WHEN ended_at IS NULL THEN MAX(0, (unixepoch() - COALESCE(started_at, created_at))) / 60.0
             ELSE COALESCE(hours * 60, MAX(0, ended_at - COALESCE(started_at, created_at)) / 60.0)
           END
         ), 0)) as minutes
         FROM time_entries
         WHERE date(datetime(COALESCE(started_at, created_at), 'unixepoch')) = date('now')`)
      : d1First(env,
        `SELECT ROUND(COALESCE(SUM(
           CASE
             WHEN ended_at IS NULL THEN MAX(0, (unixepoch() - COALESCE(started_at, created_at))) / 60.0
             ELSE COALESCE(hours * 60, MAX(0, ended_at - COALESCE(started_at, created_at)) / 60.0)
           END
         ), 0)) as minutes
         FROM time_entries
         WHERE user_id = ?
           AND date(datetime(COALESCE(started_at, created_at), 'unixepoch')) = date('now')`,
        digestScope.userId),
  ]);

  let gitLog = '';
  if (isOp) {
    try {
      const r = await env.TERMINAL?.fetch?.(new Request('http://internal/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'cd ~/inneranimalmedia && git log --oneline -8' }),
      }));
      if (r?.ok) gitLog = await r.text();
    } catch { /* non-fatal */ }
  }

  const chronicBlockers = await d1All(env,
    `SELECT id, title, status, project_id, updated_at
     FROM agentsam_todo
     WHERE tenant_id = ? AND status = 'carried'
       AND date(updated_at) <= date('now', '-3 days')
     ORDER BY updated_at ASC LIMIT 8`,
    effectiveTenant);

  return {
    digestScope,
    memoryRows,
    platformCtx,
    clientCtxRows,
    recentRuns,
    runCostToday,
    cronHealth,
    mcpActivity,
    spawnJobs,
    migrations,
    velocityRecent,
    emailLogs24h,
    pendingNotifications,
    gmailSnapshot,
    gitLog,
    usageToday,
    usage7d,
    billingMonth,
    clientRevenue,
    financeMonthly,
    deploys24h,
    deploys7d,
    verifiedDeploys24h,
    planTasks,
    execPerf24h,
    healthDaily,
    compaction24h,
    errors24h,
    guardrails24h,
    modelHealth,
    analytics7d,
    toolStatsFlaky,
    eto24h,
    openTodosByProject,
    calendarUpcoming,
    stripeWebhooks,
    founderToday,
    taskActivityRecent,
    trackedTimeToday,
    chronicBlockers,
  };
}

/** @param {*} env @param {{ modelKey: string, systemInstruction: string, userText: string, stage: string, maxOutputTokens?: number, temperature?: number, json?: boolean }} opts */
export async function generateWithGemini(env, opts) {
  const apiKey = geminiApiKey(env);
  if (!apiKey) {
    throw new DailyPlanError('GOOGLE_AI_API_KEY / GEMINI_API_KEY not configured', {
      stage: opts.stage,
      model: opts.modelKey,
    });
  }

  const modelKey = String(opts.modelKey || '').trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelKey}:generateContent?key=${apiKey}`;
  const generationConfig = {
    ...buildGeminiGenerationConfig(
      { mode: 'ask', taskType: opts.taskType || 'summary' },
      { modelId: modelKey, maxOutputTokens: opts.maxOutputTokens ?? 900 },
    ),
  };
  if (opts.json) generationConfig.responseMimeType = 'application/json';

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: opts.systemInstruction }] },
      contents: [{ role: 'user', parts: [{ text: opts.userText }] }],
      generationConfig,
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = data?.error?.message || `HTTP ${res.status}`;
    throw new DailyPlanError(`Gemini ${modelKey} failed: ${detail}`, {
      stage: opts.stage,
      model: modelKey,
      detail,
    });
  }

  const text = parseGeminiResponseText(data);
  if (!text) {
    throw new DailyPlanError(`Gemini ${modelKey} returned empty content`, {
      stage: opts.stage,
      model: modelKey,
    });
  }
  return text;
}

/** @param {*} env @param {object[]} emails */
export async function triageInboxForDailyPlan(env, emails) {
  if (!Array.isArray(emails) || !emails.length) {
    return { items: [], summary: 'No inbox messages in last 48h from connected Gmail accounts.' };
  }

  const raw = await generateWithGemini(env, {
    modelKey: 'gemini-3.1-flash-lite',
    stage: 'inbox_triage',
    systemInstruction:
      'You triage email for a solo founder. Return JSON only: {"summary":"one line","items":[{"id":"","account":"","urgency":"critical|high|normal|low|fyi","category":"primary|updates|action|fyi","needs_reply":true,"suggested_action":"archive|reply|schedule|ignore","reason":""}]}. Max 20 items. No emojis.',
    userText: `Inbox batch (${emails.length}):\n${JSON.stringify(emails.slice(0, 40))}`,
    maxOutputTokens: 2048,
    temperature: 0.1,
    json: true,
  });

  try {
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    throw new DailyPlanError(`Inbox triage JSON parse failed: ${e?.message}`, {
      stage: 'inbox_triage_parse',
      model: 'gemini-3.1-flash-lite',
      detail: raw.slice(0, 400),
    });
  }
}

/** @param {*} env @param {{ ok: boolean, title: string, body: string, userId?: string|null, tenantId?: string|null, tag?: string }} alert @param {ExecutionContext|null} ctx */
export async function alertDailyPlan(env, alert, ctx) {
  const pushPayload = {
    title: alert.title,
    body: alert.body.slice(0, 240),
    url: alert.ok ? '/dashboard/agent' : '/dashboard/mail',
    tag: alert.tag || 'daily-plan',
  };

  const run = async () => {
    if (alert.userId) {
      await sendWebPushToUser(env, {
        userId: alert.userId,
        tenantId: alert.tenantId || undefined,
        ...pushPayload,
      }).catch((e) => console.warn('[daily-plan] push', e?.message));
    } else {
      const { broadcastWebPushToActiveSubscriptions } = await import('../../core/web-push.js');
      await broadcastWebPushToActiveSubscriptions(env, pushPayload).catch((e) =>
        console.warn('[daily-plan] push broadcast', e?.message),
      );
    }

    if (!alert.ok) {
      await notifySam(env, {
        subject: alert.title,
        body: alert.body,
        category: 'daily_plan_failure',
      }, null);
    }
  };

  if (ctx?.waitUntil) ctx.waitUntil(run());
  else await run();
}
