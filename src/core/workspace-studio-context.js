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
  const projectSlug = raw.project_slug != null ? String(raw.project_slug).trim() : '';
  const pageId = raw.page_id != null ? String(raw.page_id).trim() : '';
  const studioPanel = raw.studio_panel != null ? String(raw.studio_panel).trim() : '';
  const liveSessionId = raw.live_session_id != null ? String(raw.live_session_id).trim() : '';
  const collabRoom = raw.collab_room != null ? String(raw.collab_room).trim() : '';
  const bootstrapCacheKey =
    raw.bootstrap_cache_key != null ? String(raw.bootstrap_cache_key).trim() : '';
  const dashboardPath = raw.dashboard_path != null ? String(raw.dashboard_path).trim() : '';
  const dashboardRouteKey =
    raw.dashboard_route_key != null ? String(raw.dashboard_route_key).trim() : '';
  const devServerUrl = raw.dev_server_url != null ? String(raw.dev_server_url).trim() : '';
  const activeFile = raw.active_file != null ? String(raw.active_file).trim() : '';
  const previewUrl = raw.preview_url != null ? String(raw.preview_url).trim() : '';
  const publicDomain = raw.public_domain != null ? String(raw.public_domain).trim() : '';
  const cmsHosting = raw.cms_hosting != null ? String(raw.cms_hosting).trim() : '';
  const terminalTail = Array.isArray(raw.terminal_tail)
    ? raw.terminal_tail.map((l) => String(l || '').trim()).filter(Boolean).slice(-12)
    : [];
  const capabilities = Array.isArray(raw.capabilities)
    ? raw.capabilities.map((c) => String(c || '').trim()).filter(Boolean)
    : [];

  if (
    !activeTab &&
    !browserUrl &&
    !openFiles.length &&
    !planId &&
    !workflowRunId &&
    !projectSlug &&
    !pageId &&
    !dashboardPath &&
    !devServerUrl &&
    !activeFile &&
    !previewUrl
  ) {
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
  if (dashboardPath || dashboardRouteKey) {
    lines.push(
      `dashboard_path: ${dashboardPath || '(none)'}`,
      `dashboard_route_key: ${dashboardRouteKey || '(none)'}`,
    );
  }
  if (devServerUrl) lines.push(`dev_server_url: ${devServerUrl}`);
  if (activeFile) lines.push(`active_file: ${activeFile}`);
  if (terminalTail.length) lines.push(`terminal_tail: ${terminalTail.join(' | ')}`);
  if (capabilities.length) lines.push(`capabilities: ${capabilities.join(', ')}`);
  if (projectSlug || pageId || studioPanel || previewUrl || publicDomain || cmsHosting) {
    lines.push(
      `cms_project_slug: ${projectSlug || '(none)'}`,
      `cms_page_id: ${pageId || '(none)'}`,
      `cms_studio_panel: ${studioPanel || '(none)'}`,
      `cms_live_session_id: ${liveSessionId || '(none)'}`,
      `cms_collab_room (IAM_COLLAB): ${collabRoom || '(none)'}`,
      `cms_bootstrap_cache_key (SESSION_CACHE): ${bootstrapCacheKey || '(none)'}`,
      `cms_preview_url: ${previewUrl || '(none)'}`,
      `cms_public_domain: ${publicDomain || '(none)'}`,
      `cms_hosting: ${cmsHosting || '(none)'}`,
    );
  }
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

  const browserRoot =
    browserContext && typeof browserContext === 'object'
      ? /** @type {Record<string, unknown>} */ (browserContext)
      : null;
  const picked =
    raw?.picked_element ??
    raw?.selected_element ??
    browserRoot?.picked_element ??
    browserRoot?.selected_element ??
    null;

  return {
    activeTab: raw.activeTab != null ? String(raw.activeTab).trim() : '',
    browserUrl: raw.browserUrl != null ? String(raw.browserUrl).trim() : '',
    openFiles,
    plan_id: raw.plan_id != null ? String(raw.plan_id).trim() : null,
    workflow_run_id: raw.workflow_run_id != null ? String(raw.workflow_run_id).trim() : null,
    dashboard_path: raw.dashboard_path != null ? String(raw.dashboard_path).trim() : null,
    dashboard_route_key:
      raw.dashboard_route_key != null ? String(raw.dashboard_route_key).trim() : null,
    dev_server_url: raw.dev_server_url != null ? String(raw.dev_server_url).trim() : null,
    active_file: raw.active_file != null ? String(raw.active_file).trim() : null,
    terminal_tail: Array.isArray(raw.terminal_tail)
      ? raw.terminal_tail.map((l) => String(l || '').trim()).filter(Boolean).slice(-12)
      : null,
    browser_surface:
      raw.browser_surface && typeof raw.browser_surface === 'object' ? raw.browser_surface : null,
    picked_element: picked && typeof picked === 'object' ? picked : null,
    project_slug: raw.project_slug != null ? String(raw.project_slug).trim() : null,
    page_id: raw.page_id != null ? String(raw.page_id).trim() : null,
    studio_panel: raw.studio_panel != null ? String(raw.studio_panel).trim() : null,
    live_session_id: raw.live_session_id != null ? String(raw.live_session_id).trim() : null,
    collab_room: raw.collab_room != null ? String(raw.collab_room).trim() : null,
    bootstrap_cache_key:
      raw.bootstrap_cache_key != null ? String(raw.bootstrap_cache_key).trim() : null,
    preview_url: raw.preview_url != null ? String(raw.preview_url).trim() : null,
    public_domain: raw.public_domain != null ? String(raw.public_domain).trim() : null,
    cms_hosting: raw.cms_hosting != null ? String(raw.cms_hosting).trim() : null,
    api_profile: raw.api_profile != null ? String(raw.api_profile).trim() : null,
    capabilities: Array.isArray(raw.capabilities)
      ? raw.capabilities.map((c) => String(c || '').trim()).filter(Boolean)
      : null,
    r2_bucket: raw.r2_bucket != null ? String(raw.r2_bucket).trim() : null,
    r2_key: raw.r2_key != null ? String(raw.r2_key).trim() : null,
    web_search_enabled: raw.web_search_enabled === true,
    antigravity_sandbox_enabled: raw.antigravity_sandbox_enabled === true,
  };
}

/**
 * Append ambient workspace + CMS blocks to the agent system prompt (all chat routes).
 * @param {string} systemPrompt
 * @param {unknown} browserContext
 * @param {unknown} body
 */
export function appendAmbientWorkspaceContextToPrompt(systemPrompt, browserContext, body) {
  let out = String(systemPrompt || '');
  const wsPacket = normalizeWorkspaceContextPacket(browserContext, body);
  const wsBlock = formatWorkspaceContextForAgent(wsPacket);
  if (wsBlock && !out.includes('[IDE workspace context')) {
    out = `${out}\n\n## Workspace\n${wsBlock}`;
  }
  return out;
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
