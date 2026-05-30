import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveManagedMemoryType,
  MANAGED_MEMORY_TYPES,
} from '../../src/core/mcp-memory-type-compat.js';
import { inputSchemaFromAgentsamToolRow } from '../../src/core/agentsam-tools-catalog.js';
import { agentsamMemorySaveInputSchema } from '../../src/core/mcp-memory-save-schema.js';

describe('resolveManagedMemoryType', () => {
  it('keeps policy and state as canonical types', () => {
    assert.equal(resolveManagedMemoryType({ memory_type: 'policy' }).memory_type, 'policy');
    assert.equal(resolveManagedMemoryType({ memory_type: 'state' }).memory_type, 'state');
  });

  it('upgrades decision+policy tag to policy', () => {
    const r = resolveManagedMemoryType({
      memory_type: 'decision',
      tags: ['policy', 'mcp'],
    });
    assert.equal(r.memory_type, 'policy');
    assert.ok(!r.tags.includes('policy'));
  });

  it('legacySchemaOnly maps policy to decision with tag', () => {
    const r = resolveManagedMemoryType(
      { memory_type: 'policy' },
      { legacySchemaOnly: true },
    );
    assert.equal(r.memory_type, 'decision');
    assert.ok(r.tags.includes('policy'));
    assert.equal(r.compat_mapped, true);
  });
});

describe('inputSchemaFromAgentsamToolRow memory tools', () => {
  it('save schema includes policy and state', () => {
    const schema = inputSchemaFromAgentsamToolRow({
      tool_key: 'agentsam_memory_save',
      input_schema: '{}',
    });
    const enums = schema.properties.memory_type.enum;
    assert.ok(enums.includes('policy'));
    assert.ok(enums.includes('state'));
    assert.deepEqual(enums, MANAGED_MEMORY_TYPES);
  });

  it('write schema requires content not key/value', () => {
    const schema = inputSchemaFromAgentsamToolRow({
      tool_key: 'agentsam_memory_write',
      input_schema: JSON.stringify(agentsamMemorySaveInputSchema()),
    });
    assert.ok(schema.properties.content);
    assert.equal(schema.required?.[0], 'content');
    assert.equal(schema.properties.key, undefined);
  });
});
