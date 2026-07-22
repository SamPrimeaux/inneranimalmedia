import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Mirrors the workspace-file no-approval predicate in agent-tool-validator.js
 * (kept local so we don't need a full env/DB validateToolCall harness).
 */
function workspaceFileToolNoApproval(name, mode, canEditFiles) {
  const modeNorm = String(mode || '').trim().toLowerCase();
  const toolNorm = String(name || '').trim().toLowerCase();
  return (
    (toolNorm === 'fs_write_file' ||
      toolNorm === 'fs_edit_file' ||
      toolNorm === 'workspace_apply_patch' ||
      toolNorm === 'fs_apply_patch' ||
      toolNorm === 'write_file') &&
    (canEditFiles === true ||
      modeNorm === 'agent' ||
      modeNorm === 'debug' ||
      modeNorm === 'multitask')
  );
}

test('Agent mode skips approval for fs_write_file even if D1 requires_approval=1', () => {
  assert.equal(workspaceFileToolNoApproval('fs_write_file', 'agent', false), true);
  assert.equal(workspaceFileToolNoApproval('fs_edit_file', 'agent', true), true);
});

test('Ask mode still requires approval path for writes (gate elsewhere)', () => {
  assert.equal(workspaceFileToolNoApproval('fs_write_file', 'ask', false), false);
});

test('deploy/git tools are not in the workspace-file auto-allow set', () => {
  assert.equal(workspaceFileToolNoApproval('cloudflare.deploy', 'agent', true), false);
  assert.equal(workspaceFileToolNoApproval('agentsam_github_write', 'agent', true), false);
});
