/**
 * Persist chat SSE runs to agentsam_agent_run (replaces routing_decisions writes).
 * Uses PRAGMA table_info for forward-compatible inserts.
 */

import { pragmaTableInfo } from './retention.js';

/**
 * @param {any} env
 * @param {any} ctx
 * @param {{
 *   userId: string,
 *   tenantId: string | null,
 *   workspaceId: string,
 *   conversationId: string | null,
 *   routingArmId: string | null,
 *   modelKey: string | null,
 *   taskType: string,
 *   success: boolean,
 *   inputTokens: number,
 *   outputTokens: number,
 *   costUsd: number,
 *   durationMs: number,
 *   errorMessage: string | null,
 * }} p
 */
export function scheduleAgentsamChatAgentRunInsert(env, ctx, p) {
  if (!env?.DB || !ctx?.waitUntil) return;
  const uid = p.userId != null ? String(p.userId).trim() : '';
  const ws = p.workspaceId != null ? String(p.workspaceId).trim() : '';
  if (!uid || !ws) return;

  ctx.waitUntil(
    (async () => {
      const cols = await pragmaTableInfo(env.DB, 'agentsam_agent_run');
      if (!cols.size) return;

      const id = `arun_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      const parts = [];
      const binds = [];
      const add = (name, val) => {
        if (!cols.has(name)) return;
        parts.push(name);
        binds.push(val);
      };

      add('id', id);
      add('user_id', uid);
      add('tenant_id', p.tenantId != null ? String(p.tenantId).trim() : null);
      add('workspace_id', ws);
      add('conversation_id', p.conversationId != null ? String(p.conversationId).slice(0, 200) : null);
      add('routing_arm_id', p.routingArmId != null ? String(p.routingArmId).slice(0, 120) : null);
      add('trigger', 'chat_sse');
      add('status', p.success ? 'completed' : 'failed');
      add('ai_model_ref', p.modelKey != null ? String(p.modelKey).slice(0, 200) : null);
      add('model_id', p.modelKey != null ? String(p.modelKey).slice(0, 200) : null);
      add('input_tokens', Math.max(0, Math.floor(Number(p.inputTokens) || 0)));
      add('output_tokens', Math.max(0, Math.floor(Number(p.outputTokens) || 0)));
      add('cost_usd', Number(p.costUsd) || 0);
      add('error_message', p.errorMessage != null ? String(p.errorMessage).slice(0, 8000) : null);

      const dur = Math.max(0, Math.floor(Number(p.durationMs) || 0));
      const isoNow = new Date().toISOString();
      const isoStart = new Date(Date.now() - dur).toISOString();
      if (cols.has('started_at')) {
        parts.push('started_at');
        binds.push(isoStart);
      }
      if (cols.has('completed_at')) {
        parts.push('completed_at');
        binds.push(isoNow);
      }
      if (cols.has('created_at')) {
        parts.push('created_at');
        binds.push(isoNow);
      }

      if (parts.length < 3) return;

      try {
        await env.DB.prepare(
          `INSERT INTO agentsam_agent_run (${parts.join(', ')}) VALUES (${parts.map(() => '?').join(', ')})`,
        )
          .bind(...binds)
          .run();
      } catch (e) {
        console.warn('[agentsam_agent_run] chat insert', e?.message ?? e);
      }
    })(),
  );
}
