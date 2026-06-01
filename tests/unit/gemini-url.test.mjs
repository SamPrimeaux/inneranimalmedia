import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGeminiUrl } from '../../src/integrations/gemini.js';

test('buildGeminiUrl streaming uses alt=sse and key as separate query params', () => {
  const url = buildGeminiUrl('gemini-2.5-flash', 'test-key-123', { stream: true });
  const u = new URL(url);
  assert.equal(u.searchParams.get('alt'), 'sse');
  assert.equal(u.searchParams.get('key'), 'test-key-123');
  assert.ok(u.pathname.endsWith(':streamGenerateContent'));
  assert.ok(!String(u.search).includes('sse?key='), 'key must not be appended to alt value');
});

test('buildGeminiUrl non-streaming omits alt', () => {
  const url = buildGeminiUrl('gemini-2.5-flash', 'test-key-123', { stream: false });
  const u = new URL(url);
  assert.equal(u.searchParams.get('alt'), null);
  assert.equal(u.searchParams.get('key'), 'test-key-123');
  assert.ok(u.pathname.endsWith(':generateContent'));
});
