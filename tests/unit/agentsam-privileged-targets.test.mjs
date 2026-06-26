import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sudoAllowlistTokenFromCommand,
  commandMatchesAllowedList,
  checkSudoPermission,
  formatTerminalExec403,
} from '../../src/core/agentsam-privileged-targets.js';

test('sudoAllowlistTokenFromCommand maps iam-ops wrappers to allowlist tokens', () => {
  assert.equal(
    sudoAllowlistTokenFromCommand('sudo /usr/local/sbin/iam-ops-systemctl restart cloudflared'),
    'systemctl',
  );
  assert.equal(
    sudoAllowlistTokenFromCommand('sudo /usr/local/sbin/iam-ops-apt install git'),
    'apt',
  );
  assert.equal(
    sudoAllowlistTokenFromCommand('sudo /usr/local/sbin/iam-ops-cloudflared fix-unit'),
    'cloudflared',
  );
});

test('commandMatchesAllowedList rejects commands outside scoped allowlist', () => {
  const allowed = '["apt","systemctl","cloudflared","workspace"]';
  assert.equal(
    commandMatchesAllowedList(allowed, 'sudo /usr/local/sbin/iam-ops-apt install git'),
    true,
  );
  assert.equal(
    commandMatchesAllowedList(allowed, 'sudo /usr/bin/passwd root'),
    false,
  );
});

test('checkSudoPermission blocks sudo when target is not allowlisted', async () => {
  const env = { DB: null };
  const denied = await checkSudoPermission(env, 'conn_mac_local', 'sudo apt-get update');
  assert.equal(denied.allowed, false);
  assert.match(denied.reason, /not in privileged allowlist/);
});

test('checkSudoPermission allows scoped sudo for privileged target row', async () => {
  const env = {
    DB: {
      prepare(sql) {
        if (String(sql).includes('privileged_target_id')) {
          return {
            bind() {
              return {
                async first() {
                  return { privileged_target_id: 'conn_gcp_iam_tunnel' };
                },
              };
            },
          };
        }
        return {
          bind() {
            return {
              async first() {
                return {
                  target_id: 'conn_gcp_iam_tunnel',
                  privilege_mode: 'scoped_sudo',
                  allowed_commands: '["apt","systemctl","cloudflared","workspace"]',
                  sudoers_user: 'agentsam',
                  enabled: 1,
                };
              },
            };
          },
        };
      },
    },
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
