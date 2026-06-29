import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const connectSrc = readFileSync(join(here, '..', '..', 'src', 'api', 'integrations', 'connect.js'), 'utf8');
const githubSrc = readFileSync(join(here, '..', '..', 'src', 'integrations', 'github.js'), 'utf8');
const migrationSrc = readFileSync(
  join(here, '..', '..', 'migrations', '731_github_oauth_scopes_fix.sql'),
  'utf8',
);

describe('github integration connect scopes', () => {
  it('connect.js normalizes legacy github scope aliases before catalog validation', () => {
    assert.match(connectSrc, /GITHUB_OAUTH_SCOPE_ALIASES/);
    assert.match(connectSrc, /'user:read': 'read:user'/);
    assert.match(connectSrc, /githubOAuthScopeSets/);
    assert.match(connectSrc, /slugNorm === 'github'/);
  });

  it('getUserGithubToken falls back to BYOK user_api_keys', () => {
    assert.match(githubSrc, /resolveGithubByokToken/);
    assert.match(githubSrc, /FROM user_api_keys[\s\S]*provider\) = 'github'/);
    assert.match(githubSrc, /return resolveGithubByokToken\(env, uid, account\)/);
  });

  it('migration 731 fixes integration_catalog github oauth scopes', () => {
    assert.match(migrationSrc, /oauth_scopes_default = '\["repo","read:user","user:email"\]'/);
    assert.match(migrationSrc, /read:org/);
  });
});
