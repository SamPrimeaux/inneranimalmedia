import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateToolCapabilities,
  loadToolCapabilities,
  normalizeCapabilityPolicy,
} from '../../src/core/tool-capability-policy.js';
import {
  ABSOLUTE_TOOL_RESULT_BYTES,
  applyToolResultPolicy,
} from '../../src/core/tool-result-policy.js';

const askPolicy = {
  version: 2,
  deny_capabilities: [],
  allow_mutating_capabilities: [],
  require_approval_capabilities: [],
};

test('agentsam_d1_write resolves to d1.write through the capability relation', async () => {
  const env = {
    DB: {
      prepare() {
        return {
          bind() {
            return {
              async all() {
                return {
                  results: [{
                    capability_key: 'd1.write',
                    requirement_type: 'required',
                    is_primary: 1,
                    operations_json: null,
                    is_mutating: 1,
                  }],
                };
              },
            };
          },
        };
      },
    },
  };
  const capabilities = await loadToolCapabilities(
    env,
    { id: 'ast_d1_write', tool_key: 'agentsam_d1_write' },
    {},
  );
  assert.deepEqual(capabilities.map((row) => row.capability_key), ['d1.write']);
});

test('aliases use the canonical row capabilities and composites require every capability', () => {
  const capabilities = [
    { capability_key: 'file.read', is_mutating: 0 },
    { capability_key: 'file.write', is_mutating: 1 },
  ];
  const denied = evaluateToolCapabilities({
    toolRow: { id: 'ast_scan_fix', risk_level: 'high' },
    capabilities,
    writePolicy: askPolicy,
  });
  assert.equal(denied.decision, 'deny');
  assert.deepEqual(denied.capabilities, ['file.read', 'file.write']);

  const allowed = evaluateToolCapabilities({
    toolRow: { id: 'ast_scan_fix', risk_level: 'high' },
    capabilities,
    writePolicy: { ...askPolicy, allow_mutating_capabilities: ['file.write'] },
  });
  assert.equal(allowed.decision, 'allow');
});

test('Ask denies mutation capabilities without any tool-name list', () => {
  for (const capability_key of ['d1.write', 'terminal.execute', 'file.write', 'cloudflare.deploy']) {
    const decision = evaluateToolCapabilities({
      toolRow: { id: `tool_${capability_key}`, risk_level: 'low' },
      capabilities: [{ capability_key, is_mutating: 1 }],
      writePolicy: askPolicy,
    });
    assert.equal(decision.decision, 'deny', capability_key);
  }
});

test('a newly classified tool follows policy and unclassified mutations fail closed', () => {
  const classified = evaluateToolCapabilities({
    toolRow: { id: 'future_tool', risk_level: 'low' },
    capabilities: [{ capability_key: 'media.transform', is_mutating: 1 }],
    writePolicy: { ...askPolicy, allow_mutating_capabilities: ['media.transform'] },
  });
  assert.equal(classified.decision, 'allow');

  const unclassified = evaluateToolCapabilities({
    toolRow: { id: 'unknown_mutation', risk_level: 'high', requires_approval: 1 },
    capabilities: [],
    writePolicy: askPolicy,
  });
  assert.equal(unclassified.decision, 'deny');
  assert.equal(unclassified.unclassified_mutation, true);
});

test('legacy policies normalize to capability permissions without tool keys', () => {
  const normalized = normalizeCapabilityPolicy({ can_d1_write: true, can_terminal: false });
  assert.equal(normalized.source, 'legacy_compat');
  assert.ok(normalized.allow_mutating_capabilities.includes('d1.write'));
  assert.ok(!normalized.allow_mutating_capabilities.includes('terminal.execute'));
});

const memoryPolicy = {
  version: 1,
  operations: {
    search: {
      collection_field: 'results',
      count_field: 'count',
      max_items: 10,
      root_fields: ['operation', 'results', 'count', 'tier'],
      item_fields: ['key', 'summary', 'memory_type', 'tags', 'source', 'updated_at'],
      item_field_char_limits: { summary: 600 },
      max_serialized_bytes: 16384,
    },
    read: {
      collection_field: 'found',
      max_items: 10,
      root_fields: ['operation', 'found', 'missing'],
      item_fields: ['key', 'value', 'memory_type', 'tags', 'source', 'updated_at'],
      item_field_char_limits: { value: 4000 },
      max_serialized_bytes: 49152,
    },
  },
};

const memorySchema = {
  oneOf: [
    {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['search'] },
        results: { type: 'array', maxItems: 10, items: { type: 'object' } },
        count: { type: 'integer' },
        tier: { type: 'string' },
      },
      required: ['operation', 'results', 'count'],
    },
    {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['read'] },
        found: { type: 'array', maxItems: 10, items: { type: 'object' } },
        missing: { type: 'array', items: { type: 'string' } },
      },
      required: ['operation', 'found', 'missing'],
    },
  ],
};

const memoryTool = {
  id: 'ast_memory_manager',
  tool_key: 'agentsam_memory_manager',
  result_policy_json: JSON.stringify(memoryPolicy),
  output_schema: JSON.stringify(memorySchema),
};

test('memory search defaults to a bounded public summary contract before model consumption', async () => {
  const huge = {
    results: Array.from({ length: 30 }, (_, i) => ({
      key: `key_${i}`,
      value: 'secret-full-value'.repeat(400),
      summary: 's'.repeat(3000),
      memory_type: 'fact',
      tags: ['test'],
      source: 'unit',
      updated_at: 1,
    })),
    count: 30,
    tier: 'private_pg',
  };
  const bounded = await applyToolResultPolicy({
    env: null,
    toolRow: memoryTool,
    input: { operation: 'search' },
    result: huge,
  });
  assert.equal(bounded.operation, 'search');
  assert.equal(bounded.results.length, 10);
  assert.ok(bounded.results.every((row) => row.summary.length <= 600));
  assert.ok(bounded.results.every((row) => !Object.hasOwn(row, 'value')));
  assert.ok(new TextEncoder().encode(JSON.stringify(bounded)).byteLength <= 16384);
});

test('explicit memory read returns bounded values under the absolute platform ceiling', async () => {
  const bounded = await applyToolResultPolicy({
    env: null,
    toolRow: memoryTool,
    input: { operation: 'read' },
    result: {
      found: [{ key: 'one', value: 'x'.repeat(90000), memory_type: 'fact', tags: [] }],
      missing: [],
    },
  });
  assert.equal(bounded.found[0].value.length, 4000);
  assert.ok(new TextEncoder().encode(JSON.stringify(bounded)).byteLength < ABSOLUTE_TOOL_RESULT_BYTES);
});

test('invalid bounded output returns a safe contract error without raw payload', async () => {
  const out = await applyToolResultPolicy({
    env: null,
    toolRow: memoryTool,
    input: { operation: 'search' },
    result: { results: 'not-an-array', raw_secret: 'do-not-return' },
  });
  assert.equal(out.error, 'tool_result_contract_error');
  assert.equal(JSON.stringify(out).includes('do-not-return'), false);
});
