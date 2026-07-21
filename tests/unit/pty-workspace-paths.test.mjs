import test from 'node:test';
import assert from 'node:assert/strict';
import { safePtyRepoDirName } from '../../src/core/pty-workspace-paths.js';

test('safePtyRepoDirName returns "." when workspace_root is the repo', () => {
  const root = '/Users/samprimeaux/inneranimalmedia';
  assert.equal(safePtyRepoDirName(root, root), '.');
});

test('safePtyRepoDirName returns child folder when workspace is parent', () => {
  assert.equal(
    safePtyRepoDirName('/Users/samprimeaux/inneranimalmedia', '/Users/samprimeaux'),
    'inneranimalmedia',
  );
});

test('safePtyRepoDirName does not invent a nested cd for empty root', () => {
  assert.equal(safePtyRepoDirName('', '/Users/samprimeaux/inneranimalmedia'), '.');
});
