/**
 * Prompt cache economics — read savings write-back + compaction feedback loop.
 */

import { pragmaTableInfo } from './retention.js';

/** Rough USD saved per cached token read (~90% discount on input pricing). */
const SAVINGS_PER_CACHED_TOKEN_USD = 0.0000025;

/**
 * @param {number} tokenCount
 */
export function estimateCachedReadSavingsUsd(tokenCount) {
  const n = Math.max(0, Math.floor(Number(tokenCount) || 0));
  return Math.round(n * SAVINGS_PER_CACHED_TOKEN_USD * 1e6) / 1e6;
}

/**
 * @param {unknown} layerKeys
 */
function estimateTokenCountFromLayers(layerKeys) {
  try {
    const raw = typeof layerKeys === 'string' ? layerKeys : JSON.stringify(layerKeys ?? []);
    return Math.max(1, Math.ceil(raw.length / 4));
  } catch {
    return 1;
  }
}

/**
 * @param {any} env
 * @param {string} tenantId
 * @param {unknown} layerKeys
 * @param {string|null} routeKey
 * @param {string|null} provider
 * @param {string|null} modelKey
 * @param {number} [tokenCount]
 */
export async function logPromptCacheUsage(
  env,
  tenantId,
  layerKeys,
  routeKey,
  provider,
  modelKey,
  tokenCount,
) {
  if (!env?.DB || !layerKeys?.length) return;

  const cols = await pragmaTableInfo(env.DB, 'agentsam_prompt_cache_keys');
  if (!cols.size) return;

  try {
    const layerKeysJson = JSON.stringify(layerKeys);
    const hashInput = `${tenantId || 'global'}:${layerKeysJson}`;
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(hashInput));
    const hash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const tokens = Math.max(1, Math.floor(Number(tokenCount) || estimateTokenCountFromLayers(layerKeys)));
    const savingsDelta = estimateCachedReadSavingsUsd(tokens);

    const existing = await env.DB.prepare(
      `SELECT id, COALESCE(token_count, 0) AS token_count FROM agentsam_prompt_cache_keys
       WHERE cache_key_hash = ? AND tenant_id = ?
       LIMIT 1`,
    )
      .bind(hash, tenantId || '')
      .first()
      .catch(() => null);

    if (existing?.id) {
      const rowTokens = Math.max(tokens, Number(existing.token_count) || 0);
      const delta = estimateCachedReadSavingsUsd(rowTokens);
      await env.DB.prepare(
        `UPDATE agentsam_prompt_cache_keys
         SET read_count = COALESCE(read_count, 0) + 1,
             last_read_at = datetime('now'),
             token_count = CASE WHEN COALESCE(token_count, 0) < ? THEN ? ELSE token_count END,
             total_read_savings_usd = COALESCE(total_read_savings_usd, 0) + ?
         WHERE id = ?`,
      )
        .bind(rowTokens, rowTokens, delta, existing.id)
        .run();
    } else {
      const insertCols = ['tenant_id', 'provider', 'model_key', 'cache_key_hash'];
      const binds = [tenantId || '', provider || 'unknown', modelKey || 'unknown', hash];
      if (cols.has('token_count')) {
        insertCols.push('token_count');
        binds.push(tokens);
      }
      if (cols.has('read_count')) {
        insertCols.push('read_count');
        binds.push(1);
      }
      if (cols.has('last_read_at')) {
        insertCols.push('last_read_at');
        binds.push(new Date().toISOString().slice(0, 19).replace('T', ' '));
      }
      if (cols.has('total_read_savings_usd')) {
        insertCols.push('total_read_savings_usd');
        binds.push(savingsDelta);
      }
      if (cols.has('route_key') && routeKey) {
        insertCols.push('route_key');
        binds.push(routeKey);
      }
      await env.DB.prepare(
        `INSERT INTO agentsam_prompt_cache_keys (${insertCols.join(', ')})
         VALUES (${insertCols.map(() => '?').join(', ')})`,
      )
        .bind(...binds)
        .run();
    }
  } catch (e) {
    console.warn('[prompt-cache-economics] logPromptCacheUsage', e?.message ?? e);
  }
}

/**
 * After compaction — credit cache hit when system prompt hash already exists.
 * @param {any} env
 * @param {{ tenantId: string, cacheKeyHash?: string|null, tokensSaved?: number }} opts
 */
export async function bumpPromptCacheOnCompaction(env, opts) {
  const tenantId = String(opts.tenantId || '').trim();
  const hash = String(opts.cacheKeyHash || '').trim();
  if (!env?.DB || !tenantId || !hash) return;

  const cols = await pragmaTableInfo(env.DB, 'agentsam_prompt_cache_keys');
  if (!cols.has('cache_key_hash')) return;

  const existing = await env.DB.prepare(
    `SELECT id, COALESCE(token_count, 0) AS token_count FROM agentsam_prompt_cache_keys
     WHERE cache_key_hash = ? AND tenant_id = ?
     LIMIT 1`,
  )
    .bind(hash, tenantId)
    .first()
    .catch(() => null);

  if (!existing?.id) return;

  const tokens = Math.max(
    Number(existing.token_count) || 0,
    Math.floor(Number(opts.tokensSaved) || 0),
  );
  const delta = estimateCachedReadSavingsUsd(tokens || 1);

  await env.DB.prepare(
    `UPDATE agentsam_prompt_cache_keys
     SET read_count = COALESCE(read_count, 0) + 1,
         last_read_at = datetime('now'),
         total_read_savings_usd = COALESCE(total_read_savings_usd, 0) + ?
     WHERE id = ?`,
  )
    .bind(delta, existing.id)
    .run()
    .catch((e) => console.warn('[prompt-cache-economics] compaction bump', e?.message ?? e));
}
