#!/usr/bin/env node
import {
  buildD1FilterWhere,
  buildPostgresFilterWhere,
  normalizeDatabaseFilterUiOp,
} from '../src/core/database-table-filters.js';

let failed = 0;

if (normalizeDatabaseFilterUiOp('eq') !== 'equals') {
  console.error('FAIL legacy eq map');
  failed += 1;
}

const d1 = buildD1FilterWhere(
  [{ col: 'name', op: 'contains', val: 'sam' }],
  { quoteIdent: (n) => `"${n}"`, allowColumns: new Set(['name', 'id']) },
);
if (!d1.where.includes('LIKE') || d1.values[0] !== '%sam%') {
  console.error('FAIL d1 contains', d1);
  failed += 1;
}

try {
  buildD1FilterWhere([{ col: 'evil;drop', op: 'equals', val: 1 }], {
    quoteIdent: (n) => `"${n}"`,
    allowColumns: new Set(['id']),
  });
  console.error('FAIL d1 should reject bad column');
  failed += 1;
} catch {
  /* expected */
}

const pg = buildPostgresFilterWhere(
  [
    { col: 'id', op: 'greater_than', val: 10 },
    { col: 'status', op: 'is_null' },
  ],
  { quoteIdent: (n) => `"${n}"`, allowColumns: new Set(['id', 'status']) },
);
if (!pg.where.includes('> $1') || !pg.where.includes('IS NULL') || pg.values.length !== 1) {
  console.error('FAIL postgres filter', pg);
  failed += 1;
}

if (failed) {
  console.error(`${failed} filter check(s) failed`);
  process.exit(1);
}
console.log('OK — database table filter mapping passed');
