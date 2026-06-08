import { parseJsonSafe } from './agent-prompt-builder.js';
import { getCapabilityTools } from './capability-tools.js';
import {
  CODE_IMPLEMENTATION_TOOL_NAMES,
  isCodeImplementationIntent,
  isReadOnlyFileContextIntent,
  messageExplicitlyRequestsBrowserInspection,
} from './code-implementation-intent.js';
import {
  messageRequestsBrowserInspect,
  messageRequestsOpenWebSearch,
  messageRequestsWebFetch,
  messageRequestsWorkspaceGrep,
  WORKSPACE_GREP_TOOL_NAMES,
} from './agent-lane-router.js';
import { messageHasBrowserUrlNavigation } from '../api/agent/classify-intent.js';
import { extractBrowserNavigateUrl } from './extract-browser-url.js';
import {
  hasImageGenerationIntent,
  hasVideoGenerationIntent,
} from '../tools/image_generation.js';
import {
  activeFileIsGithubBound,
  activeFileIsLocalWorkspaceBuffer,
} from './active-file-envelope.js';
import {
  selectAgentsamToolsForAgentChat,
  selectAgentsamToolsForChatRuntime,
} from './agentsam-tools-catalog.js';
import {
  resolveAgentChatRouteToolRequirements,
  effectiveAgentChatToolCap,
} from './agentsam-route-tool-resolver.js';
import { maxModelToolsForAgentTask } from './mcp-tools-branded.js';
import {
  chatToolSessionSseBase,
  createChatToolSessionLedger,
} from './agent-tool-validator.js';

export function normalizeModeToolPolicy(raw) {
  const policy = parseJsonSafe(raw, {}) || {};
  const allowTools = policy.allow_tools || policy.allowlist || policy.allowed_tools || [];
  const denyTools = policy.deny_tools || policy.blocklist || policy.blocked_tools || [];
  const requireApprovalTools = policy.require_approval_tools || policy.confirmation_required_tools || [];
  return {
    allowTools: Array.isArray(allowTools) ? allowTools.map((v) => String(v)) : [],
    denyTools: Array.isArray(denyTools) ? denyTools.map((v) => String(v)) : [],
    requireApprovalTools: Array.isArray(requireApprovalTools) ? requireApprovalTools.map((v) => String(v)) : [],
  };
}

export async function loadModeToolPolicy(env, modeSlug, opts = {}) {
  const { loadModeToolPolicy: loadPolicy } = await import('../core/agent-mode-tool-policy.js');
  return loadPolicy(env, modeSlug, opts);
}

/**
 * Plain URL + navigation verb → browser (not web_search). Passive links / search phrases excluded.
 * @param {string} text
 */
const BROWSER_CAPABILITY_TOOL_NAMES = [
  'browser_navigate',
  'browser_scroll',
  'browser_verify_current_page',
  'browser_content',
  'cdt_take_snapshot',
  'cdt_navigate_page',
];

export function shouldEnsureBrowserCapabilityTools(message, intentResult, capabilityDecision, promptRouteRow) {
  if (isReadOnlyFileContextIntent(message)) return false;
  if (messageRequestsOpenWebSearch(message) || messageRequestsWebFetch(message)) {
    return false;
  }
  if (messageRequestsWorkspaceGrep(message) && !messageExplicitlyRequestsBrowserInspection(message)) {
    return false;
  }
  if (
    isCodeImplementationIntent(message) &&
    !messageExplicitlyRequestsBrowserInspection(message)
  ) {
    return false;
  }
  if (String(intentResult?.taskType || '').toLowerCase() === 'browser') return true;
  if (messageHasBrowserUrlNavigation(message)) return true;
  if (capabilityDecision?.should_use_browser === true) return true;
  if (String(promptRouteRow?.route_key || '').toLowerCase() === 'browser') return true;
  return false;
}

export function shouldEnsureCodeCapabilityTools(message, intentResult, capabilityDecision) {
  if (messageExplicitlyRequestsBrowserInspection(message)) return false;
  if (messageRequestsOpenWebSearch(message) && !messageRequestsWorkspaceGrep(message)) return false;
  if (messageRequestsWebFetch(message)) return false;
  if (isCodeImplementationIntent(message)) return true;
  if (messageRequestsWorkspaceGrep(message)) return true;
  if (capabilityDecision?.should_use_monaco === true) return true;
  if (String(intentResult?.taskType || '').toLowerCase() === 'code') return true;
  return false;
}

/** Heuristic capability families for merging registry tools before routing (runs before nano capability router). */
export function capabilityFamiliesFromUserMessage(message, intentResult) {
  const m = String(message || '').toLowerCase();
  const fams = new Set();
  const tt = String(intentResult?.taskType || '').toLowerCase();
  if (
    /\bd1\b|agentsam_|hyperdrive|\bsql\b|query the (?:d1 )?database|from agentsam_/i.test(m) ||
    tt.includes('sql')
  ) {
    fams.add('d1');
  }
  if (
    isCodeImplementationIntent(message) ||
    /\bgithub\b|github\.com\/|raw\.githubusercontent/i.test(m)
  ) {
    fams.add('github');
  }
  if (
    isCodeImplementationIntent(message) ||
    /\bterminal\b|run_command|\brun ls\b|\bwrangler\b|\bnpm run\b|\bbash\b/i.test(m) ||
    tt.includes('shell')
  ) {
    fams.add('terminal');
  }
  if (isCodeImplementationIntent(message)) {
    fams.add('r2');
  }
  if (
    !isCodeImplementationIntent(message) ||
    messageExplicitlyRequestsBrowserInspection(message)
  ) {
    if (
      messageHasBrowserUrlNavigation(m) ||
      /\b(browser|screenshot|inspect).*\bhttps?:\/\//i.test(m) ||
      (extractBrowserNavigateUrl(m) && /\b(inspect|screenshot|navigate|open|visit)\b/i.test(m))
    ) {
      fams.add('browser');
    }
  }
  if (hasImageGenerationIntent(message)) fams.add('image');
  if (hasVideoGenerationIntent(message)) fams.add('video');
  if (messageRequestsOpenWebSearch(message) && !messageRequestsBrowserInspect(message)) {
    fams.add('openweb');
    fams.delete('browser');
  }
  if (messageRequestsWebFetch(message)) {
    fams.add('webfetch');
    fams.delete('browser');
  }
  if (messageRequestsWorkspaceGrep(message)) {
    fams.add('workspace_grep');
    fams.delete('browser');
    fams.delete('openweb');
  }
  return [...fams];
}

/** D1 agentsam_tools-backed minimum bar + schema source of truth for agent chat. */

export function agentToolDebugEnabled(env) {
  return String(env?.AGENTSAM_TOOL_DEBUG || env?.AGENT_TOOL_DEBUG || '').trim() === '1';
}

export function agentToolNameOf(t) {
  return String(t?.name || t?.tool_name || '').trim();
}

export function agentToolCategoryOf(t) {
  return String(t?.tool_category || t?.category || '').trim().toLowerCase();
}

export function agentToolFamily(t) {
  const n = agentToolNameOf(t).toLowerCase();
  const c = agentToolCategoryOf(t);

  if (n === 'd1_query' || n.startsWith('d1_') || c.includes('d1') || c.includes('database')) return 'd1';
  if (n.startsWith('github_') || n === 'github_file' || c.includes('github')) return 'github';
  if (n === 'terminal_run' || n === 'terminal_execute' || n === 'run_command' || n === 'bash' || c.includes('terminal')) return 'terminal';
  if (
    n === 'workspace_read_file' ||
    n.startsWith('workspace_') ||
    n.startsWith('r2_') ||
    c.includes('r2') ||
    c.includes('storage')
  ) {
    return 'r2';
  }
  if (n === 'search_web') return 'openweb';
  if (n === 'web_fetch') return 'webfetch';
  if (WORKSPACE_GREP_TOOL_NAMES.has(n)) return 'workspace_grep';
  if (n.startsWith('browser_') || n.startsWith('cdt_') || n.startsWith('playwright_') || n === 'browser_content' || c.includes('browser')) return 'browser';
  if (n.startsWith('imgx_') || c.includes('image') || (c.includes('media') && !n.startsWith('moviemode_') && !n.startsWith('veo_'))) {
    return 'image';
  }
  if (n.startsWith('moviemode_') || n.startsWith('veo_') || c.includes('video')) return 'video';
  if (n.startsWith('agentsam_')) return 'agentsam';
  if (n.startsWith('ai_')) return 'ai';
  return 'general';
}

export function requestedFamiliesForAgentTools(message, intentResult, capabilityDecision = null) {
  const fams = new Set(capabilityFamiliesFromUserMessage(message, intentResult));
  const d = capabilityDecision && typeof capabilityDecision === 'object' ? capabilityDecision : {};

  if (d.should_use_d1) fams.add('d1');
  if (d.should_use_github) fams.add('github');
  if (d.should_use_terminal) fams.add('terminal');
  if (d.should_use_open_web_search) {
    fams.add('openweb');
    fams.delete('browser');
  }
  if (d.should_use_web_fetch) {
    fams.add('webfetch');
    fams.delete('browser');
  }
  if (d.should_use_workspace_grep) {
    fams.add('workspace_grep');
    fams.delete('browser');
    fams.delete('openweb');
  }
  if (d.should_use_artifact_r2 || d.should_use_monaco) fams.add('r2');
  if (isCodeImplementationIntent(message) && !messageExplicitlyRequestsBrowserInspection(message)) {
    fams.add('github');
    fams.add('terminal');
    fams.add('r2');
    fams.delete('browser');
  } else if (d.should_use_browser) {
    fams.add('browser');
  }
  if (hasImageGenerationIntent(message)) fams.add('image');
  if (hasVideoGenerationIntent(message)) fams.add('video');

  return [...fams].filter(Boolean);
}

export function filterAgentToolsForRequest(env, tools, message, intentResult, capabilityDecision = null) {
  if (!Array.isArray(tools) || tools.length === 0) return [];

  const families = requestedFamiliesForAgentTools(message, intentResult, capabilityDecision);
  if (!families.length) return tools;

  const wanted = new Set(families);
  const m = String(message || '').toLowerCase();

  const hardD1Ask =
    /\bd1\b|agentsam_|hyperdrive|\bsql\b|query the (?:d1 )?database|from agentsam_|pragma|select\s+count/i.test(m) ||
    String(intentResult?.taskType || '').toLowerCase().includes('sql');

  let out = tools.filter((t) => {
    const fam = agentToolFamily(t);
    if (wanted.has(fam)) return true;

    // Important: for explicit D1/database asks, do not let generic agentsam_* or ai_* tools steal the turn.
    if (hardD1Ask) return false;

    if (wanted.has('workspace_grep') && fam === 'workspace_grep') return true;
    if (wanted.has('openweb') && fam === 'openweb') return true;
    if (wanted.has('webfetch') && fam === 'webfetch') return true;

    return fam === 'general';
  });

  if (hardD1Ask) {
    const hasD1 = out.some((t) => agentToolNameOf(t) === 'd1_query');
    const d1FromOriginal = tools.find((t) => agentToolNameOf(t) === 'd1_query');
    if (!hasD1 && d1FromOriginal) out.unshift(d1FromOriginal);

    const allowImage = hasImageGenerationIntent(message);
    const allowVideo = hasVideoGenerationIntent(message);
    out = out.filter(
      (t) =>
        agentToolNameOf(t) === 'd1_query' ||
        agentToolFamily(t) === 'd1' ||
        (allowImage && agentToolFamily(t) === 'image') ||
        (allowVideo && agentToolFamily(t) === 'video'),
    );

    out.sort((a, b) => {
      const an = agentToolNameOf(a);
      const bn = agentToolNameOf(b);
      if (an === 'd1_query') return -1;
      if (bn === 'd1_query') return 1;
      return an.localeCompare(bn);
    });
  }

  if (!out.length) {
    out = tools.filter((t) => agentToolFamily(t) === 'general');
    if (!out.length) out = tools;
  }

  if (agentToolDebugEnabled(env)) {
    console.log('[agent-tools] request_scope', JSON.stringify({
      families,
      hardD1Ask,
      before_count: tools.length,
      after_count: out.length,
      before_tools: tools.map(agentToolNameOf).filter(Boolean).slice(0, 80),
      after_tools: out.map(agentToolNameOf).filter(Boolean).slice(0, 80),
    }));
  }

  return out;
}


const AGENT_CHAT_MINIMUM_AGENTSAM_TOOLS = [
  'd1_query',
  'github_file',
  'terminal_run',
  'r2_read',
  'r2_write',
  'cdt_take_screenshot',
];

/** /dashboard/agent surface capability → concrete tool names (ensure in chat tool bar). */
const AGENT_DASHBOARD_SURFACE_CAPABILITY_TOOLS = {
  open_browser: ['cdt_take_screenshot', 'browser_navigate'],
  workspace_read_file: ['workspace_read_file'],
  terminal_execute: ['terminal_execute'],
  d1_query: ['d1_query'],
};

const AGENT_DASHBOARD_SURFACE_CAPABILITY_REQUIRES_APPROVAL = new Set(['terminal_execute']);

export const TOOL_OUTPUT_SSE_MAX = 12000;

export function inputSchemaFromAgentsamToolRow(row) {
  const parsed = parseJsonSafe(row?.input_schema, null);
  if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
    const o = { ...parsed };
    if (!o.type) o.type = 'object';
    return o;
  }
  const hc = parseJsonSafe(row?.handler_config, null);
  if (hc && typeof hc === 'object') {
    if (hc.parameters && typeof hc.parameters === 'object') {
      const o = { ...hc.parameters };
      if (!o.type) o.type = 'object';
      return o;
    }
    if (hc.input_schema && typeof hc.input_schema === 'object') {
      const o = { ...hc.input_schema };
      if (!o.type) o.type = 'object';
      return o;
    }
  }
  return { type: 'object', properties: {} };
}

export async function fetchAgentsamToolRowsByName(env, names) {
  if (!env?.DB || !names.length) return [];
  const placeholders = names.map(() => '?').join(',');
  try {
    const { results } = await env.DB.prepare(
      `SELECT tool_name, description, input_schema, handler_config, tool_category, requires_approval
       FROM agentsam_tools
       WHERE COALESCE(is_active, 1) = 1 AND tool_name IN (${placeholders})`,
    )
      .bind(...names)
      .all();
    return results || [];
  } catch (e) {
    console.warn('[agent] fetchAgentsamToolRowsByName', e?.message ?? e);
    return [];
  }
}

export function chatModeUsesToolLoop(mode) {
  const m = String(mode || '').toLowerCase();
  return m === 'agent' || m === 'debug' || m === 'multitask' || m === 'ask';
}

export function shouldOpenChatToolSessionLedger({ chatAgentRunId, mode, tools, chatToolLedger }) {
  if (!chatAgentRunId || chatToolLedger) return false;
  const m = String(mode || '').toLowerCase();
  if (m === 'plan') return false;
  if (!chatModeUsesToolLoop(mode)) return false;
  return Array.isArray(tools) && tools.length > 0;
}

export async function enrichToolsFromAgentsamCatalog(env, tools, mode, effectiveMaxTools, opts = {}) {
  if (!chatModeUsesToolLoop(mode) || !env?.DB) return tools;
  const nameSet = new Set(tools.map((t) => String(t.name)));
  const imageCapabilityTools =
    opts.imageCapabilityIntent && opts.workspaceId
      ? await getCapabilityTools(env, opts.workspaceId, mode, 'image_capability')
      : [];
  const videoCapabilityTools =
    opts.videoCapabilityIntent && opts.workspaceId
      ? await getCapabilityTools(env, opts.workspaceId, mode, 'video_capability')
      : [];
  const fetchNames = [
    ...new Set([
      ...nameSet,
      ...AGENT_CHAT_MINIMUM_AGENTSAM_TOOLS,
      ...imageCapabilityTools,
      ...videoCapabilityTools,
    ]),
  ];
  const rows = await fetchAgentsamToolRowsByName(env, fetchNames);
  const byName = Object.fromEntries(rows.map((r) => [String(r.tool_name), r]));

  const out = [];
  for (const t of tools) {
    const row = byName[t.name];
    if (row) {
      out.push({
        ...t,
        description: String(row.description || t.description || t.name).slice(0, 4000),
        input_schema: inputSchemaFromAgentsamToolRow(row),
      });
    } else {
      out.push(t);
    }
  }
  const seen = new Set(out.map((x) => x.name));
  const minimumBar = opts.codeImplementationIntent
    ? [...CODE_IMPLEMENTATION_TOOL_NAMES]
    : [...AGENT_CHAT_MINIMUM_AGENTSAM_TOOLS];
  if (opts.imageCapabilityIntent && imageCapabilityTools.length) {
    for (const t of imageCapabilityTools) {
      if (!minimumBar.includes(t)) minimumBar.unshift(t);
    }
  }
  if (opts.videoCapabilityIntent && videoCapabilityTools.length) {
    for (const t of videoCapabilityTools) {
      if (!minimumBar.includes(t)) minimumBar.unshift(t);
    }
  }
  for (const req of minimumBar) {
    if (seen.has(req)) continue;
    if (out.length >= effectiveMaxTools) break;
    const row = byName[req];
    if (!row) continue;
    seen.add(req);
    out.push({
      name: req,
      description: String(row.description || req).slice(0, 4000),
      input_schema: inputSchemaFromAgentsamToolRow(row),
      tool_category: String(row.tool_category || 'builtin'),
      requires_approval: Number(row.requires_approval || 0) === 1,
    });
  }
  return out;
}

/** Guarantee DB-tagged capability tools survive narrowing (image / video families). */
export async function ensureCapabilityTools(
  env,
  tools,
  intentFlag,
  intentCategoryTag,
  effectiveMaxTools,
  workspaceId,
  mode,
) {
  if (!intentFlag || !env?.DB || !Array.isArray(tools)) return tools;
  const have = new Set(tools.map((t) => agentToolNameOf(t)).filter(Boolean));
  const capabilityTools = await getCapabilityTools(env, workspaceId, mode, intentCategoryTag);
  const missing = capabilityTools.filter((n) => !have.has(n));
  if (!missing.length) return tools;
  const rows = await fetchAgentsamToolRowsByName(env, missing);
  const out = [...tools];
  const seen = new Set(have);
  for (const row of rows) {
    const nm = String(row.tool_name || '');
    if (!nm || seen.has(nm)) continue;
    if (out.length >= effectiveMaxTools) break;
    seen.add(nm);
    out.push({
      name: nm,
      description: String(row.description || nm).slice(0, 4000),
      input_schema: inputSchemaFromAgentsamToolRow(row),
      tool_category: String(row.tool_category || 'builtin'),
      requires_approval: Number(row.requires_approval || 0) === 1,
    });
  }
  return out;
}

export async function ensureImageCapabilityTools(env, tools, imageCapabilityIntent, effectiveMaxTools, workspaceId, mode) {
  return ensureCapabilityTools(
    env,
    tools,
    imageCapabilityIntent,
    'image_capability',
    effectiveMaxTools,
    workspaceId,
    mode,
  );
}

export async function ensureVideoCapabilityTools(env, tools, videoCapabilityIntent, effectiveMaxTools, workspaceId, mode) {
  return ensureCapabilityTools(
    env,
    tools,
    videoCapabilityIntent,
    'video_capability',
    effectiveMaxTools,
    workspaceId,
    mode,
  );
}

/** Guarantee Monaco / GitHub / R2 / terminal tools for in-repo implementation work. */
export async function ensureCodeCapabilityTools(env, tools, effectiveMaxTools) {
  if (!env?.DB || !Array.isArray(tools)) return tools;
  const have = new Set(tools.map((t) => agentToolNameOf(t)).filter(Boolean));
  const missing = CODE_IMPLEMENTATION_TOOL_NAMES.filter((n) => !have.has(n));
  if (!missing.length) return tools;
  const rows = await fetchAgentsamToolRowsByName(env, missing);
  const out = [...tools];
  const seen = new Set(have);
  for (const row of rows) {
    const nm = String(row.tool_name || '');
    if (!nm || seen.has(nm)) continue;
    if (out.length >= effectiveMaxTools) break;
    seen.add(nm);
    out.unshift({
      name: nm,
      description: String(row.description || nm).slice(0, 4000),
      input_schema: inputSchemaFromAgentsamToolRow(row),
      tool_category: String(row.tool_category || 'builtin'),
      requires_approval: Number(row.requires_approval || 0) === 1,
    });
  }
  return out;
}

/** Inject GitHub/R2 tools when the editor has an open bound buffer. */
export async function ensureActiveFileCapabilityTools(env, tools, effectiveMaxTools, envelope) {
  if (!env?.DB || !Array.isArray(tools) || !envelope) return tools;
  const names = [];
  if (activeFileIsGithubBound(envelope)) {
    names.push('github_file', 'github_update_file');
  } else if (activeFileIsLocalWorkspaceBuffer(envelope)) {
    names.push('fs_search_files', 'terminal_execute');
  }
  if (envelope.r2_key) {
    names.push('r2_read', 'r2_write');
  }
  if (!names.length) return tools;
  const have = new Set(tools.map((t) => agentToolNameOf(t)).filter(Boolean));
  const missing = names.filter((n) => !have.has(n));
  if (!missing.length) return tools;
  const rows = await fetchAgentsamToolRowsByName(env, missing);
  const out = [...tools];
  const seen = new Set(have);
  for (const row of rows) {
    const nm = String(row.tool_name || '');
    if (!nm || seen.has(nm)) continue;
    if (out.length >= effectiveMaxTools) break;
    seen.add(nm);
    out.unshift({
      name: nm,
      description: String(row.description || nm).slice(0, 4000),
      input_schema: inputSchemaFromAgentsamToolRow(row),
      tool_category: String(row.tool_category || 'builtin'),
      requires_approval: Number(row.requires_approval || 0) === 1,
    });
  }
  return out;
}

/** Inject open-web / web_fetch catalog tools when lane routing requires them. */
export async function ensureWebLaneTools(env, tools, effectiveMaxTools, laneResult, openWebBackend) {
  if (!env?.DB || !Array.isArray(tools) || !laneResult) return tools;
  const lane = laneResult.primary_lane;
  const names = [];
  if (lane === 'open_web_search' && laneResult.open_web_allowed && openWebBackend?.available) {
    names.push('search_web');
  }
  if (lane === 'web_fetch' || lane === 'open_web_search') {
    names.push('web_fetch');
  }
  if (!names.length) return tools;
  const have = new Set(tools.map((t) => agentToolNameOf(t)).filter(Boolean));
  const missing = names.filter((n) => !have.has(n));
  if (!missing.length) return tools;
  const rows = await fetchAgentsamToolRowsByName(env, missing);
  const out = [...tools];
  const seen = new Set(have);
  for (const row of rows) {
    const nm = String(row.tool_name || '');
    if (!nm || seen.has(nm)) continue;
    if (out.length >= effectiveMaxTools) break;
    seen.add(nm);
    out.unshift({
      name: nm,
      description: String(row.description || nm).slice(0, 4000),
      input_schema: inputSchemaFromAgentsamToolRow(row),
      tool_category: String(row.tool_category || 'research'),
      requires_approval: Number(row.requires_approval || 0) === 1,
    });
  }
  return out;
}

/** Guarantee browser_navigate survives lane/cap narrowing when URL navigation is intended. */
export async function ensureBrowserCapabilityTools(env, tools, effectiveMaxTools) {
  if (!env?.DB || !Array.isArray(tools)) return tools;
  const have = new Set(tools.map((t) => agentToolNameOf(t)).filter(Boolean));
  const missing = BROWSER_CAPABILITY_TOOL_NAMES.filter((n) => !have.has(n));
  if (!missing.length) return tools;
  const rows = await fetchAgentsamToolRowsByName(env, missing);
  const out = [...tools];
  const seen = new Set(have);
  for (const row of rows) {
    const nm = String(row.tool_name || '');
    if (!nm || seen.has(nm)) continue;
    seen.add(nm);
    out.unshift({
      name: nm,
      description: String(row.description || nm).slice(0, 4000),
      input_schema: inputSchemaFromAgentsamToolRow(row),
      tool_category: String(row.tool_category || 'browser'),
      requires_approval: Number(row.requires_approval || 0) === 1,
    });
  }
  const cap = Math.max(1, Number(effectiveMaxTools) || 8);
  return out.slice(0, cap);
}

/** Merge agentsam_prompt_routes.tool_keys into the model manifest (D1 route contract). */
export async function mergeToolsFromPromptRouteKeys(env, tools, promptRouteRow, effectiveMaxTools) {
  const keys = parseJsonSafe(promptRouteRow?.tool_keys, null);
  if (!Array.isArray(keys) || !keys.length || !env?.DB) return tools;
  const have = new Set((tools || []).map((t) => agentToolNameOf(t)).filter(Boolean));
  const missing = keys
    .map((k) => String(k || '').trim())
    .filter((k) => k && !have.has(k));
  if (!missing.length) return tools;
  const rows = await fetchAgentsamToolRowsByName(env, missing);
  const out = [...(tools || [])];
  const seen = new Set(have);
  for (const row of rows) {
    const nm = String(row.tool_name || '');
    if (!nm || seen.has(nm)) continue;
    seen.add(nm);
    out.unshift({
      name: nm,
      description: String(row.description || nm).slice(0, 4000),
      input_schema: inputSchemaFromAgentsamToolRow(row),
      tool_category: String(row.tool_category || 'browser'),
      requires_approval: Number(row.requires_approval || 0) === 1,
    });
  }
  const cap = Math.max(1, Number(effectiveMaxTools) || 8);
  return out.slice(0, cap);
}

export function isAgentDashboardSurfaceRoute(dashboardRoute) {
  const r = dashboardRoute != null ? String(dashboardRoute).trim() : '';
  return r === '/dashboard/agent' || r.startsWith('/dashboard/agent/');
}

/** Guarantee /dashboard/agent capability tools survive narrowing; terminal_execute requires approval. */
export async function ensureAgentDashboardSurfaceCapabilityTools(env, tools, effectiveMaxTools, dashboardRoute) {
  if (!isAgentDashboardSurfaceRoute(dashboardRoute) || !env?.DB || !Array.isArray(tools)) {
    return tools;
  }
  const have = new Set(tools.map((t) => agentToolNameOf(t)).filter(Boolean));
  const required = [
    ...new Set(
      Object.values(AGENT_DASHBOARD_SURFACE_CAPABILITY_TOOLS).flatMap((names) => names),
    ),
  ];
  const missing = required.filter((n) => !have.has(n));
  if (!missing.length) {
    return tools.map((t) => {
      const nm = agentToolNameOf(t);
      if (nm && AGENT_DASHBOARD_SURFACE_CAPABILITY_REQUIRES_APPROVAL.has(nm)) {
        return { ...t, requires_approval: true };
      }
      return t;
    });
  }
  const rows = await fetchAgentsamToolRowsByName(env, missing);
  const out = [...tools];
  const seen = new Set(have);
  for (const row of rows) {
    const nm = String(row.tool_name || '');
    if (!nm || seen.has(nm)) continue;
    if (out.length >= effectiveMaxTools) break;
    seen.add(nm);
    out.push({
      name: nm,
      description: String(row.description || nm).slice(0, 4000),
      input_schema: inputSchemaFromAgentsamToolRow(row),
      tool_category: String(row.tool_category || 'builtin'),
      requires_approval:
        AGENT_DASHBOARD_SURFACE_CAPABILITY_REQUIRES_APPROVAL.has(nm) ||
        Number(row.requires_approval || 0) === 1,
    });
  }
  return out.map((t) => {
    const nm = agentToolNameOf(t);
    if (nm && AGENT_DASHBOARD_SURFACE_CAPABILITY_REQUIRES_APPROVAL.has(nm)) {
      return { ...t, requires_approval: true };
    }
    return t;
  });
}

export async function loadAgentsamMcpToolsWorkspaceLibrary(env, workspaceId, limit = 200) {
  const ws = workspaceId != null ? String(workspaceId).trim() : '';
  if (!env?.DB || !ws) return [];
  const lim = Math.max(1, Math.min(500, Number(limit) || 200));
  try {
    const { results } = await env.DB.prepare(
      `SELECT COALESCE(tool_name, tool_key) AS tool_name, description, input_schema, tool_category,
              requires_approval, workspace_scope
       FROM agentsam_tools
       WHERE COALESCE(is_active, 1) = 1
         AND COALESCE(is_degraded, 0) = 0
         AND (
           COALESCE(is_global, 1) = 1
           OR workspace_scope IS NULL OR trim(workspace_scope) IN ('', '[]')
           OR workspace_scope LIKE '%"*"%'
           OR instr(COALESCE(workspace_scope, ''), ?) > 0
         )
       ORDER BY COALESCE(tool_name, tool_key) ASC
       LIMIT ?`,
    )
      .bind(ws, lim * 4)
      .all();
    const rows = results || [];
    const byName = new Map();
    const isGlobalScope = (scopeRaw) => {
      const s = scopeRaw != null ? String(scopeRaw).trim() : '';
      return !s || s === '[]' || s.includes('"*"');
    };
    for (const r of rows) {
      const key = String(r.tool_name || '').trim();
      if (!key) continue;
      if (isGlobalScope(r.workspace_scope)) {
        if (!byName.has(key)) byName.set(key, r);
      }
    }
    for (const r of rows) {
      const key = String(r.tool_name || '').trim();
      if (!key) continue;
      const scope = r.workspace_scope != null ? String(r.workspace_scope) : '';
      if (scope && scope.includes(ws) && !isGlobalScope(scope)) {
        byName.set(key, r);
      }
    }
    return [...byName.values()].slice(0, lim);
  } catch (e) {
    console.warn('[agent] loadAgentsamMcpToolsWorkspaceLibrary', e?.message ?? e);
    return [];
  }
}

export async function loadToolsForRequest(env, modeSlug, _intent, opts = {}) {
  const lim = Math.max(0, Math.min(200, Number(opts.limit ?? 20) || 20));
  if (!env.DB) return { tools: [], toolRoutingError: null, routeToolRequirements: null };
  const policy = await loadModeToolPolicy(env, modeSlug, {
    routeKey: opts.routeKey,
    taskType: opts.taskType,
  });
  const mcpScope = {
    userId: opts.userId,
    tenantId: opts.tenantId,
    workspaceId: opts.workspaceId,
    personUuid: opts.personUuid,
  };
  const catalogLimit = Math.min(200, Math.max(lim, Number(opts.catalogLimit) || Math.min(96, lim * 4)));
  const useBranded = opts.useBrandedCatalog !== false;
  /** @type {any} */
  let routeToolRequirements = null;
  /** @type {{ code: string, message: string, missing: string[] }|null} */
  let toolRoutingError = null;
  let rows = [];

  let allowlistKeys = null;
  const uid = opts.userId != null ? String(opts.userId).trim() : '';
  const wsId = opts.workspaceId != null ? String(opts.workspaceId).trim() : '';
  const tid = opts.tenantId != null ? String(opts.tenantId).trim() : '';
  const pid = opts.personUuid != null ? String(opts.personUuid).trim() : '';
  if (wsId && (uid || tid || pid)) {
    try {
      allowlistKeys = await collectAllowlistToolKeysForScope(env.DB, {
        userId: uid,
        workspaceId: wsId,
        tenantId: tid,
        personUuid: pid,
      });
    } catch (e) {
      console.warn('[agent] mcp allowlist preload', e?.message ?? e);
    }
  }

  let mcpServerKeys = parseMcpTemplateServerKeys(opts.mcpTemplate);
  if (!mcpServerKeys.length && opts.routeKey) {
    mcpServerKeys = await loadPromptRouteMcpServerKeys(env.DB, opts.routeKey, opts.tenantId);
  }

  if (opts.agentChat && useBranded) {
    routeToolRequirements = await resolveAgentChatRouteToolRequirements(env, {
      routeKey: opts.routeKey,
      taskType: opts.taskType,
      modeSlug,
    });
    const modelCap = maxModelToolsForAgentTask(opts.taskType, modeSlug);
    const prMax =
      opts.promptRouteMaxTools != null && Number.isFinite(Number(opts.promptRouteMaxTools))
        ? Number(opts.promptRouteMaxTools)
        : null;
    const mergedMax = effectiveAgentChatToolCap({
      promptRouteMax: prMax,
      routeReqMax: routeToolRequirements?.max_tools,
      modelCap,
      requestLimit: lim,
    });
    routeToolRequirements = {
      ...routeToolRequirements,
      max_tools: mergedMax,
    };
    if (mergedMax === 0) {
      return { tools: [], toolRoutingError: null, routeToolRequirements };
    }
    const det = await selectAgentsamToolsForAgentChat(env.DB, mcpScope, {
      routeToolRequirements,
      message: opts.message,
      taskType: opts.taskType,
      modeSlug,
      catalogLimit,
      outputLimit: mergedMax,
      allowlistKeys,
      mcpServerKeys,
    });
    if (det.missingRequiredCapabilities?.length) {
      const miss = det.missingRequiredCapabilities;
      console.error(
        '[agent] tool_routing_missing_required',
        JSON.stringify({
          missing: miss,
          route_key: routeToolRequirements.route_key,
          task_type: routeToolRequirements.task_type,
        }),
      );
      toolRoutingError = {
        code: 'MISSING_REQUIRED_CAPABILITY',
        message: `Missing required tool capabilities for this route: ${miss.join(', ')}`,
        missing: miss,
      };
      rows = [];
    } else {
      rows = det.rows;
    }
  } else if (useBranded) {
    rows = await selectAgentsamToolsForChatRuntime(env.DB, mcpScope, {
      outputLimit: lim,
      message: opts.message,
      modeSlug,
      allowlistKeys,
    });
  } else {
    rows = await selectAgentsamToolsForChatRuntime(env.DB, mcpScope, {
      outputLimit: lim,
      message: opts.message,
      modeSlug,
      allowlistKeys,
    });
  }

  if (!toolRoutingError && opts.agentChat && opts.taskType && routeToolRequirements?.max_tools != null) {
    const effCap = Math.max(0, Math.floor(Number(routeToolRequirements.max_tools)));
    if (effCap === 0) {
      rows = [];
    } else if (rows.length > effCap) {
      rows = rows.slice(0, effCap);
    }
  }
  if (allowlistKeys?.size) {
    rows = rows.filter((r) => {
      const name = String(r.tool_name || r.name || '').trim();
      const key = String(r.tool_key || name).trim();
      return allowlistKeys.has(name) || allowlistKeys.has(key);
    });
  }
  if (policy.allowTools.length) {
    const allow = new Set(policy.allowTools);
    rows = rows.filter((r) => allow.has(String(r.tool_name || r.name || '')));
  }
  if (policy.denyTools.length) {
    const deny = new Set(policy.denyTools);
    rows = rows.filter((r) => !deny.has(String(r.tool_name || r.name || '')));
  }
  const preferredKeys = Array.isArray(opts.preferredToolKeys)
    ? opts.preferredToolKeys.map((k) => String(k || '').trim()).filter(Boolean)
    : [];
  if (preferredKeys.length && rows.length) {
    const prefSet = new Set(preferredKeys);
    const preferred = [];
    const rest = [];
    for (const r of rows) {
      const name = String(r.tool_name || r.name || '').trim();
      if (prefSet.has(name)) preferred.push(r);
      else rest.push(r);
    }
    rows = [...preferred, ...rest];
  }
  const tools = rows.map((r) => ({
    name: String(r.tool_name || r.name || ''),
    description: String(r.description || ''),
    input_schema: parseJsonSafe(r.input_schema, { type: 'object', properties: {} }),
    tool_category: String(r.tool_category || 'builtin'),
    requires_approval: Number(r.requires_approval || 0) === 1,
  }));
  return { tools, toolRoutingError, routeToolRequirements };
}

