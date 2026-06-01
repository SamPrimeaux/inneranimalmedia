/**
 * Ask mode — intent-specific read-only evidence tool selection.
 * Ask is read-only, not tool-less: pin repo/file/D1 tools when the question needs grounding.
 */
import { isReadOnlyRepoSearchIntent } from './code-implementation-intent.js';

/** Tools that score well on generic optional caps but fail or mis-route in Ask today. */
export const ASK_GENERIC_SEARCH_FALLBACKS = Object.freeze([
  'knowledge_search',
  'agentsam_memory_search',
  'agentsam_memory_manager',
]);

/** @param {string} message */
export function askPinnedEvidenceToolNames(message) {
  const names = [];
  const t = String(message || '');

  if (codeContextIntent(t) || isReadOnlyRepoSearchIntent(t)) {
    names.push('fs_search_files', 'fs_read_file', 'github_file', 'repo_search');
  }
  if (askDataPlaneIntent(t)) {
    names.push('d1_query', 'd1_schema');
  }

  return [...new Set(names)];
}

/**
 * @param {string} message
 */
export function askDataPlaneIntent(message) {
  return /\bd1\b|agentsam_|agentsam\b|hyperdrive|\bsql\b|query the (?:d1 )?database|from agentsam_|pragma|table_info|\bdb tables?\b|how many rows|\bselect\b.*\bfrom\b/i.test(
    message,
  );
}

/**
 * @param {string} message
 */
export function codeContextIntent(message) {
  return (
    /\b(where is|where are|find|which file|grep|defined in|set before|set in|called from|implemented in|configured in|look up|search (?:the )?(?:repo|codebase|code|project))\b/i.test(
      message,
    ) ||
    /\b(agentsam_|src\/|dashboard\/|migrations\/|\.js\b|\.tsx\b|\.sql\b|handler_key|route_key|workflow_key|tool_key)\b/i.test(
      message,
    ) ||
    /\b(task_type|agent_run|prompt_route|runtime.profile|workflow.executor)\b/i.test(message)
  );
}

/**
 * Boost route requirements for Ask evidence intents; drop generic semantic search caps.
 * @param {string} message
 * @param {import('./agentsam-route-tool-resolver.js').RouteToolRequirements|null|undefined} base
 */
export function augmentAskRouteRequirements(message, base) {
  const req = base
    ? { ...base, required_capabilities: [...(base.required_capabilities || [])], optional_capabilities: [...(base.optional_capabilities || [])] }
    : {
        route_key: 'ask',
        task_type: 'chat',
        allowed_lanes: ['think', 'research', 'inspect', 'observe'],
        required_capabilities: [],
        optional_capabilities: [],
        blocked_capabilities: [],
        max_tools: 8,
        approval_policy: null,
        source: 'ask_evidence',
      };

  const stripGeneric = codeContextIntent(message) || askDataPlaneIntent(message);
  if (stripGeneric) {
    req.optional_capabilities = req.optional_capabilities.filter(
      (c) =>
        !/knowledge_search|memory\.search|memory\.read|context\.search|context_search/i.test(String(c)),
    );
  }

  if (codeContextIntent(message)) {
    req.optional_capabilities.push(
      'code.search',
      'workspace_search',
      'workspace_read_file',
      'github_file',
      'github.read',
    );
  }
  if (askDataPlaneIntent(message)) {
    req.optional_capabilities.push('d1.read', 'd1_query', 'd1.schema');
  }
  req.optional_capabilities = [...new Set(req.optional_capabilities.map(String))];
  return req;
}

/**
 * Pin concrete read-evidence tools by name (catalog SSOT), then merge with scored picks.
 * @param {any} env
 * @param {{ message: string, workspaceId?: string|null, userId?: string|null, tenantId?: string|null, maxTools: number, scoredRows?: Array<Record<string, unknown>> }} opts
 */
export async function compileAskEvidenceToolRows(env, opts) {
  const pinnedNames = askPinnedEvidenceToolNames(opts.message);
  if (!env?.DB || !pinnedNames.length) {
    return { pinnedRows: [], mergedRows: opts.scoredRows || [] };
  }

  const { listAgentsamToolsByKeys, mapCatalogRowsToAgentTools } = await import('./agentsam-tools-catalog.js');
  const rawPinned = await listAgentsamToolsByKeys(env, new Set(pinnedNames.map((n) => n.toLowerCase())), {
    workspaceId: opts.workspaceId,
    limit: opts.maxTools,
  });
  const pinnedRows = mapCatalogRowsToAgentTools(rawPinned);

  const seen = new Set(pinnedRows.map((r) => String(r.name || '').trim()).filter(Boolean));
  const merged = [...pinnedRows];
  for (const row of opts.scoredRows || []) {
    const name = String(row.name || row.tool_name || '').trim();
    if (!name || seen.has(name)) continue;
    if (ASK_GENERIC_SEARCH_FALLBACKS.includes(name) && pinnedNames.length > 0) continue;
    merged.push(row);
    seen.add(name);
    if (merged.length >= opts.maxTools) break;
  }

  return { pinnedRows, mergedRows: merged.slice(0, opts.maxTools) };
}
