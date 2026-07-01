import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolvePlatformD1AuthUserId,
  resolvePlatformSupabaseUserId,
  resolvePlatformSupabaseWorkspaceUuid,
  resolvePlatformOperatorEmailPrimary,
  PLATFORM_D1_AUTH_USER_ID,
  PLATFORM_SUPABASE_USER_ID_PRIMARY,
  PLATFORM_SUPABASE_WORKSPACE_UUID,
  PLATFORM_OPERATOR_EMAIL_PRIMARY,
} from '../../src/core/platform-identity-constants.js';

describe('platform-identity-constants', () => {
  it('defaults to canonical operator ids', () => {
    assert.equal(resolvePlatformD1AuthUserId({}), PLATFORM_D1_AUTH_USER_ID);
    assert.equal(resolvePlatformSupabaseUserId({}), PLATFORM_SUPABASE_USER_ID_PRIMARY);
    assert.equal(resolvePlatformSupabaseWorkspaceUuid({}), PLATFORM_SUPABASE_WORKSPACE_UUID);
    assert.equal(resolvePlatformOperatorEmailPrimary({}), PLATFORM_OPERATOR_EMAIL_PRIMARY);
  });

  it('respects env overrides', () => {
    assert.equal(
      resolvePlatformD1AuthUserId({ IAM_D1_AUTH_USER_ID: 'au_cd1d8f5ccce9e15a' }),
      'au_cd1d8f5ccce9e15a',
    );
    assert.equal(
      resolvePlatformSupabaseWorkspaceUuid({
        IAM_SUPABASE_WORKSPACE_ID: '105ac2d1-8e61-4cec-80c8-ef2a0902448d',
      }),
      '105ac2d1-8e61-4cec-80c8-ef2a0902448d',
    );
  });
});
