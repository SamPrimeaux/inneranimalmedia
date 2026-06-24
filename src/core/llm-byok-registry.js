/**
 * LLM BYOK — single source of truth: user_api_keys (+ user_secrets via vault_secret_id).
 * iam_user_llm_keys project_label is legacy fallback only.
 */

export const LLM_VAULT_SECRET_NAMES = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY'];

export const SECRET_NAME_TO_PROVIDER = {
  OPENAI_API_KEY: 'openai',
  ANTHROPIC_API_KEY: 'anthropic',
  GEMINI_API_KEY: 'google',
};

export const PROVIDER_TO_SECRET_NAME = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GEMINI_API_KEY',
  google_ai: 'GEMINI_API_KEY',
};

const LEGACY_VAULT_PROJECT = 'iam_user_llm_keys';

function maskFromLast4(secretName, last4) {
  const l4 = last4 || '????';
  if (secretName === 'ANTHROPIC_API_KEY') return `sk-ant-...${l4}`;
  if (secretName === 'OPENAI_API_KEY') return `sk-...${l4}`;
  if (secretName === 'GEMINI_API_KEY') return `AIza...${l4}`;
  return `••••${l4}`;
}

function lastFourFromRow(row) {
  if (row?.last_four != null && String(row.last_four).trim()) return String(row.last_four).trim();
  if (row?.key_preview) return String(row.key_preview).slice(-4);
  try {
    const m = JSON.parse(String(row.metadata_json || '{}'));
    if (m.last4) return String(m.last4);
  } catch {
    /* ignore */
  }
  return '????';
}

/**
 * Model picker BYOK status from user_api_keys (canonical).
 * @returns {Promise<Record<string, { configured: boolean, masked: string | null, secret_id: string | null, api_key_id: string | null, source: string }>>}
 */
export async function getTenantLlmByokStatus(env, { tenantId, userId }) {
  /** @type {Record<string, { configured: boolean, masked: string | null, secret_id: string | null, api_key_id: string | null, source: string }>} */
  const out = {};
  if (!env?.DB || !tenantId || !userId) {
    for (const n of LLM_VAULT_SECRET_NAMES) {
      out[n] = { configured: false, masked: null, secret_id: null, api_key_id: null, source: 'none' };
    }
    return out;
  }

  for (const secretName of LLM_VAULT_SECRET_NAMES) {
    const provider = SECRET_NAME_TO_PROVIDER[secretName];
    let configured = false;
    let masked = null;
    let secret_id = null;
    let api_key_id = null;
    let source = 'none';

    const apiRow = await env.DB.prepare(
      `SELECT id, vault_secret_id, key_preview, last_four, metadata_json
       FROM user_api_keys
       WHERE tenant_id = ? AND user_id = ? AND provider = ? AND COALESCE(is_active, 1) = 1
       LIMIT 1`,
    )
      .bind(tenantId, userId, provider)
      .first()
      .catch(() => null);

    if (apiRow?.id) {
      const last4 = lastFourFromRow(apiRow);
      configured = true;
      masked = maskFromLast4(secretName, last4);
      api_key_id = String(apiRow.id);
      secret_id =
        apiRow.vault_secret_id != null && String(apiRow.vault_secret_id).trim()
          ? String(apiRow.vault_secret_id).trim()
          : api_key_id;
      source = 'user_api_keys';
    } else {
      const legacy = await env.DB.prepare(
        `SELECT id, metadata_json FROM user_secrets
         WHERE tenant_id = ? AND user_id = ? AND secret_name = ? AND project_label = ? AND is_active = 1
         LIMIT 1`,
      )
        .bind(tenantId, userId, secretName, LEGACY_VAULT_PROJECT)
        .first()
        .catch(() => null);
      if (legacy?.id) {
        let last4 = '????';
        try {
          const m = JSON.parse(String(legacy.metadata_json || '{}'));
          if (m.last4) last4 = String(m.last4);
        } catch {
          /* ignore */
        }
        configured = true;
        masked = maskFromLast4(secretName, last4);
        secret_id = String(legacy.id);
        source = 'iam_user_llm_keys_legacy';
      }
    }

    out[secretName] = { configured, masked, secret_id, api_key_id, source };
  }
  return out;
}

/** @param {string} apiPlatform */
export function llmSecretNameForApiPlatform(apiPlatform) {
  const p = String(apiPlatform || '').trim().toLowerCase();
  if (p === 'openai' || p === 'cursor') return 'OPENAI_API_KEY';
  if (p === 'anthropic_api' || p === 'anthropic') return 'ANTHROPIC_API_KEY';
  if (p === 'gemini_api' || p === 'google_ai' || p === 'google_ai_studio' || p === 'vertex_ai') {
    return 'GEMINI_API_KEY';
  }
  return null;
}

export async function listLlmKeysFromUserApiKeys(env, tenantId, userId) {
  if (!env?.DB || !tenantId || !userId) return [];
  const providers = ['openai', 'anthropic', 'google'];
  const { results } = await env.DB.prepare(
    `SELECT id, provider, label, key_preview, last_four, metadata_json, created_at, updated_at
     FROM user_api_keys
     WHERE tenant_id = ? AND user_id = ? AND provider IN ('openai','anthropic','google')
       AND COALESCE(is_active, 1) = 1
     ORDER BY provider ASC`,
  )
    .bind(tenantId, userId)
    .all()
    .catch(() => ({ results: [] }));

  return (results || []).map((row) => {
    const provider = String(row.provider || '');
    const secretName = PROVIDER_TO_SECRET_NAME[provider] || provider;
    const last4 = lastFourFromRow(row);
    const kn = secretName;
    const masked =
      kn === 'OPENAI_API_KEY'
        ? `sk-...${last4}`
        : kn === 'ANTHROPIC_API_KEY'
          ? `sk-ant-...${last4}`
          : kn === 'GEMINI_API_KEY'
            ? `AIza...${last4}`
            : `••••${last4}`;
    const providerLabel =
      provider === 'openai'
        ? 'OpenAI'
        : provider === 'anthropic'
          ? 'Anthropic'
          : provider === 'google'
            ? 'Gemini'
            : provider;
    return {
      id: String(row.id),
      key_name: kn,
      provider: providerLabel,
      masked,
      last4,
      created_at: row.created_at ?? null,
      updated_at: row.updated_at ?? null,
      source: 'user_api_keys',
    };
  });
}
