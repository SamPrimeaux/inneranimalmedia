import test from 'node:test';
import assert from 'node:assert/strict';
import { IAM_D1_DATABASE_ID } from '../../src/core/d1-graphql-analytics.js';
import {
  CF_BINDINGS_MCP_URL,
  PLATFORM_D1_DATABASE_ID,
  isCfMcpCatalogTool,
  resolveCfMcpCatalogRoute,
  mapAgentsamParamsToCfMcp,
  normalizeCfMcpToolResultBody,
  isPlatformD1DatabaseId,
  assertCallerOwnsDatabaseId,
} from '../../src/core/cf-mcp-proxy.js';

test('PLATFORM_D1_DATABASE_ID matches IAM_D1_DATABASE_ID SSOT', () => {
  assert.equal(PLATFORM_D1_DATABASE_ID, IAM_D1_DATABASE_ID);
});

test('isPlatformD1DatabaseId uses IAM SSOT constant', () => {
  assert.equal(isPlatformD1DatabaseId(IAM_D1_DATABASE_ID), true);
  assert.equal(isPlatformD1DatabaseId('00000000-0000-0000-0000-000000000000'), false);
});

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
    false,
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

test('mapAgentsamParamsToCfMcp defaults platform D1 id for platform_operator only', () => {
  const operatorMapped = mapAgentsamParamsToCfMcp(
    'd1_database_query',
    { sql: 'SELECT 1' },
    {},
    {},
    { isPlatformOperator: true },
  );
  assert.equal(operatorMapped.database_id, IAM_D1_DATABASE_ID);
  assert.equal(operatorMapped.sql, 'SELECT 1');

  const userMapped = mapAgentsamParamsToCfMcp(
    'd1_database_query',
    { sql: 'SELECT 1' },
    {},
    {},
    { isPlatformOperator: false },
  );
  assert.equal(userMapped.database_id, '');
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

test('assertCallerOwnsDatabaseId allows platform operator without OAuth', async () => {
  const out = await assertCallerOwnsDatabaseId(
    {},
    'au_sam',
    IAM_D1_DATABASE_ID,
    { role: 'superadmin', tenant_id: 'tenant_sam_primeaux', id: 'au_sam' },
  );
  assert.equal(out.ok, true);
  assert.equal(out.auth_scope, 'platform_operator');
});

test('assertCallerOwnsDatabaseId rejects platform D1 for non-operator', async () => {
  const out = await assertCallerOwnsDatabaseId(
    {},
    'au_connor',
    IAM_D1_DATABASE_ID,
    { role: 'member', tenant_id: 'tenant_connor_mcneely', id: 'au_connor' },
  );
  assert.equal(out.ok, false);
  assert.equal(out.error, 'platform_d1_denied');
});
