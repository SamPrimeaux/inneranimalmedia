import test from 'node:test';
import assert from 'node:assert/strict';
import { rankAutoTerminalTargetType } from '../../src/core/terminal-connection-health.js';
import { isTerminalTransportFailure } from '../../src/core/terminal.js';

test('auto lane rank is local → remote → sandbox', () => {
  assert.equal(rankAutoTerminalTargetType('user_hosted_tunnel'), 0);
  assert.equal(rankAutoTerminalTargetType('platform_vm'), 1);
  assert.equal(rankAutoTerminalTargetType('remote'), 1);
  assert.equal(rankAutoTerminalTargetType('sandbox'), 2);
  assert.ok(rankAutoTerminalTargetType('user_hosted_tunnel') < rankAutoTerminalTargetType('platform_vm'));
  assert.ok(rankAutoTerminalTargetType('platform_vm') < rankAutoTerminalTargetType('sandbox'));
});

test('isTerminalTransportFailure ignores shell ENOENT / exit codes', () => {
  assert.equal(isTerminalTransportFailure({ ok: true }), false);
  assert.equal(
    isTerminalTransportFailure({ ok: false, error: 'No such file or directory', exitCode: 1 }),
    false,
  );
  assert.equal(
    isTerminalTransportFailure({ ok: false, error: 'user_hosted_tunnel_unreachable' }),
    true,
  );
  assert.equal(isTerminalTransportFailure({ ok: false, error: 'PTY VPC exec failed' }), true);
  assert.equal(isTerminalTransportFailure({ ok: false, error: 'control-plane 502' }), true);
  assert.equal(isTerminalTransportFailure({ ok: false, error: 'sandbox_unreachable' }), true);
});
