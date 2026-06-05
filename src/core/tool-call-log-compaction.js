/**
 * Step 7 — before agentsam_tool_call_log DELETE: durable stats + audit trail.
 * Order: tool_stats_compacted upsert → compaction_events (one per purge run) → DELETE.
 */

import { scheduleCompactionEvent } from './agentsam-ops-ledger.js';
import { cronTenantId } from '../cron/cron-tenant.js';

const PURGE_BATCH_LIMIT = 500;
const SUCCESS_STATUSES = `('success','ok','completed')`;

async function pragmaTableInfo(db, tableName) {
  const safe = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(String(tableName || '')) ? String(tableName) : '';
  if (!safe || !db) return new Set();
  try {
    const { results } = await db.prepare(`PRAGMA table_info(${safe})`).all();
    return new Set((results || []).map((r) => String(r.name || '').toLowerCase()));
  } catch {
    return new Set();
  }
}

function purgeAgeClause(retentionDays) {
  const days = Math.max(0, Number(retentionDays) || 1);
  return `created_at < unixepoch('now', '-${days} days')`;
}

/**
 * @param {any} env
 * @param {{ retentionDays?: number }} [opts]
 */
export async function compactToolCallLogBeforePurge(env, opts = {}) {
  if (!env?.DB) {
    return { ok: false, skipped: true, reason: 'no_db' };
  }

  const srcCols = await pragmaTableInfo(env.DB, 'agentsam_tool_call_log');
  const statsCols = await pragmaTableInfo(env.DB, 'agentsam_tool_stats_compacted');
  if (!srcCols.has('created_at') || !srcCols.has('tool_name')) {
    return { ok: false, skipped: true, reason: 'tool_call_log_schema' };
  }

  const ageClause = purgeAgeClause(opts.retentionDays);
  const batchCte = `
    WITH purge_batch AS (
      SELECT *
      FROM agentsam_tool_call_log
      WHERE ${ageClause}
      ORDER BY created_at ASC
      LIMIT ${PURGE_BATCH_LIMIT}
    )`;

  const batchMeta = await env.DB.prepare(
    `${batchCte}
     SELECT COUNT(*) AS row_count,
            COALESCE(SUM(COALESCE(cost_usd, 0)), 0) AS total_cost
     FROM purge_batch`,
  )
    .first()
    .catch(() => null);

  const rowsAboutToDelete = Number(batchMeta?.row_count) || 0;
  if (!rowsAboutToDelete) {
    return { ok: true, skipped: true, reason: 'no_rows_in_purge_batch', stats_upserted: 0 };
  }

  let statsUpserted = 0;
  if (statsCols.size) {
    const tenantExpr = srcCols.has('tenant_id')
      ? `COALESCE(NULLIF(trim(tenant_id), ''), 'system')`
      : `'system'`;
    const wsExpr = srcCols.has('workspace_id')
      ? `COALESCE(NULLIF(trim(workspace_id), ''), '__tenant__')`
      : `'__tenant__'`;
    const hasStatus = srcCols.has('status');
    const hasCost = srcCols.has('cost_usd');
    const hasDuration = srcCols.has('duration_ms');
    const hasTokens =
      srcCols.has('tokens_used') ||
      (srcCols.has('input_tokens') && srcCols.has('output_tokens'));

    const destCols = ['tenant_id'];
    const selectExprs = [tenantExpr];
    if (statsCols.has('workspace_id')) {
      destCols.push('workspace_id');
      selectExprs.push(wsExpr);
    }
    destCols.push('tool_name');
    selectExprs.push('tool_name');

    if (statsCols.has('total_calls')) {
      destCols.push('total_calls');
      selectExprs.push('COUNT(*)');
    }
    if (statsCols.has('success_count')) {
      destCols.push('success_count');
      selectExprs.push(
        hasStatus
          ? `SUM(CASE WHEN LOWER(COALESCE(status,'')) IN ${SUCCESS_STATUSES} THEN 1 ELSE 0 END)`
          : '0',
      );
    }
    if (statsCols.has('failure_count')) {
      destCols.push('failure_count');
      selectExprs.push(
        hasStatus
          ? `SUM(CASE WHEN LOWER(COALESCE(status,'')) IN ${SUCCESS_STATUSES} THEN 0 ELSE 1 END)`
          : '0',
      );
    }
    if (statsCols.has('success_rate')) {
      destCols.push('success_rate');
      selectExprs.push(
        hasStatus
          ? `ROUND(1.0 * SUM(CASE WHEN LOWER(COALESCE(status,'')) IN ${SUCCESS_STATUSES} THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 4)`
          : 'NULL',
      );
    }
    if (statsCols.has('total_cost_usd')) {
      destCols.push('total_cost_usd');
      selectExprs.push(hasCost ? `COALESCE(SUM(COALESCE(cost_usd, 0)), 0)` : '0');
    }
    if (statsCols.has('total_tokens')) {
      destCols.push('total_tokens');
      selectExprs.push(
        srcCols.has('tokens_used')
          ? `COALESCE(SUM(COALESCE(tokens_used, 0)), 0)`
          : hasTokens
            ? `SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0))`
            : '0',
      );
    }
    if (statsCols.has('avg_duration_ms')) {
      destCols.push('avg_duration_ms');
      selectExprs.push(hasDuration ? `ROUND(AVG(COALESCE(duration_ms, 0)), 2)` : 'NULL');
    }
    if (statsCols.has('first_seen_at')) {
      destCols.push('first_seen_at');
      selectExprs.push('MIN(created_at)');
    }
    if (statsCols.has('last_seen_at')) {
      destCols.push('last_seen_at');
      selectExprs.push('MAX(created_at)');
    }
    if (statsCols.has('compacted_at')) {
      destCols.push('compacted_at');
      selectExprs.push('unixepoch()');
    }

    const conflictKeys = statsCols.has('workspace_id')
      ? ['tenant_id', 'workspace_id', 'tool_name']
      : ['tenant_id', 'tool_name'];
    const updateParts = [];
    for (const c of ['total_calls', 'success_count', 'failure_count', 'total_cost_usd', 'total_tokens']) {
      if (statsCols.has(c)) {
        updateParts.push(
          `${c} = COALESCE(agentsam_tool_stats_compacted.${c}, 0) + COALESCE(excluded.${c}, 0)`,
        );
      }
    }
    if (statsCols.has('success_rate') && statsCols.has('success_count') && statsCols.has('total_calls')) {
      updateParts.push(
        `success_rate = ROUND(
          1.0 * (COALESCE(agentsam_tool_stats_compacted.success_count, 0) + COALESCE(excluded.success_count, 0))
          / NULLIF(COALESCE(agentsam_tool_stats_compacted.total_calls, 0) + COALESCE(excluded.total_calls, 0), 0), 4)`,
      );
    }
    if (statsCols.has('avg_duration_ms')) {
      updateParts.push(
        `avg_duration_ms = ROUND((COALESCE(avg_duration_ms, 0) + COALESCE(excluded.avg_duration_ms, 0)) / 2.0, 2)`,
      );
    }
    if (statsCols.has('last_seen_at')) {
      updateParts.push(
        `last_seen_at = MAX(COALESCE(agentsam_tool_stats_compacted.last_seen_at, 0), COALESCE(excluded.last_seen_at, 0))`,
      );
    }
    if (statsCols.has('first_seen_at')) {
      updateParts.push(
        `first_seen_at = CASE
          WHEN agentsam_tool_stats_compacted.first_seen_at IS NULL THEN excluded.first_seen_at
          WHEN excluded.first_seen_at IS NULL THEN agentsam_tool_stats_compacted.first_seen_at
          ELSE MIN(agentsam_tool_stats_compacted.first_seen_at, excluded.first_seen_at)
        END`,
      );
    }
    if (statsCols.has('compacted_at')) updateParts.push('compacted_at = unixepoch()');

    if (destCols.length >= 3 && updateParts.length) {
      const sql = `
        ${batchCte}
        INSERT INTO agentsam_tool_stats_compacted (${destCols.join(', ')})
        SELECT ${selectExprs.join(', ')}
        FROM purge_batch
        GROUP BY ${tenantExpr}, ${wsExpr}, tool_name
        ON CONFLICT(${conflictKeys.join(', ')}) DO UPDATE SET ${updateParts.join(', ')}
      `;
      try {
        const r = await env.DB.prepare(sql).run();
        statsUpserted = Number(r?.meta?.changes ?? r?.changes ?? 0) || 0;
        console.log('[compaction]', 'agentsam_tool_stats_compacted', { rowCount: statsUpserted });
      } catch (e) {
        console.warn('[tool-call-log-compaction] stats upsert', e?.message ?? e);
      }
    }
  }

  const tenantId = cronTenantId(env) || 'system';
  const wsRow = await env.DB.prepare(
    `${batchCte} SELECT DISTINCT ${srcCols.has('workspace_id') ? `COALESCE(NULLIF(trim(workspace_id), ''), '__tenant__')` : `'__tenant__'`} AS workspace_id FROM purge_batch LIMIT 1`,
  )
    .first()
    .catch(() => null);

  /** Distinct agentsam_agent_run.id values on rows about to be purged (migration 164). */
  let agentsamAgentRunIds = [];
  if (srcCols.has('agent_run_id')) {
    const { results: runRows = [] } = await env.DB.prepare(
      `${batchCte}
       SELECT DISTINCT agent_run_id FROM purge_batch
       WHERE agent_run_id IS NOT NULL AND trim(agent_run_id) != ''
       LIMIT 50`,
    )
      .all()
      .catch(() => ({ results: [] }));
    agentsamAgentRunIds = runRows.map((r) => String(r.agent_run_id));
  }

  try {
    scheduleCompactionEvent(env, null, {
      tenantId,
      workspaceId: wsRow?.workspace_id != null ? String(wsRow.workspace_id) : null,
      userId: 'system',
      provider: 'none',
      modelKey: 'none',
      tokensBefore: 0,
      tokensAfter: 0,
      costSavedUsd: Number(batchMeta?.total_cost) || 0,
      compactionStrategy: 'selective',
      metadata: {
        compaction_type: 'data_summary',
        compaction_scope: 'table',
        source_kind: 'd1',
        source_table: 'agentsam_tool_call_log',
        source_row_count: rowsAboutToDelete,
        cost_before_usd: Number(batchMeta?.total_cost) || 0,
        agentsam_agent_run_ids: agentsamAgentRunIds,
        trigger: 'one_am_compaction_pipeline',
        status: 'completed',
        compacted_at_epoch: Math.floor(Date.now() / 1000),
      },
    });
    console.log('[compaction]', 'agentsam_compaction_events', {
      table: 'agentsam_tool_call_log_purge',
      rowCount: rowsAboutToDelete,
    });
  } catch (e) {
    console.warn('[tool-call-log-compaction] compaction_event', e?.message ?? e);
  }

  return {
    ok: true,
    stats_upserted: statsUpserted,
    rows_about_to_delete: rowsAboutToDelete,
    compaction_events: 1,
  };
}
