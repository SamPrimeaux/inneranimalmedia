/**
 * Unified image generation — OpenAI, Google Imagen, Workers AI.
 * Used by /api/images/generate|edit and agent chat SSE tool paths.
 *
 * Product rule: AI creates drafts. Users create canon.
 * Default persist: false — drafts in drafts/images/{user_id}/ until POST /api/images/save.
 */

import { generateImageOpenAI, normalizeOpenAiImageQuality } from '../integrations/openai.js';
import {
  imageGenerationShouldPersist,
  persistImageDraft,
} from '../core/image-draft-store.js';
import { assertOpenAiImageModelActive } from '../core/image-model-routes.js';
import { stripUserTextForIntent } from '../core/active-file-envelope.js';
import {
  hasImageGenerationIntentSync,
  isExplicitImagePlanningIntent,
  isPrimaryImageGenerationIntentSync,
  resolvePrimaryImageGenerationIntent,
} from '../core/image-intent-gate.js';
import { applyRewardEvent } from '../core/reward-events.js';
import { resolveModelApiKey } from '../integrations/tokens.js';
import { getR2Binding } from '../api/r2-api.js';
import { resolvePrimaryUploadPrefix } from '../core/media-r2-access.js';
import {
  classifyImageTierSync,
  intentSlugForImageTier,
  resolveImageTier,
  tierCostReferenceUsd,
} from '../core/image-tier.js';
import {
  attachImageGenerationUsage,
  contentTierFromImageTier,
  resolveGeminiAspectRatio,
  resolveGeminiImageSize,
} from '../core/image-generation-telemetry.js';

const BUCKET = 'inneranimalmedia';
const PROGRESS_INTERVAL_MS = 5000;

export const IMAGE_GEN_TOOL_NAMES = new Set(['imgx_generate_image', 'imgx_edit_image']);

/** @type {ReadonlyArray<{ stage: string; message: string; progress: number }>} */
export const IMAGE_PROGRESS_TICKS = [
  { stage: 'initializing', message: 'Understanding the visual direction...', progress: 8 },
  { stage: 'composition', message: 'Sketching the composition...', progress: 22 },
  { stage: 'lighting', message: 'Blocking out lighting...', progress: 38 },
  { stage: 'refinement', message: 'Refining cinematic details...', progress: 52 },
  { stage: 'atmosphere', message: 'Enhancing depth and atmosphere...', progress: 68 },
  { stage: 'polishing', message: 'Polishing textures...', progress: 82 },
  { stage: 'finalizing', message: 'Finalizing the render...', progress: 94 },
];

export {
  isExplicitImagePlanningIntent,
  resolvePrimaryImageGenerationIntent,
};

/**
 * Sync keyword gate (bootstrap/D1 cache). Prefer resolvePrimaryImageGenerationIntent on chat spine.
 * @param {string} message
 */
export function isPrimaryImageGenerationIntent(message) {
  return isPrimaryImageGenerationIntentSync(message);
}

/**
 * Broader image signal — primary render now OR secondary "also generate a logo" while coding.
 * @param {string} message
 */
export function hasImageGenerationIntent(message) {
  const m = stripUserTextForIntent(message).trim();
  if (!m || isExplicitImagePlanningIntent(m)) return false;
  if (hasImageGenerationIntentSync(m)) return true;
  if (
    /\b(also|and then|plus|as well|while you'?re at it|when done)\b[\s\S]{0,48}\b(generate|create|make|design|render|draw)\b[\s\S]{0,32}\b(image|photo|logo|icon|banner|thumbnail|mockup|hero|illustration|artwork|graphic)\b/i.test(
      m,
    )
  ) {
    return true;
  }
  if (
    /\b(need|want|could you|can you)\b[\s\S]{0,24}\b(a |an )?(hero|banner|logo|icon|thumbnail|og image|app icon|mockup|illustration|cover image|feature graphic|product photo|photo)\b/i.test(
      m,
    )
  ) {
    return true;
  }
  if (/\b(imgx_|dall[- ]?e|imagen|gpt-image|image gen)/i.test(m)) return true;
  if (/\b(visual asset|marketing asset|brand asset|social preview)\b/i.test(m)) return true;
  return false;
}

/**
 * Natural-language request to render a single image now (bypass long-work plan pipeline).
 * Alias for {@link isPrimaryImageGenerationIntent}.
 * @param {string} message
 */
export function isDirectImageGenerationIntent(message) {
  return isPrimaryImageGenerationIntent(message);
}

/**
 * Video generation / Veo / MovieMode render intent (capability tool injection).
 * @param {string} message
 */
export function hasVideoGenerationIntent(message) {
  const m = String(message || '').trim();
  if (!m) return false;
  return (
    /\b(generate|create|make|produce|render)\b.{0,40}\b(video|clip|footage|movie|animation)\b/i.test(m) ||
    /\b(veo|sora|text.to.video|video.gen|moviemode)\b/i.test(m)
  );
}

/**
 * Map content tier → legacy lane label (single classifier → one label).
 * Edit/reference stays a structural check, not a second keyword tree.
 * @param {ImageTier | string | null | undefined} tier
 * @param {boolean} [hasReferenceImage]
 * @param {string} [message]
 */
export function imageLaneFromTier(tier, hasReferenceImage = false, message = '') {
  if (
    hasReferenceImage ||
    /\b(edit|modify|change|update|adjust|alter)\b.*\b(image|photo|pic)\b/i.test(String(message || ''))
  ) {
    return 'edit_reference';
  }
  if (tier === 'draft') return 'fast_draft';
  if (tier === 'quality') return 'high_quality';
  return 'brand_mockup';
}

/**
 * @deprecated Prefer {@link imageLaneFromTier} after {@link resolveImageTier}.
 * Sync path uses bootstrap tier only when caller has no env/tier yet.
 * @param {string} message
 * @param {boolean} [hasReferenceImage]
 * @param {ImageTier | null} [tier]
 */
export function resolveImageLane(message, hasReferenceImage = false, tier = null) {
  const t = tier || classifyImageTierSync(message);
  return imageLaneFromTier(t, hasReferenceImage, message);
}

function betaSampleRouting(a, b) {
  const x = Math.pow(Math.random(), 1 / Math.max(a, 1));
  const y = Math.pow(Math.random(), 1 / Math.max(b, 1));
  return x / (x + y);
}

/**
 * Soft-cap expensive arms on cheap tiers once cost_mean is trusted (cost_n >= N).
 * Falls back to full candidate set if every arm would be filtered (cold start).
 * @param {Array<Record<string, unknown>>} candidates
 * @param {ImageTier} tier
 */
function applyTierCostCaps(candidates, tier) {
  const cap = TIER_COST_CAP_USD[tier];
  if (cap == null || !candidates?.length) return candidates || [];
  const filtered = candidates.filter((row) => {
    const n = Number(row.cost_n) || 0;
    if (n < TIER_COST_CAP_MIN_N) return true; // explore until we have evidence
    const mean = Number(row.cost_mean);
    if (!Number.isFinite(mean)) return true;
    return mean <= cap;
  });
  return filtered.length ? filtered : candidates;
}

/**
 * Resolve env secret binding for a catalog+routing row (matches resolveModel.js join shape).
 * @param {unknown} env
 * @param {Record<string, unknown>} row
 */
function secretKeyNameForCatalogRow(env, row) {
  const fromAi = row.secret_key_name != null ? String(row.secret_key_name).trim() : '';
  if (fromAi) return fromAi;
  const plat = String(row.resolved_platform || row.api_platform || '').toLowerCase();
  if (plat.startsWith('openai')) return 'OPENAI_API_KEY';
  if (plat.startsWith('google') || plat.startsWith('gemini')) return 'GOOGLE_API_KEY';
  if (plat.startsWith('anthropic')) return 'ANTHROPIC_API_KEY';
  return '';
}

/** @typedef {'draft' | 'quality' | 'standard'} ImageTier */

/**
 * Sync bootstrap only — production paths must use {@link resolveImageTier} / {@link applyImageTierDefaults}.
 * @param {string} prompt
 * @returns {ImageTier}
 */
export function classifyImageTier(prompt) {
  return classifyImageTierSync(prompt);
}

/** Soft cost ceilings once we have enough samples (cost_n). Blocks burners on draft prompts. */
const TIER_COST_CAP_USD = Object.freeze({
  draft: 0.02,
  standard: 0.08,
  quality: null, // no soft cap — presentation may use gpt-image-2 / pro
});
const TIER_COST_CAP_MIN_N = 3;
/** Blend weight for cost-efficiency vs Beta quality sample (0.3–0.5). */
const IMAGE_COST_WEIGHT = 0.4;

const TIER_QUALITY_DEFAULTS = Object.freeze({
  draft: { quality: 'medium', size: '1024x1024' },
  quality: { quality: 'high', size: '1536x1024' },
  standard: { quality: 'medium', size: '1024x1024' },
});

/**
 * Prefer per-tier arms (intent_slug = image_tier_*). Fallback to any unpaused image arm.
 * @param {Array<Record<string, unknown>>} candidates
 * @param {ImageTier} tier
 */
function filterArmsForTier(candidates, tier) {
  if (!candidates?.length) return [];
  const slug = intentSlugForImageTier(tier);
  const matched = candidates.filter(
    (row) => String(row.intent_slug || '').trim() === slug,
  );
  return matched.length ? matched : candidates;
}

/**
 * score = thompson_sample × (tier_cost_reference / cost_mean) ^ cost_weight
 * @param {Array<Record<string, unknown>>} candidates
 * @param {ImageTier} tier
 */
function pickImageArmCostAware(candidates, tier) {
  if (!candidates?.length) return null;
  const ref = tierCostReferenceUsd(tier);
  const w = IMAGE_COST_WEIGHT;
  let best = null;
  let bestScore = -1;
  let bestMeta = null;

  for (const arm of candidates) {
    const sample = betaSampleRouting(arm.success_alpha, arm.success_beta);
    const costMean = Math.max(Number(arm.cost_mean) || 0.01, 1e-6);
    const costFactor = Math.pow(ref / costMean, w);
    const score = sample * costFactor;
    if (score > bestScore) {
      bestScore = score;
      best = arm;
      bestMeta = { sample, cost_mean: costMean, cost_factor: costFactor, final_score: score, tier_cost_ref: ref };
    }
  }
  return best ? { arm: best, meta: bestMeta } : null;
}

/**
 * Apply quality/size defaults from D1-backed tier (via {@link resolveImageTier}).
 * @param {unknown} env
 * @param {Record<string, unknown>} params
 * @param {{
 *   tenantId?: string|null,
 *   workspaceId?: string|null,
 *   userId?: string|null,
 *   conversationId?: string|null,
 *   tier?: ImageTier,
 *   tierMatchedBy?: string,
 * }} [ctx]
 */
export async function applyImageTierDefaults(env, params, ctx = {}) {
  const prompt = String(params.prompt || params.description || '').trim();
  const resolved =
    ctx.tier === 'draft' || ctx.tier === 'quality' || ctx.tier === 'standard'
      ? { tier: /** @type {ImageTier} */ (ctx.tier), matchedBy: ctx.tierMatchedBy || 'caller' }
      : await resolveImageTier(env, prompt, ctx);
  const tier = resolved.tier;
  const defaults = TIER_QUALITY_DEFAULTS[tier] || TIER_QUALITY_DEFAULTS.standard;
  return {
    ...params,
    prompt,
    quality: params.quality ?? defaults.quality,
    size: params.size ?? defaults.size,
    tier,
    tier_matched_by: resolved.matchedBy,
  };
}

/**
 * Thompson sample over per-tier image arms with cost-efficiency blend.
 * @param {unknown} env
 * @param {string} workspaceId
 * @param {string} [prompt]
 * @param {{ tenantId?: string|null, userId?: string|null, conversationId?: string|null }} [ctx]
 */
export async function pickImageModelFromDb(env, workspaceId, prompt = '', ctx = {}) {
  const ws = String(workspaceId || '').trim();
  if (!env?.DB || !ws) return null;

  const { tier, matchedBy } =
    ctx.tier === 'draft' || ctx.tier === 'quality' || ctx.tier === 'standard'
      ? { tier: /** @type {ImageTier} */ (ctx.tier), matchedBy: ctx.tierMatchedBy || 'caller' }
      : await resolveImageTier(env, prompt, {
          workspaceId: ws,
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          conversationId: ctx.conversationId,
        });

  const rows = await env.DB.prepare(
    `SELECT
       ra.id              AS arm_id,
       ra.id              AS id,
       ra.model_key,
       ra.intent_slug,
       ra.success_alpha,
       ra.success_beta,
       ra.cost_n,
       ra.cost_mean,
       ra.latency_n,
       ra.latency_mean,
       ra.avg_quality_score,
       ra.quality_n,
       ra.max_cost_per_call_usd,
       mc.api_platform,
       mc.google_model_id,
       mc.openai_model_id,
       COALESCE(NULLIF(ai.api_platform,'unknown'), mc.api_platform) AS resolved_platform,
       COALESCE(ai.secret_key_name, '')              AS secret_key_name
     FROM agentsam_routing_arms ra
     INNER JOIN agentsam_model_catalog mc
       ON  mc.model_key = ra.model_key
       AND mc.is_active = 1
     LEFT JOIN agentsam_ai ai
       ON  ai.model_key = mc.model_key
       AND ai.status    = 'active'
       AND (ai.mode = 'model' OR ai.model_key IS NOT NULL)
     WHERE ra.task_type    = 'image_generation'
       AND ra.workspace_id = ?
       AND ra.is_paused    = 0
       AND ra.is_active    = 1
       AND ra.model_key NOT IN ('gpt-image-1', 'gpt-image-1-mini', 'gpt-image-1.5')
       AND (mc.deprecated_after IS NULL OR mc.deprecated_after > date('now'))`,
  )
    .bind(ws)
    .all()
    .catch(() => ({ results: [] }));

  let candidates = filterArmsForTier(rows.results || [], tier);
  if (!candidates.length) return null;

  const credentialed = [];
  for (const row of candidates) {
    const keyName = secretKeyNameForCatalogRow(env, row);
    if (keyName && !env[keyName]) continue;
    const plat = String(row.resolved_platform || '').toLowerCase();
    if (plat === 'workers_ai' && !env.AI) continue;
    credentialed.push({ ...row, keyName: keyName || null });
  }
  if (!credentialed.length) return null;

  candidates = applyTierCostCaps(credentialed, tier);
  const pickedPack = pickImageArmCostAware(candidates, tier);
  if (!pickedPack?.arm) return null;
  const picked = pickedPack.arm;

  console.log('[image_generation] pick_model', {
    tier,
    tier_matched_by: matchedBy,
    model_key: picked.model_key,
    arm_id: picked.arm_id || picked.id,
    intent_slug: picked.intent_slug ?? null,
    cost_mean: pickedPack.meta?.cost_mean ?? null,
    cost_n: picked.cost_n ?? null,
    thompson_sample: pickedPack.meta?.sample != null ? Number(pickedPack.meta.sample.toFixed(4)) : null,
    cost_factor: pickedPack.meta?.cost_factor != null ? Number(pickedPack.meta.cost_factor.toFixed(4)) : null,
    final_score: pickedPack.meta?.final_score != null ? Number(pickedPack.meta.final_score.toFixed(4)) : null,
    tier_cost_ref: pickedPack.meta?.tier_cost_ref ?? null,
  });
  return {
    ...picked,
    keyName: picked.keyName || null,
    tier,
    tier_matched_by: matchedBy,
    pick_meta: pickedPack.meta,
  };
}

/**
 * Resolve tenant for reward writes — never invent one.
 * @param {unknown} env
 * @param {string|null|undefined} tenantId
 * @param {string|null|undefined} userId
 */
async function resolveTenantIdForReward(env, tenantId, userId) {
  const direct = tenantId != null ? String(tenantId).trim() : '';
  if (direct) return direct;
  const uid = userId != null ? String(userId).trim() : '';
  if (!uid || !env?.DB) return '';
  try {
    const row = await env.DB.prepare(
      `SELECT COALESCE(active_tenant_id, tenant_id) AS tid FROM auth_users WHERE id = ? LIMIT 1`,
    )
      .bind(uid)
      .first();
    return row?.tid != null ? String(row.tid).trim() : '';
  } catch {
    return '';
  }
}

/**
 * Image-lane bandit update — single writer via applyRewardEvent (event + arm in one batch).
 * @param {unknown} env
 * @param {string} modelKey
 * @param {string} workspaceId
 * @param {boolean} success
 * @param {number} latencyMs
 * @param {{
 *   costUsd?: number | null,
 *   contentTier?: string | null,
 *   tenantId?: string | null,
 *   userId?: string | null,
 *   routingArmId?: string | null,
 *   provider?: string | null,
 *   generationId?: string | null,
 * }} [extra]
 */
export async function recordImageModelOutcome(env, modelKey, workspaceId, success, latencyMs, extra = {}) {
  const ws = String(workspaceId || '').trim();
  const mk = String(modelKey || '').trim();
  if (!env?.DB || !ws || !mk) return;
  const tenantId = await resolveTenantIdForReward(env, extra.tenantId, extra.userId);
  if (!tenantId) {
    console.warn('[image_generation] recordImageModelOutcome skipped — no tenant_id (refusing partial arm update)');
    return;
  }
  const cost = Number(extra.costUsd);
  const hasCost = Number.isFinite(cost) && cost >= 0;
  const genId = extra.generationId != null ? String(extra.generationId).trim() : '';
  try {
    await applyRewardEvent(env, {
      tenant_id: tenantId,
      workspace_id: ws,
      task_type: 'image_generation',
      signal_type: success ? 'auto_success' : 'auto_error',
      signal_value: success ? 1 : -1,
      signal_source: 'system',
      routing_arm_id: extra.routingArmId ?? null,
      model_key: mk,
      provider: extra.provider ?? null,
      content_tier: extra.contentTier ?? null,
      cost_usd: hasCost ? cost : null,
      latency_ms: latencyMs,
      apply_cost: hasCost,
      apply_latency: true,
      apply_execution: true,
      dedup_key: genId ? `img_outcome:${genId}:${success ? 'ok' : 'err'}` : null,
      reason: 'image_generation_outcome',
      metadata: { generation_id: genId || null },
    });
  } catch (e) {
    console.warn('[image_generation] recordImageModelOutcome', e?.message ?? e);
  }
}

/**
 * User thumbs → domain feedback rows + single-writer bandit (applyRewardEvent).
 * @param {unknown} env
 * @param {{
 *   generationId: string,
 *   userId: string,
 *   workspaceId?: string | null,
 *   tenantId?: string | null,
 *   rating: 1 | -1,
 * }} p
 */
export async function rateImageGeneration(env, p) {
  if (!env?.DB) throw new Error('Database not configured');
  const generationId = String(p.generationId || '').trim();
  const userId = String(p.userId || '').trim();
  const rating = Number(p.rating) === 1 ? 1 : Number(p.rating) === -1 ? -1 : 0;
  if (!generationId || !userId || !rating) throw new Error('generation_id and rating (±1) required');

  const draft = await env.DB.prepare(
    `SELECT id, user_id, workspace_id, model, provider, content_tier, cost_usd, routing_arm_id, user_rating
     FROM image_generation_drafts WHERE id = ? LIMIT 1`,
  )
    .bind(generationId)
    .first();
  if (!draft?.id) throw new Error('draft_not_found');
  if (String(draft.user_id) !== userId) throw new Error('forbidden');

  const now = Math.floor(Date.now() / 1000);
  const feedbackId = `igf_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const ws =
    (p.workspaceId != null ? String(p.workspaceId).trim() : '') ||
    (draft.workspace_id != null ? String(draft.workspace_id).trim() : '') ||
    null;
  const modelKey = draft.model != null ? String(draft.model).trim() : null;
  const armId = draft.routing_arm_id != null ? String(draft.routing_arm_id).trim() : null;
  const contentTier = draft.content_tier != null ? String(draft.content_tier).trim() : null;
  const costUsd = Number(draft.cost_usd);
  const prevRating = Number(draft.user_rating);
  const alreadyRated = prevRating === 1 || prevRating === -1;

  await env.DB.prepare(
    `INSERT INTO image_generation_feedback (
       id, generation_id, user_id, workspace_id, rating, content_tier, model_key, provider,
       routing_arm_id, cost_usd, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      feedbackId,
      generationId,
      userId,
      ws,
      rating,
      contentTier,
      modelKey,
      draft.provider != null ? String(draft.provider).slice(0, 64) : null,
      armId,
      Number.isFinite(costUsd) ? costUsd : null,
      now,
    )
    .run();

  await env.DB.prepare(
    `UPDATE image_generation_drafts
     SET user_rating = ?, rated_at = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
  )
    .bind(rating, now, now, generationId, userId)
    .run();

  // First rating only → bandit via applyRewardEvent (event + arm in one batch).
  // Do NOT bump cost_mean on thumbs — cost already applied on generate outcome.
  let thompsonUpdated = false;
  if (!alreadyRated && modelKey && ws) {
    const tenantId = await resolveTenantIdForReward(env, p.tenantId, userId);
    if (!tenantId) {
      console.warn('[image_generation] rate bandit skipped — no tenant_id (refusing partial arm update)');
    } else {
      try {
        const out = await applyRewardEvent(env, {
          tenant_id: tenantId,
          workspace_id: ws,
          task_type: 'image_generation',
          signal_type: rating === 1 ? 'user_thumbs_up' : 'user_thumbs_down',
          signal_value: rating,
          signal_source: 'user',
          routing_arm_id: armId,
          model_key: modelKey,
          provider: draft.provider != null ? String(draft.provider).slice(0, 64) : null,
          content_tier: contentTier,
          cost_usd: Number.isFinite(costUsd) ? costUsd : null,
          apply_cost: false,
          apply_latency: false,
          apply_execution: false,
          dedup_key: `img_rate:${generationId}:${rating === 1 ? 'up' : 'down'}`,
          reason: 'image_generation_rate',
          metadata: { generation_id: generationId, feedback_id: feedbackId, user_id: userId },
        });
        thompsonUpdated = !out.deduped;
      } catch (e) {
        console.warn('[image_generation] rate applyRewardEvent', e?.message ?? e);
      }
    }
  }

  return {
    ok: true,
    generation_id: generationId,
    rating,
    content_tier: contentTier,
    model: modelKey,
    feedback_id: feedbackId,
    thompson_updated: thompsonUpdated,
  };
}


const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  'Access-Control-Allow-Origin': '*',
};

/**
 * Agent chat fast path: imgx_generate_image + image_generation_* SSE only (no plan pipeline).
 * @param {unknown} env
 * @param {unknown} ctx
 * @param {{
 *   request?: Request;
 *   message: string;
 *   userId?: string | null;
 *   tenantId?: string | null;
 *   workspaceId?: string | null;
 *   sessionId?: string | null;
 *   authUser?: { id?: string } | null;
 * }} opts
 */
/**
 * Parse lightbox "Describe edits" / Edit-this-image turns.
 * @param {string} message
 * @returns {{ isEdit: boolean, prompt: string, imageUrl: string|null }}
 */
export function parseImageEditRequest(message) {
  const raw = String(message || '').trim();
  const urlMatch = raw.match(/\bImage URL:\s*(\S+)/i);
  const editMatch = raw.match(/^Edit this image:\s*([\s\S]+?)(?:\n\nImage URL:|$)/i);
  if (urlMatch && editMatch) {
    return {
      isEdit: true,
      prompt: String(editMatch[1] || '').trim(),
      imageUrl: String(urlMatch[1] || '').trim() || null,
    };
  }
  return { isEdit: false, prompt: raw, imageUrl: null };
}

export function handleDirectImageGenerationChatStream(env, ctx, opts) {
  const message = String(opts.message || '').trim();
  const userId = opts.userId ?? opts.authUser?.id ?? null;
  const tenantId = opts.tenantId ?? null;
  const workspaceId = opts.workspaceId ?? null;
  const sessionId = opts.sessionId ?? null;
  const request = opts.request;
  const parsed = parseImageEditRequest(message);
  const prompt = parsed.prompt || message;

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const emit = (type, payload) => {
    try {
      writer.write(encoder.encode(`data: ${JSON.stringify({ type, ...payload })}\n\n`));
    } catch (_) {
      /* stream closed */
    }
  };

  let origin = '';
  try {
    origin = (env.IAM_ORIGIN || '').replace(/\/$/, '') || '';
    if (!origin && request?.url) origin = new URL(request.url).origin;
  } catch (_) {
    origin = env.IAM_ORIGIN || 'https://inneranimalmedia.com';
  }

  (async () => {
    try {
      // Same-thread revision: attach prior draft → imgx_edit_image (not a fresh generate).
      let priorDraftUrl = parsed.imageUrl || null;
      let priorGenerationId = null;
      let toolName =
        parsed.isEdit && parsed.imageUrl ? 'imgx_edit_image' : 'imgx_generate_image';

      const { isImageRevisionFollowUpCue } = await import('../core/image-intent-gate.js');
      const matchedBy =
        opts.turnDecision?.imageIntent?.matchedBy ||
        opts.turnDecision?.matchedBy ||
        null;
      const wantsRevision =
        matchedBy === 'revision_followup' ||
        isImageRevisionFollowUpCue(message) ||
        /\b(edit|modify|change|update|adjust|alter|recolor)\b.{0,48}\b(image|photo|pic|barn|it|this|that)\b/i.test(
          message,
        );

      if (!priorDraftUrl && wantsRevision && userId) {
        try {
          const { resolvePriorDraftPreviewUrl } = await import('../core/image-draft-store.js');
          const prior = await resolvePriorDraftPreviewUrl(env, {
            userId: String(userId),
            conversationId: sessionId,
          });
          if (prior?.previewUrl) {
            priorDraftUrl = prior.previewUrl;
            priorGenerationId = prior.generationId;
            toolName = 'imgx_edit_image';
            console.log('[image_generation] revision_prior_draft', {
              generation_id: priorGenerationId,
              preview_url: priorDraftUrl,
              matched_by: matchedBy,
            });
          }
        } catch (e) {
          console.warn('[image_generation] prior_draft_lookup_failed', e?.message ?? e);
        }
      }

      emit('context', {
        intent: 'image_generation',
        mode: 'image_generation',
        runtime_mode: 'image_generation',
        tool: toolName,
        session_id: sessionId,
        prompt,
        ...(priorDraftUrl ? { edited_from: priorDraftUrl, prior_generation_id: priorGenerationId } : {}),
      });

      if (sessionId && userId && message) {
        try {
          const { appendChatMessage } = await import('../core/agentsam-chat-sessions.js');
          await appendChatMessage(env, sessionId, {
            role: 'user',
            content: message,
            status: 'complete',
          });
        } catch (e) {
          console.warn('[image_generation] persist_user_failed', e?.message ?? e);
        }
      }

      const referenceImageB64 = opts.referenceImageB64 ?? opts.referenceImage ?? null;
      const ws = workspaceId != null ? String(workspaceId).trim() : '';
      const { tier, matchedBy: tierMatchedBy } = await resolveImageTier(env, prompt, {
        workspaceId: ws || null,
        tenantId,
        userId,
      });
      const lane = imageLaneFromTier(tier, !!(referenceImageB64 || priorDraftUrl), prompt);
      const imageModel = ws
        ? await pickImageModelFromDb(env, ws, prompt, {
            tenantId,
            userId,
            tier,
            tierMatchedBy,
          })
        : null;
      if (lane && imageModel) {
        console.log('[image_generation] inferred_lane', {
          lane,
          tier,
          tier_matched_by: tierMatchedBy,
          model_key: imageModel.model_key,
          tool: toolName,
          ...(priorDraftUrl ? { edited_from: priorDraftUrl } : {}),
        });
      }
      const sseCtx = {
        authUser: opts.authUser || { id: userId },
        workspaceId,
        tenantId,
        userId,
        origin,
        secretKeyName: imageModel?.keyName ?? null,
        conversationId: sessionId,
      };
      const sseParams = {
        prompt,
        persist: false,
        ...(priorDraftUrl ? { image_url: priorDraftUrl } : {}),
        ...(imageModel
          ? {
              model: imageModel.model_key,
              provider: imageModel.resolved_platform,
              secretKeyName: imageModel.keyName,
              routing_arm_id: imageModel.arm_id,
            }
          : {}),
      };

      const t0 = Date.now();
      try {
        emit('image_generation_started', {
          type: 'image_generation_started',
          provider: imageModel?.resolved_platform || null,
          model: imageModel?.model_key || null,
          lane,
          prompt,
          tool: toolName,
        });
        const result = await streamImageGenerationSse(emit, env, toolName, sseParams, sseCtx);
        const toolDurMs = Date.now() - t0;
        // TELEMETRY-002: image fast path bypasses agent-tool-loop — own the ledger row here.
        // Thompson outcome is recorded inside streamImageGenerationSse (single writer).
        try {
          const { extractToolExecUsage } = await import('../core/tool-exec-telemetry.js');
          const { scheduleAgentsamToolCallLog } = await import('../core/agent-prompt-builder.js');
          const toolUsage = extractToolExecUsage(result);
          scheduleAgentsamToolCallLog(env, ctx, {
            tenantId,
            sessionId,
            toolName,
            status: 'success',
            durationMs: toolDurMs,
            costUsd: toolUsage.totalCostUsd,
            inputTokens: toolUsage.inputTokens,
            outputTokens: toolUsage.outputTokens,
            inputCostUsd: toolUsage.inputCostUsd,
            outputCostUsd: toolUsage.outputCostUsd,
            userId,
            workspaceId,
            errorMessage: null,
            inputSummary: JSON.stringify({ prompt: prompt.slice(0, 160), model: result?.model }).slice(0, 200),
            sourceTool: 'image_fast_path',
            conversationId: sessionId,
          });
        } catch (e) {
          console.warn('[image_generation] tool_call_log_failed', e?.message ?? e);
        }
        const imageUrl = result?.preview_url || result?.image_url || '';
        if (sessionId && userId && imageUrl) {
          try {
            const { appendChatMessage } = await import('../core/agentsam-chat-sessions.js');
            const alt = prompt.replace(/\s+/g, ' ').trim().slice(0, 120) || 'Generated image';
            await appendChatMessage(env, sessionId, {
              role: 'assistant',
              content: `![${alt}](${imageUrl})`,
              status: 'complete',
              model_key: result?.model || imageModel?.model_key || null,
            });
          } catch (e) {
            console.warn('[image_generation] persist_assistant_failed', e?.message ?? e);
          }
        }
        console.log('[agent] image_generation_fast_path_done', {
          generation_id: result?.generation_id || result?.artifact_id,
          provider: result?.provider,
          model: result?.model,
          tool: toolName,
          cost_usd: result?.cost_usd ?? result?.usage?.cost_usd ?? null,
        });
      } catch (err) {
        emit('image_generation_complete', {
          type: 'image_generation_complete',
          failed: true,
          provider: imageModel?.resolved_platform || null,
          model: imageModel?.model_key || null,
          prompt,
          error: err?.message != null ? String(err.message) : String(err),
        });
        try {
          const { scheduleAgentsamToolCallLog } = await import('../core/agent-prompt-builder.js');
          scheduleAgentsamToolCallLog(env, ctx, {
            tenantId,
            sessionId,
            toolName,
            status: 'error',
            durationMs: Date.now() - t0,
            costUsd: 0,
            inputTokens: 0,
            outputTokens: 0,
            userId,
            workspaceId,
            errorMessage: err?.message != null ? String(err.message).slice(0, 4000) : String(err).slice(0, 4000),
            inputSummary: JSON.stringify({ prompt: prompt.slice(0, 160) }).slice(0, 200),
            sourceTool: 'image_fast_path',
            conversationId: sessionId,
          });
        } catch (_) {
          /* non-fatal */
        }
        throw err;
      }
    } catch (e) {
      const msg = e?.message != null ? String(e.message) : String(e);
      console.warn('[agent] image_generation_fast_path_error', msg.slice(0, 400));
      emit('error', { error: msg, code: 'image_generation_failed' });
    } finally {
      emit('done', {});
      writer.close().catch(() => {});
    }
  })();

  return new Response(readable, { headers: SSE_HEADERS });
}

/**
 * @param {string} name
 */
export function isImageGenerationTool(name) {
  return IMAGE_GEN_TOOL_NAMES.has(String(name || '').trim());
}

/**
 * @param {string | undefined} size
 * @returns {{ width: number; height: number; openAiSize: string }}
 */
export function parseImageDimensions(size) {
  const raw = String(size || '1024x1024').trim().toLowerCase();
  const m = raw.match(/^(\d{3,4})x(\d{3,4})$/);
  if (m) {
    const w = parseInt(m[1], 10);
    const h = parseInt(m[2], 10);
    return { width: w, height: h, openAiSize: `${w}x${h}` };
  }
  if (raw === 'landscape' || raw === '1792x1024') {
    return { width: 1792, height: 1024, openAiSize: '1792x1024' };
  }
  if (raw === 'portrait' || raw === '1024x1792') {
    return { width: 1024, height: 1792, openAiSize: '1024x1792' };
  }
  return { width: 1024, height: 1024, openAiSize: '1024x1024' };
}

/**
 * @param {unknown} env
 * @param {Uint8Array | ArrayBuffer} bytes
 * @param {string} contentType
 * @param {{ authUser?: { id?: string }; workspaceId?: string | null; origin?: string }} ctx
 */
export async function uploadImageBytesToR2(env, bytes, contentType, ctx = {}) {
  const binding = getR2Binding(env, BUCKET);
  if (!binding?.put) throw new Error('R2 bucket inneranimalmedia not configured');

  const authUser = ctx.authUser || { id: 'system' };
  const uploadPack = await resolvePrimaryUploadPrefix(env, authUser, ctx.workspaceId || null);
  if (uploadPack.error) throw new Error(uploadPack.error);

  const ext =
    contentType === 'image/jpeg'
      ? 'jpg'
      : contentType === 'image/webp'
        ? 'webp'
        : contentType === 'image/gif'
          ? 'gif'
          : 'png';
  const key = `${uploadPack.prefix}gen-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  await binding.put(key, buf, { httpMetadata: { contentType: contentType || 'image/png' } });

  const origin = (ctx.origin || env.IAM_ORIGIN || 'https://inneranimalmedia.com').replace(/\/$/, '');
  const imageUrl = `${origin}/api/r2/buckets/${encodeURIComponent(BUCKET)}/object/${encodeURIComponent(key)}`;
  return { r2_key: key, image_url: imageUrl, artifact_id: `img_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}` };
}

/**
 * @param {unknown} env
 * @param {string} url
 */
async function fetchImageBytes(url) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'InnerAnimalMedia-ImageGen/1.0' },
  });
  if (!res.ok) throw new Error(`Failed to fetch image (${res.status})`);
  const ct = (res.headers.get('Content-Type') || 'image/png').split(';')[0].trim();
  const buf = await res.arrayBuffer();
  return { bytes: new Uint8Array(buf), contentType: ct };
}

/**
 * @param {unknown} env
 * @param {{ model?: string; prompt: string; size?: string; quality?: string; userId?: string | null }} opts
 */
async function generateOpenAI(env, opts) {
  const modelKey = String(opts.model || '').trim();
  if (!modelKey) throw new Error('OpenAI image model required');
  assertOpenAiImageModelActive(modelKey);
  const dims = parseImageDimensions(opts.size);
  const row = await generateImageOpenAI(env, {
    modelKey,
    prompt: opts.prompt,
    size: dims.openAiSize,
    quality: normalizeOpenAiImageQuality(modelKey, opts.quality || 'standard'),
    n: 1,
    userId: opts.userId,
  });
  if (!row) throw new Error('OpenAI image generation returned no data');
  const url = typeof row.url === 'string' ? row.url : null;
  const b64 = typeof row.b64_json === 'string' ? row.b64_json : null;
  if (url) {
    const fetched = await fetchImageBytes(url);
    return {
      provider: 'openai',
      model: modelKey,
      bytes: fetched.bytes,
      contentType: fetched.contentType,
      preview_urls: [url],
      metadata: { revised_prompt: row.revised_prompt },
    };
  }
  if (b64) {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return {
      provider: 'openai',
      model: modelKey,
      bytes,
      contentType: 'image/png',
      preview_urls: [],
      metadata: { revised_prompt: row.revised_prompt },
    };
  }
  throw new Error('OpenAI image generation returned no image bytes');
}

/**
 * Gemini multimodal image generation via /generateContent (gemini-* models).
 * @param {string} apiKey
 * @param {string} modelKey
 * @param {string} prompt
 * @param {{ bytes?: Uint8Array, contentType?: string } | null} [referenceImage]
 * @param {{ aspectRatio?: string, imageSize?: string }} [imageConfig]
 */
async function generateGeminiContent(apiKey, modelKey, prompt, referenceImage = null, imageConfig = {}) {
  const parts = [];
  if (referenceImage?.bytes?.length) {
    const mime = referenceImage.contentType || 'image/png';
    let binary = '';
    const bytes = referenceImage.bytes;
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    parts.push({
      inlineData: {
        mimeType: mime,
        data: btoa(binary),
      },
    });
    parts.push({
      text: `Edit this image according to these instructions. Return only the updated image.\n\n${prompt}`,
    });
  } else {
    parts.push({ text: prompt });
  }
  const aspectRatio =
    imageConfig.aspectRatio != null ? String(imageConfig.aspectRatio).trim() : '1:1';
  const imageSize =
    imageConfig.imageSize != null ? String(imageConfig.imageSize).trim().toLowerCase() : '1k';
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelKey)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: { aspectRatio, imageSize },
        },
      }),
    },
  );
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Gemini image error ${res.status}: ${err.slice(0, 300)}`);
  }
  const data = await res.json();
  // Extract inline image from parts
  const outParts = data?.candidates?.[0]?.content?.parts ?? [];
  for (const part of outParts) {
    if (part?.inlineData?.data && part?.inlineData?.mimeType) {
      const bytes = Uint8Array.from(atob(part.inlineData.data), (c) => c.charCodeAt(0));
      return {
        bytes,
        contentType: part.inlineData.mimeType,
        usageMetadata: data?.usageMetadata ?? null,
      };
    }
  }
  throw new Error('Gemini image generation returned no inline image');
}

/**
 * Imagen image generation via /predict (imagen-* models).
 * @param {string} apiKey
 * @param {string} modelKey
 * @param {string} prompt
 * @param {string} aspectRatio
 */
async function generateImagenPredict(apiKey, modelKey, prompt, aspectRatio) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelKey)}:predict`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { sampleCount: 1, aspectRatio },
      }),
    },
  );
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Imagen error ${res.status}: ${err.slice(0, 300)}`);
  }
  const data = await res.json();
  const pred = data?.predictions?.[0] || data?.generatedImages?.[0];
  const b64 =
    pred?.bytesBase64Encoded ||
    pred?.image?.bytesBase64Encoded ||
    pred?.b64_json ||
    data?.bytesBase64Encoded;
  if (!b64 || typeof b64 !== 'string') throw new Error('Imagen returned no image bytes');
  return { bytes: Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), contentType: 'image/png' };
}

/**
 * @param {unknown} env
 * @param {{ model?: string; prompt: string; size?: string; userId?: string | null; image_url?: string | null }} opts
 */
async function generateGoogle(env, opts) {
  const modelKey = String(opts.model || '').trim();
  if (!modelKey) throw new Error('Google image model required');
  const dims = parseImageDimensions(opts.size);
  const apiKey = await resolveModelApiKey(env, 'google', modelKey, opts.userId);
  if (!apiKey) throw new Error('Google AI API key not configured');

  const aspect = resolveGeminiAspectRatio(dims.width, dims.height);
  const imageSize = resolveGeminiImageSize(dims.width, dims.height);

  // Gemini multimodal models use generateContent; Imagen models use predict
  const isGeminiModel = modelKey.startsWith('gemini-');
  let referenceImage = null;
  const refUrl = opts.image_url != null ? String(opts.image_url).trim() : '';
  if (isGeminiModel && refUrl) {
    try {
      referenceImage = await fetchImageBytes(refUrl);
    } catch (e) {
      console.warn('[image_generation] reference_fetch_failed', e?.message ?? e);
    }
  }
  if (isGeminiModel) {
    const gem = await generateGeminiContent(apiKey, modelKey, opts.prompt, referenceImage, {
      aspectRatio: aspect,
      imageSize,
    });
    return {
      provider: 'google',
      model: modelKey,
      bytes: gem.bytes,
      contentType: gem.contentType,
      preview_urls: [],
      metadata: referenceImage ? { edited_from: refUrl, imageSize, aspectRatio: aspect } : { imageSize, aspectRatio: aspect },
      usageMetadata: gem.usageMetadata,
    };
  }

  const { bytes, contentType } = await generateImagenPredict(apiKey, modelKey, opts.prompt, aspect);

  return {
    provider: 'google',
    model: modelKey,
    bytes,
    contentType,
    preview_urls: [],
    metadata: { aspectRatio: aspect },
  };
}

/**
 * @param {unknown} env
 * @param {{ prompt: string; model?: string; tenantId?: string | null }} opts
 */
async function generateWorkersAi(env, opts) {
  if (!env?.AI) throw new Error('Workers AI not configured');
  let model = opts.model ? String(opts.model).trim() : '';
  if (!model && env.DB && opts.tenantId) {
    const row = await env.DB.prepare(
      `SELECT model_key FROM agentsam_ai
       WHERE mode = 'model' AND status = 'active'
         AND (is_global = 1 OR allowed_tenants_json LIKE ('%"' || ? || '"%'))
         AND LOWER(COALESCE(api_platform, '')) = 'workers_ai'
         AND (
           LOWER(COALESCE(name, '')) LIKE '%image%'
           OR LOWER(model_key) LIKE '%flux%'
         )
       ORDER BY COALESCE(sort_order, 999), COALESCE(input_rate_per_mtok, 999999) ASC
       LIMIT 1`,
    )
      .bind(opts.tenantId)
      .first()
      .catch(() => null);
    model = row?.model_key || '';
  }
  if (!model) model = '@cf/black-forest-labs/flux-1-schnell';
  const result = await env.AI.run(model, { prompt: opts.prompt });
  const bytes = result instanceof ArrayBuffer ? new Uint8Array(result) : new Uint8Array(result);
  return {
    provider: 'workers_ai',
    model,
    bytes,
    contentType: 'image/png',
    preview_urls: [],
    metadata: {},
  };
}

/**
 * @param {unknown} env
 * @param {{
 *   provider?: string;
 *   model?: string;
 *   prompt: string;
 *   size?: string;
 *   quality?: string;
 *   userId?: string | null;
 *   tenantId?: string | null;
 * }} params
 */
export async function generateImage(env, params) {
  const prompt = String(params.prompt || '').trim();
  if (!prompt) throw new Error('prompt required');

  const providerRaw = String(params.provider || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
  const provider = providerRaw.startsWith('openai')
    ? 'openai'
    : providerRaw === 'gemini_api' || providerRaw.startsWith('google') || providerRaw === 'gemini'
      ? 'google'
      : providerRaw;
  const model = params.model ? String(params.model).trim() : '';

  if (provider === 'openai' || provider === 'openai_compatible') {
    return await generateOpenAI(env, {
      model,
      prompt,
      size: params.size,
      quality: params.quality,
      userId: params.userId,
    });
  }
  if (provider === 'google' || provider === 'gemini') {
    return await generateGoogle(env, {
      model,
      prompt,
      size: params.size,
      userId: params.userId,
    });
  }
  if (provider === 'workers_ai' || provider === 'workersai') {
    return await generateWorkersAi(env, {
      model,
      prompt,
      tenantId: params.tenantId,
    });
  }

  return await generateWorkersAi(env, {
    model,
    prompt,
    tenantId: params.tenantId,
  });
}

/**
 * OpenAI-only image edit.
 * @param {unknown} env
 * @param {{ prompt: string; image_url?: string; image?: string; model?: string; size?: string; userId?: string | null }} params
 */
export async function editImage(env, params) {
  const prompt = String(params.prompt || '').trim();
  if (!prompt) throw new Error('prompt required');
  const src = String(params.image_url || params.image || '').trim();
  if (!src) throw new Error('image_url required');

  const modelKey = String(params.model || '').trim();
  if (!modelKey) throw new Error('OpenAI edit model required');
  const apiKey = await resolveModelApiKey(env, 'openai', modelKey, params.userId);
  if (!apiKey) throw new Error('OpenAI API key not configured');

  const { bytes, contentType } = await fetchImageBytes(src);
  const dims = parseImageDimensions(params.size);

  const form = new FormData();
  form.append('model', modelKey);
  form.append('prompt', prompt);
  form.append('size', dims.openAiSize);
  form.append('image', new Blob([bytes], { type: contentType }), 'source.png');

  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`OpenAI edit error ${res.status}: ${err.slice(0, 300)}`);
  }
  const data = await res.json();
  const row = data?.data?.[0];
  const url = typeof row?.url === 'string' ? row.url : null;
  const b64 = typeof row?.b64_json === 'string' ? row.b64_json : null;
  if (url) {
    const fetched = await fetchImageBytes(url);
    return {
      provider: 'openai',
      model: modelKey,
      bytes: fetched.bytes,
      contentType: fetched.contentType,
      preview_urls: [url],
      metadata: {},
    };
  }
  if (b64) {
    return {
      provider: 'openai',
      model: modelKey,
      bytes: Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)),
      contentType: 'image/png',
      preview_urls: [],
      metadata: {},
    };
  }
  throw new Error('OpenAI edit returned no image');
}

/**
 * REST + tool result shape.
 * @param {unknown} env
 * @param {string} toolName
 * @param {Record<string, unknown>} params
 * @param {{ authUser?: { id?: string }; workspaceId?: string | null; tenantId?: string | null; userId?: string | null; origin?: string }} ctx
 */
export async function runImageGenerationForTool(env, toolName, params, ctx = {}) {
  const prompt = String(params.prompt || params.description || '').trim();
  let resolvedParams = await applyImageTierDefaults(env, { ...params, prompt }, {
    workspaceId: ctx.workspaceId,
    tenantId: ctx.tenantId,
    userId: ctx.userId ?? ctx.authUser?.id,
  });
  const ws = ctx.workspaceId != null ? String(ctx.workspaceId).trim() : '';
  if (!resolvedParams.model && ws && prompt) {
    const picked = await pickImageModelFromDb(env, ws, prompt, {
      tenantId: ctx.tenantId,
      userId: ctx.userId ?? ctx.authUser?.id,
      tier: resolvedParams.tier,
      tierMatchedBy: resolvedParams.tier_matched_by,
    });
    if (picked) {
      resolvedParams = {
        ...resolvedParams,
        model: picked.model_key,
        provider: picked.resolved_platform,
        secretKeyName: picked.keyName,
        routing_arm_id: picked.arm_id,
      };
    }
  }

  const isEdit = toolName === 'imgx_edit_image';
  const persist = imageGenerationShouldPersist(resolvedParams);
  const generationId =
    String(resolvedParams.generation_id || '').trim() ||
    `igen_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const dims = parseImageDimensions(resolvedParams.size);
  const purpose =
    resolvedParams.purpose != null ? String(resolvedParams.purpose).trim().slice(0, 64) : null;
  const refUrl = String(resolvedParams.image_url || resolvedParams.image || '').trim();
  const modelKey = String(resolvedParams.model || '').trim();
  const useGeminiEdit = isEdit && refUrl && modelKey.startsWith('gemini-');

  const gen = useGeminiEdit
    ? await generateGoogle(env, {
        prompt,
        model: modelKey,
        size: resolvedParams.size,
        userId: ctx.userId,
        image_url: refUrl,
      })
    : isEdit
      ? await editImage(env, {
          prompt,
          image_url: refUrl,
          model: resolvedParams.model,
          size: resolvedParams.size,
          userId: ctx.userId,
        })
      : await generateImage(env, {
          provider: resolvedParams.provider,
          model: resolvedParams.model,
          prompt,
          size: resolvedParams.size,
          quality: resolvedParams.quality,
          userId: ctx.userId,
          tenantId: ctx.tenantId,
        });

  const previewUrls = [...(gen.preview_urls || [])];
  const billingCtx = {
    quality: normalizeOpenAiImageQuality(modelKey || String(gen.model || ''), resolvedParams.quality),
    openAiSize: dims.openAiSize,
    imageSize: resolveGeminiImageSize(dims.width, dims.height),
  };

  if (!persist) {
    const userId = String(ctx.userId || ctx.authUser?.id || '').trim();
    if (!userId) throw new Error('user_id required for draft image');
    const draftTier =
      resolvedParams.tier === 'draft' ||
      resolvedParams.tier === 'quality' ||
      resolvedParams.tier === 'standard'
        ? /** @type {ImageTier} */ (resolvedParams.tier)
        : (await resolveImageTier(env, prompt, {
            workspaceId: ctx.workspaceId,
            tenantId: ctx.tenantId,
            userId,
            conversationId: ctx.conversationId,
          })).tier;
    const contentTier = contentTierFromImageTier(draftTier);
    const routingArmId =
      resolvedParams.routing_arm_id != null
        ? String(resolvedParams.routing_arm_id).trim() || null
        : null;
    const usageAttached = await attachImageGenerationUsage(
      env?.DB,
      {
        ok: true,
        status: 'draft',
        generation_id: generationId,
        provider: gen.provider,
        model: gen.model,
        preview_urls: previewUrls,
        metadata: { ...(gen.metadata || {}), draft: true, purpose, content_tier: contentTier },
        persist: false,
        usageMetadata: gen.usageMetadata ?? null,
        content_tier: contentTier,
        routing_arm_id: routingArmId,
      },
      billingCtx,
    );
    const draft = await persistImageDraft(env, {
      userId,
      workspaceId: ctx.workspaceId,
      tenantId: ctx.tenantId,
      generationId,
      bytes: gen.bytes,
      contentType: gen.contentType,
      purpose,
      prompt,
      provider: gen.provider,
      model: gen.model,
      width: dims.width,
      height: dims.height,
      origin: ctx.origin,
      contentTier,
      costUsd: usageAttached.cost_usd ?? usageAttached.usage?.cost_usd ?? null,
      routingArmId,
    });
    if (draft.preview_url && !previewUrls.includes(draft.preview_url)) {
      previewUrls.push(draft.preview_url);
    }
    return {
      ...usageAttached,
      status: 'draft',
      generation_id: draft.generation_id,
      preview_url: draft.preview_url,
      image_url: draft.preview_url,
      public_url: draft.preview_url,
      url: draft.preview_url,
      expires_at: draft.expires_at,
      r2_key: draft.r2_key,
      preview_urls: previewUrls,
      content_tier: contentTier,
      routing_arm_id: routingArmId,
      cost_usd: draft.cost_usd ?? usageAttached.cost_usd,
    };
  }

  const uploaded = await uploadImageBytesToR2(env, gen.bytes, gen.contentType, {
    authUser: ctx.authUser,
    workspaceId: ctx.workspaceId,
    origin: ctx.origin,
  });

  if (uploaded.image_url && !previewUrls.includes(uploaded.image_url)) {
    previewUrls.push(uploaded.image_url);
  }

  return attachImageGenerationUsage(
    env?.DB,
    {
      ok: true,
      status: 'saved',
      generation_id: generationId,
      image_url: uploaded.image_url,
      public_url: uploaded.image_url,
      url: uploaded.image_url,
      preview_url: uploaded.image_url,
      r2_key: uploaded.r2_key,
      artifact_id: uploaded.artifact_id,
      provider: gen.provider,
      model: gen.model,
      preview_urls: previewUrls,
      metadata: gen.metadata || {},
      persist: true,
      usageMetadata: gen.usageMetadata ?? null,
    },
    billingCtx,
  );
}

/**
 * Run image tool with cinematic SSE progress (agent chat).
 * @param {(type: string, payload: Record<string, unknown>) => void} emit
 * @param {unknown} env
 * @param {string} toolName
 * @param {Record<string, unknown>} params
 * @param {Record<string, unknown>} ctx
 */
export async function streamImageGenerationSse(emit, env, toolName, params, ctx = {}) {
  const generationId = `igen_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const prompt = String(params.prompt || params.description || '').trim();
  let resolvedParams = await applyImageTierDefaults(env, { ...params, prompt }, {
    workspaceId: ctx.workspaceId,
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    conversationId: ctx.conversationId,
  });
  const dims = parseImageDimensions(resolvedParams.size);
  const tier = /** @type {ImageTier} */ (resolvedParams.tier || 'standard');
  const tierMatchedBy = String(resolvedParams.tier_matched_by || 'keyword');
  const isEdit = toolName === 'imgx_edit_image';
  if (!imageGenerationShouldPersist(resolvedParams)) {
    resolvedParams = { ...resolvedParams, persist: false };
  }

  const ws = ctx.workspaceId != null ? String(ctx.workspaceId).trim() : '';
  let providerGuess = 'workers_ai';
  let modelGuess = resolvedParams.model ? String(resolvedParams.model).trim() : '';
  let scoredModelKey = modelGuess || null;
  const contentTier = contentTierFromImageTier(tier);

  if (isEdit) {
    providerGuess = 'openai';
  } else if (!modelGuess && ws && prompt) {
    const picked = await pickImageModelFromDb(env, ws, prompt, {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      conversationId: ctx.conversationId,
      tier,
      tierMatchedBy,
    });
    if (picked) {
      console.log('[image_generation] inferred_tier', {
        tier,
        tier_matched_by: tierMatchedBy,
        lane: imageLaneFromTier(tier, false, prompt),
        model_key: picked.model_key,
      });
      scoredModelKey = picked.model_key;
      providerGuess = String(picked.resolved_platform || 'workers_ai');
      modelGuess = scoredModelKey;
      resolvedParams = {
        ...resolvedParams,
        model: scoredModelKey,
        provider: providerGuess,
        secretKeyName: picked.keyName,
        routing_arm_id: picked.arm_id,
      };
    }
  } else if (modelGuess && !resolvedParams.provider) {
    providerGuess = String(resolvedParams.provider || providerGuess);
  }
  if (resolvedParams.provider) {
    providerGuess = String(resolvedParams.provider);
  }

  emit('image_generation_started', {
    type: 'image_generation_started',
    generation_id: generationId,
    provider: providerGuess,
    model: String(modelGuess || ''),
    prompt: prompt.slice(0, 500),
    tier,
    content_tier: contentTier,
    width: dims.width,
    height: dims.height,
  });

  let tickIndex = 0;
  let frameIndex = 0;
  const progressTimer = setInterval(() => {
    const tick = IMAGE_PROGRESS_TICKS[tickIndex % IMAGE_PROGRESS_TICKS.length];
    tickIndex += 1;
    emit('image_generation_progress', {
      type: 'image_generation_progress',
      generation_id: generationId,
      progress: tick.progress,
      stage: tick.stage,
      message: tick.message,
      preview_frame: frameIndex,
    });
  }, PROGRESS_INTERVAL_MS);

  // Immediate first tick
  const first = IMAGE_PROGRESS_TICKS[0];
  emit('image_generation_progress', {
    type: 'image_generation_progress',
    generation_id: generationId,
    progress: first.progress,
    stage: first.stage,
    message: first.message,
    preview_frame: 0,
  });
  tickIndex = 1;

  const scoredT0 = Date.now();
  try {
    const result = await runImageGenerationForTool(
      env,
      toolName,
      { ...resolvedParams, generation_id: generationId },
      ctx,
    );
    const outcomeCost = result?.cost_usd ?? result?.usage?.cost_usd ?? null;
    if (scoredModelKey && ws) {
      await recordImageModelOutcome(env, scoredModelKey, ws, true, Date.now() - scoredT0, {
        costUsd: outcomeCost,
        contentTier: result?.content_tier || contentTier,
        tenantId: ctx.tenantId,
        userId: ctx.userId || ctx.authUser?.id,
        routingArmId: result?.routing_arm_id || resolvedParams.routing_arm_id || null,
        provider: result?.provider || providerGuess,
        generationId: result?.generation_id || generationId,
      });
    }

    for (const previewUrl of result.preview_urls || []) {
      if (!previewUrl) continue;
      frameIndex += 1;
      emit('image_generation_preview', {
        type: 'image_generation_preview',
        generation_id: generationId,
        preview_url: previewUrl,
        frame_index: frameIndex,
      });
    }
    if (result.image_url) {
      frameIndex += 1;
      emit('image_generation_preview', {
        type: 'image_generation_preview',
        generation_id: generationId,
        preview_url: result.image_url,
        frame_index: frameIndex,
      });
    }

    emit('image_generation_complete', {
      type: 'image_generation_complete',
      generation_id: result.generation_id || generationId,
      status: result.status || (result.persist ? 'saved' : 'draft'),
      preview_url: result.preview_url || result.image_url,
      image_url: result.image_url,
      expires_at: result.expires_at,
      r2_key: result.r2_key,
      artifact_id: result.artifact_id,
      provider: result.provider,
      model: result.model,
      persist: result.persist ?? false,
      content_tier: result.content_tier || contentTier,
      cost_usd: outcomeCost,
      routing_arm_id: result.routing_arm_id || resolvedParams.routing_arm_id || null,
    });

    return result;
  } catch (e) {
    if (scoredModelKey && ws) {
      await recordImageModelOutcome(env, scoredModelKey, ws, false, Date.now() - scoredT0, {
        tenantId: ctx.tenantId,
        userId: ctx.userId || ctx.authUser?.id,
        routingArmId: resolvedParams.routing_arm_id || null,
        provider: providerGuess,
        generationId,
      });
    }
    const msg = e?.message != null ? String(e.message) : String(e);
    emit('image_generation_progress', {
      type: 'image_generation_progress',
      generation_id: generationId,
      progress: 100,
      stage: 'failed',
      message: 'Image generation failed',
      preview_frame: frameIndex,
      failed: true,
    });
    throw new Error(msg);
  } finally {
    clearInterval(progressTimer);
  }
}
