import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isOpenWebCatalogConfig,
  resolveOpenWebDispatchTarget,
  SEARCH_WEB_HANDLER_CONFIG,
} from '../../src/core/open-web-catalog-dispatch.js';

test('search_web config resolves dispatch target and is not generic ai', () => {
  assert.equal(resolveOpenWebDispatchTarget(SEARCH_WEB_HANDLER_CONFIG, 'search_web'), 'search_web');
  assert.equal(isOpenWebCatalogConfig(SEARCH_WEB_HANDLER_CONFIG, 'search_web'), true);
  assert.equal(SEARCH_WEB_HANDLER_CONFIG.execution_lane, 'open_web_search');
  assert.equal(SEARCH_WEB_HANDLER_CONFIG.env_key, 'TAVILY_API_KEY');
  assert.equal(SEARCH_WEB_HANDLER_CONFIG.not_browser, true);
});

test('legacy dispatcher-only config still routes', () => {
  assert.equal(resolveOpenWebDispatchTarget({ dispatcher: 'web_fetch' }, 'web_fetch'), 'web_fetch');
});
