import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAgentChatResolvedContext,
  mergeResolvedContextIntoRunContext,
} from '../../src/core/agent-chat-resolved-context.js';

test('buildAgentChatResolvedContext — uses passed userPolicy without env lookup', async () => {
  const resolved = await buildAgentChatResolvedContext({}, {
    userId: 'au_test',
    workspaceId: 'ws_test',
    tenantId: 'tenant_test',
    userPolicy: { can_run_pty: 1, max_tab_count: 8 },
  });
  assert.equal(resolved.user_id, 'au_test');
  assert.equal(resolved.workspace_id, 'ws_test');
  assert.equal(resolved.tenant_id, 'tenant_test');
  assert.equal(resolved.can_run_pty, true);
  assert.equal(resolved.policy?.max_tab_count, 8);
  assert.ok(resolved.workspace_root);
});

test('buildAgentChatResolvedContext — can_run_pty false when policy missing flag', async () => {
  const resolved = await buildAgentChatResolvedContext({}, {
    userId: 'au_test',
    workspaceId: 'ws_test',
    userPolicy: {},
  });
  assert.equal(resolved.can_run_pty, false);
});

test('mergeResolvedContextIntoRunContext — idempotent merge', () => {
  const resolved = {
    user_id: 'au_test',
    workspace_id: 'ws_test',
    tenant_id: 'tenant_test',
    session_id: 'sess_1',
    work_session_id: 'wsess_1',
  };
  const rc = mergeResolvedContextIntoRunContext({}, resolved);
  assert.equal(rc.userId, 'au_test');
  assert.equal(rc.workspaceId, 'ws_test');
  assert.equal(rc.tenantId, 'tenant_test');
  assert.equal(rc.sessionId, 'sess_1');
  assert.equal(rc.conversationId, 'sess_1');
  assert.equal(rc.resolvedContext, resolved);

  const again = mergeResolvedContextIntoRunContext(rc, resolved);
  assert.equal(again.userId, 'au_test');
});
