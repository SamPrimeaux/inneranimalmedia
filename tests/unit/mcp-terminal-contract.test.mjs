import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertTerminalLocalArgs,
  buildTerminalToolResponseBody,
  terminalRecoveryHints,
} from '../../src/core/mcp-terminal-contract.js';

test('assertTerminalLocalArgs rejects target_id', () => {
  assert.match(
    assertTerminalLocalArgs({ command: 'pwd', target_id: 'tenant_x' }),
    /terminal_local_does_not_accept_target_id/,
  );
  assert.equal(assertTerminalLocalArgs({ command: 'pwd', path: '/workspace/a' }), null);
});

test('buildTerminalToolResponseBody honors path cwd_source', () => {
  const body = buildTerminalToolResponseBody({
    explicitPath: '/workspace/tenant/u1/repo-a',
    workspaceRoot: '/workspace/tenant/u1/platform',
    executedCommand: 'cd /workspace/tenant/u1/repo-a && npm run build',
    stdout: 'ok',
    stderr: '',
    exitCode: 0,
  });
  assert.equal(body.cwd, '/workspace/tenant/u1/repo-a');
  assert.equal(body.cwd_source, 'path');
  assert.equal(body.exit_code, 0);
  assert.equal(body.stdout, 'ok');
  assert.equal(body.stderr, '');
});

test('terminalRecoveryHints suggests SSH after HTTPS 403', () => {
  const hints = terminalRecoveryHints({
    stderr: "fatal: unable to access 'https://github.com/OWNER/REPO.git/': The requested URL returned error: 403",
  });
  assert.equal(hints[0]?.code, 'git_https_push_denied');
});

test('terminalRecoveryHints suggests npm i before code changes', () => {
  const hints = terminalRecoveryHints({
    stderr: "Cannot find module '@rolldown/binding-linux-x64-gnu'",
  });
  assert.equal(hints[0]?.code, 'node_optional_binding_missing');
});
