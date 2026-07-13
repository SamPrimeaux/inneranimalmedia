/**
 * D1-owned tool profiles (ROUTING-TOOL-SSOT).
 *
 * Diagnostic law: new task_type → INSERT agentsam_tool_profile_bindings row (no deploy).
 * New tools on a profile → UPDATE agentsam_tool_profiles.tool_keys_json (no deploy).
 * JS *-tool-profile.js / resolveD1ToolProfileKey cold-start only when D1 empty.
 */
import { resolveCatalogDispatchToolKey } from './catalog-tool-key-resolve.js';

/** Profile keys that must never fall back to oauth_visible dump when compile yields zero tools. */
export const PINNED_PROFILE_KEYS = new Set([
  'inspect',
  'code_develop',
  'ask',
  'd1_read',
  'mail',
  'default_route',
]);

/** @type {Map<string, string>|null} */
let _bindingsCache = null;
let _bindingsCacheAt = 0;
const BINDINGS_TTL_MS = 60_000;

/**
 * OAuth parity is opt-in only — default deny for in-app Agent Sam.
 * Never unlock from TaskSpec.toolProfile=oauth_parity (unknown classifiers used that).
 * @param {{ mcpOAuthParity?: boolean|null, routeKey?: string|null, routeKeyPin?: string|null }} input
 */
export function resolveUseOAuthParity(input) {
  if (input?.mcpOAuthParity === true) return true;
  const rk = String(input?.routeKeyPin || input?.routeKey || '').trim().toLowerCase();
  if (rk === 'mcp_panel') return true;
  return false;
}

/**
 * @param {string|null|undefined} raw
 * @returns {Record<string, boolean>}
 */
export function parseWritePolicyJson(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(String(raw));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    /** @type {Record<string, boolean>} */
    const out = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'boolean') out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Load task_type → profile_key from D1 (cached briefly per isolate).
 * @param {unknown} env
 * @returns {Promise<Map<string, string>>}
 */
export async function loadToolProfileBindingsMap(env) {
  const now = Date.now();
  if (_bindingsCache && now - _bindingsCacheAt < BINDINGS_TTL_MS) {
    return _bindingsCache;
  }
  /** @type {Map<string, string>} */
  const map = new Map();
  if (!env?.DB) {
    _bindingsCache = map;
    _bindingsCacheAt = now;
    return map;
  }
  try {
    const { results } = await env.DB.prepare(
      `SELECT task_type, profile_key
       FROM agentsam_tool_profile_bindings
       WHERE COALESCE(is_active, 1) = 1
       ORDER BY priority ASC`,
    ).all();
    for (const row of results || []) {
      const tt = String(row.task_type || '')
        .trim()
        .toLowerCase();
      const pk = String(row.profile_key || '')
        .trim()
        .toLowerCase();
      if (tt && pk && !map.has(tt)) map.set(tt, pk);
    }
  } catch (e) {
    console.warn('[d1-tool-profile] bindings_load_failed', e?.message ?? e);
  }
  _bindingsCache = map;
  _bindingsCacheAt = now;
  return map;
}

/** Test/helper — clear bindings cache */
export function clearToolProfileBindingsCache() {
  _bindingsCache = null;
  _bindingsCacheAt = 0;
}

/**
 * Cold-start only when D1 bindings table empty/unavailable.
 * @param {{ taskSpec?: { toolProfile?: string|null }|null, taskType?: string|null, useInspect?: boolean, useCodeDevelop?: boolean }} ctx
 * @returns {string}
 */
function resolveD1ToolProfileKeyColdStart(ctx) {
  if (ctx.useCodeDevelop) return 'code_develop';
  if (ctx.useInspect) return 'inspect';
  const tp = String(ctx.taskSpec?.toolProfile || '')
    .trim()
    .toLowerCase();
  const tt = String(ctx.taskType || '')
    .trim()
    .toLowerCase();
  if (tp === 'inspect' || tp === 'code_develop' || tp === 'ask' || tp === 'mail' || tp === 'd1_read') {
    return tp;
  }
  if (tp === 'image' || tp === 'exempt') return 'default_route';
  if (tt === 'd1_query' || tt === 'sql_d1_generation') return 'd1_read';
  if (tt === 'mail_triage' || tt === 'gmail') return 'mail';
  // Unknown → ask (never oauth, never null)
  return 'ask';
}

/**
 * Map task_type → D1 profile_key. Prefer bindings table; cold-start JS only if empty.
 * Always returns a profile_key (never null) — unknown → ask.
 * @param {unknown} env
 * @param {{ taskSpec?: { toolProfile?: string|null }|null, taskType?: string|null, useInspect?: boolean, useCodeDevelop?: boolean }} ctx
 * @returns {Promise<{ profileKey: string, source: 'd1_binding'|'js_cold_start'|'task_spec' }>}
 */
export async function resolveD1ToolProfileKey(env, ctx) {
  const tt = String(ctx.taskType || '')
    .trim()
    .toLowerCase();
  const bindings = await loadToolProfileBindingsMap(env);
  if (bindings.size > 0 && tt && bindings.has(tt)) {
    return { profileKey: /** @type {string} */ (bindings.get(tt)), source: 'd1_binding' };
  }
  // Intentional develop/inspect from message heuristics (bridge) — still a named profile
  if (ctx.useCodeDevelop) return { profileKey: 'code_develop', source: 'js_cold_start' };
  if (ctx.useInspect) return { profileKey: 'inspect', source: 'js_cold_start' };
  const tp = String(ctx.taskSpec?.toolProfile || '')
    .trim()
    .toLowerCase();
  if (tp === 'inspect' || tp === 'code_develop' || tp === 'ask' || tp === 'mail' || tp === 'd1_read') {
    return { profileKey: tp, source: 'task_spec' };
  }
  if (bindings.size === 0) {
    return { profileKey: resolveD1ToolProfileKeyColdStart(ctx), source: 'js_cold_start' };
  }
  // D1 up, unknown task_type → ask (route-scoped pins), never oauth
  return { profileKey: 'ask', source: 'd1_binding' };
}

/**
 * @param {unknown} env
 * @param {string} profileKey
 */
export async function loadToolProfileRow(env, profileKey) {
  const key = String(profileKey || '').trim();
  if (!env?.DB || !key) return null;
  try {
    return await env.DB.prepare(
      `SELECT id, profile_key, display_name, tool_keys_json, max_tools, default_deny_oauth,
              write_policy_json, notes, is_active
       FROM agentsam_tool_profiles
       WHERE profile_key = ? AND COALESCE(is_active, 1) = 1
       LIMIT 1`,
    )
      .bind(key)
      .first();
  } catch {
    return null;
  }
}

/**
 * @param {string|null|undefined} raw
 * @returns {string[]}
 */
export function parseToolProfileKeysJson(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) return [];
    return parsed.map((k) => String(k).trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Compile catalog rows from an ordered pin list.
 * @param {unknown} env
 * @param {{ workspaceId?: string|null }} scope
 * @param {string[]} pinnedKeys
 * @param {number} maxTools
 */
export async function compilePinnedToolKeysToRows(env, scope, pinnedKeys, maxTools) {
  const cap = Math.max(1, Math.min(32, Number(maxTools) || 12));
  const { listAgentsamToolsByKeys, mapCatalogRowsToAgentTools } = await import(
    './agentsam-tools-catalog.js'
  );
  const { mapCatalogRowsToMcpParityAgentTools } = await import('./in-app-mcp-oauth-parity.js');

  const resolvedPins = [
    ...new Set(pinnedKeys.map((k) => resolveCatalogDispatchToolKey(k) || k).filter(Boolean)),
  ];

  const rawPinned = await listAgentsamToolsByKeys(
    env,
    new Set(resolvedPins.map((k) => k.toLowerCase())),
    {
      workspaceId: scope.workspaceId,
      limit: Math.max(resolvedPins.length, cap),
    },
  );

  const byKey = new Map();
  for (const r of rawPinned || []) {
    const kn = String(r.tool_name || r.tool_key || '')
      .trim()
      .toLowerCase();
    if (kn) byKey.set(kn, r);
    const kk = String(r.tool_key || '')
      .trim()
      .toLowerCase();
    if (kk) byKey.set(kk, r);
  }

  const orderedCatalog = [];
  const seenKeys = new Set();
  for (const key of resolvedPins) {
    const row = byKey.get(String(key).trim().toLowerCase());
    if (!row) continue;
    const id = String(row.tool_name || row.tool_key || '')
      .trim()
      .toLowerCase();
    if (!id || seenKeys.has(id)) continue;
    seenKeys.add(id);
    orderedCatalog.push(row);
  }

  let rows = mapCatalogRowsToMcpParityAgentTools(orderedCatalog);
  if (!rows.length) rows = mapCatalogRowsToAgentTools(orderedCatalog);
  rows = rows.slice(0, cap);

  return {
    rows,
    pinned_count: orderedCatalog.length,
    total: rows.length,
    missingPinned: resolvedPins.filter((k) => !seenKeys.has(String(k).trim().toLowerCase())),
  };
}

/**
 * @param {unknown} env
 * @param {{ userId: string, tenantId?: string|null, workspaceId?: string|null, isSuperadmin?: boolean }} scope
 * @param {{
 *   profileKey: string,
 *   maxTools?: number,
 *   taskType?: string|null,
 *   modeSlug?: string|null,
 *   message?: string|null,
 *   routeToolRequirements?: import('./agentsam-route-tool-resolver.js').RouteToolRequirements|null,
 *   jsFallback?: () => Promise<{ rows?: unknown[], missingPinned?: string[], pinned_count?: number, total?: number }>,
 * }} opts
 */
export async function compileD1ToolProfileRows(env, scope, opts) {
  const profileKey = String(opts.profileKey || '').trim();
  const maxTools = Math.max(1, Number(opts.maxTools) || 12);
  const d1Row = await loadToolProfileRow(env, profileKey);
  let pinnedKeys = parseToolProfileKeysJson(d1Row?.tool_keys_json);
  const writePolicy = parseWritePolicyJson(d1Row?.write_policy_json);

  if (!pinnedKeys.length && typeof opts.jsFallback === 'function') {
    const fb = await opts.jsFallback();
    return {
      rows: fb.rows || [],
      missingPinned: fb.missingPinned || [],
      pinned_count: fb.pinned_count ?? 0,
      total: fb.total ?? (fb.rows || []).length,
      source: 'js_cold_start',
      profile_key: profileKey,
      d1_row_id: d1Row?.id ?? null,
      write_policy: writePolicy,
      d1_row: d1Row,
    };
  }

  // default_route with empty pins → caller uses route-scoped select (not oauth)
  if (profileKey === 'default_route' && !pinnedKeys.length) {
    return {
      rows: [],
      missingPinned: [],
      pinned_count: 0,
      total: 0,
      source: 'd1_default_route_empty',
      profile_key: profileKey,
      d1_row_id: d1Row?.id ?? null,
      write_policy: writePolicy,
      d1_row: d1Row,
    };
  }

  let result = await compilePinnedToolKeysToRows(env, scope, pinnedKeys, maxTools);

  if (
    profileKey === 'code_develop' &&
    result.rows.length < maxTools &&
    env?.DB &&
    scope.userId &&
    scope.workspaceId
  ) {
    const { selectAgentsamToolsForAgentChat } = await import('./agentsam-tools-catalog.js');
    const taskType = String(opts.taskType || 'code').trim().toLowerCase() || 'code';
    const developReq = opts.routeToolRequirements || {
      route_key: taskType,
      task_type: taskType,
      allowed_lanes: ['develop', 'inspect', 'terminal', 'operate', 'research'],
      required_capabilities: [],
      optional_capabilities: [
        'workspace_read_file',
        'workspace_search',
        'terminal_execute',
        'github_file',
        'github.read',
        'd1_query',
      ],
      blocked_capabilities: [],
      max_tools: maxTools,
      approval_policy: null,
      source: 'd1_code_develop_profile',
    };
    const seen = new Set(
      result.rows.map((r) => String(r.name || r.tool_key || r.tool_name || '').trim().toLowerCase()).filter(Boolean),
    );
    const det = await selectAgentsamToolsForAgentChat(
      env.DB,
      { userId: scope.userId, tenantId: scope.tenantId, workspaceId: scope.workspaceId },
      {
        allowlistKeys: null,
        routeToolRequirements: developReq,
        message: String(opts.message || ''),
        taskType,
        modeSlug: String(opts.modeSlug || 'agent'),
        catalogLimit: Math.min(64, maxTools * 4),
        outputLimit: maxTools,
      },
    );
    for (const r of det.rows || []) {
      if (result.rows.length >= maxTools) break;
      const n = String(r.name || r.tool_key || r.tool_name || '').trim().toLowerCase();
      if (!n || seen.has(n)) continue;
      seen.add(n);
      result.rows.push(r);
    }
    result.total = result.rows.length;
  }

  if (result.missingPinned?.length) {
    console.warn(
      '[d1-tool-profile] missing_pinned_catalog',
      JSON.stringify({ profile_key: profileKey, missing: result.missingPinned }),
    );
  }

  return {
    ...result,
    source: d1Row ? 'd1_tool_profile' : 'js_cold_start',
    profile_key: profileKey,
    d1_row_id: d1Row?.id ?? null,
    write_policy: writePolicy,
    d1_row: d1Row,
  };
}
