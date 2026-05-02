/**
 * Agent Sam: Modular Worker Entry Point
 * Orchestrates domain-specific services and handles request routing.
 * Replaces the monolithic worker.js.
 */
import { handleAgentRequest } from './api/agent';
import { handleCmsApi } from './api/cms';

import { handleAgentSamRegistryRequest } from './api/agentsam';
import { handleTimeDispatch } from './tools/time';
import { handleR2Api } from './api/r2-api';
import { handleStorageApi } from './api/storage';
import { handleIntegrationsRequest } from './api/integrations';
import { recordWorkerAnalyticsError, writeTelemetry } from './api/telemetry';
import { getAuthUser, jsonResponse } from './core/auth';
import { handleSettingsRequest } from './api/settings';
import { handleWorkspaceApi } from './api/workspace';
import { handleCicdEvent } from './api/cicd-event';
import { handlePostDeploy } from './api/post-deploy';
import { handleCidiApi } from './api/cicd';
import { handleDeploymentsApi } from './api/deployments';
import { handleFinanceApi } from './api/finance';
import { handleMcpApi } from './api/mcp';
import { handleNotifyDeployComplete } from './api/notify-deploy';
import { handleDrawApi } from './api/draw';
import { handleThemesApi } from './api/themes';
import { handleHubApi } from './api/hub';
import { handleOverviewApi } from './api/overview';
import {
  handleAuthApi,
  handleSupabaseOAuthStart,
  handleSupabaseOAuthCallback,
  handleOAuthConsentPage,
} from './api/auth';
import { handleHealthCheck } from './api/health';
import { handleVaultApi } from './api/vault';
import { runIntegritySnapshot } from './api/integrity';
import { runMasterDailyRetention } from './core/retention.js';
import { handleDashboardApi } from './api/dashboard';
import { handleMailApi } from './api/mail';
import { handleLearnApi } from './api/learn';
import { handleOnboardingApi } from './api/onboarding';
import { handleOAuthApi } from './api/oauth';
import { handleSearchApi } from './api/search';
import { handleIntakeApi } from './api/intake';
import { handleCadApi } from './api/cad';
import { handleDesignStudioApi } from './api/designstudio/index.js';
import { handleStudioSessionApi } from './api/studio-session';
import { handleStatusBundle } from './api/status-bundle';
import { handleCursorAgentApi } from './api/cursor-agent';
import { handleCalendarApi } from './api/calendar.js';
import legacyWorker from '../worker.js';
import {
  runAgentsamMemoryDecay,
  compactAgentsamToolCallLogToStats,
  rollupExecutionPerformanceMetrics,
} from './core/memory.js';
import { handleCatalogApi } from './api/catalog.js';

// --- Durable Objects (ACTIVE: 3 production classes only) ---
export { IAMCollaborationSession } from './do/Collaboration.js';
export { AgentChatSqlV1 } from './do/AgentChat.js';
export { ChessRoom } from './do/Legacy.js';

export default {

  /**
   * Primary Request Handler
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '') || '/';
    const pathLower = path.toLowerCase();

    // 0. Session Self-Healing Middleware
    // Detect multiple 'session' cookies (stale wildcard vs new host-only).
    const cookieHeader = request.headers.get('Cookie') || '';
    const sessionCount = (cookieHeader.match(new RegExp(`(?:^|;\\s*)session=`, 'g')) || []).length;

    // FIX: Responses from fetch() are immutable — headers cannot
    // be appended directly. Must construct a new Response with a mutable Headers copy.
    const withSessionHealing = (res) => {
      if (!res) return res;
      const mutableHeaders = new Headers(res.headers);
      
      // Never clear cookies on a response that is setting a new session —
      // doing so kills the session before the post-login redirect lands.
      const setCookies = mutableHeaders.getAll('set-cookie');
      const isSettingSession = setCookies.some(
        v => v.startsWith('session=') && !v.includes('Expires=Thu, 01 Jan 1970')
      );

      if (!isSettingSession) {
        mutableHeaders.append('Set-Cookie', 'session=; Domain=.inneranimalmedia.com; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax');
        mutableHeaders.append('Set-Cookie', 'session=; Domain=.sandbox.inneranimalmedia.com; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax');
      }

      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: mutableHeaders,
      });
    };

    try {
      // 1. Health Checks
      if (pathLower === '/api/health' || pathLower === '/health') {
        return handleHealthCheck(request, env);
      }

      if (pathLower === '/api/admin/run-retention' && request.method === 'POST') {
        const { verifyInternalApiSecret, jsonResponse } = await import('./core/auth.js');
        if (!verifyInternalApiSecret(request, env)) {
          return jsonResponse({ error: 'Unauthorized' }, 401);
        }
        const out = await runMasterDailyRetention(env);
        return jsonResponse({
          rollups: out.rollups,
          purges: out.purges,
          duration_ms: out.duration_ms,
        });
      }

      // 1. Provider Colors (D1-driven palette registry)
      if (pathLower === '/api/provider-colors' && request.method === 'GET') {
        if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
        try {
          const { results } = await env.DB.prepare(
            `SELECT slug, primary_color, secondary_color, text_on_color, display_name, category
             FROM provider_colors
             ORDER BY category, slug`
          ).all();
          return jsonResponse(results || []);
        } catch (e) {
          return jsonResponse({ error: e?.message ?? String(e) }, 500);
        }
      }

      if (pathLower === '/api/catalog/integrations') {
        return handleCatalogApi(request, url, env, ctx);
      }

      // Canonical sign-in URL is /auth/login (ASSETS pages/auth/login.html). /login is legacy SPA path only.
      if (request.method === 'GET' && pathLower === '/login') {
        const u = new URL(request.url);
        u.pathname = '/auth/login';
        return Response.redirect(u.toString(), 302);
      }

      // Collab workspace room -> IAM_COLLAB DO (path segment after /api/collab/; casing preserved)
      if (/^\/api\/collab\/room\//i.test(path)) {
        const collabMatch = path.match(/^\/api\/collab\/(.+)$/i);
        const room = collabMatch ? decodeURIComponent(collabMatch[1]) : '';
        if (env.IAM_COLLAB && room) {
          const id = env.IAM_COLLAB.idFromName(room);
          const stub = env.IAM_COLLAB.get(id);
          return stub.fetch(request);
        }
        if (env.IAM_COLLAB && !room) {
          return jsonResponse(
            { ok: false, available: false, reason: 'iam_collab_room_invalid' },
            400,
          );
        }
        const upgrade = (request.headers.get('Upgrade') || '').toLowerCase();
        if (upgrade === 'websocket') {
          return new Response(null, { status: 404 });
        }
        return jsonResponse(
          { ok: false, available: false, reason: 'iam_collab_binding_missing' },
          200,
        );
      }

      const ASSET_ROUTES = {
        '/': 'pages/home/index.html',
        '/auth/login': 'pages/auth/login.html',
        '/auth/signup': 'pages/auth/signup.html',
        '/auth/reset': 'pages/auth/reset.html',


        '/work': 'pages/work/index.html',
        '/about': 'pages/about/index.html',
        '/services': 'pages/services/index.html',
        '/contact': 'pages/contact/index.html',
        '/pricing': 'pages/pricing/index.html',
        '/terms': 'pages/terms/index.html',
        '/privacy': 'pages/privacy/index.html',
        '/learn': 'learn.html',
        '/games': 'pages/games/index.html',
        '/start': 'start-project.html',
        // Old-school: serve the raw TSX guide from ASSETS R2
        '/apiguide/providers': 'ApiProviderGuide.tsx',
      };
      const assetHtmlKey = ASSET_ROUTES[pathLower] || ASSET_ROUTES[path];
      if (assetHtmlKey && env.ASSETS) {
        const obj = await env.ASSETS.get(assetHtmlKey);
        if (!obj) return new Response('Not found', { status: 404 });
        const fromMeta = obj.httpMetadata?.contentType;
        const k = assetHtmlKey.toLowerCase();
        // R2 often has no customMetadata, or text/plain on HTML — browsers then show source as plain text.
        const inferred =
          k.endsWith('.html') ? 'text/html; charset=utf-8' :
          k.endsWith('.css') ? 'text/css; charset=utf-8' :
          k.endsWith('.js') ? 'text/javascript; charset=utf-8' :
          'text/plain; charset=utf-8';
        const base = fromMeta || inferred;
        const mainType = (base.split(';')[0] || '').trim().toLowerCase();
        const contentType =
          k.endsWith('.html') && (!fromMeta || mainType === 'text/plain')
            ? 'text/html; charset=utf-8'
            : base;
        if (!k.endsWith('.html')) {
          return new Response(obj.body, {
            headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=300' },
          });
        }
        // Inject shared header/footer via HTMLRewriter
        const [headerObj, footerObj] = await Promise.all([
          env.ASSETS.get('src/components/iam-header.html'),
          env.ASSETS.get('src/components/iam-footer.html'),
        ]);
        const headerHtml = headerObj ? await headerObj.text() : '';
        const footerHtml = footerObj ? await footerObj.text() : '';
        // Auth shells (pages/auth/*.html) ship their own nav + compact footer; injecting
        // iam-header/iam-footer duplicates chrome and breaks fixed globe/canvas layout.
        const skipShellInject =
          typeof assetHtmlKey === 'string' && assetHtmlKey.startsWith('pages/auth/');
        return new HTMLRewriter()
          .on('body', {
            element(el) {
              if (!skipShellInject && headerHtml) el.prepend(headerHtml, { html: true });
              if (!skipShellInject && footerHtml) el.append(footerHtml, { html: true });
            }
          })
          .transform(new Response(obj.body, {
            headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=300' },
          }));
      }

      // 1a. Same-origin R2 assets passthrough (GLB, images, etc.)
      // Example: /assets/chess/v1/pieces/white/king.glb -> ASSETS.get('chess/v1/pieces/white/king.glb')
      if (pathLower.startsWith('/assets/') && env.ASSETS) {
        const key = path.slice('/assets/'.length).replace(/^\/+/, '');
        if (!key || key.includes('..')) return new Response('Bad request', { status: 400 });

        const obj = await env.ASSETS.get(key);
        if (!obj) return new Response('Not found', { status: 404 });

        const inferred =
          key.toLowerCase().endsWith('.glb') ? 'model/gltf-binary' :
          key.toLowerCase().endsWith('.gltf') ? 'model/gltf+json' :
          null;

        return new Response(obj.body, {
          headers: {
            'Content-Type': obj.httpMetadata?.contentType || inferred || 'application/octet-stream',
            'Cache-Control': 'public, max-age=3600',
          },
        });
      }

      // 1c. OAuth & Auth Passthrough (Legacy Monolith)
      // Aliases for older/doc links: same behavior as /api/oauth/{google,github}/start (legacy login flow).
      if (
        (pathLower === '/api/auth/google/start' || pathLower === '/api/auth/github/start') &&
        request.method === 'GET'
      ) {
        const u = new URL(request.url);
        u.pathname =
          pathLower === '/api/auth/google/start'
            ? '/api/oauth/google/start'
            : '/api/oauth/github/start';
        return legacyWorker.fetch(new Request(u.toString(), request), env, ctx);
      }

      if (pathLower.startsWith('/api/oauth/')) {
        const res = await handleOAuthApi(request, env, ctx);
        if (res && res.status !== 404) return res;
        return await legacyWorker.fetch(request, env, ctx);
      }

      // Supabase login OAuth (must be above legacyWorker /auth/ passthrough)
      if (request.method === 'GET' && pathLower === '/api/auth/supabase/start') {
        return handleSupabaseOAuthStart(request, env);
      }
      if (request.method === 'GET' && pathLower === '/api/auth/cloudflare/start') {
        const u = new URL(request.url);
        u.pathname = '/api/oauth/cloudflare/start';
        if (!u.searchParams.get('return_to')) {
          u.searchParams.set('return_to', '/dashboard/settings?section=Integrations');
        }
        return handleOAuthApi(new Request(u.toString(), request), env, ctx);
      }
      if (
        request.method === 'GET' &&
        (pathLower === '/api/auth/supabase/callback' || pathLower === '/auth/callback/supabase')
      ) {
        return handleSupabaseOAuthCallback(request, env);
      }
      if (request.method === 'GET' && pathLower === '/api/auth/oauth/consent') {
        return handleOAuthConsentPage(request, env);
      }

      if (pathLower.startsWith('/auth/')) {
        return await legacyWorker.fetch(request, env, ctx);
      }

      // 1b. System Health Snapshot
      if (pathLower === '/api/system/health' && request.method === 'GET') {
        if (!env.DB) return jsonResponse({ error: 'DB unavailable' }, 503);
        const refresh = new URL(request.url).searchParams.get('refresh') === 'true';
        try {
          let snapshot = refresh
            ? await runIntegritySnapshot(env, 'manual')
            : await env.DB.prepare('SELECT * FROM system_health_snapshots ORDER BY snapshot_at DESC LIMIT 1').first();
          const now = Math.floor(Date.now() / 1000);
          const snapTs = snapshot ? Number(snapshot.snapshot_at) || 0 : 0;
          const is_fresh = snapTs > 0 && now - snapTs < 300;
          const triggered_by = snapshot?.triggered_by != null ? String(snapshot.triggered_by) : refresh ? 'manual' : 'none';
          return jsonResponse({ snapshot, is_fresh, triggered_by });
        } catch (e) {
          return jsonResponse({ error: e?.message ?? String(e) }, 500);
        }
      }

      // 2. Global Request Context
      const authUser = await getAuthUser(request, env);

      // 2b. Dashboard shell: require session before HTML/SPA
      if (!pathLower.startsWith('/api/')) {
        const needsDashAuth =
          pathLower === '/dashboard' ||
          pathLower.startsWith('/dashboard/');
        if (needsDashAuth && !authUser) {
          const next = encodeURIComponent(`${path}${url.search || ''}`);
          return Response.redirect(`${url.origin}/auth/login?next=${next}`, 302);
        }
      }

      // 3. Domain Dispatching (Surgical Delegation)
      if (pathLower.startsWith('/api/agentsam/time')) {
        return handleTimeDispatch(request, env, ctx, authUser);
      }

      if (pathLower.startsWith('/api/agentsam')) {
        const res = await handleAgentSamRegistryRequest(request, env, ctx, authUser);
        if (res && res.status !== 404) return res;
      }

      if (pathLower.startsWith('/api/cms')) {
        return handleCmsApi(request, url, env, ctx);
      }
      
      if (pathLower.startsWith('/api/search')) {
        return handleSearchApi(request, url, env, ctx);
      }

      if (pathLower.startsWith('/api/calendar')) {
        return handleCalendarApi(request, url, env, ctx);
      }

      if (pathLower.startsWith('/api/storage')) {
        return handleStorageApi(request, url, env);
      }

      if (pathLower.startsWith('/api/r2/')) {
        return handleR2Api(request, url, env);
      }

      if (pathLower.startsWith('/api/integrations') ||
          pathLower === '/api/webhooks/resend' ||
          pathLower === '/api/email/inbound') {
        const res = await handleIntegrationsRequest(request, env, ctx, authUser);
        if (res && res.status !== 404) return res;
      }

      if (pathLower.startsWith('/api/vault')) {
        return handleVaultApi(request, new URL(request.url), env, ctx);
      }

      // Agent Sam Studio (before generic /api/agent/* dashboard)
      if (pathLower === '/api/dashboard/status-bundle' && request.method === 'GET') {
        return handleStatusBundle(request, url, env, ctx);
      }
      if (pathLower.startsWith('/api/agent/intake')) {
        return handleIntakeApi(request, url, env, ctx);
      }
      if (pathLower.startsWith('/api/cad/') || pathLower === '/api/cad') {
        return handleCadApi(request, url, env, ctx);
      }
      if (pathLower.startsWith('/api/studio/') || pathLower === '/api/studio') {
        return handleStudioSessionApi(request, url, env, ctx);
      }
      if (pathLower.startsWith('/api/artifacts')) {
        return handleStudioSessionApi(request, url, env, ctx);
      }
      if (pathLower.startsWith('/api/cursor/')) {
        return handleCursorAgentApi(request, url, env, ctx);
      }

      if (pathLower.startsWith('/api/agent') || pathLower.startsWith('/api/terminal') || pathLower.startsWith('/api/chat') || pathLower.startsWith('/api/playwright')) {
        const dashRes = await handleDashboardApi(request, url, env, ctx);
        if (dashRes.status !== 404) return dashRes;
      }

      if (pathLower.startsWith('/api/agent')) {
        const agentRes = await handleAgentRequest(request, env, ctx, authUser);
        if (agentRes.status !== 404) return agentRes;
      }

      if (
        pathLower.startsWith('/api/settings') ||
        pathLower.startsWith('/api/tenant') ||
        pathLower.startsWith('/api/ai')
      ) {
        return handleSettingsRequest(request, env, ctx);
      }

      if (pathLower.startsWith('/api/workspaces') || pathLower.startsWith('/api/workspace')) {
        return handleWorkspaceApi(request, url, env, ctx, authUser);
      }

      if (pathLower.startsWith('/api/cicd')) {
        return handleCidiApi(request, url, env, ctx);
      }

      if (pathLower === '/api/internal/cicd-event') {
        return handleCicdEvent(request, env, ctx);
      }

      if (pathLower === '/api/internal/post-deploy' && request.method === 'POST') {
        return handlePostDeploy(request, env, ctx);
      }

      if (pathLower.startsWith('/api/internal/designstudio/') || pathLower.startsWith('/api/designstudio/')) {
        return handleDesignStudioApi(request, url, env, ctx);
      }

      if (pathLower.startsWith('/api/deployments') || pathLower.startsWith('/api/internal/')) {
        return handleDeploymentsApi(request, url, env, ctx);
      }

      if (pathLower.startsWith('/api/finance') || pathLower.startsWith('/api/clients') ||
          pathLower.startsWith('/api/projects') || pathLower.startsWith('/api/billing')) {
        return handleFinanceApi(request, url, env, ctx);
      }

      if (pathLower === '/api/notify/deploy-complete' && request.method === 'POST') {
        return handleNotifyDeployComplete(request, env, ctx);
      }

      if (pathLower.startsWith('/api/mcp')) {
        return handleMcpApi(request, url, env, ctx);
      }

      if (pathLower.startsWith('/api/draw')) {
        return handleDrawApi(request, url, env, ctx);
      }

      if (pathLower.startsWith('/api/themes')) {
        return handleThemesApi(request, url, env, ctx);
      }

      if (pathLower.startsWith('/api/hub')) {
        return handleHubApi(request, url, env, ctx);
      }

      if (pathLower.startsWith('/api/overview')) {
        return handleOverviewApi(request, url, env, ctx);
      }

      if (pathLower.startsWith('/api/mail')) {
        return handleMailApi(request, url, env, ctx);
      }

      if (pathLower.startsWith('/api/learn')) {
        return handleLearnApi(request, url, env, ctx);
      }

      if (pathLower.startsWith('/api/onboarding')) {
        return handleOnboardingApi(request, url, env);
      }

      if (pathLower.startsWith('/api/games')) {
        const { handleGamesApi } = await import('./api/games.js');
        return handleGamesApi(request, url, env, ctx, authUser);
      }

      if (pathLower.startsWith('/api/auth') || pathLower === '/api/settings/profile') {
        return handleAuthApi(request, url, env);
      }

      // 4. Static Assets & SPA Fallback (Dashboard UI)
      if (!pathLower.startsWith('/api/')) {
        // A. Root Route (Landing Page Priority)
        if (pathLower === '/') {
          if (env.ASSETS) {
            const obj = await env.ASSETS.get('index-v3.html') || await env.ASSETS.get('index.html');
            if (obj) return new Response(obj.body, { headers: { 'Content-Type': 'text/html' } });
          }
        }

        // B. Sandbox (Workers Assets) - DEPRECATED (Moved to R2 Fallback)
        // C. Production (R2 Fallback)
        if (env.ASSETS || env.DASHBOARD) {
          if (pathLower === '/dashboard' || pathLower === '/dashboard/') {
            return withSessionHealing(Response.redirect(`${url.origin}/dashboard/overview`, 302));
          }

          const assetKey = path.slice(1) || 'index.html';

          if (env.ASSETS) {
            const obj = await env.ASSETS.get(assetKey);
            if (obj) return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream' } });
          }

          if (env.DASHBOARD) {
            const appKey =
              assetKey.startsWith('static/dashboard/agent/')
                ? `dashboard/app/${assetKey.slice('static/dashboard/agent/'.length)}`
                : null;
            const obj =
              (await env.DASHBOARD.get(assetKey)) ||
              (appKey ? await env.DASHBOARD.get(appKey) : null) ||
              (await env.DASHBOARD.get(`static/${assetKey}`)) ||
              (await env.DASHBOARD.get(`static/dashboard/agent/${assetKey}`));
            if (obj) return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream' } });

            if (pathLower.startsWith('/dashboard/') || pathLower === '/onboarding' || pathLower.startsWith('/onboarding/')) {
              const index =
                (await env.DASHBOARD.get('dashboard/app/agent.html')) ||
                (await env.DASHBOARD.get('static/dashboard/agent.html')) ||
                (await env.DASHBOARD.get('index.html'));
              if (index) return withSessionHealing(new Response(index.body, { headers: { 'Content-Type': 'text/html' } }));
            }
          }
        }
      }

      // 5. Fallback: API Route Not Found (Delegate to Legacy Monolith)
      if (pathLower.startsWith('/api/')) {
        const legacyRes = await legacyWorker.fetch(request, env, ctx);
        if (legacyRes.status === 404) {
          return jsonResponse({
            error: 'Route not found in modular router or legacy worker',
            path: pathLower,
            instruction: 'Please verify the api/ route is defined in src/api/'
          }, 404);
        }
        return legacyRes;
      }

      if (!pathLower.startsWith('/api/')) {
        const { globeErrorPage } = await import('./core/error-pages');
        return new Response(
          globeErrorPage({ status: 404, title: 'Page not found', url: url.pathname }),
          { status: 404, headers: { 'Content-Type': 'text/html;charset=UTF-8' } },
        );
      }

      return new Response('Not Found', { status: 404 });

    } catch (e) {
      console.error('[Worker Error]', e.message);

      ctx.waitUntil(recordWorkerAnalyticsError(env, {
        path: pathLower,
        method: request.method,
        status_code: 500,
        error_message: e.message
      }));

      return jsonResponse({ error: 'Internal Server Error', detail: e.message }, 500);
    }
  },

  /**
   * Scheduled Cron Handler
   */
  async scheduled(event, env, ctx) {
    console.log('[Cron] Execution starting:', event.cron);
    ctx.waitUntil(
      runIntegritySnapshot(env, 'cron').catch((e) => console.warn('[cron] runIntegritySnapshot', e?.message ?? e))
    );
    if (event.cron === '0 0 * * *') {
      ctx.waitUntil(
        Promise.allSettled([runMasterDailyRetention(env)]).then((results) => {
          console.log('[retention] rollup complete', { results });
        })
      );
    }
    if (event.cron === '0 1 * * *') {
      if (env?.DB) {
        ctx.waitUntil(
          runAgentsamMemoryDecay(env).catch((e) =>
            console.warn('[cron] agentsam_memory decay', e?.message ?? e),
          ),
        );
        ctx.waitUntil(
          compactAgentsamToolCallLogToStats(env).catch((e) =>
            console.warn('[cron] tool_stats_compacted', e?.message ?? e),
          ),
        );
        ctx.waitUntil(
          rollupExecutionPerformanceMetrics(env).catch((e) =>
            console.warn('[cron] execution_performance_metrics', e?.message ?? e),
          ),
        );
      }
    }
  },

  /**
   * Queue Handler
   */
  async queue(batch, env, ctx) {
    console.log(`[Queue] Received batch of ${batch.messages.length} messages`);
    return legacyWorker.queue(batch, env, ctx);
  }
};
