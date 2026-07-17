import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isOpenWebCatalogConfig,
  resolveOpenWebDispatchTarget,
  SEARCH_WEB_HANDLER_CONFIG,
} from '../../src/core/open-web-catalog-dispatch.js';
import {
  buildOpenWebBudgetExhaustedResult,
  isOpenWebBudgetExhaustedResult,
  TAVILY_DEFAULTS,
} from '../../src/core/tavily-open-web-search.js';

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

test('budget exhausted is soft guidance, not a hard error payload', () => {
  const out = buildOpenWebBudgetExhaustedResult({
    scope: 'turn',
    maxCalls: TAVILY_DEFAULTS.max_calls_per_turn,
  });
  assert.equal(out.ok, true);
  assert.equal(out.budget_exhausted, true);
  assert.equal(out.error, undefined);
  assert.equal(out.next_action, 'answer_from_prior_search_results');
  assert.equal(isOpenWebBudgetExhaustedResult(out), true);
  assert.match(String(out.instruction || ''), /Do not call search_web again/i);
});

test('catalog ok mapping treats budget_exhausted as success body', () => {
  const out = buildOpenWebBudgetExhaustedResult({ scope: 'run' });
  // Mirrors executeOpenWebCatalogDispatch soft path:
  const catalogOut =
    out?.budget_exhausted === true
      ? { ok: true, body: out }
      : out?.error
        ? { ok: false, error: String(out.error) }
        : { ok: true, body: out };
  assert.equal(catalogOut.ok, true);
  assert.equal(catalogOut.error, undefined);
  assert.equal(catalogOut.body?.budget_exhausted, true);
  assert.equal(catalogOut.body?.budget_scope, 'run');
});
