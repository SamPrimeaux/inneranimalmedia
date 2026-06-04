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

  const today = new Date().toISOString().slice(0, 10);
  const ok = fields.success !== false;
  const id = `mul_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

  const names = ['id', 'tenant_id', 'tool_name', 'date'];
  const placeholders = ['?', '?', '?', '?'];
  const binds = [id, tenantId, toolName.slice(0, 500), today];

  if (cols.has('workspace_id')) {
    names.push('workspace_id');
    placeholders.push('?');
    binds.push(workspaceId);
  }
  if (cols.has('user_id')) {
    names.push('user_id');
    placeholders.push('?');
    binds.push(userId);
  }
  if (cols.has('service_id') && fields.serviceId) {
    names.push('service_id');
    placeholders.push('?');
    binds.push(String(fields.serviceId).slice(0, 200));
  }
  if (cols.has('call_count')) {
    names.push('call_count');
    placeholders.push('?');
    binds.push(1);
  }
  if (cols.has('success_count')) {
    names.push('success_count');
    placeholders.push('?');
    binds.push(ok ? 1 : 0);
  }
  if (cols.has('failure_count')) {
    names.push('failure_count');
    placeholders.push('?');
    binds.push(ok ? 0 : 1);
  }
  if (cols.has('tenant_audit_flag')) {
    names.push('tenant_audit_flag');
    placeholders.push('?');
    binds.push(0);
  }

  try {
    if (cols.has('call_count')) {
      const conflictSets = ['call_count = call_count + 1'];
      if (cols.has('success_count')) {
        conflictSets.push(`success_count = success_count + ${ok ? 1 : 0}`);
      }
      if (cols.has('failure_count')) {
        conflictSets.push(`failure_count = failure_count + ${ok ? 0 : 1}`);
      }
      if (cols.has('workspace_id')) {
        conflictSets.push('workspace_id = excluded.workspace_id');
      }
      if (cols.has('user_id')) {
        conflictSets.push('user_id = excluded.user_id');
      }
      await env.DB.prepare(
        `INSERT INTO mcp_usage_log (${names.join(', ')})
         VALUES (${placeholders.join(', ')})
         ON CONFLICT(tenant_id, tool_name, date) DO UPDATE SET ${conflictSets.join(', ')}`,
      )
        .bind(...binds)
        .run();
    } else {
      await env.DB.prepare(
        `INSERT INTO mcp_usage_log (${names.join(', ')}) VALUES (${placeholders.join(', ')})`,
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
