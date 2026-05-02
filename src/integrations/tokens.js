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

export async function resolveModelApiKey(env, provider, modelKey) {
  const p = String(provider || '').trim().toLowerCase();
  if (p === 'openai' && env?.OPENAI_API_KEY) return env.OPENAI_API_KEY;
  if (p === 'anthropic' && env?.ANTHROPIC_API_KEY) return env.ANTHROPIC_API_KEY;
  if ((p === 'google' || p === 'gemini') && (env?.GOOGLE_AI_API_KEY || env?.GEMINI_API_KEY)) {
    return env.GOOGLE_AI_API_KEY || env.GEMINI_API_KEY;
  }
  if (env?.DB && modelKey) {
    try {
      const row = await env.DB.prepare(
        `SELECT secret_key_name
         FROM ai_models
         WHERE (provider = ? OR api_platform = ? OR model_key = ?)
         ORDER BY COALESCE(is_active, 1) DESC
         LIMIT 1`
      ).bind(provider, provider, modelKey).first();
      const keyName = row?.secret_key_name ? String(row.secret_key_name).trim() : '';
      if (keyName && env[keyName]) return env[keyName];
    } catch (_) {
      // fallback below
    }
  }
  return null;
}
