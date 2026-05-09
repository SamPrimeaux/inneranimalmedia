/**
 * Map a provider's raw API model id to agentsam_model_catalog.model_key when possible.
 * Uses PRAGMA to detect optional anthropic_model_id / openai_model_id columns.
 *
 * @param {import('@cloudflare/workers-types').D1Database | null | undefined} db
 * @param {string | null | undefined} provider
 * @param {string | null | undefined} rawModelId
 * @returns {Promise<{ modelKey: string | null, rawModelId: string | null }>}
 */
export async function resolveModelKeyFromProviderId(db, provider, rawModelId) {
  if (!db || rawModelId == null) return { modelKey: null, rawModelId: null };
  const raw = String(rawModelId).trim();
  if (!raw) return { modelKey: null, rawModelId: null };
  const p = String(provider || '').toLowerCase();
  try {
    const { results } = await db.prepare(`PRAGMA table_info(agentsam_model_catalog)`).all();
    const colNames = new Set((results || []).map((r) => String(r.name).toLowerCase()));

    const trySelect = async (sql, bind) => {
      const row = await db.prepare(sql).bind(bind).first();
      return row?.model_key != null ? String(row.model_key).trim() : null;
    };

    if ((p.includes('anthropic') || p === 'claude') && colNames.has('anthropic_model_id')) {
      const mk = await trySelect(
        `SELECT model_key FROM agentsam_model_catalog WHERE is_active = 1 AND anthropic_model_id = ? LIMIT 1`,
        raw,
      );
      if (mk) return { modelKey: mk, rawModelId: raw };
    }
    if ((p.includes('openai') || p.includes('gpt')) && colNames.has('openai_model_id')) {
      const mk = await trySelect(
        `SELECT model_key FROM agentsam_model_catalog WHERE is_active = 1 AND openai_model_id = ? LIMIT 1`,
        raw,
      );
      if (mk) return { modelKey: mk, rawModelId: raw };
    }

    const byKey = await trySelect(
      `SELECT model_key FROM agentsam_model_catalog WHERE is_active = 1 AND model_key = ? LIMIT 1`,
      raw,
    );
    if (byKey) return { modelKey: byKey, rawModelId: raw };

    return { modelKey: null, rawModelId: raw };
  } catch {
    return { modelKey: null, rawModelId: raw };
  }
}

/**
 * Estimate USD spend from agentsam_model_catalog (cost_per_1k_in / cost_per_1k_out).
 * Returns 0 when the model row is missing or DB errors.
 *
 * @param {import('@cloudflare/workers-types').D1Database | null | undefined} db
 * @param {string | null | undefined} modelKey
 * @param {number | null | undefined} inputTokens
 * @param {number | null | undefined} outputTokens
 */
export async function estimateCostUsdFromCatalog(db, modelKey, inputTokens, outputTokens) {
  if (!db || modelKey == null) return 0;
  const mk = String(modelKey).trim();
  if (!mk) return 0;
  try {
    const row = await db
      .prepare(
        `SELECT cost_per_1k_in, cost_per_1k_out
         FROM agentsam_model_catalog
         WHERE model_key = ? AND is_active = 1
         LIMIT 1`,
      )
      .bind(mk)
      .first();
    if (!row) return 0;
    const tin = Math.floor(Number(inputTokens) || 0);
    const tout = Math.floor(Number(outputTokens) || 0);
    return (
      (tin * (Number(row.cost_per_1k_in) || 0)) / 1000 + (tout * (Number(row.cost_per_1k_out) || 0)) / 1000
    );
  } catch {
    return 0;
  }
}
