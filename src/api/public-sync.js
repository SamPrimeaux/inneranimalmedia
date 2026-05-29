/**
 * Owner/service-only public.iam_* sync — no anon writes.
 */
import { jsonResponse } from '../core/responses.js';
import {
  authUserFromRequest,
  authUserIsSuperadmin,
  isIngestSecretAuthorized,
} from '../core/auth.js';
import { runPublicIamSync } from '../core/public-iam-sync.js';

/**
 * POST /api/public/sync — project curated rows to public.iam_* (Hyperdrive service role).
 *
 * @param {Request} request
 * @param {any} env
 */
export async function handlePublicSyncApi(request, env) {
  const method = (request.method || 'GET').toUpperCase();
  if (method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  const ingestOk = isIngestSecretAuthorized(request, env);
  const authUser = ingestOk ? null : await authUserFromRequest(request, env);
  if (!ingestOk && !authUser) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }
  if (!ingestOk && !authUserIsSuperadmin(authUser)) {
    return jsonResponse({ error: 'forbidden', reason: 'owner_or_ingest_secret_required' }, 403);
  }

  const body = await request.json().catch(() => ({}));
  const tables = Array.isArray(body.tables) ? body.tables.map(String) : null;

  const out = await runPublicIamSync(env, { tables });
  return jsonResponse({
    ok: out.ok,
    duration_ms: out.duration_ms,
    results: out.results,
    note: 'Curated projection only — no agentsam runtime leakage.',
  });
}
