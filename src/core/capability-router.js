/**
 * Workspace capability routing — cheap classification for Agent Sam chat.
 * Does not invoke tools; only returns structured hints for system prompt + SSE UI.
 */
import { resolveModelApiKey } from '../integrations/tokens.js';

const NANO_MODEL = 'gpt-5.4-nano';

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
  risk_level: 'low',
  approval_required: false,
  reason: 'default',
};

function heuristicDecision(message, browserContext) {
  const m = String(message || '').toLowerCase();
  const urlInMessage = /https?:\/\/[^\s]+/i.test(m);
  const ctxUrl = browserContext && typeof browserContext === 'object' && browserContext.url;
  const browserCue =
    /\b(inspect|verify|screenshot|debug|live page|looks broken|visual|render|dom|e2e|playwright|open this url|check the page|why does)\b/i.test(
      m,
    ) ||
    !!ctxUrl ||
    urlInMessage;
  const excalCue = /\b(diagram|wireframe|draw|excalidraw|flowchart|map architecture|system map|sketch)\b/i.test(m);
  const monacoCue =
    /\b(edit|refactor|patch|implement|fix the code|component|monaco|this file|landing page file|create a file)\b/i.test(
      m,
    );
  const artifactCue = /\b(publish|artifact|r2|upload|deploy asset|register the artifact|store in library)\b/i.test(m);
  const d1Cue = /\b(d1|hyperdrive|query the db|agentsam_|workflow_runs|select from)\b/i.test(m);
  const terminalCue = /\b(run tests|wrangler|npm run|curl |deploy|execute script|terminal)\b/i.test(m);

  /** @type {string[]} */
  const required = [];
  /** @type {string[]} */
  const optional = [];
  if (browserCue) required.push('browser');
  if (excalCue) required.push('excalidraw');
  if (monacoCue) required.push('monaco');
  if (artifactCue) required.push('artifact');
  if (d1Cue) required.push('d1');
  if (terminalCue) optional.push('terminal');

  let default_surface = 'chat';
  if (browserCue && !excalCue && !monacoCue) default_surface = 'browser';
  else if (excalCue && !browserCue) default_surface = 'excalidraw';
  else if (monacoCue && !browserCue) default_surface = 'monaco';

  return {
    intent: browserCue ? 'debug_live_page' : excalCue ? 'diagram' : monacoCue ? 'code_edit' : 'general_chat',
    needs_capabilities: required.length ? [...new Set(required)] : [],
    optional_capabilities: optional.length ? [...new Set(optional)] : [],
    default_surface,
    should_use_browser: browserCue,
    should_use_excalidraw: excalCue,
    should_use_monaco: monacoCue,
    should_use_artifact_r2: artifactCue,
    should_use_d1: d1Cue,
    should_use_terminal: terminalCue,
    risk_level: terminalCue || artifactCue ? 'medium' : 'low',
    approval_required: terminalCue || artifactCue,
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
    should_use_terminal: !!raw.should_use_terminal,
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

  if (!message && !browserContext) return normalizeDecision(DEFAULT_DECISION);

  const apiKey = await resolveModelApiKey(env, 'openai', NANO_MODEL, userId);
  if (!apiKey) {
    return normalizeDecision(heuristicDecision(message, browserContext));
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
- should_use_terminal true for run/build/test/deploy/script execution (often approval).
- default_surface is one of: chat, browser, monaco, excalidraw (primary UI focus).
- Never set should_use_browser true for pure conceptual questions with no page/URL/visual angle.
Output shape:
{"intent":"slug","needs_capabilities":[],"optional_capabilities":[],"default_surface":"chat","should_use_browser":false,"should_use_excalidraw":false,"should_use_monaco":false,"should_use_artifact_r2":false,"should_use_d1":false,"should_use_terminal":false,"risk_level":"low|medium|high|critical","approval_required":false,"reason":"short"}`;

  const user = JSON.stringify(
    {
      user_message: message.slice(0, 12000),
      browser_context: browserContext,
    },
    null,
    0,
  );

  try {
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: NANO_MODEL,
        input: [
          { role: 'system', content: sys },
          { role: 'user', content: user },
        ],
        reasoning: { effort: 'none' },
        text: { verbosity: 'low' },
        max_output_tokens: 512,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      console.warn('[capability-router] openai', res.status, JSON.stringify(data || {}).slice(0, 400));
      return normalizeDecision(heuristicDecision(message, browserContext));
    }
    let text = '';
    if (data?.output_text) text = data.output_text;
    else if (Array.isArray(data?.output)) {
      for (const item of data.output) {
        for (const c of item?.content || []) {
          if (typeof c?.text === 'string') text += c.text;
        }
      }
    }
    const parsed = extractJsonObject(text);
    if (!parsed) return normalizeDecision(heuristicDecision(message, browserContext));
    return normalizeDecision(parsed);
  } catch (e) {
    console.warn('[capability-router]', e?.message ?? e);
    return normalizeDecision(heuristicDecision(message, browserContext));
  }
}

export function capabilityRouterPromptBlock(decision) {
  const d = decision && typeof decision === 'object' ? decision : DEFAULT_DECISION;
  return [
    '## Workspace capability routing',
    'The following JSON was produced by a cheap classifier (gpt-5.4-nano or heuristic). It does NOT auto-run tools.',
    'Use it to choose tools intentionally:',
    '- Browser: when should_use_browser is true, prefer browser_navigate → browser_content or playwright_screenshot (and cdt_* for interaction). Respect trusted origins (agentsam_browser_trusted_origin).',
    '- Monaco/files: when should_use_monaco is true, emit concrete file content; the dashboard may open the editor from tool results or code blocks.',
    '- Excalidraw: when should_use_excalidraw is true, describe diagram structure; workspace may sync canvas via collab/excalidraw tools when registered.',
    '- Artifacts/R2: when should_use_artifact_r2 is true, use existing r2/artifact tools and register rows when appropriate.',
    '- D1: when should_use_d1 is true, prefer read-only D1/query tools unless user explicitly requests writes (approval).',
    '- Terminal/scripts: when should_use_terminal is true, use terminal/script tools and honor approval gates.',
    '',
    JSON.stringify(d, null, 2),
  ].join('\n');
}
