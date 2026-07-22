import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IAM_GCP_OPERATOR_REPO,
  gcpRemoteExecCwd,
  vmWorkspaceRootFromSettings,
  connectionUsesGcpRepoLayout,
  resolveRepoRootForHost,
  rewriteMacCwdInShellCommand,
  sanitizeShellCommandForGcpExec,
  mapForeignDesktopPathToGcp,
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

test('rewriteMacCwdInShellCommand rewrites leading cd and embedded leaf paths', () => {
  assert.equal(
    rewriteMacCwdInShellCommand(
      'cd /Users/samprimeaux/inneranimalmedia && pwd',
      IAM_GCP_OPERATOR_REPO,
    ),
    'cd /home/samprimeaux/inneranimalmedia && pwd',
  );
  assert.equal(
    rewriteMacCwdInShellCommand(
      'cat /Users/samprimeaux/inneranimalmedia/package.json',
      IAM_GCP_OPERATOR_REPO,
    ),
    'cat /home/samprimeaux/inneranimalmedia/package.json',
  );
});

test('sanitizeShellCommandForGcpExec maps via workspace_root and rejects unknowns', () => {
  const mapped = sanitizeShellCommandForGcpExec(
    'node /Users/samprimeaux/fuelnfreetime/scripts/x.js',
    '/home/samprimeaux/fuelnfreetime',
    { settings: { workspace_root: '/Users/samprimeaux/fuelnfreetime' } },
  );
  assert.equal(mapped.ok, true);
  assert.equal(mapped.command, 'node /home/samprimeaux/fuelnfreetime/scripts/x.js');

  const rejected = sanitizeShellCommandForGcpExec(
    'cat /Users/other/secret.txt',
    IAM_GCP_OPERATOR_REPO,
    { rejectUnmapped: true },
  );
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error, 'embedded_mac_path_on_gcp');
  assert.ok(rejected.rejected_paths.includes('/Users/other/secret.txt'));
});

test('mapForeignDesktopPathToGcp uses leaf match without inventing tenants', () => {
  assert.equal(
    mapForeignDesktopPathToGcp(
      '/Users/samprimeaux/inneranimalmedia/src/index.js',
      IAM_GCP_OPERATOR_REPO,
    ),
    '/home/samprimeaux/inneranimalmedia/src/index.js',
  );
  assert.equal(
    mapForeignDesktopPathToGcp('/Users/samprimeaux/other-repo/x', IAM_GCP_OPERATOR_REPO),
    null,
  );
});
