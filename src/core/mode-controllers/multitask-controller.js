import { jsonResponse } from '../responses.js';
import { executeRwsSpawnFanout, shouldRunRwsFanout } from '../rws-spawn-fanout.js';
import { runSharedProfileToolLoop } from './agent-controller.js';

/**
 * Multitask controller — RWS fanout only when user policy enables it; else one tool loop (same as Agent).
 *
 * @param {any} env
 * @param {any} ctx
 * @param {Record<string, unknown>} input
 */
export async function executeMultitaskTurn(env, ctx, input) {
  const profile = input.profile;
  if (profile.execution_kind !== 'multitask_fanout') {
    return jsonResponse(
      { error: 'multitask_controller_execution_kind_mismatch', execution_kind: profile.execution_kind },
      400,
    );
  }
  if (shouldRunRwsFanout(profile)) {
    return executeRwsSpawnFanout(env, ctx, input);
  }
  return runSharedProfileToolLoop(env, ctx, input);
}
