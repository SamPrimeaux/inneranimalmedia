import assert from 'node:assert/strict';
import test from 'node:test';

import { withAbortableAgentRunTimeout } from '../../src/core/agent-run-timeout.js';

test('agent run deadline aborts linked provider work with typed timeout', async () => {
  const controller = new AbortController();
  let providerObservedAbort = false;

  await assert.rejects(
    withAbortableAgentRunTimeout(
      () =>
        new Promise((_, reject) => {
          controller.signal.addEventListener(
            'abort',
            () => {
              providerObservedAbort = true;
              reject(controller.signal.reason);
            },
            { once: true },
          );
        }),
      10,
      controller,
    ),
    (error) =>
      error?.name === 'TimeoutError' &&
      error?.code === 'agent_run_timeout' &&
      error?.message === 'agent_run_timeout',
  );

  assert.equal(controller.signal.aborted, true);
  assert.equal(providerObservedAbort, true);
  assert.equal(controller.signal.reason?.code, 'agent_run_timeout');
});

test('completed agent run does not abort its provider signal', async () => {
  const controller = new AbortController();
  const result = await withAbortableAgentRunTimeout(
    async () => 'complete',
    50,
    controller,
  );

  assert.equal(result, 'complete');
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(controller.signal.aborted, false);
});
