/**
 * Pin the resolved PTY terminal_connections row for one agent run.
 *
 * Why not mutate runContext alone:
 * agent-tool-loop builds a fresh `{ sessionId, tenantId, ... }` object per
 * dispatchToolCallWithBudget call. Mutating that object dies when the call returns.
 *
 * Persistence (in order):
 * 1. Shared bag: runContext.ptyLanePin — same object ref passed every dispatch in a turn
 * 2. D1 agentsam_pty_lane_pin keyed by agent_run_id — survives rebuild / fallback paths
 */

/**
 * @param {Record<string, unknown>|null|undefined} runContext
 */
export function pinScopeKey(runContext) {
  if (!runContext || typeof runContext !== 'object') return '';
  return (
    String(runContext.agent_run_id || runContext.agentRunId || '').trim() ||
    String(runContext.sessionId || runContext.session_id || runContext.conversation_id || '').trim()
  );
}

/**
 * Shared mutable bag (same reference across tool calls in one turn).
 * @param {Record<string, unknown>|null|undefined} runContext
 * @returns {Record<string, unknown>|null}
 */
function pinBag(runContext) {
  if (!runContext || typeof runContext !== 'object') return null;
  const bag = runContext.ptyLanePin;
  if (bag && typeof bag === 'object') return bag;
  return null;
}

/**
 * Sync read from shared bag only (no D1).
 * @param {Record<string, unknown>|null|undefined} runContext
 * @returns {{ connection_id: string, target_type?: string }|null}
 */
export function getPinnedPtyLane(runContext) {
  const bag = pinBag(runContext);
  if (bag) {
    const id = String(bag.connection_id || bag.pty_connection_id || '').trim();
    if (!id) return null;
    const tt = String(bag.target_type || bag.pty_target_type || '').trim();
    return tt ? { connection_id: id, target_type: tt } : { connection_id: id };
  }
  // Legacy: properties on runContext itself (only works if caller reuses the object)
  if (!runContext || typeof runContext !== 'object') return null;
  const id = String(
    runContext.pty_connection_id || runContext.pinned_pty_connection_id || '',
  ).trim();
  if (!id) return null;
  const tt = String(runContext.pty_target_type || runContext.pinned_pty_target_type || '').trim();
  return tt ? { connection_id: id, target_type: tt } : { connection_id: id };
}

/**
 * Load pin from bag, else D1 agentsam_pty_lane_pin.
 * @param {any} env
 * @param {Record<string, unknown>|null|undefined} runContext
 */
export async function resolvePinnedPtyLane(env, runContext) {
  const local = getPinnedPtyLane(runContext);
  if (local) return local;

  const scope = pinScopeKey(runContext);
  if (!scope || !env?.DB) return null;

  try {
    const row = await env.DB.prepare(
      `SELECT connection_id, target_type
         FROM agentsam_pty_lane_pin
        WHERE agent_run_id = ?
        LIMIT 1`,
    )
      .bind(scope)
      .first();
    const id = String(row?.connection_id || '').trim();
    if (!id) return null;
    const tt = String(row?.target_type || '').trim();
    const pin = tt ? { connection_id: id, target_type: tt } : { connection_id: id };
    // Hydrate bag for subsequent calls in this isolate
    const bag = pinBag(runContext);
    if (bag) {
      bag.connection_id = pin.connection_id;
      if (pin.target_type) bag.target_type = pin.target_type;
    }
    return pin;
  } catch (e) {
    console.warn('[pty-lane-pin] resolve_failed', e?.message || e);
    return null;
  }
}

/**
 * @param {any} env
 * @param {Record<string, unknown>|null|undefined} runContext
 * @param {{ targetId?: string|null, connection_id?: string|null, lane_attempts?: Array<{ connection_id?: string|null, target_type?: string|null, ok?: boolean }> }|null|undefined} res
 */
export async function pinPtyLaneFromExecResult(env, runContext, res) {
  if (!runContext || typeof runContext !== 'object' || !res) return;

  const existing = await resolvePinnedPtyLane(env, runContext);
  if (existing) return;

  let id = String(res.targetId || res.connection_id || '').trim();
  let tt = '';
  const attempts = Array.isArray(res.lane_attempts) ? res.lane_attempts : [];
  if (!id) {
    const hit = attempts.find((a) => a?.ok && a?.connection_id);
    if (hit?.connection_id) {
      id = String(hit.connection_id).trim();
      tt = String(hit.target_type || '').trim();
    }
  } else {
    const match =
      attempts.find((a) => a?.ok && String(a.connection_id || '').trim() === id) ||
      attempts.find((a) => a?.ok);
    if (match?.target_type) tt = String(match.target_type).trim();
  }
  if (!id) return;

  const bag = pinBag(runContext);
  if (bag) {
    bag.connection_id = id;
    if (tt) bag.target_type = tt;
  } else {
    runContext.pty_connection_id = id;
    if (tt) runContext.pty_target_type = tt;
  }

  const scope = pinScopeKey(runContext);
  if (!scope || !env?.DB) return;

  const workspaceId = String(runContext.workspaceId || runContext.workspace_id || '').trim() || null;
  const userId = String(runContext.userId || runContext.user_id || '').trim() || null;
  try {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO agentsam_pty_lane_pin
         (agent_run_id, connection_id, target_type, workspace_id, user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, unixepoch(), unixepoch())`,
    )
      .bind(scope, id, tt || null, workspaceId, userId)
      .run();
  } catch (e) {
    console.warn('[pty-lane-pin] persist_failed', e?.message || e);
  }
}

/**
 * @param {any} env
 * @param {Record<string, unknown>|null|undefined} runContext
 * @param {Record<string, unknown>} base
 */
export async function ptyExecOptsForFs(env, runContext, base = {}) {
  const pin = await resolvePinnedPtyLane(env, runContext);
  if (pin) {
    return {
      ...base,
      execution_mode: 'pty',
      connection_id: pin.connection_id,
      target_id: pin.connection_id,
      ...(pin.target_type ? { target_type: pin.target_type } : {}),
    };
  }
  return {
    ...base,
    execution_mode: 'pty',
    target_type: 'auto',
  };
}
