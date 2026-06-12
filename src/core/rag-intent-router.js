/**
 * D1-backed intent → semantic lane order. Falls back to code defaults when DB unavailable.
 */

/** @type {Record<string, string[]>} */
export const DEFAULT_RAG_INTENT_ROUTES = Object.freeze({
  schema_question: ['schema_semantic_search', 'docs_knowledge_search', 'code_semantic_search'],
  code_question: ['code_semantic_search', 'docs_knowledge_search', 'schema_semantic_search'],
  docs_question: ['docs_knowledge_search', 'memory_semantic_search', 'code_semantic_search'],
  memory_question: ['memory_semantic_search', 'docs_knowledge_search'],
  client_project_question: [
    'client_project_semantic_search',
    'memory_semantic_search',
    'docs_knowledge_search',
  ],
  create_surfaces: ['code_semantic_search', 'docs_knowledge_search', 'memory_semantic_search'],
  architecture_question: ['deep_archive_search', 'docs_knowledge_search', 'schema_semantic_search'],
});

const INTENT_CACHE_TTL_SEC = 300;

/**
 * @param {unknown} message
 * @returns {string|null}
 */
export function classifyRagIntentKey(message) {
  const m = String(message || '').toLowerCase();
  if (!m) return null;

  if (
    /\b(design studio|moviemode|movie mode|cms suite|excalidraw|\/dashboard\/draw|create surface)\b/i.test(m)
  ) {
    return 'create_surfaces';
  }
  if (
    /\b(deep archive|golden architecture|platform baseline|binding map|runtime architecture)\b/i.test(m)
  ) {
    return 'architecture_question';
  }
  if (
    /\b(what tables|which tables|schema support|d1 table|migration|agentsam_|hyperdrive|column)\b/i.test(m)
  ) {
    return 'schema_question';
  }
  if (
    /\b(route|component|handler|app\.tsx|worker|function|file|codebase|src\/|dashboard\/)\b/i.test(m) &&
    !/\b(find|grep)\b/i.test(m)
  ) {
    return 'code_question';
  }
  if (/\b(remember|we decided|prior session|memory)\b/i.test(m)) {
    return 'memory_question';
  }
  if (
    /\b(client|customer|tenant|account)\b/i.test(m) &&
    /\b(project|onboarding|contract|deliverable|milestone|kickoff|scope|sow)\b/i.test(m)
  ) {
    return 'client_project_question';
  }
  if (/\b(doc|runbook|recipe|roadmap|workflow|knowledge)\b/i.test(m)) {
    return 'docs_question';
  }
  return null;
}

function parseLaneOrderJson(raw) {
  if (!raw) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return null;
    return parsed.map((x) => String(x || '').trim()).filter(Boolean);
  } catch {
    return null;
  }
}

/**
 * @param {any} env
 * @returns {Promise<Record<string, string[]>>}
 */
export async function loadRagIntentRoutes(env) {
  const cacheKey = 'rag_intent_routes:v1';
  if (env?.SESSION_CACHE?.get) {
    try {
      const cached = await env.SESSION_CACHE.get(cacheKey, 'json');
      if (cached && typeof cached === 'object') return { ...DEFAULT_RAG_INTENT_ROUTES, ...cached };
    } catch {
      /* ignore */
    }
  }

  const out = { ...DEFAULT_RAG_INTENT_ROUTES };
  if (!env?.DB) return out;

  try {
    const res = await env.DB.prepare(
      `SELECT intent_key, lane_order_json FROM agentsam_rag_intent_routes
       WHERE COALESCE(is_active, 1) = 1`,
    ).all();
    for (const row of res?.results || []) {
      const key = row?.intent_key != null ? String(row.intent_key).trim() : '';
      const lanes = parseLaneOrderJson(row?.lane_order_json);
      if (key && lanes?.length) out[key] = lanes;
    }
  } catch {
    /* table may not exist until migration 619 */
  }

  if (env?.SESSION_CACHE?.put) {
    try {
      await env.SESSION_CACHE.put(cacheKey, JSON.stringify(out), {
        expirationTtl: INTENT_CACHE_TTL_SEC,
      });
    } catch {
      /* ignore */
    }
  }
  return out;
}

/**
 * @param {any} env
 * @param {unknown} message
 * @returns {Promise<{ intent_key: string|null, lane_order: string[], primary_lane: string|null }>}
 */
export async function resolveRagIntentLaneOrder(env, message) {
  const intentKey = classifyRagIntentKey(message);
  const routes = await loadRagIntentRoutes(env);
  const laneOrder = intentKey && routes[intentKey] ? routes[intentKey] : [];
  return {
    intent_key: intentKey,
    lane_order: laneOrder,
    primary_lane: laneOrder[0] || null,
  };
}
