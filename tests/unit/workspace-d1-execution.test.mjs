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

test('tenant owner without customer D1 binding fails closed (not platform operator)', async () => {
  const env = {
    DB: {
      prepare(sql) {
        const q = String(sql);
        return {
          bind() {
            return {
              async first() {
                if (q.includes('FROM agentsam_workspace')) return null;
                if (q.includes('FROM workspace_limits')) return null;
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

  assert.equal(out.ok, false);
  assert.equal(out.mode, 'denied');
  assert.equal(out.error, 'customer_d1_not_configured');
});

test('superadmin without customer D1 binding uses platform mode when policy allows', async () => {
  const env = {
    DB: {
      prepare(sql) {
        const q = String(sql);
        return {
          bind() {
            return {
              async first() {
                if (q.includes('FROM agentsam_workspace')) return null;
                if (q.includes('FROM workspace_limits')) return null;
                return null;
              },
            };
          },
        };
      },
    },
  };

  const out = await resolveWorkspaceD1Execution(env, {
    user_id: 'au_sam',
    tenant_id: 'tenant_sam_primeaux',
    workspace_id: 'ws_inneranimalmedia',
    authUser: { role: 'superadmin', is_superadmin: 1 },
  });

  assert.equal(out.ok, true);
  assert.equal(out.mode, 'platform');
});

test('workspace owner via membership_role fails closed without customer D1', async () => {
  const env = {
    DB: {
      prepare() {
        return {
          bind() {
            return {
              async first() {
                return null;
              },
            };
          },
        };
      },
    },
  };

  const out = await resolveWorkspaceD1Execution(env, {
    user_id: 'au_connor',
    tenant_id: 'tenant_connor_mcneely',
    workspace_id: 'ws_connor_mcneely',
    authUser: { role: 'member', membership_role: 'owner' },
  });

  assert.equal(out.ok, false);
  assert.equal(out.mode, 'denied');
  assert.equal(out.error, 'customer_d1_not_configured');
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
                if (q.includes('FROM agentsam_workspace')) {
                  return {
                    id: 'ws_customer',
                    d1_database_id: 'db-uuid-1',
                    cloudflare_account_id: 'acct1234567890abcd',
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
  assert.equal(out.binding_id, 'ws_customer');
  assert.equal(out.database_id, 'db-uuid-1');
});
