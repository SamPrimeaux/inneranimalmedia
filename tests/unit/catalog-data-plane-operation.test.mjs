import test from 'node:test';
import assert from 'node:assert/strict';
import {
  catalogOperationIsSemanticSearch,
  catalogOperationRequiresSql,
  resolveCatalogDataPlaneOperation,
  resolveCatalogDataPlaneProvider,
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

test('catalogOperationRequiresSql vs semantic search', () => {
  assert.equal(catalogOperationRequiresSql('run_readonly_sql'), true);
  assert.equal(catalogOperationRequiresSql('run_write_sql'), true);
  assert.equal(catalogOperationIsSemanticSearch('vector_search'), true);
  assert.equal(catalogOperationIsSemanticSearch('run_write_sql'), false);
});
