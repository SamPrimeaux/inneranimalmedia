import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  filterGithubReposListForUser,
  GITHUB_USER_REPOS_AFFILIATION,
} from '../../src/core/github-repos-list-filter.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');

function repo(owner, slug, permissions = {}) {
  return {
    full_name: `${owner}/${slug}`,
    owner: { login: owner },
    permissions,
  };
}

describe('github tenant isolation', () => {
  it('filterGithubReposListForUser keeps own repos and drops platform org visibility', () => {
    const repos = [
      repo('connordmcneely96', 'my-app', { push: true }),
      repo('SamPrimeaux', 'inneranimalmedia', { pull: true }),
      repo('inneranimalmedia', 'docs', { pull: true }),
      repo('some-org', 'shared-tool', { push: true }),
      repo('some-org', 'read-only', { pull: true }),
    ];
    const filtered = filterGithubReposListForUser(repos, 'connordmcneely96');
    assert.deepEqual(
      filtered.map((r) => r.full_name),
      ['connordmcneely96/my-app', 'some-org/shared-tool'],
    );
  });

  it('filterGithubReposListForUser allowPlatformRepos bypasses filtering', () => {
    const repos = [repo('SamPrimeaux', 'inneranimalmedia')];
    assert.equal(
      filterGithubReposListForUser(repos, 'connordmcneely96', { allowPlatformRepos: true }).length,
      1,
    );
  });

  it('GITHUB_USER_REPOS_AFFILIATION excludes organization_member', () => {
    assert.equal(GITHUB_USER_REPOS_AFFILIATION, 'owner,collaborator');
  });

  it('githubReposCacheKey scopes cache by user id (source contract)', () => {
    const src = readFileSync(join(repoRoot, 'src/integrations/github.js'), 'utf8');
    assert.match(src, /githubReposCacheKey\(userId/);
    assert.match(src, /github:repos:v2:\$\{uid\}/);
  });

  it('handleGithubReposList uses private no-store responses and token identity check', () => {
    const src = readFileSync(join(repoRoot, 'src/integrations/github.js'), 'utf8');
    assert.match(src, /githubPrivateResponse/);
    assert.match(src, /assertGitHubTokenOwner/);
    assert.match(src, /resolveIntegrationUserId/);
    assert.match(src, /filterGithubReposListForUser/);
    assert.match(src, /GITHUB_USER_REPOS_AFFILIATION/);
  });

  it('dashboard git/branches uses user-scoped core/github-token (not App fallback)', () => {
    const src = readFileSync(join(repoRoot, 'src/api/dashboard.js'), 'utf8');
    assert.match(src, /from '\.\.\/core\/github-token\.js'/);
    assert.doesNotMatch(src, /resolveGitHubToken.*integrations\/github/);
  });

  it('githubCommitHandshake uses user OAuth only (no App fallback)', () => {
    const src = readFileSync(join(repoRoot, 'src/integrations/github.js'), 'utf8');
    assert.match(src, /resolveUserGitHubToken/);
    assert.doesNotMatch(src, /resolveGitHubTokenWithAppFallback/);
  });

  it('settings github section scopes index jobs and audit log by user_id', () => {
    const src = readFileSync(join(repoRoot, 'src/api/settings-sections.js'), 'utf8');
    assert.match(src, /agentsam_code_index_job WHERE user_id = \?/);
    assert.match(src, /integration_audit_log[\s\S]*WHERE user_id = \?/);
  });

  it('oauth token upsert canonicalizes user_id and clears github repos cache', () => {
    const store = readFileSync(join(repoRoot, 'src/core/oauth-token-store.js'), 'utf8');
    assert.match(store, /resolveIntegrationUserId/);
    assert.match(store, /invalidateGithubReposSessionCache/);
  });

  it('github-worker uses getUserGithubToken with canonical user id', () => {
    const src = readFileSync(join(repoRoot, 'src/tools/builtin/github-worker.js'), 'utf8');
    assert.match(src, /getUserGithubToken/);
    assert.match(src, /resolveIntegrationUserId/);
    assert.doesNotMatch(src, /getIntegrationToken/);
  });

  it('login github callback uses resolveIntegrationUserId for connect path', () => {
    const src = readFileSync(join(repoRoot, 'src/api/oauth-login-callbacks.js'), 'utf8');
    assert.match(src, /resolveIntegrationUserId\(env, sessionUser\)/);
  });
});
