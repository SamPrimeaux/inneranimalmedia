/**
 * workspace_limits + agentsam_user_policy spend enforcement and alert emails.
 * Reads limits_json.spend_alerts at runtime (D1-driven, not hardcoded).
 */
import { loadAgentSamUserPolicy } from './agent-policy.js';
import { notifySam } from '../cron/notify-sam.js';

function trim(v) {
  return v == null ? '' : String(v).trim();
}

function parseJsonSafe(raw, fallback = null) {
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return fallback;
  }
}

const BLOCK_ACTIONS = new Set(['block', 'require_byok', 'hard_stop']);

/**
 * @param {any} env
 * @param {{ tenantId?: string|null, workspaceId?: string|null, userId?: string|null, sessionId?: string|null }} scope
 */
export async function getWorkspaceSpendAmounts(env, scope = {}) {
  const tid = trim(scope.tenantId);
  const ws = trim(scope.workspaceId);
  const uid = trim(scope.userId);
  const sid = trim(scope.sessionId);
  const empty = { daily_usd: 0, monthly_usd: 0, total_usd: 0, session_usd: 0, workspace_daily_usd: 0 };
  if (!env?.DB || !tid) return empty;

  const today = new Date().toISOString().slice(0, 10);
  const monthPrefix = today.slice(0, 7);

  try {
    const [tenantDaily, tenantMonthly, tenantTotal, wsDaily, sessionRow] = await Promise.all([
      env.DB.prepare(
        `SELECT COALESCE(SUM(cost_usd), 0) AS total FROM agentsam_usage_rollups_daily WHERE tenant_id = ? AND day = ?`,
      )
        .bind(tid, today)
        .first(),
      env.DB.prepare(
        `SELECT COALESCE(SUM(cost_usd), 0) AS total FROM agentsam_usage_rollups_daily WHERE tenant_id = ? AND day LIKE ?`,
      )
        .bind(tid, `${monthPrefix}%`)
        .first(),
      env.DB.prepare(
        `SELECT COALESCE(SUM(cost_usd), 0) AS total FROM agentsam_usage_rollups_daily WHERE tenant_id = ?`,
      )
        .bind(tid)
        .first(),
      ws
        ? env.DB.prepare(
            `SELECT COALESCE(SUM(cost_usd), 0) AS total FROM agentsam_usage_rollups_daily WHERE tenant_id = ? AND workspace_id = ? AND day = ?`,
          )
            .bind(tid, ws, today)
            .first()
        : Promise.resolve(null),
      sid
        ? env.DB.prepare(
            `SELECT COALESCE(SUM(cost_usd), 0) AS total FROM agentsam_usage_events
              WHERE tenant_id = ? AND session_id = ?`,
          )
            .bind(tid, sid)
            .first()
        : Promise.resolve(null),
    ]);

    return {
      daily_usd: Number(tenantDaily?.total ?? 0) || 0,
      monthly_usd: Number(tenantMonthly?.total ?? 0) || 0,
      total_usd: Number(tenantTotal?.total ?? 0) || 0,
      session_usd: Number(sessionRow?.total ?? 0) || 0,
      workspace_daily_usd: Number(wsDaily?.total ?? 0) || 0,
    };
  } catch (e) {
    console.warn('[workspace-spend-guard] amounts', e?.message ?? e);
    return empty;
  }
}

/**
 * @param {any} env
 * @param {string} workspaceId
 */
export async function loadWorkspaceSpendLimits(env, workspaceId) {
  const ws = trim(workspaceId);
  if (!env?.DB || !ws) return null;
  try {
    const row = await env.DB.prepare(
      `SELECT workspace_id, max_daily_cost_usd, max_requests_per_min, limits_json FROM workspace_limits WHERE workspace_id = ? LIMIT 1`,
    )
      .bind(ws)
      .first();
    if (!row) return null;
    const limits = parseJsonSafe(row.limits_json, {}) || {};
    return {
      workspace_id: ws,
      max_daily_cost_usd:
        row.max_daily_cost_usd != null ? Number(row.max_daily_cost_usd) : null,
      max_requests_per_min:
        row.max_requests_per_min != null ? Number(row.max_requests_per_min) : null,
      limits_json: limits,
      platform_total_cap_usd:
        Number(limits.platform_total_cap_usd) > 0 ? Number(limits.platform_total_cap_usd) : null,
      max_monthly_cost_usd:
        Number(limits.max_monthly_cost_usd) > 0 ? Number(limits.max_monthly_cost_usd) : null,
      spend_alerts: Array.isArray(limits.spend_alerts) ? limits.spend_alerts : [],
      byok_required_after_allowance: limits.byok_required_after_allowance === true,
      allow_platform_fallback: limits.allow_platform_fallback !== false,
      byok_required: limits.byok_required === true,
    };
  } catch (e) {
    console.warn('[workspace-spend-guard] load limits', e?.message ?? e);
    return null;
  }
}

/**
 * Whether this workspace may use platform Wrangler secrets / env.DB (default true when no row).
 * @param {any} env
 * @param {string} workspaceId
 */
export async function workspaceAllowsPlatformFallback(env, workspaceId) {
  const row = await loadWorkspaceSpendLimits(env, workspaceId);
  if (!row) return true;
  if (row.byok_required === true) return false;
  return row.allow_platform_fallback !== false;
}

function spentForPeriod(period, amounts) {
  const p = trim(period).toLowerCase() || 'total';
  if (p === 'daily' || p === 'day') return amounts.daily_usd;
  if (p === 'monthly' || p === 'month') return amounts.monthly_usd;
  if (p === 'session') return amounts.session_usd;
  if (p === 'workspace_daily') return amounts.workspace_daily_usd;
  return amounts.total_usd;
}

/**
 * @param {any} env
 * @param {Record<string, unknown>} alert
 * @param {Record<string, unknown>} ctx
 * @param {Awaited<ReturnType<typeof getWorkspaceSpendAmounts>>} amounts
 */
async function maybeFireSpendAlert(env, executionCtx, alert, ctx, amounts) {
  if (!env?.DB || alert?.enabled === false) return null;

  const threshold = Number(alert.threshold_usd);
  if (!Number.isFinite(threshold) || threshold <= 0) return null;

  const period = trim(alert.period) || 'total';
  const spent = spentForPeriod(period, amounts);
  if (spent < threshold) return null;

  const alertKey = trim(alert.id) || trim(alert.label) || `spend_${period}_${threshold}`;
  const tenantId = trim(ctx.tenantId);
  const workspaceId = trim(ctx.workspaceId);
  const severity = trim(alert.severity).toLowerCase() || 'warning';
  const action = trim(alert.action).toLowerCase();
  const message =
    trim(alert.label) ||
    `Spend alert: $${spent.toFixed(2)} reached threshold $${threshold.toFixed(2)} (${period})`;

  let deduped = false;
  try {
    const existing = await env.DB.prepare(
      `SELECT id FROM spend_alerts
        WHERE alert_key = ? AND workspace_id = ?
          AND resolved = 0
          AND datetime(created_at) >= datetime('now', '-24 hours')
        LIMIT 1`,
    )
      .bind(alertKey, workspaceId || null)
      .first();
    deduped = !!existing?.id;
    if (!deduped) {
      await env.DB.prepare(
        `INSERT INTO spend_alerts (
           id, alert_type, provider_slug, threshold_usd, actual_usd, period,
           message, severity, resolved, created_at, tenant_id, workspace_id, alert_key
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), ?, ?, ?)`,
      )
        .bind(
          `alert_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
          alertKey,
          'platform',
          threshold,
          spent,
          period,
          message,
          severity,
          tenantId || null,
          workspaceId || null,
          alertKey,
        )
        .run();
    }
  } catch (e) {
    console.warn('[workspace-spend-guard] spend_alerts insert', e?.message ?? e);
  }

  const notifyEmail = trim(alert.notify_email);
  const notifyVia = Array.isArray(alert.notify_via)
    ? alert.notify_via.map((v) => String(v).toLowerCase())
    : ['email'];
  if (!deduped && notifyVia.includes('email') && notifyEmail) {
    notifySam(
      env,
      {
        to: notifyEmail,
        subject: `[IAM Spend] ${message}`,
        body: [
          `Tenant: ${tenantId || '(unknown)'}`,
          `Workspace: ${workspaceId || '(unknown)'}`,
          `Period: ${period}`,
          `Spent: $${spent.toFixed(4)}`,
          `Threshold: $${threshold.toFixed(2)}`,
          `Severity: ${severity}`,
          action ? `Action: ${action}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        category: 'finance',
      },
      executionCtx,
    );
  }

  if (BLOCK_ACTIONS.has(action)) {
    return {
      ok: false,
      error: action === 'require_byok' ? 'tenant_platform_allowance_exhausted' : 'workspace_spend_cap',
      message:
        action === 'require_byok'
          ? `Platform AI allowance ($${threshold.toFixed(2)} ${period}) is used up — connect BYOK in Settings → Integrations to continue.`
          : `Workspace spend cap ($${threshold.toFixed(2)} ${period}) reached.`,
      spent_usd: spent,
      cap_usd: threshold,
      alert_key: alertKey,
    };
  }

  return { ok: true, alerted: true, alert_key: alertKey };
}

/**
 * Evaluate configured spend_alerts; optionally block when action requires it.
 * @param {any} env
 * @param {ExecutionContext|null|undefined} executionCtx
 * @param {Record<string, unknown>} ctx
 * @param {{ fireEmails?: boolean, checkBlock?: boolean }} [opts]
 */
export async function evaluateWorkspaceSpendAlerts(env, executionCtx, ctx, opts = {}) {
  const ws = trim(ctx.workspaceId);
  if (!env?.DB || !ws) return { ok: true };

  const limits = await loadWorkspaceSpendLimits(env, ws);
  if (!limits?.spend_alerts?.length) return { ok: true };

  const amounts = await getWorkspaceSpendAmounts(env, ctx);
  let blockResult = null;

  for (const raw of limits.spend_alerts) {
    const alert = raw && typeof raw === 'object' ? raw : {};
    const out = await maybeFireSpendAlert(env, executionCtx, alert, ctx, amounts);
    if (out && out.ok === false && opts.checkBlock !== false && !blockResult) {
      blockResult = out;
    }
  }

  if (blockResult) return blockResult;
  return { ok: true, amounts };
}

/**
 * Pre-dispatch spend gate: workspace_limits, user policy session/call caps, spend_alerts block actions.
 * @param {any} env
 * @param {Record<string, unknown>} ctx
 */
export async function assertWorkspaceSpendPolicy(env, ctx = {}) {
  if (ctx.isSuperadmin === true) return { ok: true, skipped: 'superadmin' };

  const tenantId = trim(ctx.tenantId);
  const workspaceId = trim(ctx.workspaceId);
  const userId = trim(ctx.userId);
  const sessionId = trim(ctx.sessionId);
  if (!tenantId || !workspaceId) return { ok: true };

  const amounts = await getWorkspaceSpendAmounts(env, { tenantId, workspaceId, userId, sessionId });
  const limits = await loadWorkspaceSpendLimits(env, workspaceId);
  const userPolicy = userId ? await loadAgentSamUserPolicy(env, userId, workspaceId) : null;

  if (limits?.max_daily_cost_usd != null && amounts.workspace_daily_usd >= limits.max_daily_cost_usd) {
    return {
      ok: false,
      error: 'workspace_daily_spend_cap',
      message: `Workspace daily spend cap ($${limits.max_daily_cost_usd.toFixed(2)}) reached.`,
      spent_usd: amounts.workspace_daily_usd,
      cap_usd: limits.max_daily_cost_usd,
    };
  }

  if (limits?.max_monthly_cost_usd != null && amounts.monthly_usd >= limits.max_monthly_cost_usd) {
    return {
      ok: false,
      error: 'workspace_monthly_spend_cap',
      message: `Workspace monthly spend cap ($${limits.max_monthly_cost_usd.toFixed(2)}) reached.`,
      spent_usd: amounts.monthly_usd,
      cap_usd: limits.max_monthly_cost_usd,
    };
  }

  if (
    limits?.platform_total_cap_usd != null &&
    !ctx.hasByok &&
    ctx.usesPlatformBilling !== false &&
    amounts.total_usd >= limits.platform_total_cap_usd
  ) {
    return {
      ok: false,
      error: 'tenant_platform_allowance_exhausted',
      message: `Platform AI allowance ($${limits.platform_total_cap_usd.toFixed(2)} total) is used up — connect BYOK in Settings → Integrations to continue.`,
      spent_usd: amounts.total_usd,
      cap_usd: limits.platform_total_cap_usd,
    };
  }

  if (userPolicy?.max_cost_per_session_usd != null) {
    const cap = Number(userPolicy.max_cost_per_session_usd);
    if (Number.isFinite(cap) && cap > 0 && sessionId && amounts.session_usd >= cap) {
      return {
        ok: false,
        error: 'session_spend_cap',
        message: `Session spend cap ($${cap.toFixed(2)}) reached for this workspace.`,
        spent_usd: amounts.session_usd,
        cap_usd: cap,
      };
    }
  }

  const est = Number(ctx.estimatedCallCostUsd);
  if (userPolicy?.max_cost_per_call_usd != null && Number.isFinite(est) && est > 0) {
    const cap = Number(userPolicy.max_cost_per_call_usd);
    if (Number.isFinite(cap) && cap > 0 && est > cap) {
      return {
        ok: false,
        error: 'call_spend_cap',
        message: `Estimated call cost ($${est.toFixed(4)}) exceeds per-call cap ($${cap.toFixed(2)}).`,
        cap_usd: cap,
      };
    }
  }

  const alertGate = await evaluateWorkspaceSpendAlerts(env, null, ctx, { checkBlock: true });
  if (alertGate.ok === false) return alertGate;

  return { ok: true, amounts, limits };
}

/**
 * Post-usage: fire warning emails / record spend_alerts (non-blocking).
 * @param {any} env
 * @param {ExecutionContext|null|undefined} executionCtx
 * @param {Record<string, unknown>} ctx
 */
export async function processWorkspaceSpendAlertsAfterUsage(env, executionCtx, ctx) {
  if (!env?.DB || ctx?.isSuperadmin === true) return;
  const workspaceId = trim(ctx.workspaceId);
  if (!workspaceId) return;
  try {
    await evaluateWorkspaceSpendAlerts(env, executionCtx, ctx, { checkBlock: false });
  } catch (e) {
    console.warn('[workspace-spend-guard] post-usage alerts', e?.message ?? e);
  }
}
