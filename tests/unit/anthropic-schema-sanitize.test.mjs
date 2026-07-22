import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeAnthropicToolInputSchema } from '../../src/integrations/anthropic-schema.js';
import { buildAnthropicMessagesTools } from '../../src/integrations/anthropic.js';

test('strips top-level anyOf like agentsam_memory_commit', () => {
  const sanitized = sanitizeAnthropicToolInputSchema({
    type: 'object',
    additionalProperties: false,
    properties: {
      raw_text: { type: 'string' },
      content: { type: 'string' },
      memory_key: { type: 'string' },
    },
    anyOf: [
      { required: ['raw_text'] },
      { required: ['content'] },
      { required: ['memory_key', 'content'] },
    ],
  });
  assert.equal(sanitized.anyOf, undefined);
  assert.equal(sanitized.oneOf, undefined);
  assert.equal(sanitized.allOf, undefined);
  assert.equal(sanitized.type, 'object');
  assert.ok(sanitized.properties.raw_text);
  assert.match(String(sanitized.description || ''), /raw_text|content/);
});

test('keeps nested oneOf under items', () => {
  const sanitized = sanitizeAnthropicToolInputSchema({
    type: 'object',
    properties: {
      files: {
        type: 'array',
        items: { oneOf: [{ type: 'string' }, { type: 'object', properties: { path: { type: 'string' } } }] },
      },
    },
  });
  assert.deepEqual(sanitized.properties.files.items.oneOf.length, 2);
});

test('buildAnthropicMessagesTools sanitizes hydrated catalog schemas', () => {
  const tools = buildAnthropicMessagesTools(
    [
      {
        name: 'agentsam_memory_commit',
        description: 'Commit memory',
        input_schema: {
          type: 'object',
          properties: { raw_text: { type: 'string' }, content: { type: 'string' } },
          anyOf: [{ required: ['raw_text'] }, { required: ['content'] }],
        },
      },
    ],
    { modelKey: 'claude-sonnet-5', features: { anthropic_code_execution: false } },
  );
  const mem = tools.find((t) => t.name === 'agentsam_memory_commit');
  assert.ok(mem);
  assert.equal(mem.input_schema.anyOf, undefined);
});
