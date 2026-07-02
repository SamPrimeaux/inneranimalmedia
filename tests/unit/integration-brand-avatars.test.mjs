import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveIntegrationIconUrl } from '../../src/core/integration-brand-avatars.js';

describe('integration-brand-avatars', () => {
  it('prefers catalog icon_url when set', () => {
    const url = 'https://imagedelivery.net/example/custom/avatar';
    assert.equal(resolveIntegrationIconUrl('cloudflare_oauth', url, 'cloudflare'), url);
  });

  it('uses registry custom_icon_url when catalog is empty', () => {
    const url = 'https://imagedelivery.net/example/registry/avatar';
    assert.equal(resolveIntegrationIconUrl('cloudflare_r2', null, 'cloudflare_r2', url), url);
  });

  it('falls back to brand map for known providers', () => {
    const cf = resolveIntegrationIconUrl('cloudflare_oauth', null, 'cloudflare');
    assert.match(cf || '', /8e623df0-6bd7-4314-87c3-8b377e53e700/);
    const mcp = resolveIntegrationIconUrl('inneranimalmedia-mcp-server', null, 'mcp');
    assert.match(mcp || '', /0b4355d1-1883-4819-0c62-cdd1d6289f00/);
  });

  it('maps hyperdrive to the supabase family icon', () => {
    const url = resolveIntegrationIconUrl('hyperdrive', null, 'hyperdrive');
    assert.match(url || '', /cedec69a-4847-4cec-d4e3-e3dbb5619900/);
  });

  it('uses cloudflare prefix fallback for unmapped CF services', () => {
    const url = resolveIntegrationIconUrl('cloudflare_turnstile', null, null);
    assert.match(url || '', /8e623df0-6bd7-4314-87c3-8b377e53e700/);
  });

  it('uses google prefix fallback for unmapped google services', () => {
    const url = resolveIntegrationIconUrl('google_docs', null, null);
    assert.match(url || '', /c7d1b46f-9614-49d7-19d9-d1c8d2d77500/);
  });
});
