import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PLATFORM_D1_DATABASE_ID,
  resolveD1GrantByDatabaseName,
  resolveWorkspaceD1Catalog,
  resolveWorkspaceMemberD1Grant,
} from '../../src/core/workspace-d1-access.js';

const FUEL_D1 = '9fd6ff92-e407-4b51-8b01-3c93f3845bb2';
const FUEL_WS = 'ws_fuelnfreetime';

test('resolveWorkspaceD1Catalog reads metadata d1_databases with slug fallback', () => {
  const catalog = resolveWorkspaceD1Catalog({
    workspace_slug: 'fuelnfreetime',
    d1_database_id: FUEL_D1,
    d1_binding: 'DB',
    metadata_json: JSON.stringify({
      d1_databases: [{ binding: 'DB', database_name: 'fuelnfreetime', database_id: FUEL_D1 }],
    }),
  });
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].database_name, 'fuelnfreetime');
  assert.equal(catalog[0].database_id, FUEL_D1);
});

test('resolveWorkspaceMemberD1Grant denies platform D1 to non-superadmin', async () => {
  const env = {
    CLOUDFLARE_API_TOKEN: 'tok',
    CLOUDFLARE_ACCOUNT_ID: 'acct',
    DB: {
      prepare(sql) {
        const q = String(sql);
        return {
          bind() {
            return {
              async first() {
                if (q.includes('agentsam_workspace_blocklist')) return null;
                if (q.includes('FROM agentsam_workspace')) {
                  return {
                    id: FUEL_WS,
                    d1_database_id: PLATFORM_D1_DATABASE_ID,
                    cloudflare_account_id: 'acct',
                  };
                }
                if (q.includes('workspace_members')) return { ok: 1 };
                return null;
              },
            };
          },
        };
      },
    },
  };

  const grant = await resolveWorkspaceMemberD1Grant(env, { id: 'au_connor', tenant_id: 'tenant_connor' }, FUEL_WS);
  assert.equal(grant, null);
});

test('resolveWorkspaceMemberD1Grant grants fuel D1 via workspace membership', async () => {
  const env = {
    CLOUDFLARE_API_TOKEN: 'platform-tok',
    CLOUDFLARE_ACCOUNT_ID: 'platform-acct',
    DB: {
      prepare(sql) {
        const q = String(sql);
        return {
          bind() {
            return {
              async first() {
                if (q.includes('agentsam_workspace_blocklist')) return null;
                if (q.includes('FROM agentsam_workspace')) {
                  return {
                    id: FUEL_WS,
                    workspace_slug: 'fuelnfreetime',
                    d1_database_id: FUEL_D1,
                    cloudflare_account_id: 'cf-acct',
                    metadata_json: JSON.stringify({
                      d1_databases: [{ binding: 'DB', database_name: 'fuelnfreetime', database_id: FUEL_D1 }],
                    }),
                  };
                }
                if (q.includes('workspace_members')) return { ok: 1 };
                if (q.includes('FROM user_api_keys')) return null;
                return null;
              },
            };
          },
        };
      },
    },
  };

  const grant = await resolveWorkspaceMemberD1Grant(env, { id: 'au_connor', tenant_id: 'tenant_connor' }, FUEL_WS);
  assert.ok(grant);
  assert.equal(grant.via, 'workspace_membership');
  assert.equal(grant.database_id, FUEL_D1);
  assert.equal(grant.token, 'platform-tok');
  assert.equal(grant.account_id, 'cf-acct');
});

test('resolveD1GrantByDatabaseName resolves fuelnfreetime by catalog database_name', async () => {
  const fuelRow = {
    id: FUEL_WS,
    workspace_slug: 'fuelnfreetime',
    d1_database_id: FUEL_D1,
    cloudflare_account_id: 'cf-acct',
    metadata_json: JSON.stringify({
      d1_databases: [{ binding: 'DB', database_name: 'fuelnfreetime', database_id: FUEL_D1 }],
    }),
  };

  const env = {
    CLOUDFLARE_API_TOKEN: 'platform-tok',
    CLOUDFLARE_ACCOUNT_ID: 'platform-acct',
    DB: {
      prepare(sql) {
        const q = String(sql);
        return {
          bind() {
            return {
              async first() {
                if (q.includes('agentsam_workspace_blocklist')) return null;
                if (q.includes('FROM agentsam_workspace') && !q.includes('json_each')) return fuelRow;
                if (q.includes('workspace_members')) return { ok: 1 };
                if (q.includes('FROM user_api_keys')) return null;
                return null;
              },
              async all() {
                if (q.includes('json_each')) return { results: [fuelRow] };
                return { results: [] };
              },
            };
          },
        };
      },
    },
  };

  const grant = await resolveD1GrantByDatabaseName(env, { id: 'au_connor', tenant_id: 'tenant_connor' }, 'fuelnfreetime');
  assert.ok(grant);
  assert.equal(grant.database_id, FUEL_D1);
  assert.equal(grant.workspace_id, FUEL_WS);
  assert.equal(grant.via, 'workspace_membership');
});

test('resolveD1GrantByDatabaseName returns null when user lacks workspace access', async () => {
  const env = {
    DB: {
      prepare() {
        return {
          bind() {
            return {
              async all() {
                return {
                  results: [{
                    id: FUEL_WS,
                    workspace_slug: 'fuelnfreetime',
                    d1_database_id: FUEL_D1,
                    metadata_json: JSON.stringify({
                      d1_databases: [{ binding: 'DB', database_name: 'fuelnfreetime', database_id: FUEL_D1 }],
                    }),
                  }],
                };
              },
              async first() {
                if (String(arguments).includes('blocklist')) return null;
                return null;
              },
            };
          },
        };
      },
    },
  };

  const grant = await resolveD1GrantByDatabaseName(env, { id: 'au_other' }, 'fuelnfreetime');
  assert.equal(grant, null);
});
