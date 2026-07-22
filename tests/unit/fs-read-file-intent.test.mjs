import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isReadOnlyFileContextIntent,
  isReadOnlyRepoSearchIntent,
  isExplicitGithubCatalogToolIntent,
  extractExplicitCatalogToolKeys,
  resolveForcedExplicitCatalogTool,
  buildExplicitCatalogToolInput,
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
  assert.equal(
    resolveForcedExplicitCatalogTool(G_ASK_REPO_GH, [
      { name: 'agentsam_github_tree' },
      { name: 'agentsam_d1_query' },
    ]),
    'agentsam_github_tree',
  );
  assert.equal(resolveForcedExplicitCatalogTool(G_ASK_REPO_GH, [{ name: 'agentsam_d1_query' }]), null);
  assert.deepEqual(buildExplicitCatalogToolInput('agentsam_github_tree', G_ASK_REPO_GH), {
    repo: 'SamPrimeaux/inneranimalmedia',
    recursive: false,
  });
});

test('Monaco describe-this-file still counts as read-only file context', () => {
  const message = 'describe this README in the monaco';
  assert.equal(isReadOnlyFileContextIntent(message), true);
  assert.equal(isReadOnlyRepoSearchIntent(message), false);
});

test('do-not-call skips d1; forces agentsam_search_tools', () => {
  const msg =
    'Do not call agentsam_d1_query. First tool must be agentsam_search_tools with {"keyword":"r2"}.';
  assert.deepEqual(extractExplicitCatalogToolKeys(msg), ['agentsam_search_tools']);
  assert.equal(
    resolveForcedExplicitCatalogTool(msg, [
      { name: 'agentsam_search_tools' },
      { name: 'agentsam_d1_query' },
    ]),
    'agentsam_search_tools',
  );
  assert.equal(buildExplicitCatalogToolInput('agentsam_search_tools', msg).keyword, 'r2');
});

test('search_tools keyword extracts plain English without colon', () => {
  const msg = 'Call agentsam_search_tools with keyword r2. Then pick an R2 list tool.';
  assert.equal(buildExplicitCatalogToolInput('agentsam_search_tools', msg).keyword, 'r2');
  assert.equal(
    buildExplicitCatalogToolInput(
      'agentsam_search_tools',
      'agentsam_search_tools with {"keyword":"deploy"}',
    ).keyword,
    'deploy',
  );
});

test('agentsam_terminal_local named pin + command extract for progressive soak', () => {
  const msg =
    'Use only agentsam_terminal_local. Do not use playwright, search_tools, or sandbox. Command: pwd && whoami && hostname';
  assert.deepEqual(extractExplicitCatalogToolKeys(msg), ['agentsam_terminal_local']);
  assert.equal(
    resolveForcedExplicitCatalogTool(msg, [
      { name: 'agentsam_search_tools' },
      { name: 'agentsam_terminal_local' },
    ]),
    'agentsam_terminal_local',
  );
  assert.equal(
    buildExplicitCatalogToolInput('agentsam_terminal_local', msg).command,
    'pwd && whoami && hostname',
  );
});

test('do-not mid-list skips denied terminal tool', () => {
  const msg =
    'Use agentsam_terminal_local. Do not use agentsam_terminal_sandbox, or playwright. Command: pwd';
  assert.deepEqual(extractExplicitCatalogToolKeys(msg), ['agentsam_terminal_local']);
});
