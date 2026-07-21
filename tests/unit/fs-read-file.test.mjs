import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPtyReadAbsoluteCommand,
  buildPtyReadFileCommand,
  isSafePtyReadFileCommand,
} from '../../src/core/fs-read-file.js';

test('buildPtyReadFileCommand rejects traversal', () => {
  assert.equal(buildPtyReadFileCommand('../etc/passwd'), null);
  assert.equal(buildPtyReadFileCommand('/etc/passwd'), null);
});

test('buildPtyReadFileCommand produces safe head command', () => {
  const cmd = buildPtyReadFileCommand('src/core/fs-read-file.js', 'my-other-repo');
  assert.ok(cmd);
  assert.equal(isSafePtyReadFileCommand(cmd, 'my-other-repo'), true);
  assert.match(cmd, /^cd 'my-other-repo' && head -c /);
});

test('buildPtyReadFileCommand allows "." when cwd is already repo root', () => {
  const cmd = buildPtyReadFileCommand('package.json', '.');
  assert.ok(cmd);
  assert.equal(isSafePtyReadFileCommand(cmd, '.'), true);
  assert.match(cmd, /^head -c /);
  assert.equal(cmd.includes('cd '), false);
});

test('buildPtyReadAbsoluteCommand supports host Mac paths', () => {
  const cmd = buildPtyReadAbsoluteCommand('/Users/sam/inneranimalmedia/src/index.js');
  assert.ok(cmd);
  assert.match(cmd, /^head -c /);
});
