/**
 * Workflow sign-off — once setup is complete, runs should not pause on blanket approval gates.
 * SSOT: agentsam_workflows.metadata_json.signed_off (+ optional signed_off_at / signed_off_by).
 *
 * Automation trust ladder (keep layers distinct — do not conflate):
 * 1. Composer mode contract — src/core/agent-mode.js + runtime-profile.js (Ask read-only, Agent executes).
 * 2. Workspace policy — agentsam_user_policy.auto_run_mode ('auto' skips catalog requires_approval in Agent/Debug/Multitask).
 * 3. Tool catalog — agentsam_tools.requires_approval (per-tool risk; honored unless auto_run + execution mode).
 * 4. Workflow graph — agentsam_workflows signed_off skips approval_gate / registry approval handlers only.
 *    Explicit approval_gate nodes in unsigned workflows remain intentional human checkpoints.
 */

import { parseWorkflowMetadata } from './workflow-execution-mode.js';

export function isWorkflowSignedOff(workflowRow) {
  const meta = parseWorkflowMetadata(workflowRow?.metadata_json);
  if (meta.signed_off === true) return true;
  const mode = String(meta.automation_mode || '').trim().toLowerCase();
  return mode === 'trusted' || mode === 'signed_off';
}

export function shouldEnforceWorkflowApproval(workflowRow) {
  return !isWorkflowSignedOff(workflowRow);
}

export function mergeWorkflowMetadata(existingRaw, patchRaw) {
  const base = parseWorkflowMetadata(existingRaw);
  const patch = parseWorkflowMetadata(patchRaw);
  return { ...base, ...patch };
}

export function buildSignedOffMetadataPatch(existingRaw, { signedOff, userId } = {}) {
  const merged = mergeWorkflowMetadata(existingRaw, {
    signed_off: signedOff === true,
    ...(signedOff
      ? {
          signed_off_at: new Date().toISOString(),
          ...(userId ? { signed_off_by: String(userId) } : {}),
        }
      : {
          signed_off_at: null,
          signed_off_by: null,
        }),
  });
  return merged;
}
