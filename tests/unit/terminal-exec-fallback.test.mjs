import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TERMINAL_LANE_TOOLS,
  resolveTerminalFallbackChain,
  isRetriableTerminalLaneFailure,
  buildCommandForTerminalLane,
  buildTerminalLanesExhaustedBody,
} from '../../src/core/terminal-exec-fallback.js';

test('resolveTerminalFallbackChain local → sandbox → remote for operators', () => {
  const chain = resolveTerminalFallbackChain(TERMINAL_LANE_TOOLS.LOCAL, { isPlatformOperator: true });
  assert.deepEqual(chain, [
    TERMINAL_LANE_TOOLS.LOCAL,
    TERMINAL_LANE_TOOLS.SANDBOX,
    TERMINAL_LANE_TOOLS.REMOTE,
  ]);
});

test('resolveTerminalFallbackChain local → sandbox only for non-operators', () => {
  const chain = resolveTerminalFallbackChain(TERMINAL_LANE_TOOLS.LOCAL, { isPlatformOperator: false });
  assert.deepEqual(chain, [TERMINAL_LANE_TOOLS.LOCAL, TERMINAL_LANE_TOOLS.SANDBOX]);
});

test('isRetriableTerminalLaneFailure treats PTY 403 as retriable', () => {
  assert.equal(
    isRetriableTerminalLaneFailure({
      ok: false,
      error: 'Terminal Error: PTY command failed (403)',
    }),
    true,
  );
});

test('buildCommandForTerminalLane sandbox uses raw command without mac cwd', () => {
  const cmd = buildCommandForTerminalLane('whoami', TERMINAL_LANE_TOOLS.SANDBOX, {
    explicitPath: '/Users/samprimeaux/inneranimalmedia',
  });
  assert.equal(cmd, 'whoami');
});

test('buildCommandForTerminalLane remote wraps with vm root', () => {
  const cmd = buildCommandForTerminalLane('git status', TERMINAL_LANE_TOOLS.REMOTE, {
    settingsJson: { vm_workspace_root: '/home/samprimeaux/inneranimalmedia' },
  });
  assert.match(cmd, /cd \/home\/samprimeaux\/inneranimalmedia && git status/);
});

test('buildTerminalLanesExhaustedBody includes auth tips after local 403', () => {
  const out = buildTerminalLanesExhaustedBody(
    [
      { tool: TERMINAL_LANE_TOOLS.LOCAL, ok: false, error: 'PTY command failed (403)' },
      { tool: TERMINAL_LANE_TOOLS.SANDBOX, ok: false, error: 'timeout' },
    ],
    { rawCommand: 'whoami' },
  );
  assert.equal(out.ok, false);
  assert.equal(out.error, 'all_terminal_lanes_failed');
  assert.ok(out.body.recovery_hints.some((h) => h.code === 'local_pty_auth_failed'));
  assert.ok(Array.isArray(out.body.next_steps));
});
