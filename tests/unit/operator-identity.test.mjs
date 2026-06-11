import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isPlatformOperatorSync,
  loadPlatformOperatorRegistry,
} from '../../src/core/operator-identity.js';

describe('isPlatformOperatorSync', () => {
  const registry = {
    personUuids: new Set(['550e8400-e29b-41d4-a716-446655440001']),
    defaultTenantId: 'tenant_sam_primeaux',
  };

  it('matches platform_operators person_uuid', () => {
    assert.equal(
      isPlatformOperatorSync(
        { person_uuid: '550e8400-e29b-41d4-a716-446655440001', role: 'user', tenant_id: 'tenant_x' },
        registry,
      ),
      true,
    );
  });

  it('falls back to superadmin + default tenant', () => {
    assert.equal(
      isPlatformOperatorSync({ role: 'superadmin', tenant_id: 'tenant_sam_primeaux' }, registry),
      true,
    );
  });

  it('rejects customer tenant', () => {
    assert.equal(
      isPlatformOperatorSync({ role: 'superadmin', tenant_id: 'tenant_connor_mcneely' }, registry),
      false,
    );
  });
});

describe('loadPlatformOperatorRegistry', () => {
  it('returns empty registry without DB', async () => {
    const reg = await loadPlatformOperatorRegistry({});
    assert.equal(reg.personUuids.size, 0);
  });
});
