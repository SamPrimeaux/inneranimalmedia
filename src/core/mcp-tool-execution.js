/**
 * Unified MCP / builtin tool execution ledger (agentsam_mcp_tool_execution).
 * Inserts align with production D1 columns (inneranimalmedia-business).
 */

async function pragmaTableInfo(db, tableName) {
  if (!db || !tableName) return new Set();
  const safe = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(String(tableName)) ? String(tableName) : '';
  if (!safe) return new Set();
  try {
    const { results } = await db.prepare(`PRAGMA table_info(${safe})`).all();
    return new Set((results || []).map((r) => String(r.name || '').toLowerCase()));
  } catch {
    return new Set();
  }
}

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
  const cols = await pragmaTableInfo(env.DB, 'agentsam_mcp_tool_execution');
  if (!cols.size) return null;

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
  const personUuid =
    fields.person_uuid != null && String(fields.person_uuid).trim() !== ''
      ? String(fields.person_uuid).trim()
      : fields.personUuid != null && String(fields.personUuid).trim() !== ''
        ? String(fields.personUuid).trim()
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

  // Hard rule: authenticated execution rows must have a real workspace_id.
  // '__tenant__' is reserved for true platform/system rows, not user actions.
  if (userId && (!workspaceId || workspaceId === '__tenant__')) {
    throw new Error('WORKSPACE_CONTEXT_MISSING');
  }

  try {
    const insertCols = [
      cols.has('id') && 'id',
      cols.has('tool_id') && 'tool_id',
      cols.has('tool_name') && 'tool_name',
      cols.has('tenant_id') && 'tenant_id',
      cols.has('workspace_id') && 'workspace_id',
      cols.has('user_id') && 'user_id',
      cols.has('person_uuid') && 'person_uuid',
      cols.has('session_id') && 'session_id',
      cols.has('input_json') && 'input_json',
      cols.has('output_json') && 'output_json',
      cols.has('success') && 'success',
      cols.has('error_message') && 'error_message',
      cols.has('duration_ms') && 'duration_ms',
      cols.has('cost_usd') && 'cost_usd',
      cols.has('input_tokens') && 'input_tokens',
      cols.has('output_tokens') && 'output_tokens',
      cols.has('retry_count') && 'retry_count',
      cols.has('requires_approval') && 'requires_approval',
      cols.has('status') && 'status',
      cols.has('created_at') && 'created_at',
    ].filter(Boolean);

    const insertVals = [];
    const binds = [];
    const push = (col, valExpr, bindVal) => {
      insertVals.push(valExpr);
      if (valExpr === '?') binds.push(bindVal);
    };
    for (const c of insertCols) {
      switch (c) {
        case 'id':
          push(c, '?', id);
          break;
        case 'tool_id':
          push(c, '?', toolId);
          break;
        case 'tool_name':
          push(c, '?', toolName);
          break;
        case 'tenant_id':
          push(c, '?', tenantId);
          break;
        case 'workspace_id':
          push(c, '?', workspaceId);
          break;
        case 'user_id':
          push(c, '?', userId);
          break;
        case 'person_uuid':
          push(c, '?', personUuid);
          break;
        case 'session_id':
          push(c, '?', sessionId);
          break;
        case 'input_json':
          push(c, '?', inputJson.slice(0, 100000));
          break;
        case 'output_json':
          push(c, '?', outputJson.slice(0, 50000));
          break;
        case 'success':
          push(c, '?', successInt);
          break;
        case 'error_message':
          push(c, '?', err);
          break;
        case 'duration_ms':
          push(c, '?', dur);
          break;
        case 'cost_usd':
          push(c, '?', costUsd);
          break;
        case 'input_tokens':
          push(c, '?', inTok);
          break;
        case 'output_tokens':
          push(c, '?', outTok);
          break;
        case 'retry_count':
          push(c, '?', retry);
          break;
        case 'requires_approval':
          push(c, '?', reqAppr);
          break;
        case 'status':
          push(c, '?', String(fields.status || (success ? 'completed' : 'error')).slice(0, 40));
          break;
        case 'created_at':
          push(c, `datetime('now')`, null);
          break;
        default:
          push(c, '?', null);
          break;
      }
    }

    await env.DB.prepare(
      `INSERT INTO agentsam_mcp_tool_execution (${insertCols.join(', ')})
       VALUES (${insertVals.join(', ')})`,
    )
      .bind(...binds)
      .run();
    return id;
  } catch (e) {
    console.warn('[recordMcpToolExecution] prod insert failed', e?.message ?? e);
    return null;
  }
}
