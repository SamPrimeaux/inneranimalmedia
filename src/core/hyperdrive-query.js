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
