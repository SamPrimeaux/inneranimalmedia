/**
 * Align dashboard + agent session to a projects.id build lane (repo/worker/D1).
 * Server POST /api/projects/:id/activate sets auth_users.active_workspace_id;
 * client mirrors workspace + session project for chat/todos.
 */
import { writeSessionProject } from './freshChatSession';
import { writeChatGithubContext } from '../../components/ChatAssistant/types';

export type ProjectWorkBindings = {
  workspaceId: string | null;
  slug: string | null;
  name: string | null;
  projectId: string | null;
  githubRepo: string | null;
  rootPath: string | null;
  workerName: string | null;
  deployUrl: string | null;
  d1DatabaseId: string | null;
};

export type ActivateProjectWorkContextResult = {
  ok: boolean;
  executionWorkspaceId: string | null;
  bindings: ProjectWorkBindings | null;
  workspaceActivated: boolean;
  error?: string;
};

const EXEC_WS_KEY = 'iam:execution-workspace-id';

export function readExecutionWorkspaceId(): string | null {
  try {
    return sessionStorage.getItem(EXEC_WS_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

function writeExecutionWorkspaceId(id: string | null) {
  try {
    if (id) sessionStorage.setItem(EXEC_WS_KEY, id);
    else sessionStorage.removeItem(EXEC_WS_KEY);
  } catch {
    /* ignore */
  }
}

function normalizeBindings(raw: unknown): ProjectWorkBindings | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  return {
    workspaceId: b.workspaceId != null ? String(b.workspaceId).trim() || null : null,
    slug: b.slug != null ? String(b.slug).trim() || null : null,
    name: b.name != null ? String(b.name).trim() || null : null,
    projectId: b.projectId != null ? String(b.projectId).trim() || null : null,
    githubRepo: b.githubRepo != null ? String(b.githubRepo).trim() || null : null,
    rootPath: b.rootPath != null ? String(b.rootPath).trim() || null : null,
    workerName: b.workerName != null ? String(b.workerName).trim() || null : null,
    deployUrl: b.deployUrl != null ? String(b.deployUrl).trim() || null : null,
    d1DatabaseId: b.d1DatabaseId != null ? String(b.d1DatabaseId).trim() || null : null,
  };
}

export type SwitchWorkspaceFn = (
  id: string,
  meta?: { displayName?: string; slug?: string; github_repo?: string | null; sync?: boolean },
) => Promise<void>;

export type PersistGithubRepoFn = (repoFullName: string, workspaceIdOverride?: string | null) => Promise<void>;

/**
 * POST activate + sync client workspace/session/github context.
 */
export async function activateProjectWorkContext(
  projectId: string,
  projectName: string,
  opts: {
    switchWorkspace: SwitchWorkspaceFn;
    persistGithubRepo?: PersistGithubRepoFn;
    currentWorkspaceId?: string | null;
    githubContextStorageKey?: string;
  },
): Promise<ActivateProjectWorkContextResult> {
  const pid = projectId.trim();
  if (!pid) return { ok: false, executionWorkspaceId: null, bindings: null, workspaceActivated: false, error: 'missing_project_id' };

  const r = await fetch(`/api/projects/${encodeURIComponent(pid)}/activate`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const data = (await r.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    execution_workspace_id?: string | null;
    workspace_activated?: boolean;
    bindings?: unknown;
    project?: { name?: string };
  };

  if (!r.ok || !data.ok) {
    return {
      ok: false,
      executionWorkspaceId: null,
      bindings: null,
      workspaceActivated: false,
      error: data.error || `HTTP ${r.status}`,
    };
  }

  const bindings = normalizeBindings(data.bindings);
  const executionWorkspaceId =
    (data.execution_workspace_id && String(data.execution_workspace_id).trim()) ||
    bindings?.workspaceId ||
    null;
  const displayName = data.project?.name?.trim() || projectName.trim() || pid;

  writeSessionProject({ id: pid, name: displayName });
  writeExecutionWorkspaceId(executionWorkspaceId);

  if (executionWorkspaceId && executionWorkspaceId !== (opts.currentWorkspaceId || '').trim()) {
    await opts.switchWorkspace(executionWorkspaceId, {
      displayName: bindings?.name || displayName,
      slug: bindings?.slug || undefined,
      github_repo: bindings?.githubRepo || null,
      sync: false,
    });
  }

  if (bindings?.githubRepo && opts.persistGithubRepo && executionWorkspaceId) {
    await opts.persistGithubRepo(bindings.githubRepo, executionWorkspaceId);
  }

  if (bindings?.githubRepo && opts.githubContextStorageKey) {
    try {
      writeChatGithubContext(opts.githubContextStorageKey, {
        repo: bindings.githubRepo,
        path: null,
        branch: 'main',
        content: null,
        content_truncated: false,
        content_sha: null,
      });
    } catch {
      /* optional */
    }
  }

  window.dispatchEvent(
    new CustomEvent('iam_project_work_context', {
      detail: { projectId: pid, projectName: displayName, executionWorkspaceId, bindings },
    }),
  );

  return {
    ok: true,
    executionWorkspaceId,
    bindings,
    workspaceActivated: Boolean(data.workspace_activated),
  };
}
