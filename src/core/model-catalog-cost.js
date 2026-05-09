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
