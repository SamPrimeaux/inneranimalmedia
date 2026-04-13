import { jsonResponse } from './responses.js';
import { renderDashboardShell } from './shells.js';

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

// ── CORS Headers ──────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Terminal-Secret, X-Internal-Secret',
};

function corsPreFlight() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// ── Static Page Server ────────────────────────────────────────────────────────

/**
 * Serve a static HTML file from the ASSETS R2 bucket.
 * Key maps to source/public/ in the repo — upload files there,
 * then sync to the ASSETS bucket with the same relative paths.
 *
 * Falls back to 404 HTML if the object is not found.
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
    return new Response('Internal Server Error', { status: 500 });
  }
}

// ── Main Router ───────────────────────────────────────────────────────────────

export async function handleRequest(request, env, ctx) {
  const url    = new URL(request.url);
  let path     = url.pathname;
  const method = request.method.toUpperCase();

  // Robust path normalization
  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1);
  }

  // ── Static Asset Provider (R2-backed dashboard artifacts) ─────────────────
  if (path.startsWith('/static/')) {
    if (!env.DASHBOARD) return new Response('Storage unavailable', { status: 503 });
    const key = path.substring(1).split('?')[0]; // remove leading / and ignore query params
    try {
      const obj = await env.DASHBOARD.get(key);
      if (obj) {
        const contentType = path.endsWith('.js') ? 'application/javascript' :
                          path.endsWith('.css') ? 'text/css' :
                          path.endsWith('.svg') ? 'image/svg+xml' :
                          path.endsWith('.png') ? 'image/png' :
                          path.endsWith('.html') ? 'text/html' :
                          'application/octet-stream';
        return new Response(obj.body, { 
          headers: { 
            'Content-Type': contentType, 
            'Cache-Control': 'public, max-age=3600',
            'Access-Control-Allow-Origin': '*' 
          } 
        });
      }
    } catch (e) {}
  }

  // CORS preflight
  if (method === 'OPTIONS') return corsPreFlight();

  // ── Internal / webhook routes ─────────────────────────────────────────────

  if (path.startsWith('/api/internal/cicd') || path.startsWith('/api/cicd/event')) {
    return handleCicdEvent(request, url, env, ctx);
  }

  if (path.startsWith('/api/internal/git-status')) {
    return handleGitStatusApi(request, url, env, ctx);
  }

  if (path === '/api/deploy/post' || path.startsWith('/api/post-deploy')) {
    return handlePostDeployApi(request, url, env, ctx);
  }

  if (path.startsWith('/api/integrations') || path.startsWith('/api/webhooks')) {
    return handleIntegrationsRequest(request, url, env, ctx);
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  if (
    path.startsWith('/api/auth') ||
    path === '/login' ||
    path === '/logout' ||
    path === '/api/login' ||
    path === '/api/logout' ||
    path.startsWith('/oauth')
  ) {
    return handleAuthApi(request, url, env, ctx);
  }

  // ── Dashboard Shell (1:1 Replica) ──────────────────────────────────────────
  if (path.startsWith('/dashboard/')) {
    const slug = path.split('/')[2] || 'agent';
    
    // Theme resolution
    let themeVars = {};
    let isDark = true;

    if (env.DB) {
      try {
        const tid = env.TENANT_ID || 'tenant_sam_primeaux';
        const themeRow = await env.DB.prepare(
          `SELECT t.* FROM cms_themes t
           INNER JOIN settings s ON s.setting_value = t.slug OR s.setting_value = CAST(t.id AS TEXT)
           WHERE s.setting_key = 'appearance.theme' AND s.tenant_id = ? LIMIT 1`
        ).bind(tid).first();

        if (themeRow) {
          const config = typeof themeRow.config === 'object' ? themeRow.config : JSON.parse(themeRow.config || '{}');
          const rawVars = config.variables || config.data || config || {};
          Object.entries(rawVars).forEach(([k, v]) => {
            const key = k.startsWith('--') ? k : \`--\${k.replace(/_/g, '-')}\`;
            themeVars[key] = v;
          });
          isDark = config.mode === 'dark' || config.is_dark === true;
        }
      } catch (e) {
        console.error('Theme Resolution Failure:', e);
      }
    }

    const html = renderDashboardShell(slug, {
      themeVars,
      isDark,
      workspaceId: env.WORKSPACE_ID || 'ws_inneranimalmedia',
      version: env.CF_VERSION_METADATA?.id || 'v58'
    });

    return new Response(html, {
      headers: { 
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
  }

  // ── MCP ───────────────────────────────────────────────────────────────────

  if (path === '/mcp' || path.startsWith('/api/mcp')) {
    return handleMcpApi(request, url, env, ctx);
  }

  // ── Agent Sam ─────────────────────────────────────────────────────────────

  if (path.startsWith('/api/agentsam')) {
    return handleAgentSamApi(request, url, env, ctx);
  }

  if (path.startsWith('/api/agent')) {
    return handleAgentApi(request, url, env, ctx);
  }

  // ── CI/CD pipeline ────────────────────────────────────────────────────────

  if (path.startsWith('/api/cicd') || path.startsWith('/api/pipeline')) {
    return handleCicdApi(request, url, env, ctx);
  }

  // ── Integrity / health ────────────────────────────────────────────────────

  if (path.startsWith('/api/integrity')) {
    return handleIntegrityApi(request, url, env, ctx);
  }

  if (path === '/health' || path.startsWith('/api/health')) {
    return handleHealthApi(request, url, env, ctx);
  }

  // ── Overview / analytics ──────────────────────────────────────────────────

  if (path.startsWith('/api/overview')) {
    return handleOverviewApi(request, url, env, ctx);
  }

  // ── Deployments ───────────────────────────────────────────────────────────

  if (path.startsWith('/api/deployments') || path.startsWith('/api/deploy')) {
    return handleDeploymentsApi(request, url, env, ctx);
  }

  // ── R2 storage ────────────────────────────────────────────────────────────

  if (path.startsWith('/api/r2') || path.startsWith('/api/storage')) {
    return handleR2Api(request, url, env, ctx);
  }

  // ── RAG / search ──────────────────────────────────────────────────────────

  if (path.startsWith('/api/rag') || path.startsWith('/api/search')) {
    return handleRagApi(request, url, env, ctx);
  }

  // ── Telemetry ─────────────────────────────────────────────────────────────

  if (path.startsWith('/api/telemetry') || path.startsWith('/api/usage')) {
    return handleTelemetryApi(request, url, env, ctx);
  }

  // ── Themes ────────────────────────────────────────────────────────────────

  if (path.startsWith('/api/themes') || path.startsWith('/api/theme')) {
    return handleThemesApi(request, url, env, ctx);
  }

  // ── Settings / preferences ────────────────────────────────────────────────

  if (path.startsWith('/api/settings') || path.startsWith('/api/user')) {
    return handleSettingsApi(request, url, env, ctx);
  }

  // ── Finance ───────────────────────────────────────────────────────────────

  if (path.startsWith('/api/finance') || path.startsWith('/api/billing') || path.startsWith('/api/stripe')) {
    return handleFinanceApi(request, url, env, ctx);
  }

  // ── Vault ─────────────────────────────────────────────────────────────────

  if (path.startsWith('/api/vault') || path.startsWith('/api/secrets')) {
    return handleVaultApi(request, url, env, ctx);
  }

  // ── Workspace ─────────────────────────────────────────────────────────────

  if (path.startsWith('/api/workspace') || path.startsWith('/api/workspaces')) {
    return handleWorkspaceApi(request, url, env, ctx);
  }

  // ── Hub ───────────────────────────────────────────────────────────────────

  if (path.startsWith('/api/hub')) {
    return handleHubApi(request, url, env, ctx);
  }

  // ── Draw / canvas ─────────────────────────────────────────────────────────

  if (path.startsWith('/api/draw') || path.startsWith('/api/canvas')) {
    return handleDrawApi(request, url, env, ctx);
  }

  // ── Admin ─────────────────────────────────────────────────────────────────

  if (path.startsWith('/api/admin')) {
    return handleAdminApi(request, url, env, ctx);
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────

  if (
    path.startsWith('/api/chat')       ||
    path.startsWith('/api/terminal')   ||
    path.startsWith('/api/browser')    ||
    path.startsWith('/api/playwright') ||
    path.startsWith('/api/hyperdrive')
  ) {
    return handleDashboardApi(request, url, env, ctx);
  }

  // ── Gorilla XP ────────────────────────────────────────────────────────────

  if (path.startsWith('/api/gorilla')) {
    return handleAgentSamApi(request, url, env, ctx);
  }

  // ── Catch-all for unmatched /api/* ────────────────────────────────────────

  if (path.startsWith('/api/')) {
    return jsonResponse({ error: 'API route not found', path }, 404);
  }

  // ── Public static pages (served from ASSETS R2 bucket) ───────────────────
  // Files must be uploaded to the ASSETS bucket matching these keys.
  // Repo source: source/public/

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

  // Handle all dashboard routes dynamically (overview, agent, etc.)
  if (path.startsWith('/dashboard/')) {
    const slug = path.split('/')[2] || 'agent';
    
    // ── THEME RESOLUTION (Production-Parity Logic) ──────────────────────────
    let themeRow = null;
    let themeVars = {};
    let isDark = true;
    
    if (env.DB) {
      try {
        const tid = (typeof env.TENANT_ID === 'string') ? env.TENANT_ID : 'tenant_sam_primeaux';
        
        // 1. Try settings table (Tenant-wide active theme)
        themeRow = await env.DB.prepare(
          `SELECT t.* FROM cms_themes t
           INNER JOIN settings s ON s.setting_value = t.slug OR s.setting_value = CAST(t.id AS TEXT)
           WHERE s.setting_key = 'appearance.theme' AND s.tenant_id = ? LIMIT 1`
        ).bind(tid).first();

        // 2. Fallback to system default
        if (!themeRow) {
          themeRow = await env.DB.prepare(
            `SELECT * FROM cms_themes WHERE is_system = 1 ORDER BY sort_order ASC LIMIT 1`
          ).first();
        }

        if (themeRow) {
          const config = typeof themeRow.config === 'string' ? JSON.parse(themeRow.config) : (themeRow.config || {});
          // Deep extract: handle 'variables' or 'data' or root keys
          const rawVars = config.variables || config.data || config || {};
          // Ensure all keys are normalized
          Object.entries(rawVars).forEach(([k, v]) => {
            const key = k.startsWith('--') ? k : `--${k.replace(/_/g, '-')}`;
            themeVars[key] = v;
          });
          isDark = config.mode === 'dark' || config.is_dark === true || String(themeRow.slug || '').includes('dark');
        }
      } catch (e) {
        console.error('Theme Resolution Failure:', e);
      }
    }

    const html = renderDashboardShell(slug, {
      themeVars,
      isDark,
      workspaceId: env.WORKSPACE_ID || 'ws_sandbox',
      version: env.CF_VERSION_METADATA?.id || 'v58'
    });

    return new Response(html, {
      headers: { 
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
  }

  // ── 404 ───────────────────────────────────────────────────────────────────

  return jsonResponse({ error: 'Not found', path }, 404);
}
