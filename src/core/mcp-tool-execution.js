/**
 * Unified MCP / builtin tool execution ledger (agentsam_mcp_tool_execution).
 * Inserts align with production D1 columns (inneranimalmedia-business).
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
  const tenantId =
    fields.tenant_id != null && String(fields.tenant_id).trim() !== ''
      ? String(fields.tenant_id).trim()
      : 'system';
  const workspaceId =
    fields.workspace_id != null && String(fields.workspace_id).trim() !== ''
      ? String(fields.workspace_id).trim()
      : null;
  const userId =
    fields.user_id != null && String(fields.user_id).trim() !== ''
      ? String(fields.user_id).trim()
      : fields.invoked_by != null && String(fields.invoked_by).trim() !== ''
        ? String(fields.invoked_by).trim()
        : null;
  const sessionId = fields.session_id ?? fields.sessionId ?? null;
  const toolId =
    fields.tool_id != null && String(fields.tool_id).trim() !== ''
      ? String(fields.tool_id).trim()
      : null;
  const toolName = String(fields.tool_name || fields.toolName || 'unknown').slice(0, 500);
  const inputJson =
    fields.input_json != null
      ? String(fields.input_json)
      : JSON.stringify(fields.input ?? fields.toolArgs ?? {});
  const outputJson =
    fields.output_json != null
      ? String(fields.output_json)
      : fields.output != null
        ? String(fields.output)
        : '';
  const success =
    fields.success !== undefined
      ? !!fields.success
      : !fields.error_message && String(fields.status || '').toLowerCase() !== 'error';
  const successInt = success ? 1 : 0;
  const err = fields.error_message != null ? String(fields.error_message).slice(0, 8000) : null;
  const costUsd = Number(fields.cost_usd ?? fields.costUsd ?? 0) || 0;
  const inTok = Math.max(0, Math.floor(Number(fields.input_tokens ?? fields.inputTokens ?? 0) || 0));
  const outTok = Math.max(0, Math.floor(Number(fields.output_tokens ?? fields.outputTokens ?? 0) || 0));
  const dur = Math.max(0, Math.floor(Number(fields.duration_ms ?? fields.durationMs ?? 0) || 0));
  const retry = Math.max(0, Math.floor(Number(fields.retry_count ?? fields.retryCount ?? 0) || 0));
  const reqAppr = Number(fields.requires_approval ?? 0) === 1 ? 1 : 0;

  const bindProd = [
    id,
    toolId,
    toolName,
    tenantId,
    workspaceId,
    userId,
    sessionId,
    inputJson.slice(0, 100000),
    outputJson.slice(0, 50000),
    successInt,
    err,
    dur,
    costUsd,
    inTok,
    outTok,
    retry,
    reqAppr,
  ];

  try {
    await env.DB
      .prepare(
        `INSERT INTO agentsam_mcp_tool_execution (
          id, tool_id, tool_name, tenant_id, workspace_id, user_id, session_id,
          input_json, output_json, success, error_message, duration_ms, cost_usd,
          input_tokens, output_tokens, retry_count, requires_approval, created_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now'))`,
      )
      .bind(...bindProd)
      .run();
    return id;
  } catch (e) {
    console.warn('[recordMcpToolExecution] prod insert failed', e?.message ?? e);
  }

  try {
    const nowIso = new Date().toISOString();
    const st = success ? 'completed' : fields.approval_gate_id ? 'awaiting_approval' : 'error';
    const approvalGateId = fields.approval_gate_id ?? fields.approvalGateId ?? null;
    const invokedBy = userId || 'iam_agent';
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
        String(fields.tool_category || fields.toolCategory || 'builtin').slice(0, 120),
        inputJson.slice(0, 100000),
        outputJson.slice(0, 50000),
        st,
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
    return id;
  } catch (e2) {
    console.warn('[recordMcpToolExecution] legacy insert failed', e2?.message ?? e2);
    return null;
  }
}
