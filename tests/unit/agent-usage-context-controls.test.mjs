import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CONSUMED_TOOL_RESULT_CHAR_CAP,
  compactConsumedToolResultsInPlace,
} from '../../src/core/agent-tool-result-compaction.js';
import {
  resolveUsageConversationId,
  usageEventExtraColumnSql,
} from '../../src/core/usage-event-columns.js';

test('consumed tool results retain protocol identity while shedding replay bulk', () => {
  const full = `BEGIN:${'x'.repeat(9000)}:END`;
  const messages = [
    {
      role: 'assistant',
      content: [{ type: 'tool_use', id: 'call_1', name: 'fs_read_file', input: {} }],
    },
    {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'call_1', content: full }],
    },
  ];

  const result = compactConsumedToolResultsInPlace(messages);
  const block = messages[1].content[0];

  assert.equal(result.compactedBlocks, 1);
  assert.ok(result.removedChars > 0);
  assert.equal(block.tool_use_id, 'call_1');
  assert.equal(block.type, 'tool_result');
  assert.ok(block.content.length <= CONSUMED_TOOL_RESULT_CHAR_CAP);
  assert.ok(block.content.startsWith('BEGIN:'));
  assert.ok(block.content.endsWith(':END'));
  assert.match(block.content, /compacted after first model pass/);
});

test('short tool results and non-tool messages remain unchanged', () => {
  const messages = [
    { role: 'user', content: 'keep me' },
    {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'call_2', content: 'small result' }],
    },
  ];

  const result = compactConsumedToolResultsInPlace(messages);

  assert.deepEqual(result, { compactedBlocks: 0, removedChars: 0 });
  assert.equal(messages[0].content, 'keep me');
  assert.equal(messages[1].content[0].content, 'small result');
});

test('usage event optional columns include conversation attribution', () => {
  const extra = usageEventExtraColumnSql(
    new Set(['conversation_id', 'task_type']),
    {
      tokens_in: 10,
      tokens_out: 2,
      conversation_id: 'conv_123',
      task_type: 'agent',
      mode: null,
      reason: null,
    },
  );

  assert.deepEqual(extra.names, ['conversation_id', 'task_type']);
  assert.deepEqual(extra.placeholders, ['?', '?']);
  assert.deepEqual(extra.binds, ['conv_123', 'agent']);
});

test('usage conversation attribution falls back to the in-app session id', () => {
  assert.equal(
    resolveUsageConversationId({
      conversationId: ' ',
      conversation_id: null,
      sessionId: 'session_456',
    }),
    'session_456',
  );
});
