/**
 * GET /api/analytics/databases/summary
 * GET /api/analytics/databases/timeseries
 * GET /api/analytics/databases/tables
 * GET /api/analytics/databases/events
 *
 * P0 telemetry: otlp_traces, agentsam_tool_call_log, agentsam_cron_runs,
 * agentsam_error_log, D1/Hyperdrive health probes. No new tables.
 */
import { analyticsResponse } from './sources/normalize.js';
import { pragmaTableInfo, tableExists } from '../../core/retention.js';
import { isHyperdriveUsable, runHyperdriveQuery } from '../../core/hyperdrive-query.js';
import {
  fetchD1AnalyticsOverview,
  IAM_D1_DATABASE_ID,
  IAM_D1_DATABASE_NAME,
  resolveCloudflareAnalyticsCreds,
} from '../../core/d1-graphql-analytics.js';

/** @param {import('@cloudflare/workers-types').D1Database} db */
async function d1All(db, label, sql, binds, warnings) {
  if (!db) return [];
  try {
    const { results } = await db.prepare(sql).bind(...binds).all();
    return results || [];
  } catch (e) {
    warnings.push({
      code: 'D1_QUERY_ERROR',
      message: `${label}: ${String(e?.message || e)}`,
      severity: 'warn',
    });
    return [];
  }
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
async function d1First(db, label, sql, binds, warnings) {
  if (!db) return null;
  try {
    return await db.prepare(sql).bind(...binds).first();
  } catch (e) {
    warnings.push({
      code: 'D1_QUERY_ERROR',
      message: `${label}: ${String(e?.message || e)}`,
      severity: 'warn',
    });
    return null;
  }
}

export function parseDatabasesRange(url) {
  const raw = String(url?.searchParams?.get('range') || '24h').toLowerCase();
  if (raw === '1h') return '1h';
  if (raw === '24h') return '24h';
  if (raw === '30d') return '30d';
  if (raw === '7d') return '7d';
  return '24h';
}

export function parseDatabasesDs(url) {
  const surface = parseDatabasesSurface(url);
  if (surface === 'cloudflare') return 'd1';
  if (surface === 'supabase') return 'supabase';
  const raw = String(url?.searchParams?.get('ds') || 'all').toLowerCase();
  if (raw === 'd1' || raw === 'supabase') return raw;
  return 'all';
}

/** @param {URL} url */
export function parseDatabasesSurface(url) {
  const surface = String(url?.searchParams?.get('surface') || '').toLowerCase();
  if (surface === 'cloudflare' || surface === 'supabase') return surface;
  const ds = String(url?.searchParams?.get('ds') || '').toLowerCase();
  if (ds === 'd1') return 'cloudflare';
  if (ds === 'supabase') return 'supabase';
  return 'cloudflare';
}

function rangeSeconds(range) {
  if (range === '1h') return 3600;
  if (range === '24h') return 86400;
  if (range === '7d') return 7 * 86400;
  if (range === '30d') return 30 * 86400;
  return 86400;
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function rangeStartSec(range) {
  return nowSec() - rangeSeconds(range);
}

function rangeStartNano(range) {
  return rangeStartSec(range) * 1_000_000_000;
}

/** @param {{ tenantId: string|null, workspaceId: string|null, tableCols: Set<string> }} scope */
function tenantWorkspaceClause(scope, binds) {
  const parts = [];
  if (scope.tenantId && scope.tableCols.has('tenant_id')) {
    parts.push('tenant_id = ?');
    binds.push(scope.tenantId);
  }
  if (scope.workspaceId && scope.tableCols.has('workspace_id')) {
    parts.push('workspace_id = ?');
    binds.push(scope.workspaceId);
  }
  return parts;
}

const SQL_DB_TOOL_D1 = `(
  tool_name IN ('d1_query','d1_schema','d1_explain','d1_write','d1_batch_write')
  OR tool_name LIKE 'd1_%'
  OR COALESCE(tool_category,'') LIKE 'database.d1%'
)`;

const SQL_DB_TOOL_SUPABASE = `(
  tool_name IN ('hyperdrive_query','hyperdrive_schema','hyperdrive_explain')
  OR tool_name LIKE 'hyperdrive_%'
  OR COALESCE(tool_category,'') LIKE 'database.hyperdrive%'
)`;

function dbToolClause(ds) {
  if (ds === 'd1') return SQL_DB_TOOL_D1;
  if (ds === 'supabase') return SQL_DB_TOOL_SUPABASE;
  return `(${SQL_DB_TOOL_D1} OR ${SQL_DB_TOOL_SUPABASE})`;
}

function pctTrend(current, previous) {
  const c = Number(current) || 0;
  const p = Number(previous) || 0;
  if (p <= 0) return { pct: c > 0 ? 100 : 0, dir: c > 0 ? 'up' : 'neutral' };
  const pct = ((c - p) / p) * 100;
  return {
    pct: Math.round(pct * 10) / 10,
    dir: pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'neutral',
  };
}

function bucketExpr(range, timeColUnixSec) {
  if (range === '1h') {
    return `CAST((${timeColUnixSec}) / 300 AS INTEGER)`;
  }
  if (range === '24h') {
    return `strftime('%H:00', datetime(${timeColUnixSec}, 'unixepoch'))`;
  }
  return `strftime('%Y-%m-%d', datetime(${timeColUnixSec}, 'unixepoch'))`;
}

function buildBucketLabels(range) {
  const start = rangeStartSec(range);
  const end = nowSec();
  const labels = [];
  if (range === '1h') {
    const step = 300;
    for (let t = start; t < end; t += step) {
      labels.push(String(Math.floor(t / 300)));
    }
    return labels.length ? labels : [String(Math.floor(start / 300))];
  }
  if (range === '24h') {
    for (let i = 0; i < 24; i++) {
      const d = new Date((start + i * 3600) * 1000);
      labels.push(`${String(d.getUTCHours()).padStart(2, '0')}:00`);
    }
    return labels;
  }
  const daySec = 86400;
  const days = range === '30d' ? 30 : 7;
  for (let i = 0; i < days; i++) {
    const d = new Date((start + i * daySec) * 1000);
    labels.push(d.toISOString().slice(0, 10));
  }
  return labels;
}

function seriesFromRows(labels, rows, key = 'bucket') {
  const map = new Map(rows.map((r) => [String(r[key]), Number(r.c ?? r.v ?? 0) || 0]));
  return labels.map((l) => map.get(l) ?? 0);
}

function formatBytes(n) {
  const b = Number(n) || 0;
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`;
  if (b >= 1e3) return `${(b / 1e3).toFixed(1)} KB`;
  return `${b} B`;
}

function formatActivityCount(n, suffix) {
  const v = Number(n) || 0;
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B ${suffix}`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M ${suffix}`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}k ${suffix}`;
  return `${v} ${suffix}`;
}

/** @param {string} sql */
function extractTableNamesFromSql(sql) {
  if (!sql || typeof sql !== 'string') return [];
  const cleaned = sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
  const found = new Set();
  const re =
    /\b(?:FROM|JOIN|INTO|UPDATE|TABLE)\s+(?:"([^"]+)"|'([^']+)'|`([^`]+)`|([a-zA-Z_][a-zA-Z0-9_]*))/gi;
  let m;
  while ((m = re.exec(cleaned)) !== null) {
    const name = (m[1] || m[2] || m[3] || m[4] || '').trim();
    const lower = name.toLowerCase();
    if (!name || lower === 'select' || lower === 'dual' || name.startsWith('sqlite_')) continue;
    found.add(name);
  }
  return [...found];
}

/**
 * @param {Array<{ name: string, val: string, ds: 'd1'|'supabase', sort: number }>} items
 * @param {'d1'|'supabase'|'all'} dsFilter
 */
function topHotTables(items, dsFilter, limit = 5) {
  let list = items;
  if (dsFilter !== 'all') list = list.filter((x) => x.ds === dsFilter);
  return [...list]
    .sort((a, b) => b.sort - a.sort)
    .slice(0, limit)
    .map(({ name, val, ds }) => ({ name, val, ds }));
}

/** Remote D1 has no dbstat — estimate largest tables by row count on hot paths. */
const D1_LARGEST_TABLE_CANDIDATES = [
  'otlp_traces',
  'agentsam_tool_call_log',
  'agentsam_error_log',
  'agentsam_mcp_tool_execution',
  'agentsam_hook_execution',
  'agentsam_cron_runs',
  'agentsam_memory',
  'agentsam_workflow_runs',
  'agentsam_webhook_events',
  'vectorize_sync_log',
  'worker_analytics_errors',
  'agentsam_execution_steps',
  'security_findings',
  'secret_audit_log',
];

/** @param {import('@cloudflare/workers-types').D1Database} db */
async function loadD1LargestTables(db, warnings) {
  const out = [];
  for (const tableName of D1_LARGEST_TABLE_CANDIDATES) {
    if (!(await tableExists(db, tableName))) continue;
    const row = await d1First(
      db,
      `d1_rows_${tableName}`,
      `SELECT COUNT(*) AS c FROM ${tableName}`,
      [],
      warnings,
    );
    const count = Number(row?.c) || 0;
    if (count <= 0) continue;
    out.push({
      name: tableName,
      val: `${formatActivityCount(count, 'rows')} · est.`,
      ds: /** @type {'d1'} */ ('d1'),
      sort: count,
    });
  }
  out.sort((a, b) => b.sort - a.sort);
  return out.slice(0, 5);
}

/**
 * Estimate rows read/written from tool_call_log JSON payloads (D1/Hyperdrive tools).
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
async function aggregateToolCallRowEstimates(db, scope, range, ds, warnings) {
  if (!(await tableExists(db, 'agentsam_tool_call_log'))) {
    return { rowsRead: 0, rowsWritten: 0, rowsReadPrev: 0, rowsWrittenPrev: 0 };
  }
  const cols = await pragmaTableInfo(db, 'agentsam_tool_call_log');
  if (!cols.has('created_at') || !cols.has('output_json')) {
    return { rowsRead: 0, rowsWritten: 0, rowsReadPrev: 0, rowsWrittenPrev: 0 };
  }

  const start = rangeStartSec(range);
  const prevStart = start - rangeSeconds(range);

  const buildSql = (timeClause, timeBinds) => {
    const binds = [...timeBinds];
    const where = [timeClause, dbToolClause(ds)];
    where.push(...tenantWorkspaceClause({ ...scope, tableCols: cols }, binds));
    const sql = `SELECT
        COALESCE(SUM(
          CASE
            WHEN json_valid(COALESCE(output_json, ''))
             AND json_type(json_extract(output_json, '$.results')) = 'array'
            THEN json_array_length(json_extract(output_json, '$.results'))
            WHEN json_valid(COALESCE(output_json, ''))
             AND json_extract(output_json, '$.row_count') IS NOT NULL
            THEN CAST(json_extract(output_json, '$.row_count') AS INTEGER)
            ELSE 0
          END
        ), 0) AS rr,
        COALESCE(SUM(
          CASE
            WHEN json_valid(COALESCE(output_json, ''))
             AND json_extract(output_json, '$.meta.changes') IS NOT NULL
            THEN CAST(json_extract(output_json, '$.meta.changes') AS INTEGER)
            WHEN json_valid(COALESCE(output_json, ''))
             AND json_extract(output_json, '$.changes') IS NOT NULL
            THEN CAST(json_extract(output_json, '$.changes') AS INTEGER)
            ELSE 0
          END
        ), 0) AS rw
      FROM agentsam_tool_call_log
      WHERE ${where.join(' AND ')}`;
    return { sql, binds };
  };

  const cur = buildSql('created_at >= ?', [start]);
  const curRow = await d1First(db, 'tcl_row_est', cur.sql, cur.binds, warnings);
  const prev = buildSql('created_at >= ? AND created_at < ?', [prevStart, start]);
  const prevRow = await d1First(db, 'tcl_row_est_prev', prev.sql, prev.binds, warnings);

  return {
    rowsRead: Number(curRow?.rr ?? 0) || 0,
    rowsWritten: Number(curRow?.rw ?? 0) || 0,
    rowsReadPrev: Number(prevRow?.rr ?? 0) || 0,
    rowsWrittenPrev: Number(prevRow?.rw ?? 0) || 0,
  };
}

/** @param {number[]} durations @param {number} [maxMs] */
function percentileMs(durations, pct, maxMs = 120_000) {
  const filtered = durations.filter((d) => Number.isFinite(d) && d >= 0 && d <= maxMs);
  if (!filtered.length) return 0;
  filtered.sort((a, b) => a - b);
  const idx = Math.min(filtered.length - 1, Math.floor(filtered.length * pct));
  return filtered[idx];
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
async function loadD1OtlpHotTables(db, scope, range, warnings) {
  if (!(await tableExists(db, 'otlp_traces'))) return { mostRead: [], mostWritten: [] };
  const cols = await pragmaTableInfo(db, 'otlp_traces');
  if (!cols.has('d1_query')) return { mostRead: [], mostWritten: [] };

  const binds = [rangeStartNano(range)];
  const where = [`start_time_unix_nano >= ?`, `d1_query IS NOT NULL`, `TRIM(d1_query) != ''`];
  where.push(...tenantWorkspaceClause({ ...scope, tableCols: cols }, binds));

  const rows = await d1All(
    db,
    'otlp_hot_tables',
    `SELECT d1_query,
            COALESCE(SUM(d1_rows_read), 0) AS rr,
            COALESCE(SUM(d1_rows_written), 0) AS rw
     FROM otlp_traces
     WHERE ${where.join(' AND ')}
     GROUP BY d1_query
     ORDER BY rr DESC
     LIMIT 40`,
    binds,
    warnings,
  );

  const readMap = new Map();
  const writeMap = new Map();
  for (const row of rows) {
    const tables = extractTableNamesFromSql(String(row.d1_query || ''));
    const rr = Number(row.rr) || 0;
    const rw = Number(row.rw) || 0;
    for (const t of tables) {
      readMap.set(t, (readMap.get(t) || 0) + rr);
      writeMap.set(t, (writeMap.get(t) || 0) + rw);
    }
  }

  const mostRead = [...readMap.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, v]) => ({
      name,
      val: `${formatActivityCount(v, 'rows')} · ${range}`,
      ds: /** @type {'d1'} */ ('d1'),
      sort: v,
    }));

  const mostWritten = [...writeMap.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, v]) => ({
      name,
      val: `${formatActivityCount(v, 'rows')} · ${range}`,
      ds: /** @type {'d1'} */ ('d1'),
      sort: v,
    }));

  return { mostRead, mostWritten };
}

/** @param {any} env @param {Array<{code:string,message:string,severity?:string}>} warnings */
async function countSupabaseTables(env, warnings) {
  if (!isHyperdriveUsable(env)) return null;
  const r = await runHyperdriveQuery(
    env,
    `SELECT COUNT(*)::int AS c
     FROM information_schema.tables
     WHERE table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
       AND table_type = 'BASE TABLE'`,
    [],
  );
  if (!r.ok) {
    warnings.push({
      code: 'PG_TABLE_COUNT_FAILED',
      message: r.error || 'Could not count Postgres tables',
      severity: 'warn',
    });
    return null;
  }
  return Number(r.rows[0]?.c ?? 0) || 0;
}

/** @param {any} env @param {Array<{code:string,message:string,severity?:string}>} warnings */
async function loadSupabaseHotTables(env, warnings) {
  if (!isHyperdriveUsable(env)) {
    return { count: null, largest: [], mostRead: [], mostWritten: [] };
  }

  const count = await countSupabaseTables(env, warnings);
  const r = await runHyperdriveQuery(
    env,
    `SELECT
       schemaname,
       relname,
       pg_total_relation_size(relid) AS size_bytes,
       COALESCE(seq_scan, 0) + COALESCE(idx_scan, 0) AS read_count,
       COALESCE(n_tup_ins, 0) + COALESCE(n_tup_upd, 0) + COALESCE(n_tup_del, 0) AS write_count
     FROM pg_stat_user_tables
     WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
     ORDER BY pg_total_relation_size(relid) DESC NULLS LAST
     LIMIT 200`,
    [],
  );

  if (!r.ok) {
    warnings.push({
      code: 'PG_HOT_TABLES_FAILED',
      message: r.error || 'pg_stat_user_tables query failed',
      severity: 'warn',
    });
    return { count, largest: [], mostRead: [], mostWritten: [] };
  }

  const largest = [];
  const mostRead = [];
  const mostWritten = [];
  for (const row of r.rows) {
    const schema = String(row.schemaname || 'public');
    const rel = String(row.relname || '');
    if (!rel) continue;
    const name = pgQualifiedName(schema, rel);
    const sizeBytes = Number(row.size_bytes) || 0;
    const readCount = Number(row.read_count) || 0;
    const writeCount = Number(row.write_count) || 0;
    largest.push({
      name,
      val: formatBytes(sizeBytes),
      ds: /** @type {'supabase'} */ ('supabase'),
      sort: sizeBytes,
    });
    mostRead.push({
      name,
      val: `${formatActivityCount(readCount, 'scans')} · cumulative`,
      ds: /** @type {'supabase'} */ ('supabase'),
      sort: readCount,
    });
    mostWritten.push({
      name,
      val: `${formatActivityCount(writeCount, 'tuples')} · cumulative`,
      ds: /** @type {'supabase'} */ ('supabase'),
      sort: writeCount,
    });
  }

  largest.sort((a, b) => b.sort - a.sort);
  mostRead.sort((a, b) => b.sort - a.sort);
  mostWritten.sort((a, b) => b.sort - a.sort);

  return {
    count,
    largest: largest.slice(0, 5),
    mostRead: mostRead.slice(0, 5),
    mostWritten: mostWritten.slice(0, 5),
  };
}

const D1_STORAGE_LIMIT_BYTES = 10 * 1024 * 1024 * 1024;
/** Supabase provisioned disk display when tier metadata is unavailable. */
const SUPABASE_PROVISIONED_BYTES = 8 * 1024 * 1024 * 1024;

/** @param {number|null|undefined} pct */
function capacityLevel(pct) {
  if (pct == null || Number.isNaN(pct)) return 'unknown';
  if (pct >= 90) return 'critical';
  if (pct >= 75) return 'action';
  if (pct >= 50) return 'watch';
  return 'ok';
}

/**
 * @param {number} epochSec
 */
function formatRelativeEpoch(epochSec) {
  if (!epochSec) return null;
  const delta = Math.max(0, Math.floor(Date.now() / 1000) - epochSec);
  if (delta < 3600) return `${Math.max(1, Math.floor(delta / 60))}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  return `${Math.floor(delta / 86400)}d ago`;
}

/**
 * @param {{ usedBytes?: number|null, limitBytes: number, usedLabel?: string|null, limitLabel: string, subtitle?: string|null, subtitleOk?: boolean, level?: string, retentionAt?: number|null, retentionOk?: boolean, connectionsUsed?: number|null, connectionsMax?: number|null, hyperdriveStatus?: string|null, hyperdriveLatencyMs?: number|null, autovacuumAt?: number|null }} opts
 */
function buildCapacityPayload(opts) {
  const usedBytes = opts.usedBytes ?? null;
  const limitBytes = opts.limitBytes;
  const pctUsed =
    usedBytes != null && limitBytes > 0
      ? Math.round((usedBytes / limitBytes) * 1000) / 10
      : null;
  return {
    usedBytes,
    limitBytes,
    usedLabel: opts.usedLabel ?? (usedBytes != null ? formatBytes(usedBytes) : null),
    limitLabel: opts.limitLabel,
    pctUsed,
    level: opts.level ?? capacityLevel(pctUsed),
    subtitle: opts.subtitle ?? null,
    subtitleOk: opts.subtitleOk ?? true,
    retentionAt: opts.retentionAt ?? null,
    retentionOk: opts.retentionOk ?? null,
    autovacuumAt: opts.autovacuumAt ?? null,
    connectionsUsed: opts.connectionsUsed ?? null,
    connectionsMax: opts.connectionsMax ?? null,
    hyperdriveStatus: opts.hyperdriveStatus ?? null,
    hyperdriveLatencyMs: opts.hyperdriveLatencyMs ?? null,
    wired: usedBytes != null && usedBytes > 0,
  };
}

/** @param {import('@cloudflare/workers-types').D1Database|null|undefined} db @param {Array<{code:string,message:string,severity?:string}>} warnings */
async function loadLastRetentionRun(db, warnings) {
  if (!db || !(await tableExists(db, 'agentsam_cron_runs'))) return null;
  const cols = await pragmaTableInfo(db, 'agentsam_cron_runs');
  if (!cols.has('started_at')) return null;
  const jobCol = cols.has('job_name') ? 'job_name' : cols.has('cron_job') ? 'cron_job' : null;
  if (!jobCol) return null;
  const row = await d1First(
    db,
    'last_retention',
    `SELECT started_at, status FROM agentsam_cron_runs
     WHERE ${jobCol} = 'one_am_compaction_pipeline'
     ORDER BY started_at DESC LIMIT 1`,
    [],
    warnings,
  );
  if (!row) return null;
  const status = String(row.status || 'unknown').toLowerCase();
  return {
    at: Number(row.started_at) || null,
    ok: !['error', 'failed'].includes(status),
    status,
  };
}

/** @param {any} env @param {Array<{code:string,message:string,severity?:string}>} warnings */
async function loadSupabaseOpsSignals(env, warnings) {
  if (!isHyperdriveUsable(env)) {
    return { maxConnections: null, lastAutovacuumAt: null, wired: false };
  }
  const maxR = await runHyperdriveQuery(
    env,
    `SELECT setting::int AS v FROM pg_settings WHERE name = 'max_connections'`,
    [],
  );
  const vacR = await runHyperdriveQuery(
    env,
    `SELECT EXTRACT(EPOCH FROM MAX(GREATEST(
       COALESCE(last_autovacuum, 'epoch'::timestamptz),
       COALESCE(last_vacuum, 'epoch'::timestamptz)
     )))::bigint AS ts
     FROM pg_stat_user_tables
     WHERE schemaname NOT IN ('pg_catalog', 'information_schema')`,
    [],
  );
  if (!maxR.ok) {
    warnings.push({
      code: 'PG_MAX_CONNECTIONS_FAILED',
      message: maxR.error || 'max_connections query failed',
      severity: 'info',
    });
  }
  if (!vacR.ok) {
    warnings.push({
      code: 'PG_AUTOVACUUM_PROBE_FAILED',
      message: vacR.error || 'autovacuum probe failed',
      severity: 'info',
    });
  }
  const vacTs = vacR.ok ? Number(vacR.rows[0]?.ts) || null : null;
  return {
    maxConnections: maxR.ok ? Number(maxR.rows[0]?.v) || null : null,
    lastAutovacuumAt: vacTs && vacTs > 0 ? vacTs : null,
    wired: maxR.ok || vacR.ok,
  };
}

function pgQualifiedName(schema, rel) {
  const s = String(schema || 'public');
  const r = String(rel || '');
  return s === 'public' ? r : `${s}.${r}`;
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
async function loadD1StorageEstimate(db, warnings) {
  const row = await d1First(
    db,
    'd1_storage',
    'SELECT (page_count * page_size) AS bytes FROM pragma_page_count(), pragma_page_size()',
    [],
    warnings,
  );
  const usedBytes = Number(row?.bytes) || 0;
  if (usedBytes <= 0) return { usedBytes: null, limitBytes: D1_STORAGE_LIMIT_BYTES, wired: false };
  return { usedBytes, limitBytes: D1_STORAGE_LIMIT_BYTES, wired: true };
}

/** @param {any} env @param {Array<{code:string,message:string,severity?:string}>} warnings */
async function loadSupabaseStorage(env, warnings) {
  if (!isHyperdriveUsable(env)) {
    return {
      usedBytes: null,
      limitBytes: SUPABASE_PROVISIONED_BYTES,
      connections: null,
      largeObjects: [],
      wired: false,
    };
  }

  const sizeR = await runHyperdriveQuery(env, 'SELECT pg_database_size(current_database())::bigint AS bytes', []);
  const connR = await runHyperdriveQuery(
    env,
    `SELECT count(*)::int AS c FROM pg_stat_activity WHERE datname = current_database()`,
    [],
  );
  const objR = await runHyperdriveQuery(
    env,
    `SELECT schemaname, relname, pg_total_relation_size(relid) AS size_bytes
     FROM pg_stat_user_tables
     WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
     ORDER BY pg_total_relation_size(relid) DESC NULLS LAST
     LIMIT 8`,
    [],
  );

  const usedBytes = sizeR.ok ? Number(sizeR.rows[0]?.bytes) || 0 : null;
  const connections = connR.ok ? Number(connR.rows[0]?.c) || 0 : null;

  if (!sizeR.ok) {
    warnings.push({
      code: 'PG_STORAGE_SIZE_FAILED',
      message: sizeR.error || 'pg_database_size query failed',
      severity: 'warn',
    });
  }

  const largeObjects = [];
  if (objR.ok) {
    const total = usedBytes && usedBytes > 0 ? usedBytes : 1;
    for (const row of objR.rows) {
      const sizeBytes = Number(row.size_bytes) || 0;
      if (sizeBytes <= 0) continue;
      largeObjects.push({
        name: pgQualifiedName(row.schemaname, row.relname),
        size: formatBytes(sizeBytes),
        sizeBytes,
        pct: `${((sizeBytes / total) * 100).toFixed(2)}%`,
      });
    }
  }

  return {
    usedBytes,
    limitBytes: SUPABASE_PROVISIONED_BYTES,
    connections,
    largeObjects: largeObjects.slice(0, 5),
    wired: usedBytes != null,
  };
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
async function loadD1SchemaHealth(db, warnings, limit = 8) {
  const tables = await d1All(
    db,
    'd1_schema_tables',
    `SELECT name FROM sqlite_master
     WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'
     ORDER BY name`,
    [],
    warnings,
  );

  const noPrimaryKey = [];
  const missingIndexes = [];

  for (const row of tables) {
    const tableName = String(row.name || '');
    if (!tableName) continue;
    const safe = tableName.replace(/"/g, '""');

    const info = await d1All(db, `d1_pk_${tableName}`, `PRAGMA table_info("${safe}")`, [], warnings);
    const hasPk = info.some((c) => Number(c.pk) > 0);
    if (!hasPk) {
      noPrimaryKey.push({ name: tableName, ds: 'd1', severity: 'warn' });
    }

    const indexes = await d1All(db, `d1_idx_${tableName}`, `PRAGMA index_list("${safe}")`, [], warnings);
    const hasUserIndex = indexes.some((ix) => {
      const n = String(ix.name || '');
      return n && !n.startsWith('sqlite_autoindex');
    });
    if (!hasUserIndex && !hasPk) {
      missingIndexes.push({ name: tableName, ds: 'd1', severity: 'warn' });
    } else if (!hasUserIndex && hasPk) {
      const rowCount = await d1First(db, `d1_rc_${tableName}`, `SELECT COUNT(*) AS c FROM "${safe}"`, [], warnings);
      if (Number(rowCount?.c) > 5000) {
        missingIndexes.push({ name: tableName, ds: 'd1', severity: 'info' });
      }
    }

    if (noPrimaryKey.length >= limit && missingIndexes.length >= limit) break;
  }

  return { noPrimaryKey: noPrimaryKey.slice(0, limit), missingIndexes: missingIndexes.slice(0, limit), fkIssues: [] };
}

/** @param {any} env @param {Array<{code:string,message:string,severity?:string}>} warnings */
async function loadSupabaseSchemaHealth(env, warnings, limit = 8) {
  if (!isHyperdriveUsable(env)) {
    return { noPrimaryKey: [], missingIndexes: [], fkIssues: [], wired: false };
  }

  const noPkR = await runHyperdriveQuery(
    env,
    `SELECT n.nspname AS schemaname, c.relname AS relname
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind = 'r'
       AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
       AND NOT EXISTS (
         SELECT 1 FROM pg_constraint con
         WHERE con.conrelid = c.oid AND con.contype = 'p'
       )
     ORDER BY n.nspname, c.relname
     LIMIT ${limit}`,
    [],
  );

  const missIdxR = await runHyperdriveQuery(
    env,
    `SELECT schemaname, relname
     FROM pg_stat_user_tables
     WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
       AND seq_scan > 100
       AND COALESCE(idx_scan, 0) < seq_scan
     ORDER BY seq_scan DESC
     LIMIT ${limit}`,
    [],
  );

  const fkR = await runHyperdriveQuery(
    env,
    `SELECT conname, conrelid::regclass::text AS table_name
     FROM pg_constraint
     WHERE contype = 'f' AND NOT convalidated
     LIMIT ${limit}`,
    [],
  );

  if (!noPkR.ok) {
    warnings.push({
      code: 'PG_SCHEMA_PK_SCAN_FAILED',
      message: noPkR.error || 'Postgres PK scan failed',
      severity: 'warn',
    });
  }

  const noPrimaryKey = (noPkR.ok ? noPkR.rows : []).map((r) => ({
    name: pgQualifiedName(r.schemaname, r.relname),
    ds: 'supabase',
    severity: 'warn',
  }));

  const missingIndexes = (missIdxR.ok ? missIdxR.rows : []).map((r) => ({
    name: pgQualifiedName(r.schemaname, r.relname),
    ds: 'supabase',
    severity: 'info',
  }));

  const fkIssues = (fkR.ok ? fkR.rows : []).map((r) => ({
    name: String(r.table_name || r.conname || ''),
    ds: 'supabase',
    severity: 'warn',
  }));

  return { noPrimaryKey, missingIndexes, fkIssues, wired: noPkR.ok || missIdxR.ok };
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ tenantId: string|null, workspaceId: string|null }} scope
 * @param {string} range
 */
async function loadRecentDbEvents(db, scope, range, warnings) {
  if (!(await tableExists(db, 'agentsam_tool_call_log'))) return [];
  const cols = await pragmaTableInfo(db, 'agentsam_tool_call_log');
  if (!cols.has('created_at')) return [];

  const binds = [rangeStartSec(range)];
  const where = ['created_at >= ?', `(${SQL_DB_TOOL_D1} OR ${SQL_DB_TOOL_SUPABASE})`];
  where.push(...tenantWorkspaceClause({ ...scope, tableCols: cols }, binds));

  const detailExpr = cols.has('input_summary')
    ? `COALESCE(NULLIF(trim(input_summary), ''), tool_name)`
    : 'tool_name';

  const rows = await d1All(
    db,
    'db_recent_events',
    `SELECT tool_name, status, ${detailExpr} AS detail, created_at, COALESCE(duration_ms, 0) AS duration_ms
     FROM agentsam_tool_call_log
     WHERE ${where.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT 12`,
    binds,
    warnings,
  );

  return rows.map((r) => {
    const status = String(r.status || '').toLowerCase();
    const isErr = status === 'error' || status === 'failed';
    const ms = Number(r.duration_ms) || 0;
    const tool = String(r.tool_name || '');
    const ds = tool.includes('hyperdrive') ? 'supabase' : 'd1';
    let kind = 'ok';
    if (isErr) kind = 'err';
    else if (ms >= 1500) kind = 'warn';
    else if (tool.includes('schema') || tool.includes('write')) kind = 'info';

    const created = Number(r.created_at) || 0;
    const d = created ? new Date(created * 1000) : new Date();
    const time = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;

    return {
      time,
      kind,
      datasource: ds,
      label: isErr ? `${ds === 'supabase' ? 'Hyperdrive' : 'D1'} error` : `${ds === 'supabase' ? 'Hyperdrive' : 'D1'} query`,
      detail: String(r.detail || tool).slice(0, 200),
      meta: isErr ? ds : ms > 0 ? `${ms} ms` : ds,
      created_at: created,
    };
  });
}

/**
 * @param {any} env
 * @param {{ tenantId: string|null, workspaceId: string|null }} scope
 * @param {string} range
 * @param {string} ds
 * @param {Array<{code:string,message:string,severity?:string}>} warnings
 */
async function probeHealth(env, scope, warnings) {
  const out = {
    d1: { status: 'unknown', latencyMs: null, tableCount: null },
    supabase: { tableCount: null },
    hyperdrive: { status: 'unknown', latencyMs: null },
    errorRatePct: null,
    lastErrorAt: null,
  };

  if (env?.DB) {
    const t0 = Date.now();
    const ping = await d1First(env.DB, 'd1_ping', 'SELECT 1 AS ok', [], warnings);
    out.d1.latencyMs = Date.now() - t0;
    out.d1.status = ping?.ok === 1 ? 'healthy' : 'degraded';

    const tc = await d1First(
      env.DB,
      'd1_tables',
      `SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
      [],
      warnings,
    );
    out.d1.tableCount = Number(tc?.c ?? 0) || 0;
  } else {
    warnings.push({
      code: 'D1_BINDING_MISSING',
      message: 'D1 binding not configured.',
      severity: 'warn',
    });
  }

  if (isHyperdriveUsable(env)) {
    const t0 = Date.now();
    const r = await runHyperdriveQuery(env, 'SELECT 1 AS ok', []);
    out.hyperdrive.latencyMs = Date.now() - t0;
    out.hyperdrive.status = r.ok ? 'healthy' : 'error';
    if (!r.ok) {
      warnings.push({
        code: 'HYPERDRIVE_PROBE_FAILED',
        message: r.error || 'Hyperdrive SELECT 1 failed',
        severity: 'warn',
      });
    } else {
      out.supabase.tableCount = await countSupabaseTables(env, warnings);
    }
  } else {
    warnings.push({
      code: 'HYPERDRIVE_NOT_USABLE',
      message: 'Hyperdrive binding not usable; Supabase-side charts use agentsam_tool_call_log only.',
      severity: 'info',
    });
  }

  return out;
}

/**
 * @param {any} env
 * @param {{ tenantId: string|null, workspaceId: string|null }} scope
 * @param {string} range
 * @param {string} ds
 */
async function aggregateKpis(env, scope, range, ds, warnings) {
  const db = env?.DB;
  const start = rangeStartSec(range);
  const prevStart = start - rangeSeconds(range);
  const startNano = start * 1_000_000_000;
  const prevNano = prevStart * 1_000_000_000;

  let queries = 0;
  let queriesPrev = 0;
  let rowsRead = 0;
  let rowsReadPrev = 0;
  let rowsWritten = 0;
  let rowsWrittenPrev = 0;
  let errors = 0;
  let errorsPrev = 0;
  const durations = [];

  if (db && (ds === 'all' || ds === 'd1') && (await tableExists(db, 'otlp_traces'))) {
    const cols = await pragmaTableInfo(db, 'otlp_traces');
    const binds = [];
    const where = [`start_time_unix_nano >= ?`];
    binds.push(startNano);
    where.push(...tenantWorkspaceClause({ ...scope, tableCols: cols }, binds));

    const row = await d1First(
      db,
      'otlp_kpi',
      `SELECT
         COUNT(*) AS c,
         COALESCE(SUM(d1_rows_read), 0) AS rr,
         COALESCE(SUM(d1_rows_written), 0) AS rw,
         SUM(CASE WHEN LOWER(COALESCE(status_code,'')) = 'error' THEN 1 ELSE 0 END) AS err
       FROM otlp_traces WHERE ${where.join(' AND ')}`,
      binds,
      warnings,
    );
    queries += Number(row?.c ?? 0);
    rowsRead += Number(row?.rr ?? 0);
    rowsWritten += Number(row?.rw ?? 0);
    errors += Number(row?.err ?? 0);

    const scopeBinds = binds.slice(1);
    const prevRow = await d1First(
      db,
      'otlp_kpi_prev',
      `SELECT COUNT(*) AS c,
              COALESCE(SUM(d1_rows_read), 0) AS rr,
              COALESCE(SUM(d1_rows_written), 0) AS rw,
              SUM(CASE WHEN LOWER(COALESCE(status_code,'')) = 'error' THEN 1 ELSE 0 END) AS err
       FROM otlp_traces
       WHERE start_time_unix_nano >= ? AND start_time_unix_nano < ?
         ${scopeBinds.length ? `AND ${where.slice(1).join(' AND ')}` : ''}`,
      [prevNano, startNano, ...scopeBinds],
      warnings,
    );
    queriesPrev += Number(prevRow?.c ?? 0);
    rowsReadPrev += Number(prevRow?.rr ?? 0);
    rowsWrittenPrev += Number(prevRow?.rw ?? 0);
    errorsPrev += Number(prevRow?.err ?? 0);

    const durRows = await d1All(
      db,
      'otlp_dur',
      `SELECT CAST((end_time_unix_nano - start_time_unix_nano) / 1000000 AS INTEGER) AS ms
       FROM otlp_traces WHERE ${where.join(' AND ')} AND end_time_unix_nano > start_time_unix_nano
       LIMIT 5000`,
      binds,
      warnings,
    );
    for (const d of durRows) {
      const ms = Number(d.ms);
      if (ms >= 0 && ms < 600_000) durations.push(ms);
    }
  }

  if (db && (await tableExists(db, 'agentsam_tool_call_log'))) {
    const cols = await pragmaTableInfo(db, 'agentsam_tool_call_log');
    const timeCol = cols.has('created_at') ? 'created_at' : null;
    if (timeCol) {
      const binds = [start];
      const where = [`${timeCol} >= ?`, dbToolClause(ds)];
      where.push(...tenantWorkspaceClause({ ...scope, tableCols: cols }, binds));

      const row = await d1First(
        db,
        'tcl_kpi',
        `SELECT COUNT(*) AS c,
                SUM(CASE WHEN LOWER(COALESCE(status,'')) IN ('error','failed') THEN 1 ELSE 0 END) AS err
         FROM agentsam_tool_call_log WHERE ${where.join(' AND ')}`,
        binds,
        warnings,
      );
      queries += Number(row?.c ?? 0);
      errors += Number(row?.err ?? 0);

      const prevBinds = [prevStart, start, ...binds.slice(1)];
      const prevRow = await d1First(
        db,
        'tcl_kpi_prev',
        `SELECT COUNT(*) AS c,
                SUM(CASE WHEN LOWER(COALESCE(status,'')) IN ('error','failed') THEN 1 ELSE 0 END) AS err
         FROM agentsam_tool_call_log
         WHERE ${timeCol} >= ? AND ${timeCol} < ? AND ${where.slice(1).join(' AND ')}`,
        prevBinds,
        warnings,
      );
      queriesPrev += Number(prevRow?.c ?? 0);
      errorsPrev += Number(prevRow?.err ?? 0);

      if (cols.has('duration_ms')) {
        const durRows = await d1All(
          db,
          'tcl_dur',
          `SELECT COALESCE(duration_ms, 0) AS ms FROM agentsam_tool_call_log
           WHERE ${where.join(' AND ')} AND COALESCE(duration_ms, 0) > 0 LIMIT 5000`,
          binds,
          warnings,
        );
        for (const d of durRows) {
          const ms = Number(d.ms);
          if (ms >= 0 && ms <= 120_000) durations.push(ms);
        }
      }
    }
  }

  if (db && (ds === 'all' || ds === 'd1') && (await tableExists(db, 'agentsam_cron_runs'))) {
    const cols = await pragmaTableInfo(db, 'agentsam_cron_runs');
    if (cols.has('started_at')) {
      const binds = [start];
      const where = [`started_at >= ?`];
      where.push(...tenantWorkspaceClause({ ...scope, tableCols: cols }, binds));
      const row = await d1First(
        db,
        'cron_kpi',
        `SELECT COALESCE(SUM(rows_read),0) AS rr, COALESCE(SUM(rows_written),0) AS rw,
                SUM(CASE WHEN LOWER(COALESCE(status,'')) IN ('error','failed') THEN 1 ELSE 0 END) AS err
         FROM agentsam_cron_runs WHERE ${where.join(' AND ')}`,
        binds,
        warnings,
      );
      rowsRead += Number(row?.rr ?? 0);
      rowsWritten += Number(row?.rw ?? 0);
      errors += Number(row?.err ?? 0);

      const cronPrevBinds = [prevStart, start];
      const cronPrevWhere = ['started_at >= ?', 'started_at < ?'];
      cronPrevWhere.push(...tenantWorkspaceClause({ ...scope, tableCols: cols }, cronPrevBinds));
      const prevRow = await d1First(
        db,
        'cron_kpi_prev',
        `SELECT COALESCE(SUM(rows_read),0) AS rr, COALESCE(SUM(rows_written),0) AS rw
         FROM agentsam_cron_runs WHERE ${cronPrevWhere.join(' AND ')}`,
        cronPrevBinds,
        warnings,
      );
      rowsReadPrev += Number(prevRow?.rr ?? 0);
      rowsWrittenPrev += Number(prevRow?.rw ?? 0);
    }
  }

  if (db && (await tableExists(db, 'agentsam_error_log'))) {
    const cols = await pragmaTableInfo(db, 'agentsam_error_log');
    if (cols.has('created_at')) {
      const binds = [start];
      const where = [`created_at >= ?`];
      where.push(...tenantWorkspaceClause({ ...scope, tableCols: cols }, binds));
      const dbFilter = `(LOWER(COALESCE(source,'')) LIKE '%d1%'
        OR LOWER(COALESCE(source,'')) LIKE '%sql%'
        OR LOWER(COALESCE(source,'')) LIKE '%hyperdrive%'
        OR LOWER(COALESCE(error_message,'')) LIKE '%d1%'
        OR LOWER(COALESCE(error_message,'')) LIKE '%sql%'
        OR LOWER(COALESCE(error_message,'')) LIKE '%hyperdrive%')`;
      if (ds === 'd1') where.push(`(LOWER(COALESCE(source,'')) LIKE '%d1%' OR LOWER(COALESCE(error_message,'')) LIKE '%d1%')`);
      else if (ds === 'supabase') {
        where.push(`(LOWER(COALESCE(source,'')) LIKE '%hyperdrive%' OR LOWER(COALESCE(error_message,'')) LIKE '%postgres%')`);
      } else where.push(dbFilter);

      const row = await d1First(
        db,
        'err_kpi',
        `SELECT COUNT(*) AS c FROM agentsam_error_log WHERE ${where.join(' AND ')}`,
        binds,
        warnings,
      );
      const ec = Number(row?.c ?? 0);
      errors += ec;

      const prevRow = await d1First(
        db,
        'err_kpi_prev',
        `SELECT COUNT(*) AS c FROM agentsam_error_log
         WHERE created_at >= ? AND created_at < ? AND ${where.slice(1).join(' AND ')}`,
        [prevStart, start, ...binds.slice(1)],
        warnings,
      );
      errorsPrev += Number(prevRow?.c ?? 0);
    }
  }

  const toolRows = db
    ? await aggregateToolCallRowEstimates(db, scope, range, ds, warnings)
    : { rowsRead: 0, rowsWritten: 0, rowsReadPrev: 0, rowsWrittenPrev: 0 };
  rowsRead += toolRows.rowsRead;
  rowsWritten += toolRows.rowsWritten;
  rowsReadPrev += toolRows.rowsReadPrev;
  rowsWrittenPrev += toolRows.rowsWrittenPrev;

  const p95 = percentileMs(durations, 0.95);

  return {
    queries,
    queriesPrev,
    rowsRead,
    rowsReadPrev,
    rowsWritten,
    rowsWrittenPrev,
    errors,
    errorsPrev,
    p95Ms: p95,
  };
}

export async function handleDatabasesSummary(request, url, env, { tenantId, workspaceId }) {
  void request;
  const range = parseDatabasesRange(url);
  const ds = parseDatabasesDs(url);
  const warnings = [];
  const wired = {
    kpis: false,
    miniStats: false,
    healthCards: false,
    envFilter: false,
  };

  if (url.searchParams.get('env') && url.searchParams.get('env') !== 'production') {
    warnings.push({
      code: 'ENV_FILTER_NOT_WIRED',
      message: 'Environment filter (staging/production) is not stored on telemetry rows yet.',
      severity: 'info',
    });
    wired.envFilter = false;
  }

  const scope = {
    tenantId: tenantId && String(tenantId).trim() ? String(tenantId).trim() : null,
    workspaceId: workspaceId && String(workspaceId).trim() ? String(workspaceId).trim() : null,
  };

  if (!scope.tenantId) {
    warnings.push({
      code: 'TENANT_ID_MISSING',
      message: 'No tenant_id on session; KPIs may be empty until the account is tenant-scoped.',
      severity: 'warn',
    });
  }

  const health = await probeHealth(env, scope, warnings);
  const d1Storage = env?.DB ? await loadD1StorageEstimate(env.DB, warnings) : { usedBytes: null, wired: false };
  const supStorage = await loadSupabaseStorage(env, warnings);
  const kpiRaw = await aggregateKpis(env, scope, range, ds, warnings);

  const hasSignal =
    kpiRaw.queries > 0 ||
    kpiRaw.rowsRead > 0 ||
    kpiRaw.rowsWritten > 0 ||
    kpiRaw.errors > 0 ||
    health.d1.tableCount > 0;

  if (hasSignal) wired.kpis = true;
  if (health.d1.tableCount != null || health.hyperdrive.status !== 'unknown') wired.miniStats = true;
  if (health.d1.status !== 'unknown' || health.hyperdrive.status !== 'unknown') wired.healthCards = true;

  if (!hasSignal) {
    warnings.push({
      code: 'DATABASES_TELEMETRY_EMPTY',
      message:
        'No database telemetry in this window. OTLP spans and agentsam_tool_call_log rows populate after agent/DB activity.',
      severity: 'info',
    });
  }

  const sectionNotices = [];
  if (!d1Storage.wired && !supStorage.wired) {
    warnings.push({
      code: 'SECTION_STORAGE_PARTIAL',
      message: 'Storage metrics unavailable — D1 pragma or Hyperdrive pg_database_size failed.',
      severity: 'info',
    });
  }

  const qTrend = pctTrend(kpiRaw.queries, kpiRaw.queriesPrev);
  const rrTrend = pctTrend(kpiRaw.rowsRead, kpiRaw.rowsReadPrev);
  const rwTrend = pctTrend(kpiRaw.rowsWritten, kpiRaw.rowsWrittenPrev);
  const errTrend = pctTrend(kpiRaw.errors, kpiRaw.errorsPrev);

  const errorRatePct = kpiRaw.queries > 0 ? (kpiRaw.errors / kpiRaw.queries) * 100 : 0;

  const storageParts = [];
  if (d1Storage.wired && d1Storage.usedBytes != null) storageParts.push(`D1 ${formatBytes(d1Storage.usedBytes)}`);
  if (supStorage.wired && supStorage.usedBytes != null) storageParts.push(`PG ${formatBytes(supStorage.usedBytes)}`);

  const miniStats = [
    {
      key: 'storage',
      label: 'Storage used',
      value: storageParts.length ? storageParts.join(' · ') : null,
      status: null,
      wired: Boolean(storageParts.length),
    },
    {
      key: 'tables',
      label: 'Tables',
      value:
        health.d1.tableCount != null && health.supabase.tableCount != null
          ? `${health.d1.tableCount} D1 · ${health.supabase.tableCount} PG`
          : health.d1.tableCount != null
            ? String(health.d1.tableCount)
            : health.supabase.tableCount != null
              ? `${health.supabase.tableCount} PG`
              : '—',
      status: 'healthy',
      wired: health.d1.tableCount != null || health.supabase.tableCount != null,
    },
    {
      key: 'hyperdrive',
      label: 'Hyperdrive',
      value: health.hyperdrive.status,
      status: health.hyperdrive.status,
      wired: health.hyperdrive.status !== 'unknown',
    },
    {
      key: 'd1Health',
      label: 'D1 health',
      value: health.d1.status,
      status: health.d1.status,
      wired: health.d1.status !== 'unknown',
    },
    {
      key: 'cost',
      label: 'Cost est.',
      value: null,
      status: null,
      wired: false,
    },
  ];

  const healthCards = {
    d1: {
      status: health.d1.status,
      lines: [
        health.d1.latencyMs != null ? `Probe: ${health.d1.latencyMs} ms` : 'Probe: —',
        health.d1.tableCount != null && health.supabase.tableCount != null
          ? `Tables: ${health.d1.tableCount} D1 · ${health.supabase.tableCount} PG`
          : health.d1.tableCount != null
            ? `Tables: ${health.d1.tableCount}`
            : health.supabase.tableCount != null
              ? `Tables: ${health.supabase.tableCount} PG`
              : 'Tables: —',
        'Source: D1 binding + OTLP',
      ],
      wired: true,
    },
    hyperdrive: {
      status: health.hyperdrive.status,
      lines: [
        health.hyperdrive.latencyMs != null ? `Probe: ${health.hyperdrive.latencyMs} ms` : 'Probe: —',
        'Pool size: not exposed by binding',
        'Source: Hyperdrive SELECT 1',
      ],
      wired: health.hyperdrive.status !== 'unknown',
    },
    supabase: {
      status: health.hyperdrive.status === 'healthy' ? 'healthy' : health.hyperdrive.status === 'error' ? 'error' : 'unknown',
      lines: [
        health.supabase.tableCount != null ? `Tables: ${health.supabase.tableCount} PG` : 'Tables: —',
        supStorage.wired && supStorage.usedBytes != null
          ? `Disk: ${formatBytes(supStorage.usedBytes)} / ${formatBytes(supStorage.limitBytes)}`
          : 'Disk: —',
        supStorage.connections != null ? `Connections: ${supStorage.connections}` : 'Connections: —',
      ],
      wired: health.hyperdrive.status !== 'unknown',
    },
    lastEvents: {
      status: kpiRaw.errors > 0 ? 'degraded' : 'healthy',
      lines: [
        `Errors in window: ${kpiRaw.errors}`,
        `Error rate: ${errorRatePct < 0.01 ? '<0.01' : errorRatePct.toFixed(2)}%`,
        'Recent tool calls: /api/analytics/databases/events',
      ],
      wired: true,
    },
  };

  return analyticsResponse({
    ok: true,
    backend: 'mixed',
    range,
    summary: {
      state: hasSignal ? 'live' : 'empty',
      ds,
      errorRatePct: Math.round(errorRatePct * 1000) / 1000,
    },
    wired,
    kpis: {
      queries: {
        value: kpiRaw.queries,
        trendPct: qTrend.pct,
        dir: qTrend.dir,
        wired: wired.kpis,
      },
      rowsRead: {
        value: kpiRaw.rowsRead,
        trendPct: rrTrend.pct,
        dir: rrTrend.dir,
        wired: wired.kpis,
      },
      rowsWritten: {
        value: kpiRaw.rowsWritten,
        trendPct: rwTrend.pct,
        dir: rwTrend.dir,
        wired: wired.kpis,
      },
      p95: {
        valueMs: kpiRaw.p95Ms,
        trendPct: 0,
        dir: 'neutral',
        wired: wired.kpis && kpiRaw.p95Ms > 0,
      },
      errors: {
        value: kpiRaw.errors,
        trendPct: errTrend.pct,
        dir: errTrend.dir,
        wired: wired.kpis,
      },
    },
    miniStats,
    healthCards,
    warnings,
    section_notices: sectionNotices,
    meta: {
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
    },
  });
}

export async function handleDatabasesQueries(request, url, env, { tenantId, workspaceId }) {
  void request;
  const range = parseDatabasesRange(url);
  const ds = parseDatabasesDs(url);
  const warnings = [];
  const scope = {
    tenantId: tenantId && String(tenantId).trim() ? String(tenantId).trim() : null,
    workspaceId: workspaceId && String(workspaceId).trim() ? String(workspaceId).trim() : null,
  };
  const db = env?.DB;
  const start = rangeStartSec(range);
  /** @type {Array<Record<string, unknown>>} */
  const queries = [];

  if (db && (await tableExists(db, 'agentsam_tool_call_log'))) {
    const cols = await pragmaTableInfo(db, 'agentsam_tool_call_log');
    if (cols.has('created_at')) {
      const binds = [start];
      const where = ['created_at >= ?', dbToolClause(ds)];
      where.push(...tenantWorkspaceClause({ ...scope, tableCols: cols }, binds));
      const fpExpr = cols.has('input_summary')
        ? `COALESCE(NULLIF(trim(input_summary), ''), tool_name)`
        : 'tool_name';
      const rows = await d1All(
        db,
        'db_queries_fp',
        `SELECT
           ${fpExpr} AS fingerprint,
           tool_name,
           COUNT(*) AS call_count,
           AVG(COALESCE(duration_ms, 0)) AS avg_ms,
           MAX(created_at) AS last_seen,
           SUM(CASE WHEN LOWER(COALESCE(status,'')) IN ('error','failed') THEN 1 ELSE 0 END) AS err_count,
           SUM(CASE
             WHEN json_valid(COALESCE(output_json, ''))
              AND json_type(json_extract(output_json, '$.results')) = 'array'
             THEN json_array_length(json_extract(output_json, '$.results'))
             ELSE 0
           END) AS rows_read_est
         FROM agentsam_tool_call_log
         WHERE ${where.join(' AND ')}
         GROUP BY fingerprint, tool_name
         ORDER BY call_count DESC
         LIMIT 40`,
        binds,
        warnings,
      );
      const totalCalls = rows.reduce((s, r) => s + (Number(r.call_count) || 0), 0) || 1;
      for (const r of rows) {
        const toolName = String(r.tool_name || '');
        const dsLabel = toolName.includes('hyperdrive') ? 'supabase' : 'd1';
        const avgMs = Math.round(Number(r.avg_ms) || 0);
        queries.push({
          fingerprint: String(r.fingerprint || toolName).slice(0, 240),
          tool_name: toolName,
          datasource: toolName.includes('hyperdrive') ? 'supabase' : dsLabel,
          call_count: Number(r.call_count) || 0,
          runtime_pct: Math.round(((Number(r.call_count) || 0) / totalCalls) * 1000) / 10,
          avg_ms: avgMs,
          p50_ms: avgMs,
          p99_ms: Math.min(120_000, Math.round(avgMs * 3)),
          rows_read: Number(r.rows_read_est) || 0,
          rows_per_run:
            Number(r.call_count) > 0
              ? Math.round((Number(r.rows_read_est) || 0) / Number(r.call_count))
              : 0,
          errors: Number(r.err_count) || 0,
          last_seen: Number(r.last_seen) || null,
        });
      }
    }
  }

  return analyticsResponse({
    ok: true,
    backend: 'd1_registry',
    range,
    ds,
    queries,
    wired: queries.length > 0,
    warnings,
    meta: { tenantId: scope.tenantId, workspaceId: scope.workspaceId },
  });
}

/**
 * @param {any} env
 * @param {{ tenantId: string|null, workspaceId: string|null }} scope
 * @param {string} range
 * @param {string} ds
 */
async function loadTimeseriesBuckets(env, scope, range, ds, warnings) {
  const db = env?.DB;
  const labels = buildBucketLabels(range);
  const start = rangeStartSec(range);
  const startNano = start * 1_000_000_000;

  const d1Vol = new Map(labels.map((l) => [l, 0]));
  const supVol = new Map(labels.map((l) => [l, 0]));
  const d1Read = new Map(labels.map((l) => [l, 0]));
  const supRead = new Map(labels.map((l) => [l, 0]));
  const d1Write = new Map(labels.map((l) => [l, 0]));
  const supWrite = new Map(labels.map((l) => [l, 0]));
  const d1Err = new Map(labels.map((l) => [l, 0]));
  const supErr = new Map(labels.map((l) => [l, 0]));
  const latMs = [];

  const addRows = (rows, volMap, errMap, volKey = 'c') => {
    for (const r of rows) {
      const b = String(r.bucket ?? '');
      if (!volMap.has(b)) continue;
      volMap.set(b, (volMap.get(b) || 0) + (Number(r[volKey] ?? r.c ?? 0) || 0));
      if (errMap && r.err != null) errMap.set(b, (errMap.get(b) || 0) + (Number(r.err) || 0));
    }
  };

  if (db && (ds === 'all' || ds === 'd1') && (await tableExists(db, 'otlp_traces'))) {
    const cols = await pragmaTableInfo(db, 'otlp_traces');
    const binds = [startNano];
    const where = ['start_time_unix_nano >= ?'];
    where.push(...tenantWorkspaceClause({ ...scope, tableCols: cols }, binds));
    const bucket = bucketExpr(range, 'start_time_unix_nano / 1000000000');

    const rows = await d1All(
      db,
      'otlp_ts',
      `SELECT ${bucket} AS bucket,
              COUNT(*) AS c,
              COALESCE(SUM(d1_rows_read), 0) AS rr,
              COALESCE(SUM(d1_rows_written), 0) AS rw,
              SUM(CASE WHEN LOWER(COALESCE(status_code,'')) = 'error' THEN 1 ELSE 0 END) AS err
       FROM otlp_traces WHERE ${where.join(' AND ')}
       GROUP BY bucket ORDER BY bucket`,
      binds,
      warnings,
    );
    addRows(rows, d1Vol, d1Err);
    for (const r of rows) {
      const b = String(r.bucket ?? '');
      if (d1Read.has(b)) {
        d1Read.set(b, (d1Read.get(b) || 0) + Number(r.rr ?? 0));
        d1Write.set(b, (d1Write.get(b) || 0) + Number(r.rw ?? 0));
      }
    }
  }

  if (db && (await tableExists(db, 'agentsam_tool_call_log'))) {
    const cols = await pragmaTableInfo(db, 'agentsam_tool_call_log');
    if (cols.has('created_at')) {
      const binds = [start];
      const where = ['created_at >= ?', dbToolClause(ds)];
      where.push(...tenantWorkspaceClause({ ...scope, tableCols: cols }, binds));
      const bucket = bucketExpr(range, 'created_at');

      if (ds === 'all') {
        const scopeBinds = [start];
        const scopeWhere = ['created_at >= ?'];
        scopeWhere.push(...tenantWorkspaceClause({ ...scope, tableCols: cols }, scopeBinds));
        const d1Rows = await d1All(
          db,
          'tcl_ts_d1',
          `SELECT ${bucket} AS bucket, COUNT(*) AS c,
                  SUM(CASE WHEN LOWER(COALESCE(status,'')) IN ('error','failed') THEN 1 ELSE 0 END) AS err
           FROM agentsam_tool_call_log WHERE ${scopeWhere.join(' AND ')} AND ${SQL_DB_TOOL_D1}
           GROUP BY bucket ORDER BY bucket`,
          scopeBinds,
          warnings,
        );
        const supRows = await d1All(
          db,
          'tcl_ts_sup',
          `SELECT ${bucket} AS bucket, COUNT(*) AS c,
                  SUM(CASE WHEN LOWER(COALESCE(status,'')) IN ('error','failed') THEN 1 ELSE 0 END) AS err
           FROM agentsam_tool_call_log WHERE ${scopeWhere.join(' AND ')} AND ${SQL_DB_TOOL_SUPABASE}
           GROUP BY bucket ORDER BY bucket`,
          scopeBinds,
          warnings,
        );
        addRows(d1Rows, d1Vol, d1Err);
        addRows(supRows, supVol, supErr);
      } else {
        const rows = await d1All(
          db,
          'tcl_ts',
          `SELECT ${bucket} AS bucket,
                  COUNT(*) AS c,
                  SUM(CASE WHEN LOWER(COALESCE(status,'')) IN ('error','failed') THEN 1 ELSE 0 END) AS err
           FROM agentsam_tool_call_log WHERE ${where.join(' AND ')}
           GROUP BY bucket ORDER BY bucket`,
          binds,
          warnings,
        );
        addRows(rows, ds === 'supabase' ? supVol : d1Vol, ds === 'supabase' ? supErr : d1Err);
      }

      if (cols.has('duration_ms')) {
        const durRows = await d1All(
          db,
          'tcl_lat',
          `SELECT ${bucket} AS bucket, AVG(COALESCE(duration_ms,0)) AS avg_ms
           FROM agentsam_tool_call_log WHERE ${where.join(' AND ')} AND COALESCE(duration_ms,0) > 0
           GROUP BY bucket`,
          binds,
          warnings,
        );
        for (const r of durRows) latMs.push({ bucket: r.bucket, ms: Number(r.avg_ms) || 0 });
      }
    }
  }

  const toArr = (m) => labels.map((l) => m.get(l) ?? 0);

  return {
    labels,
    d1: toArr(d1Vol),
    supabase: toArr(supVol),
    reads: { d1: toArr(d1Read), supabase: toArr(supRead) },
    writes: { d1: toArr(d1Write), supabase: toArr(supWrite) },
    errors: { d1: toArr(d1Err), supabase: toArr(supErr) },
    latencyByBucket: latMs,
  };
}

export async function handleDatabasesTimeseries(request, url, env, { tenantId, workspaceId }) {
  void request;
  const range = parseDatabasesRange(url);
  const ds = parseDatabasesDs(url);
  const warnings = [];
  const scope = {
    tenantId: tenantId && String(tenantId).trim() ? String(tenantId).trim() : null,
    workspaceId: workspaceId && String(workspaceId).trim() ? String(workspaceId).trim() : null,
  };

  const buckets = await loadTimeseriesBuckets(env, scope, range, ds, warnings);
  const { labels, d1, supabase, reads, writes, errors, latencyByBucket } = buckets;

  const totalD1 = d1.map((v, i) => v + (supabase[i] || 0));
  const hasData = totalD1.some((v) => v > 0) || d1.some((v) => v > 0) || supabase.some((v) => v > 0);

  if (!hasData) {
    warnings.push({
      code: 'DATABASES_TIMESERIES_EMPTY',
      message: 'No hourly/daily database activity in this window for the selected datasource.',
      severity: 'info',
    });
  }

  const latMap = new Map(latencyByBucket.map((r) => [String(r.bucket), Number(r.ms) || 0]));
  const p50Series = labels.map((l) => latMap.get(l) ?? 0);
  const p95Series = p50Series.map((v) => +(v * 2.5).toFixed(2));
  const p99Series = p50Series.map((v) => +(v * 4).toFixed(2));

  const sumQueries = d1.reduce((a, b) => a + b, 0) + supabase.reduce((a, b) => a + b, 0);
  const sumErrors = errors.d1.reduce((a, b) => a + b, 0) + errors.supabase.reduce((a, b) => a + b, 0);
  const errorRatePct = sumQueries > 0 ? (sumErrors / sumQueries) * 100 : 0;

  const headlineP50 = p50Series.filter((v) => v > 0);
  const p50Headline = headlineP50.length
    ? headlineP50.reduce((a, b) => a + b, 0) / headlineP50.length
    : 0;

  return analyticsResponse({
    ok: true,
    backend: 'mixed',
    range,
    summary: { ds, wired: hasData },
    series: [],
    breakdowns: [
      {
        key: 'hero',
        labels,
        total: { d1, supabase },
        reads: reads,
        writes: writes,
        errors: errors,
      },
      {
        key: 'latency',
        labels,
        p50: p50Series,
        p95: p95Series,
        p99: p99Series,
        headlineMs: { p50: p50Headline, p95: p50Headline * 2.5, p99: p50Headline * 4 },
      },
      {
        key: 'errorChart',
        labels,
        ratePct: errorRatePct,
        d1: errors.d1,
        supabase: errors.supabase,
      },
    ],
    warnings,
    meta: { tenantId: scope.tenantId, workspaceId: scope.workspaceId },
  });
}

export async function handleDatabasesTables(request, url, env, { tenantId, workspaceId }) {
  void request;
  const range = parseDatabasesRange(url);
  const ds = parseDatabasesDs(url);
  const warnings = [];
  const scope = {
    tenantId: tenantId && String(tenantId).trim() ? String(tenantId).trim() : null,
    workspaceId: workspaceId && String(workspaceId).trim() ? String(workspaceId).trim() : null,
  };

  /** @type {Array<{ name: string, val: string, ds: 'd1'|'supabase', sort: number }>} */
  let largestPool = [];
  /** @type {Array<{ name: string, val: string, ds: 'd1'|'supabase', sort: number }>} */
  let readPool = [];
  /** @type {Array<{ name: string, val: string, ds: 'd1'|'supabase', sort: number }>} */
  let writePool = [];

  let d1Count = 0;
  let supabaseCount = null;

  if ((ds === 'all' || ds === 'd1') && env?.DB) {
    const tc = await d1First(
      env.DB,
      'd1_table_count',
      `SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
      [],
      warnings,
    );
    d1Count = Number(tc?.c ?? 0) || 0;

    largestPool.push(...(await loadD1LargestTables(env.DB, warnings)));
    const otlpHot = await loadD1OtlpHotTables(env.DB, scope, range, warnings);
    readPool.push(...otlpHot.mostRead);
    writePool.push(...otlpHot.mostWritten);

    if (!largestPool.some((x) => x.ds === 'd1') && d1Count > 0) {
      warnings.push({
        code: 'D1_SIZE_ESTIMATE_ONLY',
        message: 'D1 largest tables use row-count estimates (remote D1 has no dbstat).',
        severity: 'info',
      });
    }
  }

  if (ds === 'all' || ds === 'supabase') {
    const pg = await loadSupabaseHotTables(env, warnings);
    if (pg.count != null) supabaseCount = pg.count;
    largestPool.push(...pg.largest);
    readPool.push(...pg.mostRead);
    writePool.push(...pg.mostWritten);
  }

  /** @type {{ noPrimaryKey: Array<{name:string,ds:string,severity:string}>, missingIndexes: Array<{name:string,ds:string,severity:string}>, fkIssues: Array<{name:string,ds:string,severity:string}>, wired: boolean }} */
  let schemaHealth = { noPrimaryKey: [], missingIndexes: [], fkIssues: [], wired: false };
  if ((ds === 'all' || ds === 'd1') && env?.DB) {
    const d1Health = await loadD1SchemaHealth(env.DB, warnings);
    schemaHealth.noPrimaryKey.push(...d1Health.noPrimaryKey);
    schemaHealth.missingIndexes.push(...d1Health.missingIndexes);
    schemaHealth.wired = true;
  }
  if (ds === 'all' || ds === 'supabase') {
    const pgHealth = await loadSupabaseSchemaHealth(env, warnings);
    schemaHealth.noPrimaryKey.push(...pgHealth.noPrimaryKey);
    schemaHealth.missingIndexes.push(...pgHealth.missingIndexes);
    schemaHealth.fkIssues.push(...pgHealth.fkIssues);
    schemaHealth.wired = schemaHealth.wired || pgHealth.wired;
  }

  const d1Storage = env?.DB ? await loadD1StorageEstimate(env.DB, warnings) : { usedBytes: null, limitBytes: D1_STORAGE_LIMIT_BYTES, wired: false };
  const supStorage = await loadSupabaseStorage(env, warnings);

  const largest = topHotTables(largestPool, ds, 5);
  const mostRead = topHotTables(readPool, ds, 5);
  const mostWritten = topHotTables(writePool, ds, 5);

  const totalTables =
    (ds === 'supabase' ? 0 : d1Count) + (supabaseCount != null ? supabaseCount : 0);

  const hotWired =
    largest.length > 0 ||
    mostRead.length > 0 ||
    mostWritten.length > 0 ||
    d1Count > 0 ||
    (supabaseCount != null && supabaseCount > 0);

  if (!hotWired) {
    warnings.push({
      code: 'DATABASES_TABLES_EMPTY',
      message: 'No table inventory returned for the selected datasource filter.',
      severity: 'info',
    });
  }

  if (readPool.length === 0 && (ds === 'all' || ds === 'd1')) {
    warnings.push({
      code: 'D1_OTLP_READ_HOT_EMPTY',
      message:
        'D1 “most read” uses OTLP d1_rows_read in this window; empty until spans record SQL + row counts.',
      severity: 'info',
    });
  }

  if (readPool.some((x) => x.ds === 'supabase') || ds === 'supabase') {
    warnings.push({
      code: 'PG_STATS_CUMULATIVE',
      message:
        'Postgres read/write ranks use pg_stat_user_tables (cumulative since stats reset), not the time range filter.',
      severity: 'info',
    });
  }

  return analyticsResponse({
    ok: true,
    backend: 'mixed',
    range,
    summary: {
      ds,
      counts: {
        d1: d1Count,
        supabase: supabaseCount,
        total: totalTables,
      },
      wired: { hotTables: hotWired },
    },
    breakdowns: [
      {
        key: 'hotTables',
        largest,
        mostRead,
        mostWritten,
      },
      {
        key: 'schemaHealth',
        noPrimaryKey: schemaHealth.noPrimaryKey,
        missingIndexes: schemaHealth.missingIndexes,
        fkIssues: schemaHealth.fkIssues,
        wired: schemaHealth.wired,
      },
      {
        key: 'storage',
        d1: {
          usedBytes: d1Storage.usedBytes,
          limitBytes: d1Storage.limitBytes,
          usedLabel: d1Storage.usedBytes != null ? formatBytes(d1Storage.usedBytes) : null,
          limitLabel: formatBytes(d1Storage.limitBytes),
          pctUsed:
            d1Storage.usedBytes != null && d1Storage.limitBytes > 0
              ? Math.round((d1Storage.usedBytes / d1Storage.limitBytes) * 1000) / 10
              : null,
          tableCount: d1Count,
          wired: d1Storage.wired,
        },
        supabase: {
          usedBytes: supStorage.usedBytes,
          limitBytes: supStorage.limitBytes,
          usedLabel: supStorage.usedBytes != null ? formatBytes(supStorage.usedBytes) : null,
          limitLabel: formatBytes(supStorage.limitBytes),
          pctUsed:
            supStorage.usedBytes != null && supStorage.limitBytes > 0
              ? Math.round((supStorage.usedBytes / supStorage.limitBytes) * 1000) / 10
              : null,
          connections: supStorage.connections,
          largeObjects: supStorage.largeObjects,
          tableCount: supabaseCount,
          wired: supStorage.wired,
        },
      },
    ],
    warnings,
    meta: { tenantId: scope.tenantId, workspaceId: scope.workspaceId },
  });
}

export async function handleDatabasesEvents(request, url, env, { tenantId, workspaceId }) {
  void request;
  const range = parseDatabasesRange(url);
  const ds = parseDatabasesDs(url);
  const warnings = [];
  const scope = {
    tenantId: tenantId && String(tenantId).trim() ? String(tenantId).trim() : null,
    workspaceId: workspaceId && String(workspaceId).trim() ? String(workspaceId).trim() : null,
  };

  let events = [];
  if (env?.DB && (ds === 'all' || ds === 'd1' || ds === 'supabase')) {
    events = await loadRecentDbEvents(env.DB, scope, range, warnings);
    if (ds !== 'all') {
      events = events.filter((e) => e.datasource === ds);
    }
  }

  return analyticsResponse({
    ok: true,
    backend: 'd1_registry',
    range,
    ds,
    events,
    wired: events.length > 0,
    warnings,
    meta: { tenantId: scope.tenantId, workspaceId: scope.workspaceId },
  });
}

function kpiFromValues(current, previous, wired, msField = false) {
  const trend = pctTrend(current, previous);
  return {
    value: current,
    ...(msField ? { valueMs: current } : {}),
    trendPct: trend.pct,
    dir: trend.dir,
    wired,
  };
}

/**
 * GET /api/analytics/databases/overview?surface=cloudflare|supabase&range=24h
 * Bundled surface-specific database observability (single round-trip).
 */
export async function handleDatabasesOverview(request, url, env, { tenantId, workspaceId }) {
  void request;
  const range = parseDatabasesRange(url);
  const surface = parseDatabasesSurface(url);
  const databaseId = String(url.searchParams.get('database_id') || IAM_D1_DATABASE_ID).trim();
  const warnings = [];
  const scope = {
    tenantId: tenantId && String(tenantId).trim() ? String(tenantId).trim() : null,
    workspaceId: workspaceId && String(workspaceId).trim() ? String(workspaceId).trim() : null,
  };

  if (surface === 'cloudflare') {
    const creds = resolveCloudflareAnalyticsCreds(env);
    let gql = null;
    if (creds) {
      try {
        gql = await fetchD1AnalyticsOverview(env, {
          accountId: creds.accountId,
          token: creds.token,
          databaseId,
          range,
        });
      } catch (e) {
        warnings.push({
          code: 'CF_GRAPHQL_FAILED',
          message: `Cloudflare GraphQL: ${String(e?.message || e)}`,
          severity: 'warn',
        });
      }
    } else {
      warnings.push({
        code: 'CF_GRAPHQL_CREDS_MISSING',
        message: 'CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN not configured.',
        severity: 'warn',
      });
    }

    let tableCount = null;
    if (env?.DB) {
      const tc = await d1First(
        env.DB,
        'd1_table_count_overview',
        `SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
        [],
        warnings,
      );
      tableCount = Number(tc?.c ?? 0) || 0;
    }

    const wired = Boolean(gql?.wired);
    const kpis = gql?.kpis ?? {};
    const storageBytes = kpis.storageBytes ?? 0;
    const retention = env?.DB ? await loadLastRetentionRun(env.DB, warnings) : null;
    const d1Schema = env?.DB
      ? await loadD1SchemaHealth(env.DB, warnings)
      : { noPrimaryKey: [], missingIndexes: [], fkIssues: [], wired: false };

    const retentionAgeSec = retention?.at ? Math.floor(Date.now() / 1000) - retention.at : null;
    const retentionFresh = retentionAgeSec != null && retentionAgeSec < 26 * 3600;
    const retentionLabel = retention?.at
      ? `Retention ${retention.ok ? '✓' : '!'} · ${formatRelativeEpoch(retention.at)}`
      : 'Retention not logged';

    return analyticsResponse({
      ok: true,
      backend: gql?.source ?? 'mixed',
      surface,
      range,
      database: { id: databaseId, name: IAM_D1_DATABASE_NAME },
      wired,
      summary: { state: wired ? 'live' : 'empty', surface },
      kpis: {
        queries: kpiFromValues(kpis.queries ?? 0, kpis.queriesPrev ?? 0, wired),
        rowsRead: kpiFromValues(kpis.rowsRead ?? 0, kpis.rowsReadPrev ?? 0, wired),
        rowsWritten: kpiFromValues(kpis.rowsWritten ?? 0, kpis.rowsWrittenPrev ?? 0, wired),
        storage: {
          value: storageBytes,
          valueLabel: storageBytes > 0 ? formatBytes(storageBytes) : null,
          trendPct: 0,
          dir: 'neutral',
          wired: storageBytes > 0,
        },
        tables: {
          value: tableCount ?? 0,
          trendPct: 0,
          dir: 'neutral',
          wired: tableCount != null && tableCount > 0,
        },
        p95: kpiFromValues(kpis.p95Ms ?? 0, 0, wired && (kpis.p95Ms ?? 0) > 0, true),
        errors: kpiFromValues(0, 0, false),
      },
      capacity: buildCapacityPayload({
        usedBytes: storageBytes > 0 ? storageBytes : null,
        limitBytes: D1_STORAGE_LIMIT_BYTES,
        limitLabel: formatBytes(D1_STORAGE_LIMIT_BYTES),
        subtitle: retentionLabel,
        subtitleOk: Boolean(retention?.ok && retentionFresh),
        retentionAt: retention?.at ?? null,
        retentionOk: retention?.ok ?? null,
      }),
      charts: gql?.charts ?? {
        labels: [],
        totalQueries: [],
        readQueries: [],
        writeQueries: [],
        rowsRead: [],
        rowsWritten: [],
        latencyP50: [],
        latencyP95: [],
        latencyP99: [],
        headlineMs: { p50: 0, p95: 0, p99: 0 },
      },
      queries: gql?.queries ?? [],
      storage: {
        usedBytes: storageBytes || null,
        limitBytes: D1_STORAGE_LIMIT_BYTES,
        usedLabel: storageBytes > 0 ? formatBytes(storageBytes) : null,
        limitLabel: formatBytes(D1_STORAGE_LIMIT_BYTES),
        pctUsed:
          storageBytes > 0
            ? Math.round((storageBytes / D1_STORAGE_LIMIT_BYTES) * 1000) / 10
            : null,
        tableCount,
        wired: storageBytes > 0,
      },
      schemaHealth: {
        noPrimaryKey: d1Schema.noPrimaryKey,
        missingIndexes: d1Schema.missingIndexes,
        fkIssues: d1Schema.fkIssues ?? [],
        wired: d1Schema.wired,
      },
      warnings,
      meta: { tenantId: scope.tenantId, workspaceId: scope.workspaceId },
    });
  }

  const health = await probeHealth(env, scope, warnings);
  const supStorage = await loadSupabaseStorage(env, warnings);
  const pgHot = await loadSupabaseHotTables(env, warnings);
  const pgOps = await loadSupabaseOpsSignals(env, warnings);
  const pgSchema = await loadSupabaseSchemaHealth(env, warnings);
  const ds = 'supabase';
  const buckets = await loadTimeseriesBuckets(env, scope, range, ds, warnings);
  const kpiRaw = await aggregateKpis(env, scope, range, ds, warnings);

  const queriesRes = await handleDatabasesQueries(request, url, env, { tenantId, workspaceId });
  const queriesJson = await queriesRes.json().catch(() => ({}));
  const queryRows = Array.isArray(queriesJson?.queries) ? queriesJson.queries : [];

  const { labels, d1: _d1, supabase, reads, writes, latencyByBucket } = buckets;
  const latMap = new Map(latencyByBucket.map((r) => [String(r.bucket), Number(r.ms) || 0]));
  const p50Series = labels.map((l) => latMap.get(l) ?? 0);
  const hasSignal =
    kpiRaw.queries > 0 ||
    supStorage.wired ||
    (pgHot.count != null && pgHot.count > 0) ||
    health.hyperdrive.status === 'healthy';

  if (pgHot.count != null) {
    warnings.push({
      code: 'PG_STATS_CUMULATIVE',
      message:
        'Postgres read/write ranks use pg_stat_user_tables (cumulative since stats reset), not the time range filter.',
      severity: 'info',
    });
  }

  const qTrend = pctTrend(kpiRaw.queries, kpiRaw.queriesPrev);
  const rrTrend = pctTrend(kpiRaw.rowsRead, kpiRaw.rowsReadPrev);
  const rwTrend = pctTrend(kpiRaw.rowsWritten, kpiRaw.rowsWrittenPrev);

  const headlineP50 = p50Series.filter((v) => v > 0);
  const p50Headline = headlineP50.length
    ? headlineP50.reduce((a, b) => a + b, 0) / headlineP50.length
    : 0;

  const connUsed = supStorage.connections ?? null;
  const connMax = pgOps.maxConnections ?? null;
  const connPct =
    connUsed != null && connMax != null && connMax > 0
      ? Math.round((connUsed / connMax) * 1000) / 10
      : null;
  const hdOk = health.hyperdrive.status === 'healthy';
  const hdLabel = hdOk
    ? `Hyperdrive ✓ · ${health.hyperdrive.latencyMs ?? '—'}ms`
    : `Hyperdrive ${health.hyperdrive.status}`;
  const autoLabel = pgOps.lastAutovacuumAt
    ? `Autovacuum · ${formatRelativeEpoch(pgOps.lastAutovacuumAt)}`
    : 'Autovacuum —';
  const connLabel =
    connUsed != null && connMax != null ? `Connections ${connUsed}/${connMax}` : null;

  return analyticsResponse({
    ok: true,
    backend: 'hyperdrive',
    surface,
    range,
    wired: hasSignal,
    summary: { state: hasSignal ? 'live' : 'empty', surface },
    kpis: {
      queries: {
        value: kpiRaw.queries,
        trendPct: qTrend.pct,
        dir: qTrend.dir,
        wired: kpiRaw.queries > 0,
      },
      rowsRead: {
        value: kpiRaw.rowsRead,
        trendPct: rrTrend.pct,
        dir: rrTrend.dir,
        wired: kpiRaw.rowsRead > 0,
      },
      rowsWritten: {
        value: kpiRaw.rowsWritten,
        trendPct: rwTrend.pct,
        dir: rwTrend.dir,
        wired: kpiRaw.rowsWritten > 0,
      },
      storage: {
        value: supStorage.usedBytes ?? 0,
        valueLabel: supStorage.usedBytes != null ? formatBytes(supStorage.usedBytes) : null,
        trendPct: 0,
        dir: 'neutral',
        wired: supStorage.wired,
      },
      tables: {
        value: pgHot.count ?? 0,
        trendPct: 0,
        dir: 'neutral',
        wired: pgHot.count != null && pgHot.count > 0,
      },
      connections: {
        value: supStorage.connections ?? 0,
        trendPct: 0,
        dir: 'neutral',
        wired: supStorage.connections != null,
      },
      p95: {
        valueMs: kpiRaw.p95Ms,
        trendPct: 0,
        dir: 'neutral',
        wired: kpiRaw.p95Ms > 0,
      },
      errors: {
        value: kpiRaw.errors,
        trendPct: pctTrend(kpiRaw.errors, kpiRaw.errorsPrev).pct,
        dir: pctTrend(kpiRaw.errors, kpiRaw.errorsPrev).dir,
        wired: kpiRaw.errors > 0,
      },
    },
    capacity: buildCapacityPayload({
      usedBytes: supStorage.usedBytes,
      limitBytes: supStorage.limitBytes,
      limitLabel: formatBytes(supStorage.limitBytes),
      subtitle: [hdLabel, connLabel, autoLabel].filter(Boolean).join(' · '),
      subtitleOk: hdOk && (connPct == null || connPct < 80),
      autovacuumAt: pgOps.lastAutovacuumAt,
      connectionsUsed: connUsed,
      connectionsMax: connMax,
      hyperdriveStatus: health.hyperdrive.status,
      hyperdriveLatencyMs: health.hyperdrive.latencyMs,
    }),
    charts: {
      labels,
      totalQueries: supabase,
      readQueries: reads.supabase,
      writeQueries: writes.supabase,
      rowsRead: reads.supabase,
      rowsWritten: writes.supabase,
      latencyP50: p50Series,
      latencyP95: p50Series.map((v) => +(v * 2.5).toFixed(2)),
      latencyP99: p50Series.map((v) => +(v * 4).toFixed(2)),
      headlineMs: { p50: p50Headline, p95: p50Headline * 2.5, p99: p50Headline * 4 },
    },
    queries: queryRows,
    storage: {
      usedBytes: supStorage.usedBytes,
      limitBytes: supStorage.limitBytes,
      usedLabel: supStorage.usedBytes != null ? formatBytes(supStorage.usedBytes) : null,
      limitLabel: formatBytes(supStorage.limitBytes),
      pctUsed:
        supStorage.usedBytes != null && supStorage.limitBytes > 0
          ? Math.round((supStorage.usedBytes / supStorage.limitBytes) * 1000) / 10
          : null,
      connections: supStorage.connections,
      largeObjects: supStorage.largeObjects,
      tableCount: pgHot.count,
      wired: supStorage.wired,
    },
    hotTables: {
      largest: pgHot.largest,
      mostRead: pgHot.mostRead,
      mostWritten: pgHot.mostWritten,
    },
    schemaHealth: {
      noPrimaryKey: pgSchema.noPrimaryKey,
      missingIndexes: pgSchema.missingIndexes,
      fkIssues: pgSchema.fkIssues,
      wired: pgSchema.wired,
    },
    health: {
      hyperdrive: health.hyperdrive.status,
      latencyMs: health.hyperdrive.latencyMs,
    },
    warnings: [...warnings, ...(queriesJson?.warnings ?? [])],
    meta: { tenantId: scope.tenantId, workspaceId: scope.workspaceId },
  });
}
