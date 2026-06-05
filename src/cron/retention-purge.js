import { cronTenantId } from './cron-tenant.js';

/** Handled exclusively by runOneAmCompactionPipeline — skip in policy-driven purge. */
const ONE_AM_MANAGED_TABLES = new Set([
  'agentsam_tool_call_log',
  'agentsam_usage_events',
  'agentsam_hook_execution',
]);

const RETENTION_PURGE_TABLE_CONFIG = {
  agentsam_webhook_events: { dateColumn: 'received_at_unix', compare: 'unix' },
  agentsam_hook_execution: { dateColumn: 'completed_at', compare: 'datetime' },
  agentsam_tool_call_log: { dateColumn: 'created_at', compare: 'unix' },
  agentsam_tool_chain: { dateColumn: 'started_at', compare: 'unix' },
  agentsam_execution_steps: { dateColumn: 'created_at', compare: 'datetime' },
  agentsam_cron_runs: { dateColumn: 'started_at', compare: 'unix' },
  worker_analytics_events: { dateColumn: 'timestamp', compare: 'unix_ms' },
  worker_analytics_errors: { dateColumn: 'created_at', compare: 'unix' },
  notifications: { dateColumn: 'created_at', compare: 'datetime' },
  deployment_notifications: { dateColumn: 'created_at', compare: 'datetime' },
  terminal_history: { dateColumn: 'created_at', compare: 'unix' },
  agentsam_mcp_tool_execution: { dateColumn: 'created_at', compare: 'datetime' },
  mcp_usage_log: { dateColumn: 'date', compare: 'date_col' },
  mcp_agent_sessions: { dateColumn: 'created_at', compare: 'unix' },
  agentsam_tool_stats_compacted: { dateColumn: 'date', compare: 'date_col' },
  agentsam_workflow_runs: { dateColumn: 'created_at', compare: 'unix' },
  mcp_command_suggestions: { dateColumn: 'created_at', compare: 'unix' },
  terminal_sessions: { dateColumn: 'updated_at', compare: 'unix' },
  cicd_runs: { dateColumn: 'created_at', compare: 'datetime' },
  cicd_events: { dateColumn: 'created_at', compare: 'unix' },
  agent_messages: { dateColumn: 'created_at', compare: 'datetime' },
};

function retentionConditionIsSafe(cond) {
  const c = String(cond || '').trim();
  if (!c) return true;
  if (/[;]/.test(c)) return false;
  if (/--|\/\*|\*\//.test(c)) return false;
  if (/\b(attach|detach|pragma|vacuum)\b/i.test(c)) return false;
  if (c.length > 2000) return false;
  return true;
}

/** D1 policies sometimes store human-readable notes instead of SQL — never execute those. */
function shouldSkipNonSqlCondition(condition) {
  const c = String(condition || '').trim();
  if (!c) return false;
  if (c.includes('—')) return true;
  if (c.toUpperCase().includes('NEVER')) return true;
  if (c.length > 200) return true;
  return false;
}

/**
 * Midnight cron: batch-delete old rows per data_retention_policies (LIMIT 500 per table per run).
 * Unknown table_name values are skipped. Optional policy.condition appended as AND (...); use D1 for e.g.
 * agent_messages: session_id NOT IN (SELECT id FROM agent_sessions WHERE status = 'active')
 */
export async function runRetentionPurge(env) {
  if (!env?.DB) return;
  let policies = [];
  try {
    const q = await env.DB.prepare(
      `SELECT * FROM data_retention_policies WHERE COALESCE(is_active, 1) = 1`
    ).all();
    policies = q.results || [];
  } catch (e) {
    console.warn('[cron] retention policies load', e?.message ?? e);
    await writeCronAuditLog(env, {
      event_type: 'retention_purge',
      message: 'Failed to load data_retention_policies',
      metadata: { error: String(e?.message || e) },
    });
    return;
  }
  let grandTotal = 0;
  let policiesRun = 0;
  let skippedInvalidCondition = 0;
  const tablesAffected = [];
  const perTable = [];
  for (const policy of policies) {
    const table = policy.table_name != null ? String(policy.table_name).trim() : '';
    if (ONE_AM_MANAGED_TABLES.has(table)) {
      perTable.push({ table, deleted: 0, skipped: 'one_am_pipeline' });
      continue;
    }
    const cfg = RETENTION_PURGE_TABLE_CONFIG[table];
    if (!cfg) {
      console.warn('[cron] retention skip unknown table:', table);
      continue;
    }
    const days = Number(policy.retention_days);
    if (!Number.isFinite(days) || days < 0) continue;
    const dateCol = cfg.dateColumn;
    const ageClause =
      cfg.compare === 'unix_ms'
        ? `${dateCol} < (unixepoch() * 1000 - ${days} * 86400000)`
        : cfg.compare === 'unix'
          ? `${dateCol} < unixepoch('now', '-${days} days')`
          : cfg.compare === 'date_col'
            ? `date(${dateCol}) < date('now', '-${days} days')`
            : `${dateCol} < datetime('now', '-${days} days')`;
    let condClause = '';
    const rawCond = policy.condition != null ? String(policy.condition).trim() : '';
    if (rawCond) {
      if (shouldSkipNonSqlCondition(rawCond)) {
        skippedInvalidCondition += 1;
        console.warn('[cron] retention skip non-SQL condition for table:', table);
        perTable.push({ table, deleted: 0, skipped: 'non_sql_condition' });
        continue;
      }
      if (!retentionConditionIsSafe(rawCond)) {
        skippedInvalidCondition += 1;
        console.warn('[cron] retention skip unsafe condition for table:', table);
        perTable.push({ table, deleted: 0, skipped: 'unsafe_condition' });
        continue;
      }
      condClause = ` AND (${rawCond})`;
    }
    const delSql = `DELETE FROM ${table} WHERE ${ageClause}${condClause} LIMIT 500`;
    let deleted = 0;
    policiesRun += 1;
    try {
      const r = await env.DB.prepare(delSql).run();
      deleted = r.meta?.changes ?? r.changes ?? 0;
    } catch (e) {
      console.warn('[cron] retention DELETE', table, e?.message ?? e);
      perTable.push({ table, deleted: 0, error: String(e?.message || e) });
      continue;
    }
    grandTotal += deleted;
    if (deleted > 0 && !tablesAffected.includes(table)) tablesAffected.push(table);
    perTable.push({
      table,
      deleted,
      capped: deleted === 500,
    });
    if (deleted === 500) {
      console.log('[cron] retention deleted 500 rows from', table, '(more may remain until next cron)');
    }
    try {
      const rid = policy.id != null ? String(policy.id).trim() : '';
      if (rid) {
        await env.DB.prepare(
          `UPDATE data_retention_policies SET last_purged_at = datetime('now'), rows_purged_total = COALESCE(rows_purged_total, 0) + ? WHERE id = ?`
        ).bind(deleted, rid).run();
      } else {
        await env.DB.prepare(
          `UPDATE data_retention_policies SET last_purged_at = datetime('now'), rows_purged_total = COALESCE(rows_purged_total, 0) + ? WHERE table_name = ?`
        ).bind(deleted, table).run();
      }
    } catch (e) {
      console.warn('[cron] retention policy UPDATE', table, e?.message ?? e);
    }
  }
  await writeCronAuditLog(env, {
    event_type: 'retention_purge',
    message: `Retention purge completed: ${grandTotal} rows deleted (batch max 500 per table)`,
    metadata: {
      policies_run: policiesRun,
      total_rows_deleted: grandTotal,
      tables_affected: tablesAffected,
      skipped_invalid_condition: skippedInvalidCondition,
      per_table: perTable,
    },
  });

  return {
    rowsWritten: grandTotal,
    metadata: {
      policies_run: policiesRun,
      total_rows_deleted: grandTotal,
      tables_affected: tablesAffected,
      skipped_invalid_condition: skippedInvalidCondition,
      per_table: perTable,
    },
  };
}

async function writeCronAuditLog(env, { event_type, message, run_id = null, metadata = {} }) {
  if (!env?.DB) return;
  const tid = cronTenantId(env);
  if (!tid) return;
  try {
    const id = crypto.randomUUID();
    const slug = String(event_type || 'event').replace(/[^a-zA-Z0-9_:-]/g, '_').slice(0, 60);
    const meta = JSON.stringify({ tenant_id: tid, run_id, ...metadata }).slice(0, 8000);
    const et = String(event_type || 'audit').slice(0, 200);
    const msg = String(message || '').slice(0, 4000);
    await env.DB.prepare(
      `INSERT INTO agentsam_hook_execution (
        id, hook_id, tenant_id, ran_at, status, event_type, message, metadata_json, run_id, created_at, error_message
      ) VALUES (?, ?, ?, unixepoch(), 'audit', ?, ?, ?, ?, unixepoch(), ?)`
    ).bind(id, `audit_${slug}`, tid, et, msg, meta, run_id ?? null, msg.slice(0, 500)).run();
  } catch (e) {
    console.warn('[writeCronAuditLog]', e?.message ?? e);
  }
}
