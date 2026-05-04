import { resolveApiKey } from '../core/vault.js';

export async function getIntegrationToken(DB, userId, provider, accountId) {
  if (!DB || !userId || !provider) return null;
  const aid = accountId != null ? String(accountId) : '';
  if (provider === 'github' && aid === '') {
    const row = await DB.prepare(
      `SELECT access_token, refresh_token, expires_at FROM user_oauth_tokens WHERE user_id = ? AND provider = 'github' ORDER BY account_identifier ASC LIMIT 1`
    ).bind(userId).first();
    return row || null;
  }
  const row = await DB.prepare(
    `SELECT access_token, refresh_token, expires_at FROM user_oauth_tokens WHERE user_id = ? AND provider = ? AND account_identifier = ?`
  ).bind(userId, provider, aid).first();
  return row || null;
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
