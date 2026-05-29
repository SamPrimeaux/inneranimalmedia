/**
 * Hyperdrive / D1 database assistant — schema inspection and read-only SQL (agentsam schema canonical).
 */
import { runHyperdriveQuery, isHyperdriveUsable } from './hyperdrive-query.js';
import {
  classifyDatabaseOperation,
  evaluateDatabaseOperation,
  isSchemaAllowedForContext,
  resolveDatabaseRuntimeContext,
} from './database-operation-policy.js';
import { classifyDatabaseSqlStatement } from './database-sql-safety.js';
import { assertDataPlaneAccess, logDataPlaneSecurityEvent } from './data-plane-access-guard.js';

const AGENTSAM_SCHEMA = 'agentsam';
const DEFAULT_LIST_SCHEMAS = ['agentsam', 'public'];

/** @param {string} ident */
function pgQuoteIdent(ident) {
  const s = String(ident || '').trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)) throw new Error('invalid identifier');
  return `"${s.replace(/"/g, '""')}"`;
}

/** @param {string} schema @param {string} table */
export function qualifiedPgTable(schema, table) {
  return `${pgQuoteIdent(schema)}.${pgQuoteIdent(table)}`;
}

/**
 * @param {unknown} authUser
 * @param {Record<string, unknown>} [opts]
 */
export function resolveDbAssistantContext(authUser, opts = {}) {
  return resolveDatabaseRuntimeContext(authUser, {
    tenantId: opts.tenant_id ?? opts.tenantId,
    workspaceId: opts.workspace_id ?? opts.workspaceId,
    role: opts.role,
    canRunD1: opts.can_run_d1 !== false,
    canRunHyperdrive: opts.can_run_hyperdrive !== false,
  });
}

/**
 * @param {any} env
 * @param {string[]} schemas
 */
async function hyperdriveListTables(env, schemas = DEFAULT_LIST_SCHEMAS) {
  if (!isHyperdriveUsable(env)) return { ok: false, tables: [], error: 'hyperdrive_unavailable' };
  const allowed = schemas.filter((s) => DEFAULT_LIST_SCHEMAS.includes(s) || s === AGENTSAM_SCHEMA);
  const inList = allowed.length ? allowed : [AGENTSAM_SCHEMA];
  const placeholders = inList.map((_, i) => `$${i + 1}`).join(', ');
  const sql = `SELECT table_schema, table_name, table_type
     FROM information_schema.tables
    WHERE table_schema IN (${placeholders})
      AND table_type = 'BASE TABLE'
    ORDER BY table_schema, table_name`;
  const r = await runHyperdriveQuery(env, sql, inList);
  if (!r.ok) return { ok: false, tables: [], error: r.error || 'list_tables_failed' };
  const tables = (r.rows || []).map((row) => ({
    schema: String(row.table_schema || ''),
    name: String(row.table_name || ''),
    qualified_name: `${row.table_schema}.${row.table_name}`,
    table_type: row.table_type ?? null,
  }));
  return { ok: true, tables };
}

/**
 * @param {any} env
 * @param {string} schema
 * @param {string} table
 */
async function hyperdriveDescribeTable(env, schema, table) {
  const sql = `SELECT column_name, data_type, is_nullable, column_default, ordinal_position
     FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = $2
    ORDER BY ordinal_position`;
  const r = await runHyperdriveQuery(env, sql, [schema, table]);
  if (!r.ok) return { ok: false, columns: [], error: r.error };
  return { ok: true, columns: r.rows || [] };
}

/**
 * @param {any} env
 * @param {string} schema
 * @param {string} table
 */
async function hyperdriveInspectIndexes(env, schema, table) {
  const sql = `SELECT indexname, indexdef
     FROM pg_indexes
    WHERE schemaname = $1 AND tablename = $2
    ORDER BY indexname`;
  const r = await runHyperdriveQuery(env, sql, [schema, table]);
  if (!r.ok) return { ok: false, indexes: [], error: r.error };
  return { ok: true, indexes: r.rows || [] };
}

/**
 * @param {any} env
 * @param {string} schema
 * @param {string} table
 */
async function hyperdriveInspectRls(env, schema, table) {
  const sql = `SELECT pol.polname AS policy_name,
          pol.polcmd AS command,
          pol.polpermissive AS permissive,
          pg_get_expr(pol.polqual, pol.polrelid) AS using_expression,
          pg_get_expr(pol.polwithcheck, pol.polrelid) AS with_check_expression
     FROM pg_policy pol
     JOIN pg_class cls ON cls.oid = pol.polrelid
     JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
    WHERE nsp.nspname = $1 AND cls.relname = $2
    ORDER BY pol.polname`;
  const r = await runHyperdriveQuery(env, sql, [schema, table]);
  if (!r.ok) return { ok: false, policies: [], error: r.error };
  return { ok: true, policies: r.rows || [] };
}

/**
 * @param {any} env
 * @param {string} sql
 * @param {unknown[]} params
 * @param {import('./database-operation-policy.js').DatabaseRuntimeContext} ctx
 */
async function hyperdriveReadonlySql(env, sql, params, ctx) {
  const evalResult = evaluateDatabaseOperation(sql, ctx);
  if (!evalResult.allowed) {
    return { ok: false, rows: [], error: evalResult.reason, policy: evalResult };
  }
  const r = await runHyperdriveQuery(env, sql, params);
  if (!r.ok) return { ok: false, rows: [], error: r.error || 'query_failed', policy: evalResult };
  return { ok: true, rows: r.rows || [], policy: evalResult, statement_kind: classifyDatabaseSqlStatement(sql) };
}

/**
 * @param {string} migrationSql
 */
export function generateRollbackStub(migrationSql) {
  const lines = String(migrationSql || '')
    .split(';')
    .map((l) => l.trim())
    .filter(Boolean);
  const rollback = lines.map((line) => `-- rollback stub: review manually\n-- forward: ${line.slice(0, 120)}`);
  return `${rollback.join('\n')}\n-- TODO: author inverse DDL before apply`;
}

/**
 * @param {any} env
 * @param {{
 *   operation: string,
 *   authUser: unknown,
 *   tenant_id?: string,
 *   workspace_id?: string,
 *   schema?: string,
 *   table?: string,
 *   sql?: string,
 *   params?: unknown[],
 *   migration_sql?: string,
 *   approval_id?: string,
 *   agent_run_id?: string,
 * }} opts
 */
export async function dispatchDatabaseAssistant(env, opts) {
  const t0 = Date.now();
  const operation = String(opts.operation || '').trim();
  const ctx = resolveDbAssistantContext(opts.authUser, opts);
  const schema = String(opts.schema || AGENTSAM_SCHEMA).trim() || AGENTSAM_SCHEMA;
  const table = opts.table != null ? String(opts.table).trim() : '';

  const platformAccess = assertDataPlaneAccess(
    {
      is_owner: ctx.is_owner,
      is_superadmin: ctx.is_superadmin,
      user_id: ctx.user_id,
      tenant_id: ctx.tenant_id,
      workspace_id: ctx.workspace_id,
    },
    'platform_supabase_agentsam',
    operation,
    { sql: opts.sql, migration_sql: opts.migration_sql },
  );
  if (!platformAccess.allowed) {
    logDataPlaneSecurityEvent('access_denied', {
      surface: 'dispatchDatabaseAssistant',
      reason: platformAccess.reason,
      operation,
      user_id: ctx.user_id,
    });
    return {
      ok: false,
      operation,
      backend: 'hyperdrive',
      duration_ms: Date.now() - t0,
      error: platformAccess.error,
      reason: platformAccess.reason,
      user_message: platformAccess.user_message,
      degraded_reason: platformAccess.reason,
    };
  }

  if (!isSchemaAllowedForContext(schema, ctx)) {
    return {
      ok: false,
      operation,
      backend: 'hyperdrive',
      duration_ms: Date.now() - t0,
      error: 'schema_not_allowed',
      degraded_reason: 'schema_policy',
    };
  }

  /** @type {Record<string, () => Promise<Record<string, unknown>>>} */
  const handlers = {
    inspect_schema: async () => {
      const listed = await hyperdriveListTables(env, ctx.is_owner ? DEFAULT_LIST_SCHEMAS : [AGENTSAM_SCHEMA]);
      return { ...listed, schema: AGENTSAM_SCHEMA };
    },
    list_tables: async () => hyperdriveListTables(env, [schema]),
    describe_table: async () => {
      if (!table) throw new Error('table required');
      return hyperdriveDescribeTable(env, schema, table);
    },
    describe_columns: async () => {
      if (!table) throw new Error('table required');
      return hyperdriveDescribeTable(env, schema, table);
    },
    inspect_indexes: async () => {
      if (!table) throw new Error('table required');
      return hyperdriveInspectIndexes(env, schema, table);
    },
    inspect_rls: async () => {
      if (!table) throw new Error('table required');
      return hyperdriveInspectRls(env, schema, table);
    },
    inspect_functions: async () => {
      const sql = `SELECT routine_name, routine_type, data_type
         FROM information_schema.routines
        WHERE routine_schema = $1
        ORDER BY routine_name`;
      const r = await runHyperdriveQuery(env, sql, [schema]);
      return { ok: r.ok, routines: r.rows || [], error: r.error };
    },
    run_readonly_sql: async () => {
      const sql = String(opts.sql || '').trim();
      if (!sql) throw new Error('sql required');
      if (!isHyperdriveUsable(env)) return { ok: false, error: 'hyperdrive_unavailable' };
      return hyperdriveReadonlySql(env, sql, Array.isArray(opts.params) ? opts.params : [], ctx);
    },
    explain_query: async () => {
      const sql = String(opts.sql || '').trim();
      if (!sql) throw new Error('sql required');
      const explainSql = sql.match(/^\s*explain\b/i) ? sql : `EXPLAIN ${sql}`;
      return hyperdriveReadonlySql(env, explainSql, [], ctx);
    },
    propose_migration: async () => {
      const migrationSql = String(opts.migration_sql || opts.sql || '').trim();
      if (!migrationSql) throw new Error('migration_sql required');
      return {
        ok: true,
        migration_sql: migrationSql,
        rollback_sql: generateRollbackStub(migrationSql),
        requires_approval: true,
        approval_required: true,
        applied: false,
      };
    },
    validate_migration: async () => {
      const migrationSql = String(opts.migration_sql || opts.sql || '').trim();
      const op = classifyDatabaseOperation(migrationSql);
      return {
        ok: op !== 'blocked',
        operation_class: op,
        statement_kind: classifyDatabaseSqlStatement(migrationSql),
      };
    },
    generate_rollback: async () => {
      const migrationSql = String(opts.migration_sql || opts.sql || '').trim();
      return { ok: true, rollback_sql: generateRollbackStub(migrationSql) };
    },
    database_apply_approved_migration: async () => {
      const migrationSql = String(opts.migration_sql || opts.sql || '').trim();
      const approvalId = opts.approval_id != null ? String(opts.approval_id).trim() : '';
      const evalResult = evaluateDatabaseOperation(migrationSql, ctx, {
        explicitApprovalId: approvalId || null,
      });
      if (!evalResult.allowed) {
        return { ok: false, error: evalResult.reason, requires_approval: true };
      }
      if (!isHyperdriveUsable(env)) return { ok: false, error: 'hyperdrive_unavailable' };
      const r = await runHyperdriveQuery(env, migrationSql, []);
      return {
        ok: r.ok,
        rows: r.rows || [],
        error: r.error,
        approval_id: approvalId || null,
        applied: r.ok,
      };
    },
  };

  const handler = handlers[operation];
  if (!handler) {
    return {
      ok: false,
      operation,
      backend: 'hyperdrive',
      duration_ms: Date.now() - t0,
      error: `unknown_operation:${operation}`,
    };
  }

  if (!isHyperdriveUsable(env) && operation !== 'propose_migration' && operation !== 'validate_migration') {
    return {
      ok: false,
      operation,
      backend: 'hyperdrive',
      duration_ms: Date.now() - t0,
      error: 'hyperdrive_unavailable',
    };
  }

  try {
    const payload = await handler();
    return {
      ok: payload.ok !== false,
      operation,
      backend: operation.startsWith('d1') ? 'd1' : 'hyperdrive',
      schema,
      table: table || null,
      duration_ms: Date.now() - t0,
      read_only: ['run_readonly_sql', 'explain_query', 'inspect_schema', 'list_tables', 'describe_table'].includes(
        operation,
      ),
      approval_required: payload.requires_approval === true || payload.approval_required === true,
      ...payload,
    };
  } catch (e) {
    return {
      ok: false,
      operation,
      backend: 'hyperdrive',
      schema,
      duration_ms: Date.now() - t0,
      error: e?.message ? String(e.message) : String(e),
    };
  }
}
