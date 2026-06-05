/**
 * Six-table addendum — rollups and tiered purges for 1 AM compaction pipeline.
 */

import { compactToolCallLogBeforePurge } from './tool-call-log-compaction.js';
import { patchDailyTopToolsJson, pragmaTableInfo } from './retention.js';
import { scheduleCompactionEvent } from './agentsam-ops-ledger.js';
import { cronTenantId } from '../cron/cron-tenant.js';

/**
 * patchDailyTopToolsJson → stats upsert → compaction_event → DELETE (single pass).
 * @param {any} env
 */
export async function rollupToolCallLogDaily(env) {
  if (!env?.DB) return { ok: false, skipped: true };

  const topTools = await patchDailyTopToolsJson(env);
  const compaction = await compactToolCallLogBeforePurge(env, { retentionDays: 1 });

  const res = await env.DB.prepare(
    `DELETE FROM agentsam_tool_call_log
     WHERE created_at < unixepoch('now', '-1 day')
     LIMIT 500`,
  )
    .run()
    .catch((e) => {
      console.warn('[one-am] tool_call_log DELETE', e?.message ?? e);
      return null;
    });

  const deleted = Number(res?.meta?.changes ?? res?.changes ?? 0) || 0;
  console.log('[compaction]', 'tool_call_log_purge', { rowCount: deleted });
  return { ok: true, topTools, compaction, deleted };
}

/**
 * @param {any} env
 */
export async function purgeExpiredToolCache(env) {
  if (!env?.DB) return { deleted: 0 };

  const cols = await pragmaTableInfo(env.DB, 'agentsam_tool_cache');
  if (!cols.size) return { deleted: 0, skipped: true };

  let expiredDeleted = 0;
  if (cols.has('expires_at')) {
    const r = await env.DB.prepare(
      `DELETE FROM agentsam_tool_cache
       WHERE expires_at IS NOT NULL
         AND expires_at < datetime('now')
       LIMIT 500`,
    )
      .run()
      .catch(() => null);
    expiredDeleted = Number(r?.meta?.changes ?? r?.changes ?? 0) || 0;
  }

  let ttlDeleted = 0;
  if (cols.has('created_at')) {
    const r2 = await env.DB.prepare(
      `DELETE FROM agentsam_tool_cache
       WHERE created_at < datetime('now', '-14 days')
       LIMIT 500`,
    )
      .run()
      .catch(() => null);
    ttlDeleted = Number(r2?.meta?.changes ?? r2?.changes ?? 0) || 0;
  }

  const total = expiredDeleted + ttlDeleted;
  console.log('[compaction]', 'tool_cache_purge', {
    expired: expiredDeleted,
    ttl: ttlDeleted,
    total,
  });
  return { deleted: total, expiredDeleted, ttlDeleted };
}

/**
 * Upsert yesterday's error counts into agentsam_usage_rollups_daily.
 * @param {any} env
 */
export async function rollupErrorLogToDaily(env) {
  if (!env?.DB) return { ok: false, skipped: true };

  const errCols = await pragmaTableInfo(env.DB, 'agentsam_error_log');
  const rollCols = await pragmaTableInfo(env.DB, 'agentsam_usage_rollups_daily');
  if (!errCols.has('created_at') || !errCols.has('error_type') || !rollCols.has('error_count')) {
    return { ok: false, skipped: true, reason: 'schema' };
  }

  const hasBreakdown = rollCols.has('error_breakdown_json');
  const wsExpr = errCols.has('workspace_id') ? 'workspace_id' : `'__tenant__'`;

  const { results: typeRows = [] } = await env.DB.prepare(
    `SELECT tenant_id, ${wsExpr} AS workspace_id, error_type, COUNT(*) AS type_count
     FROM agentsam_error_log
     WHERE date(created_at, 'unixepoch') = date('now', '-1 day')
     GROUP BY tenant_id, ${wsExpr}, error_type`,
  )
    .all()
    .catch(() => ({ results: [] }));

  const byWs = new Map();
  for (const row of typeRows) {
    const tenantId = String(row.tenant_id || '').trim();
    const workspaceId = String(row.workspace_id || '__tenant__').trim();
    if (!tenantId) continue;
    const key = `${tenantId}\0${workspaceId}`;
    if (!byWs.has(key)) {
      byWs.set(key, { tenantId, workspaceId, error_count: 0, breakdown: {} });
    }
    const bucket = byWs.get(key);
    const c = Number(row.type_count) || 0;
    bucket.error_count += c;
    bucket.breakdown[String(row.error_type || 'unknown')] = c;
  }

  let upserted = 0;
  for (const bucket of byWs.values()) {
    const breakdownJson = JSON.stringify(bucket.breakdown);
    try {
      if (hasBreakdown) {
        await env.DB.prepare(
          `INSERT INTO agentsam_usage_rollups_daily
             (tenant_id, workspace_id, day, error_count, error_breakdown_json, rollup_source, rolled_up_at)
           VALUES (?, ?, date('now', '-1 day'), ?, ?, 'error_log_rollup', unixepoch())
           ON CONFLICT (tenant_id, workspace_id, day) DO UPDATE SET
             error_count = agentsam_usage_rollups_daily.error_count + excluded.error_count,
             error_breakdown_json = excluded.error_breakdown_json,
             rolled_up_at = unixepoch()`,
        )
          .bind(bucket.tenantId, bucket.workspaceId, bucket.error_count, breakdownJson)
          .run();
      } else {
        await env.DB.prepare(
          `INSERT INTO agentsam_usage_rollups_daily
             (tenant_id, workspace_id, day, error_count, rollup_source, rolled_up_at)
           VALUES (?, ?, date('now', '-1 day'), ?, 'error_log_rollup', unixepoch())
           ON CONFLICT (tenant_id, workspace_id, day) DO UPDATE SET
             error_count = agentsam_usage_rollups_daily.error_count + excluded.error_count,
             rolled_up_at = unixepoch()`,
        )
          .bind(bucket.tenantId, bucket.workspaceId, bucket.error_count)
          .run();
      }
      upserted += 1;
    } catch (e) {
      console.warn('[one-am] error_log rollup row', e?.message ?? e);
    }
  }

  return { ok: true, upserted };
}

/**
 * Tiered purge: resolved 48h, unresolved 7d — with compaction_event audit.
 * @param {any} env
 */
export async function purgeErrorLog(env) {
  if (!env?.DB) return { deleted: 0 };

  const cols = await pragmaTableInfo(env.DB, 'agentsam_error_log');
  if (!cols.has('created_at') || !cols.has('resolved')) {
    return { deleted: 0, skipped: true };
  }

  await rollupErrorLogToDaily(env);

  const whereClause = `(resolved = 1 AND created_at < unixepoch('now', '-2 days'))
    OR (resolved = 0 AND created_at < unixepoch('now', '-7 days'))`;

  const { results: byType = [] } = await env.DB.prepare(
    `SELECT error_type, COUNT(*) AS c FROM agentsam_error_log
     WHERE ${whereClause}
     GROUP BY error_type`,
  )
    .all()
    .catch(() => ({ results: [] }));

  const totalToDelete = byType.reduce((s, r) => s + (Number(r.c) || 0), 0);
  const by_type = Object.fromEntries(
    byType.map((r) => [String(r.error_type || 'unknown'), Number(r.c) || 0]),
  );

  if (totalToDelete > 0) {
    const tenantId = cronTenantId(env) || 'system';
    scheduleCompactionEvent(env, null, {
      tenantId,
      workspaceId: null,
      userId: 'system',
      provider: 'none',
      modelKey: 'none',
      tokensBefore: 0,
      tokensAfter: 0,
      costSavedUsd: 0,
      compactionStrategy: 'selective',
      metadata: {
        compaction_type: 'data_summary',
        source_table: 'agentsam_error_log',
        source_row_count: totalToDelete,
        summary_json: { by_type },
        trigger: 'one_am_compaction_pipeline',
        status: 'completed',
      },
    });
  }

  const res = await env.DB.prepare(
    `DELETE FROM agentsam_error_log WHERE ${whereClause} LIMIT 500`,
  )
    .run()
    .catch((e) => {
      console.warn('[one-am] error_log DELETE', e?.message ?? e);
      return null;
    });

  const deleted = Number(res?.meta?.changes ?? res?.changes ?? 0) || 0;
  console.log('[compaction]', 'error_log_purge', { rowCount: deleted, by_type });
  return { deleted, by_type, audited: totalToDelete > 0 };
}

/**
 * Summary by hook_id/status, then tiered purge (hook_agent_run_complete @ 7d).
 * @param {any} env
 */
export async function purgeHookExecution(env) {
  if (!env?.DB) return { deleted: 0 };

  const cols = await pragmaTableInfo(env.DB, 'agentsam_hook_execution');
  if (!cols.has('created_at') || !cols.has('hook_id')) {
    return { deleted: 0, skipped: true };
  }

  const purgeWhere = `(hook_id != 'hook_agent_run_complete' AND created_at < unixepoch('now', '-2 days'))
    OR (hook_id = 'hook_agent_run_complete' AND created_at < unixepoch('now', '-7 days'))`;

  const { results: summary = [] } = await env.DB.prepare(
    `SELECT hook_id, status, COUNT(*) AS c FROM agentsam_hook_execution
     WHERE ${purgeWhere}
     GROUP BY hook_id, status`,
  )
    .all()
    .catch(() => ({ results: [] }));

  const totalToDelete = summary.reduce((s, r) => s + (Number(r.c) || 0), 0);
  if (totalToDelete > 0) {
    const byHook = {};
    for (const r of summary) {
      const hid = String(r.hook_id || 'unknown');
      if (!byHook[hid]) byHook[hid] = {};
      byHook[hid][String(r.status || 'unknown')] = Number(r.c) || 0;
    }
    const tenantId = cronTenantId(env) || 'system';
    scheduleCompactionEvent(env, null, {
      tenantId,
      workspaceId: null,
      userId: 'system',
      provider: 'none',
      modelKey: 'none',
      tokensBefore: 0,
      tokensAfter: 0,
      costSavedUsd: 0,
      compactionStrategy: 'selective',
      metadata: {
        compaction_type: 'data_summary',
        source_table: 'agentsam_hook_execution',
        source_row_count: totalToDelete,
        summary_json: { by_hook: byHook },
        trigger: 'one_am_compaction_pipeline',
        status: 'completed',
      },
    });
  }

  const r1 = await env.DB.prepare(
    `DELETE FROM agentsam_hook_execution
     WHERE hook_id != 'hook_agent_run_complete'
       AND created_at < unixepoch('now', '-2 days')
     LIMIT 500`,
  )
    .run()
    .catch(() => null);
  const r2 = await env.DB.prepare(
    `DELETE FROM agentsam_hook_execution
     WHERE hook_id = 'hook_agent_run_complete'
       AND created_at < unixepoch('now', '-7 days')
     LIMIT 500`,
  )
    .run()
    .catch(() => null);

  const deleted =
    (Number(r1?.meta?.changes ?? r1?.changes ?? 0) || 0) +
    (Number(r2?.meta?.changes ?? r2?.changes ?? 0) || 0);
  console.log('[compaction]', 'hook_execution_purge', { rowCount: deleted });
  return { deleted, audited: totalToDelete > 0 };
}
