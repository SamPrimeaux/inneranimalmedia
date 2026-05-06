import { cronTenantId } from '../cron-tenant.js';
import { notifySam } from '../notify-sam.js';

/** Daily 09:00 UTC: compare spend_ledger today vs ai_guardrails metadata daily budget; email if over. */
export async function runFinancialCommandCron(env, ctx) {
  if (!env.DB) return;
  let dailyBudgetUsd = 50;
  try {
    const { results } = await env.DB.prepare(
      `SELECT metadata FROM ai_guardrails WHERE is_active = 1 ORDER BY priority DESC LIMIT 10`,
    ).all();
    for (const row of results || []) {
      if (!row?.metadata) continue;
      try {
        const m = JSON.parse(String(row.metadata));
        if (typeof m.daily_budget_usd === 'number') {
          dailyBudgetUsd = m.daily_budget_usd;
          break;
        }
        if (typeof m.daily_spend_cap_usd === 'number') {
          dailyBudgetUsd = m.daily_spend_cap_usd;
          break;
        }
      } catch (_) { /* next row */ }
    }
  } catch (e) {
    console.warn('[cron] financial guardrails read', e?.message ?? e);
  }
  try {
    const finTid = cronTenantId(env);
    if (!finTid) return;
    const row = await env.DB.prepare(
      `SELECT COALESCE(SUM(amount_usd), 0) AS total FROM spend_ledger
       WHERE tenant_id = ?
       AND date(occurred_at, 'unixepoch') = date('now')`,
    )
      .bind(finTid)
      .first();
    const total = Number(row?.total ?? 0);
    if (total > dailyBudgetUsd) {
      notifySam(
        env,
        {
          subject: `Daily spend alert: $${total.toFixed(2)} over cap $${dailyBudgetUsd.toFixed(2)}`,
          body: `Today's spend (spend_ledger): $${total.toFixed(2)}\nConfigured daily budget (ai_guardrails metadata): $${dailyBudgetUsd.toFixed(2)}\n`,
          category: 'finance',
        },
        ctx,
      );
    }
  } catch (e) {
    console.warn('[cron] runFinancialCommandCron', e?.message ?? e);
  }
}
