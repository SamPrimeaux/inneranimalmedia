/**
 * Compact IDE workspace context for Agent Sam chat (parallel to database-studio-context).
 */

/**
 * @param {Record<string, unknown>|null|undefined} raw
 * @returns {string|null}
 */
export function formatWorkspaceContextForAgent(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const activeTab = raw.activeTab != null ? String(raw.activeTab).trim() : '';
  const browserUrl = raw.browserUrl != null ? String(raw.browserUrl).trim() : '';
  const openFiles = Array.isArray(raw.openFiles)
    ? raw.openFiles.map((f) => String(f || '').trim()).filter(Boolean).slice(0, 32)
    : [];
  const planId = raw.plan_id != null ? String(raw.plan_id).trim() : '';
  const workflowRunId = raw.workflow_run_id != null ? String(raw.workflow_run_id).trim() : '';

  if (!activeTab && !browserUrl && !openFiles.length && !planId && !workflowRunId) {
    return null;
  }

  const lines = [
    '[IDE workspace context — live Agent Sam workbench. Use for active tab, browser URL, open files, and in-flight plan/run ids. Do not invent file paths or URLs.]',
    `active_tab: ${activeTab || '(none)'}`,
    `browser_url: ${browserUrl || '(none)'}`,
    `open_files: ${openFiles.length ? openFiles.join(', ') : '(none)'}`,
    `plan_id: ${planId || '(none)'}`,
    `workflow_run_id: ${workflowRunId || '(none)'}`,
  ];
  return lines.join('\n');
}

/**
 * @param {unknown} browserContext
 * @param {unknown} body
 * @returns {Record<string, unknown>|null}
 */
export function normalizeWorkspaceContextPacket(browserContext, body) {
  const fromBrowser =
    browserContext && typeof browserContext === 'object'
      ? /** @type {Record<string, unknown>} */ (browserContext).workspaceContext
      : null;
  const fromBody =
    body && typeof body === 'object'
      ? /** @type {Record<string, unknown>} */ (body).workspaceContext
      : null;
  const raw =
    fromBrowser && typeof fromBrowser === 'object'
      ? fromBrowser
      : fromBody && typeof fromBody === 'object'
        ? fromBody
        : null;
  if (!raw || typeof raw !== 'object') return null;

  const openFiles = Array.isArray(raw.openFiles)
    ? raw.openFiles.map((f) => String(f || '').trim()).filter(Boolean).slice(0, 32)
    : [];

  return {
    activeTab: raw.activeTab != null ? String(raw.activeTab).trim() : '',
    browserUrl: raw.browserUrl != null ? String(raw.browserUrl).trim() : '',
    openFiles,
    plan_id: raw.plan_id != null ? String(raw.plan_id).trim() : null,
    workflow_run_id: raw.workflow_run_id != null ? String(raw.workflow_run_id).trim() : null,
    web_search_enabled: raw.web_search_enabled === true,
    antigravity_sandbox_enabled: raw.antigravity_sandbox_enabled === true,
  };
}

/**
 * @param {Record<string, unknown>|null|undefined} browserContext
 */
export function extractComposerFlagsFromBrowserContext(browserContext) {
  const root =
    browserContext && typeof browserContext === 'object'
      ? /** @type {Record<string, unknown>} */ (browserContext)
      : null;
  if (!root) {
    return { web_search_enabled: false, antigravity_sandbox_enabled: false };
  }
  const ws =
    root.workspaceContext && typeof root.workspaceContext === 'object'
      ? root.workspaceContext
      : root;
  if (!ws || typeof ws !== 'object') {
    return { web_search_enabled: false, antigravity_sandbox_enabled: false };
  }
  return {
    web_search_enabled: ws.web_search_enabled === true,
    antigravity_sandbox_enabled: ws.antigravity_sandbox_enabled === true,
  };
}
