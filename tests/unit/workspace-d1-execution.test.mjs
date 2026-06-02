import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CUSTOMER_D1_NOT_CONFIGURED,
  resolveWorkspaceD1Execution,
} from '../../src/core/workspace-d1-execution.js';
import { maskAccountId } from '../../src/core/workspace-cloudflare-credentials.js';

test('maskAccountId never reveals full account id', () => {
  const masked = maskAccountId('a1b2c3d4e5f6789012345678901234ab');
  assert.equal(masked, '••••34ab');
  assert.ok(!masked.includes('a1b2c3d4'));
});

test('non-owner without D1 binding fails closed', async () => {
  const env = {
    DB: {
      prepare(sql) {
        const q = String(sql);
        return {
          bind() {
            return {
              async first() {
                if (q.includes('agentsam_workspace_data_bindings')) return null;
                return null;
              },
            };
          },
        };
      },
    },
  };

  const out = await resolveWorkspaceD1Execution(env, {
    user_id: 'au_customer',
    tenant_id: 'tenant_x',
    workspace_id: 'ws_customer',
    authUser: { role: 'member' },
  });

  assert.equal(out.ok, false);
  assert.equal(out.mode, 'denied');
  assert.equal(out.error, 'customer_d1_not_configured');
  assert.equal(out.user_message, CUSTOMER_D1_NOT_CONFIGURED);
});

test('owner without customer D1 binding uses platform mode', async () => {
  const env = {
    DB: {
      prepare(sql) {
        const q = String(sql);
        return {
          bind() {
            return {
              async first() {
                if (q.includes('agentsam_workspace_data_bindings')) return null;
                return null;
              },
            };
          },
        };
      },
    },
  };

  const out = await resolveWorkspaceD1Execution(env, {
    user_id: 'au_owner',
    tenant_id: 'tenant_x',
    workspace_id: 'ws_owner',
    authUser: { role: 'owner' },
  });

  assert.equal(out.ok, true);
  assert.equal(out.mode, 'platform');
});

test('customer workspace with D1 binding but no credentials fails closed', async () => {
  const env = {
    DB: {
      prepare(sql) {
        const q = String(sql);
        return {
          bind() {
            return {
              async first() {
                if (q.includes('agentsam_workspace_data_bindings')) {
                  return {
                    id: 'wsbind_d1_1',
                    external_account_id: 'acct1234567890abcd',
                    external_database_id: 'db-uuid-1',
                    selected_as_default: 1,
                  };
                }
                if (q.includes('FROM user_api_keys')) return null;
                return null;
              },
            };
          },
        };
      },
    },
  };

  const out = await resolveWorkspaceD1Execution(env, {
    user_id: 'au_customer',
    tenant_id: 'tenant_x',
    workspace_id: 'ws_customer',
    authUser: { role: 'member' },
  });

  assert.equal(out.ok, false);
  assert.equal(out.mode, 'denied');
  assert.equal(out.error, 'cloudflare_key_missing');
  assert.equal(out.user_message, CUSTOMER_D1_NOT_CONFIGURED);
  assert.equal(out.binding_id, 'wsbind_d1_1');
  assert.equal(out.database_id, 'db-uuid-1');
});
