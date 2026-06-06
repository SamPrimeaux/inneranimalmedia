import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CREATE_SUBAGENT_KICKOFF_QUESTION,
  CREATE_SUBAGENT_TOOL_NAME,
  buildCreateSubagentFlowSystemPromptLine,
  pickCreateSubagentTools,
  resolveCreateSubagentFlow,
} from '../../src/core/create-subagent-flow.js';

test('resolveCreateSubagentFlow kickoff on slash-only turn', () => {
  const out = resolveCreateSubagentFlow([{ role: 'user', content: '/create-subagent' }]);
  assert.deepEqual(out, { active: true, phase: 'kickoff' });
});

test('resolveCreateSubagentFlow execute after clarifying question', () => {
  const out = resolveCreateSubagentFlow([
    { role: 'user', content: '/create-subagent' },
    { role: 'assistant', content: CREATE_SUBAGENT_KICKOFF_QUESTION },
    { role: 'user', content: 'Help me review HVAC service pages before publish.' },
  ]);
  assert.deepEqual(out, { active: true, phase: 'execute' });
});

test('resolveCreateSubagentFlow inactive after follow-up chatter', () => {
  const out = resolveCreateSubagentFlow([
    { role: 'user', content: '/create-subagent' },
    { role: 'assistant', content: CREATE_SUBAGENT_KICKOFF_QUESTION },
    { role: 'user', content: 'HVAC reviewer' },
    { role: 'assistant', content: 'Created subagent site-helper.' },
    { role: 'user', content: 'Thanks' },
  ]);
  assert.deepEqual(out, { active: false, phase: null });
});

test('buildCreateSubagentFlowSystemPromptLine forbids probing on kickoff', () => {
  const line = buildCreateSubagentFlowSystemPromptLine('kickoff');
  assert.match(line, /Do NOT call tools/i);
  assert.match(line, /What do you want this subagent to do\?/);
});

test('pickCreateSubagentTools returns create tool only', () => {
  const out = pickCreateSubagentTools([
    { name: 'agentsam_d1_query' },
    { name: 'agentsam_create_subagent', description: 'Create' },
    { name: 'github_read_dir' },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, CREATE_SUBAGENT_TOOL_NAME);
});

test('pickCreateSubagentTools synthesizes stub when manifest missing', () => {
  const out = pickCreateSubagentTools([{ name: 'github_read_dir' }]);
  assert.deepEqual(out, [{ name: CREATE_SUBAGENT_TOOL_NAME }]);
});

test('buildCreateSubagentFlowSystemPromptLine execute uses create tool only', () => {
  const line = buildCreateSubagentFlowSystemPromptLine('execute');
  assert.match(line, new RegExp(CREATE_SUBAGENT_TOOL_NAME));
  assert.match(line, /Do NOT list or get existing subagents/i);
});
