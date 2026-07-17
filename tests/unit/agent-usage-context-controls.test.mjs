import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CONSUMED_TOOL_RESULT_CHAR_CAP,
  compactConsumedToolResultsInPlace,
} from '../../src/core/agent-tool-result-compaction.js';
import {
  clampToolBudgetToRunDeadline,
  raceToolExecutionBudget,
} from '../../src/core/agent-run-deadline.js';
import {
  resolveUsageConversationId,
  usageEventExtraColumnSql,
} from '../../src/core/usage-event-columns.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

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

test('compacted JSON tool results remain valid JSON', () => {
  const full = JSON.stringify({
    rows: Array.from({ length: 200 }, (_, index) => ({
      id: index,
      content: 'x'.repeat(200),
    })),
  });
  const messages = [
    {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'call_json', content: full }],
    },
  ];

  compactConsumedToolResultsInPlace(messages);

  const compacted = JSON.parse(messages[0].content[0].content);
  assert.equal(compacted._compacted.after_first_model_pass, true);
  assert.equal(compacted._compacted.original_chars, full.length);
});

test('tool budgets cannot consume the agent-run completion reserve', () => {
  assert.equal(
    clampToolBudgetToRunDeadline(30_000, {
      runStartedAt: 1_000,
      maxRunMs: 45_000,
      now: 11_000,
    }),
    30_000,
  );
  assert.equal(
    clampToolBudgetToRunDeadline(30_000, {
      runStartedAt: 1_000,
      maxRunMs: 45_000,
      now: 42_000,
    }),
    1_500,
  );
  assert.equal(
    clampToolBudgetToRunDeadline(30_000, {
      runStartedAt: 1_000,
      maxRunMs: 45_000,
      now: 44_000,
    }),
    0,
  );
});

test('generic tool execution is interrupted at its assigned budget', async () => {
  await assert.rejects(
    raceToolExecutionBudget(new Promise(() => {}), 5, 'slow_tool'),
    (error) =>
      error?.code === 'tool_timeout' &&
      error?.tool_name === 'slow_tool' &&
      error?.timeout_ms === 5,
  );
});

test('chat loop persists only the current assistant response', () => {
  const source = readFileSync(join(root, 'src/core/agent-tool-loop.js'), 'utf8');
  assert.match(source, /: extractLastAssistantPlainText\(conversationMessages\);/);
  assert.match(source, /persistChatTurnMessages\(\{ assistantText: summary \}\);/);
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
