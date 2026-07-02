/**
 * Deterministic agentsam_tool_cache keys — shared by MCP and catalog tool executors.
 */
import { hashToolInputJson } from './mcp-tool-execution.js';

/** Tools with side effects — never read/write agentsam_tool_cache. */
export const NON_CACHEABLE_TOOL_KEYS = new Set([
  'search_web',
  'agentsam_memory_save',
  'agentsam_memory_write',
  'agentsam_todo_add',
  'agentsam_r2_upload',
  'agentsam_notify',
  'agentsam_send_email',
  'terminal_execute',
  'deploy',
  'r2_delete',
  'd1_write',
  'excalidraw_plan_map_create',
  'illustration_create',
]);

/**
 * @param {string} toolKey
 */
export function isToolCacheEligible(toolKey) {
  const tk = String(toolKey || '').trim();
  if (!tk) return false;
  return !NON_CACHEABLE_TOOL_KEYS.has(tk);
}

/**
 * Stable sort for cache fingerprinting (matches catalog-tool-executor).
 * @param {unknown} value
 */
export function stableSortValue(value) {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(stableSortValue);
  const out = {};
  for (const k of Object.keys(value).sort()) {
    out[k] = stableSortValue(value[k]);
  }
  return out;
}

/**
 * @param {unknown} toolInput
 */
export function stableSortedJson(toolInput) {
  const sorted = stableSortValue(toolInput ?? {});
  return typeof sorted === 'string' ? sorted : JSON.stringify(sorted === undefined ? {} : sorted);
}

/**
 * @param {string} toolKey
 * @param {unknown} toolInput
 */
export async function buildAgentsamToolCacheKey(toolKey, toolInput) {
  const tk = String(toolKey || '').trim();
  if (!tk || !isToolCacheEligible(tk)) return { cacheKey: null, inputHash: null };
  const inputJson = stableSortedJson(toolInput);
  const inputHash = await hashToolInputJson(toolInput ?? {});
  const cacheKey = await hashToolInputJson(`${tk}:${inputJson}`);
  return { cacheKey, inputHash, inputJson };
}

/**
 * Deterministic cache key: sha256(tool_key + ':' + stableSortedJson(input)).
 * Workspace is enforced at lookup time, not in the key material.
 * @param {string} _workspaceId
 * @param {string} toolName
 * @param {unknown} toolInput
 */
export async function buildMcpToolCacheKey(_workspaceId, toolName, toolInput) {
  const { cacheKey } = await buildAgentsamToolCacheKey(toolName, toolInput);
  return cacheKey;
}
