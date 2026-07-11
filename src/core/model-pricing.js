/**
 * First-class model pricing — agentsam_model_pricing (canonical) with fallbacks.
 * Canonical Anthropic model_key === API model id (e.g. claude-haiku-4-5-20251001).
 */

import { pragmaTableInfo } from './retention.js';
import {
  computeUsdFromAgentsamAiRates,
  estimateCostUsdFromCatalog,
  loadAgentsamAiPricingRow,
  mergeAgentsamAiPricingExtras,
} from './model-catalog-cost.js';

/** Legacy logical keys → Anthropic API model id (routing/catalog migration). */
export const ANTHROPIC_ALIAS_TO_CANONICAL = Object.freeze({
  anthropic_haiku_4_5: 'claude-haiku-4-5-20251001',
  anthropic_sonnet_4_6: 'claude-sonnet-4-6',
  anthropic_opus_4_7: 'claude-opus-4-7',
  anthropic_opus_4_8: 'claude-opus-4-8',
  'claude-haiku-4-5': 'claude-haiku-4-5-20251001',
  'anthropic/claude-opus-4.7': 'claude-opus-4-7',
  'anthropic/claude-opus-4.8': 'claude-opus-4-8',
  'wai-claude-opus-4-7': 'claude-opus-4-7',
  'wai-claude-opus-4-8': 'claude-opus-4-8',
  'claude-opus-4-8': 'claude-opus-4-8',
});

export const CANONICAL_ANTHROPIC_MODEL_KEYS = Object.freeze([
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-6',
  'claude-opus-4-6',
  'claude-opus-4-7',
  'claude-opus-4-8',
]);

/**
 * @param {string | null | undefined} modelKey
 * @param {string | null | undefined} [provider]
 */
export function resolveCanonicalModelKey(modelKey, provider) {
  const mk = modelKey != null ? String(modelKey).trim() : '';
  if (!mk) return mk;
  const alias = ANTHROPIC_ALIAS_TO_CANONICAL[mk];
  if (alias) return alias;
  const p = String(provider || '').toLowerCase();
  if (p.includes('anthropic') || mk.startsWith('claude-')) {
    return ANTHROPIC_ALIAS_TO_CANONICAL[mk] || mk;
  }
  return mk;
}

/**
 * Infer provider for pricing lookup.
 * @param {string | null | undefined} modelKey
 * @param {string | null | undefined} [provider]
 */
export function inferPricingProvider(modelKey, provider) {
  const p = provider != null ? String(provider).trim().toLowerCase() : '';
  if (p) return p.includes('anthropic') || p === 'claude' ? 'anthropic' : p;
  const mk = String(modelKey || '').toLowerCase();
  if (mk.startsWith('claude-') || ANTHROPIC_ALIAS_TO_CANONICAL[modelKey]) return 'anthropic';
  if (mk.startsWith('gpt-') || mk.includes('openai')) return 'openai';
  if (mk.includes('gemini')) return 'google';
  return 'unknown';
}

/**
 * @param {import('@cloudflare/workers-types').D1Database | null | undefined} db
 */
export async function hasModelPricingTable(db) {
  if (!db) return false;
  const cols = await pragmaTableInfo(db, 'agentsam_model_pricing');
  return cols.has('model_key') && cols.has('input_rate_per_mtok');
}

/**
 * Active pricing row from agentsam_model_pricing.
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ provider: string, modelKey: string, pricingKind?: string, asOfIso?: string }} q
 */
export async function loadModelPricingRow(db, q) {
  if (!db || !(await hasModelPricingTable(db))) return null;
  const provider = String(q.provider || '').trim().toLowerCase();
  const modelKey = resolveCanonicalModelKey(q.modelKey, provider);
  const pricingKind = q.pricingKind != null ? String(q.pricingKind).trim() : 'standard';
  if (!provider || !modelKey) return null;

  try {
    const row = await db
      .prepare(
        `SELECT *
         FROM agentsam_model_pricing
         WHERE provider = ?
           AND model_key = ?
           AND pricing_kind = ?
           AND is_active = 1
           AND datetime(effective_from) <= datetime('now')
           AND (effective_to IS NULL OR effective_to = '' OR datetime(effective_to) > datetime('now'))
         ORDER BY effective_from DESC
         LIMIT 1`,
      )
      .bind(provider, modelKey, pricingKind)
      .first();
    return row || null;
  } catch (e) {
    console.warn('[model-pricing] loadModelPricingRow failed', provider, modelKey, e?.message ?? e);
    return null;
  }
}

/**
 * USD cost from agentsam_model_pricing row (COALESCE rates; split 5m/1h cache write).
 * @param {Record<string, unknown> | null | undefined} row
 * @param {{
 *   inputTokens?: number,
 *   outputTokens?: number,
 *   cacheReadTokens?: number,
 *   cacheWriteTokens?: number,
 *   cacheWriteTtl?: string,
 *   pricingKind?: string,
 * }} u
 */
export function computeUsdFromModelPricingRow(row, u = {}) {
  if (!row) return 0;

  const kind = String(u.pricingKind || row.pricing_kind || 'standard').trim().toLowerCase();
  const num = (v, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  let inR = num(row.input_rate_per_mtok);
  let outR = num(row.output_rate_per_mtok);
  if (kind === 'batch') {
    inR = num(row.batch_input_rate_per_mtok, inR);
    outR = num(row.batch_output_rate_per_mtok, outR);
  }
  if (kind === 'fast' && num(row.fast_mode_input_rate_per_mtok) > 0) {
    inR = num(row.fast_mode_input_rate_per_mtok);
    outR = num(row.fast_mode_output_rate_per_mtok, outR);
  }

  const cr = num(row.cache_read_rate_per_mtok);
  const cw5 = num(row.cache_write_5m_rate_per_mtok);
  const cw1h = num(row.cache_write_1h_rate_per_mtok);

  const rawIn = num(u.inputTokens);
  const crTok = num(u.cacheReadTokens);
  const cwTok = num(u.cacheWriteTokens);
  const outTok = num(u.outputTokens);

  const uncachedIn = Math.max(0, rawIn - crTok - cwTok);

  const ttl = String(u.cacheWriteTtl || '5m').trim().toLowerCase();
  const cw5Tok = ttl === '1h' ? 0 : cwTok;
  const cw1hTok = ttl === '1h' ? cwTok : 0;

  return (
    uncachedIn * inR +
    outTok * outR +
    crTok * cr +
    cw5Tok * cw5 +
    cw1hTok * cw1h
  ) / 1_000_000;
}

/**
 * Preferred cost estimate: agentsam_model_pricing → agentsam_ai → catalog → 0 + warn.
 * @param {import('@cloudflare/workers-types').D1Database | null | undefined} db
 * @param {{
 *   modelKey: string,
 *   provider?: string,
 *   pricingKind?: string,
 *   inputTokens?: number,
 *   outputTokens?: number,
 *   cacheReadTokens?: number,
 *   cacheWriteTokens?: number,
 *   cacheWriteTtl?: string,
 * }} u
 * @returns {Promise<{ costUsd: number, source: string, canonicalModelKey: string }>}
 */
export async function estimateModelRunCostUsd(db, u) {
  const provider = inferPricingProvider(u.modelKey, u.provider);
  const canonicalModelKey = resolveCanonicalModelKey(u.modelKey, provider);
  const tokenOpts = {
    inputTokens: u.inputTokens,
    outputTokens: u.outputTokens,
    cacheReadTokens: u.cacheReadTokens,
    cacheWriteTokens: u.cacheWriteTokens,
    cacheWriteTtl: u.cacheWriteTtl ?? '5m',
    pricingKind: u.pricingKind ?? 'standard',
  };

  if (db) {
    const pricing = await loadModelPricingRow(db, {
      provider,
      modelKey: canonicalModelKey,
      pricingKind: tokenOpts.pricingKind,
    });
    if (pricing) {
      return {
        costUsd: computeUsdFromModelPricingRow(pricing, tokenOpts),
        source: 'agentsam_model_pricing',
        canonicalModelKey,
      };
    }

    const aiRow = await loadAgentsamAiPricingRow(db, canonicalModelKey);
    if (aiRow) {
      return {
        costUsd: computeUsdFromAgentsamAiRates(aiRow, tokenOpts),
        source: 'agentsam_ai',
        canonicalModelKey,
      };
    }

    const catalogCost = await estimateCostUsdFromCatalog(
      db,
      canonicalModelKey,
      tokenOpts.inputTokens,
      tokenOpts.outputTokens,
    );
    if (catalogCost > 0) {
      return { costUsd: catalogCost, source: 'agentsam_model_catalog', canonicalModelKey };
    }
  }

  console.warn(
    '[model-pricing] no rates for model',
    JSON.stringify({ model_key: u.modelKey, canonical: canonicalModelKey, provider }),
  );
  return { costUsd: 0, source: 'missing', canonicalModelKey };
}

/**
 * Thompson / routing: estimated USD for an arm pick (uses same pricing spine as telemetry).
 * @param {import('@cloudflare/workers-types').D1Database | null | undefined} db
 * @param {{ modelKey: string, provider?: string, estimatedInputTokens?: number, estimatedOutputTokens?: number }} q
 */
export async function estimateRoutingArmCostHint(db, q) {
  const estIn = Math.max(0, Number(q.estimatedInputTokens) || 4000);
  const estOut = Math.max(0, Number(q.estimatedOutputTokens) || 800);
  const { costUsd, canonicalModelKey } = await estimateModelRunCostUsd(db, {
    modelKey: q.modelKey,
    provider: q.provider,
    inputTokens: estIn,
    outputTokens: estOut,
  });
  return { costUsd, canonicalModelKey, estimatedInputTokens: estIn, estimatedOutputTokens: estOut };
}

/**
 * Thompson / agentsam_routing_arms integration (operational, not auto-wired in bandit yet):
 * - arms.model_key must match agentsam_model_catalog + agentsam_ai (canonical API ids).
 * - resolveCanonicalModelKey() maps legacy alias keys at read time until D1 is clean.
 * - estimateRoutingArmCostHint() supplies USD hints for future cost-aware sampling; today
 *   applyRoutingArmUsageFeedback() still learns from realized telemetry costUsd.
 * - Batch/fast: pass pricingKind='batch' only when the run used Batch API; fast mode requires
 *   explicit owner gate — never infer from supports_fast_mode alone.
 */
