import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isReadOnlyRepoSearchIntent,
  isCodeImplementationIntent,
  shouldSkipSurfaceWorkflowPreflight,
} from '../../src/core/code-implementation-intent.js';
import {
  classifyAgentExecutionLane,
  messageRequestsWorkspaceGrep,
} from '../../src/core/agent-lane-router.js';
import { formatActiveFileForAgent, parseActiveFileEnvelope } from '../../src/core/active-file-envelope.js';

const USER_QUERY = 'Find resolveModelForTask in my repo and show the file path.';

test('repo search with active file envelope does not trigger code implementation / monaco path', () => {
  const envelope = parseActiveFileEnvelope({
    active_file_source: 'local',
    active_file_path: 'src/api/agent.js',
    active_file_workspace_path: 'src/api/agent.js',
  });
  assert.ok(envelope);
  const augmented = `${USER_QUERY}\n\n${formatActiveFileForAgent(envelope)}`;
  assert.ok(isReadOnlyRepoSearchIntent(USER_QUERY));
  assert.ok(isReadOnlyRepoSearchIntent(augmented));
  assert.equal(isCodeImplementationIntent(augmented), false);
  assert.equal(shouldSkipSurfaceWorkflowPreflight(augmented, 'agent'), true);
});

test('mode=agent repo search selects workspace_grep without workflow requirement', () => {
  const envelope = parseActiveFileEnvelope({
    active_file_path: 'src/api/agent.js',
    active_file_workspace_path: 'src/api/agent.js',
  });
  const message = `${USER_QUERY}\n\n${formatActiveFileForAgent(envelope)}`;
  const lane = classifyAgentExecutionLane(message, { requestedMode: 'agent' });
  assert.equal(lane.primary_lane, 'workspace_grep');
  assert.ok(messageRequestsWorkspaceGrep(message));
  assert.equal(shouldSkipSurfaceWorkflowPreflight(message, 'agent'), true);
});

test('explicit workflow execution is not skipped', () => {
  assert.equal(
    shouldSkipSurfaceWorkflowPreflight('run the monaco workflow to patch agent.js', 'agent'),
    false,
  );
});
