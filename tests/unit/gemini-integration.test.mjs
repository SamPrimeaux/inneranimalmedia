import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGeminiGenerationConfig,
  buildGeminiUrl,
  geminiChunkToOpenAI,
  isVisibleGeminiTextPart,
  parseGeminiResponseText,
  normalizeGeminiTools,
  omitsGeminiSamplingParams,
  resolveGeminiMaxOutputTokens,
  sanitizeGeminiContents,
  sanitizeGeminiParameterSchema,
  toGeminiContents,
} from '../../src/integrations/gemini.js';

test('buildGeminiUrl streaming uses alt=sse and key as separate query params', () => {
  const url = buildGeminiUrl('gemini-3.6-flash', 'test-key-123', { stream: true });
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

test('buildGeminiGenerationConfig omits sampling params for Gemini 3.6 Flash', () => {
  const cfg = buildGeminiGenerationConfig({ mode: 'agent' }, { modelId: 'gemini-3.6-flash' });
  assert.equal(cfg.temperature, undefined);
  assert.equal(cfg.topP, undefined);
  assert.equal(cfg.topK, undefined);
  assert.equal(cfg.thinkingConfig.thinkingLevel, 'medium');
  assert.equal(cfg.maxOutputTokens, 8192);
  assert.equal(omitsGeminiSamplingParams('gemini-3.6-flash'), true);
});

test('buildGeminiGenerationConfig uses minimal thinking for Flash-Lite ask/cheap turns', () => {
  const cfg = buildGeminiGenerationConfig(
    { mode: 'ask', taskType: 'ask' },
    { modelId: 'gemini-3.5-flash-lite' },
  );
  assert.equal(cfg.thinkingConfig.thinkingLevel, 'minimal');
  assert.equal(cfg.temperature, undefined);
});

test('buildGeminiGenerationConfig raises Flash-Lite thinking for agentic tool work', () => {
  const cfg = buildGeminiGenerationConfig(
    { mode: 'agent', taskType: 'agent' },
    { modelId: 'gemini-3.5-flash-lite' },
  );
  assert.equal(cfg.thinkingConfig.thinkingLevel, 'medium');
});

test('resolveGeminiMaxOutputTokens enforces Gemini 3 floor', () => {
  assert.equal(resolveGeminiMaxOutputTokens('gemini-3.6-flash', 2048), 8192);
  assert.equal(resolveGeminiMaxOutputTokens('gemini-3.5-flash-lite', 65536), 65536);
});

test('sanitizeGeminiContents strips trailing model prefills', () => {
  const cleaned = sanitizeGeminiContents([
    { role: 'user', parts: [{ text: 'Translate hi' }] },
    { role: 'model', parts: [{ text: 'Translation:' }] },
  ]);
  assert.equal(cleaned.length, 1);
  assert.equal(cleaned[0].role, 'user');
});

test('sanitizeGeminiParameterSchema strips additionalProperties', () => {
  const out = sanitizeGeminiParameterSchema({
    type: 'object',
    additionalProperties: false,
    properties: {
      path: { type: 'string', additionalProperties: false },
    },
  });
  assert.equal(out.additionalProperties, undefined);
  assert.equal(out.properties.path.additionalProperties, undefined);
  assert.equal(out.type, 'OBJECT');
});

test('normalizeGeminiTools strips additionalProperties from tool declarations', () => {
  const tools = normalizeGeminiTools([{
    name: 'workspace_read_file',
    description: 'Read a workspace file',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
  }]);
  const params = tools[0].function_declarations[0].parameters;
  assert.equal(params.additionalProperties, undefined);
  assert.equal(params.type, 'OBJECT');
  assert.equal(params.properties.path.type, 'STRING');
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

test('toGeminiContents round-trips Anthropic tool_use with thought signatures and response id', () => {
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
  assert.equal(contents[2].parts[0].functionResponse.id, 'call_1');
});

test('toGeminiContents strips trailing model turns (GA prefill ban)', () => {
  const contents = toGeminiContents([
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: 'Hello' },
  ]);
  assert.equal(contents.length, 1);
  assert.equal(contents[0].role, 'user');
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
  assert.equal(contents[1].parts[0].functionResponse.id, 't1');
});
