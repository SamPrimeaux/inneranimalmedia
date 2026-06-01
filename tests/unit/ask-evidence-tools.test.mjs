import test from 'node:test';
import assert from 'node:assert/strict';
import {
  askPinnedEvidenceToolNames,
  augmentAskRouteRequirements,
  askDataPlaneIntent,
  codeContextIntent,
} from '../../src/core/ask-evidence-tools.js';

test('code context pins repo/file read tools', () => {
  const names = askPinnedEvidenceToolNames('where is task_type set before agentsam_agent_run');
  assert.ok(names.includes('fs_search_files'));
  assert.ok(names.includes('github_file'));
  assert.equal(codeContextIntent('where is task_type set before agentsam_agent_run'), true);
});

test('d1 question pins d1_query', () => {
  const names = askPinnedEvidenceToolNames('how many rows in agentsam_plans');
  assert.deepEqual(names.sort(), ['d1_query', 'd1_schema'].sort());
  assert.equal(askDataPlaneIntent('how many rows in agentsam_plans'), true);
});

test('augmentAskRouteRequirements strips generic search for concrete intents', () => {
  const req = augmentAskRouteRequirements('how many rows in agentsam_plans', {
    route_key: 'ask',
    task_type: 'chat',
    allowed_lanes: ['think'],
    required_capabilities: [],
    optional_capabilities: ['knowledge_search', 'memory.search', 'd1.read'],
    blocked_capabilities: [],
    max_tools: 8,
    approval_policy: null,
    source: 'default',
  });
  assert.ok(req.optional_capabilities.includes('d1.read'));
  assert.ok(!req.optional_capabilities.includes('knowledge_search'));
});
