/**
 * Dashboard project session context — memory + instructions from project_memory for chat turns.
 */
import { readProjectDashboardMemory } from './project-dashboard-memory.js';

function trim(v) {
  return v == null ? '' : String(v).trim();
}

/**
 * @param {any} env
 * @param {string|null|undefined} projectRef projects.id or workspace_projects.id
 * @param {string|null|undefined} [workspaceId]
 */
export async function loadSessionProjectContextSystemBlock(env, projectRef, workspaceId = null) {
  const ref = trim(projectRef);
  if (!env?.DB || !ref) return '';

  let projectId = ref;
  try {
    const { resolveChatProjectId } = await import('./project-chat-link.js');
    const linked = await resolveChatProjectId(env, ref, workspaceId);
    if (linked) projectId = linked;
  } catch {
    /* use ref as-is */
  }

  let memory = '';
  let instructions = '';
  try {
    const row = await readProjectDashboardMemory(env.DB, ref);
    memory = trim(row?.memory);
    instructions = trim(row?.instructions);
  } catch (e) {
    console.warn('[project-session-context] read_dashboard_memory', e?.message ?? e);
  }

  if (!memory && !instructions && projectId !== ref) {
    try {
      const row = await readProjectDashboardMemory(env.DB, projectId);
      memory = trim(row?.memory) || memory;
      instructions = trim(row?.instructions) || instructions;
    } catch {
      /* optional */
    }
  }

  if (!memory && !instructions) return '';

  const parts = [`Project session: ${ref}`];
  if (memory) parts.push(`Project memory:\n${memory}`);
  if (instructions) parts.push(`Project instructions:\n${instructions}`);
  return `## Project session context\n${parts.join('\n\n')}`;
}
