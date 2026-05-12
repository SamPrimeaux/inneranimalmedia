/**
 * Persist chat SSE runs to agentsam_agent_run (replaces routing_decisions writes).
 * Uses PRAGMA table_info for forward-compatible inserts/updates.
 */

import { estimateCostUsdFromCatalog } from './model-catalog-cost.js';
import { pragmaTableInfo } from './retention.js';

export function newChatAgentRunId() {
  return `arun_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

/**
 * Insert `status = running` for POST /api/agent/chat traceability; finalized via
 * {@link scheduleAgentsamChatAgentRunInsert} with the same `runId`.
 *
 * @param {any} env
 * @param {any} ctx
 * @param {{
 *   runId: string,
 *   userId: string,
 *   tenantId: string | null,
 *   workspaceId: string,
 *   conversationId: string | null,
 *   routingArmId: string | null,
 *   modelKey: string | null,
 *   agentId?: string | null,
 *   personUuid?: string | null,
 *   commandId?: string | null,
 *   workSessionId?: string | null,
 * }} p
 */
export function scheduleAgentsamChatAgentRunStart(env, ctx, p) {
  if (!env?.DB || !ctx?.waitUntil) return;
  const uid = p.userId != null ? String(p.userId).trim() : '';
  const ws = p.workspaceId != null ? String(p.workspaceId).trim() : '';
  const rid = p.runId != null ? String(p.runId).trim() : '';
  if (!uid || !ws || !rid) return;

  ctx.waitUntil(
    (async () => {
      const cols = await pragmaTableInfo(env.DB, 'agentsam_agent_run');
      if (!cols.size) return;

      const parts = [];
      const binds = [];
      const add = (name, val) => {
        if (!cols.has(name)) return;
        parts.push(name);
        binds.push(val);
      };

      add('id', rid);
      add('user_id', uid);
      add('tenant_id', p.tenantId != null ? String(p.tenantId).trim() : null);
      add('workspace_id', ws);
      add('conversation_id', p.conversationId != null ? String(p.conversationId).slice(0, 200) : null);
      add('routing_arm_id', p.routingArmId != null ? String(p.routingArmId).slice(0, 120) : null);
      add('trigger', 'chat_sse');
      add('status', 'running');
      add('ai_model_ref', p.modelKey != null ? String(p.modelKey).slice(0, 200) : null);
      add('model_id', p.modelKey != null ? String(p.modelKey).slice(0, 200) : null);
      add('input_tokens', 0);
      add('output_tokens', 0);
      add('cost_usd', 0);
      add('agent_id', p.agentId != null ? String(p.agentId).trim().slice(0, 200) : null);
      add('person_uuid', p.personUuid != null ? String(p.personUuid).trim().slice(0, 120) : null);
      add('command_id', p.commandId != null ? String(p.commandId).trim().slice(0, 200) : null);
      add('work_session_id', p.workSessionId != null ? String(p.workSessionId).slice(0, 200) : null);

      const isoNow = new Date().toISOString();
      if (cols.has('started_at')) {
        parts.push('started_at');
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
        console.warn('[agentsam_agent_run] chat start insert', e?.message ?? e);
      }
    })(),
  );
}

/**
 * Finalize a row created by {@link scheduleAgentsamChatAgentRunStart} (`runId`), or legacy one-shot INSERT when `runId` is omitted.
 *
 * @param {any} env
 * @param {any} ctx
 * @param {{
 *   runId?: string | null,
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
 *   workflowRunId?: string | null,
 *   chainRootId?: string | null,
 *   timedOut?: boolean,
 * }} p
 */
export function scheduleAgentsamChatAgentRunInsert(env, ctx, p) {
  if (!env?.DB || !ctx?.waitUntil) return;
  const uid = p.userId != null ? String(p.userId).trim() : '';
  const ws = p.workspaceId != null ? String(p.workspaceId).trim() : '';
  if (!uid || !ws) return;

  const runId = p.runId != null && String(p.runId).trim() !== '' ? String(p.runId).trim() : '';

  ctx.waitUntil(
    (async () => {
      const cols = await pragmaTableInfo(env.DB, 'agentsam_agent_run');
      if (!cols.size) return;

      const tin = Math.max(0, Math.floor(Number(p.inputTokens) || 0));
      const tout = Math.max(0, Math.floor(Number(p.outputTokens) || 0));
      let costUsd = Number(p.costUsd) || 0;
      const mk = p.modelKey != null ? String(p.modelKey).slice(0, 200) : null;
      if (!costUsd && (tin > 0 || tout > 0) && mk) {
        costUsd = await estimateCostUsdFromCatalog(env.DB, mk, tin, tout);
      }

      if (runId) {
        const sets = [];
        const binds = [];
        const pushSet = (name, val) => {
          if (!cols.has(name)) return;
          sets.push(`${name} = ?`);
          binds.push(val);
        };
        pushSet('status', p.success ? 'completed' : 'failed');
        pushSet('ai_model_ref', mk);
        pushSet('model_id', mk);
        pushSet('input_tokens', tin);
        pushSet('output_tokens', tout);
        pushSet('cost_usd', costUsd);
        pushSet('error_message', p.errorMessage != null ? String(p.errorMessage).slice(0, 8000) : null);
        pushSet('routing_arm_id', p.routingArmId != null ? String(p.routingArmId).slice(0, 120) : null);
        pushSet('conversation_id', p.conversationId != null ? String(p.conversationId).slice(0, 200) : null);
        if (p.workflowRunId != null && String(p.workflowRunId).trim() !== '') {
          pushSet('workflow_run_id', String(p.workflowRunId).trim().slice(0, 120));
        }
        if (p.chainRootId != null && String(p.chainRootId).trim() !== '') {
          pushSet('chain_root_id', String(p.chainRootId).trim().slice(0, 120));
        }
        if (p.timedOut === true && cols.has('timed_out')) {
          pushSet('timed_out', 1);
        }
        const isoNow = new Date().toISOString();
        if (cols.has('completed_at')) {
          sets.push('completed_at = ?');
          binds.push(isoNow);
        }
        if (!sets.length) return;
        binds.push(runId);
        try {
          await env.DB.prepare(`UPDATE agentsam_agent_run SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
        } catch (e) {
          console.warn('[agentsam_agent_run] chat finalize update', e?.message ?? e);
        }
        return;
      }

      const id = newChatAgentRunId();
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
      add('ai_model_ref', mk);
      add('model_id', mk);
      add('input_tokens', tin);
      add('output_tokens', tout);
      add('cost_usd', costUsd);
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
