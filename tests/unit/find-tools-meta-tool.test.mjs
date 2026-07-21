import assert from 'node:assert/strict';
import {
  isCatalogDiscoveryMetaTool,
  normalizeFindToolsInput,
  discoverySearchTerms,
  scoreCatalogToolRow,
} from '../../src/core/find-tools-meta-tool.js';

assert.equal(isCatalogDiscoveryMetaTool('agentsam_search_tools'), true);
assert.equal(isCatalogDiscoveryMetaTool('search_tools'), true);
assert.equal(isCatalogDiscoveryMetaTool('find_tools'), true);
assert.equal(isCatalogDiscoveryMetaTool('agentsam_d1_query'), false);

assert.equal(normalizeFindToolsInput({ query: 'github' }).query, 'github');
assert.equal(normalizeFindToolsInput({ q: 'commits' }).query, 'commits');
assert.equal(
  normalizeFindToolsInput({}, { userMessage: 'Show me the last 5 commits' }).query,
  'Show me the last 5 commits',
);

const phrases = [
  'list github commits',
  'github commits',
  'agentsam_github_list_commits',
  'Show me the last 5 commits on the main branch of inneranimalmedia',
  'GitHub list commits repository branch',
  'list commits',
  'commits main branch',
];

const catalog = [
  { tool_key: 'agentsam_github_list_commits', description: 'List commits for a GitHub repo' },
  { tool_key: 'agentsam_github_tree', description: 'List repository tree' },
  { tool_key: 'agentsam_github_mcp_actions_list', description: 'List GitHub Actions via MCP' },
  { tool_key: 'agentsam_github_mcp_list_code_scanning_alerts', description: 'List code scanning alerts' },
  { tool_key: 'agentsam_github_mcp_list_secret_scanning_alerts', description: 'List secret scanning alerts' },
  { tool_key: 'agentsam_github_mcp_list_dependabot_alerts', description: 'List dependabot alerts' },
  { tool_key: 'agentsam_github_commit_tree', description: 'Commit a file tree' },
  { tool_key: 'agentsam_github_repo_list', description: 'List GitHub repositories' },
  { tool_key: 'search_web', description: 'Search the public web' },
];

for (const phrase of phrases) {
  const terms = discoverySearchTerms(normalizeFindToolsInput({ query: phrase }));
  assert.ok(terms.length >= 1, `terms for: ${phrase}`);
  // No stopword deny-list: filler words may remain; ranking must still prefer list_commits.
  const ranked = catalog
    .map((row) => ({ tool_key: row.tool_key, score: scoreCatalogToolRow(row, terms) }))
    .sort((a, b) => b.score - a.score);
  const top = ranked[0]?.tool_key;
  assert.equal(
    top,
    'agentsam_github_list_commits',
    `phrase=${JSON.stringify(phrase)} terms=${JSON.stringify(terms)} ranked=${JSON.stringify(ranked.slice(0, 4))}`,
  );
}

console.log('find-tools-meta-tool.test.mjs: ok');
