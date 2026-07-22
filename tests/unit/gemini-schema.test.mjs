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

test('sanitizeGeminiParameterSchema expands partial anyOf required branches to OBJECT', () => {
  // agentsam_memory_commit-style schema — Gemini 400 without this fix
  const out = sanitizeGeminiParameterSchema({
    type: 'object',
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
  assert.equal(out.type, 'OBJECT');
  assert.ok(Array.isArray(out.anyOf));
  assert.equal(out.anyOf.length, 3);
  for (const branch of out.anyOf) {
    assert.equal(branch.type, 'OBJECT');
    assert.ok(branch.properties.raw_text);
    assert.ok(branch.properties.content);
    assert.ok(Array.isArray(branch.required));
    assert.ok(branch.required.every((k) => Object.prototype.hasOwnProperty.call(branch.properties, k)));
  }
  assert.deepEqual(out.anyOf[0].required, ['raw_text']);
  assert.deepEqual(out.anyOf[2].required, ['memory_key', 'content']);
});

test('normalizeGeminiTools accepts agentsam_memory_commit anyOf catalog shape', () => {
  const tools = normalizeGeminiTools([
    {
      tool_name: 'agentsam_memory_commit',
      input_schema: {
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
      },
    },
  ]);
  const params = tools[0].function_declarations[0].parameters;
  assert.equal(params.anyOf[0].type, 'OBJECT');
  assert.deepEqual(params.anyOf[0].required, ['raw_text']);
});
