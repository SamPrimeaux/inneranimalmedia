import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isGithubToolName,
  isTerminalToolName,
  isArtifactOrR2ToolName,
} from '../../src/core/tool-capability-matchers.js';
import { isCodeImplementationToolName } from '../../src/core/code-implementation-intent.js';
import {
  inferWantsD1FromMessage,
  shouldBypassCapabilityLaneFilter,
  stripNegatedToolMentions,
} from '../../src/core/tool-capability-lane-policy.js';

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

test('stripNegatedToolMentions removes do-not-call spans', () => {
  const cleaned = stripNegatedToolMentions(
    'Do not call agentsam_d1_query. First tool agentsam_search_tools with keyword r2.',
  );
  assert.equal(/\bagentsam_d1_query\b/i.test(cleaned), false);
  assert.equal(/\bagentsam_search_tools\b/i.test(cleaned), true);
});

test('inferWantsD1FromMessage ignores negated d1 tool name', () => {
  assert.equal(
    inferWantsD1FromMessage(
      'Do not call agentsam_d1_query. First tool agentsam_search_tools with keyword r2.',
      null,
    ),
    false,
  );
  assert.equal(inferWantsD1FromMessage('Run agentsam_d1_query on agentsam_tools', null), true);
});

test('shouldBypassCapabilityLaneFilter when progressive', () => {
  assert.equal(shouldBypassCapabilityLaneFilter({ progressiveToolDiscovery: true }, false), true);
  assert.equal(shouldBypassCapabilityLaneFilter({ progressiveToolDiscovery: true }, true), false);
  assert.equal(shouldBypassCapabilityLaneFilter({}, false), false);
});

test('isCodeImplementationToolName includes fs_read_file', () => {
  assert.equal(isCodeImplementationToolName('fs_read_file'), true);
  assert.equal(isCodeImplementationToolName('fs_search_files'), true);
});
