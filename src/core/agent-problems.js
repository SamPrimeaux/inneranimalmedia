/**
 * Map agentsam_error_log + optional superadmin telemetry into terminal Problems panel rows.
 * Never includes secret values — error_message only (operational errors).
 */

/** @param {number | string | null | undefined} ts */
export function formatProblemTimestamp(ts) {
  if (ts == null || ts === '') return '';
  const n = Number(ts);
  if (Number.isFinite(n) && n > 1e9 && n < 1e12) {
    try {
      return new Date(n * 1000).toISOString().slice(0, 19).replace('T', ' ');
    } catch {
      return String(ts);
    }
  }
  return String(ts);
}

/**
 * @param {Record<string, unknown>[]} errorLogRows
 * @returns {{ file: string, line: number, msg: string, severity: 'error' | 'warning', ts?: string }[]}
 */
export function mapErrorLogToProblems(errorLogRows) {
  if (!Array.isArray(errorLogRows)) return [];
  return errorLogRows.map((row) => {
    const severityRaw = String(row.error_type || row.severity || 'error').toLowerCase();
    const severity = severityRaw.includes('warn') ? 'warning' : 'error';
    const source = String(row.source || 'agentsam_error_log');
    const code = row.error_code != null ? String(row.error_code) : '';
    const ts = formatProblemTimestamp(row.created_at);
    return {
      file: code ? `${source} · ${code}` : source,
      line: 0,
      msg: String(row.error_message || 'Unknown error').slice(0, 500),
      severity,
      ts,
      id: row.id != null ? String(row.id) : undefined,
    };
  });
}

/**
 * @param {{
 *   error_log?: Record<string, unknown>[],
 *   mcp_tool_errors?: Record<string, unknown>[],
 *   audit_failures?: Record<string, unknown>[],
 *   worker_errors?: Record<string, unknown>[],
 * }} payload
 */
export function buildUnifiedProblems(payload) {
  const out = mapErrorLogToProblems(payload.error_log || []);
  for (const row of payload.mcp_tool_errors || []) {
    out.push({
      file: `mcp · ${String(row.tool_name || 'tool')}`,
      line: 0,
      msg: String(row.error_message || row.status || 'MCP tool error').slice(0, 500),
      severity: 'error',
      ts: formatProblemTimestamp(row.created_at),
    });
  }
  for (const row of payload.audit_failures || []) {
    const et = String(row.event_type || 'audit');
    out.push({
      file: `audit · ${et}`,
      line: 0,
      msg: String(row.message || et).slice(0, 500),
      severity: et.toLowerCase().includes('warn') ? 'warning' : 'error',
      ts: formatProblemTimestamp(row.created_at),
    });
  }
  for (const row of payload.worker_errors || []) {
    out.push({
      file: `worker · ${String(row.path || '/')}`,
      line: Number(row.status_code) || 0,
      msg: String(row.error_message || 'Worker error').slice(0, 500),
      severity: 'error',
      ts: formatProblemTimestamp(row.created_at),
    });
  }
  return out;
}
