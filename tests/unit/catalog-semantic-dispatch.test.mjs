import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const catalogSrc = readFileSync(join(root, 'src/core/catalog-tool-executor.js'), 'utf8');
const migrationSrc = readFileSync(
  join(root, 'migrations/462_agentsam_semantic_database_tools.sql'),
  'utf8',
);

test('catalog-tool-executor wires semantic_retrieval and database_assistant', () => {
  assert.ok(catalogSrc.includes("dispatcher === 'semantic_retrieval'"));
  assert.ok(catalogSrc.includes("dispatcher === 'database_assistant'"));
  assert.ok(catalogSrc.includes('dispatchSemanticRetrieval'));
  assert.ok(catalogSrc.includes('dispatchDatabaseAssistant'));
  assert.ok(catalogSrc.includes("dispatcher === 'legacy_unified_rag'"));
});

test('D1 migration registers canonical semantic tools', () => {
  assert.ok(migrationSrc.includes('code_semantic_search'));
  assert.ok(migrationSrc.includes('schema_semantic_search'));
  assert.ok(migrationSrc.includes('database_assistant'));
  assert.ok(migrationSrc.includes('hyperdrive_readonly_query'));
  assert.ok(migrationSrc.includes('legacy_unified_rag'));
  assert.ok(migrationSrc.includes('is_degraded = 1'));
});
