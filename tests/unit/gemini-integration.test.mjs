import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGeminiGenerationConfig,
  buildGeminiUrl,
  geminiChunkToOpenAI,
  isVisibleGeminiTextPart,
  parseGeminiResponseText,
  resolveGeminiMaxOutputTokens,
  toGeminiContents,
} from '../../src/integrations/gemini.js';

test('buildGeminiUrl streaming uses alt=sse and key as separate query params', () => {
  const url = buildGeminiUrl('gemini-3.5-flash', 'test-key-123', { stream: true });
  const u = new URL(url);
  assert.equal(u.searchParams.get('alt'), 'sse');
  assert.equal(u.searchParams.get('key'), 'test-key-123');
  assert.ok(u.pathname.endsWith(':streamGenerateContent'));
});

test('parseGeminiResponseText keeps text when thoughtSignature is present', () => {
  const text = parseGeminiResponseText({
    candidates: [{
      content: {
        parts: [{ text: 'pong', thoughtSignature: 'sig123' }],
      },
    }],
  });
  assert.equal(text, 'pong');
});

test('isVisibleGeminiTextPart excludes internal thought summaries only', () => {
  assert.equal(isVisibleGeminiTextPart({ text: 'hello' }), true);
  assert.equal(isVisibleGeminiTextPart({ text: 'hello', thoughtSignature: 'sig' }), true);
  assert.equal(isVisibleGeminiTextPart({ text: 'thinking', thought: true }), false);
});

test('buildGeminiGenerationConfig uses Gemini 3 defaults', () => {
  const cfg = buildGeminiGenerationConfig({ mode: 'agent' }, { modelId: 'gemini-3.5-flash' });
  assert.equal(cfg.temperature, 1.0);
  assert.equal(cfg.thinkingConfig.thinkingLevel, 'medium');
  assert.equal(cfg.maxOutputTokens, 8192);
});

test('buildGeminiGenerationConfig uses low thinking for ask-like turns on Gemini 3', () => {
  const cfg = buildGeminiGenerationConfig(
    { mode: 'ask', taskType: 'ask' },
    { modelId: 'gemini-3.5-flash' },
  );
  assert.equal(cfg.thinkingConfig.thinkingLevel, 'low');
});

test('resolveGeminiMaxOutputTokens enforces Gemini 3 floor', () => {
  assert.equal(resolveGeminiMaxOutputTokens('gemini-3.5-flash', 2048), 8192);
  assert.equal(resolveGeminiMaxOutputTokens('gemini-3.5-flash', 65536), 65536);
});

test('geminiChunkToOpenAI forwards thought signatures on tool calls', () => {
  const chunks = geminiChunkToOpenAI(JSON.stringify({
    candidates: [{
      content: {
        parts: [{
          functionCall: { name: 'get_weather', args: { city: 'Tokyo' }, id: 'abc' },
          thoughtSignature: 'sig-weather',
        }],
      },
    }],
  }));
  assert.equal(chunks.length, 1);
  const tc = chunks[0].choices[0].delta.tool_calls[0];
  assert.equal(tc.function.name, 'get_weather');
  assert.equal(tc.function.gemini_thought_signature, 'sig-weather');
});

test('toGeminiContents round-trips Anthropic tool_use with thought signatures', () => {
  const contents = toGeminiContents([
    { role: 'user', content: 'Weather?' },
    {
      role: 'assistant',
      content: [{
        type: 'tool_use',
        id: 'call_1',
        name: 'get_weather',
        input: { city: 'Tokyo' },
        gemini_thought_signature: 'sig-weather',
      }],
    },
    {
      role: 'user',
      content: [{
        type: 'tool_result',
        tool_use_id: 'call_1',
        content: '{"temp":"72F"}',
      }],
    },
  ]);

  assert.equal(contents.length, 3);
  assert.equal(contents[1].role, 'model');
  assert.equal(contents[1].parts[0].functionCall.name, 'get_weather');
  assert.equal(contents[1].parts[0].thoughtSignature, 'sig-weather');
  assert.equal(contents[2].parts[0].functionResponse.name, 'get_weather');
});

test('toGeminiContents maps user tool_result blocks to functionResponse', () => {
  const contents = toGeminiContents([
    {
      role: 'assistant',
      content: [{ type: 'tool_use', id: 't1', name: 'd1_query', input: { sql: 'select 1' } }],
    },
    {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 't1', content: '{"ok":true}' }],
    },
  ]);
  assert.equal(contents[1].parts[0].functionResponse.name, 'd1_query');
});
