/**
 * OpenAI platform credential selection — additive AGENTSAMGPT_SERVICEKEY tier.
 * OPENAI_API_KEY remains default for all existing catalog keys; GPT-5.5 / codex opt in here.
 */

import { resolveApiKey } from '../core/vault.js';

export const OPENAI_PLATFORM_DEFAULT_SECRET = 'OPENAI_API_KEY';
/** Wrangler secret — Codex / GPT-5.5 subagent tier (not a replacement for OPENAI_API_KEY). */
export const OPENAI_AGENTSAM_GPT_TIER_SECRET = 'AGENTSAMGPT_SERVICEKEY';

/**
 * Which Wrangler / user_secrets name to use for an OpenAI call.
 * @param {string|null|undefined} modelKey — agentsam_model_catalog.model_key
 * @param {string|null|undefined} catalogSecretKeyName — agentsam_ai.secret_key_name when set
 */
export function resolveOpenAiSecretKeyName(modelKey, catalogSecretKeyName = null) {
  const fromCatalog =
    catalogSecretKeyName != null ? String(catalogSecretKeyName).trim() : '';
  if (fromCatalog) return fromCatalog;

  const mk = String(modelKey || '').trim().toLowerCase();
  if (!mk) return OPENAI_PLATFORM_DEFAULT_SECRET;
  if (mk.startsWith('gpt-5.5') || mk.includes('codex')) {
    return OPENAI_AGENTSAM_GPT_TIER_SECRET;
  }
  return OPENAI_PLATFORM_DEFAULT_SECRET;
}

export function modelKeyUsesAgentsamGptServiceKey(modelKey, catalogSecretKeyName = null) {
  return (
    resolveOpenAiSecretKeyName(modelKey, catalogSecretKeyName) === OPENAI_AGENTSAM_GPT_TIER_SECRET
  );
}

/**
 * Resolve bearer for OpenAI HTTP (BYOK user_secrets first, then Worker secret).
 * @param {object} env
 * @param {string|null|undefined} modelKey
 * @param {string|null|undefined} userId
 * @param {{ secretKeyName?: string|null, secret_key_name?: string|null }} [opts]
 */
export async function resolveOpenAiApiKey(env, modelKey, userId, opts = {}) {
  const catalogSecret = opts.secretKeyName ?? opts.secret_key_name ?? null;
  const secretName = resolveOpenAiSecretKeyName(modelKey, catalogSecret);
  return resolveApiKey(env, userId, secretName);
}
