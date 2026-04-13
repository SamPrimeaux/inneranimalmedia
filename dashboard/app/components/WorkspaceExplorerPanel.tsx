import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FolderOpen,
  FileText,
  Clock,
  GitBranch,
  Cloud,
  HardDrive,
  Layers,
  Trash2,
  ExternalLink,
  Plus,
  RefreshCw,
  Search,
  X,
  CheckCircle2,
  AlertCircle,
  Boxes,
} from 'lucide-react';
import type { IdeWorkspaceSnapshot, RecentFileEntry } from '../src/ideWorkspace';
import { diffLineStats } from '../src/ideWorkspace';

type WorkspaceRow = {
  id: string;
  name: string;
  domain?: string | null;
  status?: string | null;
  theme_id?: string | null;
  handle?: string | null;
  project_id?: string | null;
  worker_id?: string | null;
};

type CreateWorkspaceForm = {
  name: string;
  handle: string;
  type: 'local' | 'github' | 'r2';
  folderName: string;
  lastKnownPath: string;
  githubRepo: string;
  r2Bucket: string;
};

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function sourceIcon(source: RecentFileEntry['source']) {
  switch (source) {
    case 'github':
      return <GitBranch size={12} className="text-[var(--solar-cyan)] shrink-0" />;
    case 'r2':
      return <Cloud size={12} className="text-[var(--solar-blue)] shrink-0" />;
    case 'drive':
      return <HardDrive size={12} className="text-[var(--solar-green)] shrink-0" />;
    case 'local':
      return <FolderOpen size={12} className="text-[var(--solar-yellow)] shrink-0" />;
    default:
      return <FileText size={12} className="text-[var(--text-muted)] shrink-0" />;
  }
}

function normalizeWorkspaceHandle(ws: WorkspaceRow): string {
  return String(ws.handle || ws.domain || ws.id || '').trim();
}

function workspaceStatusTone(status?: string | null): string {
  const s = String(status || '').toLowerCase();
  if (s === 'active') return 'text-[var(--solar-green)]';
  if (s === 'error' || s === 'failed') return 'text-[var(--solar-red)]';
  if (s === 'paused' || s === 'idle') return 'text-[var(--solar-yellow)]';
  return 'text-[var(--text-muted)]';
}

export const WorkspaceExplorerPanel: React.FC<{
  ideWorkspace: IdeWorkspaceSnapshot;
  workspaceTitle: string;
  recentFiles: RecentFileEntry[];
  onRefreshRecent: () => void;
  onClearRecentFiles: () => void;
  onOpenRecent: (entry: RecentFileEntry) => void | Promise<void>;
  onOpenLocalFolder: () => void;
  onOpenFilesActivity: () => void;
  onOpenGitHubActivity: () => void;
  onOpenWorkspace: (name: string, path: string) => void;
}> = ({
  ideWorkspace,
  workspaceTitle,
  recentFiles,
  onRefreshRecent,
  onClearRecentFiles,
  onOpenRecent,
  onOpenLocalFolder,
  onOpenFilesActivity,
  onOpenGitHubActivity,
  onOpenWorkspace,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [wsLoading, setWsLoading] = useState(false);
  const [wsError, setWsError] = useState<string | null>(null);
  const [workspaceQuery, setWorkspaceQuery] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [form, setForm] = useState<CreateWorkspaceForm>({
    name: '',
    handle: '',
    type: 'local',
    folderName: '',
    lastKnownPath: '',
    githubRepo: '',
    r2Bucket: '',
  });

  const fetchWorkspaces = useCallback(async () => {
    setWsLoading(true);
    setWsError(null);
    try {
      const r = await fetch('/api/workspaces/list', { credentials: 'same-origin' });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(typeof data?.error === 'string' ? data.error : `Failed to load workspaces (${r.status})`);
      }
      setWorkspaces(Array.isArray(data?.workspaces) ? data.workspaces : []);
    } catch (e) {
      setWsError(e instanceof Error ? e.message : 'Failed to load workspaces');
      setWorkspaces([]);
    } finally {
      setWsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchWorkspaces();
  }, [fetchWorkspaces]);

  const workspaceLine = useMemo(() => {
    if (ideWorkspace.source === 'none') return 'No folder or pinned workspace yet.';
    if (ideWorkspace.source === 'local') return `Local: ${ideWorkspace.folderName}`;
    return `${ideWorkspace.name} — ${ideWorkspace.pathHint}`;
  }, [ideWorkspace]);

  const currentWorkspaceKey = useMemo(() => {
    const title = workspaceTitle.trim().toLowerCase();
    const pathHint =
      ideWorkspace.source !== 'none'
        ? String(ideWorkspace.pathHint || ideWorkspace.name || ideWorkspace.folderName || '').trim().toLowerCase()
        : '';
    return `${title}|${pathHint}`;
  }, [workspaceTitle, ideWorkspace]);

  const filteredWorkspaces = useMemo(() => {
    const q = workspaceQuery.trim().toLowerCase();
    if (!q) return workspaces;
    return workspaces.filter((ws) => {
      const hay = [
        ws.name,
        ws.handle,
        ws.domain,
        ws.status,
        ws.project_id,
        ws.id,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [workspaceQuery, workspaces]);

  const setFormField = useCallback(
    <K extends keyof CreateWorkspaceForm>(key: K, value: CreateWorkspaceForm[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const resetCreateForm = useCallback(() => {
    setForm({
      name: '',
      handle: '',
      type: 'local',
      folderName: '',
      lastKnownPath: '',
      githubRepo: '',
      r2Bucket: '',
    });
    setCreateError(null);
    setCreateSuccess(null);
  }, []);

  const handleCreateWorkspace = useCallback(async () => {
    setCreateError(null);
    setCreateSuccess(null);

    const name = form.name.trim();
    const handle = form.handle.trim();

    if (!name) {
      setCreateError('Workspace name is required.');
      return;
    }
    if (!handle) {
      setCreateError('Workspace handle is required.');
      return;
    }

    const body: Record<string, unknown> = {
      name,
      handle,
      type: form.type,
      folderName: form.folderName.trim() || name,
      lastKnownPath: form.lastKnownPath.trim() || handle,
      lastOpenedAt: Date.now(),
      recentFiles: [],
    };

    if (form.type === 'github' && form.githubRepo.trim()) body.githubRepo = form.githubRepo.trim();
    if (form.type === 'r2' && form.r2Bucket.trim()) body.r2Bucket = form.r2Bucket.trim();

    setCreateLoading(true);
    try {
      const r = await fetch('/api/workspace/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(typeof data?.error === 'string' ? data.error : `Failed to create workspace (${r.status})`);
      }

      setCreateSuccess('Workspace created.');
      await fetchWorkspaces();
      setShowCreate(false);
      resetCreateForm();

      const path = form.lastKnownPath.trim() || handle;
      onOpenWorkspace(name, path);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Workspace creation failed');
    } finally {
      setCreateLoading(false);
    }
  }, [fetchWorkspaces, form, onOpenWorkspace, resetCreateForm]);

  return (
    <div className="w-full h-full bg-[var(--bg-panel)] flex flex-col text-[var(--text-main)] overflow-hidden min-h-0">
      <div className="px-3 py-2 border-b border-[var(--border-subtle)] shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Layers size={14} className="text-[var(--solar-cyan)] shrink-0" />
            <span className="text-[11px] font-bold tracking-widest uppercase truncate">Workspace</span>
          </div>
          <button
            type="button"
            onClick={() => void fetchWorkspaces()}
            title="Refresh workspaces"
            className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-main)]"
          >
            <RefreshCw size={12} />
          </button>
        </div>
        <p className="text-[10px] text-[var(--text-muted)] mt-1 font-mono leading-snug truncate">{workspaceTitle}</p>
      </div>

      <div className="p-3 border-b border-[var(--border-subtle)]/60 shrink-0 space-y-2">
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)]/80 p-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-[var(--text-main)] truncate">
                {ideWorkspace.source === 'none' ? 'No active workspace' : workspaceLine}
              </div>
              <p className="text-[10px] text-[var(--text-muted)] mt-1 font-mono leading-snug break-all">
                {workspaceLine}
              </p>
            </div>
            <div className="shrink-0 flex items-center gap-1">
              {ideWorkspace.source !== 'none' ? (
                <CheckCircle2 size={13} className="text-[var(--solar-green)]" />
              ) : (
                <AlertCircle size={13} className="text-[var(--solar-yellow)]" />
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-2">
            <button
              type="button"
              onClick={onOpenLocalFolder}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[10px] font-semibold bg-[var(--solar-cyan)]/15 text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/35 hover:bg-[var(--solar-cyan)]/25"
            >
              <FolderOpen size={12} /> Open folder
            </button>

            <button
              type="button"
              onClick={onOpenFilesActivity}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[10px] font-semibold border border-[var(--border-subtle)] hover:bg-[var(--bg-hover)]"
            >
              <Cloud size={12} /> Files &amp; R2
            </button>

            <button
              type="button"
              onClick={onOpenGitHubActivity}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[10px] font-semibold border border-[var(--border-subtle)] hover:bg-[var(--bg-hover)]"
            >
              <GitBranch size={12} /> Repos
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border-subtle)]/40 shrink-0">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
          <Clock size={11} />
          Recent files
          <span className="text-[var(--text-main)]/50 font-mono normal-case">({recentFiles.length})</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-main)] px-1.5 py-0.5 rounded flex items-center gap-1"
            onClick={onRefreshRecent}
            title="Refresh recent files"
          >
            <RefreshCw size={11} />
          </button>
          {recentFiles.length > 0 && (
            <button
              type="button"
              className="text-[10px] text-[var(--text-muted)] hover:text-[var(--solar-orange)] px-1.5 py-0.5 rounded flex items-center gap-1"
              onClick={onClearRecentFiles}
              title="Clear list"
            >
              <Trash2 size={11} /> Clear
            </button>
          )}
        </div>
      </div>

      <div className="min-h-[160px] max-h-[34%] overflow-y-auto p-2 border-b border-[var(--border-subtle)]/40">
        {recentFiles.length === 0 ? (
          <p className="text-[11px] text-[var(--text-muted)] px-2 py-6 text-center leading-relaxed">
            Open a file from Files, GitHub, Drive, or R2. It will appear here with a one-line preview and diff summary when
            you have unsaved edits.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {recentFiles.map((entry) => {
              const open = expandedId === entry.id;
              const orig = entry.snapshotOriginal ?? '';
              const work = entry.snapshotWorking ?? '';
              const dirty = orig !== work && orig.length + work.length > 0;
              const stats = dirty ? diffLineStats(orig, work) : { added: 0, removed: 0 };

              return (
                <li
                  key={entry.id}
                  className="rounded-lg border border-[var(--border-subtle)]/50 bg-[var(--bg-app)]/50 overflow-hidden"
                >
                  <div className="flex items-start gap-2 p-2">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left rounded-md focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--solar-cyan)]/50"
                      onClick={() => void onOpenRecent(entry)}
                    >
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {sourceIcon(entry.source)}
                        <span className="text-[12px] font-semibold truncate">{entry.name}</span>
                        {dirty && (
                          <span className="text-[9px] font-mono px-1 rounded bg-[var(--solar-yellow)]/15 text-[var(--solar-yellow)]">
                            modified
                          </span>
                        )}
                      </div>

                      <p className="text-[10px] text-[var(--text-muted)] font-mono truncate mt-0.5" title={entry.label}>
                        {entry.label}
                      </p>

                      <p className="text-[10px] text-[var(--text-muted)]/80 mt-1 line-clamp-2 break-all">
                        {entry.previewOneLine}
                      </p>

                      <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        <span className="text-[9px] text-[var(--text-muted)] font-mono">{timeAgo(entry.openedAt)}</span>
                        {dirty && (stats.added > 0 || stats.removed > 0) && (
                          <span className="text-[9px] font-mono text-[var(--text-muted)]">
                            <span className="text-[var(--solar-green)]">+{stats.added}</span>{' '}
                            <span className="text-[var(--solar-red)]">-{stats.removed}</span> lines
                          </span>
                        )}
                      </div>
                    </button>

                    <button
                      type="button"
                      className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] shrink-0"
                      onClick={() => setExpandedId(open ? null : entry.id)}
                      title={open ? 'Hide details' : 'Show details'}
                    >
                      {open ? <X size={12} /> : <ExternalLink size={12} />}
                    </button>
                  </div>

                  {open && (
                    <div className="px-2 pb-2 pt-0 border-t border-[var(--border-subtle)]/30 space-y-2">
                      {dirty && (
                        <div className="grid grid-cols-1 gap-2 text-[10px] font-mono">
                          <div className="min-w-0">
                            <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] mb-0.5">
                              Working excerpt
                            </div>
                            <pre className="max-h-28 overflow-auto p-2 rounded bg-[var(--bg-panel)] border border-[var(--border-subtle)]/50 whitespace-pre-wrap break-all">
                              {work.slice(0, 2000)}
                            </pre>
                          </div>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void onOpenRecent(entry)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-bold bg-[var(--solar-cyan)]/20 text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/40 hover:bg-[var(--solar-cyan)]/30"
                        >
                          <ExternalLink size={12} /> Open in editor
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border-subtle)]/40 shrink-0 bg-[var(--bg-app)]/30">
        <div className="flex items-center gap-1.5">
          <Boxes size={11} className="text-[var(--text-muted)]" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Available Workspaces</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            title="Create Workspace"
            className="p-1 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-white"
          >
            <Plus size={12} />
          </button>
        </div>
      </div>

      <div className="p-2 border-b border-[var(--border-subtle)]/40 shrink-0">
        <div className="flex items-center gap-2 rounded border border-[var(--border-subtle)] px-2 py-1.5 bg-[var(--bg-app)]">
          <Search size={12} className="text-[var(--text-muted)] shrink-0" />
          <input
            type="search"
            value={workspaceQuery}
            onChange={(e) => setWorkspaceQuery(e.target.value)}
            placeholder="Search workspaces..."
            className="w-full bg-transparent text-[11px] outline-none placeholder:text-[var(--text-muted)]"
          />
        </div>
      </div>

      {showCreate && (
        <div className="p-3 border-b border-[var(--border-subtle)]/40 shrink-0 bg-[var(--bg-app)]/35 space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Create workspace</div>

          <div className="grid grid-cols-1 gap-2">
            <input
              value={form.name}
              onChange={(e) => setFormField('name', e.target.value)}
              placeholder="Workspace name"
              className="w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-2 py-2 text-[11px] outline-none"
            />

            <input
              value={form.handle}
              onChange={(e) => setFormField('handle', e.target.value)}
              placeholder="Workspace handle / slug / domain"
              className="w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-2 py-2 text-[11px] outline-none"
            />

            <select
              value={form.type}
              onChange={(e) => setFormField('type', e.target.value as CreateWorkspaceForm['type'])}
              className="w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-2 py-2 text-[11px] outline-none"
            >
              <option value="local">Local</option>
              <option value="github">GitHub</option>
              <option value="r2">R2</option>
            </select>

            <input
              value={form.folderName}
              onChange={(e) => setFormField('folderName', e.target.value)}
              placeholder="Folder / display name"
              className="w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-2 py-2 text-[11px] outline-none"
            />

            <input
              value={form.lastKnownPath}
              onChange={(e) => setFormField('lastKnownPath', e.target.value)}
              placeholder="Local path or canonical path hint"
              className="w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-2 py-2 text-[11px] outline-none"
            />

            {form.type === 'github' && (
              <input
                value={form.githubRepo}
                onChange={(e) => setFormField('githubRepo', e.target.value)}
                placeholder="owner/repo"
                className="w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-2 py-2 text-[11px] outline-none"
              />
            )}

            {form.type === 'r2' && (
              <input
                value={form.r2Bucket}
                onChange={(e) => setFormField('r2Bucket', e.target.value)}
                placeholder="R2 bucket name"
                className="w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-2 py-2 text-[11px] outline-none"
              />
            )}
          </div>

          {createError ? <div className="text-[11px] text-[var(--solar-red)]">{createError}</div> : null}
          {createSuccess ? <div className="text-[11px] text-[var(--solar-green)]">{createSuccess}</div> : null}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleCreateWorkspace()}
              disabled={createLoading}
              className="px-3 py-1.5 rounded text-[11px] font-semibold bg-[var(--solar-cyan)]/20 text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/40 hover:bg-[var(--solar-cyan)]/30 disabled:opacity-50"
            >
              {createLoading ? 'Creating…' : 'Create workspace'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreate(false);
                resetCreateForm();
              }}
              className="px-3 py-1.5 rounded text-[11px] font-semibold border border-[var(--border-subtle)] hover:bg-[var(--bg-hover)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
        {wsLoading && workspaces.length === 0 && (
          <div className="p-4 text-center">
            <div className="w-4 h-4 border-2 border-[var(--solar-cyan)]/30 border-t-[var(--solar-cyan)] rounded-full animate-spin mx-auto" />
          </div>
        )}

        {!wsLoading && wsError && (
          <div className="px-3 py-4 text-[11px] text-[var(--solar-red)] text-center">{wsError}</div>
        )}

        {!wsLoading && !wsError && filteredWorkspaces.length === 0 && (
          <p className="px-3 py-4 text-[10px] text-[var(--text-muted)] italic text-center">No matching workspaces found.</p>
        )}

        {filteredWorkspaces.map((ws) => {
          const handle = normalizeWorkspaceHandle(ws);
          const isActive =
            currentWorkspaceKey.includes(String(ws.name || '').trim().toLowerCase()) ||
            currentWorkspaceKey.includes(handle.toLowerCase());

          return (
            <button
              key={ws.id}
              type="button"
              onClick={() => onOpenWorkspace(ws.name, handle)}
              className={`w-full text-left p-2 rounded-lg border transition-all group ${
                isActive
                  ? 'border-[var(--solar-cyan)]/50 bg-[var(--solar-cyan)]/8'
                  : 'border-transparent hover:border-[var(--border-subtle)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`text-[12px] font-semibold truncate ${isActive ? 'text-[var(--solar-cyan)]' : 'text-[var(--text-main)]'}`}>
                  {ws.name}
                </span>
                <span className={`text-[9px] font-mono uppercase tracking-tighter shrink-0 ${workspaceStatusTone(ws.status)}`}>
                  {ws.status || 'unknown'}
                </span>
              </div>

              <p className="text-[9px] text-[var(--text-muted)] font-mono truncate mt-0.5">
                {handle || ws.id}
              </p>

              <div className="flex items-center gap-2 mt-1">
                {ws.project_id ? (
                  <span className="text-[9px] text-[var(--text-muted)] font-mono truncate">
                    project: {ws.project_id}
                  </span>
                ) : null}
                {isActive ? (
                  <span className="text-[9px] text-[var(--solar-cyan)] font-mono">active</span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
