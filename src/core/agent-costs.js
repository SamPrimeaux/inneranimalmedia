/**
 * agent_costs — cost rows bound to session + optional routing arm (fire-and-forget).
 */

import { pragmaTableInfo } from './retention.js';

/**
 * @param {any} env
 * @param {any} ctx
 * @param {{
 *   workspaceId: string,
 *   tenantId: string,
 *   sessionId?: string | null,
 *   routingArmId?: string | null,
 *   modelUsed: string,
 *   tokensIn?: number,
 *   tokensOut?: number,
 *   costUsd?: number,
 *   taskType?: string,
 *   userId?: string | null,
 *   isStreaming?: boolean,
 *   errorType?: string | null,
 * }} o
 */
export function scheduleInsertAgentCost(env, ctx, o) {
  if (!env?.DB || !ctx?.waitUntil) return;
  const ws = o.workspaceId != null ? String(o.workspaceId).trim() : '';
  const tid = o.tenantId != null ? String(o.tenantId).trim() : '';
  if (!ws || !tid) return;

  ctx.waitUntil(
    (async () => {
      const cols = await pragmaTableInfo(env.DB, 'agent_costs');
      if (!cols.size) return;
      const parts = [];
      const binds = [];
      const add = (name, val) => {
        if (!cols.has(name)) return;
        parts.push(name);
        binds.push(val);
      };

      if (cols.has('model_used')) add('model_used', String(o.modelUsed || 'unknown').slice(0, 500));
      if (cols.has('tokens_in')) add('tokens_in', Math.max(0, Math.floor(Number(o.tokensIn) || 0)));
      if (cols.has('tokens_out')) add('tokens_out', Math.max(0, Math.floor(Number(o.tokensOut) || 0)));
      if (cols.has('cost_usd')) add('cost_usd', Number(o.costUsd) || 0);
      if (cols.has('task_type')) add('task_type', String(o.taskType || 'chat').slice(0, 120));
      if (cols.has('user_id')) add('user_id', o.userId != null ? String(o.userId).slice(0, 120) : null);
      add('workspace_id', ws);
      add('tenant_id', tid);
      add('session_id', o.sessionId != null ? String(o.sessionId).slice(0, 200) : null);
      add('routing_arm_id', o.routingArmId != null ? String(o.routingArmId).slice(0, 120) : null);
      if (cols.has('is_streaming')) add('is_streaming', o.isStreaming ? 1 : 0);
      add('error_type', o.errorType != null ? String(o.errorType).slice(0, 120) : null);
      if (cols.has('created_at')) {
        parts.push('created_at');
        binds.push(new Date().toISOString().replace('T', ' ').slice(0, 19));
      }

      if (parts.length < 2) return;
      try {
        await env.DB.prepare(
          `INSERT INTO agent_costs (${parts.join(', ')}) VALUES (${parts.map(() => '?').join(', ')})`,
        )
          .bind(...binds)
          .run();
      } catch (e) {
        console.warn('[agent_costs]', e?.message ?? e);
      }
    })(),
  );
}
