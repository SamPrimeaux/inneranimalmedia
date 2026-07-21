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

console.log('progressive-tool-discovery.test.mjs: ok');
