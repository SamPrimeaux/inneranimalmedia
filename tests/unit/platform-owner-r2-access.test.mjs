import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadR2BucketRegistry,
  resolveRegisteredR2BucketName,
  assertOwnerPlatformR2Bucket,
  isPlatformOwner,
} from '../../src/core/platform-owner-r2-access.js';

const mockEnv = {
  DASHBOARD: {},
  DB: {
    prepare(sql) {
      const q = String(sql);
      return {
        all: async () => {
          if (q.includes('r2_bucket_list')) {
            return { results: [{ name: 'client-alpha' }, { name: 'client-beta' }] };
          }
          if (q.includes('r2_bucket_bindings')) {
            return { results: [{ name: 'client-gamma' }] };
          }
          if (q.includes('project_storage')) {
            return { results: [{ storage_name: 'Display Name', storage_id: 'client-delta' }] };
          }
          return { results: [] };
        },
        bind() {
          return this;
        },
        first: async () => null,
      };
    },
  },
};

describe('platform-owner-r2-access (D1 registry)', () => {
  it('loads bucket names from D1 tables only', async () => {
    const registry = await loadR2BucketRegistry(mockEnv);
    assert.ok(registry.has('client-alpha'));
    assert.ok(registry.has('client-gamma'));
    assert.ok(registry.has('client-delta'));
    assert.equal(registry.get('display name'), 'Display Name');
  });

  it('resolves registered bucket case-insensitively', async () => {
    const name = await resolveRegisteredR2BucketName(mockEnv, 'CLIENT-ALPHA');
    assert.equal(name, 'client-alpha');
  });

  it('permits registered buckets for platform owner', async () => {
    const check = await assertOwnerPlatformR2Bucket(mockEnv, 'client-beta');
    assert.equal(check.ok, true);
    assert.equal(check.bucket, 'client-beta');
  });

  it('rejects unregistered buckets', async () => {
    const check = await assertOwnerPlatformR2Bucket(mockEnv, 'not-in-d1-registry');
    assert.equal(check.ok, false);
    assert.equal(check.error, 'platform_r2_bucket_not_registered');
  });

  it('detects superadmin as platform owner', async () => {
    assert.equal(await isPlatformOwner(mockEnv, { is_superadmin: 1 }), true);
    assert.equal(await isPlatformOwner(mockEnv, { is_superadmin: 0 }), false);
  });
});
