/**
 * Core Layer: Systematic Tool Selection
 *
 * Loads tools for each agent request using a 4-layer safety model:
 *
 *   Layer 1 — Health gate       enabled=1 AND is_degraded=0
 *   Layer 2 — Mode gate         modes_json contains current mode
 *   Layer 3 — Intent allowlist  intent_category_tags match allowed set
 *   Layer 4 — Risk gate         hard blocks by mode+risk_level
 *
 * Design goals:
 *   - Allowlist only: a tool not in the allowed set is invisible to the model
 *   - Token efficient: load descriptions only; schemas loaded on demand
 *   - Prompt injection resistant: no way to call a blocked tool via chat
 *   - No hardcoded tool names in logic — all driven by DB tags
 */

// ─── Intent → Category Allowlist ─────────────────────────────────────────────
//
// Each intent maps to the category tags that are ALLOWED for that intent.
// The SQL query uses these to build the WHERE clause.
// Tags must exactly match values in mcp_registered_tools.intent_category_tags.
//
// Convention: 'search' tag = safe reads. 'destructive' tag = needs confirmation.
// Never list 'terminal' here unless the intent genuinely needs shell execution.

export const INTENT_CATEGORY_MAP = {
  // ── Generic classifiers ─────────────────────────────────────────────────────
  question:  ['search', 'rag', 'context', 'platform', 'time', 'reasoning'],
  mixed:     ['search', 'rag', 'context', 'db', 'r2_read', 'platform', 'reasoning', 'time'],
  help:      ['search', 'context', 'platform', 'reasoning'],

  // ── Code / build ────────────────────────────────────────────────────────────
  // r2_write is explicitly included — this was the reported gap
  code:      ['search', 'rag', 'context', 'reasoning', 'workflow',
               'filesystem', 'r2_read', 'r2_write',
               'github_read', 'db', 'storage'],
  intent_build: ['search', 'rag', 'context', 'reasoning', 'workflow',
                 'filesystem', 'r2_read', 'r2_write',
                 'github_read', 'db', 'storage'],

  // ── Database ─────────────────────────────────────────────────────────────────
  sql:           ['db', 'search', 'context', 'reasoning'],
  run_d1_query:  ['db', 'search', 'context', 'reasoning'],
  create_migration: ['db', 'reasoning'],
  write_migration:  ['db', 'reasoning'],

  // ── Shell / terminal ─────────────────────────────────────────────────────────
  // Terminal only appears here — NOT in code/question/plan intents
  shell:         ['terminal', 'filesystem', 'search', 'context', 'reasoning'],
  workspace_code:['filesystem', 'r2_read', 'search', 'context', 'reasoning'],

  // ── Deploy ───────────────────────────────────────────────────────────────────
  deploy:        ['deploy', 'terminal', 'db', 'search', 'github_read', 'reasoning'],
  deploy_worker: ['deploy', 'terminal', 'db', 'search', 'github_read', 'reasoning'],
  deploy_system: ['deploy', 'terminal', 'db', 'search', 'github_read', 'reasoning'],
  intent_deploy: ['deploy', 'terminal', 'db', 'search', 'github_read', 'reasoning'],
  deployment:    ['deploy', 'terminal', 'db', 'search', 'github_read', 'reasoning'],
  new_worker_pipeline: ['deploy', 'terminal', 'filesystem', 'r2_read', 'r2_write',
                        'github_read', 'db', 'reasoning', 'workflow'],

  // ── Debug ────────────────────────────────────────────────────────────────────
  intent_debug:   ['db', 'telemetry', 'browser', 'filesystem', 'search', 'context',
                   'r2_read', 'github_read', 'reasoning'],
  debug_endpoint: ['db', 'telemetry', 'browser', 'filesystem', 'search', 'context',
                   'r2_read', 'github_read', 'reasoning'],
  problem_solving:['db', 'telemetry', 'browser', 'search', 'context',
                   'r2_read', 'reasoning'],
  monitoring:     ['db', 'telemetry', 'search', 'context', 'platform', 'reasoning'],

  // ── Plan / architecture ───────────────────────────────────────────────────────
  intent_plan:    ['search', 'rag', 'context', 'db', 'r2_read', 'draw',
                   'github_read', 'platform', 'reasoning', 'workflow'],
  plan_architecture: ['search', 'rag', 'context', 'db', 'r2_read', 'draw',
                      'platform', 'reasoning', 'workflow'],

  // ── Storage / R2 ─────────────────────────────────────────────────────────────
  r2_storage:  ['r2_read', 'r2_write', 'storage', 'search'],
  analyze_r2:  ['r2_read', 'storage', 'search', 'db'],

  // ── Browser / CDT ─────────────────────────────────────────────────────────────
  browser_cdt: ['browser', 'quality', 'search'],
  generate_ui: ['browser', 'draw', 'r2_read', 'r2_write', 'filesystem',
                'search', 'reasoning'],
  preview_browser: ['browser', 'r2_read', 'r2_write', 'search'],
  intent_accessibility_audit: ['browser', 'quality', 'search'],

  // ── GitHub ────────────────────────────────────────────────────────────────────
  github_git:  ['github_read', 'github_write', 'search', 'terminal', 'db'],

  // ── Media / image ─────────────────────────────────────────────────────────────
  image_generation:    ['media', 'r2_write', 'integrations', 'storage'],
  intent_imgx_generate:['media', 'r2_write', 'integrations'],
  intent_imgx_edit:    ['media', 'r2_write', 'integrations'],
  '3d_models':         ['media', 'r2_write'],
  convert_docs:        ['media', 'filesystem', 'r2_read'],

  // ── Draw / canvas ─────────────────────────────────────────────────────────────
  excalidraw_canvas: ['draw', 'ui', 'r2_read', 'r2_write', 'search'],

  // ── Context / memory ──────────────────────────────────────────────────────────
  intent_optimize_context: ['context', 'search', 'reasoning'],
  intent_search_knowledge: ['search', 'rag', 'context'],
  intent_chunk_document:   ['context', 'search', 'reasoning'],
  context_ops:             ['context', 'search', 'reasoning'],
  memory_store:            ['context', 'db', 'search'],

  // ── Finance / clients ─────────────────────────────────────────────────────────
  financial:       ['db', 'platform', 'search', 'reasoning'],
  analyze_costs:   ['db', 'telemetry', 'platform', 'search', 'reasoning'],
  optimize_costs:  ['db', 'telemetry', 'search', 'reasoning'],
  client_work:     ['db', 'platform', 'search', 'context'],
  client_onboarding:['db', 'platform', 'search', 'email', 'context'],

  // ── Email ─────────────────────────────────────────────────────────────────────
  email_resend:    ['email', 'db', 'context', 'search'],

  // ── Telemetry ─────────────────────────────────────────────────────────────────
  telemetry_analytics: ['telemetry', 'db', 'search', 'reasoning'],

  // ── Agent Sam ─────────────────────────────────────────────────────────────────
  agentsam_autonomous: ['agent', 'agentsam', 'db', 'reasoning'],

  // ── Shinshu (client CMS) ──────────────────────────────────────────────────────
  shinshu_page_edit:  ['shinshu', 'search'],
  shinshu_nav:        ['shinshu', 'search'],
  shinshu_settings:   ['shinshu', 'search'],
  shinshu_media:      ['shinshu', 'search'],
  shinshu_devops:     ['shinshu', 'github_read', 'search'],
  shinshu_email:      ['shinshu', 'email'],
  shinshu_knowledge:  ['shinshu', 'search'],

  // ── Misc ──────────────────────────────────────────────────────────────────────
  google_drive:          ['integrations', 'search'],
  status_overview:       ['db', 'search', 'context', 'platform', 'telemetry'],
  export_database_schema:['db', 'search', 'reasoning'],
  google_drive_ops:      ['integrations', 'search'],
};

// ─── Mode Risk Gates ──────────────────────────────────────────────────────────
//
// Defines what risk levels are HARD BLOCKED per mode.
// These are applied in SQL regardless of intent allowlist.
// Allowlist + mode gate = two independent locks on dangerous tools.

export const MODE_RISK_BLOCKS = {
  ask:   ['high', 'medium'],  // ask: only risk_level=none and risk_level=low allowed
  plan:  ['high'],             // plan: medium allowed with confirmation, high blocked
  agent: [],                   // agent: all risk levels allowed (but high requires_approval=1)
  debug: ['high'],             // debug: inspection only, no terminal/deploy
};

// ─── Hardcoded Category Blocks Per Mode ──────────────────────────────────────
//
// These tags are NEVER allowed in these modes, period.
// Defense against prompt injection: even if INTENT_CATEGORY_MAP has 'terminal',
// the mode gate ensures terminal never appears in ask/plan/debug tool sets.

export const MODE_CATEGORY_BLOCKS = {
  ask:   ['terminal', 'deploy', 'destructive', 'github_write'],
  plan:  ['terminal', 'deploy', 'github_write'],
  agent: [],
  debug: ['terminal', 'deploy', 'github_write'],
};

// ─── Baseline Tools ───────────────────────────────────────────────────────────
//
// Tools that are ALWAYS included regardless of intent — too lightweight
// to exclude and needed for model orientation. All are risk_level=none.

const BASELINE_TAGS = ['reasoning', 'time', 'platform'];

// ─── Tool Loader ──────────────────────────────────────────────────────────────

/**
 * Load the tool set for a given mode + intent combination.
 *
 * Security model:
 *   1. Allowlist: only categories in INTENT_CATEGORY_MAP[intent] are eligible
 *   2. Mode gate: MODE_CATEGORY_BLOCKS[mode] hard-removes entire categories
 *   3. Risk gate: MODE_RISK_BLOCKS[mode] hard-removes by risk_level
 *   4. Health: enabled=1 AND is_degraded=0 always
 *
 * Token efficiency:
 *   - Returns tool_name, description, schema_hint, requires_approval
 *   - Does NOT return full input_schema (load that separately for called tools only)
 *   - Ordered by: non-destructive first, then sort_priority DESC
 *
 * @param {object} env
 * @param {string} mode   - 'ask' | 'agent' | 'plan' | 'debug'
 * @param {string} intent - intent_slug from classifyIntent()
 * @param {object} opts
 * @param {number} [opts.limit]         - max tools to load (default: from mode config)
 * @param {boolean} [opts.includeSchemas] - if true, also return input_schema (heavier)
 * @returns {Promise<{tools: object[], meta: object}>}
 */
export async function loadToolsForRequest(env, mode, intent, opts = {}) {
  if (!env.DB) return { tools: [], meta: { error: 'DB not configured' } };

  const validMode   = ['ask', 'agent', 'plan', 'debug'].includes(mode) ? mode : 'ask';
  const intentCats  = INTENT_CATEGORY_MAP[intent] || INTENT_CATEGORY_MAP['mixed'];
  const riskBlocks  = MODE_RISK_BLOCKS[validMode]    || [];
  const catBlocks   = MODE_CATEGORY_BLOCKS[validMode] || [];
  const limit       = opts.limit || (validMode === 'agent' ? 40 : validMode === 'debug' ? 30 : 15);

  // Build the category allowlist: intent categories + baseline, minus blocked categories
  const allowedCats = [
    ...new Set([...intentCats, ...BASELINE_TAGS]),
  ].filter(tag => !catBlocks.includes(tag));

  if (!allowedCats.length) return { tools: [], meta: { intent, mode, reason: 'no_allowed_categories' } };

  // Build LIKE conditions for intent_category_tags
  // Pattern: ' tag ' — exact match due to space padding
  const tagConditions = allowedCats
    .map(() => `t.intent_category_tags LIKE ?`)
    .join(' OR ');

  const tagParams = allowedCats.map(tag => `% ${tag} %`);

  // Risk level blocks as SQL IN clause
  const riskPlaceholders = riskBlocks.length
    ? `AND t.risk_level NOT IN (${riskBlocks.map(() => '?').join(',')})`
    : '';

  // Mode guard — tool must support this mode
  const modePattern = `%"${validMode}"%`;

  const selectCols = opts.includeSchemas
    ? `t.tool_name, t.description, t.input_schema, t.schema_hint,
       t.requires_approval, t.risk_level, t.handler_type, t.handler_config,
       t.intent_category_tags`
    : `t.tool_name, t.description, t.schema_hint,
       t.requires_approval, t.risk_level, t.handler_type, t.handler_config,
       t.intent_category_tags`;

  const sql = `
    SELECT ${selectCols}
    FROM mcp_registered_tools t
    WHERE t.enabled = 1
      AND t.is_degraded = 0
      AND t.modes_json LIKE ?
      AND (${tagConditions})
      ${riskPlaceholders}
    ORDER BY
      CASE t.risk_level
        WHEN 'none'   THEN 0
        WHEN 'low'    THEN 1
        WHEN 'medium' THEN 2
        WHEN 'high'   THEN 3
      END ASC,
      t.sort_priority DESC,
      t.tool_name ASC
    LIMIT ?
  `;

  const params = [
    modePattern,
    ...tagParams,
    ...riskBlocks,
    limit,
  ];

  try {
    const { results } = await env.DB.prepare(sql).bind(...params).all();
    const tools = (results || []).map(normalizeToolRow);

    return {
      tools,
      meta: {
        intent,
        mode:          validMode,
        allowed_cats:  allowedCats,
        blocked_cats:  catBlocks,
        risk_blocks:   riskBlocks,
        count:         tools.length,
        limit,
      },
    };
  } catch (e) {
    console.error('[tools] loadToolsForRequest failed:', e?.message);
    return { tools: [], meta: { error: e?.message, intent, mode: validMode } };
  }
}

/**
 * Load the full input_schema for a specific set of tool names.
 * Called after a model responds with a tool_use block — load schema
 * only for the tools the model actually intends to call.
 *
 * @param {object} env
 * @param {string[]} toolNames
 * @returns {Promise<Map<string, object>>} tool_name → input_schema object
 */
export async function loadToolSchemas(env, toolNames) {
  if (!env.DB || !toolNames?.length) return new Map();

  const placeholders = toolNames.map(() => '?').join(',');
  try {
    const { results } = await env.DB.prepare(
      `SELECT tool_name, input_schema FROM mcp_registered_tools
       WHERE tool_name IN (${placeholders}) AND enabled = 1`
    ).bind(...toolNames).all();

    const map = new Map();
    for (const row of results || []) {
      try {
        map.set(row.tool_name, JSON.parse(row.input_schema || '{}'));
      } catch (_) {
        map.set(row.tool_name, {});
      }
    }
    return map;
  } catch (e) {
    console.error('[tools] loadToolSchemas failed:', e?.message);
    return new Map();
  }
}

/**
 * Check if a specific tool call is safe to execute given the current mode.
 * Call this BEFORE executing a tool call from the model.
 *
 * Returns { allowed: boolean, reason?: string, requiresConfirmation: boolean }
 *
 * This is the execution-time guard — separate from the load-time filter.
 * Prevents prompt-injected tool calls that slip through (defense in depth).
 */
export async function validateToolCall(env, mode, toolName) {
  if (!env.DB || !toolName) return { allowed: false, reason: 'invalid_tool_name' };

  const catBlocks  = MODE_CATEGORY_BLOCKS[mode] || [];
  const riskBlocks = MODE_RISK_BLOCKS[mode]      || [];

  try {
    const row = await env.DB.prepare(
      `SELECT tool_name, intent_category_tags, risk_level, requires_approval, enabled, is_degraded
       FROM mcp_registered_tools WHERE tool_name = ? LIMIT 1`
    ).bind(toolName).first();

    if (!row)          return { allowed: false, reason: 'tool_not_registered', requiresConfirmation: false };
    if (!row.enabled)  return { allowed: false, reason: 'tool_disabled',        requiresConfirmation: false };
    if (row.is_degraded) return { allowed: false, reason: 'tool_degraded',      requiresConfirmation: false };

    // Check category blocks
    const tags = String(row.intent_category_tags || '');
    for (const blocked of catBlocks) {
      if (tags.includes(` ${blocked} `)) {
        return { allowed: false, reason: `category_blocked_in_${mode}:${blocked}`, requiresConfirmation: false };
      }
    }

    // Check risk blocks
    if (riskBlocks.includes(row.risk_level)) {
      return { allowed: false, reason: `risk_level_blocked_in_${mode}:${row.risk_level}`, requiresConfirmation: false };
    }

    return {
      allowed:               true,
      requiresConfirmation:  !!row.requires_approval,
      riskLevel:             row.risk_level,
    };
  } catch (e) {
    return { allowed: false, reason: `validation_error:${e?.message}`, requiresConfirmation: false };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeToolRow(row) {
  return {
    name:                 row.tool_name,
    description:          row.description || '',
    schema_hint:          row.schema_hint  || null,
    input_schema:         row.input_schema ? safeParseJson(row.input_schema) : undefined,
    requires_approval:    !!row.requires_approval,
    risk_level:           row.risk_level || 'low',
    handler_type:         row.handler_type || 'builtin',
    handler_config:       row.handler_config ? safeParseJson(row.handler_config) : null,
    _category_tags:       row.intent_category_tags?.trim() || '',
  };
}

function safeParseJson(str) {
  if (!str) return {};
  try { return JSON.parse(str); } catch { return {}; }
}

// ─── classifyIntent (fixed) ───────────────────────────────────────────────────

/**
 * Classify user message intent against agent_intent_patterns.triggers_json.
 *
 * FIXED: uses actual DB schema (triggers_json string array, intent_slug)
 * not the phantom pattern_text/match_type columns that don't exist.
 *
 * Matching order:
 *   1. Specific client intents (shinshu_*) checked first — high precision
 *   2. Action intents (deploy, debug, code, shell, sql)
 *   3. Generic classifiers (question, mixed) as fallback
 */
export async function classifyIntent(env, userContent) {
  if (!env.DB || !userContent) return { intent: 'mixed' };

  const text = String(userContent).toLowerCase().slice(0, 2000);

  try {
    const { results } = await env.DB.prepare(
      `SELECT intent_slug, triggers_json
       FROM agent_intent_patterns
       WHERE is_active = 1
         AND COALESCE(is_deprecated, 0) = 0
       ORDER BY sort_order ASC`
    ).all();

    if (!results?.length) return { intent: 'mixed' };

    for (const row of results) {
      let triggers = [];
      try { triggers = JSON.parse(row.triggers_json || '[]'); } catch (_) { continue; }

      for (const trigger of triggers) {
        if (typeof trigger === 'string' && text.includes(trigger.toLowerCase())) {
          return {
            intent:          row.intent_slug,
            matched_trigger: trigger,
            categories:      INTENT_CATEGORY_MAP[row.intent_slug] || INTENT_CATEGORY_MAP['mixed'],
          };
        }
      }
    }

    return {
      intent:     'mixed',
      categories: INTENT_CATEGORY_MAP['mixed'],
    };
  } catch (e) {
    console.error('[tools] classifyIntent failed:', e?.message);
    return { intent: 'mixed', categories: INTENT_CATEGORY_MAP['mixed'] };
  }
}

// ─── HTTP Handler ─────────────────────────────────────────────────────────────

/**
 * Debug endpoint: GET /api/tools/preview?mode=agent&intent=code
 * Returns the tool set that would be loaded for a given mode+intent.
 * Useful for Agent Sam to inspect its own tool context.
 */
export async function handleToolsApi(request, url, env) {
  const mode   = url.searchParams.get('mode')   || 'agent';
  const intent = url.searchParams.get('intent') || 'mixed';
  const schemas = url.searchParams.get('schemas') === '1';

  const { jsonResponse } = await import('./responses.js');

  const result = await loadToolsForRequest(env, mode, intent, {
    includeSchemas: schemas,
  });

  return jsonResponse({
    ...result,
    tools: result.tools.map(t => ({
      name:              t.name,
      description:       t.description?.slice(0, 120),
      risk_level:        t.risk_level,
      requires_approval: t.requires_approval,
      _tags:             t._category_tags,
    })),
  });
}
