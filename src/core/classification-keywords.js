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
  // chat_intent_* — cold-start when D1 empty (parity with migrations/824 seed)
  chat_intent_workflow_orchestration: ['run workflow', 'start workflow', 'trigger workflow', 'execute workflow', 'agentic run'],
  chat_intent_deploy: ['deploy', 'wrangler deploy', 'npm run deploy', 'push to prod', 'promote', 'cloudflare build'],
  chat_intent_multitask: ['orchestrate', 'multi-step', 'multi-agent', 'end-to-end', 'build-and-deploy'],
  chat_intent_agent_spawn: ['spawn subagent', 'delegate to', 'subagent'],
  chat_intent_supabase_migration: ['supabase migration', 'alter postgres', 'rls policy', 'row level security', 'propose migration'],
  chat_intent_supabase_write: ['supabase write', 'insert into supabase', 'update postgres', 'delete from supabase'],
  chat_intent_supabase_query: ['supabase query', 'query postgres', 'select from supabase', 'supabase table'],
  chat_intent_supabase_vector: ['pgvector', 'supabase vector', 'supabase embedding'],
  chat_intent_d1_write: ['insert into', 'd1 write', 'bulk insert', 'populate table', 'store in d1'],
  chat_intent_d1_query: ['d1_query', 'what tables', 'which tables'],
  chat_intent_r2_ops: ['r2 bucket', 'list r2', 'upload to'],
  chat_intent_cf_ops: ['wrangler', 'durable object', 'kv namespace', 'd1 migrate'],
  chat_intent_terminal_execution: ['run command', 'terminal', 'bash'],
  chat_intent_web_search: ['search the web', 'web search', 'look it up online'],
  chat_intent_vectorize: ['vectorize', 'semantic search', 'knowledge base'],
  chat_intent_github: ['github', 'pull request', 'git push'],
  chat_intent_sql_d1_generation: ['create table', 'alter table'],
  chat_intent_debug: ['debug', 'not working', 'stack trace', 'diagnose'],
  chat_intent_search_code: ['grep', 'find in codebase', 'where is', 'find where', 'is defined', 'search codebase', 'locate file'],
  chat_intent_refactor: ['refactor', 'extract function'],
  chat_intent_review: ['code review', 'audit'],
  chat_intent_code: ['implement', 'edit file', 'fix file', 'create file', 'worker.js', '.tsx', '.jsx'],
  chat_intent_plan: ['roadmap', 'architect', 'wireframe', 'task breakdown'],
  chat_intent_browser: ['screenshot', 'playwright', 'puppeteer', 'open the browser', 'navigate to', 'dom inspect'],
  chat_intent_skill_use: ['use skill', 'run skill'],
  chat_intent_tool_use: ['use tool', 'mcp tool'],
  chat_intent_cms_edit: ['cms page', 'shopify'],
  chat_intent_mail_compose: ['reply to this email', 'draft a reply', 'draft a new email', 'compose email'],
  chat_intent_mail_sweep: ['sweep my inbox', 'bulk classify inbox'],
  chat_intent_gmail: ['check my inbox', 'check my email', 'unread emails', 'my inbox', 'triage my inbox'],
  chat_intent_recall: ['recall', 'remind me'],
  chat_intent_explain: ['explain', 'how does', 'eli5'],
  chat_intent_escalate: ['maybe', 'not sure', 'figure out', 'help me decide', 'which is better', 'should i', 'pros and cons', 'either way', 'not certain', 'torn between', 'what would you do'],
});

/** Ordered walk for chat intent — must match classify-intent priority law. */
export const CHAT_INTENT_TASK_PRIORITY = Object.freeze([
  'workflow_orchestration',
  'deploy',
  'multitask',
  'agent_spawn',
  'supabase_migration',
  'supabase_write',
  'supabase_query',
  'supabase_vector',
  'd1_write',
  'd1_query',
  'r2_ops',
  'cf_ops',
  'terminal_execution',
  'web_search',
  'vectorize',
  'github',
  'sql_d1_generation',
  'debug',
  'search_code',
  'refactor',
  'review',
  'code',
  'plan',
  'browser',
  'skill_use',
  'tool_use',
  'cms_edit',
  'mail_compose',
  'mail_sweep',
  'gmail',
  'recall',
  'explain',
]);

export function chatIntentPurpose(taskType) {
  return `chat_intent_${String(taskType || '').trim()}`;
}

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
  const parts = list.map((w) => {
    const esc = escapeRe(w);
    const lead = /^\w/.test(w) ? '\\b' : '';
    const trail = /\w$/.test(w) ? '\\b' : '';
    return `${lead}${esc}${trail}`;
  });
  return new RegExp(`(?:${parts.join('|')})`, 'i');
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
