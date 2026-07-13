import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeGeminiTools,
  sanitizeGeminiParameterSchema,
} from '../../src/integrations/gemini-schema.js';

test('sanitizeGeminiParameterSchema strips x-google-enum-descriptions and other x-* keys', () => {
  const out = sanitizeGeminiParameterSchema({
    type: 'object',
    properties: {
      label: {
        type: 'string',
        enum: ['INBOX', 'UNREAD'],
        'x-google-enum-descriptions': ['Primary inbox', 'Unread'],
      },
      nested: {
        type: 'object',
        'x-vendor-meta': { foo: 1 },
        properties: {
          id: { type: 'string', 'x-internal': true },
        },
      },
    },
  });
  assert.equal(out.properties.label['x-google-enum-descriptions'], undefined);
  assert.deepEqual(out.properties.label.enum, ['INBOX', 'UNREAD']);
  assert.equal(out.properties.nested['x-vendor-meta'], undefined);
  assert.equal(out.properties.nested.properties.id['x-internal'], undefined);
  assert.equal(out.properties.nested.properties.id.type, 'STRING');
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

test('sanitizeGeminiParameterSchema injects items for bare array properties', () => {
  const out = sanitizeGeminiParameterSchema({
    type: 'object',
    properties: {
      references: { type: 'array' },
      tags: { type: 'array', items: { type: 'string' } },
    },
  });
  assert.equal(out.properties.references.type, 'ARRAY');
  assert.deepEqual(out.properties.references.items, { type: 'STRING' });
  assert.equal(out.properties.tags.items.type, 'STRING');
});

test('normalizeGeminiTools strips additionalProperties from tool declarations', () => {
  const tools = normalizeGeminiTools([
    {
      name: 'workspace_read_file',
      description: 'Read a workspace file',
      input_schema: {
        type: 'object',
        additionalProperties: false,
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    },
  ]);
  const params = tools[0].function_declarations[0].parameters;
  assert.equal(params.additionalProperties, undefined);
  assert.equal(params.type, 'OBJECT');
  assert.equal(params.properties.path.type, 'STRING');
});
