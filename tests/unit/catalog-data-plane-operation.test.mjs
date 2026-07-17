import test from 'node:test';
import assert from 'node:assert/strict';
import {
  catalogOperationIsSemanticSearch,
  catalogOperationRequiresSql,
  resolveCatalogDataPlaneOperation,
  resolveCatalogDataPlaneProvider,
  resolveCatalogSqlDispatchFields,
  resolveCatalogSupabaseDataPlane,
} from '../../src/core/catalog-data-plane-operation.js';

test('resolveCatalogDataPlaneOperation maps supabase.query and supabase.write', () => {
  assert.equal(
    resolveCatalogDataPlaneOperation({ operation: 'supabase.query' }, 'agentsam_supabase_query'),
    'run_readonly_sql',
  );
  assert.equal(
    resolveCatalogDataPlaneOperation({ operation: 'supabase.write' }, 'agentsam_supabase_write'),
    'run_write_sql',
  );
});

test('resolveCatalogDataPlaneProvider maps data_plane user to supabase', () => {
  assert.equal(
    resolveCatalogDataPlaneProvider({ provider: 'supabase', data_plane: 'user' }),
    'supabase',
  );
  assert.equal(resolveCatalogDataPlaneProvider({ data_plane: 'user' }), 'supabase');
});

test('resolveCatalogSupabaseDataPlane treats Hyperdrive as platform transport, not a plane', () => {
  assert.equal(
    resolveCatalogSupabaseDataPlane(
      'agentsam_supabase_query',
      { data_plane: 'platform', binding: 'HYPERDRIVE' },
      null,
    ),
    'platform_supabase_agentsam',
  );
  assert.equal(
    resolveCatalogSupabaseDataPlane('agentsam_supabase_query', { data_plane: 'platform' }, 'project-ref'),
    'customer_supabase',
  );
  assert.equal(resolveCatalogSupabaseDataPlane('unknown', {}, null), null);
});

test('resolveCatalogSqlDispatchFields forwards schema, table, and bound params', () => {
  assert.deepEqual(
    resolveCatalogSqlDispatchFields({
      schema: ' agentsam ',
      table: ' agentsam_memory ',
      params: ['memory-id', 5],
    }),
    {
      schema: 'agentsam',
      table: 'agentsam_memory',
      params: ['memory-id', 5],
    },
  );
});

test('catalogOperationRequiresSql vs semantic search', () => {
  assert.equal(catalogOperationRequiresSql('run_readonly_sql'), true);
  assert.equal(catalogOperationRequiresSql('run_write_sql'), true);
  assert.equal(catalogOperationIsSemanticSearch('vector_search'), true);
  assert.equal(catalogOperationIsSemanticSearch('run_write_sql'), false);
});
