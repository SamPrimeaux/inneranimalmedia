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
  // Image generation task_type alias → catalog tool (850)
  image_generation: 'imgx_generate_image',
  meshyai_text_to_3d: 'meshy_text_to_3d',
  meshyai_image_to_3d: 'meshy_image_to_3d',
  meshyai_remesh: 'meshy_remesh',
  meshyai_retexture: 'meshy_retexture',
  meshyai_rigging: 'meshy_rig',
  meshyai_animation: 'meshy_animate',
  meshyai_convert: 'meshy_convert',
  meshyai_resize: 'meshy_resize',
  meshyai_uv_unwrap: 'meshy_uv_unwrap',
  meshyai_get_task: 'meshy_get_task_status',
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
 * All comparable forms of a tool key (short alias + agentsam_* + catalog redirect).
 * Used so allowlist checks treat d1_query ≡ agentsam_d1_query.
 * @param {string} rawKey
 * @returns {Set<string>}
 */
export function expandToolKeyAliases(rawKey) {
  const out = new Set();
  const add = (v) => {
    const s = String(v ?? '').trim();
    if (!s) return;
    out.add(s);
    out.add(s.toLowerCase());
  };
  const raw = String(rawKey ?? '').trim();
  if (!raw) return out;
  add(raw);
  const resolved = resolveCatalogDispatchToolKey(raw);
  add(resolved);
  const lower = raw.toLowerCase();
  if (lower.startsWith('agentsam_')) {
    add(raw.slice('agentsam_'.length));
    add(resolveCatalogDispatchToolKey(raw.slice('agentsam_'.length)));
  } else {
    add(`agentsam_${raw}`);
    add(resolveCatalogDispatchToolKey(`agentsam_${raw}`));
  }
  return out;
}

/**
 * @param {string} toolName
 * @param {Iterable<string>|null|undefined} allowlist
 */
export function allowlistHasTool(toolName, allowlist) {
  if (!allowlist) return false;
  const list = [...allowlist].filter(Boolean);
  if (!list.length) return false;
  const aliases = expandToolKeyAliases(toolName);
  for (const entry of list) {
    for (const a of expandToolKeyAliases(entry)) {
      if (aliases.has(a)) return true;
    }
  }
  return false;
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
