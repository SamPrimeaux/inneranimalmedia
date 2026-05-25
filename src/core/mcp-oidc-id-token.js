/**
 * OIDC id_token (HS256) for IAM MCP OAuth issuer.
 * Uses TOKEN_SIGNING_KEY — same platform secret as MCP bearer HMAC (not per-user).
 */

function b64urlEncodeJson(obj) {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64urlEncodeBytes(bytes) {
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/**
 * @param {any} env
 * @param {Record<string, unknown>} claims
 * @param {number} ttlSeconds
 */
export async function signIamOidcIdToken(env, claims, ttlSeconds = 3600) {
  const key = typeof env?.TOKEN_SIGNING_KEY === 'string' ? env.TOKEN_SIGNING_KEY.trim() : '';
  if (!key) throw new Error('TOKEN_SIGNING_KEY not set');

  const now = Math.floor(Date.now() / 1000);
  const ttl = Number(ttlSeconds) > 0 ? Number(ttlSeconds) : 3600;
  const payload = { iat: now, exp: now + ttl, ...claims };
  const header = { alg: 'HS256', typ: 'JWT' };

  const segments = `${b64urlEncodeJson(header)}.${b64urlEncodeJson(payload)}`;
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(segments));
  return `${segments}.${b64urlEncodeBytes(new Uint8Array(sig))}`;
}

/**
 * Build OIDC id_token claims for MCP OAuth token response.
 * @param {object} input
 */
export function buildIamMcpIdTokenClaims(input) {
  const {
    issuer,
    userId,
    email,
    name,
    clientId,
    audience,
    authTime,
    nonce,
  } = input;
  const claims = {
    iss: String(issuer || '').trim(),
    sub: String(userId || '').trim(),
    aud: String(clientId || '').trim(),
    azp: String(clientId || '').trim(),
  };
  if (audience) claims.resource = String(audience);
  if (email) claims.email = String(email);
  if (name) claims.name = String(name);
  if (authTime) claims.auth_time = Number(authTime);
  if (nonce) claims.nonce = String(nonce);
  return claims;
}
