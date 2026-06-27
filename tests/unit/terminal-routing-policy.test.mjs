import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TERMINAL_GCP_CONNECTION_ID,
  resolveTerminalExecRouting,
  terminalToolPrefersGcpLane,
} from '../../src/core/terminal-routing-policy.js';

test('agentsam_terminal_remote defaults to GCP conn_gcp_iam_tunnel', () => {
  const r = resolveTerminalExecRouting({ tool_name: 'agentsam_terminal_remote' });
  assert.equal(r.target_type, 'platform_vm');
  assert.equal(r.target_id, TERMINAL_GCP_CONNECTION_ID);
  assert.equal(r.lane, 'gcp_primary');
});

test('agentsam_terminal_local prefers Mac tunnel', () => {
  const r = resolveTerminalExecRouting({ tool_name: 'agentsam_terminal_local' });
  assert.equal(r.target_type, 'user_hosted_tunnel');
  assert.equal(r.target_id, null);
  assert.equal(r.lane, 'mac_local');
});

test('terminal_execute maps to GCP remote lane', () => {
  assert.equal(terminalToolPrefersGcpLane('terminal_execute'), true);
  const r = resolveTerminalExecRouting({ tool_name: 'terminal_execute' });
  assert.equal(r.target_id, TERMINAL_GCP_CONNECTION_ID);
});

test('explicit target_id overrides default but keeps platform_vm', () => {
  const r = resolveTerminalExecRouting({
    tool_name: 'agentsam_terminal_remote',
    target_id: 'conn_custom_gcp',
  });
  assert.equal(r.target_id, 'conn_custom_gcp');
  assert.equal(r.target_type, 'platform_vm');
});
