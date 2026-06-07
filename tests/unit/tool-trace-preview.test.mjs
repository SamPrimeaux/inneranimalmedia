import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildToolTraceRequestText,
  countLines,
  detectToolTraceLang,
  highlightToolTraceCode,
  shouldOfferMonacoHandoff,
} from '../../dashboard/lib/toolTracePreview.ts';

test('detectToolTraceLang — json request', () => {
  assert.equal(detectToolTraceLang('{"command":"ls"}'), 'json');
});

test('buildToolTraceRequestText — command fallback', () => {
  const out = buildToolTraceRequestText(
    {
      id: '1',
      toolName: 'agentsam_terminal_local',
      status: 'running',
      lines: [],
      startedAtLabel: '',
    },
    'npm test',
  );
  assert.match(out?.text || '', /"command"/);
  assert.equal(out?.lang, 'json');
});

test('shouldOfferMonacoHandoff — long output', () => {
  const text = Array.from({ length: 12 }, (_, i) => `line ${i}`).join('\n');
  assert.equal(shouldOfferMonacoHandoff(text), true);
  assert.equal(shouldOfferMonacoHandoff('short'), false);
});

test('highlightToolTraceCode escapes html', () => {
  const html = highlightToolTraceCode('<script>alert(1)</script>', 'text');
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test('countLines', () => {
  assert.equal(countLines('a\nb\nc'), 3);
});
