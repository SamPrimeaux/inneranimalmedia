/**
 * Cloudflare Hyperdrive: production binding is `env.HYPERDRIVE`.
 * Some runtimes expose `.query(sql, params)`; the documented shape uses
 * `.connectionString` with a Postgres driver (see `src/api/rag.js` `withPg`).
 * Analytics incorrectly required `.query` only, which hides a configured binding.
 */

/** @param {any} env */
export function isHyperdriveBindingPresent(env) {
  return env != null && env.HYPERDRIVE != null && typeof env.HYPERDRIVE === 'object';
}

/** @param {any} env */
export function hyperdriveNativeQueryAvailable(env) {
  return typeof env?.HYPERDRIVE?.query === 'function';
}

/** @param {any} env */
export function hyperdriveConnectionStringAvailable(env) {
  const cs = env?.HYPERDRIVE?.connectionString;
  return typeof cs === 'string' && cs.trim().length > 0;
}

/**
 * Binding is present and we can run SQL (native .query or pg + connectionString).
 * @param {any} env
 */
export function isHyperdriveUsable(env) {
  if (!isHyperdriveBindingPresent(env)) return false;
  return hyperdriveNativeQueryAvailable(env) || hyperdriveConnectionStringAvailable(env);
}

/**
 * @param {any} env
 * @param {string} sql
 * @param {unknown[]} [params]
 * @returns {Promise<{ ok: boolean, rows: any[], error?: string, meta?: Record<string, unknown> }>}
 */
export async function runHyperdriveQuery(env, sql, params = []) {
  if (!isHyperdriveBindingPresent(env)) {
    return { ok: false, rows: [], error: 'hyperdrive_binding_absent' };
  }
  if (hyperdriveNativeQueryAvailable(env)) {
    try {
      const result = await env.HYPERDRIVE.query(sql, params);
      return { ok: true, rows: result?.rows ?? [], meta: result?.meta ?? {} };
    } catch (e) {
      return { ok: false, rows: [], error: e?.message ? String(e.message) : String(e) };
    }
  }
  if (hyperdriveConnectionStringAvailable(env)) {
    try {
      const { Client } = await import('pg');
      const client = new Client({ connectionString: env.HYPERDRIVE.connectionString });
      await client.connect();
      try {
        const result = await client.query(sql, params);
        return { ok: true, rows: result?.rows ?? [], meta: {} };
      } finally {
        await client.end().catch(() => {});
      }
    } catch (e) {
      return { ok: false, rows: [], error: e?.message ? String(e.message) : String(e) };
    }
  }
  return { ok: false, rows: [], error: 'hyperdrive_no_query_path' };
}

/**
 * Run multiple Hyperdrive/Postgres queries in one connection + transaction.
 * Pass a callback that receives a { query(sql, params) } client.
 * Returns { ok, rows, result, error, meta } — same shape as runHyperdriveQuery.
 *
 * @param {any} env
 * @param {(client: { query: (sql: string, params?: unknown[]) => Promise<any> }) => Promise<any>} callback
 */
export async function runHyperdriveTransaction(env, callback) {
  if (!isHyperdriveBindingPresent(env)) {
    return { ok: false, rows: [], error: 'hyperdrive_binding_absent' };
  }

  if (hyperdriveConnectionStringAvailable(env)) {
    let client;
    try {
      const { Client } = await import('pg');
      client = new Client({ connectionString: env.HYPERDRIVE.connectionString });
      await client.connect();
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return {
        ok: true,
        rows: Array.isArray(result?.rows) ? result.rows : [],
        result,
        meta: {},
      };
    } catch (e) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      return { ok: false, rows: [], error: e?.message ? String(e.message) : String(e) };
    } finally {
      if (client) await client.end().catch(() => {});
    }
  }

  if (hyperdriveNativeQueryAvailable(env)) {
    try {
      await env.HYPERDRIVE.query('BEGIN', []);
      const adapter = {
        query: async (sql, params = []) => env.HYPERDRIVE.query(sql, params),
      };
      const result = await callback(adapter);
      await env.HYPERDRIVE.query('COMMIT', []);
      return {
        ok: true,
        rows: Array.isArray(result?.rows) ? result.rows : [],
        result,
        meta: result?.meta ?? {},
      };
    } catch (e) {
      await env.HYPERDRIVE.query('ROLLBACK', []).catch(() => {});
      return { ok: false, rows: [], error: e?.message ? String(e.message) : String(e) };
    }
  }

  return { ok: false, rows: [], error: 'hyperdrive_no_query_path' };
}
