/**
 * Inspect / project-question tool profile — read-only repo + D1 evidence.
 * Used when task is project_question / inspect / chat-with-repo-ask so we never
 * dump ~100 oauth_visible tools (Gmail MCP schemas break Gemini).
 */
import { codeContextIntent } from './ask-evidence-tools.js';
import { resolveCatalogDispatchToolKey } from './catalog-tool-key-resolve.js';

export const INSPECT_TASK_TYPES = new Set([
  'project_question',
  'ask',
  'summary',
  'chat',
  'research',
  'review',
  'readonly_repo_audit',
]);

export const INSPECT_CORE_PINNED_TOOLS = Object.freeze([
  'fs_read_file',
  'fs_search_files',
  'agentsam_github_read',
  'agentsam_github_tree',
  'agentsam_github_read_many',
  'agentsam_github_search',
  'agentsam_d1_query',
  'agentsam_memory_manager',
  'agentsam_autorag',
]);

/**
 * @param {string} message
 */
export function isRepoInspectIntent(message) {
  const t = String(message || '');
  if (!t.trim()) return false;
  if (codeContextIntent(t)) return true;
  return (
    /\b(inspect|propose|improve|structure|architecture|how (?:do|can|should) we|what should we|overview|inventory|audit|trace)\b/i.test(
      t,
    ) &&
    /\b(repo|codebase|tool|agent|task.?type|routing|profile|workspace|samprimeaux|inneranimalmedia)\b/i.test(
      t,
    )
  );
}

/**
 * @param {{
 *   taskType?: string|null,
 *   routeKey?: string|null,
 *   routeKeyPin?: string|null,
 *   mode?: string|null,
 *   message?: string|null,
 * }} ctx
 */
export function shouldUseInspectToolProfile(ctx) {
  const tt = String(ctx.taskType || '').trim().toLowerCase();
  const message = String(ctx.message || '');
  if (tt === 'project_question') return true;
  if (tt === 'readonly_repo_audit') return true;
  if (tt === 'review' && isRepoInspectIntent(message)) return true;
  if (
    (tt === 'chat' || tt === 'ask' || tt === 'summary' || tt === 'research' || tt === 'review') &&
    isRepoInspectIntent(message)
  ) {
    return true;
  }
  if (!tt && isRepoInspectIntent(message)) return true;
  if (isRepoInspectIntent(message) && !['code', 'code_implementation', 'deploy', 'debug'].includes(tt)) {
    return true;
  }
  return false;
}

/**
 * @param {unknown} env
 * @param {{ userId: string, tenantId?: string|null, workspaceId?: string|null }} scope
 * @param {{ maxTools?: number }} opts
 */
export async function compileInspectToolRows(env, scope, opts = {}) {
  const maxTools = Math.max(1, Math.min(16, Number(opts.maxTools) || 12));
  const { listAgentsamToolsByKeys, mapCatalogRowsToAgentTools } = await import(
    './agentsam-tools-catalog.js'
  );
  const { mapCatalogRowsToMcpParityAgentTools } = await import('./in-app-mcp-oauth-parity.js');

  const resolvedPins = [
    ...new Set(
      INSPECT_CORE_PINNED_TOOLS.map((k) => resolveCatalogDispatchToolKey(k) || k).filter(Boolean),
    ),
  ];

  const rawPinned = await listAgentsamToolsByKeys(env, new Set(resolvedPins.map((k) => k.toLowerCase())), {
    workspaceId: scope.workspaceId,
    limit: Math.max(resolvedPins.length, maxTools),
  });

  const byKey = new Map();
  for (const r of rawPinned || []) {
    const kn = String(r.tool_name || r.tool_key || '')
      .trim()
      .toLowerCase();
    if (kn) byKey.set(kn, r);
    const kk = String(r.tool_key || '')
      .trim()
      .toLowerCase();
    if (kk) byKey.set(kk, r);
  }

  const orderedCatalog = [];
  const seenKeys = new Set();
  for (const key of resolvedPins) {
    const row = byKey.get(String(key).trim().toLowerCase());
    if (!row) continue;
    const id = String(row.tool_name || row.tool_key || '')
      .trim()
      .toLowerCase();
    if (!id || seenKeys.has(id)) continue;
    seenKeys.add(id);
    orderedCatalog.push(row);
  }

  let rows = mapCatalogRowsToMcpParityAgentTools(orderedCatalog);
  if (!rows.length) rows = mapCatalogRowsToAgentTools(orderedCatalog);
  rows = rows.slice(0, maxTools);

  return {
    rows,
    pinned_count: orderedCatalog.length,
    total: rows.length,
    missingPinned: resolvedPins.filter((k) => !seenKeys.has(String(k).trim().toLowerCase())),
  };
}
