import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertDatabaseReadQuery,
  classifyDatabaseSqlStatement,
} from '../../src/core/database-sql-safety.js';

test('assertDatabaseReadQuery allows trailing semicolon on single SELECT', () => {
  const r = assertDatabaseReadQuery('SELECT * FROM agentsam_tools;');
  assert.equal(r.ok, true);
  assert.equal(r.kind, 'read');
});

test('assertDatabaseReadQuery allows SELECT without semicolon', () => {
  const r = assertDatabaseReadQuery('SELECT 1');
  assert.equal(r.ok, true);
});

test('assertDatabaseReadQuery rejects true multi-statement batch', () => {
  const r = assertDatabaseReadQuery('SELECT 1; SELECT 2');
  assert.equal(r.ok, false);
  assert.match(String(r.error), /semicolon batching/i);
});

test('assertDatabaseReadQuery rejects SELECT then DROP', () => {
  const r = assertDatabaseReadQuery('SELECT 1; DROP TABLE t');
  assert.equal(r.ok, false);
});

test('classifyDatabaseSqlStatement still flags batched destructive SQL', () => {
  assert.equal(classifyDatabaseSqlStatement('SELECT 1; DROP TABLE t'), 'destructive');
});
