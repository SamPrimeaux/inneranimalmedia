import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectOpenAiResponsesWsFallback,
  openaiSafetyIdentifier,
  shouldForceOpenAiResponsesWsReconnect,
  withOpenAiResponsesFallbackHeaders,
} from '../../src/integrations/openai-responses-ws.js';

test('openaiSafetyIdentifier hashes user id (not raw au_*)', async () => {
  const a = await openaiSafetyIdentifier('au_871d920d1233cbd1');
  const b = await openaiSafetyIdentifier('au_871d920d1233cbd1');
  const c = await openaiSafetyIdentifier('au_other');
  assert.equal(typeof a, 'string');
  assert.equal(a.length, 64);
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.ok(!a.includes('au_'));
});

test('openaiSafetyIdentifier empty → null', async () => {
  assert.equal(await openaiSafetyIdentifier(''), null);
  assert.equal(await openaiSafetyIdentifier(null), null);
});

test('detectOpenAiResponsesWsFallback recognizes cache miss and socket limit', () => {
  assert.equal(
    detectOpenAiResponsesWsFallback('response.created\nprevious_response_not_found'),
    'previous_response_not_found',
  );
  assert.equal(
    detectOpenAiResponsesWsFallback('websocket_connection_limit_reached'),
    'websocket_connection_limit_reached',
  );
  assert.equal(
    detectOpenAiResponsesWsFallback('{"message":"openai_ws_closed_mid_turn","code":"openai_ws_turn_failed"}'),
    'openai_ws_closed_mid_turn',
  );
  assert.equal(detectOpenAiResponsesWsFallback('response.output_text.delta'), null);
});

test('forced reconnect requires explicit soak signal and an existing response id', () => {
  const headerYes = new Request('https://example.test', {
    headers: { 'X-IAM-OpenAI-WS-Force-Reconnect': '1' },
  });
  const queryYes = new Request('https://example.test?openai_ws_force_reconnect=1');
  const no = new Request('https://example.test');
  assert.equal(shouldForceOpenAiResponsesWsReconnect(headerYes, 'resp_existing'), true);
  assert.equal(shouldForceOpenAiResponsesWsReconnect(queryYes, 'resp_existing'), true);
  assert.equal(shouldForceOpenAiResponsesWsReconnect(headerYes, null), false);
  assert.equal(shouldForceOpenAiResponsesWsReconnect(queryYes, null), false);
  assert.equal(shouldForceOpenAiResponsesWsReconnect(no, 'resp_existing'), false);
});

test('HTTP fallback carries transport, reason, and full-input proof headers', async () => {
  const input = new Response('ok', { status: 200 });
  const out = withOpenAiResponsesFallbackHeaders(
    input,
    'previous_response_not_found',
    true,
  );
  assert.equal(out.headers.get('X-IAM-OpenAI-Transport'), 'http');
  assert.equal(out.headers.get('X-IAM-OpenAI-Fallback-Reason'), 'previous_response_not_found');
  assert.equal(out.headers.get('X-IAM-OpenAI-Full-Input'), '1');
  assert.equal(await out.text(), 'ok');
});
