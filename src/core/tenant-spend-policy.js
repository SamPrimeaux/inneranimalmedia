/**
 * Tenant spend caps + BYOK flags from tenants.meta_json / tenants.settings.
 * Enforced at catalog dispatch and model billing gates.
 */

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

const TIER_RANK = {
  free: 0,
  nano: 1,
  mini: 2,
  standard: 3,
  pro: 4,
  opus: 5,
  max: 6,
};

function tierRank(label) {
  const k = trim(label).toLowerCase();
  return TIER_RANK[k] ?? 99;
}

/**
 * @param {any} env
 * @param {string|null|undefined} tenantId
 */
export async function loadTenantSpendPolicy(env, tenantId) {
  const tid = trim(tenantId);
  const empty = {
    tenant_id: tid || null,
    byok_required: false,
    max_model_tier: null,
    spend_cap_daily_usd: null,
    spend_cap_monthly_usd: null,
    spend_hard_stop: false,
  };
  if (!env?.DB || !tid) return empty;

  try {
    const row = await env.DB.prepare(
      `SELECT meta_json, settings FROM tenants WHERE id = ? LIMIT 1`,
    )
      .bind(tid)
      .first();
    if (!row) return empty;

    const meta = parseJsonSafe(row.meta_json, {}) || {};
    const settings = parseJsonSafe(row.settings, {}) || {};
    const spendCap = meta.spend_cap && typeof meta.spend_cap === 'object' ? meta.spend_cap : {};

    const byokRequired =
      spendCap.byok_required === true ||
      settings.byok_required === true ||
      settings.byok_required === 1;

    const maxTier = trim(settings.max_model_tier || spendCap.max_model_tier) || null;

    const daily =
      Number(settings.spend_cap_daily_usd ?? spendCap.daily_usd) > 0
        ? Number(settings.spend_cap_daily_usd ?? spendCap.daily_usd)
        : null;
    const monthly =
      Number(settings.spend_cap_monthly_usd ?? spendCap.monthly_usd) > 0
        ? Number(settings.spend_cap_monthly_usd ?? spendCap.monthly_usd)
        : null;

    const hardStop =
      settings.spend_hard_stop === true ||
      settings.spend_hard_stop === 1 ||
      spendCap.hard_stop === true;

    return {
      tenant_id: tid,
      byok_required: byokRequired,
      max_model_tier: maxTier,
      spend_cap_daily_usd: daily,
      spend_cap_monthly_usd: monthly,
      spend_hard_stop: hardStop,
    };
  } catch (e) {
    console.warn('[tenant-spend-policy] load', e?.message ?? e);
    return empty;
  }
}

/**
 * @param {any} env
 * @param {string} tenantId
 */
export async function getTenantSpendRollups(env, tenantId) {
  const tid = trim(tenantId);
  if (!env?.DB || !tid) return { daily_usd: 0, monthly_usd: 0 };

  const today = new Date().toISOString().slice(0, 10);
  const monthPrefix = today.slice(0, 7);

  try {
    const dailyRow = await env.DB.prepare(
      `SELECT COALESCE(SUM(cost_usd), 0) AS total
         FROM agentsam_usage_rollups_daily
        WHERE tenant_id = ? AND day = ?`,
    )
      .bind(tid, today)
      .first();

    const monthlyRow = await env.DB.prepare(
      `SELECT COALESCE(SUM(cost_usd), 0) AS total
         FROM agentsam_usage_rollups_daily
        WHERE tenant_id = ? AND day LIKE ?`,
    )
      .bind(tid, `${monthPrefix}%`)
      .first();

    return {
      daily_usd: Number(dailyRow?.total ?? 0) || 0,
      monthly_usd: Number(monthlyRow?.total ?? 0) || 0,
    };
  } catch {
    return { daily_usd: 0, monthly_usd: 0 };
  }
}

/**
 * @param {Awaited<ReturnType<typeof loadTenantSpendPolicy>>} policy
 * @param {string|null|undefined} modelKey
 * @param {string|null|undefined} modelTier — agentsam_model_catalog.tier when known
 */
export function assertTenantModelTierAllowed(policy, modelKey, modelTier) {
  const ceiling = trim(policy?.max_model_tier);
  if (!ceiling) return { ok: true };

  let tier = trim(modelTier);
  if (!tier && modelKey) {
    const mk = trim(modelKey).toLowerCase();
    if (mk.includes('nano')) tier = 'nano';
    else if (mk.includes('mini')) tier = 'mini';
    else if (mk.includes('opus')) tier = 'opus';
    else if (mk.includes('pro')) tier = 'pro';
  }
  if (!tier) return { ok: true };

  if (tierRank(tier) > tierRank(ceiling)) {
    return {
      ok: false,
      error: 'tenant_model_tier_exceeded',
      message: `Model tier "${tier}" exceeds tenant ceiling "${ceiling}"`,
      max_model_tier: ceiling,
    };
  }
  return { ok: true };
}

/**
 * Block platform-billed model/API usage when tenant requires BYOK or spend caps exceeded.
 * @param {any} env
 * @param {{
 *   tenantId?: string|null,
 *   userId?: string|null,
 *   isSuperadmin?: boolean,
 *   billingSource?: string|null,
 *   modelKey?: string|null,
 *   modelTier?: string|null,
 *   authSource?: string|null,
 * }} ctx
 */
export async function assertTenantSpendPolicy(env, ctx = {}) {
  if (ctx.isSuperadmin === true) return { ok: true, skipped: 'superadmin' };

  const tid = trim(ctx.tenantId);
  if (!tid) return { ok: true };

  const policy = await loadTenantSpendPolicy(env, tid);

  if (ctx.modelKey || ctx.modelTier) {
    const tierGate = assertTenantModelTierAllowed(policy, ctx.modelKey, ctx.modelTier);
    if (!tierGate.ok) return tierGate;
  }

  const authSource = trim(ctx.authSource).toLowerCase();
  const billingSource = trim(ctx.billingSource).toLowerCase();
  const usesPlatformKeys =
    authSource === 'platform' ||
    authSource === 'platform_scoped' ||
    billingSource === 'platform_subscription' ||
    billingSource === 'platform_workers_ai';

  if (policy.byok_required && usesPlatformKeys) {
    return {
      ok: false,
      error: 'tenant_byok_required',
      message:
        'This tenant requires BYOK — add your API keys in Settings → Integrations before using platform models or tools.',
      tenant_id: tid,
    };
  }

  if (!policy.spend_hard_stop) return { ok: true, policy };

  const rollups = await getTenantSpendRollups(env, tid);
  if (policy.spend_cap_daily_usd != null && rollups.daily_usd >= policy.spend_cap_daily_usd) {
    return {
      ok: false,
      error: 'tenant_spend_cap_daily',
      message: `Daily AI spend cap ($${policy.spend_cap_daily_usd.toFixed(2)}) reached for this tenant.`,
      spent_usd: rollups.daily_usd,
      cap_usd: policy.spend_cap_daily_usd,
    };
  }
  if (policy.spend_cap_monthly_usd != null && rollups.monthly_usd >= policy.spend_cap_monthly_usd) {
    return {
      ok: false,
      error: 'tenant_spend_cap_monthly',
      message: `Monthly AI spend cap ($${policy.spend_cap_monthly_usd.toFixed(2)}) reached for this tenant.`,
      spent_usd: rollups.monthly_usd,
      cap_usd: policy.spend_cap_monthly_usd,
    };
  }

  return { ok: true, policy, rollups };
}
