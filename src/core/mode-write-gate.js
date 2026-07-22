/**
 * Hard Ask/Plan write contracts — Cursor-parity autonomy sliders.
 * validateToolCall is the sole mutate gate; this module is the pure policy core.
 *
 * Law: Ask + Plan never mutate. Agent may mutate subject to write_policy + capabilities.
 */

/** @typedef {import('./runtime-profile.types.js').RuntimeWritePolicy} RuntimeWritePolicy */

const HARD_READONLY_MODES = new Set(['ask', 'plan']);
const HARD_READONLY_KINDS = new Set(['ask_turn', 'plan_pipeline']);

/** Tool name fragments that imply mutation even without D1 capability rows. */
const MUTATING_TOOL_NAME_RE =
  /(?:^|_)(write|put|patch|update|delete|remove|create|insert|upsert|migrate|deploy|exec|execute|run|terminal|pty|shell|bash|ssh|push|commit|publish|upload|send|mail_send|browser_act|fs_write|file_write|r2_put|r2_delete|wrangler)(?:_|$)/i;

const MUTATING_TOOL_EXACT = new Set([
  'terminal_run',
  'agentsam_terminal_remote',
  'agentsam_terminal_local',
  'agentsam_terminal_sandbox',
  'fs_write_file',
  'fs_edit_file',
  'fs_delete_file',
  'github_commit',
  'github_push',
  'agentsam_d1_exec',
  'd1_exec',
  'd1_migrate',
  'deploy',
  'wrangler_deploy',
  'agentsam_deploy',
  'codemode',
  'code_mode',
  'container_exec',
  'agentsam_container_exec',
]);

/**
 * @param {unknown} mode
 */
export function isHardReadonlyMode(mode) {
  return HARD_READONLY_MODES.has(String(mode || '').trim().toLowerCase());
}

/**
 * @param {unknown} executionKind
 */
export function isHardReadonlyExecutionKind(executionKind) {
  return HARD_READONLY_KINDS.has(String(executionKind || '').trim().toLowerCase());
}

/**
 * @param {RuntimeWritePolicy|null|undefined} writePolicy
 */
export function writePolicyAllowsAnyMutation(writePolicy) {
  const wp = writePolicy && typeof writePolicy === 'object' ? writePolicy : {};
  return (
    wp.can_edit_files === true ||
    wp.can_terminal === true ||
    wp.can_d1_write === true ||
    wp.can_deploy === true ||
    wp.can_browser_automation === true ||
    wp.can_memory_write === true ||
    wp.can_postgres_write === true ||
    wp.can_postgres_migrate === true ||
    wp.can_send_email === true
  );
}

/**
 * @param {unknown} toolName
 */
export function toolNameLooksMutating(toolName) {
  const n = String(toolName || '')
    .trim()
    .toLowerCase()
    .replace(/^agentsam_/, '');
  if (!n) return false;
  if (MUTATING_TOOL_EXACT.has(n) || MUTATING_TOOL_EXACT.has(`agentsam_${n}`)) return true;
  // Read-only exceptions that match the regex loosely
  if (
    /^(d1_query|agentsam_d1_query|fs_read|fs_search|search_|memory_search|codebase_retrieve|list_|get_|describe_|status)/i.test(
      n,
    )
  ) {
    return false;
  }
  return MUTATING_TOOL_NAME_RE.test(n);
}

/**
 * Seal Ask/Plan write_policy — never inherit a writable overlay.
 * @param {string} mode
 * @param {RuntimeWritePolicy|null|undefined} writePolicy
 * @returns {RuntimeWritePolicy}
 */
export function sealWritePolicyForMode(mode, writePolicy) {
  const m = String(mode || '').trim().toLowerCase();
  if (!isHardReadonlyMode(m)) {
    return writePolicy && typeof writePolicy === 'object'
      ? /** @type {RuntimeWritePolicy} */ (writePolicy)
      : {
          can_edit_files: true,
          can_terminal: true,
          can_d1_write: true,
          can_deploy: true,
          can_browser_automation: true,
          can_memory_write: true,
        };
  }
  return {
    can_edit_files: false,
    can_terminal: false,
    can_d1_write: false,
    can_deploy: false,
    can_browser_automation: false,
    can_memory_write: false,
    can_postgres_write: false,
    can_postgres_migrate: false,
    can_send_email: false,
  };
}

/**
 * Sole mutate gate for composer modes (pure).
 * @param {{
 *   mode?: string|null,
 *   execution_kind?: string|null,
 *   write_policy?: RuntimeWritePolicy|null,
 *   toolName: string,
 *   capabilityDecision?: { decision?: string, mutating_capabilities?: string[], unclassified?: boolean }|null,
 * }} input
 * @returns {{ allowed: boolean, reason: string }}
 */
export function assertModeWriteGate(input) {
  const mode = String(input.mode || '').trim().toLowerCase();
  const kind = String(input.execution_kind || '').trim().toLowerCase();
  const toolName = String(input.toolName || '').trim();
  const wp = sealWritePolicyForMode(mode, input.write_policy);
  const readonlyMode = isHardReadonlyMode(mode) || isHardReadonlyExecutionKind(kind);
  const looksMutating = toolNameLooksMutating(toolName);
  const cap = input.capabilityDecision || null;
  const capMutating =
    Array.isArray(cap?.mutating_capabilities) && cap.mutating_capabilities.length > 0;
  const capDenied = cap?.decision === 'deny';

  if (readonlyMode && (looksMutating || capMutating)) {
    return {
      allowed: false,
      reason: `blocked by ${mode || kind || 'readonly'} write_policy: mutations require Agent or Debug`,
    };
  }

  if (!writePolicyAllowsAnyMutation(wp) && (looksMutating || capMutating)) {
    return {
      allowed: false,
      reason: 'blocked by write_policy: no mutate flags enabled',
    };
  }

  if (capDenied) {
    return {
      allowed: false,
      reason: `blocked by capability policy: ${cap?.reason || 'deny'}`,
    };
  }

  // Agent/Debug/Multitask: name-heuristic only when write_policy lacks the relevant flag
  if (looksMutating) {
    const n = toolName.toLowerCase();
    if (/terminal|pty|shell|bash|container_exec|execos/.test(n) && wp.can_terminal !== true) {
      return { allowed: false, reason: 'blocked by write_policy.can_terminal' };
    }
    if (/deploy|wrangler/.test(n) && wp.can_deploy !== true) {
      return { allowed: false, reason: 'blocked by write_policy.can_deploy' };
    }
    if (
      /(fs_write|fs_edit|file_write|github_commit|git_commit)/.test(n) &&
      wp.can_edit_files !== true
    ) {
      return { allowed: false, reason: 'blocked by write_policy.can_edit_files' };
    }
    if (/(d1_exec|d1_migrate|d1_write)/.test(n) && wp.can_d1_write !== true) {
      return { allowed: false, reason: 'blocked by write_policy.can_d1_write' };
    }
  }

  return { allowed: true, reason: 'mode_write_gate_ok' };
}
