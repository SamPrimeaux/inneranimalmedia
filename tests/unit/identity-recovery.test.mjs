import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildAuthRecoveryPayload, AUTH_RECOVERY_CATALOG } from '../../src/core/identity-recovery.js';

describe('buildAuthRecoveryPayload', () => {
  it('returns structured recovery for invalid_grant_expired', () => {
    const payload = buildAuthRecoveryPayload('invalid_grant_expired');
    assert.ok(payload.recovery);
    assert.equal(payload.recovery.code, 'invalid_grant_expired');
    assert.ok(payload.recovery.channels.length >= 2);
    assert.ok(AUTH_RECOVERY_CATALOG.invalid_grant_expired);
  });

  it('falls back to default for unknown codes', () => {
    const payload = buildAuthRecoveryPayload('something_new');
    assert.equal(payload.recovery.code, 'something_new');
    assert.ok(payload.recovery.title);
  });
});
