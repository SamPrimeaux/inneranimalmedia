import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CF_BINDINGS_MCP_URL,
  PLATFORM_D1_DATABASE_ID,
  isCfMcpCatalogTool,
  resolveCfMcpCatalogRoute,
  mapAgentsamParamsToCfMcp,
  normalizeCfMcpToolResultBody,
} from '../../src/core/cf-mcp-proxy.js';

test('isCfMcpCatalogTool detects cloudflare-bindings server and dispatch_target', () => {
  assert.equal(
    isCfMcpCatalogTool(
      { server_key: 'cloudflare-bindings', dispatch_target: 'mcp_proxy' },
      { remote_tool: 'd1_database_query', provider: 'cloudflare' },
    ),
    true,
  );
  assert.equal(
    isCfMcpCatalogTool(
      { dispatch_target: 'internal' },
      { operation: 'd1.query', provider: 'cloudflare' },
    ),
    true,
  );
  assert.equal(isCfMcpCatalogTool({ dispatch_target: 'internal' }, { operation: 'r2.get' }), false);
});

test('resolveCfMcpCatalogRoute returns mcp_only for mcp_proxy dispatch', () => {
  const route = resolveCfMcpCatalogRoute(
    {
      tool_key: 'agentsam_d1_query',
      dispatch_target: 'mcp_proxy',
      mcp_service_url: CF_BINDINGS_MCP_URL,
    },
    {
      remote_tool: 'd1_database_query',
      provider: 'cloudflare',
      auth_source: 'user_oauth_tokens',
    },
  );
  assert.ok(route);
  assert.equal(route.route, 'mcp_only');
  assert.equal(route.remoteTool, 'd1_database_query');
  assert.equal(route.mcpRow.mcp_service_url, CF_BINDINGS_MCP_URL);
});

test('mapAgentsamParamsToCfMcp defaults platform D1 id and maps sql', () => {
  const mapped = mapAgentsamParamsToCfMcp(
    'd1_database_query',
    { sql: 'SELECT 1' },
    {},
    {},
  );
  assert.equal(mapped.database_id, PLATFORM_D1_DATABASE_ID);
  assert.equal(mapped.sql, 'SELECT 1');
});

test('normalizeCfMcpToolResultBody parses MCP text JSON content', () => {
  const body = normalizeCfMcpToolResultBody({
    jsonrpc: '2.0',
    id: 1,
    result: {
      content: [{ type: 'text', text: '{"success":true,"results":[{"1":1}]}' }],
    },
  });
  assert.deepEqual(body, { success: true, results: [{ 1: 1 }] });
});
