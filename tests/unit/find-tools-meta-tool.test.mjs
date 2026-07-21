import assert from 'node:assert/strict';
import {
  isCatalogDiscoveryMetaTool,
  normalizeFindToolsInput,
} from '../../src/core/find-tools-meta-tool.js';

assert.equal(isCatalogDiscoveryMetaTool('agentsam_search_tools'), true);
assert.equal(isCatalogDiscoveryMetaTool('search_tools'), true);
assert.equal(isCatalogDiscoveryMetaTool('find_tools'), true);
assert.equal(isCatalogDiscoveryMetaTool('agentsam_d1_query'), false);

assert.equal(normalizeFindToolsInput({ query: 'github' }).query, 'github');
assert.equal(normalizeFindToolsInput({ q: 'commits' }).query, 'commits');
assert.equal(normalizeFindToolsInput({ search: 'deploy' }).query, 'deploy');
assert.equal(normalizeFindToolsInput({ keyword: 'r2' }).query, 'r2');
assert.equal(
  normalizeFindToolsInput({}, { userMessage: 'Show me the last 5 commits' }).query,
  'Show me the last 5 commits',
);
assert.equal(normalizeFindToolsInput('plain string query').query, 'plain string query');
assert.equal(normalizeFindToolsInput({ intent: 'list repos' }).query, 'list repos');

console.log('find-tools-meta-tool.test.mjs: ok');
