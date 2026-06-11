/**
 * Public OAuth / discovery routes on inneranimalmedia.com (authorization server).
 * Must bypass required session/auth context at the Worker front door.
 */

export const PUBLIC_OAUTH_PATHS = [
  '/.well-known/oauth-authorization-server',
  '/.well-known/openid-configuration',
  '/.well-known/jwks.json',
  '/api/oauth/authorize',
  '/api/oauth/token',
  '/api/oauth/register',
  '/api/oauth/userinfo',
  '/api/oauth/mcp/consent',
  '/oauth/mcp/consent',
  '/auth/login',
  '/auth/signup',
  '/auth/reset',
  '/api/health',
  '/health',
];

/**
 * @param {string} pathname — normalized path (no trailing slash, lowercase ok)
 */
export function isPublicOAuthPath(pathname) {
  const p = String(pathname || '/').replace(/\/$/, '') || '/';
  return PUBLIC_OAUTH_PATHS.some((pub) => p === pub || p.startsWith(`${pub}/`));
}

/** Synthetic request context for public OAuth/discovery routes (no session required). */
export function publicOAuthRequestContext() {
  return { identity: null, auth: null, publicRoute: true, error: 'unauthenticated' };
}
