/**
 * Agent Sam execution lanes — separate open-web discovery, URL fetch, browser DOM, and repo grep.
 *
 * Lanes (mutually exclusive primary):
 *   open_web_search — public internet discovery (Tavily / search_web)
 *   web_fetch       — known URL text extraction
 *   browser_inspect — MYBROWSER render / screenshot / click
 *   workspace_grep  — repo/code search (PTY rg / fs_search_files)
 *   internal_knowledge_search — D1/R2/Vectorize/internal docs (not Tavily)
 */

import { isCodeImplementationIntent, messageExplicitlyRequestsBrowserInspection } from './code-implementation-intent.js';
import {
  isSimpleGreeting,
  messageRequestsInternalKnowledge,
  resolveOpenWebSearchBackend,
} from './tavily-open-web-search.js';

export { resolveOpenWebSearchBackend };

/** @typedef {'open_web_search'|'web_fetch'|'browser_inspect'|'workspace_grep'|'internal_knowledge_search'|'none'} ExecutionLane */

const LANE_LOG_PREFIX = '[agent] execution_lane_selected';

/**
 * @param {unknown} message
 */
function extractPrimaryUrl(message) {
  const m = String(message || '');
  const match = m.match(/https?:\/\/[^\s)\]"'<>]+/i);
  return match ? match[0].replace(/[.,;:!?)]+$/, '') : null;
}

/**
 * User wants to fetch/read a specific URL (not search the open web).
 * @param {unknown} message
 */
export function messageRequestsWebFetch(message) {
  const m = String(message || '').trim();
  const url = extractPrimaryUrl(m);
  if (!url) return false;
  if (
    /\b(fetch|read|get|pull|download|extract|scrape|curl)\b.{0,40}\bhttps?:\/\//i.test(m) ||
    /\bhttps?:\/\/[^\s]+\b.{0,30}\b(fetch|read|extract|content|markdown|text)\b/i.test(m)
  ) {
    return true;
  }
  if (/\b(raw\.githubusercontent\.com|api\.|\/docs\/|developers\.)\b/i.test(url)) {
    return /\b(fetch|read|open|get|show)\b/i.test(m);
  }
  return false;
}

/**
 * @param {unknown} message
 */
export function messageRequestsOpenWebSearch(message) {
  const m = String(message || '').toLowerCase();
  if (!m) return false;

  if (isSimpleGreeting(message)) return false;
  if (messageRequestsWebFetch(message)) return false;
  if (messageExplicitlyRequestsBrowserInspection(m)) return false;
  if (isCodeImplementationIntent(message)) return false;
  if (
    /\b(grep|ripgrep|\brg\b|find in (the )?codebase|which file|where is .{0,80} defined|in my repo|workspace_grep|fs_search)\b/i.test(
      m,
    )
  ) {
    return false;
  }
  if (messageRequestsInternalKnowledge(message)) return false;

  if (
    /\b(d1\b|agentsam_|hyperdrive|from agentsam_|r2 bucket|my repo|in (the )?codebase|grep |ripgrep|find in src|migrations?\/|\.cursor\/|monaco|src\/[\w./-]+|wrangler\.|node_modules)\b/i.test(
      m,
    )
  ) {
    return false;
  }
  if (/\b(resolveModel|agentChatSseHandler|dispatchToolCall)[\w.]*\b/i.test(m)) return false;
  if (/\b(r2:\/\/|static\/dashboard|\.sql\b|\.tsx?\b|\.jsx?\b)\b/i.test(m)) return false;

  return (
    /\b(search the web|look it up online|google|find online|search online|web search|latest on|current news|what(?:'s| is) the latest|recent (?:news|updates|docs)|official docs for|provider documentation)\b/i.test(
      m,
    ) ||
    (/\b(latest|current|today|202[4-9])\b/i.test(m) &&
      /\b(openai|anthropic|cloudflare|tavily|api|pricing|release notes|changelog)\b/i.test(m))
  );
}

/**
 * @param {unknown} message
 */
export function messageRequestsWorkspaceGrep(message) {
  const m = String(message || '').toLowerCase();
  if (!m) return false;
  const openWebOnly =
    /\b(search the web|look it up online|google|search online|latest on|current news)\b/i.test(m) ||
    (/\b(latest|current|today)\b/i.test(m) &&
      /\b(cloudflare|openai|anthropic|api|release notes|changelog)\b/i.test(m));
  if (openWebOnly && !/\b(in (my )?repo|codebase|src\/|worker\.js|grep|find)\b/i.test(m)) {
    return false;
  }
  return (
    isCodeImplementationIntent(message) ||
    /\b(grep|ripgrep|\brg\b|find in (the )?codebase|which file|where is .{0,80} defined|search.{0,20}src\/|locate.{0,20}function|workspace_grep|fs_search)\b/i.test(
      m,
    ) ||
    /\b(resolveModel|agentChatSseHandler|agentsam_)[\w.]*\b/i.test(m)
  );
}

/**
 * @param {unknown} message
 * @param {Record<string, unknown>|null} [browserContext]
 */
export function messageRequestsBrowserInspect(message, browserContext = null) {
  const m = String(message || '').toLowerCase();
  if (messageRequestsWebFetch(message) || messageRequestsOpenWebSearch(message)) return false;
  if (messageRequestsWorkspaceGrep(message) && !messageExplicitlyRequestsBrowserInspection(m)) {
    return false;
  }

  const urlInMessage = /https?:\/\//i.test(m);
  const explicit =
    messageExplicitlyRequestsBrowserInspection(m) ||
    /\b(screenshot|playwright|headless|browser view|inspect (the )?page|click (the )?button|dom\b|visual (?:check|regression))\b/i.test(
      m,
    );
  const navigate =
    urlInMessage &&
    /\b(go to|visit|open|navigate|load|check (?:out )?the (?:page|site|dashboard))\b/i.test(m) &&
    !/\b(fetch|read|extract)\b/i.test(m);

  const bcUrl =
    browserContext &&
    typeof browserContext === 'object' &&
    (browserContext.url || browserContext.browserUrl);
  if (bcUrl && explicit) return true;

  return explicit || navigate;
}

/**
 * @param {string} mode
 * @param {ExecutionLane} primaryLane
 * @param {unknown} message
 */
export function modeAllowsOpenWebSearchForMessage(mode, primaryLane, message) {
  const m = String(mode || 'agent').toLowerCase();
  if (primaryLane !== 'open_web_search') return false;
  if (m === 'ask' || m === 'plan') return true;
  if (m === 'agent' || m === 'multitask') return true;
  if (m === 'debug') {
    const msg = String(message || '').toLowerCase();
    return (
      /\b(external|docs\.|documentation|api reference|provider|stack overflow|npm|cloudflare docs)\b/i.test(
        msg,
      ) || !messageRequestsWorkspaceGrep(message)
    );
  }
  return false;
}

/**
 * @param {unknown} message
 * @param {{
 *   requestedMode?: string,
 *   browserContext?: Record<string, unknown>|null,
 *   capabilityDecision?: Record<string, unknown>|null,
 *   modelKey?: string|null,
 * }} [opts]
 */
export function classifyAgentExecutionLane(message, opts = {}) {
  const msg = String(message || '').trim();
  const requestedMode = String(opts.requestedMode || 'agent').toLowerCase();
  const browserContext =
    opts.browserContext && typeof opts.browserContext === 'object' ? opts.browserContext : null;
  const cap = opts.capabilityDecision && typeof opts.capabilityDecision === 'object' ? opts.capabilityDecision : {};

  /** @type {ExecutionLane} */
  let primary_lane = 'none';
  let reason = 'no_lane_match';

  if (messageRequestsInternalKnowledge(msg)) {
    primary_lane = 'internal_knowledge_search';
    reason = 'internal_platform_knowledge';
  } else if (messageRequestsWorkspaceGrep(msg)) {
    primary_lane = 'workspace_grep';
    reason = 'repo_code_symbol_search';
  } else if (messageRequestsWebFetch(msg)) {
    primary_lane = 'web_fetch';
    reason = 'known_url_fetch';
  } else if (messageRequestsBrowserInspect(msg, browserContext) || cap.should_use_browser) {
    primary_lane = 'browser_inspect';
    reason = cap.should_use_browser ? 'capability_router_browser' : 'browser_inspect_heuristic';
  } else if (messageRequestsOpenWebSearch(msg)) {
    primary_lane = 'open_web_search';
    reason = 'public_web_research';
  }

  const open_web_allowed =
    primary_lane === 'open_web_search' && modeAllowsOpenWebSearchForMessage(requestedMode, primary_lane, msg);

  return {
    primary_lane,
    reason,
    requested_mode: requestedMode,
    open_web_allowed,
    url: primary_lane === 'web_fetch' ? extractPrimaryUrl(msg) : null,
    log_line: LANE_LOG_PREFIX,
  };
}

export const WORKSPACE_GREP_TOOL_NAMES = new Set([
  'fs_search_files',
  'workspace_search',
  'workspace_grep',
  'github_search_code',
]);

export const OPEN_WEB_TOOL_NAMES = new Set(['search_web']);

export const WEB_FETCH_TOOL_NAMES = new Set(['web_fetch']);

export const BROWSER_INSPECT_TOOL_NAMES = new Set([
  'browser_navigate',
  'browser_content',
  'browser_screenshot',
  'playwright_screenshot',
  'cdt_take_snapshot',
  'cdt_navigate_page',
  'a11y_audit',
]);

/**
 * @param {string} name
 */
export function isWorkspaceGrepToolName(name) {
  return WORKSPACE_GREP_TOOL_NAMES.has(String(name || '').trim());
}

/**
 * @param {string} name
 */
export function isOpenWebSearchToolName(name) {
  return OPEN_WEB_TOOL_NAMES.has(String(name || '').trim());
}

/**
 * @param {string} name
 */
export function isWebFetchToolName(name) {
  return WEB_FETCH_TOOL_NAMES.has(String(name || '').trim());
}

/**
 * @param {string} name
 */
export function isBrowserInspectToolName(name) {
  const n = String(name || '').trim();
  if (n === 'search_web') return false;
  if (BROWSER_INSPECT_TOOL_NAMES.has(n)) return true;
  return (
    n.startsWith('browser_') ||
    n.startsWith('cdt_') ||
    n === 'playwright_screenshot' ||
    n === 'preview_in_browser'
  );
}

/**
 * Narrow tool manifest to the selected lane; drop broken open-web tools when no backend.
 *
 * @param {any[]} tools
 * @param {ReturnType<typeof classifyAgentExecutionLane>} laneResult
 * @param {{ openWebBackend?: { available: boolean } }} [opts]
 */
export function filterToolsForExecutionLane(tools, laneResult, opts = {}) {
  if (!Array.isArray(tools) || !tools.length) return tools;

  const lane = laneResult?.primary_lane || 'none';
  const backendOk = opts.openWebBackend?.available === true;

  let out = tools;

  if (!backendOk) {
    out = out.filter((t) => !isOpenWebSearchToolName(String(t?.name || '')));
  }

  if (!laneResult?.open_web_allowed) {
    out = out.filter((t) => !isOpenWebSearchToolName(String(t?.name || '')));
  }

  switch (lane) {
    case 'workspace_grep':
      out = out.filter((t) => {
        const n = String(t?.name || '');
        return isWorkspaceGrepToolName(n) || isCodeRepoReadToolName(n);
      });
      break;
    case 'internal_knowledge_search':
      out = out.filter((t) => {
        const n = String(t?.name || '');
        return (
          /^(d1_|hyperdrive_|supabase_|context_|knowledge_|rag_)/i.test(n) ||
          n === 'agentsam_memory_search' ||
          isCodeRepoReadToolName(n)
        );
      });
      break;
    case 'web_fetch':
      out = out.filter((t) => isWebFetchToolName(String(t?.name || '')) || isOpenWebSearchToolName(String(t?.name || '')));
      break;
    case 'browser_inspect':
      out = out.filter((t) => isBrowserInspectToolName(String(t?.name || '')));
      break;
    case 'open_web_search':
      out = out.filter((t) => {
        const n = String(t?.name || '');
        return isOpenWebSearchToolName(n) || isWebFetchToolName(n);
      });
      break;
    default:
      break;
  }

  if (lane === 'workspace_grep' || lane === 'internal_knowledge_search') {
    out = out.filter((t) => !isOpenWebSearchToolName(String(t?.name || '')));
    out = out.filter((t) => !isBrowserInspectToolName(String(t?.name || '')));
  }

  if (lane === 'open_web_search' || lane === 'web_fetch') {
    out = out.filter((t) => !isBrowserInspectToolName(String(t?.name || '')));
  }

  return out;
}

/**
 * @param {string} name
 */
function isCodeRepoReadToolName(name) {
  const n = String(name || '').trim().toLowerCase();
  return (
    n === 'workspace_read_file' ||
    n === 'github_file' ||
    n === 'read_file' ||
    n.startsWith('github_') ||
    n.startsWith('r2_read')
  );
}

/**
 * @param {ReturnType<typeof classifyAgentExecutionLane>} laneResult
 * @param {{ available: boolean, tier?: string }} backend
 */
export function formatExecutionLaneLogPayload(laneResult, backend = { available: false }) {
  return {
    lane: laneResult.primary_lane,
    reason: laneResult.reason,
    mode: laneResult.requested_mode,
    backend: backend.open_web_backend ?? backend.tier ?? 'none',
    open_web_backend: backend.open_web_backend ?? backend.tier ?? 'none',
    open_web_available: !!backend.available,
    open_web_allowed: !!laneResult.open_web_allowed,
    provider_native_detected: !!backend.provider_native_detected,
    max_results: 5,
    search_depth: 'basic',
    cache_hit: false,
    url: laneResult.url,
  };
}
