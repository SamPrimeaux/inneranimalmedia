/**
 * Core Layer: Model Auto-Routing
 * Classifies user intent and selects the appropriate model from model_routing_rules + ai_models.
 * Zero hardcoded model strings — all routing decisions come from D1.
 */

// ─── Intent Classification ────────────────────────────────────────────────────

const INTENT_TASK_MAP = {
  sql:      'run_d1_query',
  shell:    'debug',
  question: 'chat_simple',
  mixed:    'agent_chat',
};

/**
 * Map a classified intent slug to a model_routing_rules task_type.
 */
export function intentToModelRoutingTaskType(intent) {
  return INTENT_TASK_MAP[intent] ?? 'chat_simple';
}

/**
 * Classify the intent of a user message by looking up agent_intent_patterns in D1.
 * Returns { intent, confidence } or { intent: 'mixed' } on failure.
 */
export async function classifyIntent(env, userContent) {
  if (!env.DB || !userContent) return { intent: 'mixed' };

  const text = String(userContent).toLowerCase().slice(0, 2000);

  try {
    const { results } = await env.DB.prepare(
      `SELECT intent_slug, pattern_text, match_type
       FROM agent_intent_patterns
       WHERE is_active = 1
       ORDER BY priority ASC`
    ).all();

    if (!results?.length) return { intent: 'mixed' };

    for (const row of results) {
      const pattern = String(row.pattern_text || '').toLowerCase();
      if (!pattern) continue;

      if (row.match_type === 'contains' && text.includes(pattern)) {
        return { intent: row.intent_slug, matched_pattern: pattern };
      }
      if (row.match_type === 'starts_with' && text.startsWith(pattern)) {
        return { intent: row.intent_slug, matched_pattern: pattern };
      }
      if (row.match_type === 'regex') {
        try {
          if (new RegExp(pattern, 'i').test(text)) {
            return { intent: row.intent_slug, matched_pattern: pattern };
          }
        } catch (_) {}
      }
    }

    return { intent: 'mixed' };
  } catch (_) {
    return { intent: 'mixed' };
  }
}

// ─── Model Resolution ─────────────────────────────────────────────────────────

/**
 * Resolve the best available fallback model from ai_models.
 * Returns the cheapest active model by input_rate_per_mtok, or null.
 */
async function resolveFallbackModel(env) {
  if (!env.DB) return null;
  try {
    return await env.DB.prepare(
      `SELECT * FROM ai_models
       WHERE is_active = 1 AND show_in_picker = 1 AND supports_tools = 1
       ORDER BY input_rate_per_mtok ASC
       LIMIT 1`
    ).first();
  } catch (_) {
    return null;
  }
}

/**
 * Select a model for Auto mode.
 * Pipeline:
 *   1. Classify intent from userContent
 *   2. Map intent → task_type
 *   3. Look up model_routing_rules by task_type
 *   4. Apply perf_override if score > 0
 *   5. Resolve model row from ai_models
 *   6. Fall back to cheapest active model if nothing found
 *
 * @param {object} env
 * @param {string} userContent - the last user message text
 * @param {boolean} returnIntent - if true, returns { model, intent, taskType }
 * @returns {Promise<object|{model, intent, taskType}>}
 */
export async function selectAutoModel(env, userContent, returnIntent = false) {
  try {
    const classification = await classifyIntent(env, userContent);
    const intent         = classification?.intent || 'mixed';
    const taskType       = intentToModelRoutingTaskType(intent);

    let routingRule = null;
    if (env.DB) {
      try {
        routingRule = await env.DB.prepare(
          `SELECT
             task_type,
             primary_model       AS target_model_key,
             provider            AS target_provider,
             fallback_model      AS fallback_model_key,
             perf_override_model,
             perf_override_provider,
             performance_score,
             success_rate,
             avg_latency_ms
           FROM model_routing_rules
           WHERE task_type = ? AND is_active = 1
           LIMIT 1`
        ).bind(taskType).first();
      } catch (e) {
        console.warn('[routing] model_routing_rules lookup failed:', e?.message ?? e);
      }
    }

    // Determine target model key + provider from routing rule
    let autoModelKey;
    let autoProvider;

    if (
      routingRule?.perf_override_model &&
      routingRule?.performance_score != null &&
      Number(routingRule.performance_score) > 0
    ) {
      autoModelKey = routingRule.perf_override_model;
      autoProvider = routingRule.perf_override_provider || routingRule.target_provider || null;
    } else if (routingRule?.target_model_key) {
      autoModelKey = routingRule.target_model_key;
      autoProvider = routingRule.target_provider || null;
    } else {
      // No routing rule — use cheapest active model
      const fallback = await resolveFallbackModel(env);
      if (returnIntent) return { model: fallback, intent, taskType };
      return fallback;
    }

    // Resolve model row from ai_models
    let model = null;
    if (env.DB && autoModelKey) {
      try {
        model = await env.DB.prepare(
          `SELECT * FROM ai_models WHERE model_key = ? AND is_active = 1 LIMIT 1`
        ).bind(autoModelKey).first();
      } catch (_) {}
    }

    // Try fallback_model_key if primary not found
    if (!model && routingRule?.fallback_model_key) {
      try {
        model = await env.DB.prepare(
          `SELECT * FROM ai_models WHERE model_key = ? AND is_active = 1 LIMIT 1`
        ).bind(routingRule.fallback_model_key).first();
      } catch (_) {}
    }

    // Last resort: cheapest active model
    if (!model) {
      model = await resolveFallbackModel(env);
    }

    if (returnIntent) return { model, intent, taskType };
    return model;
  } catch (error) {
    console.error('[routing] selectAutoModel failed:', error);
    return resolveFallbackModel(env);
  }
}
