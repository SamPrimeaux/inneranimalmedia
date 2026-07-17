import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchDatabaseAssistant } from '../../src/core/database-assistant-dispatch.js';

function mockD1(approvalRow) {
  return {
    prepare(sql) {
      return {
        bind() {
          return {
            first: async () =>
              sql.includes('agentsam_approval_queue') ? approvalRow : null,
            run: async () => ({ success: true }),
            all: async () => ({ results: [] }),
          };
        },
        first: async () => null,
        run: async () => ({ success: true }),
        all: async () => ({ results: [] }),
      };
    },
  };
}

test('platform Supabase write verifies approval, transacts, and returns readback receipt', async () => {
  const sql = 'UPDATE public.example SET value = $1 WHERE id = $2 RETURNING id, value';
  const calls = [];
  const env = {
    DB: mockD1({
      id: 'prop_ok',
      status: 'approved',
      expires_at: Math.floor(Date.now() / 1000) + 300,
      user_id: 'u1',
      tenant_id: 'tenant_1',
      workspace_id: 'ws_1',
      tool_name: 'agentsam_supabase_write',
      input_json: JSON.stringify({
        filled_template: JSON.stringify({ sql, params: ['new', 7] }),
      }),
    }),
    HYPERDRIVE: {
      async query(statement, params = []) {
        calls.push({ statement, params });
        if (statement === sql) {
          return {
            rows: [{ id: 7, value: 'new' }],
            rowCount: 1,
            command: 'UPDATE',
          };
        }
        return { rows: [] };
      },
    },
  };

  const out = await dispatchDatabaseAssistant(env, {
    operation: 'run_write_sql',
    authUser: { id: 'u1', role: 'superadmin', is_superadmin: 1 },
    tenant_id: 'tenant_1',
    workspace_id: 'ws_1',
    resource_ref: 'platform_supabase',
    schema: 'public',
    sql,
    params: ['new', 7],
    approval_id: 'prop_ok',
  });

  assert.equal(out.ok, true);
  assert.equal(out.backend, 'supabase');
  assert.equal(out.transport, 'hyperdrive');
  assert.deepEqual(out.rows, [{ id: 7, value: 'new' }]);
  assert.equal(out.receipt.row_count, 1);
  assert.deepEqual(out.receipt.readback_rows, [{ id: 7, value: 'new' }]);
  assert.deepEqual(
    calls.map((call) => call.statement),
    ['BEGIN', sql, 'COMMIT'],
  );
});

test('platform Supabase write rejects an unresolved resource', async () => {
  const out = await dispatchDatabaseAssistant(
    {
      DB: mockD1(null),
      HYPERDRIVE: { query: async () => ({ rows: [] }) },
    },
    {
      operation: 'run_write_sql',
      authUser: { id: 'u1', role: 'superadmin', is_superadmin: 1 },
      workspace_id: 'ws_1',
      sql: 'UPDATE public.example SET value = 1 RETURNING *',
      approval_id: 'prop_ok',
    },
  );

  assert.equal(out.ok, false);
  assert.equal(out.error, 'explicit_platform_supabase_resource_required');
});

test('platform schema inspection is project-wide until a schema is selected', async () => {
  const calls = [];
  const out = await dispatchDatabaseAssistant(
    {
      DB: mockD1(null),
      HYPERDRIVE: {
        async query(statement, params = []) {
          calls.push({ statement, params });
          return {
            rows: [
              { table_schema: 'agentsam', table_name: 'a', table_type: 'BASE TABLE' },
              { table_schema: 'public', table_name: 'b', table_type: 'BASE TABLE' },
              { table_schema: 'auth', table_name: 'users', table_type: 'BASE TABLE' },
            ],
          };
        },
      },
    },
    {
      operation: 'inspect_schema',
      authUser: { id: 'u1', role: 'superadmin', is_superadmin: 1 },
      workspace_id: 'ws_1',
      resource_ref: 'platform_supabase',
    },
  );

  assert.equal(out.ok, true);
  assert.equal(out.project_wide, true);
  assert.equal(out.schema, null);
  assert.equal(out.tables.length, 3);
  assert.match(calls[0].statement, /table_schema NOT IN/);
  assert.deepEqual(calls[0].params, ['pg_catalog', 'information_schema']);
});

test('platform Supabase read preserves Hyperdrive parameters', async () => {
  const calls = [];
  const sql = 'SELECT table_name FROM information_schema.tables WHERE table_schema = $1';
  const out = await dispatchDatabaseAssistant(
    {
      DB: mockD1(null),
      HYPERDRIVE: {
        async query(statement, params = []) {
          calls.push({ statement, params });
          return { rows: [{ table_name: 'agentsam_memory' }] };
        },
      },
    },
    {
      operation: 'run_readonly_sql',
      authUser: { id: 'u1', role: 'superadmin', is_superadmin: 1 },
      workspace_id: 'ws_1',
      resource_ref: 'platform_supabase',
      schema: 'information_schema',
      sql,
      params: ['agentsam'],
    },
  );

  assert.equal(out.ok, true);
  assert.deepEqual(calls, [{ statement: sql, params: ['agentsam'] }]);
});
