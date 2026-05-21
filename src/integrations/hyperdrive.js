import { jsonResponse } from '../core/responses.js';
import { getAuthUser, authUserIsSuperadmin } from '../core/auth.js';
import { getDatabaseSqlRunGate } from '../core/database-sql-safety.js';
import {
  buildAllowlistedOrderBy,
  buildPostgresFilterWhere,
  parseDatabaseFiltersJson,
} from '../core/database-table-filters.js';
import { isHyperdriveUsable, runHyperdriveQuery } from '../core/hyperdrive-query.js';

/** @param {string} ident */
function pgQuoteIdent(ident) {
  const s = String(ident || '').trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)) {
    throw new Error('invalid table or column identifier');
  }
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * Generic POST body executor — read-only for non-superadmin; DML/DDL superadmin only.
 * @param {Request} request
 * @param {any} env
 * @param {{ requireSuperadminForDdl?: boolean }} [opts]
 */
async function executeHyperdriveSqlFromRequest(request, env) {
  if (!isHyperdriveUsable(env)) {
    return jsonResponse({ error: 'Hyperdrive binding not configured or not usable' }, 503);
  }
  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

  let body = {};
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }
  const sql = body?.sql;
  const params = Array.isArray(body?.params) ? body.params : [];
  if (!sql || typeof sql !== 'string') return jsonResponse({ error: 'SQL query required' }, 400);
  const trimmed = sql.trim();
  if (/^\s*DROP\s+DATABASE\b/i.test(trimmed)) {
    return jsonResponse({ error: 'DROP DATABASE is not permitted via this API' }, 403);
  }

  const isSuperadmin = authUserIsSuperadmin(authUser);
  const gate = getDatabaseSqlRunGate(trimmed, {
    isSuperadmin,
    studioApproved: body?.studio_approved === true || body?.studioApproved === true,
    destructiveConfirmed:
      body?.destructive_confirmed === true || body?.destructiveConfirmed === true,
  });
  if (!gate.canExecute) {
    return jsonResponse(
      {
        error: gate.error || 'SQL not permitted',
        code: gate.requiresConfirmTyping ? 'hyperdrive_destructive_confirm' : 'hyperdrive_read_only',
        statement_kind: gate.kind,
        risk_level: gate.riskLevel,
        requires_studio_approval: gate.requiresApproval === true && !gate.requiresConfirmTyping,
        requires_destructive_confirm: gate.requiresConfirmTyping === true,
      },
      gate.kind === 'unknown' ? 400 : 403,
    );
  }

  const t0 = Date.now();
  const result = await runHyperdriveQuery(env, trimmed, params);
  const executionMs = Date.now() - t0;
  if (!result.ok) {
    return jsonResponse(
      {
        error: 'Hyperdrive query failed',
        detail: result.error ?? 'unknown',
        results: [],
        rows: [],
      },
      500,
    );
  }
  const rows = result.rows ?? [];
  return jsonResponse({
    ok: true,
    success: true,
    rows,
    results: rows,
    meta: result.meta ?? {
      duration_ms: executionMs,
      rows_read: rows.length,
    },
    executionMs,
  });
}

/**
 * Hyperdrive SQL Execution Proxy (POST /api/hyperdrive).
 */
export async function handleHyperdriveApi(request, env) {
  return executeHyperdriveSqlFromRequest(request, env);
}

/**
 * Routes for /api/hyperdrive/* — tables list, health, table schema/data, SQL query.
 * Hyperdrive is a connection pooler; supports full CRUD via SQL.
 *
 * @param {Request} request
 * @param {URL} url
 * @param {any} env
 */
export async function handleHyperdriveRoutes(request, url, env) {
  const pathLower = url.pathname.toLowerCase();
  const method = request.method.toUpperCase();

  if (!isHyperdriveUsable(env)) {
    return jsonResponse({ error: 'Hyperdrive binding not configured or not usable' }, 503);
  }

  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

  if (pathLower === '/api/hyperdrive' && method === 'POST') {
    return handleHyperdriveApi(request, env);
  }

  if (pathLower === '/api/hyperdrive/query' && method === 'POST') {
    return executeHyperdriveSqlFromRequest(request, env);
  }

  if ((pathLower === '/api/hyperdrive/health' || pathLower === '/api/hyperdrive/status') && method === 'GET') {
    const t0 = Date.now();
    const r = await runHyperdriveQuery(env, 'SELECT 1 AS ok', []);
    const latency_ms = Date.now() - t0;
    if (!r.ok) {
      return jsonResponse(
        { ok: false, error: r.error ?? 'query_failed', latency_ms },
        503,
      );
    }
    return jsonResponse({
      ok: true,
      latency_ms,
      active_connections: null,
    });
  }

  if (pathLower === '/api/hyperdrive/tables' && method === 'GET') {
    const sql = `SELECT table_name, table_type
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name`;
    try {
      const result = await runHyperdriveQuery(env, sql, []);
      if (!result.ok) throw new Error(result.error || 'query_failed');
      const rows = result.rows ?? [];
      const tables = rows
        .map((r) => ({
          name: String(r.table_name || '').trim(),
          table_name: String(r.table_name || '').trim(),
          table_schema: 'public',
          table_type: r.table_type ?? null,
        }))
        .filter((r) => r.name);
      return jsonResponse({ tables });
    } catch (e) {
      return jsonResponse({
        tables: [],
        error: e?.message ?? String(e),
        hint: 'Check Hyperdrive connection',
      }, 200);
    }
  }

  const tableRoute = url.pathname.match(/^\/api\/hyperdrive\/table\/([^/]+)\/(schema|data)$/i);
  if (tableRoute && method === 'GET') {
    const tableRaw = decodeURIComponent(tableRoute[1]);
    try {
      pgQuoteIdent(tableRaw);
    } catch {
      return jsonResponse({ error: 'Invalid table name' }, 400);
    }
    const action = tableRoute[2].toLowerCase();

    if (action === 'schema') {
      try {
        const colsR = await runHyperdriveQuery(env,
          `SELECT c.ordinal_position - 1 AS cid,
                  c.column_name AS name,
                  c.data_type AS type,
                  CASE WHEN c.is_nullable = 'NO' THEN 1 ELSE 0 END AS notnull,
                  c.column_default AS dflt_value,
                  CASE WHEN pk.column_name IS NOT NULL THEN 1 ELSE 0 END AS pk
             FROM information_schema.columns c
             LEFT JOIN (
               SELECT kcu.column_name
                 FROM information_schema.table_constraints tc
                 JOIN information_schema.key_column_usage kcu
                   ON kcu.constraint_name = tc.constraint_name
                  AND kcu.table_schema = tc.table_schema
                WHERE tc.table_schema = 'public'
                  AND tc.table_name = $1
                  AND tc.constraint_type = 'PRIMARY KEY'
             ) pk ON pk.column_name = c.column_name
            WHERE c.table_schema = 'public'
              AND c.table_name = $1
            ORDER BY c.ordinal_position`,
          [tableRaw],
        );
        if (!colsR.ok) throw new Error(colsR.error || 'schema_columns_failed');
        const idxR = await runHyperdriveQuery(env,
          `SELECT indexname AS name, indexdef AS sql
             FROM pg_indexes
            WHERE schemaname = 'public' AND tablename = $1
            ORDER BY indexname`,
          [tableRaw],
        );
        if (!idxR.ok) throw new Error(idxR.error || 'schema_indexes_failed');
        const fkR = await runHyperdriveQuery(env,
          `SELECT kcu.column_name AS source_column,
                  ccu.table_name AS target_table,
                  ccu.column_name AS target_column,
                  'outbound' AS direction
             FROM information_schema.table_constraints tc
             JOIN information_schema.key_column_usage kcu
               ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
             JOIN information_schema.constraint_column_usage ccu
               ON ccu.constraint_name = tc.constraint_name
              AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND tc.table_schema = 'public'
              AND tc.table_name = $1`,
          [tableRaw],
        );
        if (!fkR.ok) throw new Error(fkR.error || 'schema_fk_failed');
        return jsonResponse({
          columns: colsR.rows ?? [],
          indexes: idxR.rows ?? [],
          foreign_keys: fkR.rows ?? [],
        });
      } catch (e) {
        return jsonResponse({ error: e?.message ?? String(e) }, 500);
      }
    }

    const pageNum = Math.max(1, Number(url.searchParams.get('page') || '1'));
    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit') || '50')));
    const sort = String(url.searchParams.get('sort') || '').trim();
    const dir = String(url.searchParams.get('dir') || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    const identQuoted = pgQuoteIdent(tableRaw);
    const filters = parseDatabaseFiltersJson(url.searchParams.get('filter'));

    const colsR = await runHyperdriveQuery(
      env,
      `SELECT column_name AS name
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position`,
      [tableRaw],
    );
    if (!colsR.ok) throw new Error(colsR.error || 'schema_columns_failed');
    const columnAllowlist = new Set(
      (colsR.rows ?? []).map((r) => String(r.name || '').trim()).filter(Boolean),
    );

    let built = { where: '', values: [] };
    try {
      built = buildPostgresFilterWhere(filters, {
        quoteIdent: pgQuoteIdent,
        allowColumns: columnAllowlist,
      });
    } catch (filterErr) {
      return jsonResponse({ error: filterErr?.message || 'Invalid filter' }, 400);
    }

    let order = '';
    try {
      order = buildAllowlistedOrderBy(sort, dir, columnAllowlist, pgQuoteIdent);
    } catch {
      order = '';
    }

    const offset = (pageNum - 1) * limit;
    const filterValues = built.values;
    const limitParam = `$${filterValues.length + 1}`;
    const offsetParam = `$${filterValues.length + 2}`;
    try {
      const countRes = await runHyperdriveQuery(
        env,
        `SELECT COUNT(*)::int AS count FROM public.${identQuoted}${built.where}`,
        filterValues,
      );
      if (!countRes.ok) throw new Error(countRes.error || 'count_failed');
      const total = Number(countRes.rows?.[0]?.count ?? 0);
      const rowsRes = await runHyperdriveQuery(
        env,
        `SELECT * FROM public.${identQuoted}${built.where}${order} LIMIT ${limitParam} OFFSET ${offsetParam}`,
        [...filterValues, limit, offset],
      );
      if (!rowsRes.ok) throw new Error(rowsRes.error || 'select_failed');
      const rowList = rowsRes.rows ?? [];
      return jsonResponse({
        rows: rowList,
        total_count: total,
        columns: rowList.length ? Object.keys(rowList[0]) : [],
        page: pageNum,
        total_pages: Math.max(1, Math.ceil(total / limit)),
      });
    } catch (e) {
      return jsonResponse({ error: e?.message ?? String(e) }, 500);
    }
  }

  return jsonResponse({ error: 'Hyperdrive route not found' }, 404);
}
