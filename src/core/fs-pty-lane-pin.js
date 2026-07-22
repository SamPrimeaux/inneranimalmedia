/**
 * Pin the resolved PTY terminal_connections row for the duration of an agent turn.
 *
 * fs_write_file / fs_read_file previously each passed target_type:'auto', so
 * resolveMoviemodeRepoRootForSession + listOrderedAutoTerminalConnections could
 * pick Mac on write and GCP/sandbox on the next read — exit 0 on write, missing
 * bytes on read. Not a race: a lane-pinning gap.
 *
 * Contract: mutate the shared runContext object (same reference across tool calls
 * in catalog-tool-executor). First successful pty exec wins; later fs_* calls
 * force connection_id and skip auto re-resolution.
 */

/**
 * @param {Record<string, unknown>|null|undefined} runContext
 * @returns {{ connection_id: string, target_type?: string }|null}
 */
export function getPinnedPtyLane(runContext) {
  if (!runContext || typeof runContext !== 'object') return null;
  const id = String(
    runContext.pty_connection_id || runContext.pinned_pty_connection_id || '',
  ).trim();
  if (!id) return null;
  const tt = String(runContext.pty_target_type || runContext.pinned_pty_target_type || '').trim();
  return tt ? { connection_id: id, target_type: tt } : { connection_id: id };
}

/**
 * Stash the lane that actually executed (from runTerminalCommand result).
 * Idempotent — first pin wins for the turn.
 *
 * @param {Record<string, unknown>|null|undefined} runContext
 * @param {{ targetId?: string|null, connection_id?: string|null, lane_attempts?: Array<{ connection_id?: string|null, target_type?: string|null, ok?: boolean }> }|null|undefined} res
 */
export function pinPtyLaneFromExecResult(runContext, res) {
  if (!runContext || typeof runContext !== 'object' || !res) return;
  if (getPinnedPtyLane(runContext)) return;

  const id = String(res.targetId || res.connection_id || '').trim();
  if (!id) {
    // Fallback: first successful attempt in the auto chain
    const attempts = Array.isArray(res.lane_attempts) ? res.lane_attempts : [];
    const hit = attempts.find((a) => a?.ok && a?.connection_id);
    if (hit?.connection_id) {
      runContext.pty_connection_id = String(hit.connection_id).trim();
      if (hit.target_type) runContext.pty_target_type = String(hit.target_type).trim();
    }
    return;
  }

  runContext.pty_connection_id = id;
  const attempts = Array.isArray(res.lane_attempts) ? res.lane_attempts : [];
  const match =
    attempts.find((a) => a?.ok && String(a.connection_id || '').trim() === id) ||
    attempts.find((a) => a?.ok);
  if (match?.target_type) {
    runContext.pty_target_type = String(match.target_type).trim();
  }
}

/**
 * Build runTerminalCommand executionCtx for filesystem tools.
 * Uses pinned connection_id when present; otherwise target_type auto (first call).
 *
 * @param {Record<string, unknown>|null|undefined} runContext
 * @param {Record<string, unknown>} base
 */
export function ptyExecOptsForFs(runContext, base = {}) {
  const pin = getPinnedPtyLane(runContext);
  if (pin) {
    return {
      ...base,
      execution_mode: 'pty',
      connection_id: pin.connection_id,
      target_id: pin.connection_id,
      // Prefer explicit type when known; omit 'auto' so terminal.js stays on the pin.
      ...(pin.target_type ? { target_type: pin.target_type } : {}),
    };
  }
  return {
    ...base,
    execution_mode: 'pty',
    target_type: 'auto',
  };
}
