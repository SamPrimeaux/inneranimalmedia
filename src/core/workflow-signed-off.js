/**
 * Workflow sign-off — once setup is complete, runs should not pause on blanket approval gates.
 * SSOT: agentsam_workflows.metadata_json.signed_off (+ optional signed_off_at / signed_off_by).
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
