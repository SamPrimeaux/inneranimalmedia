import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MCP_OAUTH_ACCESS_WITH_REFRESH_TTL_SECONDS,
  MCP_OAUTH_REFRESH_TOKEN_TTL_SECONDS,
  MCP_OAUTH_CURSOR_TOKEN_TTL_SECONDS,
  resolveMcpOAuthAccessTtlSeconds,
  iamMcpOAuthAuthorizationServerMetadata,
} from '../../src/api/mcp-oauth-shared.js';

describe('MCP OAuth refresh grant constants', () => {
  it('exposes 1h access + 90d refresh defaults', () => {
    assert.equal(MCP_OAUTH_ACCESS_WITH_REFRESH_TTL_SECONDS, 3600);
    assert.equal(MCP_OAUTH_REFRESH_TOKEN_TTL_SECONDS, 90 * 86400);
  });

  it('advertises refresh_token grant in discovery metadata', () => {
    const meta = iamMcpOAuthAuthorizationServerMetadata();
    assert.ok(meta.grant_types_supported.includes('refresh_token'));
    assert.ok(meta.grant_types_supported.includes('authorization_code'));
  });
});

describe('resolveMcpOAuthAccessTtlSeconds', () => {
  it('uses 1h for standard OAuth clients', () => {
    assert.equal(resolveMcpOAuthAccessTtlSeconds({}, 'claude'), 3600);
    assert.equal(resolveMcpOAuthAccessTtlSeconds({}, null), 3600);
  });

  it('keeps long TTL for Cursor', () => {
    assert.equal(resolveMcpOAuthAccessTtlSeconds({}, 'cursor'), MCP_OAUTH_CURSOR_TOKEN_TTL_SECONDS);
  });

  it('respects MCP_OAUTH_ACCESS_TTL_SECONDS env override', () => {
    assert.equal(resolveMcpOAuthAccessTtlSeconds({ MCP_OAUTH_ACCESS_TTL_SECONDS: '7200' }, 'claude'), 7200);
  });
});
