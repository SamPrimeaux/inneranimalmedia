/**
 * Catalog dispatch for open-web tools — must not fall through to generic ai_complete.
 * handler_type may be 'ai' (deploy-safe) or 'websearch' (post-migration 457).
 */

/** @param {Record<string, unknown>|null|undefined} config */
export function resolveOpenWebDispatchTarget(config, toolKey = '') {
  const c = config && typeof config === 'object' && !Array.isArray(config) ? config : {};
  const lane = String(c.execution_lane || '').trim();
  const target = String(c.dispatch_target || c.dispatcher || toolKey || '').trim();
  if (lane === 'open_web_search' || target === 'search_web') return 'search_web';
  if (lane === 'web_fetch' || target === 'web_fetch') return 'web_fetch';
  return null;
}

/**
 * @param {Record<string, unknown>|null|undefined} config
 * @param {string} [toolKey]
 */
export function isOpenWebCatalogConfig(config, toolKey = '') {
  return resolveOpenWebDispatchTarget(config, toolKey) != null;
}

/**
 * @param {any} env
 * @param {Record<string, unknown>} config
 * @param {Record<string, unknown>} params
 * @param {Record<string, unknown>} runContext
 * @param {string} [toolKey]
 */
export async function executeOpenWebCatalogDispatch(env, config, params, runContext, toolKey = '') {
  const target = resolveOpenWebDispatchTarget(config, toolKey);
  if (!target) {
    return { ok: false, error: 'open_web_catalog_config_missing_dispatch_target' };
  }
  const { handlers: webHandlers } = await import('../tools/builtin/web.js');
  const fn = webHandlers[target];
  if (typeof fn !== 'function') {
    return { ok: false, error: `open_web handler not registered: ${target}` };
  }
  const out = await fn(params, env, runContext);
  return out?.error ? { ok: false, error: String(out.error) } : { ok: true, body: out };
}

/** Canonical handler_config for search_web (handler_type=ai until migration 457). */
export const SEARCH_WEB_HANDLER_CONFIG = Object.freeze({
  execution_lane: 'open_web_search',
  web_backend: 'tavily',
  dispatch_target: 'search_web',
  dispatcher: 'search_web',
  auth_source: 'platform',
  not_browser: true,
  not_workspace_search: true,
  source_file: 'src/tools/builtin/web.js',
});

/** Canonical handler_config for web_fetch. */
export const WEB_FETCH_HANDLER_CONFIG = Object.freeze({
  execution_lane: 'web_fetch',
  dispatch_target: 'web_fetch',
  dispatcher: 'web_fetch',
  auth_source: 'platform',
  not_browser: true,
  not_workspace_search: true,
  source_file: 'src/tools/builtin/web.js',
});
