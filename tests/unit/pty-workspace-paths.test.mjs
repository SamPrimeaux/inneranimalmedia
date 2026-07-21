import test from 'node:test';
import assert from 'node:assert/strict';
import { safePtyRepoDirName } from '../../src/core/safe-pty-repo-dir-name.js';

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

test('safePtyRepoDirName returns "." for bare basename matching workspace tail', () => {
  assert.equal(
    safePtyRepoDirName('inneranimalmedia', '/Users/samprimeaux/inneranimalmedia'),
    '.',
  );
});

test('safePtyRepoDirName returns "." for Mac vs Linux same-repo tails', () => {
  assert.equal(
    safePtyRepoDirName('/home/samprimeaux/inneranimalmedia', '/Users/samprimeaux/inneranimalmedia'),
    '.',
  );
  assert.equal(
    safePtyRepoDirName('/Users/samprimeaux/inneranimalmedia', '/home/samprimeaux/inneranimalmedia'),
    '.',
  );
});

test('safePtyRepoDirName still returns child when workspace is true parent', () => {
  assert.equal(
    safePtyRepoDirName('/home/samprimeaux/inneranimalmedia', '/home/samprimeaux'),
    'inneranimalmedia',
  );
});
