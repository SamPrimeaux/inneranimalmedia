/**
 * D1 ops-trail time SSOT.
 *
 * LAW (rule_ops_trail_timestamp):
 * - Window filters MUST use an epoch-seconds INTEGER column.
 * - Prefer `created_at_unix` / `checked_at_unix` when present.
 * - On epoch-native tables where `created_at` is INTEGER, it is already unix —
 *   dual-write `created_at_unix = created_at` so COALESCE always works.
 * - NEVER filter TEXT ISO `created_at` / `checked_at` with unixepoch()-N
 *   (SQLite coerces silently and returns garbage “matches”).
 */

/** SQL fragment: epoch seconds for a row that may have dual columns. */
export const SQL_TS_UNIX = `COALESCE(created_at_unix, CASE WHEN typeof(created_at) = 'integer' THEN created_at END)`;

/** SQL fragment for deployment_health. */
export const SQL_CHECKED_UNIX = `COALESCE(checked_at_unix, last_checked_at, CASE WHEN typeof(checked_at) = 'integer' THEN checked_at END)`;

/**
 * @param {number} [nowMs]
 * @returns {number} unix seconds
 */
export function epochSecondsNow(nowMs = Date.now()) {
  return Math.floor(Number(nowMs) / 1000);
}

/**
 * Dual-write fields for inserts into tables that have both created_at (epoch int)
 * and created_at_unix.
 * @param {number} [nowSec]
 */
export function dualCreatedAtFields(nowSec = epochSecondsNow()) {
  const sec = Math.floor(Number(nowSec) || epochSecondsNow());
  return { created_at: sec, created_at_unix: sec };
}

/**
 * Dual-write for deployment_health check timestamps.
 * @param {number} [nowSec]
 * @param {string} [iso]
 */
export function dualCheckedAtFields(nowSec = epochSecondsNow(), iso = new Date().toISOString()) {
  const sec = Math.floor(Number(nowSec) || epochSecondsNow());
  return {
    checked_at: iso,
    checked_at_unix: sec,
    last_checked_at: sec,
  };
}

/**
 * Safe 24h lower bound for SQL binds.
 * @param {number} [nowSec]
 */
export function unixDayAgo(nowSec = epochSecondsNow()) {
  return Math.floor(Number(nowSec) || epochSecondsNow()) - 86400;
}
