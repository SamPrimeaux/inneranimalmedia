/**
 * Integration Layer: Token Resolution
 * Resolves API keys from D1 ai_models.secret_key_name → env secrets.
 * Provider-level fallbacks handle models where secret_key_name is null.
 */

const PROVIDER_KEY_MAP = {
  anthropic:  ['ANTHROPIC_API_KEY'],
  openai:     ['OPENAI_API_KEY'],
  gemini:     ['GEMINI_API_KEY', 'GOOGLE_AI_API_KEY'],
  google:     ['GOOGLE_AI_API_KEY', 'GEMINI_API_KEY'],
  vertex:     ['GOOGLE_SERVICE_ACCOUNT_JSON'],
  cursor:     ['CURSOR_API_KEY'],
  github:     ['GITHUB_TOKEN'],
  resend:     ['RESEND_API_KEY'],
  workers_ai: [], // env.AI binding — no API key
};

/**
 * Resolve API key for a specific model.
 * Checks ai_models.secret_key_name first, then falls back to provider default.
 */
export async function resolveModelApiKey(env, provider, modelKey) {
  if (!provider) return null;

  if (env.DB && modelKey) {
    try {
      const row = await env.DB.prepare(
        `SELECT secret_key_name FROM ai_models
         WHERE provider = ? AND model_key = ? AND is_active = 1 LIMIT 1`
      ).bind(provider, modelKey).first();
      if (row?.secret_key_name && env[row.secret_key_name]) {
        return env[row.secret_key_name];
      }
    } catch (_) {}
  }

  return getProviderDefaultKey(env, provider);
}

/**
 * Return the first available API key for a provider.
 */
export function getProviderDefaultKey(env, provider) {
  const keys = PROVIDER_KEY_MAP[provider] || [];
  for (const k of keys) {
    if (env[k]) return env[k];
  }
  return null;
}

/**
 * Direct env lookup by known secret name.
 */
export function getIntegrationToken(env, secretKeyName) {
  if (!secretKeyName || !env[secretKeyName]) return null;
  return env[secretKeyName];
}
