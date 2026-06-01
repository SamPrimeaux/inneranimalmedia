import { jsonResponse } from '../responses.js';
import { executeRwsSpawnFanout } from '../rws-spawn-fanout.js';

/**
 * Multitask controller — delegates to read → write → summarize spawn pipeline.
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
  return executeRwsSpawnFanout(env, ctx, input);
}
