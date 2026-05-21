#!/usr/bin/env node
/**
 * Smoke checks for src/core/database-sql-safety.js (canonical classifier).
 * Run: node scripts/database-sql-safety-smoke.mjs
 */
import {
  classifyDatabaseSqlStatement,
  evaluateDatabaseSqlSafety,
  getDatabaseSqlRunGate,
  requiresConfirmTypingForSql,
  requiresDestructiveSqlModal,
} from '../src/core/database-sql-safety.js';

const cases = [
  ['SELECT * FROM x', 'read'],
  ['EXPLAIN SELECT * FROM x', 'explain'],
  ['WITH q AS (SELECT 1) SELECT * FROM q', 'read'],
  ['INSERT INTO x (a) VALUES (1)', 'mutation'],
  ['UPDATE x SET a = 1', 'destructive'],
  ['UPDATE x SET a = 1 WHERE id = ?', 'mutation'],
  ['DELETE FROM x', 'destructive'],
  ['DELETE FROM x WHERE id = ?', 'mutation'],
  ['DROP TABLE x', 'destructive'],
  ['ALTER TABLE x ADD COLUMN c TEXT', 'schema'],
  ['PRAGMA table_info(x)', 'read'],
  ['SELECT 1; DROP TABLE t', 'destructive'],
  ['', 'unknown'],
];

let failed = 0;
for (const [sql, expected] of cases) {
  const kind = classifyDatabaseSqlStatement(sql);
  if (kind !== expected) {
    console.error(`FAIL classify: ${JSON.stringify(sql)} => ${kind}, expected ${expected}`);
    failed += 1;
  }
}

const superGate = getDatabaseSqlRunGate('DELETE FROM t', {
  isSuperadmin: true,
  studioApproved: true,
  destructiveConfirmed: false,
});
if (superGate.canExecute) {
  console.error('FAIL gate: destructive without confirm should block');
  failed += 1;
}

const confirmed = getDatabaseSqlRunGate('DELETE FROM t', {
  isSuperadmin: true,
  destructiveConfirmed: true,
});
if (!confirmed.canExecute) {
  console.error('FAIL gate: destructive with confirm should allow');
  failed += 1;
}

const insertGate = getDatabaseSqlRunGate('INSERT INTO t (a) VALUES (1)', {
  isSuperadmin: true,
  studioApproved: false,
});
if (insertGate.canExecute) {
  console.error('FAIL gate: mutation without studio approval should block');
  failed += 1;
}

const readGate = getDatabaseSqlRunGate('SELECT 1', { isSuperadmin: false });
if (!readGate.canExecute) {
  console.error('FAIL gate: read should always execute');
  failed += 1;
}

if (!requiresDestructiveSqlModal('ALTER TABLE x ADD c INT')) {
  console.error('FAIL modal: ALTER should require modal');
  failed += 1;
}

if (requiresConfirmTypingForSql('ALTER TABLE x ADD c INT')) {
  console.error('FAIL typing: ALTER should not require CONFIRM typing');
  failed += 1;
}

if (!requiresConfirmTypingForSql('DROP TABLE x')) {
  console.error('FAIL typing: DROP should require CONFIRM typing');
  failed += 1;
}

const ro = evaluateDatabaseSqlSafety('INSERT INTO x VALUES (1)', { isSuperadmin: false });
if (ro.allowed) {
  console.error('FAIL safety: non-superadmin insert should block');
  failed += 1;
}

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log(`OK — ${cases.length} classify cases + run gate checks passed`);
