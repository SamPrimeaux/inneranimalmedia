/** Informal / UI ids that should resolve to catalog model_key rows. */
const INFORMAL_TO_CATALOG_KEY = {
  'claude-haiku-4.5': 'claude-haiku-4-5-20251001',
};

/**
 * True when the string is a Workers AI binding id (D1 / AI.run).
 * @param {string} s
 */
export function isWorkersAiBindingId(s) {
  return typeof s === 'string' && s.startsWith('@cf/');
}

/**
 * Map a provider's raw API model id to agentsam_model_catalog.model_key when possible.
 * Uses PRAGMA to detect optional id columns (anthropic_model_id, openai_model_id, workers_ai_model_id, etc.).
 *
 * Workers AI: prefers `workers_ai_model_id` on the catalog row (authoritative binding → single model_key).
 *
 * @param {import('@cloudflare/workers-types').D1Database | null | undefined} db
 * @param {string | null | undefined} provider
 * @param {string | null | undefined} rawModelId
 * @returns {Promise<{ modelKey: string | null, rawModelId: string | null }>}
 */
export async function resolveModelKeyFromProviderId(db, provider, rawModelId) {
  if (!db || rawModelId == null) return { modelKey: null, rawModelId: null };
  const originalRaw = String(rawModelId).trim();
  if (!originalRaw) return { modelKey: null, rawModelId: null };
  const informal = INFORMAL_TO_CATALOG_KEY[originalRaw.toLowerCase()];
  let lookup = informal || originalRaw;

  try {
    const { results } = await db.prepare(`PRAGMA table_info(agentsam_model_catalog)`).all();
    const colNames = new Set((results || []).map((r) => String(r.name).toLowerCase()));

    const trySelect = async (sql, bind) => {
      const row = await db.prepare(sql).bind(bind).first();
      return row?.model_key != null ? String(row.model_key).trim() : null;
    };

    const p = String(provider || '').toLowerCase();

    if (isWorkersAiBindingId(lookup) && colNames.has('workers_ai_model_id')) {
      const mk = await trySelect(
        `SELECT model_key FROM agentsam_model_catalog WHERE is_active = 1 AND workers_ai_model_id = ? LIMIT 1`,
        lookup,
      );
      if (mk) return { modelKey: mk, rawModelId: originalRaw };
    }

    if ((p.includes('anthropic') || p === 'claude') && colNames.has('anthropic_model_id')) {
      const mk = await trySelect(
        `SELECT model_key FROM agentsam_model_catalog WHERE is_active = 1 AND anthropic_model_id = ? LIMIT 1`,
        lookup,
      );
      if (mk) return { modelKey: mk, rawModelId: originalRaw };
    }
    if ((p.includes('openai') || p.includes('gpt')) && colNames.has('openai_model_id')) {
      const mk = await trySelect(
        `SELECT model_key FROM agentsam_model_catalog WHERE is_active = 1 AND openai_model_id = ? LIMIT 1`,
        lookup,
      );
      if (mk) return { modelKey: mk, rawModelId: originalRaw };
    }
    if ((p.includes('google') || p.includes('gemini')) && colNames.has('google_model_id')) {
      const mk = await trySelect(
        `SELECT model_key FROM agentsam_model_catalog WHERE is_active = 1 AND google_model_id = ? LIMIT 1`,
        lookup,
      );
      if (mk) return { modelKey: mk, rawModelId: originalRaw };
    }

    const byKey = await trySelect(
      `SELECT model_key FROM agentsam_model_catalog WHERE is_active = 1 AND model_key = ? LIMIT 1`,
      lookup,
    );
    if (byKey) return { modelKey: byKey, rawModelId: originalRaw };

    return { modelKey: null, rawModelId: originalRaw };
  } catch {
    return { modelKey: null, rawModelId: originalRaw };
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
