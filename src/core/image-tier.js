/**
 * Image content-tier classification (draft / standard / quality).
 * D1 keywords first; classifier escalate on miss; always log matched_by.
 */

import { loadClassificationKeywords } from './classification-keywords.js';
import { resolveModelApiKey } from '../integrations/tokens.js';
import { GOOGLE_MODEL_ROUTES } from './google-model-routes.js';
import { resolveModelForTask } from './resolveModel.js';

/** @typedef {'draft' | 'quality' | 'standard'} ImageTier */

const TIER_SLUG = Object.freeze({
  draft: 'image_tier_draft',
  standard: 'image_tier_standard',
  quality: 'image_tier_quality',
});

/**
 * @param {ImageTier} tier
 */
export function intentSlugForImageTier(tier) {
  return TIER_SLUG[tier] || TIER_SLUG.standard;
}

/**
 * Soft reference USD for cost-efficiency scoring (published priors).
 * @param {ImageTier} tier
 */
export function tierCostReferenceUsd(tier) {
  if (tier === 'draft') return 0.0045;
  if (tier === 'quality') return 0.05;
  return 0.015;
}

/**
 * Sync keyword-only classify (bootstrap). Prefer {@link resolveImageTier} on hot paths.
 * @param {string} prompt
 * @param {{ draftRe?: RegExp, qualityRe?: RegExp }|null} [kw]
 * @returns {ImageTier}
 */
export function classifyImageTierSync(prompt, kw = null) {
  const p = String(prompt || '').toLowerCase();
  const draftRe =
    kw?.draftRe ||
    /\b(?:draft|rough|quick|sketch|blueprint|floor\s*plan|house\s*plan|site\s*plan|wireframe|layout|mood\s*board|moodboard|concept\s+board|elevation\s+study)\b/i;
  const qualityRe =
    kw?.qualityRe ||
    /\b(?:presentation|client|final|high[\s-]?res|photorealistic|production|investor|pitch\s+deck|print\s+ready|marketing\s+hero)\b/i;
  if (draftRe.test(p)) return 'draft';
  if (qualityRe.test(p)) return 'quality';
  return 'standard';
}

/**
 * @param {unknown} env
 * @param {object} row
 */
async function logTierDecision(env, row) {
  if (!env?.DB) return;
  try {
    await env.DB.prepare(
      `INSERT INTO agentsam_intent_decisions (
         id, tenant_id, workspace_id, user_id, conversation_id, task_type,
         message_excerpt, matched_by, is_match, confidence, model_key, provider,
         routing_arm_id, reason, latency_ms, metadata_json, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        row.id || `idc_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
        row.tenant_id ?? null,
        row.workspace_id ?? null,
        row.user_id ?? null,
        row.conversation_id ?? null,
        'image_tier',
        row.message_excerpt != null ? String(row.message_excerpt).slice(0, 280) : null,
        row.matched_by,
        row.is_match ? 1 : 0,
        row.confidence ?? null,
        row.model_key ?? null,
        row.provider ?? null,
        row.routing_arm_id ?? null,
        row.reason != null ? String(row.reason).slice(0, 500) : null,
        row.latency_ms ?? null,
        JSON.stringify(row.metadata || {}).slice(0, 2000),
        Math.floor(Date.now() / 1000),
      )
      .run();
  } catch (e) {
    console.warn('[image-tier] log failed', e?.message ?? e);
  }
}

function extractJsonObject(text) {
  const clean = String(text || '')
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  try {
    return JSON.parse(clean);
  } catch {
    const first = clean.indexOf('{');
    const last = clean.lastIndexOf('}');
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(clean.slice(first, last + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * @param {unknown} env
 * @param {string} prompt
 * @param {{ userId?: string|null, workspaceId?: string|null, tenantId?: string|null }} ctx
 */
async function classifyTierWithModel(env, prompt, ctx) {
  const t0 = Date.now();
  let modelKey = null;
  let provider = null;
  let armId = null;

  try {
    const resolved = await resolveModelForTask(env, {
      task_type: 'intent_classification',
      workspace_id: ctx.workspaceId || null,
      tenant_id: ctx.tenantId || null,
      mode: 'auto',
    });
    modelKey = resolved?.model_key || resolved?.modelKey || null;
    provider = resolved?.provider || null;
    armId = resolved?.routing_arm_id || resolved?.arm_id || null;
  } catch (e) {
    console.warn('[image-tier] resolveModel', e?.message ?? e);
  }

  const instruction =
    'Answer ONLY with JSON: {"tier":"draft"|"standard"|"quality","confidence":0-1,"reason":"short"}.\n' +
    'draft = rough/sketch/wireframe/floor-plan/moodboard exploration.\n' +
    'quality = presentation/client-final/photorealistic/investor/print-ready.\n' +
    'standard = everything else (normal product/marketing still without those cues).\n\n' +
    `Prompt: ${String(prompt || '').slice(0, 1500)}`;

  let text = '';
  try {
    const geminiModel = GOOGLE_MODEL_ROUTES.cheapFast;
    const apiKey =
      (env?.GEMINI_API_KEY && String(env.GEMINI_API_KEY).trim()) ||
      (env?.GOOGLE_AI_API_KEY && String(env.GOOGLE_AI_API_KEY).trim()) ||
      (await resolveModelApiKey(env, 'google', geminiModel, ctx.userId));
    if (!apiKey) {
      return {
        tier: /** @type {ImageTier} */ ('standard'),
        confidence: 0,
        reason: 'classifier_no_api_key',
        modelKey,
        provider,
        armId,
        latencyMs: Date.now() - t0,
      };
    }
    modelKey = modelKey || geminiModel;
    provider = provider || 'google';
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}` +
      `:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: instruction }] }],
        generationConfig: {
          maxOutputTokens: 80,
          thinkingConfig: { thinkingLevel: 'minimal' },
        },
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        tier: /** @type {ImageTier} */ ('standard'),
        confidence: 0,
        reason: `classifier_http_${res.status}`,
        modelKey,
        provider,
        armId,
        latencyMs: Date.now() - t0,
      };
    }
    for (const c of data?.candidates || []) {
      for (const p of c?.content?.parts || []) {
        if (typeof p?.text === 'string') text += p.text;
      }
    }
  } catch (e) {
    return {
      tier: /** @type {ImageTier} */ ('standard'),
      confidence: 0,
      reason: `classifier_error:${e?.message || e}`,
      modelKey,
      provider,
      armId,
      latencyMs: Date.now() - t0,
    };
  }

  const parsed = extractJsonObject(text);
  let tier = String(parsed?.tier || '').trim().toLowerCase();
  if (tier === 'presentation' || tier === 'presentation_quality') tier = 'quality';
  if (tier === 'draft_mockup') tier = 'draft';
  if (tier !== 'draft' && tier !== 'quality' && tier !== 'standard') tier = 'standard';
  return {
    tier: /** @type {ImageTier} */ (tier),
    confidence: Number(parsed?.confidence),
    reason: parsed?.reason != null ? String(parsed.reason).slice(0, 200) : 'classifier',
    modelKey,
    provider,
    armId,
    latencyMs: Date.now() - t0,
  };
}

/**
 * Full tier gate: D1 keywords → classifier on miss → always log.
 * @param {unknown} env
 * @param {string} prompt
 * @param {{
 *   tenantId?: string|null,
 *   workspaceId?: string|null,
 *   userId?: string|null,
 *   conversationId?: string|null,
 * }} [ctx]
 * @returns {Promise<{ tier: ImageTier, matchedBy: string }>}
 */
export async function resolveImageTier(env, prompt, ctx = {}) {
  const p = String(prompt || '').trim();
  const baseLog = {
    tenant_id: ctx.tenantId ?? null,
    workspace_id: ctx.workspaceId ?? null,
    user_id: ctx.userId ?? null,
    conversation_id: ctx.conversationId ?? null,
    message_excerpt: p,
  };

  if (!p) {
    await logTierDecision(env, {
      ...baseLog,
      matched_by: 'neither',
      is_match: true,
      reason: 'empty_default_standard',
      metadata: { tier: 'standard' },
    });
    return { tier: 'standard', matchedBy: 'neither' };
  }

  const [draftKw, qualityKw] = await Promise.all([
    loadClassificationKeywords(env, 'image_tier_draft'),
    loadClassificationKeywords(env, 'image_tier_quality'),
  ]);

  if (draftKw.re.test(p)) {
    await logTierDecision(env, {
      ...baseLog,
      matched_by: 'keyword',
      is_match: true,
      reason: 'draft_keyword',
      metadata: { tier: 'draft', source: draftKw.source },
    });
    return { tier: 'draft', matchedBy: 'keyword' };
  }
  if (qualityKw.re.test(p)) {
    await logTierDecision(env, {
      ...baseLog,
      matched_by: 'keyword',
      is_match: true,
      reason: 'quality_keyword',
      metadata: { tier: 'quality', source: qualityKw.source },
    });
    return { tier: 'quality', matchedBy: 'keyword' };
  }

  // Keyword miss — escalate to cheap classifier (do not silently default without logging)
  const classified = await classifyTierWithModel(env, p, ctx);
  await logTierDecision(env, {
    ...baseLog,
    matched_by: 'classifier',
    is_match: true,
    confidence: classified.confidence,
    model_key: classified.modelKey,
    provider: classified.provider,
    routing_arm_id: classified.armId,
    reason: classified.reason,
    latency_ms: classified.latencyMs,
    metadata: { tier: classified.tier },
  });
  return { tier: classified.tier, matchedBy: 'classifier' };
}
