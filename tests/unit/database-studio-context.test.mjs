import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDatabaseContextForAgent } from '../../src/core/database-studio-context.js';

test('database context identifies the open source without dumping a table catalog', () => {
  const block = formatDatabaseContextForAgent({
    route: '/dashboard/database',
    surface: 'database',
    view: 'studio',
    provider: 'supabase',
    resourceScope: 'platform',
    resourceRef: 'platform_supabase',
    datasource: 'supabase',
    dialect: 'postgresql',
    activeSchema: null,
    activeMainTab: 'sql',
    selectedTable: null,
    capabilities: { canRead: true, canWrite: true, isSuperadmin: true },
  });

  assert.match(block, /provider: supabase/);
  assert.match(block, /resource_scope: platform/);
  assert.match(block, /resource_ref: platform_supabase/);
  assert.match(block, /active_schema: \(none\)/);
  assert.doesNotMatch(block, /columns:/);
  assert.doesNotMatch(block, /tables:/);
});

test('database context blocks execution when no resource is selected', () => {
  const block = formatDatabaseContextForAgent({
    route: '/dashboard/database',
    surface: 'database',
    provider: 'supabase',
    resourceScope: 'connected',
    resourceRef: null,
    datasource: 'supabase',
  });

  assert.match(block, /resource_ref: \(unresolved\)/);
  assert.match(block, /execution_blocked:/);
});
