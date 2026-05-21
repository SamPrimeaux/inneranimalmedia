/**
 * GET /api/internal/health-kv-dirty — read overview bundle KV dirty flags and ages.
 * Auth: INTERNAL_API_SECRET (Bearer or X-Internal-Secret), same as summarize-backfill.
 */
import { jsonResponse, verifyInternalApiSecret } from '../core/auth.js';
import {
  OVERVIEW_DIRTY_SECTIONS,
  readOverviewBundleDirtyFlag,
} from '../core/overview-bundle-kv.js';

const DEFAULT_TENANT_ID = 'tenant_sam_primeaux';

/**
 * @param {Request} request
 * @param {any} env
 */
export async function handleHealthKvDirty(request, env) {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  if (!verifyInternalApiSecret(request, env)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const url = new URL(request.url);
  const tenantId =
    url.searchParams.get('tenant_id')?.trim() ||
    url.searchParams.get('tenantId')?.trim() ||
    DEFAULT_TENANT_ID;

  /** @type {Record<string, { set: boolean, age_seconds?: number }>} */
  const dirty_flags = {};

  for (const section of OVERVIEW_DIRTY_SECTIONS) {
    dirty_flags[section] = await readOverviewBundleDirtyFlag(env, section, tenantId);
  }

  return jsonResponse({
    ok: true,
    tenant_id: tenantId,
    dirty_flags,
  });
}
