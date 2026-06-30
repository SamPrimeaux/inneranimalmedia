import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TERMINAL_GCP_CONNECTION_ID,
  resolveTerminalExecRouting,
  terminalToolPrefersGcpLane,
} from '../../src/core/terminal-routing-policy.js';

test('agentsam_terminal_remote defaults to GCP conn_gcp_iam_tunnel', () => {
  const r = resolveTerminalExecRouting({
    tool_name: 'agentsam_terminal_remote',
    user_id: 'au_871d920d1233cbd1',
  });
  assert.equal(r.target_type, 'platform_vm');
  assert.equal(r.target_id, TERMINAL_GCP_CONNECTION_ID);
  assert.equal(r.lane, 'gcp_primary');
});

test('agentsam_terminal_local uses user_hosted_tunnel for any user', () => {
  const connor = resolveTerminalExecRouting({
    tool_name: 'agentsam_terminal_local',
    user_id: 'au_5d17673408aaebc7',
  });
  assert.equal(connor.target_type, 'user_hosted_tunnel');
  assert.equal(connor.lane, 'user_local');
  assert.notEqual(connor.forbidden, true);

  const sam = resolveTerminalExecRouting({
    tool_name: 'agentsam_terminal_local',
    user_id: 'au_871d920d1233cbd1',
  });
  assert.equal(sam.lane, 'mac_local');
});

test('agentsam_terminal_remote forbidden for non-operator users', () => {
  const r = resolveTerminalExecRouting({
    tool_name: 'agentsam_terminal_remote',
    user_id: 'au_5d17673408aaebc7',
  });
  assert.equal(r.forbidden, true);
  assert.equal(r.lane, 'forbidden_non_operator');
});

test('terminal_execute maps to GCP remote lane', () => {
  assert.equal(terminalToolPrefersGcpLane('terminal_execute'), true);
  const r = resolveTerminalExecRouting({
    tool_name: 'terminal_execute',
    user_id: 'au_871d920d1233cbd1',
  });
  assert.equal(r.target_id, TERMINAL_GCP_CONNECTION_ID);
});

test('explicit target_id overrides default but keeps platform_vm', () => {
  const r = resolveTerminalExecRouting({
    tool_name: 'agentsam_terminal_remote',
    user_id: 'au_871d920d1233cbd1',
    target_id: 'conn_custom_gcp',
  });
  assert.equal(r.target_id, 'conn_custom_gcp');
  assert.equal(r.target_type, 'platform_vm');
});
