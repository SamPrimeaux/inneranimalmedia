/**
 * Structured errors → agentsam_error_log (fire-and-forget).
 */

import { pragmaTableInfo } from './retention.js';
import { scheduleErrorLogEscalation } from './error-log-escalation.js';

/**
 * @param {any} env
 * @param {any} ctx
 * @param {{
 *   workspaceId: string,
 *   tenantId: string,
 *   sessionId?: string | null,
 *   errorCode?: string | null,
 *   errorType: string,
 *   errorMessage: string,
 *   source: string,
 *   sourceId?: string | null,
 *   contextJson?: string | null,
 *   stackTrace?: string | null,
 * }} o
 */
export function scheduleAgentsamErrorLog(env, ctx, o) {
  if (!env?.DB || !ctx?.waitUntil) return;
  const ws = o.workspaceId != null ? String(o.workspaceId).trim() : '';
  const tid = o.tenantId != null ? String(o.tenantId).trim() : '';
  if (!ws || !tid) return;
  const msg = o.errorMessage != null ? String(o.errorMessage).slice(0, 8000) : '';
  if (!msg) return;

  ctx.waitUntil(
    (async () => {
      const cols = await pragmaTableInfo(env.DB, 'agentsam_error_log');
      if (!cols.size) return;
      const id = `aerr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      const parts = [];
      const binds = [];
      const add = (name, val) => {
        if (!cols.has(name)) return;
        parts.push(name);
        binds.push(val);
      };
      add('id', id);
      add('workspace_id', ws);
      add('tenant_id', tid);
      add('session_id', o.sessionId != null ? String(o.sessionId).slice(0, 200) : null);
      add('error_code', o.errorCode != null ? String(o.errorCode).slice(0, 120) : null);
      add('error_type', String(o.errorType || 'unknown').slice(0, 120));
      add('error_message', msg);
      add('source', String(o.source || 'unknown').slice(0, 200));
      add('source_id', o.sourceId != null ? String(o.sourceId).slice(0, 200) : null);
      add('context_json', o.contextJson != null ? String(o.contextJson).slice(0, 50000) : null);
      add('stack_trace', o.stackTrace != null ? String(o.stackTrace).slice(0, 12000) : null);
      add('resolved', 0);
      if (cols.has('created_at')) {
        parts.push('created_at');
        binds.push(Math.floor(Date.now() / 1000));
      }
      if (parts.length < 3) return;
      try {
        await env.DB.prepare(
          `INSERT INTO agentsam_error_log (${parts.join(', ')}) VALUES (${parts.map(() => '?').join(', ')})`,
        )
          .bind(...binds)
          .run();

        scheduleErrorLogEscalation(env, ctx, {
          id,
          tenant_id: tid,
          workspace_id: ws,
          error_type: String(o.errorType || 'unknown').slice(0, 120),
          error_message: msg,
          source_id: o.sourceId != null ? String(o.sourceId).slice(0, 200) : null,
          context_json: o.contextJson != null ? String(o.contextJson).slice(0, 50000) : null,
        });
      } catch (e) {
        console.warn('[agentsam_error_log]', e?.message ?? e);
      }
    })(),
  );
}
