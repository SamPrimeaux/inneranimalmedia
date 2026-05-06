/**
 * Shared D1 read-query gate: SELECT / single-statement WITH … SELECT only.
 */

export function stripSqlComments(sql) {
  return String(sql || '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '')
    .trim();
}

const MUTATING_RE = /\b(INSERT|UPDATE|DELETE|REPLACE|INTO\s|DROP\s|ALTER\s|CREATE\s|TRUNCATE|ATTACH|DETACH|VACUUM|PRAGMA\s+\w+\s*=\s*|PRAGMA\s+\w+\()\b/i;

/**
 * @param {string} sqlString
 * @returns {{ ok: boolean, error?: string }}
 */
export function assertD1ReadOnlySelect(sqlString) {
  const raw = String(sqlString || '').trim();
  if (!raw) return { ok: false, error: 'd1_query: sql required' };

  const cleaned = stripSqlComments(raw);
  const normalized = cleaned.toUpperCase();

  if (normalized.includes(';')) {
    return { ok: false, error: 'Only a single read-only statement is allowed (no semicolon batching).' };
  }

  if (MUTATING_RE.test(cleaned)) {
    return {
      ok: false,
      error:
        'Only read-only SELECT / WITH queries are allowed via d1_query. Use the approval-gated d1_write path for mutations.',
    };
  }

  if (normalized.startsWith('SELECT') || normalized.startsWith('WITH')) {
    return { ok: true };
  }

  return {
    ok: false,
    error:
      'Only SELECT or WITH (read-only) queries are allowed via d1_query. Use the approval-gated d1_write path for mutations.',
  };
}
