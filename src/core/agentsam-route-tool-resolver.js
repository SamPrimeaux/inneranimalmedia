/**
 * Task / route → tool-surface policy for Agent Sam chat runtime.
 * Merges `agentsam_route_requirements` (when present) with **server defaults** only when D1 has no row
 * or no value in a column — never as a substitute for `agentsam_prompt_routes` (priority / max_tools live in D1).
 *
 * `agentsam_prompt_routes.priority`: lower number wins (see `resolveAgentsamPromptRoute` in agent.js).
 *
 * **When `agentsam_route_requirements` has no row** (or no `cms_live_editor._default_protocol` for `cms_live_editor.*`),
 * server defaults apply — keyed in code by `route_key` / prefix only as a safety net:
 *   `agent_cloudflare`→deploy-like, `agent_terminal`→terminal-like, `agent_database`→db-like,
 *   `agent_code`/`agent_frontend`→code-like, `agent_debug`/`agent_cost_audit`→debug-like,
 *   `agent_planning`→plan-like, `agent_research`→research-like,
 *   `agent_tool_orchestration`/`agent_smoke_test`→workflow-like, `agent_general`/`ollama-local-workflow-pinstest`→chat-like,
 *   `cms_live_editor.*`→`cms_live_editor._default_protocol` profile. Prefer real D1 rows from migration 333.
 */

import { pragmaTableInfo } from './retention.js';
import { CODE_DEVELOP_ROUTE_KEYS, CODE_DEVELOP_SOFT_ROUTE_KEYS, CODE_DEVELOP_TASK_TYPES } from './code-develop-tool-profile.js';

/** @typedef {{
 *   route_key: string,
 *   task_type: string,
 *   allowed_lanes: string[],
 *   allowed_domains: string[],
 *   required_capabilities: string[],
 *   optional_capabilities: string[],
 *   blocked_capabilities: string[],
 *   max_tools: number | null,
 *   approval_policy: Record<string, unknown> | null,
 *   source: 'd1' | 'd1_cms_default' | 'default',
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
    'memory',
    'data',
    'terminal',
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

/** Open default when D1 route_requirements row missing — no JS lane/capability presets. */
const OPEN_ROUTE_TOOL = {
  allowed_lanes: [],
  allowed_domains: [],
  required_capabilities: [],
  optional_capabilities: [],
  blocked_capabilities: [],
  max_tools: 128,
  approval_policy: { high_risk_requires_approval: true },
};

/** @deprecated Unused — defaultForKey always returns OPEN_ROUTE_TOOL (hardcoded route presets ripped). */
const DEFAULT_ROUTE_TOOL = /** @type {Record<string, Omit<RouteToolRequirements, 'route_key'|'task_type'|'source'>>} */ ({
  chat: OPEN_ROUTE_TOOL,
});

function defaultForKey(_key) {
  return OPEN_ROUTE_TOOL;
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
 * Effective tool count for agent chat: min of non-null positive caps; explicit 0 on prompt route or route_requirements wins.
 * @param {{ promptRouteMax?: number|null, routeReqMax?: number|null, modelCap?: number|null, requestLimit?: number|null }} p
 * @returns {number}
 */
export function effectiveAgentChatToolCap(p) {
  const n = (x) => {
    if (x == null || x === '') return null;
    const v = Number(x);
    return Number.isFinite(v) ? v : null;
  };
  const pr = n(p.promptRouteMax);
  const rr = n(p.routeReqMax);
  const mc = n(p.modelCap) ?? 128;
  const rl = n(p.requestLimit) ?? 128;
  if (pr === 0 || rr === 0) return 0;
  const caps = [];
  if (pr != null && pr > 0) caps.push(Math.floor(pr));
  if (rr != null && rr > 0) caps.push(Math.floor(rr));
  caps.push(Math.floor(mc), Math.floor(rl));
  return Math.max(0, Math.min(...caps));
}

/**
 * Route requirements lookup key — develop task types must not collapse to mode=agent.
 * @param {string} modeSlug
 * @param {string|null|undefined} routeKey
 * @param {string|null|undefined} taskType
 */
function resolveRouteRequirementsLookupKey(modeSlug, routeKey, taskType) {
  const mode = String(modeSlug || '').trim().toLowerCase();
  const rk = routeKey != null ? String(routeKey).trim().toLowerCase() : '';
  const tt = taskType != null ? String(taskType).trim().toLowerCase() : '';
  if (CODE_DEVELOP_ROUTE_KEYS.has(rk) || CODE_DEVELOP_SOFT_ROUTE_KEYS.has(rk)) return rk;
  if (
    (mode === 'agent' || mode === 'multitask' || mode === 'debug' || mode === 'plan') &&
    CODE_DEVELOP_TASK_TYPES.has(tt)
  ) {
    return tt;
  }
  if (mode === 'agent' || mode === 'multitask' || mode === 'debug' || mode === 'plan') return mode;
  return rk || tt || 'chat';
}

/**
 * @param {any} env
 * @param {{ routeKey?: string|null, taskType?: string|null, modeSlug?: string|null }} q
 * @returns {Promise<RouteToolRequirements>}
 */
export async function resolveAgentChatRouteToolRequirements(env, q) {
  const modeSlug = q.modeSlug != null ? String(q.modeSlug).trim().toLowerCase() : '';
  const routeKeyRaw =
    q.routeKey != null ? String(q.routeKey).trim().toLowerCase() : '';
  const taskTypeRaw = q.taskType != null ? String(q.taskType).trim().toLowerCase() : '';
  const lookup = resolveRouteRequirementsLookupKey(modeSlug, routeKeyRaw, taskTypeRaw);
  const base = defaultForKey(lookup);

  let d1Row = null;
  let source = 'default';
  if (env?.DB) {
    const cols = await pragmaTableInfo(env.DB, 'agentsam_route_requirements');
    if (cols.has('route_key')) {
      const bindKey = lookup;
      if (bindKey) {
        d1Row = await env.DB
          .prepare(`SELECT * FROM agentsam_route_requirements WHERE route_key = ? LIMIT 1`)
          .bind(bindKey)
          .first()
          .catch(() => null);
        if (d1Row) source = 'd1';
        if (
          !d1Row &&
          bindKey.startsWith('cms_live_editor.') &&
          bindKey !== CMS_LIVE_EDITOR_DEFAULT_KEY
        ) {
          d1Row = await env.DB
            .prepare(`SELECT * FROM agentsam_route_requirements WHERE route_key = ? LIMIT 1`)
            .bind(CMS_LIVE_EDITOR_DEFAULT_KEY)
            .first()
            .catch(() => null);
          if (d1Row) source = 'd1_cms_default';
        }
      }
    }
  }

  let allowed_lanes = [...base.allowed_lanes];
  let allowed_domains = [...(base.allowed_domains || [])];
  let required_capabilities = [...base.required_capabilities];
  let optional_capabilities = [...base.optional_capabilities];
  let blocked_capabilities = [...base.blocked_capabilities];
  let max_tools = /** @type {number|null} */ (base.max_tools);
  let approval_policy = base.approval_policy ? { ...base.approval_policy } : null;

  if (d1Row && typeof d1Row === 'object') {
    const r = /** @type {Record<string, unknown>} */ (d1Row);
    const lanesCol = r.allowed_lanes_json;
    if (lanesCol != null && String(lanesCol).trim() !== '') {
      const parsed = parseJsonArray(lanesCol);
      if (parsed.length) allowed_lanes = uniqLanes(parsed);
    }
    const domainsCol = r.allowed_domains_json;
    if (domainsCol != null && String(domainsCol).trim() !== '') {
      const parsed = parseJsonArray(domainsCol);
      if (parsed.length) allowed_domains = parsed.map((x) => String(x).trim().toLowerCase()).filter(Boolean);
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
    if (r.max_tools != null && String(r.max_tools).trim() !== '') {
      const mt = Number(r.max_tools);
      if (!Number.isNaN(mt)) {
        if (mt === 0) {
          max_tools = 0;
          optional_capabilities = [];
          required_capabilities = [];
          allowed_lanes = uniqLanes(['think', 'general']);
        } else {
          max_tools = Math.floor(mt);
        }
      }
    } else {
      max_tools = null;
    }
    const pol = parsePolicyJson(r.approval_policy_json);
    if (pol) approval_policy = pol;
  }

  if (modeSlug === 'ask' && max_tools != null && max_tools > 0) {
    max_tools = Math.min(max_tools, 8);
    allowed_lanes = uniqLanes([...allowed_lanes, 'think', 'general']);
  }

  return {
    route_key: routeKeyRaw || taskTypeRaw || lookup,
    task_type: taskTypeRaw,
    allowed_lanes: uniqLanes(allowed_lanes),
    allowed_domains,
    required_capabilities: required_capabilities.map((x) => String(x).trim()).filter(Boolean),
    optional_capabilities: optional_capabilities.map((x) => String(x).trim()).filter(Boolean),
    blocked_capabilities: blocked_capabilities.map((x) => String(x).trim()).filter(Boolean),
    max_tools,
    approval_policy,
    source,
  };
}
