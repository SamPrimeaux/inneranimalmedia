/**
 * src/core/shells.js
 * Renders the initial HTML shell for all dashboard routes.
 * Injects only the context each page type actually needs.
 * Never injects a workspace UUID unless it's a verified UUID format.
 */

const PAGE_TITLES = {
  agent:    'Agent Sam — Inner Animal Media',
  overview: 'Overview — Inner Animal Media',
  engine:   'Engine — Inner Animal Media',
  finance:  'Finance — Inner Animal Media',
  chats:    'Chats — Inner Animal Media',
  mcp:      'MCP — Inner Animal Media',
  cloud:    'Cloud — Inner Animal Media',
  settings: 'Settings — Inner Animal Media',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * @param {object} opts
 * @param {string} opts.type           - Dashboard type key (agent | overview | ...)
 * @param {string} opts.version        - Shell/asset version string (from wrangler env or git hash)
 * @param {string|null} opts.workspaceId - Only injected if valid UUID; null for overview/public pages
 * @param {string|null} opts.tenantId
 * @param {string|null} opts.userId
 * @param {string} [opts.theme]        - 'dark' | 'light', default 'dark'
 * @param {object} [opts.themeVars]   - CSS custom property map { '--bg-app': '#0d1117', ... }
 * @param {string|null} [opts.nonce]   - CSP nonce if configured
 */
export function renderShell({
  type = 'agent',
  version,
  workspaceId = null,
  tenantId = null,
  userId = null,
  theme = 'dark',
  themeVars = {},
  nonce = null,
} = {}) {
  if (!version) throw new Error('renderShell: version is required');

  // Only pass a workspace ID to the frontend if it's a real UUID.
  // Prevents overview and other pages from firing blind workspace fetches.
  const safeWorkspaceId = workspaceId && UUID_RE.test(workspaceId) ? workspaceId : null;

  const title = PAGE_TITLES[type] ?? 'Inner Animal Media';
  const nonceAttr = nonce ? ` nonce="${nonce}"` : '';

  // Inline bootstrap vars — kept minimal, no secrets, no tokens
  const bootstrap = JSON.stringify({
    workspaceId: safeWorkspaceId,
    tenantId,
    userId,
    dashboardType: type,
    shellVersion: version,
    theme,
  });

  return `<!DOCTYPE html>
<html lang="en" data-theme="${escAttr(theme)}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${escHtml(title)}</title>

  <!-- Bootstrap: single serialized object, no individual globals -->
  <script${nonceAttr}>
    window.__IAM__ = ${bootstrap};
    // Legacy compat shims — remove once frontend refs are migrated to window.__IAM__
    window.__WORKSPACE_ID__  = window.__IAM__.workspaceId;
    window.__SHELL_VERSION__ = window.__IAM__.shellVersion;
    window.__DASHBOARD_TYPE__= window.__IAM__.dashboardType;
    window.__TENANT_ID__     = window.__IAM__.tenantId;
    window.__USER_ID__       = window.__IAM__.userId;
  </script>

  <link rel="stylesheet" href="/static/dashboard/agent/index.css?v=${escAttr(version)}" />
${buildThemeBlock(themeVars)}
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body, #root {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: var(--bg-app, #0d1117);
    }
    body {
      color: var(--text-main, #e5e7eb);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system,
                   BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    /* Skeleton screen — prevents flash of unstyled content */
    #root:empty::before {
      content: '';
      display: block;
      position: fixed;
      inset: 0;
      background: var(--bg-app, #0d1117);
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/static/dashboard/agent/dashboard.js?v=${escAttr(version)}"></script>
</body>
</html>`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function buildThemeBlock(themeVars) {
  if (!themeVars || !Object.keys(themeVars).length) return '';
  const props = Object.entries(themeVars)
    .map(([k, v]) => `    ${k}: ${v};`)
    .join('\n');
  return `  <style>:root {\n${props}\n  }</style>`;
}
