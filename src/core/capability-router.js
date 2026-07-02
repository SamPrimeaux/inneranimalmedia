/**
 * Workspace capability routing — cheap classification for Agent Sam chat.
 * Does not invoke tools; only returns structured hints for system prompt + SSE UI.
 */
import { resolveModelApiKey } from '../integrations/tokens.js';
import {
  isCodeImplementationIntent,
  isReadOnlyFileContextIntent,
  messageExplicitlyRequestsBrowserInspection,
} from './code-implementation-intent.js';
import { stripUserTextForIntent } from './active-file-envelope.js';
import {
  messageRequestsBrowserInspect,
  messageRequestsOpenWebSearch,
  messageRequestsWebFetch,
  messageRequestsWorkspaceGrep,
} from './agent-lane-router.js';
import { GOOGLE_MODEL_ROUTES } from './google-model-routes.js';
import { applyAntigravityOverlay } from './antigravity-policy.js';

/** Cheap classifier — aligns with router_micro / intent_classification arms. */
const GEMINI_CLASSIFIER_MODEL = GOOGLE_MODEL_ROUTES.cheapFast;

const DEFAULT_DECISION = {
  intent: 'general_chat',
  needs_capabilities: [],
  optional_capabilities: [],
  default_surface: 'chat',
  should_use_browser: false,
  should_use_excalidraw: false,
  should_use_monaco: false,
  should_use_artifact_r2: false,
  should_use_d1: false,
  should_use_terminal: false,
  should_use_github: false,
  should_use_open_web_search: false,
  should_use_web_fetch: false,
  should_use_workspace_grep: false,
  prefer_container_sandbox: false,
  preferred_model_key: null,
  sandbox_build_score: 0,
  sandbox_build_reasons: [],
  sandbox_build_avoid_reasons: [],
  execution_lane: 'none',
  risk_level: 'low',
  approval_required: false,
  reason: 'default',
};

function heuristicDecision(message, browserContext = null) {
  if (isReadOnlyFileContextIntent(message)) {
    return {
      intent: 'read_only_file_context',
      needs_capabilities: [],
      optional_capabilities: ['github', 'artifact'],
      default_surface: 'monaco',
      should_use_browser: false,
      should_use_excalidraw: false,
      should_use_monaco: false,
      should_use_artifact_r2: false,
      should_use_d1: false,
      should_use_github: false,
      should_use_terminal: false,
      should_use_open_web_search: false,
      should_use_web_fetch: false,
      should_use_workspace_grep: false,
      execution_lane: 'read_only_file_context',
      risk_level: 'low',
      approval_required: false,
      reason: 'active_file_read_describe',
    };
  }
  const m = stripUserTextForIntent(message).toLowerCase();
  const urlInMessage = /https?:\/\/[^\s]+/i.test(m);
  const playwrightCue = /\b(playwright|@playwright\/test|npx playwright|e2e test|smoke test|browser test)\b/i.test(
    m,
  );
  const codeCue = isCodeImplementationIntent(message);
  const explicitBrowserInspect = messageExplicitlyRequestsBrowserInspection(m);
  const openWebCue =
    !codeCue && messageRequestsOpenWebSearch(m) && !messageRequestsWebFetch(m);
  const webFetchCue = messageRequestsWebFetch(m);
  const workspaceGrepCue = messageRequestsWorkspaceGrep(m);
  const browserCue =
    !playwrightCue &&
    !codeCue &&
    !openWebCue &&
    !webFetchCue &&
    !workspaceGrepCue &&
    (explicitBrowserInspect ||
      messageRequestsBrowserInspect(m, browserContext) ||
      (urlInMessage &&
        /\b(inspect|screenshot|navigate|debug\s+the\s+site|open\s+this\s+url|check\s+the\s+page)\b/i.test(m)));
  const excalCue = /\b(diagram|wireframe|draw|excalidraw|flowchart|map architecture|system map|sketch)\b/i.test(m);
  const monacoCue =
    codeCue ||
    (/\bmonaco\b/i.test(m) &&
      /\b(edit|change|modify|patch|save|sync|persist|write|apply|implement|refactor)\b/i.test(m)) ||
    /\b(edit|refactor|patch|implement|fix the code|component|this file|landing page file|create a file)\b/i.test(
      m,
    );
  const artifactCue = /\b(publish|artifact|r2|upload|deploy asset|register the artifact|store in library)\b/i.test(m);
  const d1Cue = /\b(d1|hyperdrive|query the db|agentsam_|workflow_runs|select from)\b/i.test(m);
  const githubCue =
    codeCue || /\bgithub\b|github\.com\/|pull request|\.git\b/i.test(m);
  const terminalCue =
    codeCue ||
    /\b(run tests|wrangler|npm run|curl |deploy|execute script|terminal)\b/i.test(m);

  /** @type {string[]} */
  const required = [];
  /** @type {string[]} */
  const optional = [];
  if (browserCue) required.push('browser');
  if (excalCue) required.push('excalidraw');
  if (monacoCue) required.push('monaco');
  if (artifactCue || codeCue) required.push('artifact');
  if (d1Cue) required.push('d1');
  if (githubCue) required.push('github');
  if (terminalCue) optional.push('terminal');
  if (codeCue && !artifactCue) optional.push('artifact');
  if (playwrightCue) optional.push('terminal');
  if (openWebCue) optional.push('open_web_search');
  if (webFetchCue) optional.push('web_fetch');
  if (workspaceGrepCue) optional.push('workspace_grep');

  let default_surface = 'chat';
  if (monacoCue && !browserCue) default_surface = 'monaco';
  else if (browserCue && !excalCue && !monacoCue) default_surface = 'browser';
  else if (excalCue && !browserCue) default_surface = 'excalidraw';

  return {
    intent: playwrightCue
      ? 'playwright_validation'
      : browserCue
        ? 'debug_live_page'
        : excalCue
          ? 'diagram'
          : monacoCue
            ? 'code_edit'
            : 'general_chat',
    needs_capabilities: required.length ? [...new Set(required)] : [],
    optional_capabilities: optional.length ? [...new Set(optional)] : [],
    default_surface,
    should_use_browser: browserCue,
    should_use_excalidraw: excalCue,
    should_use_monaco: monacoCue,
    should_use_artifact_r2: artifactCue || codeCue,
    should_use_d1: d1Cue,
    should_use_github: githubCue,
    should_use_terminal: terminalCue || playwrightCue,
    should_use_open_web_search: openWebCue,
    should_use_web_fetch: webFetchCue,
    should_use_workspace_grep: workspaceGrepCue,
    execution_lane: workspaceGrepCue
      ? 'workspace_grep'
      : webFetchCue
        ? 'web_fetch'
        : browserCue
          ? 'browser_inspect'
          : openWebCue
            ? 'open_web_search'
            : 'none',
    risk_level: playwrightCue || terminalCue || artifactCue ? 'high' : browserCue ? 'medium' : 'low',
    approval_required: !!(playwrightCue || terminalCue || artifactCue),
    reason: 'heuristic_keyword_fallback',
  };
}

function extractJsonObject(text) {
  const clean = String(text || '')
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  try {
    return JSON.parse(clean);
  } catch {
    const first = clean.indexOf('{');
    const last = clean.lastIndexOf('}');
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(clean.slice(first, last + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizeDecision(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_DECISION };
  const needs = Array.isArray(raw.needs_capabilities) ? raw.needs_capabilities.map(String) : [];
  const opt = Array.isArray(raw.optional_capabilities) ? raw.optional_capabilities.map(String) : [];
  return {
    intent: String(raw.intent || DEFAULT_DECISION.intent).slice(0, 120),
    needs_capabilities: needs,
    optional_capabilities: opt,
    default_surface: String(raw.default_surface || raw.defaultSurface || DEFAULT_DECISION.default_surface).slice(0, 64),
    should_use_browser: !!raw.should_use_browser,
    should_use_excalidraw: !!raw.should_use_excalidraw,
    should_use_monaco: !!raw.should_use_monaco,
    should_use_artifact_r2: !!raw.should_use_artifact_r2,
    should_use_d1: !!raw.should_use_d1,
    should_use_github: !!raw.should_use_github,
    should_use_terminal: !!raw.should_use_terminal,
    should_use_open_web_search: !!raw.should_use_open_web_search,
    should_use_web_fetch: !!raw.should_use_web_fetch,
    should_use_workspace_grep: !!raw.should_use_workspace_grep,
    prefer_container_sandbox: !!raw.prefer_container_sandbox,
    preferred_model_key: raw.preferred_model_key ? String(raw.preferred_model_key) : null,
    sandbox_build_score: typeof raw.sandbox_build_score === 'number' ? raw.sandbox_build_score : 0,
    sandbox_build_reasons: Array.isArray(raw.sandbox_build_reasons) ? raw.sandbox_build_reasons.map(String) : [],
    sandbox_build_avoid_reasons: Array.isArray(raw.sandbox_build_avoid_reasons)
      ? raw.sandbox_build_avoid_reasons.map(String)
      : [],
    execution_lane: String(raw.execution_lane || 'none').slice(0, 32),
    risk_level: String(raw.risk_level || 'low').slice(0, 16),
    approval_required: !!raw.approval_required,
    reason: String(raw.reason || '').slice(0, 500),
  };
}

/**
 * @param {any} env
 * @param {{ message: string, browserContext?: Record<string, unknown>|null, userId?: string|null, tenantId?: string|null }} opts
 */
export async function classifyWorkspaceCapabilities(env, opts) {
  const message = String(opts?.message || '').trim();
  const browserContext = opts?.browserContext && typeof opts.browserContext === 'object' ? opts.browserContext : null;
  const userId = opts?.userId != null ? String(opts.userId).trim() : null;
  const tenantId = opts?.tenantId != null ? String(opts.tenantId).trim() : null;

  if (!message && !browserContext) return applyAntigravityOverlay(normalizeDecision(DEFAULT_DECISION), message);

  const apiKey =
    (env?.GEMINI_API_KEY && String(env.GEMINI_API_KEY).trim()) ||
    (env?.GOOGLE_AI_API_KEY && String(env.GOOGLE_AI_API_KEY).trim()) ||
    (await resolveModelApiKey(env, 'google', GEMINI_CLASSIFIER_MODEL, userId));
  if (!apiKey) {
    return applyAntigravityOverlay(normalizeDecision(heuristicDecision(message, browserContext)), message);
  }

  const sys = `You are Agent Sam's capability router. Return JSON only (no markdown).
Classify the user request for which workspace surfaces/tools may be needed.
Capabilities (use these exact strings in arrays): browser, monaco, excalidraw, artifact, d1, hyperdrive, terminal, r2, github, mcp.
Rules:
- should_use_browser true when live page inspection, visual verification, screenshots, route debugging, or a URL/BrowserView context is central.
- should_use_excalidraw true for diagrams, wireframes, architecture maps.
- should_use_monaco true for code/file edits, refactors, new files.
- should_use_artifact_r2 true for publishing/storing generated sites, assets, bundles.
- should_use_d1 true for SQL/schema/workflow run data inspection.
- should_use_github true for repo file edits, PRs, GitHub API tasks.
- should_use_terminal true for run/build/test/deploy/script execution (often approval).
- should_use_open_web_search true only for public internet discovery (latest news, external API docs) — NOT repo grep, NOT D1, NOT MYBROWSER.
- should_use_web_fetch true when user gives a URL to read/fetch/extract (no browser render).
- should_use_workspace_grep true for find-in-repo, grep, ripgrep, symbol lookup in codebase — NEVER use open_web_search for these.
- execution_lane: one of open_web_search | web_fetch | browser_inspect | workspace_grep | none.
- default_surface is one of: chat, browser, monaco, excalidraw (primary UI focus).
- Never set should_use_browser true for pure conceptual questions, public web research, or repo symbol search.
- Never set should_use_open_web_search true for live UI inspection (use browser) or codebase search (use workspace_grep).
Output shape:
{"intent":"slug","needs_capabilities":[],"optional_capabilities":[],"default_surface":"chat","should_use_browser":false,"should_use_excalidraw":false,"should_use_monaco":false,"should_use_artifact_r2":false,"should_use_d1":false,"should_use_github":false,"should_use_terminal":false,"should_use_open_web_search":false,"should_use_web_fetch":false,"should_use_workspace_grep":false,"execution_lane":"none","risk_level":"low|medium|high|critical","approval_required":false,"reason":"short"}`;

  const user = JSON.stringify(
    {
      user_message: message.slice(0, 12000),
      browser_context: browserContext,
    },
    null,
    0,
  );

  try {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_CLASSIFIER_MODEL}` +
      `:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: sys }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 200 },
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      console.warn('[capability-router] gemini', res.status, JSON.stringify(data || {}).slice(0, 400));
      return applyAntigravityOverlay(normalizeDecision(heuristicDecision(message, browserContext)), message);
    }
    let text = '';
    for (const c of data?.candidates || []) {
      for (const p of c?.content?.parts || []) {
        if (typeof p?.text === 'string') text += p.text;
      }
    }
    const parsed = extractJsonObject(text);
    if (!parsed) return applyAntigravityOverlay(normalizeDecision(heuristicDecision(message, browserContext)), message);
    return applyAntigravityOverlay(normalizeDecision(parsed), message);
  } catch (e) {
    console.warn('[capability-router]', e?.message ?? e);
    return applyAntigravityOverlay(normalizeDecision(heuristicDecision(message, browserContext)), message);
  }
}

export function capabilityRouterPromptBlock(decision) {
  const d = decision && typeof decision === 'object' ? decision : DEFAULT_DECISION;
  return [
    '## Workspace capability routing',
    `The following JSON was produced by a cheap classifier (${GEMINI_CLASSIFIER_MODEL} or heuristic). It does NOT auto-run tools.`,
    'Use it to choose tools intentionally:',
    '- Browser: when should_use_browser is true, prefer browser_navigate → browser_content or playwright_screenshot (and cdt_* for interaction). Respect trusted origins (agentsam_browser_trusted_origin).',
    '- Monaco/files: when should_use_monaco is true, emit concrete file content; the dashboard may open the editor from tool results or code blocks.',
    '- Excalidraw: when should_use_excalidraw is true, describe diagram structure; workspace may sync canvas via collab/excalidraw tools when registered.',
    '- Artifacts/R2: when should_use_artifact_r2 is true, use existing r2/artifact tools and register rows when appropriate.',
    '- D1: when should_use_d1 is true, prefer read-only D1/query tools unless user explicitly requests writes (approval).',
    '- GitHub: when should_use_github is true, use github_* tools (OAuth-linked account required).',
    '- Terminal/scripts: when should_use_terminal is true, use terminal/script tools and honor approval gates (Playwright/e2e runs are terminal-backed and must not auto-run).',
    '- Open web: when execution_lane is open_web_search, use search_web (public discovery) — not MYBROWSER.',
    '- Web fetch: when execution_lane is web_fetch, use web_fetch for the given URL — not browser_navigate.',
    '- Workspace grep: when execution_lane is workspace_grep, use fs_search_files / workspace tools — not search_web.',
    '- Container sandbox: when prefer_container_sandbox is true OR exec_lane is sandbox, use agentsam_terminal_sandbox (MY_CONTAINER) for heavy builds. Platform operators on mobile: prefer agentsam_terminal_remote (GCP cloud desk) for routine git/shell — Mac not required.',
    '',
    JSON.stringify(d, null, 2),
  ].join('\n');
}
