import { fetchAuthUserTenantId } from './auth.js';
import { jsonResponse } from './responses.js';
import { loadAgentSamUserPolicy } from './agent-policy.js';
import { withTimeout } from './agent-model-resolver.js';
import { loadToolsForRequest } from './agent-tool-loader.js';
import { runAgentToolLoop } from './agent-tool-loop.js';
import { extractBrowserNavigateUrl } from './extract-browser-url.js';
import {
  isCodeImplementationIntent,
  isReadOnlyFileContextIntent,
  isReadOnlyRepoSearchIntent,
  messageExplicitlyRequestsBrowserInspection,
  shouldSkipSurfaceWorkflowPreflight,
} from './code-implementation-intent.js';
import { stripUserTextForIntent } from './active-file-envelope.js';
import { loadModeConfig } from '../api/agent.js';

export async function executeWorkflowAndStream(env, workflowKey, message, actor, workspaceId, ctx, extras = {}) {
  void ctx;
  const runtimeModeTag =
    extras && typeof extras === 'object' && extras.runtimeMode != null
      ? String(extras.runtimeMode).trim().toLowerCase()
      : undefined;
  const uid = actor?.id ?? actor?.user_id ?? null;
  let tid =
    actor?.tenant_id != null && String(actor.tenant_id).trim() !== ''
      ? String(actor.tenant_id).trim()
      : null;
  if (!tid && uid) tid = await fetchAuthUserTenantId(env, uid);

  const authLike = {
    id: uid,
    tenant_id: tid,
    email: actor?.email ?? null,
  };

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  const send = (data) => {
    try {
      writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
    } catch (_) {}
  };

  const browserCtx =
    extras && typeof extras === 'object' && extras.browserContext != null && typeof extras.browserContext === 'object'
      ? extras.browserContext
      : null;

  (async () => {
    try {
      const { executeWorkflowGraph } = await import('../core/workflow-executor.js');
      const result = await executeWorkflowGraph(env, {
        workflowKey,
        input: {
          message,
          ...(runtimeModeTag ? { runtime_mode: runtimeModeTag } : {}),
          ...(browserCtx ? { browser_context: browserCtx } : {}),
        },
        tenantId: tid,
        workspaceId,
        userId: uid,
        userEmail: authLike.email ?? null,
        triggerType: 'agent',
        onRunCreated: (runId, meta) =>
          send({
            type: 'workflow_start',
            workflow_key: workflowKey,
            run_id: runId,
            steps_total: meta?.steps_total ?? null,
          }),
        onStep: (evt) => send({ type: 'workflow_step', ...evt }),
        onStream: send,
      });
      const finalText = formatWorkflowStreamFinalText(result);
      if (String(finalText).trim()) {
        send({ type: 'text', text: finalText });
      }
      const navFromProof = (result?.step_results ?? [])
        .map((s) => s?.output?.surface_open_proof)
        .filter(Boolean)
        .map((p) => extractBrowserNavigateUrl(p))
        .find(Boolean);
      const navUrl = navFromProof || extractBrowserNavigateUrl(message);
      if (navUrl) {
        send({ type: 'browser_navigate', url: navUrl });
      }
      if (result?.status === 'awaiting_approval') {
        send({
          type: 'workflow_approval_required',
          run_id: result.run_id,
          approval_id: result.approval_id,
          message:
            'This workflow requires approval before continuing. Use /api/agent/workflow/approve to proceed.',
        });
      } else {
        send({
          type: result.ok ? 'workflow_complete' : 'workflow_error',
          status: result.status,
          run_id: result.run_id,
          message: result.ok
            ? `Workflow ${workflowKey} completed (${result.steps_completed} steps).`
            : `Workflow failed: ${result.kill_reason || 'unknown error'}`,
        });
      }
    } catch (e) {
      send({
        type: 'text',
        text: `Workflow stream error: ${e?.message ?? String(e)}`,
      });
    } finally {
      send({ type: 'done' });
      try {
        await writer.close();
      } catch (_) {}
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/**
 * Smoke: explicit Monaco/code path must hit workflow graph (no LLM tool loop).
 *   curl -N -sS https://inneranimalmedia.com/api/agent/chat \
 *     -H "Cookie: session=$IAM_SESSION" \
 *     -H "Accept: text/event-stream" \
 *     -F "message=Open Monaco and generate a tiny task tracker app" \
 *     -F "mode=agent" \
 *     -F "agent_mode=agent" \
 *     -F "runtime_intent_mode=agent" \
 *     -F "model=auto" \
 *     | tee /tmp/agent-mode-monaco-sse.txt
 * Expect: workflow_key i-am-builder-monaco, surface_open / agent_surface_open before any model tool dispatch.
 *
 * Browser surface smoke (no a11y tool roulette):
 *   curl -N -sS https://inneranimalmedia.com/api/agent/chat \
 *     -H "Cookie: session=$IAM_SESSION" \
 *     -H "Accept: text/event-stream" \
 *     -F "message=Open the browser and inspect https://inneranimalmedia.com" \
 *     -F "mode=agent" -F "agent_mode=agent" -F "runtime_intent_mode=agent" -F "model=auto" \
 *     | tee /tmp/agent-browser-sse.txt
 * Expect: surface_open + agent_surface_open (browser), browser_navigate with URL; no a11y_get_summary.
 */

/**
 * @param {Record<string, unknown>} meta
 * @param {string} surf
 * @param {string|null} intent
 */
function surfaceRoutesMetadataMatch(meta, surf, intent) {
  const sr = meta?.surface_routes;
  if (!sr) return false;
  if (Array.isArray(sr)) {
    return sr.includes(surf) || sr.includes('*');
  }
  if (typeof sr === 'object' && sr !== null) {
    const routes = /** @type {Record<string, string[]>} */ (sr)[surf] ?? [];
    return !intent || routes.includes(intent) || routes.includes('*');
  }
  return false;
}

/**
 * Resolve workflow_id from agentsam_workflows.metadata_json.surface_routes (DB-driven).
 * @param {any} env
 * @param {string} surface
 * @param {string|null} [intent]
 * @returns {Promise<string|null>} workflow_key
 */
async function resolveWorkflowFromSurfaceMetadata(env, surface, intent = null) {
  if (!env?.DB || !surface) return null;
  const surf = String(surface).trim();
  if (!surf) return null;
  try {
    const { results } = await env.DB.prepare(
      `SELECT workflow_key, metadata_json
       FROM agentsam_workflows
       WHERE COALESCE(is_active, 1) = 1
       ORDER BY updated_at DESC`,
    ).all();
    for (const row of results || []) {
      let meta = {};
      try {
        meta =
          typeof row.metadata_json === 'object'
            ? row.metadata_json
            : JSON.parse(row.metadata_json || '{}');
      } catch {
        meta = {};
      }
      if (surfaceRoutesMetadataMatch(meta, surf, intent)) {
        return String(row.workflow_key || '').trim() || null;
      }
    }
  } catch (e) {
    console.warn('[agent] resolveWorkflowFromSurfaceMetadata', e?.message ?? e);
  }
  console.warn(`[agent] no workflow for surface=${surf} intent=${intent ?? ''}`);
  return null;
}

/**
 * User explicitly wants the in-dashboard Monaco / code editor surface — not generic
 * "write a file" / "edit file" work (those use normal agent tools + file_updated UI).
 */
function userExplicitlyRequestsMonacoEditor(message) {
  const raw = String(message || '').trim();
  const t = raw.toLowerCase();
  if (!t) return false;
  if (/\bopen\s+monaco\b/i.test(t)) return true;
  if (/\bopen\s+(the\s+)?code\s+editor\b/i.test(t)) return true;
  if (/\bopen\s+the\s+editor\b/i.test(t) || /^\s*open\s+editor\s*$/i.test(raw)) return true;
  if (
    /\bopen\b/i.test(t) &&
    /\b(the\s+)?editor\b/i.test(t) &&
    !/\bbrowser\b/i.test(t) &&
    !/\bproject\b/i.test(t)
  )
    return true;
  return false;
}

/**
 * Deterministic surface → workflow routing before tool catalog / model dispatch.
 * @returns {null | { route: 'monaco' | 'browser' | 'excalidraw', reason: string }}
 */
export function resolveSurfaceWorkflowForMessage(message, requestedMode) {
  const mode = String(requestedMode || 'agent').trim().toLowerCase();
  const raw = String(message || '').trim();
  const t = raw.toLowerCase();
  if (!t) return null;

  if (shouldSkipSurfaceWorkflowPreflight(raw, mode)) return null;

  if (mode === 'plan') return null;

  const isAsk = mode === 'ask';
  const isDebug = mode === 'debug';
  const isAgentLike = mode === 'agent' || mode === 'multitask';

  const askBrowser =
    /\bopen\s+(the\s+)?browser\b/i.test(t) ||
    /\bopen\s+browser\b/i.test(t) ||
    /\binspect\s+(the\s+)?(site|page)\b/i.test(t) ||
    /\bdebug\s+(the\s+)?(site|page)\b/i.test(t) ||
    /\bdebug\s+this\s+site\b/i.test(t) ||
    /\bscreenshot\b/i.test(t) ||
    /\bcapture\s+(the\s+)?page\b/i.test(t) ||
    /\bnavigate\s+to\b/i.test(t) ||
    /\b(check|inspect)\s+(the\s+)?(console|network)\b/i.test(t) ||
    /\binspect\s+(the\s+)?dom\b/i.test(t) ||
    /\binspect\s+https?:\/\//i.test(t);

  if (isAsk) {
    if (/\bopen\s+excalidraw\b/i.test(t)) return { route: 'excalidraw', reason: 'ask_explicit_open_excalidraw' };
    if (askBrowser) return { route: 'browser', reason: 'ask_explicit_browser_surface' };
    if (userExplicitlyRequestsMonacoEditor(raw)) return { route: 'monaco', reason: 'ask_explicit_monaco_editor' };
    return null;
  }

  if (isDebug) {
    if (isCodeImplementationIntent(raw) && !messageExplicitlyRequestsBrowserInspection(raw)) {
      return { route: 'monaco', reason: 'debug_code_implementation_surface' };
    }
    const dbgBrowser =
      /\bopen\s+(the\s+)?browser\b/i.test(t) ||
      /\bdebug\s+this\s+site\b/i.test(t) ||
      (/\b(debug|inspect)\b/i.test(t) &&
        /\b(url|site|page|browser|dom|console|network)\b/i.test(t) &&
        !/\b(route|component|migration|\.tsx|app\.tsx)\b/i.test(t)) ||
      /\b(screenshot|screen\s*grab)\b/i.test(t) ||
      /\binspect\s+https?:\/\//i.test(t) ||
      (!!extractBrowserNavigateUrl(t) && /\b(inspect|debug|browser)\b/i.test(t));
    if (!dbgBrowser) return null;
    return { route: 'browser', reason: 'debug_explicit_browser' };
  }

  if (!isAgentLike) return null;

  if (
    isCodeImplementationIntent(raw) &&
    !messageExplicitlyRequestsBrowserInspection(raw)
  ) {
    return { route: 'monaco', reason: 'agent_code_implementation_surface' };
  }

  const excal =
    /\bopen\s+excalidraw\b/i.test(t) ||
    /\bexcalidraw\b/i.test(t) ||
    /\b(make|create|draw)\s+(a\s+)?diagram\b/i.test(t) ||
    /\bflowchart\b/i.test(t) ||
    /\bwireframe\b/i.test(t) ||
    /\barchitecture\s+diagram\b/i.test(t) ||
    (/\b(open|show|launch)\b/i.test(t) && /\b(canvas|whiteboard)\b/i.test(t));
  if (excal) return { route: 'excalidraw', reason: 'agent_excalidraw_surface' };

  const browser =
    messageExplicitlyRequestsBrowserInspection(raw) ||
    /\bopen\s+(the\s+)?browser\b/i.test(t) ||
    /\bdebug\s+this\s+site\b/i.test(t) ||
    /\binspect\s+(the\s+)?(site|page)\b/i.test(t) ||
    /\bdebug\s+(the\s+)?(site|page)\b/i.test(t) ||
    (/\b(debug|inspect)\b/i.test(t) &&
      /\b(site|page|url|browser|dom|console|network)\b/i.test(t) &&
      !/\b(route|component|migration|\.tsx|app\.tsx|components\/)\b/i.test(t)) ||
    /\b(screenshot|screen\s*grab)\b/i.test(t) ||
    /\bcapture\s+(the\s+)?page\b/i.test(t) ||
    (/\bnavigate\b/i.test(t) && /\b(to\s+)?(url|page|site|https?:)/i.test(t)) ||
    /\bnavigate\s+to\b/i.test(t) ||
    /\b(check|inspect)\s+(the\s+)?(console|network)\b/i.test(t) ||
    /\binspect\s+(the\s+)?dom\b/i.test(t) ||
    /\binspect\s+https?:\/\//i.test(t) ||
    (!!extractBrowserNavigateUrl(t) &&
      /\b(inspect|debug|open\s+the\s+browser|open\s+browser|screenshot|navigate)\b/i.test(t));
  if (browser) return { route: 'browser', reason: 'agent_browser_surface' };

  if (userExplicitlyRequestsMonacoEditor(raw)) return { route: 'monaco', reason: 'agent_monaco_code_surface' };

  return null;
}

/** URL from message text or structured browser_context (dashboard BrowserView). */
export function extractPrimaryUrlForBrowserPreflight(message, browserContext) {
  const fromMsg = extractBrowserNavigateUrl(message);
  if (fromMsg) return fromMsg;
  return extractBrowserNavigateUrl(browserContext) || '';
}

/** Human-readable workflow SSE text — never dump surface_open_proof JSON into chat. */
function formatWorkflowStreamFinalText(result) {
  const steps = Array.isArray(result?.step_results) ? result.step_results : [];
  const lines = [];
  for (const s of steps) {
    const nk = s?.node_key ? String(s.node_key) : 'step';
    if (s?.ok === false && s?.error) {
      lines.push(`**${nk}** failed: ${String(s.error).slice(0, 500)}`);
      continue;
    }
    const proof = s?.output?.surface_open_proof;
    if (proof && typeof proof === 'object') {
      const url = typeof proof.url === 'string' ? proof.url.trim() : '';
      const surface = typeof proof.surface === 'string' ? proof.surface : 'browser';
      lines.push(url ? `Opened **${surface}** → ${url}` : `Opened **${surface}** workspace.`);
      continue;
    }
    const text = s?.output?.result ?? s?.output?.text;
    if (typeof text === 'string' && text.trim()) {
      const t = text.trim();
      if (!t.startsWith('{') && !t.startsWith('[')) {
        lines.push(t);
        continue;
      }
      try {
        const parsed = JSON.parse(t);
        const summary =
          (typeof parsed.summary === 'string' && parsed.summary) ||
          (typeof parsed.message === 'string' && parsed.message) ||
          (typeof parsed.issue_summary === 'string' && parsed.issue_summary) ||
          '';
        if (summary) lines.push(summary);
      } catch {
        /* skip opaque JSON blobs */
      }
    }
  }
  if (lines.length) return lines.join('\n\n');
  const lastProof = steps[steps.length - 1]?.output?.surface_open_proof;
  if (lastProof?.url) return `Opened browser → ${lastProof.url}`;
  return '';
}

/** Prefer seeded keys, then registry / node graph heuristics. */
async function resolveBrowserWorkflowKeyFromDb(env) {
  const metaRouted = await resolveWorkflowFromSurfaceMetadata(env, 'browser', '*');
  if (metaRouted) {
    try {
      const wf = await env.DB.prepare(
        `SELECT workflow_key FROM agentsam_workflows WHERE workflow_key = ? AND COALESCE(is_active, 1) = 1 LIMIT 1`,
      )
        .bind(metaRouted)
        .first();
      if (wf?.workflow_key) return String(wf.workflow_key);
    } catch {
      /* fall through */
    }
  }
  if (!env?.DB) return null;
  try {
    const row = await env.DB.prepare(
      `SELECT workflow_key FROM agentsam_workflows
       WHERE COALESCE(is_active, 1) = 1
         AND (
           LOWER(workflow_key) LIKE '%browser%'
           OR LOWER(workflow_key) LIKE '%playwright%'
           OR LOWER(workflow_key) LIKE '%inspector%'
         )
       ORDER BY CASE WHEN LOWER(workflow_key) LIKE '%browser%' THEN 0 ELSE 1 END,
                workflow_key ASC
       LIMIT 1`,
    ).first();
    if (row?.workflow_key) return String(row.workflow_key);
  } catch (e) {
    console.warn('[agent] resolveBrowserWorkflowKeyFromDb registry', e?.message ?? e);
  }
  try {
    const row2 = await env.DB.prepare(
      `SELECT w.workflow_key FROM agentsam_workflows w
       INNER JOIN agentsam_workflow_nodes n ON n.workflow_id = w.id
       WHERE COALESCE(w.is_active, 1) = 1
         AND (
           LOWER(COALESCE(n.node_key, '')) LIKE '%browser%'
           OR LOWER(COALESCE(n.handler_key, '')) LIKE '%browser%'
           OR LOWER(COALESCE(n.handler_key, '')) LIKE '%playwright%'
           OR LOWER(COALESCE(n.node_key, '')) LIKE '%screenshot%'
           OR LOWER(COALESCE(n.node_key, '')) LIKE '%inspect%'
         )
       GROUP BY w.workflow_key
       ORDER BY w.workflow_key ASC
       LIMIT 1`,
    ).first();
    if (row2?.workflow_key) return String(row2.workflow_key);
  } catch (e2) {
    console.warn('[agent] resolveBrowserWorkflowKeyFromDb nodes', e2?.message ?? e2);
  }
  return null;
}

function userRequestedAccessibilityTools(message) {
  return /\b(a11y|accessibility|wcag|aria|screen\s*reader|axe)\b/i.test(String(message || ''));
}

function shouldStripA11yForPlainSurfaceMessage(message, requestedMode) {
  if (userRequestedAccessibilityTools(message)) return false;
  const mode = String(requestedMode || '').toLowerCase();
  if (mode === 'plan') return false;
  const tagged = resolveSurfaceWorkflowForMessage(message, requestedMode);
  if (!tagged) return false;
  if (tagged.route === 'excalidraw') return false;
  return true;
}

function stripSurfaceA11yTools(tools) {
  if (!Array.isArray(tools)) return tools;
  return tools.filter((t) => {
    const n = String(t?.name || '');
    if (n.startsWith('a11y_')) return false;
    if (n === 'accessibilityExpert') return false;
    return true;
  });
}

function isAgentLikeSurfacePreflightMode(requestedMode) {
  const mode = String(requestedMode || 'agent').trim().toLowerCase();
  return mode === 'agent' || mode === 'debug' || mode === 'multitask' || mode === 'ask';
}

export function logSurfacePreflightIntentDebug(message, requestedMode) {
  const strippedUserText = stripUserTextForIntent(message);
  const tagged = resolveSurfaceWorkflowForMessage(message, requestedMode);
  console.log(
    '[agent] surface_preflight_intent_debug',
    JSON.stringify({
      userText: String(message || '').slice(0, 200),
      strippedUserText: strippedUserText.slice(0, 200),
      isReadOnlyRepoSearchIntent: isReadOnlyRepoSearchIntent(message),
      isReadOnlyFileContextIntent: isReadOnlyFileContextIntent(message),
      isCodeImplementationIntent: isCodeImplementationIntent(message),
      shouldSkipSurfaceWorkflowPreflight: shouldSkipSurfaceWorkflowPreflight(message, requestedMode),
      reason: tagged?.reason ?? null,
    }),
  );
}

export function shouldBypassSurfaceWorkflowPreflight(message, requestedMode) {
  if (!isAgentLikeSurfacePreflightMode(requestedMode)) return false;
  return isReadOnlyRepoSearchIntent(message) || isReadOnlyFileContextIntent(message);
}

function surfaceWorkflowPreflightBypassReason(message) {
  if (isReadOnlyRepoSearchIntent(message)) return 'read_only_workspace_grep';
  if (isReadOnlyFileContextIntent(message)) return 'read_only_file_context';
  return 'read_only_surface';
}

export function logSurfaceWorkflowPreflightBypass(requestedMode, missingSurface, surfaceRouteReason, message) {
  console.log(
    '[agent] surface_workflow_preflight_bypass',
    JSON.stringify({
      reason: surfaceWorkflowPreflightBypassReason(message),
      requestedMode,
      missingSurface,
      surfaceRouteReason: surfaceRouteReason ?? null,
      activeFilePresent: /\[Active file envelope/i.test(String(message || '')),
    }),
  );
}

/**
 * Map surface route to concrete workflow_key (or missing).
 * @returns {Promise<null | { kind: 'execute', workflowKey: string, reason: string } | { kind: 'missing_workflow', surface: string, reason: string }>}
 */
export async function resolveSurfaceWorkflowPreflightExecution(env, message, requestedMode, browserContext) {
  const dashboardRoute =
    browserContext && typeof browserContext === 'object' && browserContext.dashboard_route != null
      ? String(browserContext.dashboard_route).trim()
      : '';
  if (shouldSkipSurfaceWorkflowPreflight(message, requestedMode, { dashboardRoute })) return null;
  const tagged = resolveSurfaceWorkflowForMessage(message, requestedMode);
  if (!tagged) return null;
  if (tagged.route === 'monaco') {
    const key = await resolveWorkflowFromSurfaceMetadata(env, 'monaco', '*');
    if (key) return { kind: 'execute', workflowKey: key, reason: tagged.reason };
    if (
      shouldBypassSurfaceWorkflowPreflight(message, requestedMode) ||
      isCodeImplementationIntent(message)
    ) {
      logSurfaceWorkflowPreflightBypass(requestedMode, 'monaco', tagged.reason, message);
      return null;
    }
    return { kind: 'missing_workflow', surface: 'monaco', reason: tagged.reason };
  }
  if (tagged.route === 'browser') {
    const key = await resolveBrowserWorkflowKeyFromDb(env);
    if (key) return { kind: 'execute', workflowKey: key, reason: tagged.reason };
    return { kind: 'missing_workflow', surface: 'browser', reason: tagged.reason };
  }
  if (tagged.route === 'excalidraw') {
    const key = await resolveWorkflowFromSurfaceMetadata(env, 'excalidraw', '*');
    if (key) return { kind: 'execute', workflowKey: key, reason: tagged.reason };
    return { kind: 'missing_workflow', surface: 'excalidraw', reason: tagged.reason };
  }
  return null;
}

/** When no browser workflow is registered: open Browser tab + navigate without entering LLM tool loop. */
export function streamBrowserPreflightNoWorkflow(message, browserContext) {
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const runId = `wrun_browser_preflight_${Date.now().toString(36)}`;
  const url = extractPrimaryUrlForBrowserPreflight(message, browserContext);
  (async () => {
    try {
      const ctxPayload =
        browserContext && typeof browserContext === 'object'
          ? {
              url: browserContext.url ?? null,
              route_path: browserContext.route_path ?? null,
              selected_element: browserContext.selected_element ?? null,
              dashboard_route: browserContext.dashboard_route ?? null,
            }
          : {};
      writer.write(
        encoder.encode(
          `data: ${JSON.stringify({
            type: 'context',
            scope: 'browser_preflight',
            browser_context: ctxPayload,
          })}\n\n`,
        ),
      );
      const surf = {
        surface: 'browser',
        reason: 'browser_preflight',
        node_key: 'preflight',
        run_id: runId,
        workflow_key: null,
      };
      writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'surface_open', ...surf })}\n\n`));
      writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'agent_surface_open', ...surf })}\n\n`));
      if (url) {
        writer.write(
          encoder.encode(`data: ${JSON.stringify({ type: 'browser_navigate', url, run_id: runId })}\n\n`),
        );
      }
      writer.write(
        encoder.encode(
          `data: ${JSON.stringify({
            type: 'text',
            text:
              '**Browser workflow graph is not active in D1** — deterministic automation steps are unavailable until a browser/playwright workflow is seeded and `is_active=1`. The dashboard should still open the Browser tab above.\n\n' +
              (url ? `_Target URL:_ ${url}\n\n` : '_No URL parsed from message or browser context._\n\n') +
              `_Message:_ ${String(message || '').slice(0, 400)}`,
          })}\n\n`,
        ),
      );
      writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
    } catch (_) {
      /* ignore */
    } finally {
      try {
        await writer.close();
      } catch (_) {}
    }
  })();
  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export function streamPreflightSurfaceWorkflowMissing(surface, userMessage) {
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const runId = `wrun_preflight_${Date.now().toString(36)}`;
  (async () => {
    try {
      const payload = {
        surface,
        reason: 'surface_workflow_preflight_missing',
        node_key: 'preflight',
        run_id: runId,
      };
      writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'surface_open', ...payload })}\n\n`));
      writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'agent_surface_open', ...payload })}\n\n`));
      const label =
        surface === 'browser'
          ? 'Browser inspection'
          : surface === 'excalidraw'
            ? 'Excalidraw / diagram'
            : String(surface);
      writer.write(
        encoder.encode(
          `data: ${JSON.stringify({
            type: 'text',
            text: `**${label} workflow is missing** — no active matching workflow_key in D1 for this deployment. Add or activate the workflow graph, then retry.\n\n_Message:_ ${String(userMessage || '').slice(0, 480)}`,
          })}\n\n`,
        ),
      );
      writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
    } catch (_) {
      /* ignore */
    } finally {
      try {
        await writer.close();
      } catch (_) {}
    }
  })();
  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/** Wildcard glob match for MCP panel tool allowlists (e.g. `d1_*`, `*`). */
export function mcpPanelToolMatchesGlob(toolName, pattern) {
  const n = String(toolName || '').trim();
  const p = String(pattern || '').trim();
  if (!n || !p) return false;
  if (p === '*' || p === '**') return true;
  const esc = p
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  try {
    return new RegExp(`^${esc}$`, 'i').test(n);
  } catch {
    return false;
  }
}

export function filterToolsForMcpPanelGlobs(tools, globs) {
  if (!Array.isArray(tools) || !tools.length) return [];
  if (!Array.isArray(globs) || !globs.length) return tools;
  const list = globs.map((g) => String(g || '').trim()).filter(Boolean);
  if (!list.length) return tools;
  return tools.filter((t) => list.some((g) => mcpPanelToolMatchesGlob(t?.name, g)));
}

/**
 * MCP dashboard subagent chat — reuses {@link runAgentToolLoop} / dispatchStream (same path as agent chat).
 * Called only from server-side routes with a trusted panel payload (not client-spoofed overrides).
 *
 * @param {Record<string, unknown>} panel
 */
export async function mcpPanelAgentChatSse(env, request, ctx, panel) {
  const tenantId = panel.tenantId != null ? String(panel.tenantId).trim() : '';
  const userId = panel.userId != null ? String(panel.userId).trim() : '';
  const workspaceId = panel.workspaceId != null ? String(panel.workspaceId).trim() : '';
  const personUuid =
    panel.personUuid != null && String(panel.personUuid).trim() !== ''
      ? String(panel.personUuid).trim()
      : null;
  const sessionPkId = panel.sessionPkId != null ? String(panel.sessionPkId).trim() : '';
  const slug = panel.slug != null ? String(panel.slug).trim() : '';
  const profile = panel.profile && typeof panel.profile === 'object' ? panel.profile : {};
  const modelKey = panel.modelKey != null ? String(panel.modelKey).trim() : '';
  /** @type {{ role: string, content: string }[]} */
  const messages = Array.isArray(panel.messages) ? panel.messages : [];
  let toolGlobs = [];
  try {
    const raw = profile.allowed_tool_globs;
    if (typeof raw === 'string') {
      const j = JSON.parse(raw || '[]');
      toolGlobs = Array.isArray(j) ? j : [];
    } else if (Array.isArray(raw)) toolGlobs = raw;
  } catch {
    toolGlobs = [];
  }
  if (Array.isArray(panel.toolGlobsOverride) && panel.toolGlobsOverride.length) {
    toolGlobs = panel.toolGlobsOverride.map((x) => String(x || '').trim()).filter(Boolean);
  }

  if (!tenantId || !userId || !workspaceId || !sessionPkId || !slug || !modelKey) {
    return jsonResponse({ error: 'mcp_panel_chat: missing tenant/user/workspace/session/model' }, 400);
  }
  if (!messages.length) return jsonResponse({ error: 'messages required' }, 400);

  const requestedMode = 'agent';
  const [modeConfig, userPolicy] = await Promise.all([
    loadModeConfig(env, requestedMode, workspaceId),
    loadAgentSamUserPolicy(env, userId, workspaceId),
  ]);

  const effectiveMaxTools = Math.max(1, Math.min(200, Number(modeConfig.max_tool_calls || 20) || 20));

  const lastUserMsg =
    messages.length && String(messages[messages.length - 1]?.role || '') === 'user'
      ? String(messages[messages.length - 1]?.content || '')
      : '';
  const {
    tools: dbToolsRaw,
    toolRoutingError: panelToolRoutingError,
  } = await loadToolsForRequest(env, requestedMode, 'question', {
    limit: effectiveMaxTools,
    includeSchemas: false,
    userId,
    workspaceId,
    tenantId,
    personUuid,
    message: lastUserMsg,
    taskType: 'agent',
    agentChat: true,
    routeKey: 'mcp_panel',
  });
  if (panelToolRoutingError) {
    return jsonResponse(
      {
        error: panelToolRoutingError.message,
        code: panelToolRoutingError.code,
        missing_capabilities: panelToolRoutingError.missing,
      },
      422,
    );
  }
  let tools = dbToolsRaw.map((t) => {
    const raw = t.input_schema && typeof t.input_schema === 'object' ? t.input_schema : {};
    return {
      name: t.name,
      description: t.description || t.name,
      input_schema: Object.assign({ type: 'object', properties: {} }, raw, { type: 'object' }),
    };
  });
  tools = filterToolsForMcpPanelGlobs(tools, toolGlobs);

  const sysInst = String(profile.instructions_markdown || '').trim();
  const systemPrompt =
    sysInst +
    '\n\n## Current Session\n' +
    `Tenant: ${tenantId}\n` +
    `Workspace: ${workspaceId}\n` +
    `Date: ${new Date().toISOString()}\n`;

  const panelIsSuperadmin =
    panel.isSuperadmin === true ||
    String(panel.authUser?.role ?? '').trim().toLowerCase() === 'superadmin' ||
    Number(panel.authUser?.is_superadmin) === 1;

  const mcpRuntimeContext = {
    userId,
    tenantId,
    workspaceId,
    personUuid,
    sessionId: sessionPkId,
    isSuperadmin: panelIsSuperadmin,
    authUser: panel.authUser ?? null,
    routeKey: 'mcp_panel',
    mcp_panel_slug: slug,
  };

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  const emit = (type, payload) => {
    try {
      writer.write(encoder.encode(`data: ${JSON.stringify({ type, ...payload })}\n\n`));
    } catch (_) {}
  };

  emit('context', {
    intent: 'mcp_panel',
    mode: requestedMode,
    model: modelKey,
    tool_count: tools.length,
    slug,
  });

  const MCP_CHAT_LOOP_MS = 300000;

  ;(async () => {
    let assistantAccum = '';
    try {
      let textEmitted = 0;
      const emitWrapped = (type, payload) => {
        if (type === 'text' && payload?.text) {
          textEmitted += String(payload.text).length;
          assistantAccum += String(payload.text);
        }
        emit(type, payload);
      };

      const lastLoopStats = await withTimeout(
        runAgentToolLoop(env, ctx, emitWrapped, {
          request,
          messages,
          tools,
          systemPrompt,
          modelKey,
          temperature: modeConfig.temperature || 0.7,
          maxToolCalls: effectiveMaxTools,
          mode: requestedMode,
          modeConfig,
          userPolicy,
          sessionId: sessionPkId,
          tenantId,
          userId,
          workspaceId,
          routingTaskType: 'agent',
          qualityScore: 1,
          mcpRuntimeContext,
          routingArmId: null,
          thompsonModelKey: null,
          chatRouteKey: 'mcp_panel',
          promptAuditContext: {
            route: 'mcp_panel_chat',
            mcp_slug: slug,
            session_id: sessionPkId,
            workspace_id: workspaceId,
            mode: requestedMode,
          },
        }),
        MCP_CHAT_LOOP_MS,
      );

      const toolCallsUsed = Number(lastLoopStats?.toolCallsUsed) || 0;
      const tokensIn = Number(lastLoopStats?.totalUsage?.input_tokens) || 0;
      const tokensOut = Number(lastLoopStats?.totalUsage?.output_tokens) || 0;

      if (textEmitted <= 0) {
        emit('error', { message: 'empty_stream' });
      }

      ctx.waitUntil?.(
        (async () => {
          try {
            if (!env.DB) return;
            const nextMsgs = [
              ...messages.map((m) => ({
                role: String(m?.role || ''),
                content: String(m?.content || ''),
              })),
              ...(assistantAccum ? [{ role: 'assistant', content: assistantAccum }] : []),
            ].filter((m) => m.content && (m.role === 'user' || m.role === 'assistant'));
            const capped = nextMsgs.slice(-40);

            await env.DB.prepare(
              `UPDATE mcp_agent_sessions SET
                 status = 'idle',
                 messages_json = ?,
                 cost_usd = COALESCE(cost_usd, 0) + ?,
                 tool_calls_count = COALESCE(tool_calls_count, 0) + ?,
                 last_activity = datetime('now'),
                 updated_at = unixepoch(),
                 current_task = NULL
               WHERE id = ? AND tenant_id = ?`,
            )
              .bind(
                JSON.stringify(capped),
                0,
                toolCallsUsed,
                sessionPkId,
                tenantId,
              )
              .run();
          } catch (e) {
            console.warn('[mcp_panel_chat] session update failed:', e?.message ?? e);
          }
        })(),
      );

      void tokensIn;
      void tokensOut;
    } catch (e) {
      console.warn('[mcp_panel_chat]', e?.message ?? e);
      emit('error', { message: String(e?.message || e || 'chat_failed') });
      ctx.waitUntil?.(
        (async () => {
          try {
            if (!env.DB) return;
            await env.DB.prepare(
              `UPDATE mcp_agent_sessions SET status = 'idle', updated_at = unixepoch(), last_activity = datetime('now') WHERE id = ? AND tenant_id = ?`,
            )
              .bind(sessionPkId, tenantId)
              .run();
          } catch (_) {}
        })(),
      );
    } finally {
      await writer.close().catch(() => {});
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

// ─── SSE Chat Handler ─────────────────────────────────────────────────────────

/** Composer runtime contract (lowercase): ask | plan | agent | debug | multitask */
