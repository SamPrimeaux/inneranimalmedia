/**
 * OpenAI Realtime voice — server-side ephemeral client secret endpoint.
 * tkt_oai_realtime_secret
 *
 * Agent Sam Voice lane only. Meet stays RealtimeKit (MEET_ENGINE var + handleRealtimeKitWebhook).
 * Never exposes the platform API key to the browser — issues an ephemeral secret instead.
 * OpenAI-Safety-Identifier: sha256('realtime:' + userId) — same hashing convention as WS transport.
 */

import { isFeatureEnabled } from '../core/features.js';
import { resolveOpenAiApiKey } from '../integrations/openai-credentials.js';
import { loadCatalogCapabilities } from '../core/model-catalog-capabilities.js';
import { jsonResponse } from '../core/responses.js';
import { resolveCanonicalUserId } from '../api/auth.js';

const OPENAI_REALTIME_SESSIONS = 'https://api.openai.com/v1/realtime/sessions';
const FLAG_KEY = 'openai_realtime_voice';

/**
 * Stable hashed safety identifier for a user — never raw user_id on the wire.
 * Pattern mirrors OpenAiResponsesWsV1 (wss transport).
 * @param {string} userId
 * @returns {Promise<string>}
 */
async function hashRealtimeSafetyId(userId) {
  const enc = new TextEncoder();
  const data = enc.encode(`realtime:${userId}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Strip any accidental secret leakage from upstream error text. */
function sanitizeRealtimeError(text) {
  return String(text || '')
    .slice(0, 1000)
    .replace(/\bsk-[a-zA-Z0-9]{10,}\b/g, '[redacted]');
}

/**
 * Resolve the realtime model to use.
 * Prefers body.model if the catalog confirms supports_realtime=1.
 * Falls back to catalog default from flag config_json, then literal fallback.
 * Never hardcodes model ids in logic — catalog + flag config are SSOT.
 *
 * @param {any} env
 * @param {string|null|undefined} bodyModel
 * @param {string} flagConfigJson
 * @returns {Promise<string>}
 */
async function resolveRealtimeModel(env, bodyModel, flagConfigJson) {
  let configDefault = 'gpt-4o-realtime-preview';
  try {
    const cfg = JSON.parse(flagConfigJson || '{}');
    if (cfg.default_model && typeof cfg.default_model === 'string') {
      configDefault = cfg.default_model.trim();
    }
  } catch {
    /* use literal fallback */
  }

  const candidate = bodyModel ? String(bodyModel).trim() : '';
  if (candidate) {
    const cap = await loadCatalogCapabilities(env, candidate);
    if (cap?.supports_realtime === true) return candidate;
    // If caller passed a model but catalog doesn't know it, still allow it —
    // catalog may not yet have the row; don't hard-block on missing catalog entry.
    if (!cap) return candidate;
    // cap exists but supports_realtime=false → fall through to default
  }
  return configDefault;
}

/**
 * POST /api/openai/realtime/client-secret
 *
 * Body (JSON, all optional):
 *   { "model": "gpt-4o-realtime-preview", "voice": "alloy", "instructions": "..." }
 *
 * Returns: OpenAI /v1/realtime/sessions response verbatim
 *   { id, object, model, ..., client_secret: { value, expires_at } }
 *
 * @param {Request} request
 * @param {any} env
 * @param {any} ctx
 * @param {{ userId?: string|null, tenantId?: string|null }} authCtx
 */
export async function handleOpenAiRealtimeClientSecret(request, env, ctx, authCtx = {}) {
  const rawUserId = authCtx.userId ? String(authCtx.userId).trim() : null;
  const userId = rawUserId
    ? await resolveCanonicalUserId(rawUserId, env).catch(() => rawUserId)
    : null;
  const tenantId = authCtx.tenantId ? String(authCtx.tenantId).trim() : null;

  if (!userId) {
    return jsonResponse({ error: 'Unauthorized', code: 'auth_required' }, 401);
  }

  // ── 1. Feature flag — fail-closed ──────────────────────────────────────────
  let flagEnabled = false;
  let flagConfigJson = '{}';
  try {
    const row = await env.DB.prepare(
      `SELECT enabled_globally, enabled_for_users, config_json
         FROM agentsam_feature_flag WHERE flag_key = ? AND is_archived = 0 LIMIT 1`,
    )
      .bind(FLAG_KEY)
      .first();
    if (row) {
      flagConfigJson = String(row.config_json || '{}');
      flagEnabled = await isFeatureEnabled(env, FLAG_KEY, { userId, tenantId });
    }
  } catch (e) {
    console.warn('[openai_realtime] flag_check_error', e?.message ?? e);
  }

  if (!flagEnabled) {
    console.info('[openai_realtime] flag_denied', { userId_prefix: userId.slice(0, 8) });
    return jsonResponse(
      { error: 'openai_realtime_voice not enabled for this account', code: 'flag_off' },
      403,
    );
  }

  // ── 2. Parse body ──────────────────────────────────────────────────────────
  let body = {};
  try {
    body = await request.json();
  } catch {
    /* optional body */
  }
  const voice = typeof body.voice === 'string' && body.voice.trim() ? body.voice.trim() : 'alloy';
  const instructions =
    typeof body.instructions === 'string' && body.instructions.trim()
      ? body.instructions.trim()
      : null;

  // ── 3. Resolve model (catalog SSOT) ────────────────────────────────────────
  const model = await resolveRealtimeModel(env, body.model, flagConfigJson);

  // ── 4. Resolve API key (BYOK first, platform fallback) ─────────────────────
  const apiKey = await resolveOpenAiApiKey(env, model, userId, {});
  if (!apiKey) {
    console.warn('[openai_realtime] api_key_missing', { userId_prefix: userId.slice(0, 8) });
    return jsonResponse({ error: 'OpenAI API key not configured', code: 'no_api_key' }, 503);
  }

  // ── 5. Safety identifier — hashed, never raw user_id on the wire ───────────
  const safetyId = await hashRealtimeSafetyId(userId);

  // ── 6. Issue ephemeral session with OpenAI ─────────────────────────────────
  const sessionBody = {
    model,
    voice,
    ...(instructions ? { instructions } : {}),
  };

  let upstreamRes;
  try {
    upstreamRes = await fetch(OPENAI_REALTIME_SESSIONS, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Safety-Identifier': safetyId,
      },
      body: JSON.stringify(sessionBody),
    });
  } catch (e) {
    console.error('[openai_realtime] upstream_fetch_failed', e?.message ?? e);
    return jsonResponse({ error: 'OpenAI Realtime request failed', detail: e?.message }, 502);
  }

  if (!upstreamRes.ok) {
    const errText = await upstreamRes.text().catch(() => '');
    const safe = sanitizeRealtimeError(errText);
    console.warn(
      `[openai_realtime] upstream_error status=${upstreamRes.status} body=${safe}`,
    );
    return jsonResponse(
      { error: 'OpenAI Realtime API error', status: upstreamRes.status, detail: safe },
      upstreamRes.status,
    );
  }

  const sessionData = await upstreamRes.json().catch(() => ({}));

  // ── 7. Log — never log client_secret value ────────────────────────────────
  console.info('[openai_realtime] client_secret_issued', {
    userId_hash: safetyId.slice(0, 12),
    model,
    voice,
    session_id: sessionData?.id ?? null,
    expires_at: sessionData?.client_secret?.expires_at ?? null,
  });

  // Return OpenAI's response verbatim — browser uses client_secret.value for WebRTC SDP.
  return new Response(JSON.stringify(sessionData), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
