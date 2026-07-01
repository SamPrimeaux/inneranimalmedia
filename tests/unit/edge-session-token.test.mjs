import { describe, it, expect, beforeAll } from 'vitest';
import {
  mintEdgeSessionToken,
  verifyEdgeSessionToken,
  edgeClaimsToSessionPayload,
  isEdgeSessionToken,
  isLegacySessionId,
  resolveSessionFromCookieValue,
} from '../../src/core/auth/edge-session-token.js';

const env = { SESSION_SIGNING_SECRET: 'unit-test-edge-session-secret' };

describe('edge-session-token', () => {
  let token;

  beforeAll(async () => {
    token = await mintEdgeSessionToken(env, {
      sessionId: '11111111-1111-4111-8111-111111111111',
      userId: 'au_test_user',
      tenantId: 'tenant_test',
      workspaceId: 'ws_test',
      email: 'test@example.com',
      personUuid: 'person_test',
      displayName: 'Test User',
      isSuperadmin: false,
      authRev: 2,
      capabilities: { canRunPty: true, canRunMcp: false, canDeploy: true },
      ttlSec: 3600,
    });
  });

  it('mints a verifiable JWT-shaped session token', async () => {
    expect(token).toBeTruthy();
    expect(isEdgeSessionToken(token)).toBe(true);
    const claims = await verifyEdgeSessionToken(env, token);
    expect(claims?.sub).toBe('au_test_user');
    expect(claims?.sid).toBe('11111111-1111-4111-8111-111111111111');
    expect(claims?.rev).toBe(2);
    expect(claims?.cap?.pty).toBe(1);
    expect(claims?.cap?.mcp).toBe(0);
    expect(claims?.cap?.dep).toBe(1);
  });

  it('rejects tampered tokens', async () => {
    const bad = `${token}tampered`;
    expect(await verifyEdgeSessionToken(env, bad)).toBeNull();
  });

  it('maps claims to getSession payload shape', async () => {
    const claims = await verifyEdgeSessionToken(env, token);
    const payload = edgeClaimsToSessionPayload(claims);
    expect(payload.edge).toBe(true);
    expect(payload.user_id).toBe('au_test_user');
    expect(payload.workspace_id).toBe('ws_test');
    expect(payload.capabilities.canRunPty).toBe(true);
  });

  it('detects legacy UUID session ids', () => {
    expect(isLegacySessionId('11111111-1111-4111-8111-111111111111')).toBe(true);
    expect(isLegacySessionId(token)).toBe(false);
  });

  it('resolves JWT cookie values without legacy fallback', async () => {
    const resolved = await resolveSessionFromCookieValue(env, token);
    expect(resolved.legacy).toBe(false);
    expect(resolved.sessionId).toBe('11111111-1111-4111-8111-111111111111');
    expect(resolved.claims?.sub).toBe('au_test_user');
  });
});
