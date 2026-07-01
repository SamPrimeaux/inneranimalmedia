import { describe, it, expect } from 'vitest';
import {
  compactFeatureFlagsForJwt,
  expandFeatureFlagsFromJwt,
} from '../../src/core/auth/feature-flags-cache.js';
import { edgeClaimsToSessionPayload } from '../../src/core/auth/edge-session-token.js';

describe('feature-flags-cache', () => {
  it('round-trips jwt compact flags', () => {
    const flags = { beta_ui: true, legacy_chat: false, new_terminal: true };
    const compact = compactFeatureFlagsForJwt(flags);
    expect(compact).toEqual({ beta_ui: 1, legacy_chat: 0, new_terminal: 1 });
    expect(expandFeatureFlagsFromJwt(compact)).toEqual(flags);
  });

  it('maps ff claim into session payload', () => {
    const payload = edgeClaimsToSessionPayload({
      sid: 's1',
      sub: 'au_1',
      ff: { beta_ui: 1, legacy_chat: 0 },
      cap: { pty: 1, mcp: 0, dep: 0 },
    });
    expect(payload.feature_flags).toEqual({ beta_ui: true, legacy_chat: false });
  });
});
