#!/usr/bin/env node
/**
 * Gate 1b fixture — empty commands:[] must yield durable non-success and suppress
 * inventable assistant text that follows in the same Responses SSE stream.
 *
 *   node scripts/gate1b-empty-shell-fixture.mjs
 */
import { ReadableStream } from 'node:stream/web';
import { consumeOpenAIResponsesSse } from '../src/core/agent-sse-consumer.js';

function sseEvent(obj) {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

function buildEmptyShellStream() {
  const chunks = [
    sseEvent({ type: 'response.created', response: { id: 'resp_fixture_empty_shell' } }),
    sseEvent({
      type: 'response.output_item.added',
      item: {
        type: 'shell_call',
        call_id: 'call_empty_1',
        status: 'completed',
        action: { commands: [] },
      },
    }),
    // Inventable fabrication that historically leaked into the UI.
    sseEvent({
      type: 'response.output_text.delta',
      delta: "ls: cannot access '.scratch/': No such file or directory\n",
    }),
    sseEvent({
      type: 'response.completed',
      response: {
        id: 'resp_fixture_empty_shell',
        status: 'completed',
        output: [],
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    }),
  ];
  return new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
}

async function main() {
  /** @type {Array<Record<string, unknown>>} */
  const emitted = [];
  const parsed = await consumeOpenAIResponsesSse(buildEmptyShellStream(), (type, payload) => {
    emitted.push({ type, ...(payload && typeof payload === 'object' ? payload : { payload }) });
  });

  const shellCalls = (parsed.hostedShellEvents || []).filter((e) => e.type === 'shell_call');
  const toolResults = emitted.filter((e) => e.type === 'tool_result' || e.type === 'tool_output');
  const textEmits = emitted.filter((e) => e.type === 'text');
  const failed = toolResults.filter((e) => e.ok === false);
  const hasEmptyMsg = toolResults.some((e) =>
    String(e.result || e.output || '').includes('empty_hosted_shell_commands'),
  );
  const fabricatedInText =
    String(parsed.text || '').includes('cannot access') ||
    textEmits.some((e) => String(e.text || '').includes('cannot access'));

  const report = {
    gate: '1b',
    kind: 'fixture',
    empty_shell_calls: shellCalls.length,
    empty_flag: shellCalls[0]?.empty === true,
    durable_non_success: failed.length > 0 && hasEmptyMsg,
    invented_text_suppressed: !fabricatedInText,
    suppressed_chars: parsed.suppressedInventableTextChars || 0,
    text_emits: textEmits.length,
    parsed_text: String(parsed.text || '').slice(0, 200),
    ok: Boolean(
      shellCalls.length === 1 &&
        shellCalls[0]?.empty === true &&
        failed.length > 0 &&
        hasEmptyMsg &&
        !fabricatedInText &&
        Number(parsed.suppressedInventableTextChars || 0) > 0,
    ),
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
