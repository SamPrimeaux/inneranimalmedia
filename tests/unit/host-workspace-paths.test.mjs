import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IAM_GCP_OPERATOR_REPO,
  gcpRemoteExecCwd,
  vmWorkspaceRootFromSettings,
  connectionUsesGcpRepoLayout,
  resolveRepoRootForHost,
} from '../../src/core/host-workspace-paths.js';

test('vmWorkspaceRootFromSettings prefers vm_workspace_root', () => {
  assert.equal(
    vmWorkspaceRootFromSettings({
      workspace_root: '/Users/samprimeaux/inneranimalmedia',
      vm_workspace_root: '/home/samprimeaux/inneranimalmedia',
    }),
    '/home/samprimeaux/inneranimalmedia',
  );
});

test('vmWorkspaceRootFromSettings fails loud without vm root', () => {
  assert.equal(vmWorkspaceRootFromSettings({ workspace_root: '/Users/x/project' }), null);
  assert.equal(gcpRemoteExecCwd(null), null);
});

test('vmWorkspaceRootFromSettings allowOperatorFallback is opt-in', () => {
  assert.equal(
    vmWorkspaceRootFromSettings({}, { allowOperatorFallback: true }),
    IAM_GCP_OPERATOR_REPO,
  );
});

test('connectionUsesGcpRepoLayout detects platform_vm and linux', () => {
  assert.equal(connectionUsesGcpRepoLayout({ target_type: 'platform_vm' }), true);
  assert.equal(connectionUsesGcpRepoLayout({ platform: 'linux' }), true);
  assert.equal(connectionUsesGcpRepoLayout({ platform: 'darwin' }), false);
});

test('resolveRepoRootForHost uses settings vm root when forced', () => {
  assert.equal(
    resolveRepoRootForHost('/Users/samprimeaux/fuelnfreetime', {
      forceGcp: true,
      settings: { vm_workspace_root: '/home/samprimeaux/fuelnfreetime' },
    }),
    '/home/samprimeaux/fuelnfreetime',
  );
  assert.equal(resolveRepoRootForHost('', { forceGcp: true }), null);
  assert.equal(
    resolveRepoRootForHost('', { forceGcp: true, allowOperatorFallback: true }),
    IAM_GCP_OPERATOR_REPO,
  );
});
