import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseGithubCloneRef,
  resolveGithubCloneParentDir,
  parseCloneShellResult,
} from '../../src/core/github-clone-parse.js';

test('parseGithubCloneRef — clone command and github URLs', () => {
  assert.equal(
    parseGithubCloneRef('clone https://github.com/SamPrimeaux/agentsam-sdk.git'),
    'SamPrimeaux/agentsam-sdk',
  );
  assert.equal(parseGithubCloneRef('SamPrimeaux/agentsam-sdk'), 'SamPrimeaux/agentsam-sdk');
  assert.equal(
    parseGithubCloneRef('git@github.com:SamPrimeaux/agentsam-sdk.git'),
    'SamPrimeaux/agentsam-sdk',
  );
  assert.equal(parseGithubCloneRef('not-a-repo'), null);
});

test('resolveGithubCloneParentDir — lane parents', () => {
  assert.equal(resolveGithubCloneParentDir(true, null, null), '/home/samprimeaux/repos');
  assert.equal(resolveGithubCloneParentDir(false, '/Users/sam/Projects', null), '/Users/sam/Projects');
  assert.equal(resolveGithubCloneParentDir(false, null, '/Users/sam/Projects/foo'), '/Users/sam/Projects');
});

test('parseCloneShellResult — markers', () => {
  assert.deepEqual(parseCloneShellResult('done\nCLONE_OK:/home/sam/repos/agentsam-sdk\n'), {
    ok: true,
    repoPath: '/home/sam/repos/agentsam-sdk',
  });
  assert.deepEqual(parseCloneShellResult('CLONE_ERR:path_exists:/tmp/x'), {
    ok: false,
    error: 'path_exists',
    repoPath: '/tmp/x',
  });
});
