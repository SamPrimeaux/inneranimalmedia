import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inferWorkspaceSourceLane,
  formatWorkspaceBindingForAgent,
  appendWorkspaceBindingToPrompt,
} from '../../src/core/workspace-chat-scope.js';

test('inferWorkspaceSourceLane prefers explicit types', () => {
  assert.equal(inferWorkspaceSourceLane({ workspace_type: 'github', github_repo: 'o/r' }), 'github');
  assert.equal(inferWorkspaceSourceLane({ workspace_type: 'r2', r2_prefix: 'proj/' }), 'r2');
  assert.equal(inferWorkspaceSourceLane({ github_repo: 'o/r', r2_prefix: 'p/' }), 'mixed');
  assert.equal(inferWorkspaceSourceLane({ root_path: '/home/dev' }), 'local');
  assert.equal(inferWorkspaceSourceLane({}), 'general');
});

test('formatWorkspaceBindingForAgent documents precedence and overrides', () => {
  const block = formatWorkspaceBindingForAgent(
    {
      workspace_id: 'ws_1',
      github_repo: 'user/repo',
      r2_prefix: null,
      r2_bucket: null,
      root_path: null,
      workspace_type: 'project',
      source_lane: 'github',
    },
    { explicitGithubRepo: 'user/other', activeFileRepo: 'user/open-file' },
  );
  assert.match(block, /session anchor/);
  assert.match(block, /primary_github_repo: user\/repo/);
  assert.match(block, /active_file_github_repo \(override\): user\/open-file/);
  assert.match(block, /Precedence/);
});

test('appendWorkspaceBindingToPrompt is idempotent', () => {
  const binding = {
    workspace_id: 'ws_1',
    github_repo: null,
    r2_prefix: 'lane/',
    r2_bucket: 'bucket',
    root_path: null,
    workspace_type: 'r2',
    source_lane: 'r2',
  };
  const once = appendWorkspaceBindingToPrompt('base', binding);
  const twice = appendWorkspaceBindingToPrompt(once, binding);
  assert.equal(once, twice);
  assert.match(once, /r2_prefix: lane\//);
});
