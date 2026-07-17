/**
 * D1 routes for the dashboard Database page (/api/d1/*).
 * Mirrors legacy worker.js behavior for production dispatch (src/index.js).
 *
 * P0 data isolation audit 2026-05-23 — unscoped SELECT (grep -v WHERE user_id|workspace_id|tenant_id):
 * Full log: artifacts/p0-data-isolation-audit-20260523.txt
 * (d1-dashboard had no prior unscoped user-data SELECTs; platform env.DB gated below.)
 */

import { jsonResponse } from '../core/responses.js';
import { getAuthUser } from '../core/auth.js';
import { iamD1QuoteIdent } from '../core/d1.js';
import { getDatabaseSqlRunGate } from '../core/database-sql-safety.js';
import {
  buildAllowlistedOrderBy,
  buildD1FilterWhere,
  parseDatabaseFiltersJson,
} from '../core/database-table-filters.js';
import { resolveCanonicalUserId } from './auth.js';
import { IAM_D1_DATABASE_ID } from '../core/d1-graphql-analytics.js';
import {
  assertCallerOwnsDatabaseId,
  listOAuthAccountD1Catalog,
} from '../core/cf-mcp-proxy.js';
import { logDataPlaneSecurityEvent } from '../core/data-plane-access-guard.js';
import { isPlatformOperator, resolveOperatorAuthUserRow } from '../core/operator-identity.js';
import { getOAuthToken } from '../core/user-oauth-token.js';
import { createRemoteD1Adapter } from '../core/remote-d1-adapter.js';

export { resolveUserWorkspaceBinding } from '../core/data-isolation-scope.js';

function trimHeader(v) {
  return v == null ? '' : String(v).trim();
}

function d1OnboardingResponse() {
  return jsonResponse(
    {
      tables: [],
      onboarding_required: true,
      message: 'Connect your Cloudflare D1 to use Database Studio',
    },
    200,
  );
}

/**
 * @param {any} env
 * @param {unknown} authUser
 * @param {string} userId
 */
async function listOAuthD1DatabasesForDashboard(env, authUser, userId) {
  const operator = await isPlatformOperator(env, await resolveOperatorAuthUserRow(env, authUser));
  /** @type {Array<{ database_name: string, database_id: string, workspace_id?: string|null, source: string }>} */
  const out = [];
  const seen = new Set();

  if (operator && env?.DB) {
    const platformName = 'inneranimalmedia-business';
    seen.add(IAM_D1_DATABASE_ID.toLowerCase());
    out.push({
      database_name: platformName,
      database_id: IAM_D1_DATABASE_ID,
      workspace_id: null,
      source: 'platform_operator',
    });
  }

  const oauth = await getOAuthToken(env, userId, 'cloudflare');
  if (!oauth) return { databases: out, cloudflare_connected: false, operator };

  const catalog = await listOAuthAccountD1Catalog(oauth);
  for (const entry of catalog) {
    const key = entry.database_id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      database_name: entry.database_name,
      database_id: entry.database_id,
      workspace_id: null,
      source: 'user_account',
    });
  }

  return { databases: out, cloudflare_connected: true, operator, oauth_token: oauth };
}

/**
 * @param {unknown} env
 * @param {unknown} authUser
 * @param {Request} request
 */
async function requireScopedD1(env, authUser, request) {
  const rawId = String(authUser?.id || '').trim();
  const userId = rawId ? await resolveCanonicalUserId(rawId, env).catch(() => rawId) : '';
  const opRow = await resolveOperatorAuthUserRow(env, authUser);
  const operator = await isPlatformOperator(env, opRow);

  const databaseIdHeader = trimHeader(request?.headers?.get?.('x-iam-database-id'));
  const databaseNameHeader = trimHeader(request?.headers?.get?.('x-iam-database-name'));

  const listed = await listOAuthD1DatabasesForDashboard(env, authUser, userId);
  const explicitResourceRequested = Boolean(databaseIdHeader || databaseNameHeader);

  if (operator && env?.DB) {
    let selected = listed.databases.find(
      (d) =>
        (databaseIdHeader && d.database_id.toLowerCase() === databaseIdHeader.toLowerCase()) ||
        (databaseNameHeader && d.database_name.toLowerCase() === databaseNameHeader.toLowerCase()),
    );
    if (!selected && databaseIdHeader.toLowerCase() === IAM_D1_DATABASE_ID.toLowerCase()) {
      selected = listed.databases.find((d) => d.database_id === IAM_D1_DATABASE_ID);
    }
    if (explicitResourceRequested && !selected) {
      return {
        db: null,
        userId,
        mode: 'denied',
        error: 'd1_resource_not_in_authenticated_account',
      };
    }

    if (selected?.source === 'platform_operator') {
      logDataPlaneSecurityEvent('platform_operator_d1_studio', {
        user_id: userId,
        database_id: IAM_D1_DATABASE_ID,
        auth_scope: 'platform_operator',
      });
      return { db: env.DB, userId, mode: 'platform_operator', database_id: IAM_D1_DATABASE_ID };
    }

    if (selected && listed.oauth_token) {
      const owned = await assertCallerOwnsDatabaseId(env, userId, selected.database_id, authUser);
      if (owned.ok && owned.account_id) {
        return {
          db: createRemoteD1Adapter({
            token: listed.oauth_token,
            account_id: owned.account_id,
            database_id: selected.database_id,
          }),
          userId,
          mode: 'user_account',
          database_id: selected.database_id,
        };
      }
    }

    return { db: null, userId, mode: 'denied', error: 'd1_resource_resolution_failed' };
  }

  if (!listed.cloudflare_connected || !listed.oauth_token) {
    return { db: null, userId, mode: 'onboarding' };
  }

  if (!listed.databases.length) {
    return { db: null, userId, mode: 'onboarding' };
  }

  let selected =
    listed.databases.find(
      (d) =>
        databaseIdHeader &&
        d.database_id.toLowerCase() === databaseIdHeader.toLowerCase() &&
        d.source === 'user_account',
    ) ||
    listed.databases.find(
      (d) =>
        databaseNameHeader &&
        d.database_name.toLowerCase() === databaseNameHeader.toLowerCase() &&
        d.source === 'user_account',
    ) ||
    null;

  if (!selected) {
    return { db: null, userId, mode: 'onboarding' };
  }

  const owned = await assertCallerOwnsDatabaseId(env, userId, selected.database_id, authUser);
  if (!owned.ok || !owned.account_id) {
    return { db: null, userId, mode: 'denied', error: owned.error };
  }

  return {
    db: createRemoteD1Adapter({
      token: listed.oauth_token,
      account_id: owned.account_id,
      database_id: selected.database_id,
    }),
    userId,
    mode: 'user_account',
    database_id: selected.database_id,
  };
}

/**
 * @param {any} env
 * @param {unknown} authUser
 * @param {Request} request
 */
async function buildD1DashboardContext(env, authUser, request) {
  const rawId = String(authUser?.id || '').trim();
  const userId = rawId ? await resolveCanonicalUserId(rawId, env).catch(() => rawId) : '';
  const listed = await listOAuthD1DatabasesForDashboard(env, authUser, userId);

  const databaseNameHeader = trimHeader(request?.headers?.get?.('x-iam-database-name'));
  const databaseIdHeader = trimHeader(request?.headers?.get?.('x-iam-database-id'));

  let active = listed.databases.find(
    (d) =>
      (databaseIdHeader && d.database_id.toLowerCase() === databaseIdHeader.toLowerCase()) ||
      (databaseNameHeader && d.database_name.toLowerCase() === databaseNameHeader.toLowerCase()),
  );
  return {
    databases: listed.databases.map((d) => ({
      database_name: d.database_name,
      database_id: d.database_id,
      source: d.source,
    })),
    active_database_name: active?.database_name || null,
    active_database_id: active?.database_id || null,
    pinned_database_id: null,
    pinned_database_name: null,
    platform_available: listed.operator,
    cloudflare_connected: listed.cloudflare_connected,
    onboarding_required: !listed.operator && !listed.cloudflare_connected,
    auth_scope: listed.operator ? 'platform_operator' : listed.cloudflare_connected ? 'user_account' : null,
  };
}

/**
 * @param {Request} request
 * @param {URL} url
 * @param {any} env
 * @returns {Promise<Response>}
 */
export async function handleD1DashboardRoutes(request, url, env) {
  const pathLower = url.pathname.toLowerCase();
  const method = request.method.toUpperCase();

  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

  if (pathLower === '/api/d1/context' && method === 'GET') {
    const ctx = await buildD1DashboardContext(env, authUser, request);
    return jsonResponse(ctx);
  }

  const explicitD1Resource =
    String(request.headers.get('X-IAM-Database-Name') || '').trim() ||
    String(request.headers.get('X-IAM-Database-Id') || '').trim();
  if (!explicitD1Resource) {
    return jsonResponse({ error: 'explicit_d1_resource_required' }, 400);
  }

  const scoped = await requireScopedD1(env, authUser, request);
  const userDb = scoped.db;

  if (pathLower === '/api/d1/tables' && method === 'GET') {
    if (!userDb) return d1OnboardingResponse();
    try {
      const { results } = await userDb.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC`,
      ).all();
      const tables = (results ?? [])
        .map((r) => ({ name: String(r.name || '').trim() }))
        .filter((t) => t.name);
      return jsonResponse({ tables });
    } catch (e) {
      return jsonResponse({ tables: [], error: e?.message ?? String(e) }, 500);
    }
  }

  if (pathLower === '/api/d1/query' && method === 'POST') {
    if (!userDb) return d1OnboardingResponse();
    try {
      const body = await request.json().catch(() => ({}));
      const sql = body?.sql;
      const params = body?.params;
      if (!sql || typeof sql !== 'string') return jsonResponse({ error: 'sql required' }, 400);
      if (/^\s*DROP\s+DATABASE\b/i.test(sql.trim())) {
        return jsonResponse({ error: 'DROP DATABASE is not permitted via this API' }, 403);
      }
      const trimmed = sql.trim();
      const operator = await isPlatformOperator(env, await resolveOperatorAuthUserRow(env, authUser));
      const gate = getDatabaseSqlRunGate(trimmed, {
        isSuperadmin: operator,
        studioApproved: body?.studio_approved === true || body?.studioApproved === true,
        destructiveConfirmed:
          body?.destructive_confirmed === true || body?.destructiveConfirmed === true,
      });
      if (!gate.canExecute) {
        return jsonResponse(
          {
            error: gate.error || 'SQL not permitted',
            statement_kind: gate.kind,
            risk_level: gate.riskLevel,
            requires_studio_approval: gate.requiresApproval === true && !gate.requiresConfirmTyping,
            requires_destructive_confirm: gate.requiresConfirmTyping === true,
          },
          gate.kind === 'unknown' ? 400 : 403,
        );
      }
      const isRead = gate.kind === 'read' || gate.kind === 'explain';
      const bindings = Array.isArray(params) ? params : [];
      if (isRead) {
        const _t0 = Date.now();
        const { results, success, meta } = await userDb.prepare(sql).bind(...bindings).all();
        const executionMs = Date.now() - _t0;
        return jsonResponse({
          rows: results || [],
          results: results || [],
          success,
          meta: { ...(meta || {}), duration_ms: executionMs },
          executionMs,
        });
      }
      const _t1 = Date.now();
      const run = await userDb.prepare(sql).bind(...bindings).run();
      const executionMs = Date.now() - _t1;
      return jsonResponse({
        rows: [],
        results: [],
        success: true,
        meta: { ...(run.meta || {}), duration_ms: executionMs },
        executionMs,
      });
    } catch (e) {
      return jsonResponse({ error: e?.message || 'Query failed', results: [] }, 200);
    }
  }

  const d1TableRoute = url.pathname.match(/^\/api\/d1\/table\/([^/]+)\/(schema|data|indexes)$/i);
  if (d1TableRoute && method === 'GET') {
    if (!userDb) return d1OnboardingResponse();
    const table = decodeURIComponent(d1TableRoute[1]);
    const action = d1TableRoute[2].toLowerCase();
    let qtable;
    try {
      qtable = iamD1QuoteIdent(table);
    } catch {
      return jsonResponse({ error: 'Invalid table name' }, 400);
    }
    try {
      if (action === 'schema') {
        const [columns, indexList, foreignKeys] = await Promise.all([
          userDb.prepare(`PRAGMA table_info(${qtable})`).all(),
          userDb.prepare(`PRAGMA index_list(${qtable})`).all(),
          userDb.prepare(`PRAGMA foreign_key_list(${qtable})`).all(),
        ]);
        const indexNames = (indexList.results || []).map((r) => String(r.name || '')).filter(Boolean);
        const indexes = [];
        for (const name of indexNames) {
          const row = await userDb.prepare(`SELECT name, sql FROM sqlite_master WHERE type='index' AND name = ? LIMIT 1`)
            .bind(name)
            .first();
          indexes.push({ name, sql: row?.sql || null });
        }
        return jsonResponse({
          columns: columns.results || [],
          schema: columns.results || [],
          indexes,
          foreign_keys: foreignKeys.results || [],
        });
      }
      if (action === 'indexes') {
        const indexes = await userDb.prepare(
          `SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name = ? ORDER BY name`,
        )
          .bind(table)
          .all();
        return jsonResponse({ indexes: indexes.results || [] });
      }
      const pageNum = Math.max(1, Number(url.searchParams.get('page') || '1'));
      const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit') || '50')));
      const sort = String(url.searchParams.get('sort') || '').trim();
      const dir = String(url.searchParams.get('dir') || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
      const filters = parseDatabaseFiltersJson(url.searchParams.get('filter'));
      let columnAllowlist = null;
      try {
        const colRows = await userDb.prepare(`PRAGMA table_info(${qtable})`).all();
        columnAllowlist = new Set(
          (colRows.results || []).map((r) => String(r.name || '').trim()).filter(Boolean),
        );
      } catch {
        columnAllowlist = null;
      }
      let built = { where: '', values: [] };
      try {
        built = buildD1FilterWhere(filters, {
          quoteIdent: iamD1QuoteIdent,
          allowColumns: columnAllowlist,
        });
      } catch (filterErr) {
        return jsonResponse({ error: filterErr?.message || 'Invalid filter' }, 400);
      }
      let order = '';
      try {
        order = buildAllowlistedOrderBy(sort, dir, columnAllowlist, iamD1QuoteIdent);
      } catch {
        order = '';
      }
      const offset = (pageNum - 1) * limit;
      const countRow = await userDb.prepare(`SELECT COUNT(*) AS count FROM ${qtable}${built.where}`)
        .bind(...built.values)
        .first();
      const rows = await userDb.prepare(`SELECT * FROM ${qtable}${built.where}${order} LIMIT ? OFFSET ?`)
        .bind(...built.values, limit, offset)
        .all();
      const total = Number(countRow?.count ?? 0);
      return jsonResponse({
        rows: rows.results || [],
        total_count: total,
        columns: rows.results?.[0] ? Object.keys(rows.results[0]) : [],
        page: pageNum,
        total_pages: Math.max(1, Math.ceil(total / limit)),
      });
    } catch (e) {
      return jsonResponse({ error: e?.message || String(e) }, 500);
    }
  }

  const d1RowRoute = url.pathname.match(/^\/api\/d1\/table\/([^/]+)\/row$/i);
  if (d1RowRoute && method === 'POST') {
    if (!userDb) return d1OnboardingResponse();
    const table = decodeURIComponent(d1RowRoute[1]);
    const body = await request.json().catch(() => ({}));
    const columns = body?.columns && typeof body.columns === 'object' ? body.columns : {};
    const names = Object.keys(columns);
    try {
      const sql = names.length
        ? `INSERT INTO ${iamD1QuoteIdent(table)} (${names.map(iamD1QuoteIdent).join(', ')}) VALUES (${names.map(() => '?').join(', ')})`
        : `INSERT INTO ${iamD1QuoteIdent(table)} DEFAULT VALUES`;
      const run = await userDb.prepare(sql).bind(...names.map((n) => columns[n])).run();
      return jsonResponse({ success: true, id: run.meta?.last_row_id ?? null, row: columns });
    } catch (e) {
      return jsonResponse({ error: e?.message || String(e) }, 500);
    }
  }

  if (d1RowRoute && method === 'PATCH') {
    if (!userDb) return d1OnboardingResponse();
    const table = decodeURIComponent(d1RowRoute[1]);
    const body = await request.json().catch(() => ({}));
    const updates = body?.updates && typeof body.updates === 'object' ? body.updates : {};
    const names = Object.keys(updates);
    if (!body.pk_col || !names.length) return jsonResponse({ error: 'pk_col and updates required' }, 400);
    try {
      await userDb
        .prepare(
          `UPDATE ${iamD1QuoteIdent(table)} SET ${names.map((n) => `${iamD1QuoteIdent(n)} = ?`).join(', ')} WHERE ${iamD1QuoteIdent(body.pk_col)} = ?`,
        )
        .bind(...names.map((n) => updates[n]), body.pk_val)
        .run();
      const row = await userDb.prepare(`SELECT * FROM ${iamD1QuoteIdent(table)} WHERE ${iamD1QuoteIdent(body.pk_col)} = ? LIMIT 1`)
        .bind(body.pk_val)
        .first();
      return jsonResponse({ success: true, row });
    } catch (e) {
      return jsonResponse({ error: e?.message || String(e) }, 500);
    }
  }

  const d1RowsRoute = url.pathname.match(/^\/api\/d1\/table\/([^/]+)\/rows$/i);
  if (d1RowsRoute && method === 'DELETE') {
    if (!userDb) return d1OnboardingResponse();
    const body = await request.json().catch(() => ({}));
    if (body.confirm !== true) return jsonResponse({ error: 'confirm=true required' }, 400);
    const table = decodeURIComponent(d1RowsRoute[1]);
    const vals = Array.isArray(body.pk_vals) ? body.pk_vals : [];
    if (!body.pk_col || !vals.length) return jsonResponse({ error: 'pk_col and pk_vals required' }, 400);
    try {
      const sql = `DELETE FROM ${iamD1QuoteIdent(table)} WHERE ${iamD1QuoteIdent(body.pk_col)} IN (${vals.map(() => '?').join(', ')})`;
      const run = await userDb.prepare(sql).bind(...vals).run();
      return jsonResponse({ deleted: run.meta?.changes ?? vals.length });
    } catch (e) {
      return jsonResponse({ error: e?.message || String(e) }, 500);
    }
  }

  return jsonResponse({ error: 'D1 route not found' }, 404);
}
