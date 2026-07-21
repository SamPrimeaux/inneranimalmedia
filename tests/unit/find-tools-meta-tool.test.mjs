import assert from 'node:assert/strict';
import {
  isCatalogDiscoveryMetaTool,
  normalizeFindToolsInput,
  discoverySearchTerms,
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

const phraseTerms = discoverySearchTerms({
  query: 'GitHub list commits repository branch',
  intent: 'Show last 5 commits on main branch for active GitHub repository',
  q: 'github commits',
  search: 'github commits',
});
assert.ok(phraseTerms.includes('github'), String(phraseTerms));
assert.ok(phraseTerms.includes('commits'), String(phraseTerms));
assert.ok(!phraseTerms.includes('show'), String(phraseTerms));
assert.ok(!phraseTerms.some((t) => t.includes(' ')), 'terms must be single tokens');

console.log('find-tools-meta-tool.test.mjs: ok');
