import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOpenAIMessages, buildOpenAIResponsesInput } from '../../src/integrations/openai.js';

test('buildOpenAIResponsesInput includes input_image parts', () => {
  const input = buildOpenAIResponsesInput([
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Describe this blueprint' },
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: 'abc123' },
        },
      ],
    },
  ], null);
  assert.equal(input.length, 1);
  assert.equal(input[0].role, 'user');
  assert.ok(Array.isArray(input[0].content));
  assert.equal(input[0].content[0].type, 'input_text');
  assert.equal(input[0].content[1].type, 'input_image');
  assert.match(String(input[0].content[1].image_url || ''), /^data:image\/jpeg;base64,abc123/);
});

test('buildOpenAIMessages preserves vision blocks for chat completions', () => {
  const normalized = buildOpenAIMessages('sys', [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Describe this' },
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: 'abc123' },
        },
      ],
    },
  ]);
  const user = normalized.find((m) => m.role === 'user');
  assert.ok(user);
  assert.ok(Array.isArray(user.content));
  assert.equal(user.content[0].type, 'text');
  assert.equal(user.content[1].type, 'image_url');
  assert.match(String(user.content[1].image_url?.url || ''), /^data:image\/png;base64,abc123/);
});

test('buildOpenAIResponsesInput with previousResponseId finds tool_results before trailing text nudge', () => {
  const input = buildOpenAIResponsesInput(
    [
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'call_abc', content: '{"ok":true}' },
          { type: 'tool_result', tool_use_id: 'call_def', content: '{"ok":true}' },
        ],
      },
      {
        role: 'user',
        content: '[System] Open-web search budget exhausted. Answer now.',
      },
    ],
    'resp_previous',
  );
  assert.equal(input.length, 2);
  assert.equal(input[0].type, 'function_call_output');
  assert.equal(input[0].call_id, 'call_abc');
  assert.equal(input[1].call_id, 'call_def');
});
