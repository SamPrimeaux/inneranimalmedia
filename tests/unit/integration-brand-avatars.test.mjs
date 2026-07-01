import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveIntegrationIconUrl } from '../../src/core/integration-brand-avatars.js';

describe('integration-brand-avatars', () => {
  it('prefers catalog icon_url when set', () => {
    const url = 'https://imagedelivery.net/example/custom/avatar';
    assert.equal(resolveIntegrationIconUrl('cloudflare_oauth', url, 'cloudflare'), url);
  });

  it('falls back to brand map for known providers', () => {
    const cf = resolveIntegrationIconUrl('cloudflare_oauth', null, 'cloudflare');
    assert.match(cf || '', /8e623df0-6bd7-4314-87c3-8b377e53e700/);
    const mcp = resolveIntegrationIconUrl('inneranimalmedia-mcp-server', null, 'mcp');
    assert.match(mcp || '', /0b4355d1-1883-4819-0c62-cdd1d6289f00/);
  });
});
