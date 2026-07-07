/**
 * Dashboard project session context — memory + instructions + client execution bindings.
 */
import { readProjectDashboardMemory } from './project-dashboard-memory.js';
import { resolveWorkspaceBindings } from './agentsam-workspace.js';

function trim(v) {
  return v == null ? '' : String(v).trim();
}

/**
 * @param {any} env
 * @param {string|null|undefined} projectRef
 * @param {string|null|undefined} [workspaceId]
 */
export async function resolveProjectExecutionBindings(env, projectRef, workspaceId = null) {
  const ref = trim(projectRef);
  if (!env?.DB || !ref) return null;

  let lookupRef = ref;
  try {
    const { resolveChatProjectId } = await import('./project-chat-link.js');
    const linked = await resolveChatProjectId(env, ref, workspaceId);
    if (linked) lookupRef = linked;
  } catch {
    /* use ref */
  }

  const row = await resolveWorkspaceBindings(env, lookupRef);
  return row;
}

/**
 * Client Worker binding block — NOT IAM platform inneranimalmedia bindings.
 * @param {Awaited<ReturnType<typeof resolveWorkspaceBindings>>} bindings
 */
export function formatProjectClientBindingsBlock(bindings) {
  if (!bindings) return '';
  const lines = [
    '## Client Worker bindings (this project — not IAM platform)',
    bindings.workerName
      ? `Worker: **${bindings.workerName}**${bindings.deployUrl ? ` → ${bindings.deployUrl}` : ''}`
      : null,
    bindings.workspaceId ? `execution_workspace_id: ${bindings.workspaceId}` : null,
    bindings.slug ? `workspace_slug: ${bindings.slug}` : null,
    bindings.d1Binding && bindings.d1DatabaseId
      ? `D1 **${bindings.d1Binding}**: database id \`${bindings.d1DatabaseId}\` (client D1 — not inneranimalmedia-business)`
      : bindings.d1DatabaseId
        ? `D1: \`${bindings.d1DatabaseId}\``
        : null,
    bindings.r2Bucket ? `R2 **WEBSITE_ASSETS**: \`${bindings.r2Bucket}\`` : null,
    bindings.kvNamespaceId ? `KV **CMS_CACHE**: \`${bindings.kvNamespaceId}\`` : null,
    bindings.githubRepo ? `github_repo: ${bindings.githubRepo}` : null,
    bindings.rootPath ? `root_path: ${bindings.rootPath}` : null,
    '',
    'Workers AI binding name in client wrangler: **AGENTSAM_WAI**.',
    'Do NOT cite inneranimalmedia platform bindings (inneranimalmedia-business D1, AUTORAG_BUCKET, IAM Vectorize indexes, HYPERDRIVE, MOVIEMODE_SERVICE, etc.) for this project unless the user explicitly asks about the IAM platform worker.',
  ].filter((line) => line !== null);
  return lines.join('\n');
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

  let bindingsBlock = '';
  try {
    const bindings = await resolveProjectExecutionBindings(env, ref, workspaceId);
    bindingsBlock = formatProjectClientBindingsBlock(bindings);
  } catch (e) {
    console.warn('[project-session-context] execution_bindings', e?.message ?? e);
  }

  if (!memory && !instructions && !bindingsBlock) return '';

  const parts = [`Project session: ${ref}`];
  if (bindingsBlock) parts.push(bindingsBlock);
  if (memory) parts.push(`Project memory:\n${memory}`);
  if (instructions) parts.push(`Project instructions:\n${instructions}`);
  return `## Project session context\n${parts.join('\n\n')}`;
}
