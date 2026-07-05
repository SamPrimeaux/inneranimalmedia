import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isGithubToolName,
  isTerminalToolName,
  isArtifactOrR2ToolName,
} from '../../src/core/tool-capability-matchers.js';

test('isGithubToolName matches agentsam_github_* catalog tools', () => {
  assert.equal(isGithubToolName('agentsam_github_read'), true);
  assert.equal(isGithubToolName('agentsam_github_tree'), true);
  assert.equal(isGithubToolName('github_read'), true);
  assert.equal(isGithubToolName('agentsam_d1_query'), false);
});

test('isTerminalToolName matches agentsam_terminal_* and legacy names', () => {
  assert.equal(isTerminalToolName('agentsam_terminal_local'), true);
  assert.equal(isTerminalToolName('agentsam_terminal_sandbox'), true);
  assert.equal(isTerminalToolName('agentsam_terminal_remote'), true);
  assert.equal(isTerminalToolName('agentsam_container_exec'), true);
  assert.equal(isTerminalToolName('terminal_run'), true);
  assert.equal(isTerminalToolName('agentsam_github_read'), false);
});

test('isArtifactOrR2ToolName matches agentsam_r2_* catalog tools', () => {
  assert.equal(isArtifactOrR2ToolName('agentsam_r2_get'), true);
  assert.equal(isArtifactOrR2ToolName('agentsam_r2_put'), true);
  assert.equal(isArtifactOrR2ToolName('r2_list'), true);
  assert.equal(isArtifactOrR2ToolName('agentsam_terminal_local'), false);
});
