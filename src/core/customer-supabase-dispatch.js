/**
 * Customer-owned Supabase projects — Management API + workspace bindings (never env.HYPERDRIVE IAM).
 */
import { getUserSupabaseToken } from '../api/oauth.js';
import {
  getDefaultWorkspaceDataBinding,
  upsertWorkspaceDataBinding,
  listWorkspaceDataBindings,
} from './workspace-data-bindings.js';
import { evaluateDataPlaneOperation } from './database-operation-policy.js';
import { logCustomerDataPlaneEvent } from './customer-data-plane-telemetry.js';
import { generateRollbackStub } from './database-assistant-dispatch.js';
import { classifyDatabaseSqlStatement } from './database-sql-safety.js';

/**
 * @param {string} accessToken
 */
async function managementFetch(accessToken, path, init = {}) {
  const res = await fetch(`https://api.supabase.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data?.message || data?.error || data?.error_description || `supabase_api_${res.status}`;
    throw new Error(String(msg));
  }
  return data;
}

/**
 * @param {any} env
 * @param {string} userId
 * @param {string|null} workspaceId
 */
export async function customerSupabaseListProjects(env, userId, workspaceId = null) {
  const tok = await getUserSupabaseToken(env, userId, workspaceId);
  if (!tok?.access_token) return { ok: false, projects: [], error: 'supabase_not_connected' };

  let projects = Array.isArray(tok.projects) ? tok.projects : [];
  if (!projects.length) {
    try {
      const res = await fetch('https://api.supabase.com/v1/projects', {
        headers: { Authorization: `Bearer ${tok.access_token}`, Accept: 'application/json' },
      });
      const data = await res.json().catch(() => []);
      if (Array.isArray(data)) {
        projects = data.map((p) => ({
          id: p.id,
          name: p.name,
          ref: p.ref,
          region: p.region,
        }));
      }
    } catch {
      /* keep empty */
    }
  }

  const bindings = workspaceId ? await listWorkspaceDataBindings(env, workspaceId, 'supabase') : [];
  return { ok: true, projects, bindings };
}

/**
 * @param {any} env
 * @param {{
 *   user_id: string,
 *   tenant_id: string,
 *   workspace_id: string,
 *   project_id: string,
 *   project_ref?: string|null,
 *   display_name?: string|null,
 * }} opts
 */
export async function customerSupabaseSelectProjectForWorkspace(env, opts) {
  const tok = await getUserSupabaseToken(env, opts.user_id, opts.workspace_id);
  if (!tok?.access_token) return { ok: false, error: 'supabase_not_connected' };

  const projectId = String(opts.project_id || '').trim();
  const project =
    (tok.projects || []).find((p) => String(p.id) === projectId || String(p.ref) === projectId) ||
    null;
  const ref = opts.project_ref || project?.ref || projectId;
  const id = `wsbind_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;

  await upsertWorkspaceDataBinding(env, {
    id,
    tenant_id: opts.tenant_id,
    user_id: opts.user_id,
    workspace_id: opts.workspace_id,
    provider: 'supabase',
    connection_id: 'supabase_oauth',
    external_project_id: project?.id != null ? String(project.id) : projectId,
    external_project_ref: ref != null ? String(ref) : null,
    display_name: opts.display_name || project?.name || ref,
    selected_as_default: true,
    capabilities_json: JSON.stringify({ readonly_sql: true, schema_inspect: true, migrations_propose: true }),
    health_status: 'selected',
    last_verified_at: Math.floor(Date.now() / 1000),
  });

  return { ok: true, binding_id: id, project_ref: ref, project_id: project?.id || projectId };
}

/**
 * @param {string} accessToken
 * @param {string} projectRef
 */
async function customerSupabaseRunQuery(accessToken, projectRef, sql) {
  const data = await managementFetch(accessToken, `/v1/projects/${encodeURIComponent(projectRef)}/database/query`, {
    method: 'POST',
    body: JSON.stringify({ query: String(sql || '') }),
  });
  if (Array.isArray(data)) return { ok: true, rows: data };
  if (Array.isArray(data?.result)) return { ok: true, rows: data.result };
  if (Array.isArray(data?.rows)) return { ok: true, rows: data.rows };
  return { ok: true, rows: [], raw: data };
}

/**
 * @param {any} env
 * @param {string} userId
 * @param {string} workspaceId
 */
async function resolveProjectRef(env, userId, workspaceId) {
  const binding = await getDefaultWorkspaceDataBinding(env, workspaceId, 'supabase');
  const tok = await getUserSupabaseToken(env, userId, workspaceId);
  if (!tok?.access_token) return { error: 'supabase_not_connected' };
  const ref =
    binding?.external_project_ref != null
      ? String(binding.external_project_ref)
      : tok.projects?.[0]?.ref != null
        ? String(tok.projects[0].ref)
        : null;
  if (!ref) return { error: 'no_supabase_project_selected' };
  return { access_token: tok.access_token, project_ref: ref, binding };
}

/**
 * @param {any} env
 * @param {{
 *   operation: string,
 *   user_id: string,
 *   tenant_id?: string|null,
 *   workspace_id: string,
 *   sql?: string,
 *   migration_sql?: string,
 *   approval_id?: string|null,
 *   schema?: string,
 *   table?: string,
 *   authUser?: unknown,
 *   agent_run_id?: string|null,
 * }} opts
 */
export async function dispatchCustomerSupabase(env, opts) {
  const t0 = Date.now();
  const operation = String(opts.operation || '').trim();
  const userId = String(opts.user_id || '');
  const workspaceId = String(opts.workspace_id || '');

  const resolved = await resolveProjectRef(env, userId, workspaceId);
  if (resolved.error) {
    const err =
      resolved.error === 'supabase_not_connected' || resolved.error === 'no_supabase_project_selected'
        ? 'customer_database_not_connected'
        : resolved.error;
    return {
      ok: false,
      operation,
      data_plane: 'customer_supabase',
      error: err,
      reason: err,
      user_message:
        'Connect your Supabase project in integrations and select a workspace default before running SQL.',
      onboarding_required: true,
      duration_ms: Date.now() - t0,
    };
  }

  const { access_token, project_ref, binding } = resolved;
  const connection_id = binding?.id != null ? String(binding.id) : 'supabase_oauth';

  /** @type {Record<string, () => Promise<Record<string, unknown>>>} */
  const handlers = {
    list_projects: async () => customerSupabaseListProjects(env, userId, workspaceId),
    select_project_for_workspace: async () =>
      customerSupabaseSelectProjectForWorkspace(env, {
        user_id: userId,
        tenant_id: String(opts.tenant_id || ''),
        workspace_id: workspaceId,
        project_id: String(opts.table || opts.project_id || ''),
        project_ref: opts.schema,
        display_name: opts.table,
      }),
    inspect_schema: async () => {
      const data = await managementFetch(
        access_token,
        `/v1/projects/${encodeURIComponent(project_ref)}/database/tables`,
      );
      const tables = Array.isArray(data) ? data : data?.tables || data?.data || [];
      return { ok: true, tables, project_ref };
    },
    list_tables: async () => handlers.inspect_schema(),
    describe_table: async () => {
      const table = String(opts.table || '').trim();
      if (!table) throw new Error('table required');
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) throw new Error('invalid table identifier');
      const sql = `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = '${table}'
        ORDER BY ordinal_position`;
      return customerSupabaseRunQuery(access_token, project_ref, sql);
    },
    run_readonly_sql: async () => {
      const sql = String(opts.sql || '').trim();
      const policy = evaluateDataPlaneOperation({
        owner_type: 'customer',
        operation_type: 'run_readonly_sql',
        sql,
        is_owner: false,
        provider: 'supabase',
        schema: opts.schema || 'public',
      });
      if (!policy.allowed) return { ok: false, error: policy.reason, policy };
      const stmtKind = classifyDatabaseSqlStatement(sql);
      if (stmtKind !== 'read' && stmtKind !== 'explain') {
        return {
          ok: false,
          error: 'readonly_operation_required',
          policy,
          user_message: 'This path only allows SELECT/EXPLAIN. Use a write operation for mutations.',
        };
      }
      return customerSupabaseRunQuery(access_token, project_ref, sql);
    },
    run_write_sql: async () => {
      const sql = String(opts.sql || '').trim();
      const policy = evaluateDataPlaneOperation({
        owner_type: 'customer',
        operation_type: 'execute_sql',
        sql,
        is_owner: false,
        provider: 'supabase',
        schema: opts.schema || 'public',
        explicit_approval_id: opts.approval_id,
      });
      if (!policy.allowed) return { ok: false, error: policy.reason, policy };
      const stmtKind = classifyDatabaseSqlStatement(sql);
      if (stmtKind === 'read' || stmtKind === 'explain') {
        return {
          ok: false,
          error: 'write_operation_required',
          user_message: 'supabase.write requires INSERT, UPDATE, DELETE, or DDL — not SELECT.',
        };
      }
      return customerSupabaseRunQuery(access_token, project_ref, sql);
    },
    execute_sql: async () => handlers.run_write_sql(),
    supabase_write: async () => handlers.run_write_sql(),
    customer_supabase_readonly_query: async () => handlers.run_readonly_sql(),
    propose_migration: async () => {
      const migrationSql = String(opts.migration_sql || opts.sql || '').trim();
      return {
        ok: true,
        migration_sql: migrationSql,
        rollback_sql: generateRollbackStub(migrationSql),
        requires_approval: true,
        applied: false,
        project_ref,
      };
    },
    validate_migration: async () => {
      const migrationSql = String(opts.migration_sql || opts.sql || '').trim();
      const kind = classifyDatabaseSqlStatement(migrationSql);
      return { ok: kind !== 'unknown', statement_kind: kind };
    },
    apply_approved_migration: async () => {
      const migrationSql = String(opts.migration_sql || opts.sql || '').trim();
      const approvalId = opts.approval_id != null ? String(opts.approval_id).trim() : '';
      const policy = evaluateDataPlaneOperation({
        owner_type: 'customer',
        operation_type: 'apply_migration',
        sql: migrationSql,
        explicit_approval_id: approvalId,
        provider: 'supabase',
      });
      if (!policy.allowed) return { ok: false, error: policy.reason, requires_approval: true, policy };
      const out = await customerSupabaseRunQuery(access_token, project_ref, migrationSql);
      return { ...out, applied: out.ok, approval_id: approvalId || null };
    },
    generate_rollback: async () => ({
      ok: true,
      rollback_sql: generateRollbackStub(String(opts.migration_sql || opts.sql || '')),
    }),
  };

  const handler = handlers[operation];
  if (!handler) {
    return {
      ok: false,
      operation,
      data_plane: 'customer_supabase',
      error: `unknown_operation:${operation}`,
    };
  }

  try {
    const payload = await handler();
    const ok = payload.ok !== false;
    await logCustomerDataPlaneEvent(env, {
      user_id: userId,
      tenant_id: opts.tenant_id,
      workspace_id: workspaceId,
      data_plane: 'customer_supabase',
      owner_type: 'customer',
      provider: 'supabase',
      connection_id,
      external_project_id: binding?.external_project_id,
      operation_type: operation,
      sql_class: opts.sql ? classifyDatabaseSqlStatement(String(opts.sql)) : null,
      approval_id: opts.approval_id,
      success: ok,
      error_message: ok ? null : payload.error,
      duration_ms: Date.now() - t0,
      sql: opts.sql || opts.migration_sql,
      agent_run_id: opts.agent_run_id,
    });
    return {
      ...payload,
      ok,
      operation,
      data_plane: 'customer_supabase',
      owner_type: 'customer',
      project_ref,
      connection_id,
      duration_ms: Date.now() - t0,
      read_only: ['run_readonly_sql', 'list_tables', 'inspect_schema', 'describe_table'].includes(operation),
      write_path: ['run_write_sql', 'execute_sql', 'supabase_write', 'apply_approved_migration'].includes(
        operation,
      ),
    };
  } catch (e) {
    await logCustomerDataPlaneEvent(env, {
      user_id: userId,
      tenant_id: opts.tenant_id,
      workspace_id: workspaceId,
      data_plane: 'customer_supabase',
      provider: 'supabase',
      connection_id,
      operation_type: operation,
      success: false,
      error_message: e?.message ? String(e.message) : String(e),
      duration_ms: Date.now() - t0,
      sql: opts.sql,
      agent_run_id: opts.agent_run_id,
    });
    return {
      ok: false,
      operation,
      data_plane: 'customer_supabase',
      error: e?.message ? String(e.message) : String(e),
      duration_ms: Date.now() - t0,
    };
  }
}
