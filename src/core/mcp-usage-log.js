/**
 * Explicit mcp_usage_log writer — never rely on tenant_id DEFAULT 'tenant_sam_primeaux'.
 */
import { pragmaTableInfo } from './retention.js';

/**
 * Upsert daily MCP usage rollup for a tool invocation.
 * Requires tenant_id, workspace_id, and user_id from session/actor context.
 *
 * @param {any} env
 * @param {{
 *   tenantId: string,
 *   workspaceId: string,
 *   userId?: string|null,
 *   toolName: string,
 *   success?: boolean,
 *   serviceId?: string|null,
 * }} fields
 */
export async function upsertMcpUsageLog(env, fields) {
  if (!env?.DB) return false;

  const tenantId = fields.tenantId != null ? String(fields.tenantId).trim() : '';
  const workspaceId = fields.workspaceId != null ? String(fields.workspaceId).trim() : '';
  const userId = fields.userId != null ? String(fields.userId).trim() : '';
  const toolName = fields.toolName != null ? String(fields.toolName).trim() : '';

  if (!tenantId || !workspaceId || !userId || !toolName) {
    console.warn(
      '[mcp_usage_log] skipped — missing tenant_id, workspace_id, user_id, or tool_name',
    );
    return false;
  }

  const cols = await pragmaTableInfo(env.DB, 'mcp_usage_log');
  if (!cols.has('tenant_id') || !cols.has('tool_name') || !cols.has('date')) {
    return false;
  }

  const ok = fields.success !== false;
  const id = `mul_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const successCount = ok ? 1 : 0;
  const failureCount = ok ? 0 : 1;
  const nowSec = Math.floor(Date.now() / 1000);

  const names = ['id', 'tenant_id', 'tool_name', 'date'];
  const vals = ['?', '?', '?', "date('now')"];
  const binds = [id, tenantId, toolName.slice(0, 500)];

  if (cols.has('workspace_id')) {
    names.push('workspace_id');
    vals.push('?');
    binds.push(workspaceId);
  }
  if (cols.has('user_id')) {
    names.push('user_id');
    vals.push('?');
    binds.push(userId);
  }
  if (cols.has('service_id')) {
    names.push('service_id');
    vals.push('?');
    binds.push(String(fields.serviceId || 'inneranimalmedia-mcp').slice(0, 200));
  }
  if (cols.has('call_count')) {
    names.push('call_count');
    vals.push('?');
    binds.push(1);
  }
  if (cols.has('success_count')) {
    names.push('success_count');
    vals.push('?');
    binds.push(successCount);
  }
  if (cols.has('failure_count')) {
    names.push('failure_count');
    vals.push('?');
    binds.push(failureCount);
  }
  if (cols.has('tenant_audit_flag')) {
    names.push('tenant_audit_flag');
    vals.push('?');
    binds.push(0);
  }
  if (cols.has('requested_at')) {
    names.push('requested_at');
    vals.push('?');
    binds.push(nowSec);
  }
  if (cols.has('created_at')) {
    names.push('created_at');
    vals.push('?');
    binds.push(nowSec);
  }

  const conflictSets = [];
  if (cols.has('call_count')) conflictSets.push('call_count = call_count + 1');
  if (cols.has('success_count')) {
    conflictSets.push('success_count = success_count + excluded.success_count');
  }
  if (cols.has('failure_count')) {
    conflictSets.push('failure_count = failure_count + excluded.failure_count');
  }
  if (cols.has('workspace_id')) conflictSets.push('workspace_id = excluded.workspace_id');
  if (cols.has('user_id')) conflictSets.push('user_id = excluded.user_id');
  if (cols.has('requested_at')) conflictSets.push('requested_at = excluded.requested_at');

  try {
    if (conflictSets.length) {
      await env.DB.prepare(
        `INSERT INTO mcp_usage_log (${names.join(', ')})
         VALUES (${vals.join(', ')})
         ON CONFLICT(tenant_id, tool_name, date) DO UPDATE SET ${conflictSets.join(', ')}`,
      )
        .bind(...binds)
        .run();
    } else {
      await env.DB.prepare(
        `INSERT INTO mcp_usage_log (${names.join(', ')}) VALUES (${vals.join(', ')})`,
      )
        .bind(...binds)
        .run();
    }
    return true;
  } catch (e) {
    console.warn('[mcp_usage_log] upsert failed', e?.message ?? e);
    return false;
  }
}

/**
 * @param {any} env
 * @param {any} ctx
 * @param {Parameters<typeof upsertMcpUsageLog>[1]} fields
 */
export function scheduleUpsertMcpUsageLog(env, ctx, fields) {
  const p = upsertMcpUsageLog(env, fields).catch((e) =>
    console.warn('[mcp_usage_log] schedule', e?.message ?? e),
  );
  if (ctx?.waitUntil) ctx.waitUntil(p);
  else void p;
}
