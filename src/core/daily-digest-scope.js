/**
 * Per-recipient isolation for daily memory / focus emails.
 * Superadmin operators get IAM-wide context; everyone else is tenant + workspace scoped only.
 */

import { isSuperadminSessionUserKey } from './auth.js';
import { resolveFirstMembershipWorkspaceId } from './membership.js';

/**
 * @typedef {Object} DailyDigestScope
 * @property {string} userId
 * @property {string|null} email
 * @property {string|null} tenantId
 * @property {string[]} workspaceIds
 * @property {boolean} isPlatformOperator
 */

/**
 * Resolve digest boundaries for one recipient. Never infer cross-tenant access here.
 * @param {*} env
 * @param {{ userId?: string|null, email?: string|null }} owner
 * @returns {Promise<DailyDigestScope>}
 */
export async function resolveDailyDigestScope(env, owner) {
  const userId = String(owner?.userId || '').trim();
  if (!userId || !env?.DB) {
    return { userId: '', email: null, tenantId: null, workspaceIds: [], isPlatformOperator: false };
  }

  const isPlatformOperator = await isSuperadminSessionUserKey(env, userId);

  const userRow = await env.DB.prepare(
    `SELECT email,
            COALESCE(NULLIF(trim(active_tenant_id), ''), NULLIF(trim(tenant_id), '')) AS tenant_id
     FROM auth_users WHERE id = ? LIMIT 1`,
  ).bind(userId).first().catch(() => null);

  const tenantId = userRow?.tenant_id ? String(userRow.tenant_id).trim() : null;
  const email = userRow?.email ? String(userRow.email).trim().toLowerCase() : null;

  const { results: memberRows } = await env.DB.prepare(
    `SELECT workspace_id FROM memberships WHERE account_id = ? ORDER BY joined_at ASC`,
  ).bind(userId).all().catch(() => ({ results: [] }));

  const workspaceIds = [...new Set(
    (memberRows || []).map((r) => String(r.workspace_id || '').trim()).filter(Boolean),
  )];

  if (!workspaceIds.length) {
    const fallbackWs = await resolveFirstMembershipWorkspaceId(env, userId);
    if (fallbackWs) workspaceIds.push(fallbackWs);
  }

  if (!workspaceIds.length && tenantId) {
    const { results: wsRows } = await env.DB.prepare(
      `SELECT id FROM agentsam_workspace
       WHERE tenant_id = ? AND COALESCE(is_active, 1) = 1
       ORDER BY updated_at DESC LIMIT 3`,
    ).bind(tenantId).all().catch(() => ({ results: [] }));
    for (const row of wsRows || []) {
      const wid = String(row.id || '').trim();
      if (wid) workspaceIds.push(wid);
    }
  }

  if (isPlatformOperator && !workspaceIds.includes('ws_inneranimalmedia')) {
    workspaceIds.unshift('ws_inneranimalmedia');
  }

  return { userId, email, tenantId, workspaceIds, isPlatformOperator };
}

/**
 * @param {string[]} workspaceIds
 * @param {string} [column]
 */
export function workspaceIdInSql(workspaceIds, column = 'workspace_id') {
  const ids = (workspaceIds || []).map((x) => String(x || '').trim()).filter(Boolean);
  if (!ids.length) return { clause: '1=0', binds: [] };
  return { clause: `${column} IN (${ids.map(() => '?').join(',')})`, binds: ids };
}

const EMPTY_ALL = { results: [] };

/**
 * Context JSON fed to synthesis — platform operators get full IAM delta; collaborators get workspace-only fields.
 * @param {object} ctxData
 * @param {DailyDigestScope} scope
 */
export function digestContextJson(ctxData, scope) {
  if (scope?.isPlatformOperator) {
    return JSON.stringify({
      digestMode: 'platform_operator',
      platform: ctxData.platformCtx || {},
      activeBlockers: ctxData.activeBlockers || [],
      agentCompletion: ctxData.agentCompletion || {},
      recentRuns: ctxData.recentRuns || {},
      escalationsRecent: ctxData.escalationsRecent?.results || [],
      memory: ctxData.memoryRows?.results || [],
      clients: ctxData.clientCtxRows?.results || [],
      usageToday: ctxData.usageToday || {},
      usage7d: ctxData.usage7d || {},
      deploys24h: ctxData.deploys24h || {},
      deploys7d: ctxData.deploys7d || {},
      cronHealth: ctxData.cronHealth?.results || [],
      errors24h: ctxData.errors24h?.results || [],
      guardrails24h: ctxData.guardrails24h?.results || [],
      openTodosByProject: ctxData.openTodosByProject?.results || [],
      chronicBlockers: ctxData.chronicBlockers?.results || [],
      calendarUpcoming: ctxData.calendarUpcoming?.results || [],
      clientRevenue: ctxData.clientRevenue?.results || [],
      founderToday: ctxData.founderToday || {},
      founderMetricsRecent: ctxData.founderMetricsRecent?.results || [],
      kpiSnapshot: ctxData.kpiSnapshot?.results || [],
      velocityRecent: ctxData.velocityRecent?.results || [],
      trackedTimeToday: ctxData.trackedTimeToday || {},
      mcpActivity: ctxData.mcpActivity?.results || [],
      gitLog: ctxData.gitLog || '',
    });
  }

  return JSON.stringify({
    digestMode: 'workspace',
    tenantId: scope?.tenantId || null,
    workspaceIds: scope?.workspaceIds || [],
    memory: ctxData.memoryRows?.results || [],
    workspaceProjects: ctxData.clientCtxRows?.results || [],
    activeBlockers: ctxData.activeBlockers || [],
    agentCompletion: ctxData.agentCompletion || {},
    escalationsRecent: ctxData.escalationsRecent?.results || [],
    planTasks: ctxData.planTasks?.results || [],
    openTodosByProject: ctxData.openTodosByProject?.results || [],
    chronicBlockers: ctxData.chronicBlockers?.results || [],
    calendarUpcoming: ctxData.calendarUpcoming?.results || [],
    taskActivityRecent: ctxData.taskActivityRecent?.results || [],
    trackedTimeToday: ctxData.trackedTimeToday || {},
    recentRuns: ctxData.recentRuns || {},
    mcpActivity: ctxData.mcpActivity?.results || [],
    usageToday: ctxData.usageToday || {},
    usage7d: ctxData.usage7d || {},
  });
}

export { EMPTY_ALL };
