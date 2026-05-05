import { jsonResponse } from '../core/responses.js';
import { getAuthUser, authUserIsSuperadmin } from '../core/auth.js';

/** @param {string} ident */
function pgQuoteIdent(ident) {
  const s = String(ident || '').trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)) {
    throw new Error('invalid table or column identifier');
  }
  return `"${s.replace(/"/g, '""')}"`;
}

/** @param {string} sql */
function sqlStatementKind(sql) {
  const t = String(sql || '')
    .trim()
    .replace(/^\(/, '')
    .replace(/^WITH\s+[\s\S]+?\)\s*/i, '');
  const u = t.toUpperCase();
  if (/^(CREATE|ALTER|DROP)\s+/i.test(u)) return 'ddl';
  return 'dml';
}

/**
 * Generic POST body executor — SELECT, INSERT, UPDATE, DELETE, DDL (superadmin only).
 * @param {Request} request
 * @param {any} env
 * @param {{ requireSuperadminForDdl?: boolean }} [opts]
 */
async function executeHyperdriveSqlFromRequest(request, env) {
  if (!env.HYPERDRIVE) {
    return jsonResponse({ error: 'Hyperdrive binding not configured' }, 503);
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
  if (sqlStatementKind(trimmed) === 'ddl' && !authUserIsSuperadmin(authUser)) {
    return jsonResponse({ error: 'Superadmin required for DDL statements' }, 403);
  }

  try {
    const t0 = Date.now();
    const result = await env.HYPERDRIVE.query(trimmed, params);
    const rows = result?.rows ?? [];
    const executionMs = Date.now() - t0;
    return jsonResponse({
      ok: true,
      success: true,
      rows,
      results: rows,
      meta: result?.meta ?? {
        duration_ms: executionMs,
        rows_read: rows.length,
      },
      executionMs,
    });
  } catch (e) {
    return jsonResponse(
      { error: 'Hyperdrive query failed', detail: e?.message ?? String(e), results: [], rows: [] },
      500,
    );
  }
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

  if (!env.HYPERDRIVE) {
    return jsonResponse({ error: 'Hyperdrive binding not configured' }, 503);
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
    try {
      await env.HYPERDRIVE.query('SELECT 1 AS ok', []);
      const latency_ms = Date.now() - t0;
      return jsonResponse({
        ok: true,
        latency_ms,
        active_connections: null,
      });
    } catch (e) {
      return jsonResponse(
        { ok: false, error: e?.message ?? String(e), latency_ms: Date.now() - t0 },
        503,
      );
    }
  }

  if (pathLower === '/api/hyperdrive/tables' && method === 'GET') {
    const sql = `SELECT table_name, table_type
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name`;
    try {
      const result = await env.HYPERDRIVE.query(sql, []);
      const rows = result?.rows ?? [];
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
      return jsonResponse({ tables: [], error: e?.message ?? String(e) }, 500);
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
        const cols = await env.HYPERDRIVE.query(
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
        const idx = await env.HYPERDRIVE.query(
          `SELECT indexname AS name, indexdef AS sql
             FROM pg_indexes
            WHERE schemaname = 'public' AND tablename = $1
            ORDER BY indexname`,
          [tableRaw],
        );
        const fk = await env.HYPERDRIVE.query(
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
        return jsonResponse({
          columns: cols?.rows ?? [],
          indexes: idx?.rows ?? [],
          foreign_keys: fk?.rows ?? [],
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
    let order = '';
    if (sort) {
      try {
        order = ` ORDER BY ${pgQuoteIdent(sort)} ${dir}`;
      } catch {
        order = '';
      }
    }
    const offset = (pageNum - 1) * limit;
    try {
      const countRes = await env.HYPERDRIVE.query(
        `SELECT COUNT(*)::int AS count FROM public.${identQuoted}`,
        [],
      );
      const total = Number(countRes?.rows?.[0]?.count ?? 0);
      const rowsRes = await env.HYPERDRIVE.query(
        `SELECT * FROM public.${identQuoted}${order} LIMIT $1 OFFSET $2`,
        [limit, offset],
      );
      const rowList = rowsRes?.rows ?? [];
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
