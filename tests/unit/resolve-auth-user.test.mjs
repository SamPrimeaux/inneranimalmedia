import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isIamOwnedIdentity,
  isIamServiceIdentity,
  isIamServiceIdentityLane,
  SAM_OPERATOR_PERSON_UUID,
} from '../../src/core/resolve-auth-user.js';

describe('IAM identity helpers', () => {
  it('detects iam_owned human', () => {
    assert.equal(isIamOwnedIdentity({ iam_owned: 1, account_type: 'human' }), true);
    assert.equal(isIamOwnedIdentity({ iam_owned: 0 }), false);
  });

  it('detects ai@ service identity lane', () => {
    const ai = {
      iam_owned: 1,
      downgrade_protected: 1,
      account_type: 'agent',
      email: 'ai@inneranimalmedia.com',
    };
    assert.equal(isIamServiceIdentity(ai), true);
    assert.equal(isIamServiceIdentityLane(ai), true);
    assert.equal(isIamServiceIdentity({ iam_owned: 1, account_type: 'human' }), false);
  });

  it('exports Sam operator person uuid constant', () => {
    assert.equal(SAM_OPERATOR_PERSON_UUID, '550e8400-e29b-41d4-a716-446655440001');
  });
});
