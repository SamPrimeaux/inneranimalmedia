/**
 * Agent Sam execution lanes — separate open-web discovery, URL fetch, browser DOM, and repo grep.
 *
 * Lanes (mutually exclusive primary):
 *   open_web_search — public internet discovery (Tavily / search_web)
 *   web_fetch       — known URL text extraction
 *   browser_inspect — MYBROWSER render / screenshot / click
 *   workspace_grep  — repo/code search (PTY rg / fs_search_files)
 *   internal_knowledge_search — legacy bucket (prefer explicit semantic_* lanes)
 *   code_semantic_search | schema_semantic_search | memory_semantic_search |
 *   docs_knowledge_search | client_project_semantic_search | deep_archive_search — canonical 1536 lanes
 *   database_assistant — Hyperdrive/D1 schema + read-only SQL (+ approval DDL)
 */

import {
  isCodeImplementationIntent,
  isReadOnlyFileContextIntent,
  isReadOnlyRepoSearchIntent,
  messageExplicitlyRequestsBrowserInspection,
} from './code-implementation-intent.js';
import { stripUserTextForIntent } from './active-file-envelope.js';
import { IMAGE_GEN_TOOL_NAMES } from '../tools/image_generation.js';
import {
  isSimpleGreeting,
  messageRequestsInternalKnowledge,
  resolveOpenWebSearchBackend,
} from './tavily-open-web-search.js';
import { classifyDatabaseAssistantIntent, classifySemanticLane } from './semantic-lane-classifier.js';
import { findResumableSkillSpawnJob } from './subagent-spawn-d1.js';

export { resolveOpenWebSearchBackend };

/** @typedef {'read_only_file_context'|'open_web_search'|'web_fetch'|'browser_inspect'|'workspace_grep'|'internal_knowledge_search'|'code_semantic_search'|'schema_semantic_search'|'memory_semantic_search'|'docs_knowledge_search'|'client_project_semantic_search'|'deep_archive_search'|'database_assistant'|'none'} ExecutionLane */

export const SEMANTIC_EXECUTION_LANES = new Set([
  'code_semantic_search',
  'schema_semantic_search',
  'memory_semantic_search',
  'docs_knowledge_search',
  'client_project_semantic_search',
  'deep_archive_search',
]);

export const SEMANTIC_TOOL_NAMES = new Set([
  'code_semantic_search',
  'schema_semantic_search',
  'memory_semantic_search',
  'docs_knowledge_search',
  'client_project_semantic_search',
  'deep_archive_search',
]);

/** Legacy public.* unified RAG tools — not offered in normal Agent chat. */
export const LEGACY_UNIFIED_RAG_TOOL_NAMES = new Set([
  'knowledge_search',
  'rag_search',
  'ss_search_knowledge',
]);

export const DATABASE_ASSISTANT_TOOL_NAMES = new Set([
  'hyperdrive_schema_inspect',
  'hyperdrive_readonly_query',
  'd1_schema_inspect',
  'd1_readonly_query',
  'database_explain_query',
  'database_propose_migration',
  'database_validate_migration',
  'database_apply_approved_migration',
  'database_generate_rollback',
  'database_inspect_rls',
  'database_inspect_indexes',
  'hyperdrive_schema',
  'd1_schema_introspect',
]);

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
    isReadOnlyRepoSearchIntent(message) ||
    /\b(grep|ripgrep|\brg\b|find in (the )?codebase|which file|where is .{0,80} defined|search.{0,20}src\/|locate.{0,20}function|workspace_grep|fs_search)\b/i.test(
      m,
    ) ||
    /\b(resolveModel|agentChatSseHandler)\b/i.test(m) ||
    (/\bagentsam_[\w.]+\b/i.test(m) &&
      /\b(find|grep|search|locate|defined|in (my )?repo|which file)\b/i.test(m)) ||
    (isCodeImplementationIntent(message) &&
      /\b(grep|ripgrep|\brg\b|find in (the )?codebase|which file|where is)\b/i.test(m))
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
  const msg = stripUserTextForIntent(message).trim();
  const requestedMode = String(opts.requestedMode || 'agent').toLowerCase();
  const browserContext =
    opts.browserContext && typeof opts.browserContext === 'object' ? opts.browserContext : null;
  const cap = opts.capabilityDecision && typeof opts.capabilityDecision === 'object' ? opts.capabilityDecision : {};

  /** @type {ExecutionLane} */
  let primary_lane = 'none';
  let reason = 'no_lane_match';

  if (isReadOnlyFileContextIntent(message)) {
    primary_lane = 'read_only_file_context';
    reason = 'active_file_read_describe';
  } else if (messageRequestsWorkspaceGrep(msg)) {
    primary_lane = 'workspace_grep';
    reason = 'repo_code_symbol_search';
  } else if (classifyDatabaseAssistantIntent(msg)) {
    primary_lane = 'database_assistant';
    reason = 'database_schema_or_sql_assistant';
  } else {
    const semanticLane = classifySemanticLane(msg);
    if (semanticLane) {
      primary_lane = semanticLane;
      reason = `semantic_lane_${semanticLane}`;
    } else if (messageRequestsInternalKnowledge(msg)) {
      primary_lane = 'docs_knowledge_search';
      reason = 'internal_platform_knowledge_docs_lane';
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
  'browser_scroll',
  'browser_verify_current_page',
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
 * @param {{ openWebBackend?: { available: boolean }, isPlatformOwner?: boolean, activeCodeFileOpen?: boolean }} [opts]
 */
export function filterToolsForExecutionLane(tools, laneResult, opts = {}) {
  if (!Array.isArray(tools) || !tools.length) return tools;

  const lane = laneResult?.primary_lane || 'none';
  const backendOk = opts.openWebBackend?.available === true;
  const isPlatformOwner = opts.isPlatformOwner === true;
  const activeCodeFileOpen = opts.activeCodeFileOpen === true;

  let out = tools.filter((t) => !LEGACY_UNIFIED_RAG_TOOL_NAMES.has(String(t?.name || '').trim()));

  if (!isPlatformOwner) {
    out = out.filter((t) => {
      const n = String(t?.name || '').trim();
      if (/^(d1_|hyperdrive_|platform_)/i.test(n)) return false;
      if (n === 'platform_hyperdrive_agentsam_query' || n === 'platform_d1_query') return false;
      let cfg = t?.handler_config;
      if (typeof cfg === 'string') {
        try {
          cfg = JSON.parse(cfg);
        } catch {
          cfg = null;
        }
      }
      if (cfg && (cfg.admin_only === true || cfg.admin_only === 1)) return false;
      if (cfg && String(cfg.data_plane || '').startsWith('platform_')) return false;
      return true;
    });
  }

  if (!backendOk) {
    out = out.filter((t) => !isOpenWebSearchToolName(String(t?.name || '')));
  }

  if (!laneResult?.open_web_allowed) {
    out = out.filter((t) => !isOpenWebSearchToolName(String(t?.name || '')));
  }

  switch (lane) {
    case 'read_only_file_context':
      out = out.filter((t) => isCodeRepoReadToolName(String(t?.name || '')));
      break;
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
          SEMANTIC_TOOL_NAMES.has(n) ||
          DATABASE_ASSISTANT_TOOL_NAMES.has(n) ||
          /^(d1_|hyperdrive_|supabase_|context_)/i.test(n) ||
          isCodeRepoReadToolName(n)
        );
      });
      break;
    case 'code_semantic_search':
    case 'schema_semantic_search':
    case 'memory_semantic_search':
    case 'docs_knowledge_search':
    case 'client_project_semantic_search':
    case 'deep_archive_search':
      out = out.filter((t) => {
        const n = String(t?.name || '');
        return n === lane || SEMANTIC_TOOL_NAMES.has(n) || isCodeRepoReadToolName(n);
      });
      break;
    case 'database_assistant':
      out = out.filter((t) => {
        const n = String(t?.name || '');
        if (/^(customer_|public_learning_)/i.test(n)) return true;
        if (!isPlatformOwner) {
          return /^(customer_|public_learning_)/i.test(n);
        }
        return (
          DATABASE_ASSISTANT_TOOL_NAMES.has(n) ||
          /^d1_/.test(n) ||
          /^hyperdrive_/.test(n) ||
          /^customer_/.test(n) ||
          /^public_learning_/.test(n)
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

  if (
    lane === 'read_only_file_context' ||
    lane === 'workspace_grep' ||
    lane === 'internal_knowledge_search' ||
    SEMANTIC_EXECUTION_LANES.has(lane) ||
    lane === 'database_assistant'
  ) {
    out = out.filter((t) => !isOpenWebSearchToolName(String(t?.name || '')));
    out = out.filter((t) => !isBrowserInspectToolName(String(t?.name || '')));
  }

  if (lane === 'open_web_search' || lane === 'web_fetch') {
    out = out.filter((t) => !isBrowserInspectToolName(String(t?.name || '')));
  }

  if (activeCodeFileOpen) {
    out = out.filter((t) => !IMAGE_GEN_TOOL_NAMES.has(String(t?.name || '').trim()));
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

const GENMEDIA_SLASH_RE = /\/genmedia\b/i;
const LAUNCH_SLASH_RE = /\/launch\b/i;
const DECK_SLASH_RE = /\/deck\b/i;
const DECK_EDIT_RE = /\b(change|update|edit)\b.{0,24}\bslide\s+\d+\b/i;

const SKILL_SLASH_MAP = {
  genmedia: 'skill_on_brand_genmedia',
  launch: 'skill_marketing_agency',
  deck: 'skill_brand_aligned_presentations',
};

/**
 * @param {string} msg
 */
function isDeckApprovalResume(msg) {
  return /^(yes|yep|approve|approved|continue|looks good|lgtm|proceed|go ahead)\b/i.test(
    String(msg || '').trim(),
  );
}

/**
 * Skill-triggered spawn routing (Sprint 2B). Reads pipeline order from agentsam_skill.metadata_json — no hardcoded slugs.
 *
 * @param {any} env
 * @param {unknown} message
 * @param {Record<string, unknown>|null|undefined} body
 * @param {{ sessionId?: string|null, workspaceId?: string|null }} [scope]
 */
export async function resolveSkillSpawnRouting(env, message, body = {}, scope = {}) {
  const msg = String(message || '').trim();
  const b = body && typeof body === 'object' ? body : {};
  const sessionId = scope.sessionId != null ? String(scope.sessionId).trim() : '';
  const workspaceId = scope.workspaceId != null ? String(scope.workspaceId).trim() : '';

  let skillId =
    b.skill_id != null
      ? String(b.skill_id).trim()
      : b.skillId != null
        ? String(b.skillId).trim()
        : '';
  const slashFromBody =
    b.slash_trigger != null
      ? String(b.slash_trigger).trim()
      : b.slashTrigger != null
        ? String(b.slashTrigger).trim()
        : '';

  if (!skillId) {
    if (slashFromBody && SKILL_SLASH_MAP[slashFromBody]) skillId = SKILL_SLASH_MAP[slashFromBody];
    else if (GENMEDIA_SLASH_RE.test(msg)) skillId = 'skill_on_brand_genmedia';
    else if (LAUNCH_SLASH_RE.test(msg)) skillId = 'skill_marketing_agency';
    else if (DECK_SLASH_RE.test(msg)) skillId = 'skill_brand_aligned_presentations';
  }

  if (!skillId && sessionId && workspaceId && env?.DB) {
    if (DECK_EDIT_RE.test(msg)) {
      const editJob = await findResumableSkillSpawnJob(env, {
        conversationId: sessionId,
        workspaceId,
        masterAgentSlug: 'brand_aligned_presentations',
        statuses: ['completed', 'partial'],
      });
      if (editJob?.id) skillId = 'skill_brand_aligned_presentations';
    } else if (isDeckApprovalResume(msg)) {
      const pendingJob = await findResumableSkillSpawnJob(env, {
        conversationId: sessionId,
        workspaceId,
        masterAgentSlug: 'brand_aligned_presentations',
        statuses: ['awaiting_approval'],
      });
      if (pendingJob?.id) skillId = 'skill_brand_aligned_presentations';
    }
  }

  if (!skillId || !env?.DB) return null;

  try {
    const row = await env.DB.prepare(
      `SELECT id, name, slash_trigger, metadata_json, task_types_json
         FROM agentsam_skill
        WHERE id = ? AND COALESCE(is_active, 1) = 1
        LIMIT 1`,
    )
      .bind(skillId)
      .first();
    if (!row?.id) return null;
    let meta = {};
    try {
      meta = JSON.parse(String(row.metadata_json || '{}'));
    } catch {
      meta = {};
    }
    const pipeline = Array.isArray(meta.pipeline)
      ? meta.pipeline.map((s) => String(s || '').trim()).filter(Boolean)
      : [];
    if (!pipeline.length) return null;

    const route = {
      skill_id: String(row.id),
      skillId: String(row.id),
      taskType: 'agent',
      master_agent_slug: String(meta.master_agent_slug || row.id.replace(/^skill_/, '')).trim(),
      pipeline,
      max_iterations: Math.max(1, Math.floor(Number(meta.max_iterations) || 3)),
      mode: String(meta?.mode || 'brand_aligned').trim(),
      pause_for_approval: meta.pause_for_approval === true,
      max_slides: Math.max(1, Math.floor(Number(meta.max_slides) || 20)),
      phases: Array.isArray(meta.phases) ? meta.phases : [],
      resume: false,
    };

    if (sessionId && workspaceId) {
      const pendingJob = await findResumableSkillSpawnJob(env, {
        conversationId: sessionId,
        workspaceId,
        masterAgentSlug: route.master_agent_slug,
        statuses: ['awaiting_approval'],
      });
      if (
        pendingJob?.id &&
        (isDeckApprovalResume(msg) ||
          (skillId === 'skill_brand_aligned_presentations' &&
            !DECK_SLASH_RE.test(msg) &&
            !LAUNCH_SLASH_RE.test(msg) &&
            !GENMEDIA_SLASH_RE.test(msg)))
      ) {
        route.resume = true;
        route.spawnJobId = String(pendingJob.id);
      }
      if (DECK_EDIT_RE.test(msg) && skillId === 'skill_brand_aligned_presentations') {
        route.resume = true;
        route.resume_mode = 'deck_editor';
        const doneJob = await findResumableSkillSpawnJob(env, {
          conversationId: sessionId,
          workspaceId,
          masterAgentSlug: 'brand_aligned_presentations',
          statuses: ['completed', 'partial'],
        });
        if (doneJob?.id) route.spawnJobId = String(doneJob.id);
      }
    }

    return route;
  } catch {
    return null;
  }
}
