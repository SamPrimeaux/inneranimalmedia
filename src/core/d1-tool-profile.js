/**
 * D1-owned tool profiles (Phase 1 ROUTING-TOOL-SSOT).
 * agentsam_tool_profiles is SSOT; *-tool-profile.js modules are cold-start fallback only.
 */
import { resolveCatalogDispatchToolKey } from './catalog-tool-key-resolve.js';

/** Profile keys that must never fall back to oauth_visible dump when compile yields zero tools. */
export const PINNED_PROFILE_KEYS = new Set([
  'inspect',
  'code_develop',
  'ask',
  'd1_read',
  'mail',
]);

/**
 * OAuth parity is opt-in only — default deny for in-app Agent Sam.
 * @param {{ mcpOAuthParity?: boolean|null, taskSpec?: { toolProfile?: string|null }|null, routeKey?: string|null, routeKeyPin?: string|null }} input
 */
export function resolveUseOAuthParity(input) {
  if (input?.mcpOAuthParity === true) return true;
  const tp = String(input?.taskSpec?.toolProfile || '').trim().toLowerCase();
  if (tp === 'oauth_parity') return true;
  const rk = String(input?.routeKeyPin || input?.routeKey || '').trim().toLowerCase();
  if (rk === 'mcp_panel') return true;
  return false;
}

/**
 * Map TaskSpec.toolProfile + task_type to D1 profile_key.
 * @param {{ taskSpec?: { toolProfile?: string|null }|null, taskType?: string|null, useInspect?: boolean, useCodeDevelop?: boolean }} ctx
 * @returns {string|null}
 */
export function resolveD1ToolProfileKey(ctx) {
  if (ctx.useCodeDevelop) return 'code_develop';
  if (ctx.useInspect) return 'inspect';
  const tp = String(ctx.taskSpec?.toolProfile || '').trim().toLowerCase();
  const tt = String(ctx.taskType || '').trim().toLowerCase();
  if (tp === 'inspect' || tp === 'code_develop' || tp === 'ask' || tp === 'mail') return tp;
  if (tp === 'd1_read' || tt === 'd1_query' || tt === 'sql_d1_generation') return 'd1_read';
  if (tt === 'mail_triage' || tt === 'gmail') return 'mail';
  return null;
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

  return {
    ...result,
    source: d1Row ? 'd1_tool_profile' : 'js_cold_start',
    profile_key: profileKey,
    d1_row_id: d1Row?.id ?? null,
  };
}
