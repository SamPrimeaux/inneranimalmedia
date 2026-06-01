/**
 * Read-only repo audit / multitask report-child tool contract.
 * Pins file evidence tools before route scoring caps; excludes orchestration tools.
 */
import { isReadOnlyFileContextIntent, isReadOnlyRepoSearchIntent } from './code-implementation-intent.js';
import { ASK_GENERIC_SEARCH_FALLBACKS, askDataPlaneIntent } from './ask-evidence-tools.js';

export const READONLY_REPO_AUDIT_ROUTE_KEY = 'readonly_repo_audit';

/** Model-facing evidence tools that must survive selection for repo audit children. */
export const CORE_EVIDENCE_TOOL_NAMES = Object.freeze([
  'fs_read_file',
  'github_file',
  'fs_search_files',
]);

export const OPTIONAL_EVIDENCE_TOOL_NAMES = Object.freeze(['repo_search', 'code_search']);

export const REPORT_CHILD_EXCLUDED_TOOL_NAMES = Object.freeze([
  'agentsam_memory_write',
  'agentsam_memory_save',
  'agent_memory_write',
  'agentsam_memory_search',
  'agentsam_plan',
  'agentsam_plan_create',
  'agentsam_run',
  'spawn_subagent',
  'subagent_spawn',
  'workflow_fanout',
  'worker_deploy',
  'knowledge_search',
  'ss_search_knowledge',
]);

const REPORT_CHILD_EXCLUDED_SET = new Set(REPORT_CHILD_EXCLUDED_TOOL_NAMES);

/**
 * Repo audit / read-only multitask report context (parent or child).
 * @param {unknown} message
 */
export function isReadonlyRepoAuditContext(message) {
  const m = String(message || '');
  if (isReadOnlyRepoSearchIntent(m)) return true;
  if (isReadOnlyFileContextIntent(m)) return true;

  const t = m.toLowerCase();
  if (/\b(find|search|locate)\b/i.test(t) && /\b(checklist|audit)\b/i.test(t)) return true;
  if (/\bfind\b/i.test(t) && /#/.test(m)) return true;
  if (askDataPlaneIntent(m) && /\baudit\b/i.test(t)) return true;

  const auditLike =
    /\baudit\b|\binspect\b|\binventory\b|\btrace\b|\bmatrix\b|runtime\.profile|mode\.controller|evidence|report-only|repo-search|file-read|tool selection|tool contract|tooling_missing/i.test(
      t,
    );
  const codePaths =
    /\bsrc\/|\bmigrations\/|\bdashboard\/|\.js\b|\.tsx\b|runtime-profile|mode-controller|agent-controller|multitask-controller|agentsam_tools|route_requirements/i.test(
      t,
    );
  return auditLike && codePaths;
}

/**
 * @param {unknown} message
 */
export function readonlyRepoAuditPinnedToolNames(message) {
  if (!isReadonlyRepoAuditContext(message)) return [];
  const names = [...CORE_EVIDENCE_TOOL_NAMES, ...OPTIONAL_EVIDENCE_TOOL_NAMES];
  if (askDataPlaneIntent(message)) {
    names.push('d1_query', 'd1_schema');
  }
  return [...new Set(names)];
}

/**
 * @param {unknown} message
 * @returns {string[]}
 */
export function extractRequestedRepoPaths(message) {
  const m = String(message || '');
  const out = new Set();
  const re =
    /\b(?:src|dashboard|migrations|tests)\/[\w./-]+\.(?:js|tsx|ts|jsx|sql|md|mjs|cjs)\b|\b[\w.-]+\.(?:js|tsx|ts|jsx)\b/gi;
  let match;
  while ((match = re.exec(m)) !== null) {
    const p = String(match[0] || '').trim();
    if (p) out.add(p);
  }
  return [...out].slice(0, 32);
}

/**
 * @param {string} message
 * @param {import('./agentsam-route-tool-resolver.js').RouteToolRequirements|null|undefined} base
 */
export function augmentReadonlyRepoAuditRouteRequirements(message, base) {
  const req = base
    ? {
        ...base,
        required_capabilities: [...(base.required_capabilities || [])],
        optional_capabilities: [...(base.optional_capabilities || [])],
        blocked_capabilities: [...(base.blocked_capabilities || [])],
      }
    : {
        route_key: READONLY_REPO_AUDIT_ROUTE_KEY,
        task_type: 'ask',
        allowed_lanes: ['inspect', 'develop', 'research', 'observe'],
        required_capabilities: [],
        optional_capabilities: [],
        blocked_capabilities: [],
        max_tools: 8,
        approval_policy: null,
        source: 'readonly_repo_audit',
      };

  req.allowed_lanes = [...new Set([...(req.allowed_lanes || []), 'inspect', 'develop', 'research', 'observe'])];

  for (const cap of [
    'workspace_read_file',
    'repo_file_read',
    'code_read',
    'code.search',
    'code_search',
    'repo_search',
    'github.read',
    'github_file',
    'file.read',
    'grep',
    'd1.read',
    'd1_query',
    'd1.schema',
  ]) {
    req.optional_capabilities.push(cap);
  }

  for (const cap of [
    'memory.write',
    'memory.save',
    'knowledge_search',
    'knowledge.search',
    'rag.search',
    'context.search',
    'context_search',
    'terminal.execute',
    'worker.deploy',
    'd1.write',
    'python.execute',
  ]) {
    req.blocked_capabilities.push(cap);
  }

  req.optional_capabilities = [...new Set(req.optional_capabilities.map(String))];
  req.blocked_capabilities = [...new Set(req.blocked_capabilities.map(String))];
  req.max_tools = Math.max(Number(req.max_tools) || 0, 8);
  return req;
}

/**
 * Pin evidence catalog rows before scored picks (survives max_tools cap).
 * @param {any} env
 * @param {{ message: string, workspaceId?: string|null, maxTools: number, scoredRows?: Array<Record<string, unknown>> }} opts
 */
export async function compileReadonlyRepoAuditToolRows(env, opts) {
  const pinnedNames = readonlyRepoAuditPinnedToolNames(opts.message);
  if (!env?.DB || !pinnedNames.length) {
    return { pinnedRows: [], mergedRows: opts.scoredRows || [] };
  }

  const { listAgentsamToolsByKeys, mapCatalogRowsToAgentTools } = await import('./agentsam-tools-catalog.js');
  const rawPinned = await listAgentsamToolsByKeys(env, new Set(pinnedNames.map((n) => n.toLowerCase())), {
    workspaceId: opts.workspaceId,
    limit: Math.max(pinnedNames.length, opts.maxTools),
  });
  const pinnedRows = mapCatalogRowsToAgentTools(rawPinned);

  const seen = new Set(pinnedRows.map((r) => String(r.name || '').trim()).filter(Boolean));
  const merged = [...pinnedRows];
  for (const row of opts.scoredRows || []) {
    const name = String(row.name || row.tool_name || '').trim();
    if (!name || seen.has(name)) continue;
    if (REPORT_CHILD_EXCLUDED_SET.has(name)) continue;
    if (ASK_GENERIC_SEARCH_FALLBACKS.includes(name)) continue;
    merged.push(row);
    seen.add(name);
    if (merged.length >= opts.maxTools) break;
  }

  return { pinnedRows, mergedRows: merged.slice(0, opts.maxTools) };
}

/**
 * @param {Array<Record<string, unknown>>} tools
 */
export function filterReportChildOrchestrationTools(tools) {
  return (tools || []).filter((t) => {
    const n = String(t?.name || t?.tool_name || '').trim();
    if (!n) return false;
    if (REPORT_CHILD_EXCLUDED_SET.has(n)) return false;
    if (/^agentsam_(plan|run|memory_write|memory_save)/i.test(n)) return false;
    return true;
  });
}

/**
 * Which core evidence tools are active in agentsam_tools for this workspace.
 * @param {any} env
 * @param {string|null|undefined} workspaceId
 */
export async function resolveActiveCoreEvidenceToolNames(env, workspaceId) {
  if (!env?.DB) return [...CORE_EVIDENCE_TOOL_NAMES];
  const { listAgentsamToolsByKeys } = await import('./agentsam-tools-catalog.js');
  const rows = await listAgentsamToolsByKeys(
    env,
    new Set(CORE_EVIDENCE_TOOL_NAMES.map((n) => n.toLowerCase())),
    { workspaceId, limit: CORE_EVIDENCE_TOOL_NAMES.length },
  );
  const found = new Set(rows.map((r) => String(r.tool_name || r.tool_key || '').trim()).filter(Boolean));
  const active = CORE_EVIDENCE_TOOL_NAMES.filter((n) => found.has(n));
  return active.length ? active : [...CORE_EVIDENCE_TOOL_NAMES];
}

/**
 * @param {string[]} modelFacingToolNames
 * @param {string[]} [requiredNames]
 */
export function assessRequiredEvidenceToolsPresent(modelFacingToolNames, requiredNames = CORE_EVIDENCE_TOOL_NAMES) {
  const compiled = new Set((modelFacingToolNames || []).map((n) => String(n || '').trim()).filter(Boolean));
  const missing = [];
  for (const name of requiredNames) {
    if (!compiled.has(name)) missing.push(name);
  }
  return {
    required_evidence_tools_present: missing.length === 0,
    missing,
    present: requiredNames.filter((n) => compiled.has(n)),
  };
}
