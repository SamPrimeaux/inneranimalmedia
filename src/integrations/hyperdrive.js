/**
 * Integration Layer: Hyperdrive / Supabase Postgres
 * SQL proxy to Supabase via Cloudflare Hyperdrive binding (env.HYPERDRIVE).
 * Uses postgres.js (npm package) with env.HYPERDRIVE.connectionString.
 *
 * Requires:
 *   - `npm i postgres` in package.json
 *   - nodejs_compat flag in wrangler.jsonc
 *   - env.HYPERDRIVE binding (ID: 9108dd6499bb44c286e4eb298c6ffafb)
 *
 * Owns: user/client data that lives in Supabase (not D1).
 * Never used for D1 tables — those use env.DB directly.
 */
import postgres from 'postgres';
import { jsonResponse } from '../core/responses.js';
import { getAuthUser } from '../core/auth.js';

// ─── Security ─────────────────────────────────────────────────────────────────

const BLOCKED = /\b(drop\s+table|truncate|drop\s+database|drop\s+schema)\b/i;

/**
 * Check SQL against the blocked operation list.
 * Returns an error string if blocked, null if safe.
 */
function checkSqlSafety(sql) {
  if (BLOCKED.test(sql)) {
    return 'Blocked: DROP TABLE, TRUNCATE, and DROP DATABASE require manual approval';
  }
  return null;
}

// ─── Core Query ───────────────────────────────────────────────────────────────

/**
 * Execute a parameterized SQL query via Hyperdrive.
 * Returns rows array on SELECT, or { changes, command } on write.
 *
 * @param {object} env
 * @param {string} sqlText   - parameterized SQL ($1, $2, ...)
 * @param {any[]}  params    - bound parameter values
 * @returns {Promise<any[]|{changes: number, command: string}>}
 */
export async function queryHyperdrive(env, sqlText, params = []) {
  if (!env.HYPERDRIVE) throw new Error('Hyperdrive binding (env.HYPERDRIVE) not configured');

  const safetyError = checkSqlSafety(sqlText);
  if (safetyError) throw new Error(safetyError);

  const sql = postgres(env.HYPERDRIVE.connectionString, {
    max:         5,
    fetch_types: false,
    prepare:     true,
  });

  try {
    const rows = await sql.unsafe(sqlText, params);
    return rows;
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}

/**
 * Execute a raw SQL query and return rows as plain objects.
 * Convenience wrapper that handles connection lifecycle.
 */
export async function pgQuery(env, sqlText, params = []) {
  const rows = await queryHyperdrive(env, sqlText, params);
  // postgres.js returns result rows as objects — convert to plain array
  return Array.isArray(rows) ? rows.map(r => ({ ...r })) : [];
}

// ─── HTTP Handler ─────────────────────────────────────────────────────────────

/**
 * HTTP dispatcher for /api/hyperdrive route.
 * Accepts POST with { sql, params, operation }.
 * Auth required. Reads blocked for dangerous operations.
 */
export async function handleHyperdriveApi(request, env) {
  const method = request.method.toUpperCase();
  if (method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

  if (!env.HYPERDRIVE) return jsonResponse({ error: 'Hyperdrive not configured' }, 503);

  let body = {};
  try { body = await request.json(); } catch (_) {}

  const { sql: sqlText, params = [], operation } = body;
  if (!sqlText || typeof sqlText !== 'string' || !sqlText.trim()) {
    return jsonResponse({ error: 'sql is required' }, 400);
  }

  const safetyError = checkSqlSafety(sqlText);
  if (safetyError) return jsonResponse({ error: safetyError }, 403);

  const sql = postgres(env.HYPERDRIVE.connectionString, {
    max:         5,
    fetch_types: false,
    prepare:     true,
  });

  try {
    const rows  = await sql.unsafe(sqlText, Array.isArray(params) ? params : []);
    const plain = Array.isArray(rows) ? rows.map(r => ({ ...r })) : [];

    return jsonResponse({
      rows:    plain,
      count:   plain.length,
      command: rows.command || operation || 'query',
    });
  } catch (e) {
    return jsonResponse({ error: 'Hyperdrive query failed', detail: e.message }, 500);
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}
