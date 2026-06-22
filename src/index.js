/**
 * Agent Sam: Modular Worker Entry Point
 * Orchestrates domain-specific services and handles request routing.
 * Replaces the monolithic worker.js.
 */
import { dispatchProductionDomainRoutes } from './core/router.js';
import { recordWorkerAnalyticsError, writeTelemetry } from './api/telemetry';
import {
  primeRequestAuth,
  peekRequestAuth,
  authContextToLegacyUser,
  jsonResponse,
  getSession,
  isIngestSecretAuthorized,
  fetchAuthUserTenantId,
  resolveRequestContext,
  AuthError,
} from './core/auth';
import {
  isPublicOAuthPath,
  publicOAuthRequestContext,
  isAutomationApiPath,
} from './core/public-oauth-paths.js';
import { loadPublishedCmsSectionsByRoute } from './core/cms-public-page.js';
import { hydrateContactPageHtml } from './core/cms-contact-hydrate.js';
import { hydrateGamesPageHtml } from './core/cms-games-hydrate.js';
import { resolveIdentity } from './core/identity.js';
import { generateMcpToken } from './core/mcp-auth.js';
import {
  handleSupabaseOAuthStart,
  handleSupabaseOAuthCallback,
  handleOAuthConsentPage,
} from './api/auth';
import { handleHealthCheck } from './api/health';
import { handleLaunchDeskChat } from './api/launch-desk.js';
import { runIntegritySnapshot } from './api/integrity';
import { runMasterDailyRetention } from './core/retention.js';
import { runSecurityScan, logSecretAudit } from './core/security-scan.js';
import { handleOAuthApi } from './api/oauth';
import {
  handleTunnelStatusGet,
  handleTunnelRestartPost,
  TUNNEL_STATUS_PATH,
  TUNNEL_RESTART_PATH,
} from './core/tunnel-status.js';
import { handleScheduled } from './cron/scheduled.js';
import { dispatchQueueMessage } from './queue/dispatcher.js';
import { handleCatalogApi } from './api/catalog.js';
import {
  handleGoogleLoginOAuthCallback,
  handleGitHubLoginOAuthCallback,
} from './api/oauth-login-callbacks.js';
import { handleGithubWebhook } from './api/webhooks/github.js';
import { handleAnthropicWebhook } from './api/webhooks/anthropic.js';
import { handleCursorWebhook } from './api/webhooks/cursor.js';
import { handleOpenAiWebhook } from './api/webhooks/openai.js';
import { handleInternalWebhook } from './api/webhooks/internal.js';
import { handleCloudflareWebhook } from './api/webhooks/cloudflare.js';
import { handleRealtimeKitWebhook } from './api/webhooks/realtimekit.js';
import { handleStreamLiveWebhook, handleStreamVodWebhook } from './api/webhooks/stream.js';
import { handleCloudConvertWebhook } from './api/webhooks/cloudconvert.js';
import { handleMeshyWebhook } from './api/webhooks/meshy.js';
import { recordAgentsamWebhookEvent } from './core/webhook-events-writer.js';
import { getDashboardR2Object, getDashboardSpaHtmlShell } from './core/dashboard-r2-assets.js';
import { isDashboardSpaShellPath, withDashboardEarlyHints } from './core/dashboard-early-hints.js';
import { resolveGitHubToken } from './core/github-token.js';
import { handleSitemapPage, handleSitemapXml } from './public-pages/sitemap-route.js';
import { handleQualityReportRoute } from './public-pages/quality-report-route.js';
import { wrapEnvKvBinding } from './core/kv-storage-policy.js';

function getMimeType(key) {
  if (key.endsWith('.js'))    return 'application/javascript';
  if (key.endsWith('.css'))   return 'text/css';
  if (key.endsWith('.html'))  return 'text/html; charset=utf-8';
  if (key.endsWith('.json'))  return 'application/json';
  if (key.endsWith('.woff2')) return 'font/woff2';
  if (key.endsWith('.woff'))  return 'font/woff';
  if (key.endsWith('.svg'))   return 'image/svg+xml';
  if (key.endsWith('.png'))   return 'image/png';
  if (key.endsWith('.map'))   return 'application/json';
  return 'application/octet-stream';
}
import { createTracer } from './core/tracer.js';
import { isLikelyWordPressProbePath } from './core/wp-probe-path.js';

// --- Durable Objects (ACTIVE: 5 production classes incl. MyContainer) ---
export { IAMCollaborationSession } from './do/Collaboration.js';
export { AgentChatSqlV1 } from './do/AgentChat.js';
export { AgentBrowserLiveV1 } from './do/AgentBrowserLive.js';
export { ChessRoom } from './do/Legacy.js';
export { MyContainer } from './do/MyContainer.js';

export default {

  /**
   * Primary Request Handler
   */
  async fetch(request, env, ctx) {
    env = wrapEnvKvBinding(env);
    const url = new URL(request.url);
    // Collapse duplicate slashes (e.g. Supabase Site URL `https://host/` + auth path `/api/...` → `//api/...`).
    const path =
      (String(url.pathname || '/').replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/') || '/';
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

      // Only strip duplicate domain-scoped session cookies when the browser actually sent
      // more than one `session=` (e.g. stale Domain=.inneranimalmedia.com vs host-only).
      // Unconditional clears on every dashboard HTML response can break post-OAuth flows and
      // contribute to “half-loaded” SPAs (APIs 401 / odd cache behavior).
      if (!isSettingSession && sessionCount > 1) {
        mutableHeaders.append('Set-Cookie', 'session=; Domain=.inneranimalmedia.com; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax');
        mutableHeaders.append('Set-Cookie', 'session=; Domain=.sandbox.inneranimalmedia.com; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax');
      }

      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: mutableHeaders,
      });
    };

    const tracer = createTracer(env, ctx);
    ctx.tracer = tracer;

    try {
      const methodUpper = (request.method || 'GET').toUpperCase();
      if (isLikelyWordPressProbePath(pathLower)) {
        const { globeErrorPage } = await import('./core/error-pages');
        return new Response(
          globeErrorPage({ status: 404, title: 'Page not found', url: url.pathname }),
          { status: 404, headers: { 'Content-Type': 'text/html;charset=UTF-8' } },
        );
      }
      if (pathLower === '/api/internal/artifacts/purge' && methodUpper === 'POST') {
        const { handleArtifactPurgeInternal } = await import('./api/artifact-purge-internal.js');
        return handleArtifactPurgeInternal(request, env);
      }

      const isDashboardHtmlNav =
        (methodUpper === 'GET' || methodUpper === 'HEAD') && isDashboardSpaShellPath(pathLower);
      const requestContext =
        isPublicOAuthPath(pathLower) || isAutomationApiPath(pathLower, methodUpper)
          ? publicOAuthRequestContext()
          : await resolveRequestContext(request, env, { required: !isDashboardHtmlNav });
      // keep primeRequestAuth for cache compatibility during migration (never required)
      await primeRequestAuth(request, env);
      const identity = await resolveIdentity(env, request);
      // Canonical auth URLs first — before health, assets, dashboard shell, or legacy fallthrough.
      // Preserve query string (e.g. next=). No-store so stale HTML is not cached at /login.
      if ((methodUpper === 'GET' || methodUpper === 'HEAD') && pathLower === '/login') {
        const u = new URL(request.url);
        u.pathname = '/auth/login';
        return new Response(null, {
          status: 302,
          headers: {
            Location: u.toString(),
            'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
          },
        });
      }
      if ((methodUpper === 'GET' || methodUpper === 'HEAD') && pathLower === '/signup') {
        const u = new URL(request.url);
        u.pathname = '/auth/signup';
        return new Response(null, {
          status: 302,
          headers: {
            Location: u.toString(),
            'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
          },
        });
      }
      if ((methodUpper === 'GET' || methodUpper === 'HEAD') && pathLower === '/auth/register') {
        const u = new URL(request.url);
        u.pathname = '/auth/signup';
        return new Response(null, {
          status: 302,
          headers: {
            Location: u.toString(),
            'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
          },
        });
      }
      // Legacy / alternate sign-in URLs → canonical login (preserve query e.g. next=, error=)
      if (
        (methodUpper === 'GET' || methodUpper === 'HEAD') &&
        (pathLower === '/auth/signin' ||
          pathLower === '/auth-signin' ||
          pathLower === '/auth-signin.html')
      ) {
        const u = new URL(request.url);
        u.pathname = '/auth/login';
        return new Response(null, {
          status: 302,
          headers: {
            Location: u.toString(),
            'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
          },
        });
      }

      // 1. Health Checks
      if (pathLower === '/api/health' || pathLower === '/health') {
        return handleHealthCheck(request, env);
      }

      if (pathLower === '/api/launch-desk' && (methodUpper === 'POST' || methodUpper === 'GET')) {
        return handleLaunchDeskChat(request, env, ctx);
      }

      // GitHub App / webhook deliveries (must run on modular worker; wrangler main = src/index.js)
      if (pathLower === '/api/webhooks/github' && methodUpper === 'POST') {
        return handleGithubWebhook(request, env, ctx);
      }

      if (pathLower === '/api/webhooks/anthropic' && methodUpper === 'POST') {
        return handleAnthropicWebhook(request, env, ctx);
      }

      if (pathLower === '/api/webhooks/cursor' && methodUpper === 'POST') {
        return handleCursorWebhook(request, env, ctx);
      }

      if (pathLower === '/api/webhooks/openai' || pathLower === '/api/hooks/openai') {
        return handleOpenAiWebhook(request, env, ctx);
      }

      if (pathLower === '/api/webhooks/internal' && methodUpper === 'POST') {
        return handleInternalWebhook(request, env, ctx);
      }

      if (pathLower === '/api/webhooks/cloudflare' && methodUpper === 'POST') {
        return handleCloudflareWebhook(request, env, ctx);
      }

      if (pathLower === '/api/webhooks/realtimekit' && methodUpper === 'POST') {
        return handleRealtimeKitWebhook(request, env, ctx);
      }

      if (pathLower === '/api/webhooks/stream/vod' && methodUpper === 'POST') {
        return handleStreamVodWebhook(request, env, ctx);
      }

      if (pathLower === '/api/webhooks/stream/live' && methodUpper === 'POST') {
        return handleStreamLiveWebhook(request, env, ctx);
      }

      if (pathLower === '/api/webhooks/cloudconvert' && methodUpper === 'POST') {
        return handleCloudConvertWebhook(request, env, ctx);
      }

      if (pathLower === '/api/webhooks/meshy' && methodUpper === 'POST') {
        return handleMeshyWebhook(request, env, ctx);
      }

      if (pathLower === '/api/webhooks/supabase' || pathLower === '/api/hooks/supabase') {
        const { handleSupabaseWebhook } = await import('./api/webhooks/supabase.js');
        return handleSupabaseWebhook(request, env, ctx);
      }

      // Anthropic code-execution E2E (gated: production + IAM_ENABLE_E2E_TEST_ROUTES + X-IAM-Test-Secret)
      if (pathLower === '/api/test/code-execution-e2e' && methodUpper === 'POST') {
        if (String(env.ENVIRONMENT || '').toLowerCase() !== 'production') {
          return new Response(null, { status: 404 });
        }
        if (String(env.IAM_ENABLE_E2E_TEST_ROUTES || '') !== 'true') {
          return new Response(null, { status: 404 });
        }
        const { handleCodeExecutionE2E } = await import('./api/test/code-execution-e2e.js');
        return handleCodeExecutionE2E(request, env, ctx);
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

      // Tunnel status/restart (shared handler with src/core/router.js; must run before api catchall)
      if (pathLower === TUNNEL_STATUS_PATH && methodUpper === 'GET') {
        return handleTunnelStatusGet(request, env);
      }
      if (pathLower === TUNNEL_RESTART_PATH && methodUpper === 'POST') {
        return handleTunnelRestartPost(request, env);
      }

      // Collab workspace room -> IAM_COLLAB DO (`/api/collab/room/{room}` → DO name = decoded room, e.g. canvas:ws_…)
      if (/^\/api\/collab\/room\//i.test(path)) {
        const collabMatch = path.match(/^\/api\/collab\/room\/(.+)$/i);
        let room = '';
        try {
          room = collabMatch ? decodeURIComponent(collabMatch[1]) : '';
        } catch (_) {
          room = collabMatch ? collabMatch[1] : '';
        }
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

      if (pathLower === '/sitemap.xml') {
        return handleSitemapXml();
      }
      if (pathLower === '/sitemap' || pathLower === '/sitemap/') {
        return handleSitemapPage(env.ASSETS);
      }

      const qualityReportRes = await handleQualityReportRoute(request, env, pathLower);
      if (qualityReportRes) return qualityReportRes;

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
      let assetHtmlKey = ASSET_ROUTES[pathLower] || ASSET_ROUTES[path];
      if (!assetHtmlKey && /^\/games\/room_[a-z0-9]+$/i.test(pathLower)) {
        assetHtmlKey = 'pages/games/room.html';
      }
      if (assetHtmlKey) {
        let obj = null;
        if (env.ASSETS) obj = await env.ASSETS.get(assetHtmlKey);
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
          env.ASSETS ? env.ASSETS.get('src/components/iam-header.html') : Promise.resolve(null),
          env.ASSETS ? env.ASSETS.get('src/components/iam-footer.html') : Promise.resolve(null),
        ]);
        const headerHtml = headerObj ? await headerObj.text() : '';
        const footerHtml = footerObj ? await footerObj.text() : '';
        // Auth shells ship their own nav; chess rooms are fullscreen — no marketing chrome.
        const skipShellInject =
          (typeof assetHtmlKey === 'string' && assetHtmlKey.startsWith('pages/auth/')) ||
          assetHtmlKey === 'pages/games/room.html';
        let pageBody = obj.body;
        if (assetHtmlKey === 'pages/contact/index.html') {
          let htmlText = await obj.text();
          if (env.DB) {
            try {
              const cmsBundle = await loadPublishedCmsSectionsByRoute(env.DB, '/contact');
              htmlText = hydrateContactPageHtml(htmlText, cmsBundle.sections);
            } catch (e) {
              console.warn('[contact] cms hydrate failed (serving static shell):', e?.message);
            }
          }
          pageBody = htmlText;
        }
        if (assetHtmlKey === 'pages/games/index.html') {
          let htmlText = await obj.text();
          if (env.DB) {
            try {
              const cmsBundle = await loadPublishedCmsSectionsByRoute(env.DB, '/games');
              htmlText = hydrateGamesPageHtml(htmlText, cmsBundle.sections);
            } catch (e) {
              console.warn('[games] cms hydrate failed (serving static shell):', e?.message);
            }
          }
          pageBody = htmlText;
        }
        return new HTMLRewriter()
          .on('body', {
            element(el) {
              if (!skipShellInject && headerHtml) el.prepend(headerHtml, { html: true });
              if (!skipShellInject && footerHtml) el.append(footerHtml, { html: true });
            }
          })
          .transform(new Response(pageBody, {
            headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=300' },
          }));
      }

      // 1a. Same-origin R2 assets passthrough (GLB, images, etc.)
      // Example: /assets/chess/v1/pieces/white/king.glb -> ASSETS.get('chess/v1/pieces/white/king.glb')
      if (pathLower.startsWith('/assets/') && env.ASSETS) {
        let key = path.slice('/assets/'.length).replace(/^\/+/, '');
        try {
          key = decodeURIComponent(key);
        } catch (_) {
          /* use raw key */
        }
        if (!key || key.includes('..')) return new Response('Bad request', { status: 400 });

        const obj = await env.ASSETS.get(key);
        if (!obj) return new Response('Not found', { status: 404 });

        const inferred =
          key.toLowerCase().endsWith('.glb') ? 'model/gltf-binary' :
          key.toLowerCase().endsWith('.gltf') ? 'model/gltf+json' :
          null;

        const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS' };
        if (request.method === 'OPTIONS') {
          return new Response(null, { status: 204, headers: cors });
        }
        return new Response(obj.body, {
          headers: {
            'Content-Type': obj.httpMetadata?.contentType || inferred || 'application/octet-stream',
            'Cache-Control': 'public, max-age=3600',
            ...cors,
          },
        });
      }

      // 1c. OAuth aliases + modular OAuth (no legacy worker)
      // Aliases for older/doc links → same routes as /api/oauth/{google,github}/start.
      if (
        (pathLower === '/api/auth/google/start' || pathLower === '/api/auth/github/start') &&
        request.method === 'GET'
      ) {
        const u = new URL(request.url);
        u.pathname =
          pathLower === '/api/auth/google/start'
            ? '/api/oauth/google/start'
            : '/api/oauth/github/start';
        return handleOAuthApi(new Request(u.toString(), request), env, ctx);
      }

      if (
        (request.method === 'GET' || request.method === 'POST') &&
        pathLower === '/api/oauth/mcp/consent'
      ) {
        const { handleIamMcpOAuthConsentPage } = await import('./api/mcp-oauth-consent.js');
        return handleIamMcpOAuthConsentPage(request, env);
      }

      if (
        request.method === 'GET' &&
        (pathLower === '/.well-known/oauth-authorization-server' ||
          pathLower === '/.well-known/openid-configuration' ||
          pathLower === '/.well-known/jwks.json')
      ) {
        const { handleIamOAuthWellKnown } = await import('./api/oauth.js');
        const wk = await handleIamOAuthWellKnown(request, env);
        if (wk) return wk;
      }

      if (pathLower.startsWith('/api/oauth/')) {
        const res = await handleOAuthApi(request, env, ctx);
        if (res && res.status !== 404) return res;
        return jsonResponse(
          { error: 'Not found', path: pathLower },
          404,
        );
      }

      // Supabase login OAuth (must be above legacy /auth/callback/* handling)
      if (request.method === 'GET' && pathLower === '/api/auth/supabase/start') {
        return handleSupabaseOAuthStart(request, env);
      }
      if (request.method === 'GET' && pathLower === '/api/auth/cloudflare/start') {
        const u = new URL(request.url);
        u.pathname = '/api/oauth/cloudflare/start';
        if (!u.searchParams.get('return_to')) {
          u.searchParams.set('return_to', '/dashboard/agent');
        }
        return handleOAuthApi(new Request(u.toString(), request), env, ctx);
      }
      if (
        request.method === 'GET' &&
        (pathLower === '/api/auth/supabase/callback' || pathLower === '/auth/callback/supabase')
      ) {
        return handleSupabaseOAuthCallback(request, env);
      }
      if (
        (pathLower === '/oauth/consent' || pathLower === '/api/auth/oauth/consent/approve' || pathLower === '/api/auth/oauth/consent/deny') &&
        (methodUpper === 'GET' || methodUpper === 'POST')
      ) {
        const u = new URL(request.url);
        u.pathname = '/api/auth/oauth/consent';
        if (pathLower.endsWith('/approve')) u.searchParams.set('_consent_action', 'approve');
        if (pathLower.endsWith('/deny')) u.searchParams.set('_consent_action', 'deny');
        return handleOAuthConsentPage(new Request(u.toString(), request), env);
      }
      if (
        (request.method === 'GET' || request.method === 'POST') &&
        pathLower === '/api/auth/oauth/consent'
      ) {
        return handleOAuthConsentPage(request, env);
      }
      if (pathLower.startsWith('/api/auth-hooks/')) {
        const { handleAuthHooksApi } = await import('./api/auth-hooks.js');
        const res = await handleAuthHooksApi(request, env);
        if (res) return res;
      }

      // /auth/login, /auth/signup, /auth/reset are ASSET_ROUTES (R2) above — not legacy.
      // /auth/callback/supabase is modular (handleSupabaseOAuthCallback) above.
      // Google/GitHub login OAuth (same handlers as /api/oauth/{google,github}/callback — see oauth.js dispatch).
      if (pathLower === '/auth/callback/google') {
        return withSessionHealing(
          await handleGoogleLoginOAuthCallback(request, new URL(request.url), env),
        );
      }
      if (pathLower === '/auth/callback/github') {
        return withSessionHealing(
          await handleGitHubLoginOAuthCallback(request, new URL(request.url), env),
        );
      }

      if (pathLower.startsWith('/auth/')) {
        const { globeErrorPage } = await import('./core/error-pages');
        return new Response(
          globeErrorPage({ status: 404, title: 'Page not found', url: url.pathname }),
          { status: 404, headers: { 'Content-Type': 'text/html;charset=UTF-8' } },
        );
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

      // 2. Global Request Context (auth primed at front door — no re-query)
      const authCtx = peekRequestAuth(request);
      const authUser = authCtx ? authContextToLegacyUser(authCtx) : null;

      if (pathLower === '/api/mcp/token/create' && methodUpper === 'POST') {
        if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
        if (!identity) return jsonResponse({ error: 'unauthenticated' }, 401);
        if (!identity.workspaceId) {
          return jsonResponse({ error: 'no_workspace', redirect: '/onboarding' }, 403);
        }
        const body = await request.json().catch(() => ({}));
        const { label, allowedTools, expiresInDays, rateLimitPerHour: rateLimitBody } = body;
        const rateParsed = Number(rateLimitBody);
        const rateLimitPerHour =
          Number.isFinite(rateParsed) && rateParsed > 0
            ? Math.min(10000, Math.floor(rateParsed))
            : identity.isSuperadmin
              ? 10000
              : 1000;
        try {
          const result = await generateMcpToken(env, {
            userId: identity.userId,
            workspaceId: identity.workspaceId,
            tenantId: identity.tenantId,
            label: label || `${identity.name || 'User'} MCP token`,
            allowedTools: allowedTools || null,
            rateLimitPerHour,
            expiresInDays: expiresInDays || null,
          });
          return jsonResponse({
            ok: true,
            bearer: result.bearer,
            tokenId: result.tokenId,
            warning: 'Save this bearer — it will not be shown again.',
          });
        } catch (e) {
          return jsonResponse({ error: e?.message || String(e) }, 500);
        }
      }

      if (pathLower === '/api/mcp/token/revoke' && methodUpper === 'POST') {
        if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
        if (!identity) return jsonResponse({ error: 'unauthenticated' }, 401);
        const { tokenId } = await request.json().catch(() => ({}));
        if (!tokenId) return jsonResponse({ error: 'tokenId required' }, 400);
        await env.DB.prepare(`
      UPDATE mcp_workspace_tokens SET is_active = 0, revoked_at = unixepoch()
      WHERE id = ? AND tenant_id = ? AND workspace_id = ?
    `)
          .bind(tokenId, identity.tenantId, identity.workspaceId)
          .run();
        return jsonResponse({ ok: true });
      }

      if (pathLower === '/api/mcp/tokens' && methodUpper === 'GET') {
        if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
        if (!identity?.tenantId || !identity?.workspaceId) {
          return jsonResponse({ error: 'unauthenticated' }, 401);
        }
        const { results } = await env.DB.prepare(
          `SELECT id, label, rate_limit_per_hour, is_active, expires_at, created_at, last_used_at, allowed_tools
           FROM mcp_workspace_tokens
           WHERE tenant_id = ? AND workspace_id = ? AND COALESCE(is_active, 1) = 1
           ORDER BY created_at DESC LIMIT 50`,
        )
          .bind(identity.tenantId, identity.workspaceId)
          .all();
        return jsonResponse({ tokens: results || [] });
      }

      if (pathLower === '/api/agent/execute' && methodUpper === 'POST') {
        const { executeCommand } = await import('./api/command-run-telemetry.js');
        const ingestBypass = isIngestSecretAuthorized(request, env);
        let session = null;
        if (!ingestBypass) {
          session = await getSession(env, request).catch(() => null);
          if (!session?.user_id) return jsonResponse({ error: 'Unauthorized' }, 401);
          if (!identity) {
            return new Response(JSON.stringify({ error: 'unauthenticated' }), {
              status: 401,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          if (!identity.workspaceId) {
            return new Response(
              JSON.stringify({ error: 'no_workspace', redirect: '/onboarding' }),
              { status: 403, headers: { 'Content-Type': 'application/json' } },
            );
          }
        }
        const body = await request.json().catch(() => ({}));
        let userId = body.userId ?? authUser?.id ?? session?.user_id ?? null;
        let tenantId = body.tenantId ?? authUser?.tenant_id ?? session?.tenant_id ?? null;
        let workspaceId =
          body.workspaceId ?? body.workspace_id ?? identity?.workspaceId ?? null;
        if (!ingestBypass && identity) {
          userId = body.userId ?? identity.userId;
          tenantId = body.tenantId ?? identity.tenantId;
          workspaceId = body.workspaceId ?? body.workspace_id ?? identity.workspaceId;
        }
        if (!tenantId && userId) {
          tenantId = await fetchAuthUserTenantId(env, userId).catch(() => null);
        }
        const sessionId = body.sessionId ?? session?.session_id ?? null;
        const result = await executeCommand(env, ctx, {
          ...body,
          userId,
          tenantId,
          workspaceId,
          sessionId,
        });
        return jsonResponse(result);
      }

      if (pathLower === '/api/agent/approve' && methodUpper === 'POST') {
        const { handleAgentApprovalDecision } = await import('./api/command-run-telemetry.js');
        const body = await request.json().catch(() => ({}));
        const { approval_id, decision } = body;
        if (!approval_id || !['approved', 'denied'].includes(String(decision || '').toLowerCase())) {
          return jsonResponse({ error: 'invalid params' }, 400);
        }
        const ingestBypass = isIngestSecretAuthorized(request, env);
        let session = null;
        if (!ingestBypass) {
          session = await getSession(env, request).catch(() => null);
          if (!session?.user_id) return jsonResponse({ error: 'Unauthorized' }, 401);
        }
        const userId = body.userId ?? authUser?.id ?? session?.user_id ?? null;
        const result = await handleAgentApprovalDecision(env, ctx, {
          approval_id,
          decision: String(decision).toLowerCase(),
          userId,
        });
        return jsonResponse(result);
      }

      if (pathLower === '/api/agent/workflow/start' && methodUpper === 'POST') {
        const { startWorkflow } = await import('./core/workflows.js');
        const body = await request.json().catch(() => ({}));
        const ingestBypass = isIngestSecretAuthorized(request, env);
        let session = null;
        if (!ingestBypass) {
          session = await getSession(env, request).catch(() => null);
          if (!session?.user_id) return jsonResponse({ error: 'Unauthorized' }, 401);
          if (!identity) {
            return new Response(JSON.stringify({ error: 'unauthenticated' }), {
              status: 401,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          if (!identity.workspaceId) {
            return new Response(
              JSON.stringify({ error: 'no_workspace', redirect: '/onboarding' }),
              { status: 403, headers: { 'Content-Type': 'application/json' } },
            );
          }
        }
        let userId = body.userId ?? authUser?.id ?? session?.user_id ?? null;
        let tenantId = body.tenantId ?? authUser?.tenant_id ?? session?.tenant_id ?? null;
        let workspaceId =
          body.workspaceId ?? body.workspace_id ?? identity?.workspaceId ?? null;
        if (!ingestBypass && identity) {
          userId = body.userId ?? identity.userId;
          tenantId = body.tenantId ?? identity.tenantId;
          workspaceId = body.workspaceId ?? body.workspace_id ?? identity.workspaceId;
        }
        if (!tenantId && userId) {
          tenantId = await fetchAuthUserTenantId(env, userId).catch(() => null);
        }
        const sessionId = body.sessionId ?? session?.session_id ?? null;
        const result = await startWorkflow(env, ctx, {
          ...body,
          userId,
          sessionId,
          tenantId,
          workspaceId,
        });
        return jsonResponse(result);
      }


      // POST /api/agentsam/telemetry/ingest — receive ETO events from tenant AgentSams
      if (pathLower === '/api/agentsam/telemetry/ingest' && methodUpper === 'POST') {
        const bridgeKey = request.headers.get('Authorization')?.replace('Bearer ', '').trim();
        if (!bridgeKey || !env.AGENTSAM_BRIDGE_KEY || bridgeKey !== env.AGENTSAM_BRIDGE_KEY) {
          return jsonResponse({ error: 'Unauthorized' }, 401);
        }
        const body = await request.json().catch(() => null);
        if (!body?.events?.length) return jsonResponse({ error: 'No events' }, 400);

        const tenantId  = request.headers.get('X-Tenant-ID')  || 'unknown';
        const wsId      = request.headers.get('X-Workspace-ID') || 'unknown';
        const received  = [];
        const skipped   = [];

        for (const ev of body.events.slice(0, 50)) {
          if (!ev.routing_arm_id || !ev.model_key) { skipped.push(ev.id || '?'); continue; }
          try {
            // Upsert into IAM agentsam_performance_eto_events
            await env.DB.prepare(`
              INSERT OR IGNORE INTO agentsam_performance_eto_events
                (id, tenant_id, workspace_id, source_table, source_id,
                 routing_arm_id, task_type, mode, model_key, provider,
                 success, failure, latency_ms, input_tokens, output_tokens,
                 cost_usd, quality_score, reward_score, alpha_delta, beta_delta,
                 reward_reason, is_training_eligible, evidence_json,
                 applied_to_thompson_at)
              VALUES (?,?,?,?,?, ?,?,?,?,?, ?,?,?,?,?, ?,?,?,?,?, ?,?,?,datetime('now'))
            `).bind(
              ev.id, tenantId, wsId,
              ev.source_table || 'agentsam_agent_run',
              ev.source_id    || ev.id,
              ev.routing_arm_id, ev.task_type || 'general', ev.mode || 'ask',
              ev.model_key, ev.provider || ev.model_key.split('/')[0],
              ev.success ? 1 : 0, ev.failure ? 1 : 0,
              ev.latency_ms || 0, ev.input_tokens || 0, ev.output_tokens || 0,
              ev.cost_usd || 0, ev.quality_score ?? null,
              ev.reward_score || 0, ev.alpha_delta || 0, ev.beta_delta || 0,
              ev.reward_reason || '', 1,
              JSON.stringify(ev.evidence_json || {})
            ).run();
            received.push(ev.id);
          } catch (e) {
            skipped.push(ev.id || '?');
          }
        }

        return jsonResponse({
          ok: true,
          received: received.length,
          skipped: skipped.length,
          tenant_id: tenantId,
        });
      }

      // 2b. Dashboard shell: require session before HTML/SPA
      if (!pathLower.startsWith('/api/')) {
        const needsDashAuth =
          pathLower === '/dashboard' ||
          pathLower.startsWith('/dashboard/');
        if (needsDashAuth && !authUser) {
          const next = encodeURIComponent(`${path}${url.search || ''}`);
          return Response.redirect(`${url.origin}/auth/login?next=${next}`, 302);
        }
        if (needsDashAuth && authUser?.id && env.DB) {
          const { userNeedsSignupEmailVerification } = await import('./core/auth-email-verify.js');
          if (await userNeedsSignupEmailVerification(env, authUser.id)) {
            const next = encodeURIComponent(`${path}${url.search || ''}`);
            return Response.redirect(
              `${url.origin}/auth/login?error=email_not_verified&next=${next}`,
              302,
            );
          }
        }
      }

      // 2c. Collab canvas API → IAM_COLLAB DO (`canvas:{workspaceId}`) — requires workspace_id query param
      if (/^\/api\/collab\/canvas/i.test(pathLower)) {
        if (!env.IAM_COLLAB) {
          return jsonResponse({ ok: false, reason: 'iam_collab_binding_missing' }, 200);
        }
        if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
        const collabWs =
          url.searchParams.get('workspace_id')?.trim() ||
          url.searchParams.get('workspace')?.trim() ||
          '';
        if (!collabWs) return jsonResponse({ error: 'workspace_id required' }, 400);
        const { userCanAccessWorkspace } = await import('./core/cms-theme-resolve.js');
        const allowed = await userCanAccessWorkspace(env, authUser, collabWs);
        if (!allowed) return jsonResponse({ error: 'Forbidden' }, 403);
        const stub = env.IAM_COLLAB.get(env.IAM_COLLAB.idFromName(`canvas:${collabWs}`));
        const internalPath = path.replace(/^\/api\/collab\/canvas/i, '/canvas');
        const internalUrl = new URL(`https://collab.internal${internalPath}`);
        internalUrl.search = url.search;
        return stub.fetch(
          new Request(internalUrl.toString(), {
            method: request.method,
            headers: request.headers,
            body: request.body,
          }),
        );
      }

      // GET /api/github/repos/:owner/:repo/contents — GitHub Contents API proxy (GitHubExplorer)
      if (methodUpper === 'GET') {
        const contentsMatch = path.match(/^\/api\/github\/repos\/([^/]+)\/([^/]+)\/contents$/i);
        if (contentsMatch) {
          if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
          const owner = decodeURIComponent(contentsMatch[1]);
          const repo = decodeURIComponent(contentsMatch[2]);
          const filePath = (url.searchParams.get('path') || '').replace(/^\/+/, '');
          const ref = url.searchParams.get('ref') || '';
          const { token, error, status } = await resolveGitHubToken(authUser, env);
          if (error) return jsonResponse({ error }, status || 401);
          let ghUrl = `https://api.github.com/repos/${owner}/${repo}/contents`;
          if (filePath) {
            ghUrl += `/${filePath.split('/').filter(Boolean).map((s) => encodeURIComponent(s)).join('/')}`;
          }
          const ghUrlObj = new URL(ghUrl);
          if (ref) ghUrlObj.searchParams.set('ref', ref);
          const ghRes = await fetch(ghUrlObj.toString(), {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28',
              'User-Agent': 'inneranimalmedia-agent/1.0',
            },
          });
          const outHeaders = new Headers();
          const contentType = ghRes.headers.get('Content-Type');
          if (contentType) outHeaders.set('Content-Type', contentType);
          return new Response(ghRes.body, {
            status: ghRes.status,
            statusText: ghRes.statusText,
            headers: outHeaders,
          });
        }
      }

      // 3. Domain dispatch — single source: src/core/production-dispatch.js (re-exported from router.js).
      // Includes /api/integrations/* (e.g. GET /api/integrations/github/repos via handleIntegrationsRequest).
      const domainRes = await dispatchProductionDomainRoutes({
        request,
        url,
        env,
        ctx,
        authUser,
        authCtx: authCtx ?? null,
        identity,
        requestContext,
        methodUpper,
        pathLower,
        path,
      });
      if (domainRes != null) return domainRes;

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
        if (env.ASSETS) {
          if (pathLower === '/dashboard' || pathLower === '/dashboard/') {
            return withSessionHealing(Response.redirect(`${url.origin}/dashboard/agent`, 302));
          }

          const pwaRootAssets = {
            '/sw.js': { key: 'static/dashboard/sw.js', contentType: 'application/javascript; charset=utf-8' },
            '/push-handler.js': {
              key: 'static/dashboard/push-handler.js',
              contentType: 'application/javascript; charset=utf-8',
            },
            '/manifest.webmanifest': {
              key: 'static/dashboard/manifest.webmanifest',
              contentType: 'application/manifest+json; charset=utf-8',
            },
            '/offline.html': { key: 'static/dashboard/offline.html', contentType: 'text/html; charset=utf-8' },
          };
          const pwaAsset = pwaRootAssets[pathLower];
          if (pwaAsset && env.ASSETS) {
            const obj = await getDashboardR2Object(env.ASSETS, pwaAsset.key);
            if (obj) {
              const h = new Headers({
                'Content-Type': pwaAsset.contentType,
                'Cache-Control':
                  pathLower === '/sw.js' || pathLower === '/push-handler.js'
                    ? 'no-cache'
                    : 'public, max-age=3600',
              });
              if (pathLower === '/sw.js') {
                h.set('Service-Worker-Allowed', '/');
              }
              return new Response(obj.body, { headers: h });
            }
          }

          const assetKey = path.slice(1) || 'index.html';

          if (env.ASSETS) {
            const obj = await env.ASSETS.get(assetKey);
            if (obj) return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType || getMimeType(assetKey) } });
          }

          if (env.ASSETS) {
            const obj = await getDashboardR2Object(env.ASSETS, assetKey);
            if (obj) return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType || getMimeType(assetKey), 'Cache-Control': 'public, max-age=31536000' } });

            if (isDashboardSpaShellPath(pathLower) || pathLower === '/oauth/mcp/consent') {
              const index = await getDashboardSpaHtmlShell(env.ASSETS);
              if (index) {
                const h = new Headers({
                  'Content-Type': 'text/html; charset=utf-8',
                  'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
                });
                const shellRes = withSessionHealing(new Response(index.body, { headers: h }));
                return isDashboardSpaShellPath(pathLower)
                  ? withDashboardEarlyHints(shellRes)
                  : shellRes;
              }
            }
          }
        }
      }

      // 5. Fallback: API route not implemented in modular worker
      if (pathLower.startsWith('/api/')) {
        return new Response(JSON.stringify({ error: 'Not found', path: url.pathname }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
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
      if (e instanceof AuthError) {
        const accept = request.headers.get('Accept') || '';
        const wantsHtml = accept.includes('text/html');
        if (
          wantsHtml &&
          (isDashboardSpaShellPath(pathLower) || pathLower === '/dashboard' || pathLower === '/dashboard/')
        ) {
          const next = encodeURIComponent(`${path}${url.search || ''}`);
          return withSessionHealing(
            Response.redirect(`${url.origin}/auth/login?next=${next}`, 302),
          );
        }
        const status = e.status || 401;
        const body =
          isPublicOAuthPath(pathLower) || pathLower.startsWith('/api/oauth/')
            ? { error: e.code || 'unauthorized', error_description: 'Unauthorized' }
            : { error: 'Unauthorized', code: e.code || 'UNAUTHORIZED' };
        return jsonResponse(body, status);
      }

      console.error('[Worker Error]', e.message);

      ctx.waitUntil(recordWorkerAnalyticsError(env, {
        path: pathLower,
        method: request.method,
        status_code: 500,
        error_message: e.message
      }));

      return jsonResponse({ error: 'Internal Server Error', detail: e.message }, 500);
    } finally {
      tracer.flush();
    }
  },

  /**
   * Scheduled Cron Handler
   */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleScheduled(event, wrapEnvKvBinding(env), ctx));
  },

  /**
   * Queue Handler
   */
  async queue(batch, env, ctx) {
    env = wrapEnvKvBinding(env);
    const messages = batch?.messages || [];
    for (const msg of messages) {
      let body = {};
      try {
        body =
          msg.body && typeof msg.body === 'object'
            ? msg.body
            : typeof msg.body === 'string'
              ? JSON.parse(msg.body || '{}')
              : {};
      } catch {
        body = {};
      }
      let tenantId = body?.tenantId ?? body?.tenant_id;
      let workspaceId = body?.workspaceId ?? body?.workspace_id;
      const isCfSystem = typeof body?.type === 'string' && body.type.startsWith('cf.workers');

      if (body?.type === 'codebase_index_sync') {
        console.warn(
          '[queue] codebase_index_sync retired — use agentsam_codebase_reindex.mjs + rag_ingest --lane code',
        );
        msg.ack();
        continue;
      }

      ctx.waitUntil(
        dispatchQueueMessage(env, ctx, msg)
          .then(() => msg.ack())
          .catch((err) => {
            let kind = 'unknown';
            try {
              const b =
                msg.body && typeof msg.body === 'object'
                  ? msg.body
                  : JSON.parse(String(msg.body || '{}'));
              kind = typeof b?.type === 'string' ? b.type : kind;
            } catch {
              /* ignore */
            }
            console.error('[queue] dispatch failed', kind, err?.message);
            msg.retry();
          }),
      );
    }
  }
};
