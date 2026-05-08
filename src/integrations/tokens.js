import { resolveApiKey } from '../core/vault.js';
import { getIntegrationOAuthRow } from '../core/user-oauth-token.js';

/**
 * OAuth row for integration routes (GitHub, Google Drive, etc.):
 * vault / encrypted / plaintext token resolution and Google refresh when expired.
 * @param {object} env Worker env (DB + secrets for decrypt/refresh)
 */
export async function getIntegrationToken(env, userId, provider, accountId) {
  if (!env?.DB || !userId || !provider) return null;
  const aid = accountId != null ? String(accountId) : '';
  return getIntegrationOAuthRow(env, userId, provider, aid);
}

export async function resolveModelApiKey(env, provider, modelKey, userId) {
  const p = String(provider || '').trim().toLowerCase();
  const uid = userId != null && String(userId).trim() !== '' ? String(userId).trim() : null;

  const defaultName =
    p === 'openai' ? 'OPENAI_API_KEY' :
    p === 'anthropic' ? 'ANTHROPIC_API_KEY' :
    (p === 'google' || p === 'gemini') ? 'GOOGLE_AI_API_KEY' : null;

  if (defaultName) {
    const fromDefault = await resolveApiKey(env, uid, defaultName);
    if (fromDefault) return fromDefault;
    if (p === 'google' || p === 'gemini') {
      const geminiAlias = await resolveApiKey(env, uid, 'GEMINI_API_KEY');
      if (geminiAlias) return geminiAlias;
    }
  }

  if (env?.DB && modelKey) {
    try {
      const row = await env.DB.prepare(
        `SELECT secret_key_name
         FROM agentsam_ai
         WHERE (provider = ? OR api_platform = ? OR model_key = ?)
         ORDER BY COALESCE(is_active, 1) DESC
         LIMIT 1`
      ).bind(provider, provider, modelKey).first();
      const keyName = row?.secret_key_name ? String(row.secret_key_name).trim() : '';
      if (keyName) {
        const fromRow = await resolveApiKey(env, uid, keyName);
        if (fromRow) return fromRow;
      }
    } catch (_) {
      /* no row */
    }
  }
  return null;
}
