/**
 * Map agentsam_error_log + optional superadmin telemetry into terminal Problems panel rows.
 * Never includes secret values — error_message only (operational errors).
 */

/** Dedupe window for incident rows sharing the same message. */
export const PROBLEM_DEDUPE_WINDOW_SEC = 5;

/** Hidden from terminal Problems panel; still returned in raw error_log for Overview/Analytics. */
const TERMINAL_PANEL_HIDDEN_ERROR_TYPES = new Set(['db_write_failure']);

/** Prefer this source when multiple rows share the same incident key. */
const CANONICAL_ERROR_SOURCE_PRIORITY = [
  'tool_chain',
  'terminal_assist',
  'agent_run',
  'agentsam_mcp_tool_execution',
  'tool_call_log',
];

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

/** @param {number | string | null | undefined} ts */
function problemUnixSec(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n)) return 0;
  return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
}

/** @param {string} msg */
function normalizeProblemMessage(msg) {
  return String(msg || '')
    .trim()
    .slice(0, 500)
    .toLowerCase();
}

/**
 * @param {string} source
 */
function sourcePriority(source) {
  const s = String(source || '').trim();
  const idx = CANONICAL_ERROR_SOURCE_PRIORITY.indexOf(s);
  return idx >= 0 ? idx : CANONICAL_ERROR_SOURCE_PRIORITY.length;
}

/**
 * One row per incident (same message within PROBLEM_DEDUPE_WINDOW_SEC); prefers tool_chain.
 * @param {Record<string, unknown>[]} rows
 */
export function dedupeErrorLogRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];
  const sorted = [...rows].sort((a, b) => problemUnixSec(b.created_at) - problemUnixSec(a.created_at));
  const kept = [];
  const buckets = [];

  for (const row of sorted) {
    const msg = normalizeProblemMessage(row.error_message);
    const ts = problemUnixSec(row.created_at);
    let merged = false;
    for (const bucket of buckets) {
      if (bucket.msg !== msg) continue;
      if (Math.abs(bucket.ts - ts) > PROBLEM_DEDUPE_WINDOW_SEC) continue;
      if (sourcePriority(row.source) < sourcePriority(bucket.row.source)) {
        bucket.row = row;
        bucket.ts = ts;
      }
      merged = true;
      break;
    }
    if (!merged) {
      buckets.push({ msg, ts, row });
    }
  }

  for (const bucket of buckets) {
    kept.push(bucket.row);
  }
  kept.sort((a, b) => problemUnixSec(b.created_at) - problemUnixSec(a.created_at));
  return kept;
}

/**
 * Drop MCP execution rows already mirrored into agentsam_error_log.
 * @param {Record<string, unknown>[]} errorLogRows
 * @param {Record<string, unknown>[]} mcpRows
 */
export function filterMcpToolErrorsNotMirrored(errorLogRows, mcpRows) {
  if (!Array.isArray(mcpRows) || !mcpRows.length) return [];
  const log = Array.isArray(errorLogRows) ? errorLogRows : [];
  const mirroredExecIds = new Set(
    log
      .filter((r) => String(r.source || '') === 'agentsam_mcp_tool_execution' && r.source_id != null)
      .map((r) => String(r.source_id)),
  );
  const mirroredKeys = new Set(
    log
      .filter((r) => String(r.source || '') === 'agentsam_mcp_tool_execution')
      .map((r) => `${normalizeProblemMessage(r.error_message)}:${problemUnixSec(r.created_at)}`),
  );

  return mcpRows.filter((row) => {
    const id = row.id != null ? String(row.id) : '';
    if (id && mirroredExecIds.has(id)) return false;
    const key = `${normalizeProblemMessage(row.error_message || row.status)}:${problemUnixSec(row.created_at)}`;
    if (mirroredKeys.has(key)) return false;
    return true;
  });
}

/**
 * @param {Record<string, unknown>[]} errorLogRows
 * @param {{ surface?: 'terminal' | 'overview' }} [opts]
 */
export function filterErrorLogForProblemsSurface(errorLogRows, opts = {}) {
  if (!Array.isArray(errorLogRows)) return [];
  const surface = opts.surface === 'overview' ? 'overview' : 'terminal';
  let rows = errorLogRows;
  if (surface === 'terminal') {
    rows = rows.filter((row) => !TERMINAL_PANEL_HIDDEN_ERROR_TYPES.has(String(row.error_type || '').trim()));
  }
  return dedupeErrorLogRows(rows);
}

/**
 * @param {Record<string, unknown>[]} errorLogRows
 * @returns {{ file: string, line: number, msg: string, severity: 'error' | 'warning', ts?: string, id?: string }[]}
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
 * @param {{ surface?: 'terminal' | 'overview' }} [opts]
 */
export function buildUnifiedProblems(payload, opts = {}) {
  const surface = opts.surface === 'overview' ? 'overview' : 'terminal';
  const errorRows = filterErrorLogForProblemsSurface(payload.error_log || [], { surface });
  const out = mapErrorLogToProblems(errorRows);

  const mcpRows =
    surface === 'terminal'
      ? filterMcpToolErrorsNotMirrored(payload.error_log || [], payload.mcp_tool_errors || [])
      : payload.mcp_tool_errors || [];

  for (const row of mcpRows) {
    out.push({
      file: `mcp · ${String(row.tool_name || 'tool')}`,
      line: 0,
      msg: String(row.error_message || row.status || 'MCP tool error').slice(0, 500),
      severity: 'error',
      ts: formatProblemTimestamp(row.created_at),
      id: row.id != null ? String(row.id) : undefined,
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
