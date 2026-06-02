import assert from 'node:assert/strict';
import test from 'node:test';
import { wrapShellCommandWithPath } from '../../src/core/mcp-terminal-contract.js';

test('wrapShellCommandWithPath prefixes cd when path set', () => {
  assert.equal(
    wrapShellCommandWithPath('/workspace/tenant/u1/my-project', 'npm run build'),
    'cd /workspace/tenant/u1/my-project && npm run build',
  );
});

test('wrapShellCommandWithPath skips when command already cds', () => {
  const cmd = 'cd /workspace/foo && npm i';
  assert.equal(wrapShellCommandWithPath('/workspace/bar', cmd), cmd);
});
