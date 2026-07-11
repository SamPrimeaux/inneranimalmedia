/**
 * D1-backed intent keyword lists — replaces hardcoded JS wordlists as SSOT.
 * Bootstrap literals remain only as cold-start fallback when D1 is empty/unavailable.
 */

const BOOTSTRAP = Object.freeze({
  image_generation: {
    noun: [
      'image', 'images', 'photo', 'photos', 'photograph', 'photographs', 'product photo',
      'hero', 'hero image', 'poster', 'wallpaper', 'illustration', 'artwork', 'graphic',
      'thumbnail', 'banner', 'logo', 'render', 'concept art', 'cover', 'visual', 'background',
      'icon', 'avatar', 'picture', 'art', 'mockup', 'favicon', 'og image', 'social card',
      'app icon', 'splash screen', 'ui asset',
    ],
    verb: [
      'generate', 'create', 'make', 'design', 'render', 'draw', 'paint', 'produce',
      'craft', 'build', 'illustrate', 'visualize',
    ],
    escalate_hint: ['shot', 'scene', 'portrait', 'still life', 'depict', 'depicting'],
  },
});

/** @type {Map<string, { loadedAt: number, nouns: string[], verbs: string[], escalateHints: string[], nounRe: RegExp, verbRe: RegExp, escalateRe: RegExp|null }>} */
const cache = new Map();
const CACHE_TTL_MS = 60_000;

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
}

function compileWordRe(words) {
  const list = [...new Set((words || []).map((w) => String(w || '').trim().toLowerCase()).filter(Boolean))];
  if (!list.length) return /$a/; // never matches
  // Longer phrases first so "product photo" beats "photo"
  list.sort((a, b) => b.length - a.length);
  return new RegExp(`\\b(?:${list.map(escapeRe).join('|')})\\b`, 'i');
}

function fromBootstrap(taskType) {
  const b = BOOTSTRAP[taskType] || { noun: [], verb: [], escalate_hint: [] };
  return {
    loadedAt: Date.now(),
    nouns: b.noun,
    verbs: b.verb,
    escalateHints: b.escalate_hint || [],
    nounRe: compileWordRe(b.noun),
    verbRe: compileWordRe(b.verb),
    escalateRe: (b.escalate_hint || []).length ? compileWordRe(b.escalate_hint) : null,
    source: 'bootstrap',
  };
}

/**
 * @param {unknown} env
 * @param {string} taskType
 */
export async function loadIntentKeywords(env, taskType = 'image_generation') {
  const key = String(taskType || 'image_generation').trim() || 'image_generation';
  const hit = cache.get(key);
  if (hit && Date.now() - hit.loadedAt < CACHE_TTL_MS) return hit;

  if (!env?.DB) {
    const boot = fromBootstrap(key);
    cache.set(key, boot);
    return boot;
  }

  try {
    const { results } = await env.DB.prepare(
      `SELECT keyword_type, pattern FROM agentsam_intent_keywords
       WHERE task_type = ? AND active = 1`,
    )
      .bind(key)
      .all();
    const nouns = [];
    const verbs = [];
    const escalateHints = [];
    for (const row of results || []) {
      const t = String(row.keyword_type || '').trim();
      const p = String(row.pattern || '').trim().toLowerCase();
      if (!p) continue;
      if (t === 'noun') nouns.push(p);
      else if (t === 'verb') verbs.push(p);
      else if (t === 'escalate_hint') escalateHints.push(p);
    }
    if (!nouns.length && !verbs.length) {
      const boot = fromBootstrap(key);
      cache.set(key, boot);
      return boot;
    }
    const packed = {
      loadedAt: Date.now(),
      nouns,
      verbs,
      escalateHints,
      nounRe: compileWordRe(nouns),
      verbRe: compileWordRe(verbs),
      escalateRe: escalateHints.length ? compileWordRe(escalateHints) : null,
      source: 'd1',
    };
    cache.set(key, packed);
    return packed;
  } catch (e) {
    console.warn('[intent-keywords] load failed', e?.message ?? e);
    const boot = fromBootstrap(key);
    cache.set(key, boot);
    return boot;
  }
}

/** Test helper — clear isolate cache. */
export function clearIntentKeywordCache() {
  cache.clear();
}
