/**
 * Shared D1 read-query gate — delegates to database-sql-safety.js
 */
import { assertDatabaseReadQuery, stripSqlComments } from './database-sql-safety.js';

export { stripSqlComments };

/**
 * @param {string} sqlString
 * @returns {{ ok: boolean, error?: string }}
 */
export function assertD1ReadOnlySelect(sqlString) {
  const gate = assertDatabaseReadQuery(sqlString);
  if (gate.ok) return { ok: true };
  return { ok: false, error: gate.error || 'policy_block' };
}
