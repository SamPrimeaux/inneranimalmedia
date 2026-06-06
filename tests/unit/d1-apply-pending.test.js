import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isTrackedMigrationFilename,
  migrationSortKey,
  sortMigrationFilenames,
  parseMigrationNumericPrefix,
  isDestructiveMigration,
  diffPending,
  parseAddColumnStatements,
  isDuplicateColumnError,
} from '../../scripts/lib/d1-migration-ledger.mjs';

test('parseMigrationNumericPrefix extracts leading number', () => {
  assert.equal(parseMigrationNumericPrefix('519_mcp_terminal_routing_contract.sql'), 519);
  assert.equal(parseMigrationNumericPrefix('20260519_plan_tasks_add_running_status.sql'), 20260519);
  assert.equal(parseMigrationNumericPrefix('agentsam_schema_unify.sql'), null);
});

test('isTrackedMigrationFilename excludes WIP and denylist', () => {
  assert.equal(isTrackedMigrationFilename('518_terminal_local_path_cwd_contract.sql'), true);
  assert.equal(isTrackedMigrationFilename('_wip_generated.sql'), false);
  assert.equal(isTrackedMigrationFilename('agentsam_schema_unify.sql'), false);
});

test('sortMigrationFilenames orders by numeric prefix then name', () => {
  const sorted = sortMigrationFilenames([
    '519_mcp_terminal_routing_contract.sql',
    '518_oauth_allowlist_catalog_alignment.sql',
    '518_terminal_local_path_cwd_contract.sql',
    '520_ws_inneranimalmedia_github_repo_ssot.sql',
  ]);
  assert.deepEqual(sorted.slice(0, 3), [
    '518_oauth_allowlist_catalog_alignment.sql',
    '518_terminal_local_path_cwd_contract.sql',
    '519_mcp_terminal_routing_contract.sql',
  ]);
});

test('migrationSortKey puts non-numeric last', () => {
  assert.ok(migrationSortKey('100_a.sql')[0] < migrationSortKey('agentsam_schema_unify.sql')[0]);
});

test('diffPending returns disk files missing from applied set', () => {
  const applied = new Set(['518_oauth_allowlist_catalog_alignment.sql']);
  const pending = diffPending(
    ['518_oauth_allowlist_catalog_alignment.sql', '519_mcp_terminal_routing_contract.sql'],
    applied,
  );
  assert.deepEqual(pending, ['519_mcp_terminal_routing_contract.sql']);
});

test('isDestructiveMigration flags DROP TABLE', () => {
  assert.equal(isDestructiveMigration('UPDATE agentsam_tools SET x=1;'), false);
  assert.equal(isDestructiveMigration('DROP TABLE foo;'), true);
});

test('parseAddColumnStatements extracts table and column', () => {
  const sql = `-- comment
ALTER TABLE vectorize_sync_log ADD COLUMN details_json TEXT;
ALTER TABLE agentsam_tools ADD COLUMN oauth_visible INTEGER;`;
  assert.deepEqual(parseAddColumnStatements(sql), [
    { table: 'vectorize_sync_log', column: 'details_json' },
    { table: 'agentsam_tools', column: 'oauth_visible' },
  ]);
});

test('isDuplicateColumnError detects SQLite duplicate column failures', () => {
  assert.equal(
    isDuplicateColumnError(new Error('duplicate column name: details_json: SQLITE_ERROR')),
    true,
  );
  assert.equal(isDuplicateColumnError(new Error('no such table: foo')), false);
});
