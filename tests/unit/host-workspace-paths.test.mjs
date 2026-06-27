import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IAM_GCP_OPERATOR_REPO,
  translateHostRootForGcp,
  vmWorkspaceRootFromSettings,
  connectionUsesGcpRepoLayout,
  resolveRepoRootForHost,
} from '../../src/core/host-workspace-paths.js';

test('translateHostRootForGcp maps Mac home to Linux home', () => {
  assert.equal(
    translateHostRootForGcp('/Users/samprimeaux/inneranimalmedia'),
    '/home/samprimeaux/inneranimalmedia',
  );
});

test('vmWorkspaceRootFromSettings prefers vm_workspace_root', () => {
  assert.equal(
    vmWorkspaceRootFromSettings({
      workspace_root: '/Users/samprimeaux/inneranimalmedia',
      vm_workspace_root: '/home/samprimeaux/inneranimalmedia',
    }),
    '/home/samprimeaux/inneranimalmedia',
  );
});

test('connectionUsesGcpRepoLayout detects platform_vm and linux', () => {
  assert.equal(connectionUsesGcpRepoLayout({ target_type: 'platform_vm' }), true);
  assert.equal(connectionUsesGcpRepoLayout({ platform: 'linux' }), true);
  assert.equal(connectionUsesGcpRepoLayout({ platform: 'darwin' }), false);
});

test('resolveRepoRootForHost uses GCP layout when forced', () => {
  assert.equal(
    resolveRepoRootForHost('/Users/samprimeaux/inneranimalmedia', { forceGcp: true }),
    '/home/samprimeaux/inneranimalmedia',
  );
  assert.equal(
    resolveRepoRootForHost('', { forceGcp: true }),
    IAM_GCP_OPERATOR_REPO,
  );
});
