import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENT_HUB_REGISTRY_KEYS,
  connectorKindForProvider,
  connectUrlForAgentHub,
} from '../../src/core/connectors-hub-helpers.js';

describe('integrations-connectors-catalog', () => {
  it('includes core registry keys aligned with settings integrations', () => {
    assert.ok(AGENT_HUB_REGISTRY_KEYS.includes('github'));
    assert.ok(AGENT_HUB_REGISTRY_KEYS.includes('cloudflare_oauth'));
    assert.ok(AGENT_HUB_REGISTRY_KEYS.includes('google_drive'));
    assert.ok(AGENT_HUB_REGISTRY_KEYS.includes('mcp_servers'));
  });

  it('classifies connector kinds', () => {
    assert.equal(connectorKindForProvider('github'), 'oauth_api');
    assert.equal(connectorKindForProvider('inneranimalmedia-mcp-server'), 'mcp_remote');
    assert.equal(connectorKindForProvider('web_search'), 'capability');
    assert.equal(connectorKindForProvider('mcp_servers'), 'mcp_custom');
  });

  it('builds popup-friendly connect URLs', () => {
    const gh = connectUrlForAgentHub('github', '/dashboard/agent');
    assert.match(gh, /^\/api\/oauth\/github\/start\?return_to=/);
    const mcp = connectUrlForAgentHub('inneranimalmedia-mcp-server', '/dashboard/agent');
    assert.match(mcp, /^https:\/\/mcp\.inneranimalmedia\.com\/api\/oauth\/authorize/);
    assert.match(mcp, /client_id=iam_mcp_inneranimalmedia/);
  });
});
