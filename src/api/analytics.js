/**
 * Consolidated analytics reads for finance/overview dashboards (D1 + Supabase REST).
 *
 * ISOLATION: buildFinanceAnalyticsExtension is called from /api/finance/summary.
 * That endpoint is now superadmin-gated in finance.js — this module assumes the
 * caller has already verified superadmin. Non-superadmin callers get the safe
 * scoped payload from handleFinanceSummary directly and never reach this module.
 */
import { supabaseGetJson } from './health/supabaseRest.js';

/** @param {import('@cloudflare/workers-types').D1Database} db */
async function d1All(db, sql, binds = []) {
  if (!db) return [];
  try {
    const { results } = await db.prepare(sql).bind(...binds).all();
    return results || [];
  } catch {
    return [];
  }
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
async function d1First(db, sql, binds = []) {
  if (!db) return null;
  try {
    return await db.prepare(sql).bind(...binds).first();
  } catch {
    return null;
  }
}

/**
 * Enrichment payload merged into GET /api/finance/summary (best-effort; never throws).
 * SUPERADMIN ONLY — caller must enforce before invoking.
 * @param {any} env
 * @param {string|null} tenantId
 */
export async function buildFinanceAnalyticsExtension(env, tenantId = null) {
  const db = env?.DB;
  const tid = tenantId && String(tenantId).trim() ? String(tenantId).trim() : null;
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const monthStartSec = Math.floor(new Date(`${monthStart}T00:00:00Z`).getTime() / 1000);

  const mrrRow = tid
    ? await d1First(
        db,
        `SELECT COALESCE(SUM(
        CAST(json_extract(bp.features_json, '$.public_pricing.usd_monthly') AS REAL)
      ), 0) AS mrr
     FROM billing_subscriptions bs
     JOIN billing_plans bp ON bp.id = bs.plan_id
     WHERE LOWER(COALESCE(bs.status,'')) IN ('active','trialing') AND bs.tenant_id = ?`,
        [tid],
      )
    : { mrr: 0 };

  const total_spend_month = await d1First(
    db,
    `SELECT COALESCE(SUM(ABS(amount)),0) AS v FROM financial_transactions
     WHERE transaction_date >= ? AND amount < 0`,
    [monthStart],
  );

  const usageMonth = await d1First(
    db,
    `SELECT COALESCE(SUM(COALESCE(cost_usd,0)),0) AS v, COALESCE(SUM(COALESCE(total_tokens,0)),0) AS tokens
     FROM agentsam_usage_events
     WHERE COALESCE(created_at,0) >= ?`,
    [monthStartSec],
  );

  // founder_metrics scoped to tenantId — never returned without it
  const founder = tid
    ? await d1All(
        db,
        `SELECT date, energy_level, stress_level, sleep_hours, notes
         FROM founder_metrics WHERE tenant_id = ? ORDER BY date DESC LIMIT 14`,
        [tid],
      )
    : [];

  const [snapshots, forecasts, routing] = await Promise.all([
    supabaseGetJson(
      env,
      `/rest/v1/agentsam_model_cost_snapshots?select=*&order=captured_at.desc.nullslast&limit=120`,
      'public',
    ),
    supabaseGetJson(env, `/rest/v1/cost_forecasts?select=*&order=forecast_date.desc.nullslast&limit=30`, 'public'),
    supabaseGetJson(
      env,
      `/rest/v1/agentsam_routing_decisions?select=model,model_key,provider,estimated_cost_usd,created_at&order=created_at.desc.nullslast&limit=200`,
      'public',
    ),
  ]);

  const snapRows = Array.isArray(snapshots.data) ? snapshots.data : [];
  const cost_by_model = [];
  const cm = new Map();
  for (const r of snapRows) {
    const model = String(r.model ?? r.model_key ?? 'unknown').trim() || 'unknown';
    cm.set(model, (cm.get(model) || 0) + (Number(r.cost_usd ?? r.total_cost_usd ?? 0) || 0));
  }
  for (const [model, cost_usd] of cm.entries()) {
    cost_by_model.push({ model, cost_usd: Math.round(cost_usd * 10000) / 10000 });
  }
  cost_by_model.sort((a, b) => b.cost_usd - a.cost_usd);

  const forecast = Array.isArray(forecasts.data) ? forecasts.data : [];
  const routRows = Array.isArray(routing.data) ? routing.data : [];

  const trendMap = new Map();
  for (const r of routRows) {
    const day = String(r.created_at || '').slice(0, 10);
    if (!day || day.length < 10) continue;
    trendMap.set(day, (trendMap.get(day) || 0) + (Number(r.estimated_cost_usd ?? r.cost_usd ?? 0) || 0));
  }
  const token_spend_trend = [...trendMap.entries()]
    .map(([day, cost_usd]) => ({ day, cost_usd: Math.round(cost_usd * 10000) / 10000 }))
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(-30);

  let billing_plan = null;
  try {
    const bp = await d1First(
      db,
      `SELECT id, COALESCE(display_name, name) AS name, billing_period, monthly_token_limit
       FROM billing_plans WHERE COALESCE(is_active,1)=1 ORDER BY COALESCE(sort_order,999) LIMIT 1`,
    );
    billing_plan = bp;
  } catch {
    billing_plan = null;
  }

  return {
    mrr: Number(mrrRow?.mrr ?? 0) || 0,
    total_spend_month: Number(total_spend_month?.v ?? 0) || 0,
    ai_cost_month: Number(usageMonth?.v ?? 0) || 0,
    cost_by_model,
    forecast,
    billing_plan,
    token_spend_trend,
    founder_metrics_recent: founder,
    tokens_month: Number(usageMonth?.tokens ?? 0) || 0,
  };
}
