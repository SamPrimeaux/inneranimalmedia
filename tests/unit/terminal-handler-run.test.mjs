import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeTerminalHandlerParams,
  resolveTerminalHandlerUserId,
} from '../../src/core/terminal-handler-run.js';
import { TERMINAL_GCP_CONNECTION_ID } from '../../src/core/terminal-routing-policy.js';

test('mergeTerminalHandlerParams prefers runContext identity fields', () => {
  const merged = mergeTerminalHandlerParams(
    { command: 'git status', tool_name: 'run_command' },
    {
      userId: 'au_871d920d1233cbd1',
      workspaceId: 'ws_inneranimalmedia',
      sessionId: 'sess_1',
      clientSurface: 'mobile_ios',
      execLane: 'remote',
      request: { headers: { get: () => null } },
    },
  );
  assert.equal(merged.command, 'git status');
  assert.equal(merged.user_id, 'au_871d920d1233cbd1');
  assert.equal(merged.workspace_id, 'ws_inneranimalmedia');
  assert.equal(merged.session_id, 'sess_1');
  assert.equal(merged.client_surface, 'mobile_ios');
  assert.equal(merged.exec_lane, 'remote');
  assert.ok(merged.request);
});

test('resolveTerminalHandlerUserId uses explicit id before request auth', async () => {
  const uid = await resolveTerminalHandlerUserId(
    {},
    null,
    'au_871d920d1233cbd1',
  );
  assert.equal(uid, 'au_871d920d1233cbd1');
});

test('mergeTerminalHandlerParams params override runContext for targets', () => {
  const merged = mergeTerminalHandlerParams(
    {
      target_id: TERMINAL_GCP_CONNECTION_ID,
      target_type: 'platform_vm',
      user_id: 'au_871d920d1233cbd1',
      tool_name: 'agentsam_terminal_remote',
    },
    { userId: 'au_other' },
  );
  assert.equal(merged.target_id, TERMINAL_GCP_CONNECTION_ID);
  assert.equal(merged.user_id, 'au_871d920d1233cbd1');
  assert.equal(merged.tool_name, 'agentsam_terminal_remote');
});
