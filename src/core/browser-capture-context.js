/**
 * DB-driven browser.capture_context — resolves tools from agentsam_tools,
 * merges dashboard browserContext (selected element, route, viewport), and returns structured capture.
 */
import { dispatchCatalogToolResult } from './dispatch-by-tool-code.js';
import { assertBrowserTrustedOrigin } from './agentsam-ops-ledger.js';
import { loadAvailableToolsForCapability, isTrustedBrowserReadTool } from './tool-registry.js';

function flattenInput(input) {
  if (input == null) return {};
  if (typeof input === 'object' && !Array.isArray(input)) return { ...input };
  return { value: input };
}

function pickTool(registryRows, candidates) {
  const set = new Set(registryRows.map((r) => String(r.tool_name)));
  for (const c of candidates) {
    if (set.has(c)) return c;
  }
  return null;
}

function toolResultOk(res) {
  if (!res || typeof res !== 'object') return false;
  if (res.blocked) return false;
  if (res.error && String(res.error).trim()) return false;
  if (res.ok === false) return false;
  return true;
}

function extractUrl(flat) {
  const bc = flat.browserContext && typeof flat.browserContext === 'object' ? flat.browserContext : null;
  const fromCtx = bc?.url != null ? String(bc.url).trim() : '';
  if (fromCtx) return fromCtx;
  const fromFlat = flat.url != null ? String(flat.url).trim() : '';
  if (fromFlat) return fromFlat;
  const m = String(flat.message || flat.prompt || '').match(/https?:\/\/[^\s)>'"<]+/i);
  return m ? m[0].replace(/[.,;]+$/, '') : '';
}

/**
 * @param {any} env
 * @param {unknown} input
 * @param {Record<string, unknown>} runContext
 */
export async function executeBrowserCaptureContext(env, input, runContext) {
  const flat = flattenInput(input);
  const meta = runContext?.runMeta || {};
  const tenantId = String(meta.tenantId ?? runContext?.tenantId ?? flat.tenant_id ?? '').trim();
  const workspaceId = String(meta.workspaceId ?? runContext?.workspaceId ?? flat.workspace_id ?? '').trim();
  const userId = String(meta.userId ?? runContext?.userId ?? flat.user_id ?? '').trim();
  const url = extractUrl(flat);

  if (!url) {
    return { ok: false, error: 'browser.capture_context: no url in browserContext or input' };
  }

  try {
    await assertBrowserTrustedOrigin(env, { userId, workspaceId, origin: url });
  } catch (e) {
    return { ok: false, error: e?.message != null ? String(e.message) : String(e) };
  }

  const registry = await loadAvailableToolsForCapability(env, tenantId, workspaceId, userId, 'browser');
  const baseParams = {
    url,
    user_id: userId,
    workspace_id: workspaceId,
    session: { user_id: userId, workspace_id: workspaceId, workspaceId },
  };

  const toolsUsed = {};
  const capture = {
    url,
    route_path: flat.route_path ?? flat.browserContext?.route_path ?? null,
    viewport: flat.browserContext?.viewport ?? flat.viewport ?? null,
    selected_element:
      flat.selected_element ??
      flat.browserContext?.selected_element ??
      flat.browserContext?.selectedElement ??
      null,
    captured_at: new Date().toISOString(),
  };

  const ctx = { tenantId, workspaceId, userId };
  const navigateName = pickTool(registry, ['browser_navigate', 'cdt_navigate_page']);
  if (navigateName) {
    const navRes = await dispatchCatalogToolResult(env, navigateName, baseParams, ctx);
    toolsUsed.navigate = navigateName;
    capture.navigate = navRes;
    if (!toolResultOk(navRes)) {
      return { ok: false, error: String(navRes?.error || 'navigate_failed'), output: capture, tools_used: toolsUsed };
    }
  }

  const contentName = pickTool(registry, ['browser_content']);
  if (contentName) {
    const contentRes = await dispatchCatalogToolResult(env, contentName, baseParams, ctx);
    toolsUsed.content = contentName;
    capture.content = contentRes;
  }

  const consoleName = pickTool(registry, ['cdt_list_console_messages']);
  if (consoleName) {
    const consoleRes = await dispatchCatalogToolResult(env, consoleName, { ...baseParams, limit: 100 }, ctx);
    toolsUsed.console = consoleName;
    capture.console = consoleRes;
  }

  const networkName = pickTool(registry, ['cdt_list_network_requests']);
  if (networkName) {
    const networkRes = await dispatchCatalogToolResult(env, networkName, { ...baseParams, limit: 100 }, ctx);
    toolsUsed.network = networkName;
    capture.network = networkRes;
  }

  const snapshotName = pickTool(registry, ['cdt_take_snapshot']);
  if (snapshotName && !capture.selected_element) {
    const snapRes = await dispatchCatalogToolResult(env, snapshotName, {
      ...baseParams,
      interestingOnly: true,
    }, ctx);
    toolsUsed.snapshot = snapshotName;
    capture.dom_snapshot = snapRes;
  }

  const shotName = pickTool(registry, ['playwright_screenshot', 'browser_screenshot', 'cdt_take_screenshot']);
  if (shotName && isTrustedBrowserReadTool(shotName)) {
    const shotRes = await dispatchCatalogToolResult(env, shotName, baseParams, ctx);
    toolsUsed.screenshot = shotName;
    capture.screenshot = shotRes;
  }

  return {
    ok: true,
    output: {
      capture,
      tools_used: toolsUsed,
      registry_tool_count: registry.length,
    },
  };
}
