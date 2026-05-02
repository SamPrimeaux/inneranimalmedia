import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FolderOpen,
  Github,
  Terminal,
  Database,
  Search,
  Plus,
  Clock,
  Settings,
  ShieldCheck,
  Server,
} from 'lucide-react';

export type AgentsamWorkspaceRow = {
  id: string;
  display_name: string;
  slug: string;
  workspace_type?: string | null;
  r2_prefix?: string | null;
  github_repo?: string | null;
  updated_at?: number | null;
  status?: string | null;
};

interface WorkspaceLauncherProps {
  onClose: () => void;
  onOpenLocalFolder?: () => void;
  onConnectWorkspace?: () => void;
  authWorkspaceId?: string | null;
  setAuthWorkspaceId: (id: string) => void;
  setWorkspaceDisplayName?: (name: string | null) => void;
  setToastMsg: (msg: string | null) => void;
}

function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
  return s || 'workspace';
}

function formatRelativeTime(updatedAt: number | null | undefined): string {
  if (updatedAt == null || !Number.isFinite(Number(updatedAt))) return 'recently';
  const sec = Number(updatedAt) > 1e12 ? Math.floor(Number(updatedAt) / 1000) : Math.floor(Number(updatedAt));
  const now = Math.floor(Date.now() / 1000);
  const d = Math.max(0, now - sec);
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} hours ago`;
  return `${Math.floor(d / 86400)} days ago`;
}

/**
 * Workspace switchboard: loads agentsam_workspace rows from GET /api/workspaces/list.
 */
export const WorkspaceLauncher: React.FC<WorkspaceLauncherProps> = ({
  onClose,
  onOpenLocalFolder,
  onConnectWorkspace,
  authWorkspaceId,
  setAuthWorkspaceId,
  setWorkspaceDisplayName,
  setToastMsg,
}) => {
  const [activeFilter, setActiveFilter] = useState<'all' | 'local' | 'github' | 'r2' | 'ssh'>('all');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<AgentsamWorkspaceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uiMode, setUiMode] = useState<'list' | 'create'>('list');
  const [createStep, setCreateStep] = useState<1 | 2>(1);
  const [createKind, setCreateKind] = useState<'local' | 'github' | 'r2' | 'ssh' | null>(null);
  const [newName, setNewName] = useState('');
  const [extraField, setExtraField] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/workspaces/list', { credentials: 'same-origin' });
      if (!r.ok) throw new Error('Failed to load workspaces');
      const data = (await r.json()) as { workspaces?: AgentsamWorkspaceRow[] };
      setRows(Array.isArray(data.workspaces) ? data.workspaces : []);
    } catch (e) {
      console.error('[WorkspaceLauncher]', e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const filtered = useMemo(() => {
    let list = [...rows];
    if (activeFilter === 'local') {
      list = list.filter((w) => ['ide', 'scratch'].includes(String(w.workspace_type || '').toLowerCase()));
    } else if (activeFilter === 'github') {
      list = list.filter((w) => w.github_repo != null && String(w.github_repo).trim() !== '');
    } else if (activeFilter === 'r2') {
      list = list.filter((w) => w.r2_prefix != null && String(w.r2_prefix).trim() !== '');
    } else if (activeFilter === 'ssh') {
      list = list.filter((w) => String(w.workspace_type || '').toLowerCase() === 'client');
    }

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((w) => {
        const dn = (w.display_name || '').toLowerCase();
        const sl = (w.slug || '').toLowerCase();
        const r2 = (w.r2_prefix || '').toLowerCase();
        const gh = (w.github_repo || '').toLowerCase();
        return dn.includes(q) || sl.includes(q) || r2.includes(q) || gh.includes(q);
      });
    }
    return list;
  }, [rows, activeFilter, search]);

  const activeWorkspaceLabel = useMemo(() => {
    if (!authWorkspaceId?.trim()) return '';
    const w = rows.find((x) => x.id === authWorkspaceId);
    return w?.display_name?.trim() || '';
  }, [authWorkspaceId, rows]);

  const activateWorkspace = async (ws: AgentsamWorkspaceRow) => {
    try {
      const r = await fetch('/api/settings/workspaces/active', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ws.id }),
      });
      const data = (await r.json().catch(() => ({}))) as {
        success?: boolean;
        workspace?: { id: string; display_name: string; slug: string };
      };
      if (r.ok && data.success && data.workspace) {
        setAuthWorkspaceId(data.workspace.id);
        setWorkspaceDisplayName?.(data.workspace.display_name);
        try {
          const raw = localStorage.getItem('iam_recent_workspaces');
          const prev = raw ? (JSON.parse(raw) as unknown) : [];
          const arr = Array.isArray(prev) ? prev : [];
          const entry = {
            id: ws.id,
            display_name: ws.display_name,
            workspace_type: ws.workspace_type ?? 'ide',
            slug: ws.slug,
            updated_at:
              ws.updated_at != null
                ? Number(ws.updated_at)
                : Math.floor(Date.now() / 1000),
          };
          const next = [entry, ...arr.filter((x: { id?: string }) => x?.id !== ws.id)].slice(
            0,
            5,
          );
          localStorage.setItem('iam_recent_workspaces', JSON.stringify(next));
        } catch {
          /* ignore */
        }
        setToastMsg(`Switched to ${ws.display_name}`);
        onClose();
        return;
      }
      throw new Error('sync failed');
    } catch {
      setToastMsg('Workspace saved locally — sync failed.');
      setAuthWorkspaceId(ws.id);
      setWorkspaceDisplayName?.(ws.display_name);
      try {
        const raw = localStorage.getItem('iam_recent_workspaces');
        const prev = raw ? (JSON.parse(raw) as unknown) : [];
        const arr = Array.isArray(prev) ? prev : [];
        const entry = {
          id: ws.id,
          display_name: ws.display_name,
          workspace_type: ws.workspace_type ?? 'ide',
          slug: ws.slug,
          updated_at: Math.floor(Date.now() / 1000),
        };
        const next = [entry, ...arr.filter((x: { id?: string }) => x?.id !== ws.id)].slice(0, 5);
        localStorage.setItem('iam_recent_workspaces', JSON.stringify(next));
      } catch {
        /* ignore */
      }
      onClose();
    }
  };

  const submitCreate = async () => {
    const name = newName.trim();
    if (!name) {
      setCreateError('Name is required.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    const slug = slugify(name);

    let body: Record<string, unknown> = {
      name,
      slug,
    };

    if (createKind === 'local') {
      body = {
        ...body,
        workspace_type: 'ide',
        r2_prefix: null,
        github_repo: null,
      };
    } else if (createKind === 'github') {
      const repo = extraField.trim();
      if (!repo) {
        setCreateError('Repository URL required.');
        setCreating(false);
        return;
      }
      body = { ...body, workspace_type: 'project', github_repo: repo };
    } else if (createKind === 'r2') {
      const prefix = extraField.trim();
      if (!prefix) {
        setCreateError('R2 prefix required.');
        setCreating(false);
        return;
      }
      body = { ...body, workspace_type: 'project', r2_prefix: prefix };
    } else if (createKind === 'ssh') {
      body = { ...body, workspace_type: 'client' };
    } else {
      setCreateError('Pick a workspace type.');
      setCreating(false);
      return;
    }

    try {
      const r = await fetch('/api/workspaces', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await r.json().catch(() => ({}))) as {
        workspace?: AgentsamWorkspaceRow;
        error?: string;
      } & AgentsamWorkspaceRow;
      if (!r.ok) {
        setCreateError(typeof data.error === 'string' ? data.error : 'Create failed');
        setCreating(false);
        return;
      }
      const row = data.workspace ?? data;
      const ws: AgentsamWorkspaceRow = {
        id: String(row.id),
        display_name: String(row.display_name || name),
        slug: String(row.slug || slug),
        workspace_type: row.workspace_type ?? undefined,
        r2_prefix: row.r2_prefix ?? null,
        github_repo: row.github_repo ?? null,
        updated_at: row.updated_at != null ? Number(row.updated_at) : undefined,
      };
      setRows((prev) => [ws, ...prev.filter((x) => x.id !== ws.id)]);
      await activateWorkspace(ws);
      setUiMode('list');
      setCreateStep(1);
      setCreateKind(null);
      setNewName('');
      setExtraField('');
    } catch (e) {
      setCreateError(String(e instanceof Error ? e.message : e));
    } finally {
      setCreating(false);
    }
  };

  const filters = [
    { id: 'all' as const, label: 'All Projects', icon: <Server size={14} /> },
    { id: 'local' as const, label: 'Local', icon: <FolderOpen size={14} /> },
    { id: 'github' as const, label: 'GitHub', icon: <Github size={14} /> },
    { id: 'r2' as const, label: 'R2 Buckets', icon: <Database size={14} /> },
    { id: 'ssh' as const, label: 'SSH', icon: <Terminal size={14} /> },
  ];

  const typeCards = (
    <div className="grid grid-cols-2 gap-3 px-2">
      {(
        [
          ['local', 'Local', 'IDE / scratch', FolderOpen],
          ['github', 'GitHub', 'Linked repo', Github],
          ['r2', 'R2', 'Bucket prefix', Database],
          ['ssh', 'SSH', 'Remote client', Terminal],
        ] as const
      ).map(([id, title, sub, Icon]) => (
        <button
          key={id}
          type="button"
          onClick={() => {
            setCreateKind(id);
            setCreateStep(2);
            setExtraField('');
            setCreateError(null);
          }}
          className={`p-4 rounded-xl border text-left transition-all ${
            createKind === id
              ? 'border-[var(--solar-cyan)] bg-[var(--bg-panel)]'
              : 'border-[var(--border-subtle)] hover:border-[var(--solar-cyan)]/40'
          }`}
        >
          <Icon size={20} className="text-[var(--solar-cyan)] mb-2" />
          <p className="text-sm font-semibold text-[var(--text-heading)]">{title}</p>
          <p className="text-[11px] text-[var(--text-muted)]">{sub}</p>
        </button>
      ))}
    </div>
  );

  return (
    <div className="workspace-launcher fixed inset-0 z-[100] flex items-center justify-center bg-[var(--bg-app)]/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="w-full max-w-4xl h-[600px] bg-[var(--bg-panel)] border border-[var(--border-main)] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="p-6 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--solar-cyan)]/10 flex items-center justify-center text-[var(--solar-cyan)]">
              <Server size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[var(--text-heading)]">Switch Workspace</h2>
              <p className="text-sm text-[var(--text-muted)]">
                Select or create a development environment
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-[var(--bg-app)] rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
          >
            <Plus size={20} className="rotate-45" />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="w-64 border-r border-[var(--border-subtle)] bg-[var(--bg-app)]/50 p-4 space-y-1">
            {filters.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setActiveFilter(f.id)}
                disabled={uiMode === 'create'}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  activeFilter === f.id
                    ? 'bg-[var(--bg-panel)] text-[var(--solar-cyan)] shadow-sm border border-[var(--border-subtle)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-panel)]/50'
                } ${uiMode === 'create' ? 'opacity-40 pointer-events-none' : ''}`}
              >
                {f.icon}
                {f.label}
              </button>
            ))}

            <div className="pt-8 px-3">
              <p className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-muted)] mb-4">
                Operations
              </p>
              <button
                type="button"
                onClick={() => {
                  setUiMode('create');
                  setCreateStep(1);
                  setCreateKind(null);
                  setNewName('');
                  setExtraField('');
                  setCreateError(null);
                }}
                className="w-full flex items-center gap-3 text-sm text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors py-2"
              >
                <Plus size={14} /> New Workspace
              </button>
              <button
                type="button"
                onClick={() => onConnectWorkspace?.()}
                className="w-full flex items-center gap-3 text-sm text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors py-2"
              >
                <Settings size={14} /> Manage Environments
              </button>
            </div>
          </div>

          <div className="flex-1 flex flex-col min-w-0">
            {uiMode === 'list' ? (
              <>
                <div className="p-4 border-b border-[var(--border-subtle)]">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={16} />
                    <input
                      type="text"
                      placeholder="Search workspaces (name, slug, repo, R2)…"
                      className="w-full bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:border-[var(--solar-cyan)]/50 transition-all font-sans"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {loading ? (
                    <div className="h-full flex items-center justify-center text-[var(--text-muted)] animate-pulse">
                      Loading workspaces…
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className="text-[var(--text-muted)] text-center py-16 text-sm">
                      No workspaces match this filter.
                    </div>
                  ) : (
                    filtered.map((w) => (
                      <div
                        key={w.id}
                        className="flex items-center gap-3 p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)]/40 hover:bg-[var(--bg-hover)]/50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-[var(--text-heading)] truncate">
                              {w.display_name || w.slug}
                            </span>
                            {w.workspace_type ? (
                              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-[var(--solar-cyan)]/15 text-[var(--solar-cyan)]">
                                {w.workspace_type}
                              </span>
                            ) : null}
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)] mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                            {w.r2_prefix ? <span>R2: {w.r2_prefix}</span> : null}
                            {w.github_repo ? <span>GH: {w.github_repo}</span> : null}
                            <span className="flex items-center gap-1">
                              <Clock size={10} /> {formatRelativeTime(w.updated_at)}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void activateWorkspace(w)}
                          className="shrink-0 px-4 py-2 rounded-lg bg-[var(--solar-cyan)]/20 text-[var(--solar-cyan)] text-xs font-bold hover:bg-[var(--solar-cyan)]/30"
                        >
                          Open
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    className="text-xs text-[var(--solar-cyan)] font-semibold"
                    onClick={() => {
                      if (createStep === 2) {
                        setCreateStep(1);
                        setCreateKind(null);
                        setCreateError(null);
                      } else {
                        setUiMode('list');
                      }
                    }}
                  >
                    ← Back
                  </button>
                </div>

                {createStep === 1 ? (
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-[var(--text-heading)]">Workspace type</h3>
                    {typeCards}
                  </div>
                ) : (
                  <div className="space-y-4 max-w-md">
                    <label className="block">
                      <span className="text-[11px] uppercase text-[var(--text-muted)] font-bold">
                        Display name
                      </span>
                      <input
                        className="mt-1 w-full bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="My workspace"
                      />
                    </label>
                    {createKind === 'github' ? (
                      <label className="block">
                        <span className="text-[11px] uppercase text-[var(--text-muted)] font-bold">
                          GitHub repo URL
                        </span>
                        <input
                          className="mt-1 w-full bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm font-mono text-[12px]"
                          value={extraField}
                          onChange={(e) => setExtraField(e.target.value)}
                          placeholder="https://github.com/org/repo"
                        />
                      </label>
                    ) : null}
                    {createKind === 'r2' ? (
                      <label className="block">
                        <span className="text-[11px] uppercase text-[var(--text-muted)] font-bold">
                          R2 prefix
                        </span>
                        <input
                          className="mt-1 w-full bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm font-mono text-[12px]"
                          value={extraField}
                          onChange={(e) => setExtraField(e.target.value)}
                          placeholder="my-bucket/prefix/"
                        />
                      </label>
                    ) : null}

                    {createError ? (
                      <p className="text-[12px] text-red-400">{createError}</p>
                    ) : null}

                    <button
                      type="button"
                      disabled={creating}
                      onClick={() => void submitCreate()}
                      className="w-full py-2.5 rounded-lg bg-[var(--solar-cyan)] text-black text-xs font-bold uppercase tracking-wide disabled:opacity-50"
                    >
                      {creating ? 'Creating…' : 'Create workspace'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="p-4 bg-[var(--bg-app)] border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px] gap-3">
          <div className="flex items-center gap-3 text-[var(--text-muted)] shrink-0">
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
              <ShieldCheck size={12} className="text-[var(--solar-green)]" /> Authenticated
            </span>
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
              <Server size={12} /> D1 Active
            </span>
          </div>
          <p className="text-[var(--text-muted)] font-mono truncate max-w-[55%] text-right">
            {activeWorkspaceLabel || ''}
          </p>
        </div>
      </div>
    </div>
  );
};
