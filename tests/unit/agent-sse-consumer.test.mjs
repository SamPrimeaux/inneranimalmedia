import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOpenAiToolStopReason } from '../../src/core/agent-tool-stop-reason.js';
import {
  consumeOpenAIChatCompletionsSse,
  consumeOpenAIResponsesSse,
} from '../../src/core/agent-sse-consumer.js';

function neverClosingSse(...events) {
  let cancelReason = null;
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(events.map((event) => `data: ${event}\n\n`).join('')));
    },
    cancel(reason) {
      cancelReason = reason;
    },
  });
  return { readable, cancelReason: () => cancelReason };
}

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

test('chat completions stop on DONE even when transport stays open', async () => {
  const stream = neverClosingSse(
    JSON.stringify({ choices: [{ delta: { content: 'Ready' }, finish_reason: 'stop' }] }),
    '[DONE]',
  );
  const emitted = [];

  const result = await consumeOpenAIChatCompletionsSse(
    stream.readable,
    (type, payload) => emitted.push({ type, payload }),
  );

  assert.equal(result.text, 'Ready');
  assert.equal(result.finishReason, 'stop');
  assert.equal(stream.cancelReason(), 'sse_terminal_event');
  assert.deepEqual(emitted, [{ type: 'text', payload: { text: 'Ready' } }]);
});

test('responses stop on response.completed even when transport stays open', async () => {
  const stream = neverClosingSse(
    JSON.stringify({ type: 'response.output_text.delta', delta: 'Done' }),
    JSON.stringify({
      type: 'response.completed',
      response: { id: 'resp_1', status: 'completed', output: [], usage: {} },
    }),
  );

  const result = await consumeOpenAIResponsesSse(stream.readable, () => {});

  assert.equal(result.text, 'Done');
  assert.equal(result.responseId, 'resp_1');
  assert.equal(result.finishReason, 'end_turn');
  assert.equal(stream.cancelReason(), 'sse_terminal_event');
});

test('an abort interrupts an outstanding provider read', async () => {
  let cancelReason = null;
  const readable = new ReadableStream({
    cancel(reason) {
      cancelReason = reason;
    },
  });
  const controller = new AbortController();
  const consuming = consumeOpenAIResponsesSse(readable, () => {}, {
    signal: controller.signal,
  });

  controller.abort();

  await assert.rejects(consuming, (error) => error?.name === 'AbortError');
  assert.equal(cancelReason, 'aborted');
});
