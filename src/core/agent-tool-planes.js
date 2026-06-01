/**
 * Explicit tool planes — who may call what.
 * READ_EVIDENCE: Ask, Plan, Agent, Debug, Multitask (read-only gather)
 * PLAN_ARTIFACT: Plan
 * EXECUTION: Agent, Debug (by policy)
 * DEPLOY: approval-gated, Agent/Multitask, sometimes Debug
 * PARALLEL: Multitask / subagent orchestration
 */

/** @typedef {'read_evidence'|'plan_artifact'|'execution'|'deploy'|'parallel'} ToolPlane */

export const TOOL_PLANE = Object.freeze({
  READ_EVIDENCE: 'read_evidence',
  PLAN_ARTIFACT: 'plan_artifact',
  EXECUTION: 'execution',
  DEPLOY: 'deploy',
  PARALLEL: 'parallel',
});

/** Canonical read-only evidence tools (repo/file/D1 SELECT/RAG/memory search/status read). */
export const READ_EVIDENCE_TOOL_NAMES = Object.freeze([
  'fs_search_files',
  'workspace_search',
  'repo_search',
  'code_search',
  'fs_read_file',
  'fs_read_multiple',
  'file_read',
  'github_file',
  'github_search_code',
  'github_get_file',
  'd1_query',
  'd1_schema',
  'd1_explain',
  'd1_schema_introspect',
  'supabase_query',
  'supabase_schema',
  'supabase_explain',
  'knowledge_search',
  'agentsam_memory_search',
  'agent_memory_search',
  'context_search',
  'ss_search_knowledge',
  'r2_read',
  'platform_info',
  'cdt_take_snapshot',
  'browser_content',
  'wrangler_deployments',
  'logs_read',
  'hyperdrive_query',
  'hyperdrive_schema',
]);

export const PLAN_ARTIFACT_TOOL_NAMES = Object.freeze([
  'plan_create',
  'task_create',
  'agentsam_plan_create',
  'excalidraw_open',
  'artifact_write',
]);

export const EXECUTION_TOOL_NAMES = Object.freeze([
  'fs_write_file',
  'fs_edit_file',
  'github_create_file',
  'github_update_file',
  'terminal_run',
  'terminal_execute',
  'run_command',
  'bash',
  'python_execute',
  'd1_write',
  'd1_batch_write',
  'supabase_write',
]);

export const DEPLOY_TOOL_NAMES = Object.freeze(['worker_deploy', 'deploy']);

export const PARALLEL_TOOL_NAMES = Object.freeze([
  'spawn_subagent',
  'subagent_spawn',
  'workflow_fanout',
]);

export const MEMORY_WRITE_TOOL_NAMES = Object.freeze([
  'agentsam_memory_write',
  'agentsam_memory_save',
  'agent_memory_write',
]);

export const ASK_MUTATION_DENY_TOOL_NAMES = Object.freeze([
  ...EXECUTION_TOOL_NAMES,
  ...DEPLOY_TOOL_NAMES,
  ...MEMORY_WRITE_TOOL_NAMES,
  'browser_navigate',
  'playwright_screenshot',
  'r2_write',
  'r2_put',
  'r2_delete',
  'd1_migrate',
  'wrangler_d1_migrate',
  'pty',
  'pty_run',
]);

const READ_EVIDENCE_SET = new Set(READ_EVIDENCE_TOOL_NAMES);
const MUTATION_SET = new Set(ASK_MUTATION_DENY_TOOL_NAMES);
const MEMORY_WRITE_SET = new Set(MEMORY_WRITE_TOOL_NAMES);
const PLAN_SET = new Set(PLAN_ARTIFACT_TOOL_NAMES);
const DEPLOY_SET = new Set(DEPLOY_TOOL_NAMES);
const PARALLEL_SET = new Set(PARALLEL_TOOL_NAMES);

/**
 * @param {string} toolName
 */
export function isReadEvidenceTool(toolName) {
  const n = String(toolName || '').trim();
  if (!n) return false;
  if (READ_EVIDENCE_SET.has(n)) return true;
  const nl = n.toLowerCase();
  if (nl.includes('memory_search') || nl.includes('knowledge_search')) return true;
  if (nl.startsWith('d1_') && (nl.includes('query') || nl.includes('schema') || nl.includes('explain'))) {
    return true;
  }
  if (nl.startsWith('supabase_') && !nl.includes('write')) return true;
  if (nl.includes('_read') && !nl.includes('write')) return true;
  return false;
}

/**
 * @param {string} toolName
 */
export function isMutationOrExecutionTool(toolName) {
  const n = String(toolName || '').trim();
  if (!n) return false;
  if (MUTATION_SET.has(n)) return true;
  const nl = n.toLowerCase();
  if (nl.includes('write') || nl.includes('_put') || nl.includes('_delete')) return true;
  if (nl.includes('terminal') || nl.includes('deploy') || nl.includes('python_execute')) return true;
  return false;
}

/**
 * @param {string} toolName
 */
export function isMemoryWriteTool(toolName) {
  return MEMORY_WRITE_SET.has(String(toolName || '').trim());
}

/**
 * User explicitly asked to persist memory (Ask exception to memory-write deny).
 * @param {string} [message]
 */
export function explicitMemorySaveIntent(message) {
  const t = String(message || '').trim();
  if (!t) return false;
  return (
    /\b(remember this|save this|store this|save to memory|store in memory|remember that|save that|store that)\b/i.test(
      t,
    ) ||
    (/\b(remember|save|store)\b/i.test(t) &&
      /\b(for later|in memory|to memory|this decision|this preference|this fact)\b/i.test(t))
  );
}

/**
 * @param {string} toolName
 * @returns {ToolPlane|null}
 */
export function toolPlaneForName(toolName) {
  const n = String(toolName || '').trim();
  if (!n) return null;
  if (READ_EVIDENCE_SET.has(n) || isReadEvidenceTool(n)) return TOOL_PLANE.READ_EVIDENCE;
  if (PLAN_SET.has(n)) return TOOL_PLANE.PLAN_ARTIFACT;
  if (DEPLOY_SET.has(n)) return TOOL_PLANE.DEPLOY;
  if (PARALLEL_SET.has(n)) return TOOL_PLANE.PARALLEL;
  if (MUTATION_SET.has(n) || isMutationOrExecutionTool(n)) return TOOL_PLANE.EXECUTION;
  return null;
}

/**
 * Ask mode: keep only read-evidence plane tools in compiled allowlist.
 * @param {string[]} toolNames
 */
export function filterAskReadEvidenceTools(toolNames) {
  return (toolNames || []).filter((name) => {
    const n = String(name || '').trim();
    if (!n) return false;
    if (isMutationOrExecutionTool(n)) return false;
    return isReadEvidenceTool(n);
  });
}
