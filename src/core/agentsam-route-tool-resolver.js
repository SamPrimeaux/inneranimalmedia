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

/** @typedef {{
 *   route_key: string,
 *   task_type: string,
 *   allowed_lanes: string[],
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

/** Defaults keyed by routing `task_type` / generic route_key — not a substitute for DB `agentsam_prompt_routes`. */
const DEFAULT_ROUTE_TOOL = /** @type {Record<string, Omit<RouteToolRequirements, 'route_key'|'task_type'|'source'>>} */ ({
  chat: {
    allowed_lanes: ['think', 'research', 'general', 'memory'],
    required_capabilities: [],
    optional_capabilities: ['memory.search', 'memory.write', 'knowledge_search', 'context_search', 'd1_query'],
    blocked_capabilities: ['terminal_execute', 'terminal_run'],
    max_tools: 6,
    approval_policy: { high_risk_requires_approval: true },
  },
  ask: {
    allowed_lanes: ['think', 'research', 'inspect', 'observe'],
    required_capabilities: [],
    optional_capabilities: [
      'memory.search',
      'knowledge_search',
      'context_search',
      'd1_query',
      'd1_schema',
      'workspace_read_file',
      'workspace_search',
      'github_file',
      'browser.inspect',
      'mcp_catalog_read',
    ],
    blocked_capabilities: [
      'terminal_execute',
      'terminal_run',
      'worker_deploy',
      'd1_write',
      'python_execute',
    ],
    max_tools: 8,
    approval_policy: { high_risk_requires_approval: true },
  },
  simple_ask_greeting: {
    allowed_lanes: ['think', 'general'],
    required_capabilities: [],
    optional_capabilities: [],
    blocked_capabilities: [
      'terminal_execute',
      'terminal_run',
      'd1_query',
      'worker_deploy',
      'python_execute',
    ],
    max_tools: 0,
    approval_policy: { high_risk_requires_approval: true },
  },
  code: {
    allowed_lanes: ['develop', 'inspect', 'research'],
    required_capabilities: [],
    optional_capabilities: ['workspace_read_file', 'workspace_search', 'terminal_execute', 'd1_query', 'github_file'],
    blocked_capabilities: [],
    max_tools: 12,
    approval_policy: { high_risk_requires_approval: true },
  },
  debug: {
    allowed_lanes: ['develop', 'inspect', 'observe'],
    required_capabilities: [],
    optional_capabilities: ['workspace_read_file', 'context_search', 'd1_query', 'platform_info'],
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
    allowed_lanes: ['develop', 'operate', 'terminal'],
    required_capabilities: [],
    optional_capabilities: ['terminal_execute', 'wrangler.cli', 'platform_info', 'workspace_read_file'],
    blocked_capabilities: [],
    max_tools: 8,
    approval_policy: { high_risk_requires_approval: true },
  },
  sql_d1_generation: {
    allowed_lanes: ['develop', 'inspect', 'observe', 'data'],
    required_capabilities: [],
    optional_capabilities: [
      'wrangler.d1.query',
      'wrangler.d1.schema',
      'wrangler.d1.write',
      'wrangler.d1.migrate',
      'd1_query',
      'context_search',
      'schema_inspect',
    ],
    blocked_capabilities: ['terminal_execute'],
    max_tools: 8,
    approval_policy: { high_risk_requires_approval: true },
  },
  deploy: {
    allowed_lanes: ['develop', 'operate', 'observe'],
    required_capabilities: [],
    optional_capabilities: ['platform_info', 'worker_deploy', 'github_file', 'd1_query'],
    blocked_capabilities: [],
    max_tools: 10,
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
  browser: {
    allowed_lanes: ['inspect', 'develop', 'research'],
    required_capabilities: [],
    optional_capabilities: [
      'browser.navigate',
      'browser.inspect',
      'browser_navigate',
      'browser_content',
      'cdt_take_snapshot',
      'context.search',
      'workspace_read_file',
      'workspace_search',
      'code.search',
      'file.read',
      'grep',
      'github.read',
      'github.write',
      'github_file',
      'github_repos',
      'd1.read',
      'd1_query',
      'd1.schema',
    ],
    blocked_capabilities: ['terminal_execute', 'terminal_run'],
    max_tools: 8,
    approval_policy: { high_risk_requires_approval: true },
  },
  agent: {
    allowed_lanes: ['develop', 'inspect', 'research', 'observe'],
    required_capabilities: [],
    optional_capabilities: [
      'workspace_read_file',
      'workspace_search',
      'code.search',
      'file.read',
      'grep',
      'github.read',
      'github.write',
      'github_file',
      'github_repos',
      'd1.read',
      'd1_query',
      'd1.schema',
      'terminal_execute',
      'context.search',
    ],
    blocked_capabilities: [],
    max_tools: 12,
    approval_policy: { high_risk_requires_approval: true },
  },
  multitask: {
    allowed_lanes: ['inspect', 'develop', 'research', 'observe'],
    required_capabilities: [],
    optional_capabilities: [
      'workspace_read_file',
      'code.search',
      'github.read',
      'github_file',
      'github_repos',
      'd1.read',
      'd1_query',
      'repo_search',
    ],
    blocked_capabilities: ['worker_deploy'],
    max_tools: 8,
    approval_policy: { high_risk_requires_approval: true },
  },
  cms_edit: {
    allowed_lanes: ['design', 'develop', 'inspect', 'research', 'terminal', 'operate'],
    required_capabilities: [],
    optional_capabilities: [
      'context_search',
      'd1_query',
      'workspace_read_file',
      'knowledge_search',
      'terminal_execute',
      'terminal_run',
      'email_broadcast',
      'send_email',
      'resend_send_email',
      'cms_pipeline_prototype',
      'web_fetch',
      'browser_inspect',
    ],
    blocked_capabilities: ['secret_write'],
    max_tools: 14,
    approval_policy: { high_risk_requires_approval: true },
  },
  readonly_repo_audit: {
    allowed_lanes: ['inspect', 'develop', 'research', 'observe'],
    required_capabilities: [],
    optional_capabilities: [
      'workspace_read_file',
      'repo_file_read',
      'code_read',
      'code.search',
      'code_search',
      'repo_search',
      'github.read',
      'github_file',
      'file.read',
      'grep',
      'd1.read',
      'd1.schema',
    ],
    blocked_capabilities: [
      'memory.write',
      'memory.save',
      'knowledge_search',
      'knowledge.search',
      'rag.search',
      'context.search',
      'context_search',
      'terminal.execute',
      'worker.deploy',
      'd1.write',
      'python.execute',
    ],
    max_tools: 8,
    approval_policy: { high_risk_requires_approval: true },
  },
  multitask_report_child: {
    allowed_lanes: ['inspect', 'develop', 'research', 'observe'],
    required_capabilities: [],
    optional_capabilities: [
      'workspace_read_file',
      'code.search',
      'github.read',
      'github_file',
      'repo_search',
      'd1.read',
    ],
    blocked_capabilities: [
      'memory.write',
      'knowledge_search',
      'terminal.execute',
      'worker.deploy',
    ],
    max_tools: 8,
    approval_policy: { high_risk_requires_approval: true },
  },
  ask_evidence_child: {
    allowed_lanes: ['inspect', 'develop', 'research', 'observe'],
    required_capabilities: [],
    optional_capabilities: [
      'workspace_read_file',
      'code.search',
      'github.read',
      'github_file',
      'repo_search',
    ],
    blocked_capabilities: ['memory.write', 'knowledge_search', 'terminal.execute', 'worker.deploy'],
    max_tools: 8,
    approval_policy: { high_risk_requires_approval: true },
  },
});

const CMS_LIVE_EDITOR_DEFAULT_KEY = 'cms_live_editor._default_protocol';

/** Fallback when no `agentsam_route_requirements` row exists for a `cms_live_editor.*` prompt route. */
DEFAULT_ROUTE_TOOL[CMS_LIVE_EDITOR_DEFAULT_KEY] = {
  allowed_lanes: ['design', 'develop', 'inspect', 'terminal', 'operate'],
  required_capabilities: [],
  optional_capabilities: [
    'context_search',
    'd1_query',
    'workspace_read_file',
    'knowledge_search',
    'mcp_catalog_read',
    'terminal_execute',
    'terminal_run',
    'email_broadcast',
    'send_email',
    'resend_send_email',
  ],
  blocked_capabilities: ['secret_write'],
  max_tools: 14,
  approval_policy: { high_risk_requires_approval: true },
};

function defaultForKey(key) {
  const k = String(key || '').trim().toLowerCase();
  if (DEFAULT_ROUTE_TOOL[k]) return DEFAULT_ROUTE_TOOL[k];
  if (k.startsWith('cms_live_editor.')) return DEFAULT_ROUTE_TOOL[CMS_LIVE_EDITOR_DEFAULT_KEY];
  if (k === 'agent_cloudflare') return DEFAULT_ROUTE_TOOL.deploy;
  if (k === 'agent_terminal') return DEFAULT_ROUTE_TOOL.terminal_execution;
  if (k === 'agent_database') return DEFAULT_ROUTE_TOOL.sql_d1_generation;
  if (k === 'agent_code' || k === 'agent_frontend') return DEFAULT_ROUTE_TOOL.code;
  if (k === 'agent_debug' || k === 'agent_cost_audit') return DEFAULT_ROUTE_TOOL.debug;
  if (k === 'agent_planning') return DEFAULT_ROUTE_TOOL.plan;
  if (k === 'agent_research') {
    return {
      allowed_lanes: ['research', 'think', 'inspect'],
      required_capabilities: [],
      optional_capabilities: [
        'rag.search',
        'rag.ingest',
        'rag.status',
        'rag.embed',
        'knowledge.search',
        'context.search',
        'd1.read',
        'browser.inspect',
      ],
      blocked_capabilities: ['terminal_execute', 'terminal_run'],
      max_tools: 8,
      approval_policy: { high_risk_requires_approval: true },
    };
  }
  if (k === 'agent_tool_orchestration' || k === 'agent_smoke_test') return DEFAULT_ROUTE_TOOL.workflow_orchestration;
  if (k === 'agent_general' || k === 'ollama-local-workflow-pinstest') return DEFAULT_ROUTE_TOOL.chat;
  if (k === 'readonly_repo_audit' || k === 'multitask_report_child' || k === 'ask_evidence_child') {
    return DEFAULT_ROUTE_TOOL.readonly_repo_audit;
  }
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
  const mc = n(p.modelCap) ?? 8;
  const rl = n(p.requestLimit) ?? 20;
  if (pr === 0 || rr === 0) return 0;
  const caps = [];
  if (pr != null && pr > 0) caps.push(Math.floor(pr));
  if (rr != null && rr > 0) caps.push(Math.floor(rr));
  caps.push(Math.floor(mc), Math.floor(rl));
  return Math.max(0, Math.min(...caps));
}

/**
 * @param {any} env
 * @param {{ routeKey?: string|null, taskType?: string|null, modeSlug?: string|null }} q
 * @returns {Promise<RouteToolRequirements>}
 */
export async function resolveAgentChatRouteToolRequirements(env, q) {
  const modeSlug = q.modeSlug != null ? String(q.modeSlug).trim().toLowerCase() : '';
  const routeKeyRaw =
    modeSlug === 'agent' || modeSlug === 'multitask' || modeSlug === 'debug' || modeSlug === 'plan'
      ? modeSlug
      : q.routeKey != null
        ? String(q.routeKey).trim().toLowerCase()
        : '';
  const taskTypeRaw = q.taskType != null ? String(q.taskType).trim().toLowerCase() : '';
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
    required_capabilities: required_capabilities.map((x) => String(x).trim()).filter(Boolean),
    optional_capabilities: optional_capabilities.map((x) => String(x).trim()).filter(Boolean),
    blocked_capabilities: blocked_capabilities.map((x) => String(x).trim()).filter(Boolean),
    max_tools,
    approval_policy,
    source,
  };
}
