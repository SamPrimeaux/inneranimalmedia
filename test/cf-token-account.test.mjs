import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  looksLikeCfAccountId,
  listCfAccountsForToken,
  resolveCfAccountFromAccessToken,
} from '../src/core/cf-token-account.js';

describe('cf-token-account', () => {
  it('looksLikeCfAccountId accepts 32-char hex only', () => {
    assert.equal(looksLikeCfAccountId('ede6590ac0d2fb7daf155b35653457b2'), true);
    assert.equal(looksLikeCfAccountId('Cloudflare'), false);
  });

  it('resolveCfAccountFromAccessToken returns first account', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      assert.match(String(url), /\/accounts$/);
      return {
        ok: true,
        json: async () => ({
          success: true,
          result: [
            { id: 'acct_connor', name: 'Connor CF' },
            { id: 'acct_other', name: 'Other' },
          ],
        }),
      };
    };
    try {
      const out = await resolveCfAccountFromAccessToken('oauth-token');
      assert.equal(out?.id, 'acct_connor');
      assert.equal(out?.name, 'Connor CF');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('listCfAccountsForToken surfaces API failure', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: false, status: 403, json: async () => ({}) });
    try {
      const out = await listCfAccountsForToken('bad');
      assert.equal(out.ok, false);
      assert.equal(out.accounts.length, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
