/**
 * Public OAuth / discovery / auth routes on inneranimalmedia.com.
 * Must bypass required session/auth context at the Worker front door.
 *
 * RULE: any route that an unauthenticated browser or OAuth client (ChatGPT,
 * Cursor, Claude) can legitimately reach before having a session belongs here.
 * The isPublicOAuthPath() prefix match means '/api/oauth' covers all sub-paths.
 */

export const PUBLIC_OAUTH_PATHS = [
  // RFC 8414 / OIDC discovery
  '/.well-known/oauth-authorization-server',
  '/.well-known/openid-configuration',
  '/.well-known/jwks.json',

  // IAM OAuth server — full sub-tree (authorize, token, register, userinfo,
  // mcp/consent, login-challenge/resume, google/start, github/start, etc.)
  '/api/oauth',

  // Auth page shells served from R2 (login, signup, reset)
  '/auth/login',
  '/auth/signup',
  '/auth/reset',

  // Provider OAuth callbacks (unauthenticated — arrive from Google/GitHub/Supabase)
  '/auth/callback/google',
  '/auth/callback/github',
  '/auth/callback/supabase',
  '/api/auth/supabase/callback',

  // IAM OAuth consent page (user approves MCP scopes while optionally signed in)
  '/api/auth/oauth/consent',
  '/oauth/consent',

  // Auth REST endpoints — login/signup POST, hooks webhook receiver
  '/api/auth/login',
  '/api/auth/signup',
  '/api/auth/backup-code',
  '/api/auth/recovery',
  '/api/auth/password-reset',
  '/api/auth/reset',
  '/api/auth/forgot-password',
  '/api/auth/verify-email',
  '/api/auth/resend-verification',
  '/api/auth-hooks',

  // Unauthenticated social-login starts (Google/GitHub/Supabase login flow,
  // not the authenticated integration flow)
  '/api/auth/google/start',
  '/api/auth/github/start',
  '/api/auth/supabase/start',

  // Health checks
  '/api/health',
  '/api/system/health',
  '/health',

  // Public marketing / legal pages (R2 HTML, no session required)
  '/',
  '/work',
  '/about',
  '/services',
  '/contact',
  '/pricing',
  '/terms',
  '/privacy',
  '/games',
  '/marketing',
  '/learn',
  '/start',
  '/auth/reset',

  // Public CMS section reads (marketing page hydration)
  '/api/public/cms',

  // MeauxChess — public lobby, rooms, invites, WebSocket (guest-safe)
  '/api/games',


  // Cloudflare Stream VOD + Live Input webhooks (unsigned gate bypass)
  '/api/webhooks/stream/vod',
  '/api/webhooks/stream/live',

  // CloudConvert job webhooks
  '/api/webhooks/cloudconvert',

  // Meshy Design Studio CAD task webhooks
  '/api/webhooks/meshy',

  // Public marketing 3D assets (contact hero, work globe scene, etc.)
  '/assets/glb',
  '/assets/scenes',
  '/assets/marketing',

  // MeauxChess public room client (ES module + Three.js chunks; no session required)
  '/static/dashboard/app/games-room.js',
  '/static/dashboard/app/chessSquares.js',
  '/static/dashboard/app/glbAssets.js',
  '/static/dashboard/app/vendor-three.js',

  // AgentSam CMS editor shell (iframe UI; CMS APIs remain session-gated)
  '/static/dashboard/app/cms',

  // MovieMode globe proxy (main worker → moviemode-service)
  '/globe',

  // PWA — must be fetchable without session (manifest, SW, offline shell, icons)
  '/manifest.webmanifest',
  '/sw.js',
  '/push-handler.js',
  '/sw-agent-cache.js',
  '/offline.html',
  '/pwa-build-meta.json',
  '/static/dashboard/manifest.webmanifest',
  '/static/dashboard/app/manifest.webmanifest',
  '/static/dashboard/sw.js',
  '/static/dashboard/app/pwa',
];

/** Workbox chunk when runtime is not inlined (legacy SW installs). */
export function isPublicWorkboxPath(pathname) {
  const base = String(pathname || '').split('/').pop() || '';
  return /^workbox-[a-f0-9]+\.js$/i.test(base);
}

/**
 * Returns true if the given pathname should bypass the front-door session gate.
 * @param {string} pathname — normalized path (no trailing slash, lowercase)
 */
export function isPublicOAuthPath(pathname) {
  const p = String(pathname || '/').replace(/\/$/, '') || '/';
  const pl = p.toLowerCase();
  if (isPublicWorkboxPath(pl)) return true;
  return PUBLIC_OAUTH_PATHS.some((pub) => {
    const pubL = pub.toLowerCase();
    return pl === pubL || pl.startsWith(`${pubL}/`);
  });
}

/** Synthetic request context for public/unauthenticated routes. */
export function publicOAuthRequestContext() {
  return { identity: null, auth: null, publicRoute: true, error: 'unauthenticated' };
}

/**
 * Routes that authenticate with INTERNAL_API_SECRET / bridge / ingest — not browser session.
 * Bypass resolveRequestContext(required:true); each handler enforces its own secret gate.
 */
export function isAutomationApiPath(pathname, method = 'GET') {
  const p = String(pathname || '/').replace(/\/$/, '') || '/';
  const m = String(method || 'GET').toUpperCase();
  if (p.startsWith('/api/internal/')) return true;
  if (p === '/api/email/send' && m === 'POST') return true;
  if (p === '/api/push/notify' && m === 'POST') return true;
  // AGENT_SESSION_MINT_SECRET bearer — must bypass session gate (handler verifies mint secret).
  if (p === '/api/auth/agent-session/mint' && m === 'POST') return true;
  if (p === '/api/sdk/auth/start' && m === 'POST') return true;
  if (p === '/api/sdk/auth/exchange' && m === 'POST') return true;
  if (p === '/api/sdk/auth/authorize' && m === 'GET') return true;
  if (p === '/api/test/code-execution-e2e' && m === 'POST') return true;
  return false;
}
