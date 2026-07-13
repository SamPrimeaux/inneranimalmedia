import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isReadOnlyFileContextIntent,
  isReadOnlyRepoSearchIntent,
  isExplicitGithubCatalogToolIntent,
  extractExplicitCatalogToolKeys,
} from '../../src/core/code-implementation-intent.js';

const G_ASK_REPO_FS =
  'Call fs_read_file once with path package.json. Reply with only the npm package name from the name field.';

const G_ASK_REPO_GH =
  'List the top-level files and folders in the SamPrimeaux/inneranimalmedia repo using agentsam_github_tree. Reply with just the list.';

test('fs_read_file prompt is repo search, not Monaco file-context ask', () => {
  assert.equal(isReadOnlyRepoSearchIntent(G_ASK_REPO_FS), true);
  assert.equal(isReadOnlyFileContextIntent(G_ASK_REPO_FS), false);
});

test('agentsam_github_tree gate prompt is explicit github catalog intent', () => {
  assert.equal(isExplicitGithubCatalogToolIntent(G_ASK_REPO_GH), true);
  assert.deepEqual(extractExplicitCatalogToolKeys(G_ASK_REPO_GH), ['agentsam_github_tree']);
});

test('Monaco describe-this-file still counts as read-only file context', () => {
  const message = 'describe this README in the monaco';
  assert.equal(isReadOnlyFileContextIntent(message), true);
  assert.equal(isReadOnlyRepoSearchIntent(message), false);
});
