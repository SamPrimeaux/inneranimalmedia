import assert from 'node:assert/strict';
import {
  normalizeGithubOwnerRepo,
  formatProjectClientBindingsBlock,
} from '../../src/core/project-session-context.js';

assert.equal(normalizeGithubOwnerRepo('SamPrimeaux/companionscpas'), 'SamPrimeaux/companionscpas');
assert.equal(
  normalizeGithubOwnerRepo('https://github.com/SamPrimeaux/companionscpas'),
  'SamPrimeaux/companionscpas',
);
assert.equal(
  normalizeGithubOwnerRepo('https://github.com/SamPrimeaux/companionscpas.git'),
  'SamPrimeaux/companionscpas',
);
assert.equal(normalizeGithubOwnerRepo(''), '');

const block = formatProjectClientBindingsBlock({
  workspaceId: 'ws_companionscpas',
  slug: 'companionscpas',
  workerName: 'companionscpas',
  deployUrl: 'https://companionsofcaddo.org',
  d1DatabaseId: 'fd6dd6fb-156b-4b6a-8ff0-505422652391',
  d1Binding: 'DB',
  r2Bucket: 'companionscpas',
  githubRepo: 'SamPrimeaux/companionscpas',
  rootPath: '/Users/samprimeaux/companionscpas',
});
assert.match(block, /github_repo: SamPrimeaux\/companionscpas/);
assert.match(block, /do not ask the user for a repo URL/i);

console.log('project-session-context.test.mjs: ok');
