/**
 * User-visible copy for agent/tool failures.
 * Internal strings (tool timeouts, dispatch codes, PTC integrity) must never
 * become the assistant bubble as if the model said them.
 */

export const USER_VISIBLE_TOOL_FAILURE =
  'Something went wrong retrieving that — try again.';

export const USER_VISIBLE_CREDENTIAL_FAILURE =
  'A required credential is missing or misconfigured for this tool. Reconnect the integration or ask an operator to check platform credentials.';

/**
 * True when text is an internal tool/runtime error that must not be shown as assistant prose.
 * @param {unknown} text
 */
export function isInternalAgentErrorText(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (/^Tool timed out after \d+ms$/i.test(t)) return true;
  if (/^Tool execution failed:\s*/i.test(t) && /timed out after \d+ms/i.test(t)) return true;
  if (/^Tool execution failed:\s*/i.test(t) && t.length < 400) {
    // Intentional deadline explanations are user-visible (not internal noise).
    if (/Not enough time left|Agent run deadline reached/i.test(t)) return false;
    return true;
  }
  if (/^Agent run timed out$/i.test(t)) return true;
  if (/^apply_patch failed:/i.test(t)) return true;
  if (/openai_ptc_/i.test(t)) return true;
  if (/MODEL_DISPATCH_FAILED/i.test(t)) return true;
  if (/^__IAM_PROVIDER_HTTP__$/i.test(t)) return true;
  if (/^\[resolveCredential\]/i.test(t)) return true;
  if (/^(tool_timeout|tool_error|agent_run_timeout)$/i.test(t)) return true;
  // Short exact "Tool timed out after Nms" embedded as sole bubble content.
  if (/timed out after \d+ms/i.test(t) && t.length < 160 && !/\n/.test(t)) return true;
  return false;
}

/**
 * Map raw error / timeout / code to operator-safe assistant text.
 * @param {unknown} raw
 * @param {{ code?: string|null }} [opts]
 * @returns {string}
 */
export function synthesizeUserVisibleAgentFailure(raw, opts = {}) {
  const t = String(raw ?? '').trim();
  const code = opts.code != null ? String(opts.code) : '';
  if (/\[resolveCredential\]/i.test(t) || /credential not configured/i.test(t)) {
    return USER_VISIBLE_CREDENTIAL_FAILURE;
  }
  if (
    code === 'tool_timeout' ||
    code === 'agent_run_timeout' ||
    code === 'openai_ptc_caller_integrity' ||
    code === 'openai_ptc_caller_missing' ||
    code === 'MODEL_DISPATCH_FAILED' ||
    isInternalAgentErrorText(t)
  ) {
    return USER_VISIBLE_TOOL_FAILURE;
  }
  // agent_run_deadline messages are already human-readable — keep them.
  if (code === 'agent_run_deadline' && t) return t;
  if (!t) return USER_VISIBLE_TOOL_FAILURE;
  return t;
}
