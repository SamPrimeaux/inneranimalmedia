import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isMobileClientSurface,
  shouldSkipLocalTerminalTunnel,
  formatMobileExecProfilePromptBlock,
} from '../../src/core/mobile-exec-profile.js';

describe('mobile-exec-profile', () => {
  it('detects mobile client surfaces', () => {
    assert.equal(isMobileClientSurface('mobile_ios'), true);
    assert.equal(isMobileClientSurface('mobile_web'), true);
    assert.equal(isMobileClientSurface('desktop_web'), false);
  });

  it('skips local tunnel on mobile unless exec_lane is local', () => {
    assert.equal(shouldSkipLocalTerminalTunnel('mobile_ios', 'auto'), true);
    assert.equal(shouldSkipLocalTerminalTunnel('mobile_ios', 'remote'), true);
    assert.equal(shouldSkipLocalTerminalTunnel('mobile_ios', 'local'), false);
    assert.equal(shouldSkipLocalTerminalTunnel('desktop_web', 'auto'), false);
  });

  it('formats mobile exec prompt block', () => {
    const block = formatMobileExecProfilePromptBlock('mobile_ios', 'remote');
    assert.match(block, /agentsam_terminal_remote/);
    assert.match(block, /Do NOT use agentsam_terminal_local/);
  });
});
