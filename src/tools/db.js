/**
 * Tool: Database (db)
 * D1 execution: d1_query uses shared read-only gate; d1_write stays approval-gated upstream.
 */

import { d1_query as d1QueryCore } from '../core/d1.js';
import { assertD1ReadOnlySelect } from '../core/d1-read-validator.js';
import { recordMcpToolExecution } from '../core/mcp-tool-execution.js';
import { resolveCanonicalUserId } from '../api/auth.js';

async function logPolicyBlock(env, fields) {
  if (!env?.DB) return;
  const tenantId = fields.tenant_id != null ? String(fields.tenant_id) : 'system';
  let userId = fields.user_id ?? null;
  if (userId) {
    userId = await resolveCanonicalUserId(String(userId).trim(), env);
  }
  const sessionId = fields.session_id ?? null;
  const workspaceId = fields.workspace_id != null ? String(fields.workspace_id) : null;
  const sqlSnippet = String(fields.sql || '').slice(0, 2000);
  const err = String(fields.error || 'policy_block');
  const inputSum = JSON.stringify({ sql: sqlSnippet }).slice(0, 200);
  void recordMcpToolExecution(env, {
    tenant_id: tenantId,
    workspace_id: workspaceId,
    session_id: sessionId,
    tool_name: 'd1_query',
    input_json: JSON.stringify({ sql: sqlSnippet }),
    success: false,
    error_message: err,
    duration_ms: 0,
    user_id: userId,
    status: 'error',
  }).catch(() => {});
  void env.DB
    .prepare(
      `INSERT INTO agentsam_tool_call_log
       (tenant_id, session_id, tool_name, status, duration_ms, cost_usd, input_tokens, output_tokens, user_id, workspace_id, error_message, input_summary)
       VALUES (?, ?, 'd1_query', 'error', 0, 0, 0, 0, ?, ?, ?, ?)`,
    )
    .bind(tenantId, sessionId, userId, workspaceId, err, inputSum)
    .run()
    .catch(() => {});
}

export const handlers = {
  /**
   * d1_query: read-only SELECT / WITH via src/core/d1.js
   */
  async d1_query({ sql, params = [], tenant_id, user_id, workspace_id, session_id }, env) {
    if (!env.DB) return { error: 'D1 binding (env.DB) not configured' };
    if (!sql) return { error: 'SQL query required' };
    if (user_id && (!workspace_id || String(workspace_id).trim() === '' || String(workspace_id).trim() === '__tenant__')) {
      return { error: 'WORKSPACE_CONTEXT_MISSING' };
    }

    const gate = assertD1ReadOnlySelect(sql);
    if (!gate.ok) {
      await logPolicyBlock(env, {
        sql,
        error: gate.error || 'policy_block',
        tenant_id: tenant_id ?? null,
        user_id: user_id ?? null,
        workspace_id: workspace_id ?? null,
        session_id: session_id ?? null,
      });
      return {
        error: `${gate.error} For mutations, use d1_write after dashboard approval.`,
      };
    }

    try {
      const rows = await d1QueryCore({ sql, params }, env);
      return { success: true, results: rows || [], meta: {} };
    } catch (e) {
      return { error: `D1 Query Failed: ${e.message}` };
    }
  },

  /**
   * d1_write: INSERT/UPDATE/DELETE with safety checks.
   */
  async d1_write({ sql, params = [] }, env) {
    if (!env.DB) return { error: 'D1 binding (env.DB) not configured' };
    try {
      const res = await env.DB.prepare(sql).bind(...params).run();
      return { success: true, meta: res.meta };
    } catch (e) {
      return { error: `D1 Write Failed: ${e.message}` };
    }
  },

  /**
   * d1_batch_write: Atomic multi-statement execution.
   */
  async d1_batch_write({ queries }, env) {
    if (!env.DB) return { error: 'D1 binding (env.DB) not configured' };
    try {
      const statements = queries.map((q) => env.DB.prepare(q.sql).bind(...(q.params || [])));
      const results = await env.DB.batch(statements);
      return { success: true, results };
    } catch (e) {
      return { error: `D1 Batch Write Failed: ${e.message}` };
    }
  },
};
