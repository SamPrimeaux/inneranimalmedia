/**
 * Pure approval policy — no DB/auth imports (safe for unit tests).
 */

const TRUSTED_EXECUTION_MODES = new Set(['agent', 'debug', 'multitask']);

export function shouldRequireToolApproval(validationResult, modeConfig, userPolicy) {
  if (validationResult?.requiresConfirmation !== true) return false;

  const autoRun = String(userPolicy?.auto_run_mode || '').toLowerCase();
  const mode = String(modeConfig?.mode ?? modeConfig?.slug ?? '').toLowerCase();

  if (autoRun === 'auto' && TRUSTED_EXECUTION_MODES.has(mode)) {
    return false;
  }

  return true;
}
