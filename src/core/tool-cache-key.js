/**
 * Deterministic agentsam_tool_cache keys — shared by MCP and catalog tool executors.
 */
import { hashToolInputJson } from './mcp-tool-execution.js';

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
 * @param {string} toolKey
 * @param {unknown} toolInput
 */
export async function buildAgentsamToolCacheKey(toolKey, toolInput) {
  const tk = String(toolKey || '').trim();
  if (!tk) return { cacheKey: null, inputHash: null };
  const sorted = stableSortValue(toolInput ?? {});
  const inputJson =
    typeof sorted === 'string' ? sorted : JSON.stringify(sorted === undefined ? {} : sorted);
  const inputHash = await hashToolInputJson(sorted);
  const cacheKey = await hashToolInputJson(`${tk}:${inputJson}`);
  return { cacheKey, inputHash, inputJson };
}

/**
 * MCP path: workspace-scoped prefix (legacy rows may exist under this shape).
 * @param {string} workspaceId
 * @param {string} toolName
 * @param {unknown} toolInput
 */
export async function buildMcpToolCacheKey(workspaceId, toolName, toolInput) {
  const ws = String(workspaceId || '').trim();
  const tn = String(toolName || '').trim();
  if (!ws || !tn) return null;
  const inputHash = await hashToolInputJson(toolInput ?? {});
  if (!inputHash) return null;
  return `${ws}:${tn}:${inputHash}`;
}
