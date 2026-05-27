/**
 * POST /api/internal/google/refresh-token — MCP / automation Google OAuth refresh.
 * Auth: INTERNAL_API_SECRET (Bearer or X-Internal-Secret).
 */
import { jsonResponse, verifyInternalApiSecret } from '../core/auth.js';
import { getIntegrationOAuthRow, refreshGoogleToken } from '../core/user-oauth-token.js';

export function isInternalSecretAuthorized(request, env) {
  return verifyInternalApiSecret(request, env);
}

export async function handleGoogleTokenRefresh(env, request) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'invalid json body' }, 400);
  }

  const user_id = body.user_id != null ? String(body.user_id).trim() : '';
  const tenant_id = body.tenant_id != null ? String(body.tenant_id).trim() : '';
  const provider = body.provider != null ? String(body.provider).trim() : 'google_drive';

  if (!user_id || !tenant_id) {
    return jsonResponse({ ok: false, error: 'missing user_id or tenant_id' }, 400);
  }

  const row = await getIntegrationOAuthRow(env, user_id, provider, '');
  if (!row?.refresh_token) {
    return jsonResponse(
      { ok: false, error: 'no refresh token found — reconnect Google Drive in IAM' },
      404,
    );
  }

  if (row.tenant_id != null && String(row.tenant_id).trim() && String(row.tenant_id).trim() !== tenant_id) {
    return jsonResponse({ ok: false, error: 'tenant_id does not match stored OAuth row' }, 403);
  }

  const access_token = await refreshGoogleToken(env, user_id, provider, row.refresh_token, row);
  if (!access_token) {
    return jsonResponse({ ok: false, error: 'google refresh failed' }, 502);
  }

  return jsonResponse({ ok: true, access_token });
}
