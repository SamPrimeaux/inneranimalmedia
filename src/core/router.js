/**
 * src/core/router.js
 * Main request dispatcher and path normalizer.
 *
 * Resolution hierarchy (no hardcoded values anywhere):
 *   tenant_id   → auth session → env.TENANT_ID   → D1 domain lookup → 503
 *   workspace_id→ auth session → env.WORKSPACE_ID → null (overview renders without it)
 *   version     → env.CF_VERSION_METADATA.id → env.SHELL_VERSION → Date.now()
 */

import { jsonResponse }              from './responses.js';
import { renderShell }               from './shells.js';
import { getAuthUser }               from '../core/auth.js';

// ── API Handlers ──────────────────────────────────────────────────────────────
import { handleAuthApi }             from '../api/auth.js';
import { handlePostDeployApi }       from '../api/post-deploy.js';
import { handleCicdEvent }           from '../api/cicd-event.js';
import { handleCicdApi }             from '../api/cicd.js';
import { handleIntegrationsRequest } from '../api/integrations.js';
import { handleIntegrityApi }        from '../api/integrity.js';
import { handleMcpApi }              from '../api/mcp.js';
import { handleAgentApi }            from '../api/agent.js';
import { handleAgentSamApi }         from '../api/agentsam.js';
import { handleOverviewApi }         from '../api/overview.js';
import { handleDeploymentsApi }      from '../api/deployments.js';
import { handleDashboardApi }        from '../api/dashboard.js';
import { handleR2Api }               from '../api/r2-api.js';
import { handleRagApi }              from '../api/rag.js';
import { handleTelemetryApi }        from '../api/telemetry.js';
import { handleThemesApi }           from '../api/themes.js';
import { handleSettingsApi }         from '../api/settings.js';
import { handleFinanceApi }          from '../api/finance.js';
import { handleVaultApi }            from '../api/vault.js';
import { handleWorkspaceApi }        from '../api/workspace.js';
import { handleHubApi }              from '../api/hub.js';
import { handleHealthApi }           from '../api/health.js';
import { handleDrawApi }             from '../api/draw.js';
import { handleGitStatusApi }        from '../api/git-status.js';
import { handleAdminApi }            from '../api/admin.js';
import { handleGithubApi }           from '../api/github.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Terminal-Secret, X-Internal-Secret',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Pages that render without an active workspace (no workspace UUID needed in shell)
const WORKSPACE_OPTIONAL_PAGES = new Set(['overview', 'finance', 'billing', 'settings', 'health']);

// ── Helpers ───────────────────────────────────────────────────────────────────

function corsPreFlight() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * Resolve the current request's tenant ID.
 * Order: auth session → env.TENANT_ID → D1 domain lookup → null
 * Never falls back to a hardcoded string.
 */
async function resolveTenantId(request, env, authUser) {
  // 1. Authenticated session carries tenant_id
  if (authUser?.tenant_id) return authUser.tenant_id;

  // 2. Wrangler env var (set in wrangler.production.toml / secrets)
  if (env.TENANT_ID && typeof env.TENANT_ID === 'string') return env.TENANT_ID;

  // 3. D1 lookup by request hostname
  if (env.DB) {
    try {
      const host = new URL(request.url).hostname;
      const row  = await env.DB.prepare(
        `SELECT id FROM cms_tenants WHERE domain = ? OR custom_domain = ? LIMIT 1`
      ).bind(host, host).first();
      if (row?.id) return row.id;
    } catch (_) { /* non-fatal */ }
  }

  return null; // Caller decides whether null is acceptable
}

/**
 * Resolve workspace ID for shell injection.
 * Only passes a UUID — never an alias string like 'ws_inneranimalmedia'.
 * For overview/settings pages, returns null intentionally.
 */
function resolveWorkspaceId(authUser, env) {
  // Auth session is the authoritative source
  const fromSession = authUser?.workspace_id ?? null;
  if (fromSession && UUID_RE.test(fromSession)) return fromSession;

  // Env var fallback (wrangler secret/var, should be a real UUID)
  const fromEnv = env.WORKSPACE_ID ?? null;
  if (fromEnv && UUID_RE.test(fromEnv)) return fromEnv;

  // Non-UUID workspace aliases ('ws_inneranimalmedia', etc.) are NOT injected into the shell.
  // The frontend resolves workspace context via /api/settings/workspaces after load.
  return null;
}

/**
 * Resolve build version for asset cache-busting.
 */
function resolveVersion(env) {
  return env.CF_VERSION_METADATA?.id
      ?? env.SHELL_VERSION
      ?? String(Date.now());
}

/**
 * Resolve active theme vars from D1 for a given tenant.
 * Returns { themeVars, isDark } — safe empty defaults on any failure.
 */
async function resolveTheme(env, tenantId) {
  const empty = { themeVars: {}, isDark: true };
  if (!env.DB || !tenantId) return empty;

  try {
    // First: tenant's selected theme via settings table
    let themeRow = await env.DB.prepare(
      `SELECT t.* FROM cms_themes t
       INNER JOIN settings s
         ON s.setting_value = t.slug
         OR s.setting_value = CAST(t.id AS TEXT)
       WHERE s.setting_key = 'appearance.theme'
         AND s.tenant_id = ?
       LIMIT 1`
    ).bind(tenantId).first();

    // Fallback: system default theme
    if (!themeRow) {
      themeRow = await env.DB.prepare(
        `SELECT * FROM cms_themes
         WHERE is_system = 1
         ORDER BY sort_order ASC
         LIMIT 1`
      ).first();
    }

    if (!themeRow) return empty;

    const config  = typeof themeRow.config === 'string'
      ? JSON.parse(themeRow.config)
      : (themeRow.config ?? {});

    const rawVars = config.variables ?? config.data ?? config ?? {};
    const themeVars = {};
    for (const [k, v] of Object.entries(rawVars)) {
      const key = k.startsWith('--') ? k : `--${k.replace(/_/g, '-')}`;
      themeVars[key] = v;
    }

    const isDark = config.mode === 'dark'
      || config.is_dark === true
      || String(themeRow.slug ?? '').includes('dark');

    return { themeVars, isDark };
  } catch (e) {
    console.error('[router] theme resolution failed:', e?.message);
    return empty;
  }
}

/**
 * Serve a static HTML page from the ASSETS R2 bucket.
 */
async function serveStaticPage(env, r2Key) {
  if (!env.ASSETS) {
    return new Response('Service unavailable', { status: 503 });
  }
  try {
    const obj = await env.ASSETS.get(r2Key);
    if (!obj) {
      return new Response('<!DOCTYPE html><html><body><h1>404 Not Found</h1></body></html>', {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
    return new Response(obj.body, {
      headers: {
        'Content-Type':  'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (e) {
    console.error('[router] serveStaticPage error:', e?.message);
    return new Response('Internal Server Error', { status: 500 });
  }
}

// ── Main Router ───────────────────────────────────────────────────────────────

export async function handleRequest(request, env, ctx) {
  const url    = new URL(request.url);
  let path     = url.pathname;
  const method = request.method.toUpperCase();

  // Normalize trailing slash (except root)
  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1);
  }

  // ── Static Assets (R2-backed, fallback to Workers Assets) ───────────────────
  if (path.startsWith('/static/')) {
    let response = null;
    
    // Attempt R2 fetch (Legacy/External Assets)
    if (env.DASHBOARD) {
      const key = path.substring(1).split('?')[0];
      try {
        const obj = await env.DASHBOARD.get(key);
        if (obj) {
          const ct = path.endsWith('.js')   ? 'application/javascript'
                   : path.endsWith('.css')  ? 'text/css'
                   : path.endsWith('.svg')  ? 'image/svg+xml'
                   : path.endsWith('.png')  ? 'image/png'
                   : path.endsWith('.html') ? 'text/html'
                   : 'application/octet-stream';
          response = new Response(obj.body, {
            headers: {
              'Content-Type':                ct,
              'Cache-Control':               'public, max-age=3600',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }
      } catch (e) {
        console.error('[router] R2 asset error:', e?.message);
      }
    }

    // Fallback to native Workers Assets (Vite build artifacts)
    if (!response && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return response || new Response('Not Found', { status: 404 });
  }

  // ── Unified Search (Recent Activity) ───────────────────────────────────────
  if (path === '/api/unified-search/recent') {
    return jsonResponse({
      items: [
        { id: '1', type: 'file', label: 'App.tsx', sublabel: 'dashboard/app', timestamp: new Date().toISOString() },
        { id: '2', type: 'route', label: 'Agent Dashboard', sublabel: '/dashboard/agent', timestamp: new Date().toISOString() }
      ]
    });
  }

  // ── CORS Preflight ─────────────────────────────────────────────────────────
  if (method === 'OPTIONS') return corsPreFlight();

  // ── Collab WebSocket (must be before auth — WebSocket upgrade can't send JSON) ─
  if (path.startsWith('/api/collab/room/')) {
    if (!env.IAM_COLLAB) return jsonResponse({ error: 'IAM_COLLAB not configured' }, 503);
    const roomId = path.replace('/api/collab/room/', '').split('/')[0] || 'default';
    const doId   = env.IAM_COLLAB.idFromName(roomId);
    return env.IAM_COLLAB.get(doId).fetch(request);
  }

  // ── Internal / Webhook Routes (no auth required) ───────────────────────────

  if (path.startsWith('/api/internal/cicd') || path.startsWith('/api/cicd/event')) {
    return handleCicdEvent(request, url, env, ctx);
  }

  if (path.startsWith('/api/internal/git-status')) {
    return handleGitStatusApi(request, url, env, ctx);
  }

  if (path === '/api/deploy/post' || path.startsWith('/api/post-deploy')) {
    return handlePostDeployApi(request, url, env, ctx);
  }

  // ── GitHub (before /api/integrations catch-all) ────────────────────────────
  if (path.startsWith('/api/integrations/github') || path.startsWith('/api/github/')) {
    return handleGithubApi(request, url, env, ctx);
  }

  // ── Google Drive (stubbed — suppress console error, return clean 501) ───────
  if (path.startsWith('/api/integrations/gdrive') || path.startsWith('/api/drive/')) {
    return jsonResponse(
      { error: 'Google Drive integration not yet configured', code: 'gdrive_not_implemented' },
      501
    );
  }

  // ── Integrations / Webhooks ────────────────────────────────────────────────
  if (path.startsWith('/api/integrations') || path.startsWith('/api/webhooks')) {
    return handleIntegrationsRequest(request, url, env, ctx);
  }

  // ── Auth ───────────────────────────────────────────────────────────────────
  if (
    path.startsWith('/api/auth') ||
    path === '/login'            ||
    path === '/logout'           ||
    path === '/api/login'        ||
    path === '/api/logout'       ||
    path.startsWith('/oauth')
  ) {
    return handleAuthApi(request, url, env, ctx);
  }

  // ── Dashboard Shell ────────────────────────────────────────────────────────
  // Renders the SPA shell for all /dashboard/* routes.
  // Tenant and workspace are resolved dynamically — zero hardcoded values.
  if (path.startsWith('/dashboard/')) {
    const slug = path.split('/')[2] || 'agent';

    // Attempt auth resolution — shell renders even for unauthenticated users
    // (the frontend handles redirect to /login). Non-blocking failure is intentional.
    let authUser = null;
    try {
      authUser = await getAuthUser(request, env);
    } catch (_) { /* non-fatal — render shell, let frontend redirect */ }

    const tenantId    = await resolveTenantId(request, env, authUser);
    const version     = resolveVersion(env);

    // Workspace is only injected for pages that actually use it
    const needsWorkspace = !WORKSPACE_OPTIONAL_PAGES.has(slug);
    const workspaceId    = needsWorkspace ? resolveWorkspaceId(authUser, env) : null;

    // Theme resolution requires a tenant — degrade to system default if none
    const { themeVars, isDark } = await resolveTheme(env, tenantId);

    const html = renderShell({
      type:        slug,
      version,
      workspaceId,
      tenantId,
      userId:      authUser?.id ?? null,
      theme:       isDark ? 'dark' : 'light',
      themeVars,   // passed through to shells.js for CSS var injection if needed
    });

    return new Response(html, {
      headers: {
        'Content-Type':  'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-IAM-Tenant':  tenantId ?? 'unresolved',
        'X-IAM-Page':    slug,
      },
    });
  }

  // ── MCP ────────────────────────────────────────────────────────────────────
  if (path === '/mcp' || path.startsWith('/api/mcp')) {
    return handleMcpApi(request, url, env, ctx);
  }

  // ── Agent Sam ──────────────────────────────────────────────────────────────
  if (path.startsWith('/api/agentsam')) {
    return handleAgentSamApi(request, url, env, ctx);
  }

  if (path.startsWith('/api/agent')) {
    return handleAgentApi(request, url, env, ctx);
  }

  // ── CI/CD ──────────────────────────────────────────────────────────────────
  if (path.startsWith('/api/cicd') || path.startsWith('/api/pipeline')) {
    return handleCicdApi(request, url, env, ctx);
  }

  // ── Integrity ──────────────────────────────────────────────────────────────
  if (path.startsWith('/api/integrity')) {
    return handleIntegrityApi(request, url, env, ctx);
  }

  // ── Health ─────────────────────────────────────────────────────────────────
  if (path === '/health' || path.startsWith('/api/health')) {
    return handleHealthApi(request, url, env, ctx);
  }

  // ── Tunnel Status ──────────────────────────────────────────────────────────
  if (path === '/api/tunnel/status' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ healthy: false, status: 'no-db', connections: 0 });
    try {
      const row = await env.DB.prepare(
        `SELECT tunnel_url, status, connections
         FROM tunnel_sessions
         WHERE user_id = ? AND status = 'active'
         ORDER BY updated_at DESC LIMIT 1`
      ).bind(String(authUser.id)).first().catch(() => null);

      if (!row) return jsonResponse({ healthy: false, status: 'no-tunnel', connections: 0 });
      return jsonResponse({
        healthy:     true,
        status:      row.status,
        connections: row.connections ?? 0,
        tunnel_url:  row.tunnel_url,
      });
    } catch (e) {
      return jsonResponse({ healthy: false, status: 'error', error: e.message, connections: 0 });
    }
  }

  // ── Branding / Logo ────────────────────────────────────────────────────────
  if (path.startsWith('/api/branding/')) {
    const asset    = path.replace('/api/branding/', '');
    const authUser = await getAuthUser(request, env).catch(() => null);
    const tenantId = await resolveTenantId(request, env, authUser);

    if (asset === 'logo' && env.DB && tenantId) {
      try {
        const row = await env.DB.prepare(
          `SELECT logo_url FROM cms_tenants WHERE id = ? LIMIT 1`
        ).bind(tenantId).first().catch(() => null);
        if (row?.logo_url) return Response.redirect(row.logo_url, 302);
      } catch (_) {}
    }

    if (env.ASSETS) {
      const obj = await env.ASSETS.get(`branding/${asset}`).catch(() => null);
      if (obj) {
        const ext = asset.split('.').pop() ?? '';
        const ct  = ext === 'svg'  ? 'image/svg+xml'
                  : ext === 'png'  ? 'image/png'
                  : ext === 'webp' ? 'image/webp'
                  : 'application/octet-stream';
        return new Response(obj.body, {
          headers: { 'Content-Type': ct, 'Cache-Control': 'public, max-age=3600' },
        });
      }
    }

    // Silent 204 — frontend img.onError hides the element
    return new Response('', { status: 204 });
  }

  // ── Overview ───────────────────────────────────────────────────────────────
  if (path.startsWith('/api/overview')) {
    return handleOverviewApi(request, url, env, ctx);
  }

  // ── Deployments ────────────────────────────────────────────────────────────
  if (path.startsWith('/api/deployments') || path.startsWith('/api/deploy')) {
    return handleDeploymentsApi(request, url, env, ctx);
  }

  // ── R2 Storage ─────────────────────────────────────────────────────────────
  if (path.startsWith('/api/r2') || path.startsWith('/api/storage')) {
    return handleR2Api(request, url, env, ctx);
  }

  // ── RAG / Search ───────────────────────────────────────────────────────────
  if (path.startsWith('/api/rag') || path.startsWith('/api/search')) {
    return handleRagApi(request, url, env, ctx);
  }

  // ── Telemetry ──────────────────────────────────────────────────────────────
  if (path.startsWith('/api/telemetry') || path.startsWith('/api/usage')) {
    return handleTelemetryApi(request, url, env, ctx);
  }

  // ── Themes ─────────────────────────────────────────────────────────────────
  if (path.startsWith('/api/themes') || path.startsWith('/api/theme')) {
    return handleThemesApi(request, url, env, ctx);
  }

  // ── Settings ───────────────────────────────────────────────────────────────
  if (path.startsWith('/api/settings') || path.startsWith('/api/user')) {
    return handleSettingsApi(request, url, env, ctx);
  }

  // ── Finance / Billing ──────────────────────────────────────────────────────
  if (
    path.startsWith('/api/finance') ||
    path.startsWith('/api/billing') ||
    path.startsWith('/api/stripe')
  ) {
    return handleFinanceApi(request, url, env, ctx);
  }

  // ── Vault / Secrets ────────────────────────────────────────────────────────
  if (path.startsWith('/api/vault') || path.startsWith('/api/secrets')) {
    return handleVaultApi(request, url, env, ctx);
  }

  // ── Workspace ──────────────────────────────────────────────────────────────
  if (path.startsWith('/api/workspace') || path.startsWith('/api/workspaces')) {
    return handleWorkspaceApi(request, url, env, ctx);
  }

  // ── Hub ────────────────────────────────────────────────────────────────────
  if (path.startsWith('/api/hub')) {
    return handleHubApi(request, url, env, ctx);
  }

  // ── Draw / Canvas ──────────────────────────────────────────────────────────
  if (path.startsWith('/api/draw') || path.startsWith('/api/canvas')) {
    return handleDrawApi(request, url, env, ctx);
  }

  // ── Admin ──────────────────────────────────────────────────────────────────
  if (path.startsWith('/api/admin')) {
    return handleAdminApi(request, url, env, ctx);
  }

  // ── Dashboard (terminal, chat, browser, playwright, hyperdrive) ────────────
  if (
    path.startsWith('/api/chat')       ||
    path.startsWith('/api/terminal')   ||
    path.startsWith('/api/browser')    ||
    path.startsWith('/api/playwright') ||
    path.startsWith('/api/hyperdrive')
  ) {
    return handleDashboardApi(request, url, env, ctx);
  }

  // ── Gorilla XP ─────────────────────────────────────────────────────────────
  if (path.startsWith('/api/gorilla')) {
    return handleAgentSamApi(request, url, env, ctx);
  }

  // ── Unmatched /api/* ───────────────────────────────────────────────────────
  if (path.startsWith('/api/')) {
    return jsonResponse({ error: 'API route not found', path }, 404);
  }

  // ── Public Static Pages (ASSETS R2 bucket) ─────────────────────────────────
  if (path === '/' || path === '/index.html') {
    return serveStaticPage(env, 'source/public/index.html');
  }
  if (path === '/auth-signin' || path === '/auth-signin.html' || path === '/auth/signin') {
    return serveStaticPage(env, 'source/public/auth-signin.html');
  }
  if (path === '/auth-signup' || path === '/auth-signup.html' || path === '/auth/signup') {
    return serveStaticPage(env, 'source/public/auth-signup.html');
  }
  if (path === '/auth-reset' || path === '/auth-reset.html' || path === '/auth/reset') {
    return serveStaticPage(env, 'source/public/auth-reset.html');
  }

  // ── Final Fallback to Static Assets (Vite build folder) ────────────────────
  // Extension-guarded to prevent infinite routing loops or worker exceptions.
  const STATIC_EXTS = new Set(['.css', '.js', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.ico', '.woff2']);
  const ext = path.substring(path.lastIndexOf('.')).toLowerCase();

  if (env.ASSETS && STATIC_EXTS.has(ext)) {
    try {
      return await env.ASSETS.fetch(request);
    } catch (e) {
      console.error('[router] static asset fallback failed:', e.message);
    }
  }

  return jsonResponse({ error: 'Not found', path }, 404);
}
