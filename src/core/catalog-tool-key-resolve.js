/**
 * Canonical agentsam_tools.tool_key resolution for dispatch + validation.
 * Keeps OAuth allowlist aliases (github_get_tree) and model aliases (agentsam_github_tree) in sync.
 */

/** Legacy terminal tool names → canonical sandbox catalog row. */
export const LEGACY_TERMINAL_TOOL_REDIRECT = Object.freeze({
  terminal_execute: 'agentsam_terminal_sandbox',
  terminal_run: 'agentsam_terminal_sandbox',
  terminal_wrangler: 'agentsam_terminal_sandbox',
  run_command: 'agentsam_terminal_sandbox',
  bash: 'agentsam_terminal_sandbox',
});

/** Public / UI / OAuth allowlist aliases → production agentsam_tools.tool_key (477 remaster names). */
export const LEGACY_CATALOG_TOOL_KEY_REDIRECT = Object.freeze({
  agentsam_github_get_tree: 'agentsam_github_tree',
  github_get_tree: 'agentsam_github_tree',
  github_tree: 'agentsam_github_tree',
  github_file: 'agentsam_github_read',
  github_read: 'agentsam_github_read',
  agentsam_github_read_file: 'agentsam_github_read',
  agentsam_github_get_file: 'agentsam_github_read',
  github_repos: 'agentsam_github_repo_list',
  github_list_repos: 'agentsam_github_repo_list',
  agentsam_github_list_repos: 'agentsam_github_repo_list',
  github_read_many: 'agentsam_github_read_many',
  agentsam_github_batch_read: 'agentsam_github_read_many',
  github_create_file: 'agentsam_github_write',
  github_update_file: 'agentsam_github_write',
  d1_query: 'agentsam_d1_query',
  d1_write: 'agentsam_d1_write',
  d1_migrate: 'agentsam_d1_migrate',
  // Provider-native names + legacy builtin → in-app catalog crunch tool
  code_execution: 'agentsam_code_interpreter',
  code_interpreter: 'agentsam_code_interpreter',
  python_execute: 'agentsam_code_interpreter',
  agentsam_python_execute: 'agentsam_code_interpreter',
  // Draw / Excalidraw — open surface only (848)
  excalidraw_open: 'agentsam_excalidraw',
});

/**
 * @param {string} rawKey
 * @returns {string}
 */
export function resolveCatalogDispatchToolKey(rawKey) {
  const k = String(rawKey ?? '').trim();
  if (!k) return '';
  return (
    LEGACY_TERMINAL_TOOL_REDIRECT[k] ||
    LEGACY_TERMINAL_TOOL_REDIRECT[k.toLowerCase()] ||
    LEGACY_CATALOG_TOOL_KEY_REDIRECT[k] ||
    LEGACY_CATALOG_TOOL_KEY_REDIRECT[k.toLowerCase()] ||
    k
  );
}

/**
 * @param {any} env
 * @param {string} rawKey
 */
export async function loadCatalogToolRowForDispatch(env, rawKey) {
  const raw = String(rawKey ?? '').trim();
  if (!env?.DB || !raw) return null;
  const { loadAgentsamToolRow } = await import('./agentsam-tools-catalog.js');
  const primary = resolveCatalogDispatchToolKey(raw);
  let row = await loadAgentsamToolRow(env, primary);
  if (!row && primary !== raw) row = await loadAgentsamToolRow(env, raw);
  return row;
}

/**
 * Expand OAuth allowlist keys to catalog tool_key values for call-time checks.
 * @param {any} env
 * @param {Iterable<string>} keys
 */
export async function expandOAuthAllowlistKeysToCatalogKeys(env, keys) {
  const out = new Set();
  for (const raw of keys || []) {
    const k = String(raw ?? '').trim().toLowerCase();
    if (!k) continue;
    out.add(k);
    const resolved = resolveCatalogDispatchToolKey(k).toLowerCase();
    if (resolved) out.add(resolved);
    const row = await loadCatalogToolRowForDispatch(env, k);
    if (row?.tool_key) out.add(String(row.tool_key).trim().toLowerCase());
  }
  return out;
}
