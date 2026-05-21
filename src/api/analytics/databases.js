/**
 * GET /api/analytics/databases/summary
 * GET /api/analytics/databases/timeseries
 * GET /api/analytics/databases/tables
 *
 * P0 telemetry: otlp_traces, agentsam_tool_call_log, agentsam_cron_runs,
 * agentsam_error_log, D1/Hyperdrive health probes. No new tables.
 */
import { analyticsResponse } from './sources/normalize.js';
import { pragmaTableInfo, tableExists } from '../../core/retention.js';
import { isHyperdriveUsable, runHyperdriveQuery } from '../../core/hyperdrive-query.js';

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
  const raw = String(url?.searchParams?.get('ds') || 'all').toLowerCase();
  if (raw === 'd1' || raw === 'supabase') return raw;
  return 'all';
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

/** @param {import('@cloudflare/workers-types').D1Database} db */
async function loadD1LargestTables(db, warnings) {
  const rows = await d1All(
    db,
    'd1_dbstat',
    `SELECT substr(name, 7) AS table_name, SUM(pgsize) AS bytes
     FROM dbstat
     WHERE name LIKE 'table:%' AND name NOT LIKE 'table:sqlite_%'
     GROUP BY table_name
     ORDER BY bytes DESC
     LIMIT 5`,
    [],
    warnings,
  );
  if (rows.length) {
    return rows.map((r) => ({
      name: String(r.table_name),
      val: formatBytes(r.bytes),
      ds: /** @type {'d1'} */ ('d1'),
      sort: Number(r.bytes) || 0,
    }));
  }
  return [];
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
    const name = schema === 'public' ? rel : `${schema}.${rel}`;
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
      message: 'Hyperdrive binding not usable; Supabase-side charts use tool_call_log only.',
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
        for (const d of durRows) durations.push(Number(d.ms));
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

  durations.sort((a, b) => a - b);
  let p95 = 0;
  if (durations.length) {
    const idx = Math.min(durations.length - 1, Math.floor(durations.length * 0.95));
    p95 = durations[idx];
  }

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
        'No database telemetry in this window. OTLP spans and database tool_call_log rows populate after agent/DB activity.',
      severity: 'info',
    });
  }

  if (env?.DB && (await tableExists(env.DB, 'otlp_traces'))) {
    const sample = await d1First(
      env.DB,
      'otlp_d1_query_sample',
      `SELECT COUNT(*) AS with_sql FROM otlp_traces
       WHERE start_time_unix_nano >= ? AND d1_query IS NOT NULL AND TRIM(d1_query) != ''`,
      [rangeStartNano(range)],
      warnings,
    );
    if (Number(sample?.with_sql ?? 0) === 0) {
      warnings.push({
        code: 'OTLP_D1_QUERY_EMPTY',
        message: 'Query fingerprint table stays mock until Studio/agent paths record d1_query on OTLP spans.',
        severity: 'info',
      });
    }
  }

  warnings.push({
    code: 'SECTION_QUERY_TABLE_NOT_WIRED',
    message: 'Query performance table: /api/analytics/databases/queries not implemented (P1).',
    severity: 'info',
  });
  warnings.push({
    code: 'SECTION_STORAGE_NOT_WIRED',
    message: 'D1 storage MB and Supabase disk metrics: /api/analytics/databases/storage not implemented.',
    severity: 'info',
  });
  warnings.push({
    code: 'SECTION_EVENTS_NOT_WIRED',
    message: 'Recent events timeline: /api/analytics/databases/events not implemented (P1).',
    severity: 'info',
  });

  const qTrend = pctTrend(kpiRaw.queries, kpiRaw.queriesPrev);
  const rrTrend = pctTrend(kpiRaw.rowsRead, kpiRaw.rowsReadPrev);
  const rwTrend = pctTrend(kpiRaw.rowsWritten, kpiRaw.rowsWrittenPrev);
  const errTrend = pctTrend(kpiRaw.errors, kpiRaw.errorsPrev);

  const errorRatePct = kpiRaw.queries > 0 ? (kpiRaw.errors / kpiRaw.queries) * 100 : 0;

  const miniStats = [
    {
      key: 'storage',
      label: 'Storage used',
      value: null,
      status: null,
      wired: false,
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
      status: health.hyperdrive.status === 'healthy' ? 'healthy' : 'unknown',
      lines: ['Host CPU/memory: not wired (P2)', 'Use Hyperdrive probe for connectivity'],
      wired: false,
    },
    lastEvents: {
      status: kpiRaw.errors > 0 ? 'degraded' : 'healthy',
      lines: [
        `Errors in window: ${kpiRaw.errors}`,
        `Error rate: ${errorRatePct < 0.01 ? '<0.01' : errorRatePct.toFixed(2)}%`,
        'Event stream: not wired (P1)',
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
    meta: {
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
    },
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
        code: 'D1_DBSTAT_UNAVAILABLE',
        message:
          'D1 table sizes unavailable (dbstat); largest list may be empty. Table count still reflects sqlite_master.',
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
    ],
    warnings,
    meta: { tenantId: scope.tenantId, workspaceId: scope.workspaceId },
  });
}
