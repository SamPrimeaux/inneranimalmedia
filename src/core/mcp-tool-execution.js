/**
 * Unified MCP / builtin tool execution ledger (agentsam_mcp_tool_execution).
 * Aligns inserts with existing production columns used by src/api/mcp.js and agent approval flow.
 */

function newExecId() {
  return `mtc_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

/**
 * @param {any} env
 * @param {object} fields
 * @returns {Promise<string|null>} execution id
 */
export async function recordMcpToolExecution(env, fields) {
  if (!env?.DB) return null;
  const id = fields.id && String(fields.id).trim() !== '' ? String(fields.id).trim() : newExecId();
  const tenantId = fields.tenant_id != null ? String(fields.tenant_id) : 'system';
  const sessionId = fields.session_id ?? null;
  const toolName = String(fields.tool_name || fields.toolName || 'unknown').slice(0, 500);
  const toolCategory = String(fields.tool_category || fields.toolCategory || 'builtin').slice(0, 120);
  const inputSchema = fields.input_json != null
    ? String(fields.input_json)
    : JSON.stringify(fields.input ?? fields.toolArgs ?? {});
  const output = fields.output_json != null ? String(fields.output_json) : (fields.output != null ? String(fields.output) : '');
  const success = fields.success !== undefined ? !!fields.success : !fields.error_message;
  const status =
    fields.status ||
    (success ? 'completed' : fields.approval_gate_id ? 'awaiting_approval' : 'error');
  const invokedBy = fields.invoked_by ?? fields.user_id ?? fields.userId ?? 'iam_agent';
  const nowIso = new Date().toISOString();
  const err = fields.error_message != null ? String(fields.error_message).slice(0, 8000) : null;
  const costUsd = Number(fields.cost_usd ?? fields.costUsd ?? 0) || 0;
  const inTok = Math.max(0, Math.floor(Number(fields.input_tokens ?? fields.inputTokens ?? 0) || 0));
  const outTok = Math.max(0, Math.floor(Number(fields.output_tokens ?? fields.outputTokens ?? 0) || 0));
  const approvalGateId = fields.approval_gate_id ?? fields.approvalGateId ?? null;

  try {
    await env.DB
      .prepare(
        `INSERT INTO agentsam_mcp_tool_execution
         (id, tenant_id, session_id, tool_name, tool_category, input_schema,
          output, status, approval_gate_id, invoked_by, invoked_at, completed_at,
          created_at, updated_at, error_message, cost_usd, input_tokens, output_tokens)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        id,
        tenantId,
        sessionId,
        toolName,
        toolCategory,
        inputSchema.slice(0, 100000),
        output.slice(0, 50000),
        status,
        approvalGateId,
        String(invokedBy),
        nowIso,
        nowIso,
        nowIso,
        nowIso,
        err,
        costUsd,
        inTok,
        outTok,
      )
      .run();
  } catch (e) {
    console.warn('[recordMcpToolExecution]', e?.message ?? e);
    return null;
  }

  return id;
}
