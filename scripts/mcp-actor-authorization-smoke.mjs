#!/usr/bin/env node
/**
 * Lightweight checks for MCP actor + authorization helpers (no D1).
 *
 * Manual integration scenarios (dashboard session cookies + membership):
 * 1. d1_query as Sam in ws_inneranimalmedia → execution row uses that user/workspace.
 * 2. d1_query as Connor in ws_connor_mcneely → row uses Connor workspace.
 * 3. POST /api/mcp/dispatch with workspace_id not in membership → WORKSPACE_ACCESS_DENIED (403).
 * 4. Tool not allowlisted when require_allowlist_for_mcp=1 → MCP_ALLOWLIST_DENIED.
 * 5. Missing session / incomplete IAM → ACTOR_CONTEXT_MISSING.
 * 6. Unknown tool_key with no registry row → MCP_TOOL_NOT_REGISTERED.
 *
 * Usage: node scripts/mcp-actor-authorization-smoke.mjs
 */

import assert from 'node:assert/strict';
import { assertActorContext } from '../src/core/runtime-actor.js';

function mustThrow(fn, code) {
  try {
    fn();
    assert.fail('expected throw');
  } catch (e) {
    assert.equal(e.code, code);
  }
}

mustThrow(() => assertActorContext(null), 'ACTOR_CONTEXT_MISSING');
mustThrow(() => assertActorContext({ userId: 'usr_x', tenantId: 't', workspaceId: 'ws_x' }), 'ACTOR_CONTEXT_MISSING');
mustThrow(() => assertActorContext({ userId: 'au_x', tenantId: '', workspaceId: 'ws_x' }), 'ACTOR_CONTEXT_MISSING');

assertActorContext({
  userId: 'au_system_agent',
  tenantId: 'tenant_acme',
  workspaceId: 'ws_acme',
});

assertActorContext({
  userId: 'au_service_cron',
  tenantId: 'tenant_acme',
  workspaceId: 'ws_acme',
});

console.log('mcp-actor-authorization-smoke: ok');
