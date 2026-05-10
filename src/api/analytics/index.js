import { jsonResponse } from '../../core/auth.js';
import { handleAnalyticsLayout } from './layout.js';
import { handleAnalyticsSourceHealth } from './source-health.js';
import { handleAnalyticsOverview } from './overview.js';
import { handleAnalyticsRag } from './rag.js';
import { handleAnalyticsCodebase } from './codebase.js';

/**
 * /api/analytics/* router.
 *
 * Rules:
 * - Do not create new tables/columns here.
 * - Use cms_* config tables for layout, never for metric values.
 */
export async function handleAnalyticsApi(request, url, env, ctx, authUser, identity) {
  void ctx;
  const pathLower = String(url?.pathname || '').toLowerCase();

  // Keep tenant lookup consistent with other APIs.
  const tenantId =
    (identity && identity.tenantId ? String(identity.tenantId) : null) ||
    (authUser && authUser.tenant_id ? String(authUser.tenant_id) : null) ||
    (env && env.TENANT_ID ? String(env.TENANT_ID) : null) ||
    null;

  const workspaceId =
    (identity && identity.workspaceId ? String(identity.workspaceId) : null) ||
    (authUser && authUser.workspace_id ? String(authUser.workspace_id) : null) ||
    null;

  if (pathLower === '/api/analytics/layout' && request.method === 'GET') {
    return handleAnalyticsLayout(request, url, env, { tenantId, workspaceId });
  }

  if (pathLower === '/api/analytics/source-health' && request.method === 'GET') {
    return handleAnalyticsSourceHealth(request, url, env, { tenantId, workspaceId });
  }

  if (pathLower === '/api/analytics/overview' && request.method === 'GET') {
    return handleAnalyticsOverview(request, url, env, { tenantId, workspaceId });
  }

  if (pathLower === '/api/analytics/rag' && request.method === 'GET') {
    return handleAnalyticsRag(request, url, env, { tenantId, workspaceId });
  }

  if (pathLower === '/api/analytics/codebase' && request.method === 'GET') {
    return handleAnalyticsCodebase(request, url, env, { tenantId, workspaceId });
  }

  // Stub endpoints for now — return standard AnalyticsResponse shape.
  const range =
    (url.searchParams.get('range') || '7d').toLowerCase() === '24h'
      ? '24h'
      : (url.searchParams.get('range') || '7d').toLowerCase() === '30d'
        ? '30d'
        : (url.searchParams.get('range') || '7d').toLowerCase() === 'all'
          ? 'all'
          : '7d';

  return jsonResponse(
    {
      ok: true,
      backend: 'mixed',
      range,
      generated_at: Date.now(),
      summary: {},
      series: [],
      breakdowns: [],
      rows: [],
      warnings: [
        {
          code: 'ANALYTICS_ENDPOINT_NOT_IMPLEMENTED',
          message: `No handler for ${url.pathname} yet. This endpoint is staged for wiring.`,
          backend: 'mixed',
          severity: 'info',
        },
      ],
    },
    200,
  );
}

