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
  '/learn',
  '/start',
  '/auth/reset',

  // Public CMS section reads (marketing page hydration)
  '/api/public/cms',

  // Public contact proposal (Resend)
  '/api/contact',

  // Cloudflare Stream VOD + Live Input webhooks (unsigned gate bypass)
  '/api/webhooks/stream/vod',
  '/api/webhooks/stream/live',

  // CloudConvert job webhooks
  '/api/webhooks/cloudconvert',

  // Public marketing 3D assets (contact hero, etc.)
  '/assets/glb',
];

/**
 * Returns true if the given pathname should bypass the front-door session gate.
 * @param {string} pathname — normalized path (no trailing slash, lowercase)
 */
export function isPublicOAuthPath(pathname) {
  const p = String(pathname || '/').replace(/\/$/, '') || '/';
  return PUBLIC_OAUTH_PATHS.some((pub) => p === pub || p.startsWith(`${pub}/`));
}

/** Synthetic request context for public/unauthenticated routes. */
export function publicOAuthRequestContext() {
  return { identity: null, auth: null, publicRoute: true, error: 'unauthenticated' };
}
