import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDatabaseContextForAgent } from '../../src/core/database-studio-context.js';

test('database context identifies the open source without dumping a table catalog', () => {
  const block = formatDatabaseContextForAgent({
    route: '/dashboard/database',
    surface: 'database',
    view: 'studio',
    studioSection: 'platform_hyperdrive',
    provider: 'supabase',
    resourceRef: 'platform_hyperdrive',
    datasource: 'hyperdrive',
    dialect: 'postgresql',
    activeSchema: 'agentsam',
    activeMainTab: 'sql',
    selectedTable: null,
    capabilities: { canRead: true, canWrite: true, isSuperadmin: true },
  });

  assert.match(block, /studio_section: platform_hyperdrive/);
  assert.match(block, /provider: supabase/);
  assert.match(block, /active_schema: agentsam/);
  assert.doesNotMatch(block, /columns:/);
  assert.doesNotMatch(block, /tables:/);
});
