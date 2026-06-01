import { jsonResponse } from '../responses.js';
import { runSharedProfileToolLoop } from './agent-controller.js';

/**
 * Debug controller
 * - execution_kind: debug_investigation_loop
 * - purpose: evidence-first fix with visible phase gates via debug_policy
 *
 * Initial implementation wraps the shared agent tool loop; tool gating is enforced
 * by validateToolCall(profile, toolCall) in the hot path.
 *
 * @param {any} env
 * @param {any} ctx
 * @param {any} input
 */
export async function executeDebugTurn(env, ctx, input) {
  const profile = input.profile;
  if (profile.execution_kind !== 'debug_investigation_loop') {
    return jsonResponse(
      { error: 'debug_controller_execution_kind_mismatch', execution_kind: profile.execution_kind },
      400,
    );
  }
  return runSharedProfileToolLoop(env, ctx, input);
}

