import assert from 'node:assert/strict';
import {
  modeUsesProgressiveToolDiscovery,
  modeSkipsToolPolicyAllowlist,
  isAgentsamSearchToolsName,
  extractToolKeysFromSearchToolsResult,
  PROGRESSIVE_CORE_TOOL_KEYS,
} from '../../src/core/progressive-tool-discovery.js';

assert.equal(modeUsesProgressiveToolDiscovery('agent'), true);
assert.equal(modeUsesProgressiveToolDiscovery('debug'), true);
assert.equal(modeUsesProgressiveToolDiscovery('multitask'), true);
assert.equal(modeUsesProgressiveToolDiscovery('ask'), false);
assert.equal(modeUsesProgressiveToolDiscovery('plan'), false);
assert.equal(modeSkipsToolPolicyAllowlist('agent'), true);
assert.equal(modeSkipsToolPolicyAllowlist('ask'), false);

assert.equal(isAgentsamSearchToolsName('agentsam_search_tools'), true);
assert.equal(isAgentsamSearchToolsName('search_tools'), true);
assert.equal(isAgentsamSearchToolsName('agentsam_d1_query'), false);

assert.ok(PROGRESSIVE_CORE_TOOL_KEYS.includes('agentsam_search_tools'));
assert.equal(PROGRESSIVE_CORE_TOOL_KEYS.includes('agentsam_d1_query'), false);
assert.ok(PROGRESSIVE_CORE_TOOL_KEYS.length <= 8);

assert.deepEqual(
  extractToolKeysFromSearchToolsResult({
    rows: [
      { tool_key: 'agentsam_worker_deploy', display_name: 'Deploy' },
      { tool_name: 'agentsam_d1_write' },
      { tool_key: 'agentsam_worker_deploy' },
    ],
  }),
  ['agentsam_worker_deploy', 'agentsam_d1_write'],
);

assert.deepEqual(
  extractToolKeysFromSearchToolsResult(
    JSON.stringify({ results: [{ name: 'agentsam_r2_put' }] }),
  ),
  ['agentsam_r2_put'],
);

{
  const { hydrateActiveToolsFromSearchResult } = await import(
    '../../src/core/progressive-tool-discovery.js'
  );
  // preferKeys prepend even when search ranking omits the exact key
  const fakeEnv = {
    DB: {
      prepare() {
        return {
          bind() {
            return {
              async all() {
                return {
                  results: [
                    {
                      tool_name: 'agentsam_github_list_commits',
                      tool_key: 'agentsam_github_list_commits',
                      description: 'List commits',
                      input_schema: '{"type":"object"}',
                      tool_category: 'github',
                      requires_approval: 0,
                    },
                  ],
                };
              },
            };
          },
        };
      },
    },
  };
  const core = [{ name: 'agentsam_search_tools', description: 'search', input_schema: {} }];
  const out = await hydrateActiveToolsFromSearchResult(
    fakeEnv,
    core,
    { tools: [{ tool_key: 'agentsam_github_mcp_list_notifications' }] },
    { preferKeys: ['agentsam_github_list_commits'] },
  );
  assert.ok(out.added.includes('agentsam_github_list_commits'));
  assert.equal(out.added[0], 'agentsam_github_list_commits');
}

console.log('progressive-tool-discovery.test.mjs: ok');
