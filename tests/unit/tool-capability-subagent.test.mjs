import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterToolsForCapabilityDecision,
  inferAgentManagementIntent,
} from '../../src/core/tool-capability-filter.js';

test('inferAgentManagementIntent matches /create-subagent slash command', () => {
  assert.equal(
    inferAgentManagementIntent(
      '/create-subagent Help me set up a custom subagent for my workspace.',
    ),
    true,
  );
});

test('create-subagent message prefers agentsam subagent tools over d1_query', async () => {
  const env = {
    DB: {
      prepare() {
        return {
          bind() {
            return { async all() { return { results: [] }; } };
          },
        };
      },
    },
  };
  const tools = [
    { name: 'agentsam_d1_query', description: 'D1' },
    { name: 'agentsam_create_subagent', description: 'Create' },
    { name: 'github_list_repos', description: 'GitHub' },
  ];
  const msg =
    '/create-subagent Help me set up a custom subagent for my workspace. Suggest what kinds of subagents would be useful.';
  const out = await filterToolsForCapabilityDecision(env, tools, {}, msg, { requestedMode: 'agent' });
  const names = out.map((t) => t.name);
  assert.ok(names.includes('agentsam_create_subagent'));
  assert.ok(!names.includes('agentsam_d1_query'));
});
