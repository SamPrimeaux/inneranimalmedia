import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sudoAllowlistTokenFromCommand,
  commandMatchesAllowedList,
  checkSudoPermission,
  formatTerminalExec403,
  buildExecTransportHeaders,
} from '../../src/core/agentsam-privileged-targets.js';

/** @param {object|null} privilegedRow @param {object|null} connectionRow */
function mockPrivilegedDb(privilegedRow, connectionRow = null) {
  return {
    prepare(sql) {
      const q = String(sql);
      if (q.includes('privileged_target_id')) {
        return {
          bind() {
            return { async first() { return connectionRow; } };
          },
        };
      }
      return {
        bind() {
          return { async first() { return privilegedRow; } };
        },
      };
    },
  };
}

test('sudoAllowlistTokenFromCommand maps iam-ops wrappers to allowlist tokens', () => {
  assert.equal(
    sudoAllowlistTokenFromCommand('sudo /usr/local/sbin/iam-ops-systemctl restart cloudflared'),
    'systemctl',
  );
  assert.equal(
    sudoAllowlistTokenFromCommand('sudo /usr/local/sbin/iam-ops-apt install git'),
    'apt',
  );
});

test('deny: command not in scoped allowlist', () => {
  const allowed = '["apt","systemctl","cloudflared","workspace"]';
  assert.equal(
    commandMatchesAllowedList(allowed, 'sudo /usr/local/sbin/iam-ops-apt install git'),
    true,
  );
  assert.equal(
    commandMatchesAllowedList(allowed, 'sudo /usr/bin/passwd root'),
    false,
  );
  assert.equal(
    commandMatchesAllowedList(allowed, 'sudo /usr/local/sbin/iam-ops-workspace init-tenant tenant_sam_primeaux au_871d920d1233cbd1'),
    true,
  );
  assert.equal(
    commandMatchesAllowedList('["apt","systemctl","cloudflared"]', 'sudo /usr/local/sbin/iam-ops-workspace init-tenant tenant_sam_primeaux au_871d920d1233cbd1'),
    false,
  );
});

test('deny: Mac target with no privileged row → blocked', async () => {
  const env = { DB: mockPrivilegedDb(null) };
  const denied = await checkSudoPermission(env, 'conn_mac_local', 'sudo apt-get update');
  assert.equal(denied.allowed, false);
  assert.match(denied.reason, /not in privileged allowlist/);
});

test('deny: privileged target with privilege_mode none → blocked', async () => {
  const env = {
    DB: mockPrivilegedDb({
      target_id: 'conn_gcp_iam_tunnel',
      privilege_mode: 'none',
      allowed_commands: '["apt"]',
      sudoers_user: 'agentsam',
      enabled: 1,
    }),
  };
  const denied = await checkSudoPermission(
    env,
    'conn_gcp_iam_tunnel',
    'sudo /usr/local/sbin/iam-ops-apt update',
  );
  assert.equal(denied.allowed, false);
  assert.match(denied.reason, /explicitly disabled/);
});

test('deny: privileged row but command token not in allowlist → blocked', async () => {
  const env = {
    DB: mockPrivilegedDb({
      target_id: 'conn_gcp_iam_tunnel',
      privilege_mode: 'scoped_sudo',
      allowed_commands: '["systemctl"]',
      sudoers_user: 'agentsam',
      enabled: 1,
    }),
  };
  const denied = await checkSudoPermission(
    env,
    'conn_gcp_iam_tunnel',
    'sudo /usr/local/sbin/iam-ops-apt install git',
  );
  assert.equal(denied.allowed, false);
  assert.match(denied.reason, /not in allowlist for this target/);
});

test('deny: sudo privilege escalation patterns → blocked', async () => {
  const env = {
    DB: mockPrivilegedDb({
      target_id: 'conn_gcp_iam_tunnel',
      privilege_mode: 'scoped_sudo',
      allowed_commands: '["apt"]',
      sudoers_user: 'agentsam',
      enabled: 1,
    }),
  };
  const denied = await checkSudoPermission(env, 'conn_gcp_iam_tunnel', 'sudo -u root bash');
  assert.equal(denied.allowed, false);
  assert.match(denied.reason, /privilege escalation/);
});

test('allow: scoped sudo via connection privileged_target_id mapping', async () => {
  const env = {
    DB: mockPrivilegedDb(
      {
        target_id: 'conn_gcp_iam_tunnel',
        privilege_mode: 'scoped_sudo',
        allowed_commands: '["apt","systemctl","cloudflared","workspace"]',
        sudoers_user: 'agentsam',
        enabled: 1,
      },
      { privileged_target_id: 'conn_gcp_iam_tunnel' },
    ),
  };
  const ok = await checkSudoPermission(
    env,
    'conn_mac_shell2',
    'sudo /usr/local/sbin/iam-ops-systemctl restart cloudflared',
  );
  assert.equal(ok.allowed, true);
  assert.equal(ok.sudoersUser, 'agentsam');
});

test('formatTerminalExec403 returns terminal_exec_403 envelope', () => {
  const payload = formatTerminalExec403({ allowed: false, reason: 'sudo not permitted' });
  assert.equal(payload.error, 'terminal_exec_403');
  assert.equal(payload.blocked, true);
  assert.match(payload.detail.stderr, /IAM Security: blocked:/);
});

test('buildExecTransportHeaders tags AgentSam service identity', () => {
  const headers = buildExecTransportHeaders({
    execUser: 'agentsam',
    privilegedTargetId: 'conn_gcp_iam_tunnel',
  });
  assert.equal(headers['X-IAM-Exec-Identity'], 'agentsam');
  assert.equal(headers['X-IAM-Privileged-Target'], 'conn_gcp_iam_tunnel');
});
