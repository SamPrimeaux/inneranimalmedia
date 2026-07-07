/**
 * Dashboard project session context — memory + instructions + client execution bindings.
 */
import { readProjectDashboardMemory } from './project-dashboard-memory.js';
import {
  parseWorkspaceMetadata,
  resolveWorkspaceBindings,
} from './agentsam-workspace.js';

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
 * Full execution row + parsed metadata for project-scoped chat.
 * @param {any} env
 * @param {string|null|undefined} projectRef
 * @param {string|null|undefined} [workspaceId]
 */
export async function resolveProjectExecutionContext(env, projectRef, workspaceId = null) {
  const ref = trim(projectRef);
  if (!env?.DB || !ref) return { bindings: null, metadata: {} };

  let lookupRef = ref;
  try {
    const { resolveChatProjectId } = await import('./project-chat-link.js');
    const linked = await resolveChatProjectId(env, ref, workspaceId);
    if (linked) lookupRef = linked;
  } catch {
    /* use ref */
  }

  const bindings = await resolveWorkspaceBindings(env, lookupRef);
  if (!bindings?.workspaceId) return { bindings, metadata: {} };

  let metadata = {};
  try {
    const wsRow = await env.DB.prepare(
      `SELECT metadata_json FROM agentsam_workspace WHERE id = ? LIMIT 1`,
    )
      .bind(bindings.workspaceId)
      .first();
    metadata = parseWorkspaceMetadata(wsRow?.metadata_json);
  } catch {
    /* optional */
  }

  return { bindings, metadata, lookupRef };
}

/**
 * Execution bindings for the active project (from agentsam_workspace via project_id).
 * @param {Awaited<ReturnType<typeof resolveWorkspaceBindings>>} bindings
 * @param {Record<string, unknown>} [metadata]
 */
export function formatProjectClientBindingsBlock(bindings, metadata = {}) {
  if (!bindings) return '';
  const isPlatformProject =
    bindings.workerName === 'inneranimalmedia' ||
    bindings.workspaceId === 'ws_inneranimalmedia' ||
    bindings.slug === 'inneranimalmedia';

  const heading = isPlatformProject
    ? '## IAM platform Worker bindings (this project)'
    : '## Client Worker bindings (this project)';

  const d1Line =
    bindings.d1Binding && bindings.d1DatabaseId
      ? isPlatformProject
        ? `D1 **${bindings.d1Binding}**: \`inneranimalmedia-business\` (\`${bindings.d1DatabaseId}\`)`
        : `D1 **${bindings.d1Binding}**: database id \`${bindings.d1DatabaseId}\` (client D1 — not inneranimalmedia-business)`
      : bindings.d1DatabaseId
        ? `D1: \`${bindings.d1DatabaseId}\``
        : null;

  const lines = [
    heading,
    bindings.workerName
      ? `Worker: **${bindings.workerName}**${bindings.deployUrl ? ` → ${bindings.deployUrl}` : ''}`
      : null,
    bindings.workspaceId ? `execution_workspace_id: ${bindings.workspaceId}` : null,
    bindings.slug ? `workspace_slug: ${bindings.slug}` : null,
    d1Line,
    bindings.r2Bucket
      ? isPlatformProject
        ? `R2 **ASSETS**: \`${bindings.r2Bucket}\` (+ AUTORAG_BUCKET, ARTIFACTS per wrangler.production.toml)`
        : `R2 **WEBSITE_ASSETS**: \`${bindings.r2Bucket}\``
      : null,
    bindings.kvNamespaceId
      ? isPlatformProject
        ? `KV **SESSION_CACHE**: \`${bindings.kvNamespaceId}\``
        : `KV **CMS_CACHE**: \`${bindings.kvNamespaceId}\``
      : null,
    bindings.githubRepo ? `github_repo: ${bindings.githubRepo}` : null,
    bindings.rootPath ? `root_path: ${bindings.rootPath}` : null,
  ].filter((line) => line !== null);

  if (isPlatformProject) {
    lines.push(
      '',
      'Full platform surface includes Vectorize lanes, HYPERDRIVE, Durable Objects, and worker services — cite wrangler.production.toml / docs/platform/worker-env-production when the user asks for complete IAM bindings.',
    );
  } else {
    lines.push(
      '',
      'Workers AI binding name in client wrangler: **AGENTSAM_WAI**.',
      'Do NOT substitute inneranimalmedia platform bindings (inneranimalmedia-business, AUTORAG_BUCKET, IAM Vectorize indexes) for this client project unless the user explicitly asks about the IAM platform worker.',
    );
  }

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
