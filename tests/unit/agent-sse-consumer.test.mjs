import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOpenAiToolStopReason } from '../../src/core/agent-tool-stop-reason.js';

test('tool calls override a provider stop finish reason', () => {
  assert.equal(normalizeOpenAiToolStopReason('stop', 1), 'tool_use');
  assert.equal(normalizeOpenAiToolStopReason(null, 1), 'tool_use');
  assert.equal(normalizeOpenAiToolStopReason('completed', 2), 'tool_use');
});

test('a response without tool calls preserves terminal completion', () => {
  assert.equal(normalizeOpenAiToolStopReason('stop', 0), 'end_turn');
  assert.equal(normalizeOpenAiToolStopReason(null, 0), 'end_turn');
  assert.equal(normalizeOpenAiToolStopReason('length', 0), 'length');
});
