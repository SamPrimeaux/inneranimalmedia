/**
 * Memory scope + transport provenance unit tests.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isTransportWorkspaceKey,
  resolveSourceClient,
  resolveMemorySemanticScope,
  PLATFORM_PROJECT_WORKSPACE,
} from '../../src/core/agentsam-memory-scope.js';

describe('agentsam memory scope', () => {
  it('treats MCP bridge keys as transport-only', () => {
    assert.equal(isTransportWorkspaceKey('ws_inneranimalmedia_mcp'), true);
    assert.equal(isTransportWorkspaceKey('ws_companionscpas'), false);
    assert.equal(isTransportWorkspaceKey('ws_inneranimalmedia'), false);
  });

  it('does not use MCP transport as semantic project scope', async () => {
    const scope = await resolveMemorySemanticScope({
      auth: {
        tenant_id: 'tenant_sam_primeaux',
        user_id: 'au_8a5b76b737a9f14c',
        workspace_id: 'ws_inneranimalmedia_mcp',
        is_superadmin: true,
      },
      args: {
        content: 'Companions spa booking window is Fridays only for VIP clients.',
        memory_type: 'decision',
        source_client: 'chatgpt',
      },
      env: null,
    });
    assert.equal(scope.transport_workspace_key, 'ws_inneranimalmedia_mcp');
    assert.equal(scope.source_client, 'chatgpt');
    assert.equal(scope.active_project_workspace_key, PLATFORM_PROJECT_WORKSPACE);
    assert.notEqual(scope.active_project_workspace_key, 'ws_inneranimalmedia_mcp');
  });

  it('honors explicit Companions project workspace', async () => {
    const scope = await resolveMemorySemanticScope({
      auth: {
        tenant_id: 'tenant_sam_primeaux',
        user_id: 'au_sam',
        workspace_id: 'ws_inneranimalmedia_mcp',
        is_superadmin: true,
      },
      args: {
        active_project_workspace_key: 'ws_companionscpas',
        source_client: 'cursor',
      },
      env: null,
    });
    assert.equal(scope.active_project_workspace_key, 'ws_companionscpas');
    assert.equal(scope.transport_workspace_key, 'ws_inneranimalmedia_mcp');
    assert.equal(scope.source_client, 'cursor');
  });

  it('infers chatgpt from external client key', () => {
    assert.equal(
      resolveSourceClient({ external_client_key: 'chatgpt-mcp-oauth' }, {}),
      'chatgpt',
    );
  });

  it('fails closed when UUID mapping missing and DB present', async () => {
    const fakeDb = {
      prepare() {
        return {
          bind() {
            return {
              async first() {
                return { supabase_workspace_id: null };
              },
            };
          },
        };
      },
    };
    const scope = await resolveMemorySemanticScope({
      auth: {
        tenant_id: 'tenant_x',
        user_id: 'au_x',
        workspace_id: 'ws_inneranimalmedia',
        is_superadmin: true,
      },
      args: {},
      env: { DB: fakeDb },
    });
    assert.equal(scope.ok, false);
    assert.ok(scope.errors.includes('workspace_uuid_mapping_missing'));
  });
});
