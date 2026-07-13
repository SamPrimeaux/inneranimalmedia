import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isReadOnlyFileContextIntent,
  isReadOnlyRepoSearchIntent,
} from '../../src/core/code-implementation-intent.js';

const G_ASK_REPO =
  'Use fs_read_file path package.json — from the file contents only, what is the npm package name for this repo?';

test('G-ask-repo prompt is repo search via fs_read_file, not Monaco file-context ask', () => {
  assert.equal(isReadOnlyRepoSearchIntent(G_ASK_REPO), true);
  assert.equal(isReadOnlyFileContextIntent(G_ASK_REPO), false);
});

test('Monaco describe-this-file still counts as read-only file context', () => {
  const message = 'describe this README in the monaco';
  assert.equal(isReadOnlyFileContextIntent(message), true);
  assert.equal(isReadOnlyRepoSearchIntent(message), false);
});
