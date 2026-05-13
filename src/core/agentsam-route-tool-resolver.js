/**
 * Task / route → tool-surface policy for Agent Sam chat runtime.
 * Merges `agentsam_route_requirements` (when JSON policy columns exist) with safe defaults.
 * Does not hardcode model names.
 */

import { pragmaTableInfo } from './retention.js';

/** @typedef {{
 *   route_key: string,
 *   task_type: string,
 *   allowed_lanes: string[],
 *   required_capabilities: string[],
 *   optional_capabilities: string[],
 *   blocked_capabilities: string[],
 *   max_tools: number | null,
 *   approval_policy: Record<string, unknown> | null,
 *   source: 'd1' | 'default',
 * }} RouteToolRequirements */

function parseJsonArray(raw) {
  if (raw == null || raw === '') return [];
  try {
    const j = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(j) ? j.map((x) => String(x || '').trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function uniqLanes(arr) {
  const LANES = new Set([
    'design',
    'develop',
    'inspect',
    'research',
    'think',
    'integrate',
    'operate',
    'admin',
    'observe',
    'general',
  ]);
  const out = [];
  const seen = new Set();
  for (const x of arr || []) {
    const s = String(x || '').trim().toLowerCase();
    if (!s || !LANES.has(s) || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out.length ? out : ['general'];
}

/** Defaults keyed by `agentsam_prompt_routes.route_key` / routing task_type. */
const DEFAULT_ROUTE_TOOL = /** @type {Record<string, Omit<RouteToolRequirements, 'route_key'|'task_type'|'source'>>} */ ({
  chat: {
    allowed_lanes: ['think', 'research', 'general'],
    required_capabilities: [],
    optional_capabilities: ['knowledge_search', 'context_search', 'd1_query'],
    blocked_capabilities: ['terminal_execute', 'terminal_run'],
    max_tools: 6,
    approval_policy: { high_risk_requires_approval: true },
  },
  simple_ask_greeting: {
    allowed_lanes: ['think', 'general'],
    required_capabilities: [],
    optional_capabilities: [],
    blocked_capabilities: ['terminal_execute', 'terminal_run', 'd1_query'],
    max_tools: 2,
    approval_policy: { high_risk_requires_approval: true },
  },
  code: {
    allowed_lanes: ['develop', 'inspect', 'research'],
    required_capabilities: ['workspace_read_file'],
    optional_capabilities: ['workspace_search', 'terminal_execute', 'd1_query', 'github_file'],
    blocked_capabilities: [],
    max_tools: 12,
    approval_policy: { high_risk_requires_approval: true },
  },
  debug: {
    allowed_lanes: ['develop', 'inspect', 'observe'],
    required_capabilities: ['workspace_read_file'],
    optional_capabilities: ['context_search', 'd1_query', 'platform_info'],
    blocked_capabilities: [],
    max_tools: 10,
    approval_policy: { high_risk_requires_approval: true },
  },
  plan: {
    allowed_lanes: ['think', 'design', 'research'],
    required_capabilities: [],
    optional_capabilities: ['knowledge_search', 'excalidraw_open', 'd1_query'],
    blocked_capabilities: ['terminal_execute', 'terminal_run'],
    max_tools: 8,
    approval_policy: { high_risk_requires_approval: true },
  },
  summary: {
    allowed_lanes: ['think', 'research'],
    required_capabilities: [],
    optional_capabilities: ['d1_query', 'context_search', 'knowledge_search'],
    blocked_capabilities: ['terminal_execute', 'terminal_run'],
    max_tools: 6,
    approval_policy: { high_risk_requires_approval: true },
  },
  terminal_execution: {
    allowed_lanes: ['develop', 'operate'],
    required_capabilities: ['terminal_execute'],
    optional_capabilities: ['platform_info', 'workspace_read_file'],
    blocked_capabilities: [],
    max_tools: 8,
    approval_policy: { high_risk_requires_approval: true },
  },
  tool_use: {
    allowed_lanes: ['develop', 'research', 'inspect'],
    required_capabilities: [],
    optional_capabilities: [],
    blocked_capabilities: [],
    max_tools: 10,
    approval_policy: { high_risk_requires_approval: true },
  },
  workflow_orchestration: {
    allowed_lanes: ['operate', 'develop', 'research'],
    required_capabilities: [],
    optional_capabilities: [],
    blocked_capabilities: [],
    max_tools: 12,
    approval_policy: { high_risk_requires_approval: true },
  },
  mcp_panel: {
    allowed_lanes: ['develop', 'inspect', 'research', 'design', 'think', 'general'],
    required_capabilities: [],
    optional_capabilities: [],
    blocked_capabilities: [],
    max_tools: 24,
    approval_policy: { high_risk_requires_approval: true },
  },
});

function defaultForKey(key) {
  const k = String(key || '').trim().toLowerCase();
  if (DEFAULT_ROUTE_TOOL[k]) return DEFAULT_ROUTE_TOOL[k];
  if (k === 'question' || k === 'general' || k === 'other' || k === 'mixed') return DEFAULT_ROUTE_TOOL.chat;
  if (k === 'implementation' || k === 'feature' || k === 'refactor') return DEFAULT_ROUTE_TOOL.code;
  return DEFAULT_ROUTE_TOOL.chat;
}

function parsePolicyJson(raw) {
  if (raw == null || raw === '') return null;
  try {
    const j = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return j && typeof j === 'object' ? /** @type {Record<string, unknown>} */ (j) : null;
  } catch {
    return null;
  }
}

/**
 * @param {any} env
 * @param {{ routeKey?: string|null, taskType?: string|null, modeSlug?: string|null }} q
 * @returns {Promise<RouteToolRequirements>}
 */
export async function resolveAgentChatRouteToolRequirements(env, q) {
  const routeKeyRaw = q.routeKey != null ? String(q.routeKey).trim().toLowerCase() : '';
  const taskTypeRaw = q.taskType != null ? String(q.taskType).trim().toLowerCase() : '';
  const modeSlug = q.modeSlug != null ? String(q.modeSlug).trim().toLowerCase() : '';
  const lookup = routeKeyRaw || taskTypeRaw || 'chat';
  const base = defaultForKey(lookup);

  let d1Row = null;
  let source = 'default';
  if (env?.DB) {
    const cols = await pragmaTableInfo(env.DB, 'agentsam_route_requirements');
    if (cols.has('route_key')) {
      const bindKey = routeKeyRaw || taskTypeRaw;
      if (bindKey) {
        d1Row = await env.DB
          .prepare(`SELECT * FROM agentsam_route_requirements WHERE route_key = ? LIMIT 1`)
          .bind(bindKey)
          .first()
          .catch(() => null);
        if (d1Row) source = 'd1';
      }
    }
  }

  let allowed_lanes = [...base.allowed_lanes];
  let required_capabilities = [...base.required_capabilities];
  let optional_capabilities = [...base.optional_capabilities];
  let blocked_capabilities = [...base.blocked_capabilities];
  let max_tools = base.max_tools;
  let approval_policy = base.approval_policy ? { ...base.approval_policy } : null;

  if (d1Row && typeof d1Row === 'object') {
    const r = /** @type {Record<string, unknown>} */ (d1Row);
    const lanesCol = r.allowed_lanes_json;
    if (lanesCol != null && String(lanesCol).trim() !== '') {
      const parsed = parseJsonArray(lanesCol);
      if (parsed.length) allowed_lanes = uniqLanes(parsed);
    }
    const reqC = r.required_capability_keys_json;
    if (reqC != null && String(reqC).trim() !== '') {
      const p = parseJsonArray(reqC);
      if (p.length) required_capabilities = p;
    }
    const optC = r.optional_capability_keys_json;
    if (optC != null && String(optC).trim() !== '') {
      const p = parseJsonArray(optC);
      if (p.length) optional_capabilities = p;
    }
    const blk = r.blocked_capability_keys_json;
    if (blk != null && String(blk).trim() !== '') {
      const p = parseJsonArray(blk);
      if (p.length) blocked_capabilities = p;
    }
    if (r.max_tools != null && Number(r.max_tools) > 0) {
      max_tools = Math.floor(Number(r.max_tools));
    }
    const pol = parsePolicyJson(r.approval_policy_json);
    if (pol) approval_policy = pol;
  }

  if (modeSlug === 'ask') {
    max_tools = max_tools != null ? Math.min(max_tools, 8) : 6;
    allowed_lanes = uniqLanes([...allowed_lanes, 'think', 'general']);
  }

  return {
    route_key: routeKeyRaw || taskTypeRaw || lookup,
    task_type: taskTypeRaw,
    allowed_lanes: uniqLanes(allowed_lanes),
    required_capabilities: required_capabilities.map((x) => String(x).trim()).filter(Boolean),
    optional_capabilities: optional_capabilities.map((x) => String(x).trim()).filter(Boolean),
    blocked_capabilities: blocked_capabilities.map((x) => String(x).trim()).filter(Boolean),
    max_tools,
    approval_policy,
    source,
  };
}
