/**
 * agentsam_error_log → agentsam_escalation + agentsam_health_daily.red_count
 * when error rates exceed thresholds (by error_type, tool, model).
 */

import { pragmaTableInfo } from './retention.js';

/** Rolling window for threshold counts (seconds). */
const WINDOW_SEC = 3600;

/** Minimum errors in window to trigger escalation + health red bump. */
const THRESHOLD_BY_ERROR_TYPE = 5;
const THRESHOLD_BY_TOOL = 3;
const THRESHOLD_BY_MODEL = 5;

/**
 * @param {string | null | undefined} raw
 */
function parseContextJson(raw) {
  if (raw == null || raw === '') return {};
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return {};
  }
}

/**
 * @param {Record<string, unknown>} ctx
 */
function modelFromContext(ctx) {
  const keys = ['model_key', 'model', 'model_attempted', 'selected_model'];
  for (const k of keys) {
    const v = ctx[k];
    if (v != null && String(v).trim() !== '') return String(v).trim().slice(0, 200);
  }
  return null;
}

/**
 * @param {Record<string, unknown>} ctx
 */
function toolFromContext(ctx) {
  const keys = ['tool_name', 'tool_key', 'tool'];
  for (const k of keys) {
    const v = ctx[k];
    if (v != null && String(v).trim() !== '') return String(v).trim().slice(0, 200);
  }
  return null;
}

/**
 * @param {string} tenantId
 * @param {string} dimension
 * @param {string} value
 */
function breachRunGroupId(tenantId, dimension, value) {
  const safe = String(value).replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 80);
  return `err_thr_${String(tenantId).slice(0, 40)}_${dimension}_${safe}`.slice(0, 200);
}

/**
 * @param {any} env
 * @param {string} runGroupId
 * @param {number} sinceUnix
 */
async function escalationExistsForBreach(env, runGroupId, sinceUnix) {
  const escCols = await pragmaTableInfo(env.DB, 'agentsam_escalation');
  if (!escCols.has('run_group_id')) return false;
  const timeCol = escCols.has('created_at_unix')
    ? 'created_at_unix'
    : escCols.has('created_at')
      ? "CAST(strftime('%s', created_at) AS INTEGER)"
      : null;
  if (!timeCol) return false;
  try {
    const row = await env.DB.prepare(
      `SELECT 1 AS ok FROM agentsam_escalation
       WHERE run_group_id = ? AND ${timeCol} >= ?
       LIMIT 1`,
    )
      .bind(runGroupId, sinceUnix)
      .first();
    return !!row?.ok;
  } catch {
    return false;
  }
}

/**
 * @param {any} env
 * @param {{
 *   tenantId: string,
 *   workspaceId: string,
 *   errorLogId: string,
 *   errorType: string,
 *   errorMessage: string,
 *   sourceId?: string | null,
 *   modelKey?: string | null,
 *   breachDimension: string,
 *   breachValue: string,
 *   errorCount: number,
 *   threshold: number,
 * }} p
 */
async function insertEscalationFromErrorBreach(env, p) {
  const escCols = await pragmaTableInfo(env.DB, 'agentsam_escalation');
  if (!escCols.size) return { ok: false, skipped: true, reason: 'no_escalation_table' };

  const runGroupId = breachRunGroupId(p.tenantId, p.breachDimension, p.breachValue);
  const sinceUnix = Math.floor(Date.now() / 1000) - WINDOW_SEC;
  if (await escalationExistsForBreach(env, runGroupId, sinceUnix)) {
    return { ok: true, skipped: true, reason: 'deduped' };
  }

  const modelAttempted =
    p.modelKey != null && String(p.modelKey).trim() !== ''
      ? String(p.modelKey).trim()
      : p.breachDimension === 'model'
        ? p.breachValue
        : 'unknown';

  const errMsg = `threshold:${p.breachDimension}=${p.breachValue} count=${p.errorCount}/${p.threshold} — ${String(p.errorMessage || '').slice(0, 400)}`;

  const parts = [];
  const binds = [];
  const add = (name, val) => {
    if (!escCols.has(name)) return;
    parts.push(name);
    binds.push(val);
  };

  add('id', `esc_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`);
  add('run_group_id', runGroupId);
  add('error_event_id', p.errorLogId);
  add('chain_index', 0);
  add('model_attempted', modelAttempted);
  add('succeeded', 0);
  add('latency_ms', 0);
  add('error_message', errMsg.slice(0, 500));
  add('workspace_id', p.workspaceId);
  add('tenant_id', p.tenantId);
  add('created_at_unix', Math.floor(Date.now() / 1000));

  if (parts.length < 4) return { ok: false, skipped: true, reason: 'escalation_schema_mismatch' };

  try {
    const r = await env.DB.prepare(
      `INSERT INTO agentsam_escalation (${parts.join(', ')}) VALUES (${parts.map(() => '?').join(', ')})`,
    )
      .bind(...binds)
      .run();
    return { ok: true, inserted: (Number(r.meta?.changes ?? r.changes ?? 0) || 0) > 0, runGroupId };
  } catch (e) {
    console.warn('[error-log-escalation] insert escalation', e?.message ?? e);
    return { ok: false, reason: String(e?.message || e) };
  }
}

/**
 * @param {any} env
 * @param {{ tenantId: string, workspaceId?: string | null, note?: string }} p
 */
async function incrementHealthDailyRed(env, p) {
  const hdCols = await pragmaTableInfo(env.DB, 'agentsam_health_daily');
  if (!hdCols.size || !hdCols.has('tenant_id') || !hdCols.has('day') || !hdCols.has('red_count')) {
    return { ok: false, skipped: true, reason: 'health_daily_missing' };
  }

  const tenantId = String(p.tenantId).trim();
  if (!tenantId) return { ok: false, skipped: true, reason: 'no_tenant' };

  const note = p.note != null ? String(p.note).slice(0, 500) : 'error_log_threshold_breach';
  const ws = p.workspaceId != null ? String(p.workspaceId).trim() : null;
  const nowUnix = Math.floor(Date.now() / 1000);

  const insertCols = ['tenant_id', 'day'];
  const insertExprs = ['?', "date('now')"];
  const binds = [tenantId];

  if (hdCols.has('id')) {
    insertCols.push('id');
    insertExprs.push('?');
    binds.push(`ahd_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`);
  }
  if (hdCols.has('workspace_id') && ws) {
    insertCols.push('workspace_id');
    insertExprs.push('?');
    binds.push(ws);
  }
  if (hdCols.has('snapshot_count')) {
    insertCols.push('snapshot_count');
    insertExprs.push('?');
    binds.push(1);
  }
  if (hdCols.has('green_count')) {
    insertCols.push('green_count');
    insertExprs.push('?');
    binds.push(0);
  }
  if (hdCols.has('yellow_count')) {
    insertCols.push('yellow_count');
    insertExprs.push('?');
    binds.push(0);
  }
  insertCols.push('red_count');
  insertExprs.push('?');
  binds.push(1);
  if (hdCols.has('health_status')) {
    insertCols.push('health_status');
    insertExprs.push('?');
    binds.push('red');
  }
  if (hdCols.has('worst_status')) {
    insertCols.push('worst_status');
    insertExprs.push('?');
    binds.push('red');
  }
  if (hdCols.has('health_notes')) {
    insertCols.push('health_notes');
    insertExprs.push('?');
    binds.push(note);
  }
  if (hdCols.has('rolled_up_at')) {
    insertCols.push('rolled_up_at');
    insertExprs.push('?');
    binds.push(new Date().toISOString().slice(0, 19).replace('T', ' '));
  }
  if (hdCols.has('rolled_up_at_unix')) {
    insertCols.push('rolled_up_at_unix');
    insertExprs.push('?');
    binds.push(nowUnix);
  }

  const updates = [
    'red_count = COALESCE(agentsam_health_daily.red_count, 0) + 1',
    hdCols.has('snapshot_count') &&
      'snapshot_count = COALESCE(agentsam_health_daily.snapshot_count, 0) + 1',
    hdCols.has('health_status') && "health_status = 'red'",
    hdCols.has('worst_status') && "worst_status = 'red'",
    hdCols.has('health_notes') && 'health_notes = excluded.health_notes',
    hdCols.has('rolled_up_at') && 'rolled_up_at = excluded.rolled_up_at',
    hdCols.has('rolled_up_at_unix') && 'rolled_up_at_unix = excluded.rolled_up_at_unix',
    hdCols.has('workspace_id') && ws && 'workspace_id = COALESCE(excluded.workspace_id, agentsam_health_daily.workspace_id)',
  ].filter(Boolean);

  try {
    await env.DB.prepare(
      `INSERT INTO agentsam_health_daily (${insertCols.join(', ')})
       VALUES (${insertExprs.join(', ')})
       ON CONFLICT(tenant_id, day) DO UPDATE SET ${updates.join(', ')}`,
    )
      .bind(...binds)
      .run();
    return { ok: true };
  } catch (e) {
    console.warn('[error-log-escalation] health_daily', e?.message ?? e);
    return { ok: false, reason: String(e?.message || e) };
  }
}

/**
 * @param {any} env
 * @param {string} tenantId
 * @param {string} [workspaceId]
 * @param {number} sinceUnix
 * @param {'error_type'|'tool'|'model'} dimension
 * @param {string} value
 */
async function countRecentErrors(env, tenantId, workspaceId, sinceUnix, dimension, value) {
  const errCols = await pragmaTableInfo(env.DB, 'agentsam_error_log');
  if (!errCols.size) return 0;

  const binds = [tenantId, sinceUnix];
  let wsClause = '';
  if (workspaceId && errCols.has('workspace_id')) {
    wsClause = ' AND workspace_id = ?';
    binds.push(workspaceId);
  }

  let dimClause = '';
  if (dimension === 'error_type') {
    dimClause = ' AND error_type = ?';
    binds.push(value);
  } else if (dimension === 'tool') {
    dimClause = ` AND (
      json_extract(context_json, '$.tool_name') = ?
      OR json_extract(context_json, '$.tool_key') = ?
      OR json_extract(context_json, '$.tool') = ?
    )`;
    binds.push(value, value, value);
  } else if (dimension === 'model') {
    dimClause = ` AND (
      json_extract(context_json, '$.model_key') = ?
      OR json_extract(context_json, '$.model') = ?
      OR json_extract(context_json, '$.model_attempted') = ?
      OR json_extract(context_json, '$.selected_model') = ?
    )`;
    binds.push(value, value, value, value);
  }

  const resolvedClause = errCols.has('resolved') ? ' AND COALESCE(resolved, 0) = 0' : '';

  try {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM agentsam_error_log
       WHERE tenant_id = ? AND created_at >= ?${wsClause}${dimClause}${resolvedClause}`,
    )
      .bind(...binds)
      .first();
    return Number(row?.c ?? 0) || 0;
  } catch {
    return 0;
  }
}

/**
 * Evaluate thresholds for one error_log row; escalate + bump health when breached.
 * @param {any} env
 * @param {{
 *   id: string,
 *   tenant_id: string,
 *   workspace_id: string,
 *   error_type: string,
 *   error_message: string,
 *   source_id?: string | null,
 *   context_json?: string | null,
 * }} row
 */
export async function evaluateErrorLogThresholds(env, row) {
  if (!env?.DB || !row?.id) return { ok: false, reason: 'missing_db_or_id' };

  const tenantId = row.tenant_id != null ? String(row.tenant_id).trim() : '';
  const workspaceId = row.workspace_id != null ? String(row.workspace_id).trim() : '';
  if (!tenantId || !workspaceId) return { ok: false, reason: 'missing_tenant_workspace' };

  const sinceUnix = Math.floor(Date.now() / 1000) - WINDOW_SEC;
  const ctx = parseContextJson(row.context_json);
  const toolName = toolFromContext(ctx);
  const modelKey = modelFromContext(ctx);
  const errorType = String(row.error_type || 'unknown').trim();

  /** @type {{ dimension: 'error_type'|'tool'|'model', value: string, threshold: number }[]} */
  const checks = [{ dimension: 'error_type', value: errorType, threshold: THRESHOLD_BY_ERROR_TYPE }];
  if (toolName) checks.push({ dimension: 'tool', value: toolName, threshold: THRESHOLD_BY_TOOL });
  if (modelKey) checks.push({ dimension: 'model', value: modelKey, threshold: THRESHOLD_BY_MODEL });

  const outcomes = [];
  let healthBumped = false;

  for (const { dimension, value, threshold } of checks) {
    const count = await countRecentErrors(env, tenantId, workspaceId, sinceUnix, dimension, value);
    if (count < threshold) continue;

    const esc = await insertEscalationFromErrorBreach(env, {
      tenantId,
      workspaceId,
      errorLogId: String(row.id),
      errorType,
      errorMessage: row.error_message,
      sourceId: row.source_id,
      modelKey,
      breachDimension: dimension,
      breachValue: value,
      errorCount: count,
      threshold,
    });
    if (esc.skipped && esc.reason === 'deduped') {
      outcomes.push({ dimension, value, count, escalated: false, deduped: true });
      continue;
    }

    let healthOk = false;
    if (!healthBumped) {
      const health = await incrementHealthDailyRed(env, {
        tenantId,
        workspaceId,
        note: `error_log ${dimension}=${value} count=${count}>=${threshold} (error ${row.id})`,
      });
      healthOk = !!health.ok;
      healthBumped = healthOk;
    }

    outcomes.push({
      dimension,
      value,
      count,
      threshold,
      escalated: !!esc.inserted || esc.ok,
      health: healthOk,
    });
  }

  return { ok: true, outcomes };
}

/**
 * @param {any} env
 * @param {any} ctx
 * @param {Parameters<typeof evaluateErrorLogThresholds>[1]} row
 */
export function scheduleErrorLogEscalation(env, ctx, row) {
  if (!env?.DB || !ctx?.waitUntil || !row?.id) return;
  ctx.waitUntil(evaluateErrorLogThresholds(env, row).catch((e) => {
    console.warn('[error-log-escalation]', e?.message ?? e);
  }));
}

/**
 * Hourly sweep: find dimension groups already at/above threshold without a recent breach escalation.
 * @param {any} env
 * @param {{ windowSec?: number }} [opts]
 */
export async function scanErrorLogThresholds(env, opts = {}) {
  if (!env?.DB) return { ok: false, skipped: true, reason: 'no_db' };

  const errCols = await pragmaTableInfo(env.DB, 'agentsam_error_log');
  if (!errCols.size) return { ok: false, skipped: true, reason: 'no_error_log' };

  const windowSec = Math.max(300, Number(opts.windowSec) || WINDOW_SEC);
  const sinceUnix = Math.floor(Date.now() / 1000) - windowSec;
  const resolvedClause = errCols.has('resolved') ? ' AND COALESCE(resolved, 0) = 0' : '';

  let escalations = 0;
  let healthBumps = 0;

  const typeGroups = await env.DB.prepare(
    `SELECT tenant_id, workspace_id, error_type, COUNT(*) AS c,
            MAX(id) AS latest_id
     FROM agentsam_error_log
     WHERE created_at >= ?${resolvedClause}
     GROUP BY tenant_id, workspace_id, error_type
     HAVING c >= ?`,
  )
    .bind(sinceUnix, THRESHOLD_BY_ERROR_TYPE)
    .all()
    .catch(() => ({ results: [] }));

  for (const g of typeGroups.results || []) {
    const latest = await env.DB.prepare(
      `SELECT id, tenant_id, workspace_id, error_type, error_message, source_id, context_json
       FROM agentsam_error_log WHERE id = ? LIMIT 1`,
    )
      .bind(g.latest_id)
      .first()
      .catch(() => null);
    if (!latest) continue;
    const out = await evaluateErrorLogThresholds(env, latest);
    for (const o of out.outcomes || []) {
      if (o.escalated) escalations += 1;
      if (o.health) healthBumps += 1;
    }
  }

  if (errCols.has('context_json')) {
    const toolGroups = await env.DB.prepare(
      `SELECT tenant_id, workspace_id, tool_name, COUNT(*) AS c, MAX(id) AS latest_id
       FROM (
         SELECT tenant_id, workspace_id, id,
           COALESCE(
             json_extract(context_json, '$.tool_name'),
             json_extract(context_json, '$.tool_key'),
             json_extract(context_json, '$.tool')
           ) AS tool_name
         FROM agentsam_error_log
         WHERE created_at >= ?${resolvedClause}
       )
       WHERE tool_name IS NOT NULL AND trim(tool_name) != ''
       GROUP BY tenant_id, workspace_id, tool_name
       HAVING c >= ?`,
    )
      .bind(sinceUnix, THRESHOLD_BY_TOOL)
      .all()
      .catch(() => ({ results: [] }));

    for (const g of toolGroups.results || []) {
      const latest = await env.DB.prepare(
        `SELECT id, tenant_id, workspace_id, error_type, error_message, source_id, context_json
         FROM agentsam_error_log WHERE id = ? LIMIT 1`,
      )
        .bind(g.latest_id)
        .first()
        .catch(() => null);
      if (!latest) continue;
      const out = await evaluateErrorLogThresholds(env, latest);
      for (const o of out.outcomes || []) {
        if (o.escalated) escalations += 1;
        if (o.health) healthBumps += 1;
      }
    }

    const modelGroups = await env.DB.prepare(
      `SELECT tenant_id, workspace_id, model_key, COUNT(*) AS c, MAX(id) AS latest_id
       FROM (
         SELECT tenant_id, workspace_id, id,
           COALESCE(
             json_extract(context_json, '$.model_key'),
             json_extract(context_json, '$.model'),
             json_extract(context_json, '$.model_attempted'),
             json_extract(context_json, '$.selected_model')
           ) AS model_key
         FROM agentsam_error_log
         WHERE created_at >= ?${resolvedClause}
       )
       WHERE model_key IS NOT NULL AND trim(model_key) != ''
       GROUP BY tenant_id, workspace_id, model_key
       HAVING c >= ?`,
    )
      .bind(sinceUnix, THRESHOLD_BY_MODEL)
      .all()
      .catch(() => ({ results: [] }));

    for (const g of modelGroups.results || []) {
      const latest = await env.DB.prepare(
        `SELECT id, tenant_id, workspace_id, error_type, error_message, source_id, context_json
         FROM agentsam_error_log WHERE id = ? LIMIT 1`,
      )
        .bind(g.latest_id)
        .first()
        .catch(() => null);
      if (!latest) continue;
      const out = await evaluateErrorLogThresholds(env, latest);
      for (const o of out.outcomes || []) {
        if (o.escalated) escalations += 1;
        if (o.health) healthBumps += 1;
      }
    }
  }

  return { ok: true, escalations, healthBumps, windowSec };
}
