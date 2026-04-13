import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Github,
  Folder,
  ExternalLink,
  Loader2,
  RefreshCw,
  Lock,
  ChevronRight,
  ChevronDown,
  File as FileIcon,
  Trash2,
  FilePlus,
  Search,
} from 'lucide-react';
import type { ActiveFile } from '../types';

type GhItem = {
  name: string;
  path: string;
  type: 'file' | 'dir';
  sha?: string;
  size?: number;
};

function utf8ToBase64(text: string) {
  return btoa(unescape(encodeURIComponent(text)));
}

export const GitHubExplorer: React.FC<{
  onOpenInEditor?: (file: ActiveFile) => void;
  expandRepoFullName?: string | null;
  onExpandRepoConsumed?: () => void;
}> = ({ onOpenInEditor, expandRepoFullName, onExpandRepoConsumed }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [repos, setRepos] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [repoFilter, setRepoFilter] = useState('');
  const [expandedRepo, setExpandedRepo] = useState<string | null>(null);
  const [pathByRepo, setPathByRepo] = useState<Record<string, string>>({});
  const [itemsByRepoPath, setItemsByRepoPath] = useState<Record<string, GhItem[]>>({});
  const [loadingPath, setLoadingPath] = useState<string | null>(null);

  const fetchRepos = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/integrations/github/repos', { credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401 || res.status === 400) setIsAuthenticated(false);
        setLoadError(typeof data.message === 'string' ? data.message : data.error || `HTTP ${res.status}`);
        setRepos([]);
        return;
      }
      const list = Array.isArray(data) ? data : data.repos || [];
      setRepos(list);
      setIsAuthenticated(true);
    } catch (err) {
      setIsAuthenticated(false);
      setLoadError(err instanceof Error ? err.message : 'Failed to load repos');
      setRepos([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchRepos();
  }, []);

  const filteredRepos = useMemo(() => {
    const q = repoFilter.trim().toLowerCase();
    if (!q) return repos;
    return repos.filter((r) => {
      const fn = String(r.full_name || r.name || '').toLowerCase();
      return fn.includes(q);
    });
  }, [repos, repoFilter]);

  const defaultBranchFor = (fullName: string) => {
    const r = repos.find((x) => x.full_name === fullName);
    const b = r?.default_branch;
    return typeof b === 'string' && b.trim() ? b.trim() : 'main';
  };

  const cacheKey = (fullName: string, path: string) => `${fullName}::${path}`;

  const loadContents = useCallback(async (fullName: string, path: string, branch: string): Promise<void> => {
    const [owner, repo] = fullName.split('/');
    if (!owner || !repo) return;
    const ck = cacheKey(fullName, path);
    setLoadingPath(ck);
    try {
      const qs = new URLSearchParams();
      if (path) qs.set('path', path);
      if (branch) qs.set('ref', branch);
      const res = await fetch(
        `/api/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents?${qs}`,
        { credentials: 'same-origin' },
      );
      const data = await res.json();
      if (!res.ok) {
        setItemsByRepoPath((prev) => ({ ...prev, [ck]: [] }));
        setLoadError(typeof data.message === 'string' ? data.message : `List failed (${res.status})`);
        return;
      }
      const list = Array.isArray(data) ? data : [];
      const mapped: GhItem[] = list.map((it: any) => ({
        name: it.name,
        path: it.path,
        type: it.type === 'dir' ? 'dir' : 'file',
        sha: it.sha,
        size: it.size,
      }));
      mapped.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      setItemsByRepoPath((prev) => ({ ...prev, [ck]: mapped }));
      setLoadError(null);
    } catch {
      setItemsByRepoPath((prev) => ({ ...prev, [ck]: [] }));
    } finally {
      setLoadingPath(null);
    }
  }, []);

  useEffect(() => {
    const fn = expandRepoFullName?.trim();
    if (!fn) return;
    if (isLoading) return;
    setExpandedRepo(fn);
    setPathByRepo((p) => ({ ...p, [fn]: '' }));
    const br = defaultBranchFor(fn);
    void (async () => {
      await loadContents(fn, '', br);
      onExpandRepoConsumed?.();
    })();
  }, [expandRepoFullName, loadContents, onExpandRepoConsumed, repos, isLoading]);

  const toggleRepo = (fullName: string) => {
    if (expandedRepo === fullName) {
      setExpandedRepo(null);
      return;
    }
    setExpandedRepo(fullName);
    setPathByRepo((p) => ({ ...p, [fullName]: '' }));
    void loadContents(fullName, '', defaultBranchFor(fullName));
  };

  const enterDir = (fullName: string, path: string) => {
    setPathByRepo((p) => ({ ...p, [fullName]: path }));
    void loadContents(fullName, path, defaultBranchFor(fullName));
  };

  const openFile = async (fullName: string, filePath: string) => {
    if (!onOpenInEditor) return;
    const [owner, repo] = fullName.split('/');
    if (!owner || !repo) return;
    const branch = defaultBranchFor(fullName);
    try {
      const qs = new URLSearchParams({ path: filePath });
      qs.set('ref', branch);
      const res = await fetch(
        `/api/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents?${qs}`,
        { credentials: 'same-origin' },
      );
      const data = await res.json();
      if (!res.ok || data.type !== 'file' || typeof data.content !== 'string') return;
      const raw = String(data.content).replace(/\n/g, '');
      const binary = atob(raw);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const text = new TextDecoder().decode(bytes);
      const baseName = filePath.split('/').pop() || filePath;
      onOpenInEditor({
        name: data.name || baseName,
        content: text,
        originalContent: text,
        githubPath: filePath,
        githubRepo: fullName,
        githubSha: typeof data.sha === 'string' ? data.sha : undefined,
        githubBranch: branch,
      });
    } catch (e) {
      console.error(e);
    }
  };

  const createNewFile = async (fullName: string, cwd: string) => {
    const name = window.prompt('New file name (relative to current folder)', 'new-file.txt');
    if (!name || !name.trim()) return;
    const [owner, repo] = fullName.split('/');
    if (!owner || !repo) return;
    const branch = defaultBranchFor(fullName);
    const rel = name.trim().replace(/^\/+/, '');
    const pathSeg = cwd ? `${cwd}/${rel}` : rel;
    try {
      const res = await fetch(
        `/api/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            path: pathSeg,
            message: 'Create file via Agent Sam',
            content: utf8ToBase64('\n'),
            branch,
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(typeof data.message === 'string' ? data.message : 'Create failed');
        return;
      }
      void loadContents(fullName, cwd, branch);
      if (onOpenInEditor) {
        onOpenInEditor({
          name: rel.split('/').pop() || rel,
          content: '\n',
          originalContent: '\n',
          githubPath: pathSeg,
          githubRepo: fullName,
          githubSha: data.content?.sha || data.sha,
          githubBranch: branch,
        });
      }
    } catch (e) {
      console.error(e);
      window.alert('Create failed');
    }
  };

  const deleteItem = async (fullName: string, cwd: string, it: GhItem) => {
    if (it.type === 'dir') {
      window.alert('Delete folder from GitHub.com (API needs empty tree).');
      return;
    }
    if (!it.sha) {
      window.alert('Missing file sha; refresh and try again.');
      return;
    }
    if (!window.confirm(`Delete ${it.path} on GitHub?`)) return;
    const [owner, repo] = fullName.split('/');
    if (!owner || !repo) return;
    const branch = defaultBranchFor(fullName);
    try {
      const res = await fetch(
        `/api/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            path: it.path,
            message: 'Delete via Agent Sam',
            sha: it.sha,
            branch,
          }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        window.alert(typeof data.message === 'string' ? data.message : 'Delete failed');
        return;
      }
      void loadContents(fullName, cwd, branch);
    } catch (e) {
      console.error(e);
      window.alert('Delete failed');
    }
  };

  const handleConnect = () => {
    window.location.href = '/api/oauth/github/start?return_to=/dashboard/agent';
  };

  if (!isAuthenticated) {
    return (
      <div className="w-full h-full bg-[var(--bg-panel)] flex flex-col items-center justify-center p-6 text-center">
        <div className="p-10 bg-[var(--text-main)]/5 rounded-full mb-6 border border-dashed border-[var(--text-main)]/20 relative">
          <Github size={48} className="text-[var(--text-main)] opacity-80" />
          <div className="absolute top-0 right-0 bg-[var(--bg-panel)] p-1 rounded-full border border-[var(--border-subtle)]">
            <Lock size={12} className="text-[var(--text-muted)]" />
          </div>
        </div>
        <h3 className="text-[14px] font-bold mb-2 uppercase tracking-widest text-[var(--text-heading)]">GitHub</h3>
        <p className="text-[11px] font-mono text-[var(--text-muted)] mb-8 max-w-[220px]">
          Connect GitHub OAuth to list repos, browse, open, create, save, and delete files (per repo permissions).
        </p>
        <button
          type="button"
          onClick={handleConnect}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-[var(--text-main)] text-[var(--bg-panel)] hover:brightness-110 rounded text-[11px] font-bold transition-all w-full max-w-[220px]"
        >
          <ExternalLink size={14} /> Connect GitHub
        </button>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-[var(--bg-panel)] flex flex-col text-[var(--text-main)] overflow-hidden min-h-0">
      <div className="px-3 py-2 border-b border-[var(--border-subtle)] flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Github size={14} />
            <span className="text-[11px] font-bold tracking-widest uppercase">Repositories</span>
          </div>
          <button
            type="button"
            onClick={() => void fetchRepos()}
            disabled={isLoading}
            className="p-1 hover:bg-[var(--bg-hover)] rounded disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="flex items-center gap-1 rounded border border-[var(--border-subtle)]/50 px-2 py-1">
          <Search size={12} className="text-[var(--text-muted)] shrink-0" />
          <input
            type="search"
            value={repoFilter}
            onChange={(e) => setRepoFilter(e.target.value)}
            placeholder="Filter repos…"
            className="w-full bg-transparent text-[11px] outline-none placeholder:text-[var(--text-muted)]"
          />
        </div>
        {loadError && (
          <p className="text-[10px] text-[var(--solar-orange)] font-mono break-words">{loadError}</p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2 min-h-0">
        {filteredRepos.length === 0 && !isLoading && (
          <div className="p-4 text-center">
            <p className="text-[10px] text-[var(--text-muted)] italic">No repositories match.</p>
          </div>
        )}
        <div className="flex flex-col gap-1">
          {filteredRepos.map((repo) => {
            const fullName = repo.full_name as string;
            const open = expandedRepo === fullName;
            const cwd = pathByRepo[fullName] ?? '';
            const ck = cacheKey(fullName, cwd);
            const items = itemsByRepoPath[ck] || [];
            const loading = loadingPath === ck;
            const branch = defaultBranchFor(fullName);
            return (
              <div key={repo.id} className="rounded-lg border border-[var(--border-subtle)]/40 overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleRepo(fullName)}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--bg-hover)] text-left text-[12px]"
                >
                  {open ? (
                    <ChevronDown size={14} className="text-[var(--text-muted)] shrink-0" />
                  ) : (
                    <ChevronRight size={14} className="text-[var(--text-muted)] shrink-0" />
                  )}
                  <Folder size={14} className="text-[var(--text-muted)] shrink-0" />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="font-bold truncate">{repo.name}</span>
                    <span className="text-[9px] text-[var(--text-muted)] truncate">{fullName}</span>
                    <span className="text-[8px] text-[var(--text-muted)] font-mono">branch: {branch}</span>
                  </div>
                </button>
                {open && (
                  <div className="px-2 pb-2 pl-2 border-t border-[var(--border-subtle)]/30">
                    <div className="flex items-center gap-1 py-1">
                      <button
                        type="button"
                        className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-[var(--bg-hover)] hover:bg-[var(--border-subtle)]"
                        onClick={() => void createNewFile(fullName, cwd)}
                        title="New file in current folder"
                      >
                        <FilePlus size={12} /> New file
                      </button>
                    </div>
                    {cwd && (
                      <button
                        type="button"
                        className="text-[10px] font-mono text-[var(--solar-cyan)] mb-1 hover:underline"
                        onClick={() => {
                          const parts = cwd.split('/');
                          parts.pop();
                          enterDir(fullName, parts.join('/'));
                        }}
                      >
                        .. up
                      </button>
                    )}
                    {cwd && (
                      <div className="text-[9px] font-mono text-[var(--text-muted)] truncate mb-1">{cwd}</div>
                    )}
                    {loading && (
                      <div className="flex items-center gap-2 py-2 text-[10px] text-[var(--text-muted)]">
                        <Loader2 size={12} className="animate-spin" /> Loading…
                      </div>
                    )}
                    {!loading &&
                      items.map((it) => (
                        <div
                          key={it.path}
                          className="flex items-center gap-1 group rounded hover:bg-[var(--bg-hover)] pr-1"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              if (it.type === 'dir') enterDir(fullName, it.path);
                              else void openFile(fullName, it.path);
                            }}
                            className="flex flex-1 min-w-0 items-center gap-2 px-2 py-1.5 text-left text-[11px]"
                          >
                            {it.type === 'dir' ? (
                              <Folder size={12} className="text-[var(--solar-cyan)] shrink-0" />
                            ) : (
                              <FileIcon size={12} className="text-[var(--text-muted)] shrink-0" />
                            )}
                            <span className="truncate">{it.name}</span>
                          </button>
                          {it.type === 'file' && (
                            <button
                              type="button"
                              className="p-1 opacity-60 hover:opacity-100 text-[var(--text-muted)] hover:text-[var(--solar-orange)] shrink-0"
                              title="Delete file"
                              onClick={(e) => {
                                e.stopPropagation();
                                void deleteItem(fullName, cwd, it);
                              }}
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
