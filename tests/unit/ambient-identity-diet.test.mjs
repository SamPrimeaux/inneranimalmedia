import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatAmbientIdentityForAgent,
  formatWorkspaceContextForAgent,
  appendAmbientWorkspaceContextToPrompt,
} from '../../src/core/workspace-studio-context.js';

test('formatAmbientIdentityForAgent emits identity only', () => {
  const block = formatAmbientIdentityForAgent({
    user_id: 'au_test',
    email: 'sam@example.com',
    role: 'superadmin',
    is_superadmin: 1,
    tenant_id: 'tenant_iam',
    workspace_id: 'ws_inneranimalmedia',
  });
  assert.match(block, /user_id: au_test/);
  assert.match(block, /credential_lane: platform/);
  assert.doesNotMatch(block, /github_repo/);
  assert.doesNotMatch(block, /dashboard_path/);
  assert.doesNotMatch(block, /root_path/);
});

test('formatWorkspaceContextForAgent ignores IDE place packets', () => {
  const block = formatWorkspaceContextForAgent({
    dashboard_path: '/dashboard/mail',
    github_repo: 'SamPrimeaux/inneranimalmedia',
    root_path: '/Users/sam/inneranimalmedia',
    openFiles: ['a.tsx'],
    active_file: 'a.tsx',
  });
  assert.equal(block, null);
});

test('appendAmbientWorkspaceContextToPrompt does not dump IDE packet', () => {
  const out = appendAmbientWorkspaceContextToPrompt(
    'You are Agent Sam.',
    {
      workspaceContext: {
        dashboard_path: '/dashboard/mail',
        github_repo: 'o/r',
        root_path: '/tmp',
      },
    },
    {},
    {
      user_id: 'au_1',
      role: 'user',
      is_superadmin: 0,
      tenant_id: 't1',
      workspace_id: 'ws_1',
    },
  );
  assert.match(out, /## Session/);
  assert.match(out, /user_id: au_1/);
  assert.match(out, /credential_lane: byok/);
  assert.doesNotMatch(out, /dashboard_path/);
  assert.doesNotMatch(out, /github_repo/);
  assert.doesNotMatch(out, /IDE workspace context/);
});
