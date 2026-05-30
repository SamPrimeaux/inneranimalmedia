import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isReadOnlyRepoSearchIntent,
  isReadOnlyFileContextIntent,
  isCodeImplementationIntent,
  shouldSkipSurfaceWorkflowPreflight,
} from '../../src/core/code-implementation-intent.js';
import {
  classifyAgentExecutionLane,
  messageRequestsWorkspaceGrep,
} from '../../src/core/agent-lane-router.js';
import { messageRequestsInternalKnowledge } from '../../src/core/tavily-open-web-search.js';
import {
  formatActiveFileForAgent,
  parseActiveFileEnvelope,
  stripUserTextForIntent,
} from '../../src/core/active-file-envelope.js';

const USER_QUERY = 'Find resolveModelForTask in my repo and show the file path.';

const ON_DEMAND_CONTEXT_BLOCK = `

--- On-demand context (this message only) ---
### Agent tool targets (read/write this buffer)
If the user asks to change, save, or sync this file, call the matching tool with the exact ids below.
- r2_write / github_file for persistence
read/write this buffer
`;

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

test('on-demand context with CRLF separators does not flip repo search intent', () => {
  const augmented = `${USER_QUERY}\r\n\r\n--- On-demand context (this message only) ---\r\nread/write\r\nsave\r\nsync`;
  assert.equal(stripUserTextForIntent(augmented), USER_QUERY);
  assert.equal(isReadOnlyRepoSearchIntent(augmented), true);
  assert.equal(isCodeImplementationIntent(augmented), false);
  assert.equal(shouldSkipSurfaceWorkflowPreflight(augmented, 'agent'), true);
});

test('on-demand context block does not flip repo search into code implementation', () => {
  const augmented = `${USER_QUERY}${ON_DEMAND_CONTEXT_BLOCK}`;
  assert.equal(stripUserTextForIntent(augmented), USER_QUERY);
  assert.equal(isReadOnlyRepoSearchIntent(augmented), true);
  assert.equal(isCodeImplementationIntent(augmented), false);
  assert.equal(shouldSkipSurfaceWorkflowPreflight(augmented, 'agent'), true);
});

test('read-only file context with on-demand tool hints does not select internal knowledge', () => {
  const augmented = `describe this README in the monaco${ON_DEMAND_CONTEXT_BLOCK}`;
  assert.equal(messageRequestsInternalKnowledge(augmented), false);
  const lane = classifyAgentExecutionLane(augmented, { requestedMode: 'agent' });
  assert.equal(lane.primary_lane, 'read_only_file_context');
});

test('describe README in monaco is read-only file context — no workflow preflight', () => {
  const message = 'describe this README in the monaco';
  const augmented = `${message}\n\n--- On-demand context (this message only) ---\nread/write this buffer\nsave\nsync`;
  assert.equal(isReadOnlyFileContextIntent(message), true);
  assert.equal(isReadOnlyFileContextIntent(augmented), true);
  assert.equal(isCodeImplementationIntent(message), false);
  assert.equal(isCodeImplementationIntent(augmented), false);
  assert.equal(shouldSkipSurfaceWorkflowPreflight(augmented, 'agent'), true);
  const lane = classifyAgentExecutionLane(augmented, { requestedMode: 'agent' });
  assert.notEqual(lane.primary_lane, 'workspace_grep');
});

test('code implementation with write cue still counts as code implementation', () => {
  const message = 'edit and save this file in monaco';
  assert.equal(isReadOnlyFileContextIntent(message), false);
  assert.equal(isCodeImplementationIntent(message), true);
  assert.equal(shouldSkipSurfaceWorkflowPreflight(message, 'agent'), false);
});

test('production monaco-missing error text must not apply to read-only repo search', () => {
  const augmented = `${USER_QUERY}${ON_DEMAND_CONTEXT_BLOCK}`;
  const wouldStreamMonacoMissing =
    !shouldSkipSurfaceWorkflowPreflight(augmented, 'agent') &&
    isCodeImplementationIntent(augmented);
  assert.equal(wouldStreamMonacoMissing, false);
  const monacoMissingLabel = 'monaco workflow is missing';
  assert.equal(
    wouldStreamMonacoMissing ? `**${monacoMissingLabel}**` : '',
    '',
    'read-only repo search must not produce monaco workflow missing response',
  );
});
