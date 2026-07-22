import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPtyWriteFileCommand,
  isSafePtyWriteFileCommand,
} from '../../src/core/fs-write-file.js';

test('isSafePtyWriteFileCommand allows the required base64 pipe', () => {
  const cmd = buildPtyWriteFileCommand('tmp/oai_apply_patch_pass1.html', btoa('hello\n'), '.');
  assert.ok(cmd);
  assert.match(cmd, / \| base64 -d > /);
  assert.equal(isSafePtyWriteFileCommand(cmd, '.'), true);
});

test('isSafePtyWriteFileCommand rejects extra pipes or metachar injection', () => {
  const good = buildPtyWriteFileCommand('a.txt', btoa('x'), '.');
  assert.equal(isSafePtyWriteFileCommand(`${good} | cat`, '.'), false);
  assert.equal(isSafePtyWriteFileCommand(`echo hi; ${good}`, '.'), false);
  assert.equal(isSafePtyWriteFileCommand('echo abc | base64 -d > a.txt; rm -rf /', '.'), false);
});

test('buildPtyWriteFileCommand accepts nested relative paths', () => {
  const cmd = buildPtyWriteFileCommand('tmp/pass1.html', btoa('<html></html>\n'), '.');
  assert.ok(cmd?.startsWith('echo '));
  assert.ok(isSafePtyWriteFileCommand(cmd, '.'));
});
