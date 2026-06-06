import test from 'node:test';
import assert from 'node:assert/strict';

/** Mirrors shouldShowInlinePresence — kept inline so node tests avoid TS import graph. */
function shouldShowInlinePresence({ showInlinePresence, toolTraceRows }) {
  if (!showInlinePresence) return false;
  if (toolTraceRows.some((r) => r.status === 'running')) return false;
  return true;
}

test('shouldShowInlinePresence hides when tool trace is running', () => {
  assert.equal(
    shouldShowInlinePresence({
      showInlinePresence: true,
      toolTraceRows: [
        { id: '1', toolName: 'agentsam_terminal_local', status: 'running', lines: [], startedAtLabel: '' },
      ],
    }),
    false,
  );
  assert.equal(
    shouldShowInlinePresence({
      showInlinePresence: true,
      toolTraceRows: [
        { id: '1', toolName: 'agentsam_terminal_local', status: 'done', lines: [], startedAtLabel: '' },
      ],
    }),
    true,
  );
});
