/**
 * Canonical writer for agentsam_tool_stats_compacted.
 *
 * V1 constraint: table's current unique key is tenant_id + tool_name (not workspace-aware).
 * Until migration 263 rebuilds the unique key, this module writes **tenant-level** rows only:
 * - workspace_id is set to NULL (when column exists)
 * - metadata_json includes { scope: "tenant" } when column exists
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

function safeJsonStringify(value) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return '{}';
  }
}

/**
 * Compact agentsam_mcp_tool_execution into agentsam_tool_stats_compacted.
 * @param {any} env
 * @param {{ tenantId?: string|null, includeAllTenants?: boolean, metadata?: any }} [opts]
 */
export async function compactToolStatsCompacted(env, opts = {}) {
  if (!env?.DB) return { ok: false, skipped: true, reason: 'no_db' };

  const cols = await pragmaTableInfo(env.DB, 'agentsam_tool_stats_compacted');
  const src = await pragmaTableInfo(env.DB, 'agentsam_mcp_tool_execution');
  if (!cols.size || !src.size) {
    return { ok: false, skipped: true, reason: 'missing_tables' };
  }
  if (!src.has('tool_name')) {
    return { ok: false, skipped: true, reason: 'agentsam_mcp_tool_execution_missing_tool_name' };
  }

  const tenantFilter =
    opts.includeAllTenants === true
      ? ''
      : `WHERE COALESCE(tenant_id,'system') = ?`;
  const bindTenant =
    opts.includeAllTenants === true
      ? []
      : [opts.tenantId != null ? String(opts.tenantId) : 'system'];

  const hasStatus = src.has('status');
  const hasCost = src.has('cost_usd');
  const hasDuration = src.has('duration_ms');
  const hasCreatedAt = src.has('created_at');
  const hasTokens =
    (src.has('input_tokens') || src.has('tokens_in') || src.has('tokens_input')) ||
    (src.has('output_tokens') || src.has('tokens_out') || src.has('tokens_output'));

  const destCols = [];
  const selectExprs = [];

  // Keys (tenant-level only until unique key is rebuilt)
  destCols.push('tenant_id');
  selectExprs.push(`COALESCE(tenant_id,'system')`);

  if (cols.has('workspace_id')) {
    destCols.push('workspace_id');
    selectExprs.push('NULL');
  }

  destCols.push('tool_name');
  selectExprs.push('tool_name');

  if (cols.has('total_calls')) {
    destCols.push('total_calls');
    selectExprs.push('COUNT(*)');
  } else if (cols.has('call_count')) {
    destCols.push('call_count');
    selectExprs.push('COUNT(*)');
  }

  if (cols.has('success_count')) {
    destCols.push('success_count');
    selectExprs.push(
      hasStatus ? `SUM(CASE WHEN LOWER(COALESCE(status,'')) IN ('success','ok','completed') THEN 1 ELSE 0 END)` : '0',
    );
  }

  if (cols.has('failure_count')) {
    destCols.push('failure_count');
    selectExprs.push(
      hasStatus ? `SUM(CASE WHEN LOWER(COALESCE(status,'')) IN ('success','ok','completed') THEN 0 ELSE 1 END)` : '0',
    );
  }

  if (cols.has('success_rate')) {
    destCols.push('success_rate');
    selectExprs.push(
      hasStatus
        ? `ROUND(1.0 * SUM(CASE WHEN LOWER(COALESCE(status,'')) IN ('success','ok','completed') THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 4)`
        : 'NULL',
    );
  }

  if (cols.has('total_cost_usd')) {
    destCols.push('total_cost_usd');
    selectExprs.push(hasCost ? `COALESCE(SUM(COALESCE(cost_usd,0)),0)` : '0');
  }

  if (cols.has('avg_duration_ms')) {
    destCols.push('avg_duration_ms');
    selectExprs.push(hasDuration ? `ROUND(AVG(COALESCE(duration_ms,0)),2)` : 'NULL');
  }

  if (cols.has('total_tokens')) {
    destCols.push('total_tokens');
    if (!hasTokens) {
      selectExprs.push('0');
    } else if (src.has('input_tokens') && src.has('output_tokens')) {
      selectExprs.push(`SUM(COALESCE(input_tokens,0) + COALESCE(output_tokens,0))`);
    } else if (src.has('tokens_in') && src.has('tokens_out')) {
      selectExprs.push(`SUM(COALESCE(tokens_in,0) + COALESCE(tokens_out,0))`);
    } else if (src.has('tokens_input') && src.has('tokens_output')) {
      selectExprs.push(`SUM(COALESCE(tokens_input,0) + COALESCE(tokens_output,0))`);
    } else if (src.has('input_tokens')) {
      selectExprs.push(`SUM(COALESCE(input_tokens,0))`);
    } else if (src.has('tokens_in')) {
      selectExprs.push(`SUM(COALESCE(tokens_in,0))`);
    } else {
      selectExprs.push('0');
    }
  }

  if (cols.has('first_seen_at')) {
    destCols.push('first_seen_at');
    selectExprs.push(hasCreatedAt ? 'MIN(created_at)' : 'NULL');
  }
  if (cols.has('last_seen_at')) {
    destCols.push('last_seen_at');
    selectExprs.push(hasCreatedAt ? 'MAX(created_at)' : 'NULL');
  }
  if (cols.has('compacted_at')) {
    destCols.push('compacted_at');
    selectExprs.push('unixepoch()');
  }

  if (cols.has('metadata_json')) {
    destCols.push('metadata_json');
    selectExprs.push('?');
  }

  if (destCols.length < 3) {
    return { ok: false, skipped: true, reason: 'agentsam_tool_stats_compacted_schema_unexpected' };
  }

  const metadataJson = cols.has('metadata_json')
    ? safeJsonStringify({ scope: 'tenant', ...(opts.metadata && typeof opts.metadata === 'object' ? opts.metadata : {}) })
    : null;

  const binds = [...bindTenant];
  if (cols.has('metadata_json')) binds.push(metadataJson);

  const groupByParts = [`COALESCE(tenant_id,'system')`, 'tool_name'];

  // Tenant-level upsert only until migration 263 rebuilds unique key to include workspace_id.
  const updateCols = destCols.filter((c) => !['tenant_id', 'tool_name'].includes(c));
  const conflictTail =
    updateCols.length > 0
      ? `ON CONFLICT(tenant_id, tool_name) DO UPDATE SET ${updateCols.map((c) => `${c} = excluded.${c}`).join(', ')}`
      : `ON CONFLICT(tenant_id, tool_name) DO NOTHING`;

  const sql = `
    INSERT INTO agentsam_tool_stats_compacted (${destCols.join(', ')})
    SELECT ${selectExprs.join(', ')}
    FROM agentsam_mcp_tool_execution
    ${tenantFilter}
    GROUP BY ${groupByParts.join(', ')}
    ${conflictTail}
  `;

  try {
    const r = await env.DB.prepare(sql).bind(...binds).run();
    return { ok: true, changes: r.meta?.changes ?? r.changes ?? 0, scope: 'tenant' };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

