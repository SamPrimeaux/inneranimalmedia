import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  integrationOAuthShouldPopup,
  normalizeOAuthPopupProvider,
  oauthPopupCompleteHtml,
} from '../../src/core/oauth-popup-complete.js';

describe('oauth-popup-complete', () => {
  it('normalizes provider keys for postMessage', () => {
    assert.equal(normalizeOAuthPopupProvider('google'), 'google_drive');
    assert.equal(normalizeOAuthPopupProvider('cloudflare_oauth'), 'cloudflare');
    assert.equal(normalizeOAuthPopupProvider('github'), 'github');
  });

  it('popup when stored.popup or agent return path', () => {
    assert.equal(integrationOAuthShouldPopup({ popup: true }, 'https://x/dashboard/settings'), true);
    assert.equal(
      integrationOAuthShouldPopup({}, 'https://inneranimalmedia.com/dashboard/agent'),
      true,
    );
    assert.equal(integrationOAuthShouldPopup({}, 'https://x/dashboard/settings'), false);
  });

  it('emits iam_oauth_done in completion HTML', () => {
    const html = oauthPopupCompleteHtml('cloudflare');
    assert.match(html, /iam_oauth_done/);
    assert.match(html, /cloudflare/);
  });
});
