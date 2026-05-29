import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMemorySyncKey,
  normalizePrivateMemoryInput,
  mapD1RowToPrivateMemory,
  MANAGED_MEMORY_TYPES,
  isMcpReauthError,
} from '../../src/core/agentsam-private-memory.js';

describe('agentsam-private-memory', () => {
  it('buildMemorySyncKey is stable', () => {
    const k = buildMemorySyncKey('tenant_a', 'au_x', 'policy:test');
    assert.equal(k, 'tenant_a:au_x:policy:test');
  });

  it('normalizePrivateMemoryInput maps key/value aliases', () => {
    const m = normalizePrivateMemoryInput({
      tenant_id: 'tenant_a',
      workspace_id: 'ws_a',
      user_id: 'au_x',
      key: 'error:mcp_memory_save_401_reauth',
      value: 'reauth required',
      memory_type: 'error',
      tags: ['mcp', 'auth'],
    });
    assert.equal(m.memory_key, 'error:mcp_memory_save_401_reauth');
    assert.equal(m.content, 'reauth required');
    assert.equal(m.sync_key, 'tenant_a:au_x:error:mcp_memory_save_401_reauth');
    assert.deepEqual(m.tags, ['mcp', 'auth']);
  });

  it('mapD1RowToPrivateMemory preserves D1 key as memory_key', () => {
    const m = mapD1RowToPrivateMemory({
      id: 'mem_abc',
      tenant_id: 'tenant_a',
      user_id: 'au_x',
      workspace_id: 'ws_a',
      memory_type: 'project',
      key: 'milestone:20260529_runtime',
      value: '{"commit":"56b4a7e"}',
      source: 'cursor_session_sync',
    });
    assert.equal(m.memory_key, 'milestone:20260529_runtime');
    assert.equal(m.d1_id, 'mem_abc');
    assert.equal(m.memory_type, 'project');
  });

  it('MANAGED_MEMORY_TYPES includes policy and state', () => {
    assert.ok(MANAGED_MEMORY_TYPES.includes('policy'));
    assert.ok(MANAGED_MEMORY_TYPES.includes('state'));
  });

  it('isMcpReauthError detects 401', () => {
    assert.equal(isMcpReauthError(null, { status: 401 }), true);
    assert.equal(isMcpReauthError('HTTP 401 reauthentication required'), true);
    assert.equal(isMcpReauthError('not found'), false);
  });
});
