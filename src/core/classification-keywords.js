/**
 * D1-backed classification keywords — single table for image intent + image tier.
 * Replaces dual hardcoded regex wordlists (IMAGE_NOUN_RE / classifyImageTier).
 * Bootstrap literals = cold-start only when D1 empty/unavailable.
 */

const BOOTSTRAP = Object.freeze({
  image_intent_noun: [
    'image', 'images', 'photo', 'photos', 'photograph', 'photographs', 'product photo',
    'hero', 'hero image', 'poster', 'wallpaper', 'illustration', 'artwork', 'graphic',
    'thumbnail', 'banner', 'logo', 'render', 'concept art', 'cover', 'visual', 'background',
    'icon', 'avatar', 'picture', 'art', 'mockup', 'favicon', 'og image', 'social card',
    'app icon', 'splash screen', 'ui asset',
  ],
  image_intent_verb: [
    'generate', 'create', 'make', 'design', 'render', 'draw', 'paint', 'produce',
    'craft', 'build', 'illustrate', 'visualize',
  ],
  image_intent_escalate: ['shot', 'scene', 'portrait', 'still life', 'depict', 'depicting'],
  image_tier_draft: [
    'draft', 'rough', 'quick', 'sketch', 'blueprint', 'floor plan', 'house plan', 'site plan',
    'wireframe', 'layout', 'mood board', 'moodboard', 'concept board', 'elevation study',
  ],
  image_tier_quality: [
    'presentation', 'client', 'final', 'high-res', 'high res', 'photorealistic', 'production',
    'investor', 'pitch deck', 'print ready', 'marketing hero',
  ],
});

/** @type {Map<string, { loadedAt: number, patterns: string[], re: RegExp, source: string }>} */
const purposeCache = new Map();
/** @type {Map<string, { loadedAt: number, nouns: string[], verbs: string[], escalateHints: string[], nounRe: RegExp, verbRe: RegExp, escalateRe: RegExp|null, source: string }>} */
const intentBundleCache = new Map();

const CACHE_TTL_MS = 60_000;

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
}

export function compileWordRe(words) {
  const list = [...new Set((words || []).map((w) => String(w || '').trim().toLowerCase()).filter(Boolean))];
  if (!list.length) return /$a/;
  list.sort((a, b) => b.length - a.length);
  return new RegExp(`\\b(?:${list.map(escapeRe).join('|')})\\b`, 'i');
}

/**
 * @param {string} purpose
 */
function bootstrapPurpose(purpose) {
  const patterns = BOOTSTRAP[purpose] || [];
  return {
    loadedAt: Date.now(),
    patterns,
    re: compileWordRe(patterns),
    source: 'bootstrap',
  };
}

/**
 * Load patterns for one purpose from agentsam_classification_keywords (fallback: legacy intent table / bootstrap).
 * @param {unknown} env
 * @param {string} purpose
 */
export async function loadClassificationKeywords(env, purpose) {
  const key = String(purpose || '').trim();
  if (!key) return bootstrapPurpose('image_intent_noun');
  const hit = purposeCache.get(key);
  if (hit && Date.now() - hit.loadedAt < CACHE_TTL_MS) return hit;

  if (!env?.DB) {
    const boot = bootstrapPurpose(key);
    purposeCache.set(key, boot);
    return boot;
  }

  try {
    const { results } = await env.DB.prepare(
      `SELECT pattern FROM agentsam_classification_keywords
       WHERE purpose = ? AND active = 1`,
    )
      .bind(key)
      .all();
    const patterns = (results || [])
      .map((r) => String(r.pattern || '').trim().toLowerCase())
      .filter(Boolean);
    if (patterns.length) {
      const packed = {
        loadedAt: Date.now(),
        patterns,
        re: compileWordRe(patterns),
        source: 'd1',
      };
      purposeCache.set(key, packed);
      return packed;
    }
  } catch (e) {
    console.warn('[classification-keywords] load failed', e?.message ?? e);
  }

  // Legacy fallback for intent purposes (pre-818)
  if (key.startsWith('image_intent_')) {
    try {
      const legacyType =
        key === 'image_intent_noun'
          ? 'noun'
          : key === 'image_intent_verb'
            ? 'verb'
            : key === 'image_intent_escalate'
              ? 'escalate_hint'
              : null;
      if (legacyType) {
        const { results } = await env.DB.prepare(
          `SELECT pattern FROM agentsam_intent_keywords
           WHERE task_type = 'image_generation' AND keyword_type = ? AND active = 1`,
        )
          .bind(legacyType)
          .all();
        const patterns = (results || [])
          .map((r) => String(r.pattern || '').trim().toLowerCase())
          .filter(Boolean);
        if (patterns.length) {
          const packed = {
            loadedAt: Date.now(),
            patterns,
            re: compileWordRe(patterns),
            source: 'd1_legacy',
          };
          purposeCache.set(key, packed);
          return packed;
        }
      }
    } catch {
      /* ignore */
    }
  }

  const boot = bootstrapPurpose(key);
  purposeCache.set(key, boot);
  return boot;
}

/**
 * Intent bundle (nouns/verbs/escalate) — same shape as former loadIntentKeywords.
 * @param {unknown} env
 * @param {string} [_taskType]
 */
export async function loadIntentKeywords(env, _taskType = 'image_generation') {
  const cacheKey = 'image_generation';
  const hit = intentBundleCache.get(cacheKey);
  if (hit && Date.now() - hit.loadedAt < CACHE_TTL_MS) return hit;

  const [nouns, verbs, escalate] = await Promise.all([
    loadClassificationKeywords(env, 'image_intent_noun'),
    loadClassificationKeywords(env, 'image_intent_verb'),
    loadClassificationKeywords(env, 'image_intent_escalate'),
  ]);

  const packed = {
    loadedAt: Date.now(),
    nouns: nouns.patterns,
    verbs: verbs.patterns,
    escalateHints: escalate.patterns,
    nounRe: nouns.re,
    verbRe: verbs.re,
    escalateRe: escalate.patterns.length ? escalate.re : null,
    source: [nouns.source, verbs.source, escalate.source].every((s) => s === 'd1')
      ? 'd1'
      : nouns.source === 'bootstrap'
        ? 'bootstrap'
        : 'mixed',
  };
  intentBundleCache.set(cacheKey, packed);
  return packed;
}

/** Test helper — clear isolate caches. */
export function clearClassificationKeywordCache() {
  purposeCache.clear();
  intentBundleCache.clear();
}

/** @deprecated use clearClassificationKeywordCache */
export function clearIntentKeywordCache() {
  clearClassificationKeywordCache();
}
