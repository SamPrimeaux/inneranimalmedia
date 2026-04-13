/**
 * RemoteExplorer.tsx
 *
 * Unified file explorer for all remote sources:
 *   - GitHub (repos, branches, files)
 *   - Google Drive (files and folders)
 *   - R2 (buckets and objects)
 *
 * Replaces the three separate explorers (GitHubExplorer, GoogleDriveExplorer,
 * R2Explorer) with one component and a source switcher. Same API surface —
 * onOpenInEditor is the only required prop.
 *
 * App.tsx wires all three former activities ('actions', 'drive', 'remote')
 * to this component. The activeSource prop controls which tab is shown.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Github, Cloud, HardDrive, File, Folder, FolderOpen,
  ChevronRight, ChevronDown, RefreshCw, Search, X,
  AlertTriangle, Loader2, GitBranch, Download,
} from 'lucide-react';
import type { ActiveFile } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type RemoteSource = 'github' | 'drive' | 'r2';

interface RemoteExplorerProps {
  /** Which source tab to show on mount */
  activeSource?:         RemoteSource;
  onOpenInEditor:        (file: ActiveFile) => void;
  /** GitHub-specific: expand a specific repo on mount */
  expandRepoFullName?:   string | null;
  onExpandRepoConsumed?: () => void;
}

// ─── GitHub types ─────────────────────────────────────────────────────────────

interface GithubRepo {
  full_name:    string;
  name:         string;
  default_branch: string;
  private:      boolean;
  updated_at:   string;
}

interface GithubTreeItem {
  path:  string;
  type:  'blob' | 'tree';
  sha:   string;
  size?: number;
}

// ─── R2 types ─────────────────────────────────────────────────────────────────

interface R2Object {
  key:           string;
  size:          number;
  lastModified?: string;
}

// ─── Drive types ──────────────────────────────────────────────────────────────

interface DriveFile {
  id:           string;
  name:         string;
  mimeType:     string;
  modifiedTime?: string;
  size?:        string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BUCKETS = ['inneranimalmedia', 'iam-platform', 'iam-docs', 'tools', 'agent-sam'];

function extToLanguage(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescriptreact', js: 'javascript',
    jsx: 'javascriptreact', css: 'css', html: 'html', json: 'json',
    md: 'markdown', py: 'python', sh: 'shell', toml: 'toml', yml: 'yaml', yaml: 'yaml',
  };
  return map[ext] || 'plaintext';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function isTextFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const textExts = new Set([
    'ts', 'tsx', 'js', 'jsx', 'css', 'html', 'htm', 'json', 'md',
    'txt', 'py', 'sh', 'bash', 'toml', 'yml', 'yaml', 'xml', 'svg',
    'env', 'gitignore', 'sql', 'graphql', 'rs', 'go', 'rb', 'php',
  ]);
  return textExts.has(ext);
}

// ─── Source tab config ────────────────────────────────────────────────────────

const SOURCES: { id: RemoteSource; label: string; icon: React.ReactNode }[] = [
  { id: 'github', label: 'GitHub',       icon: <Github   size={13} /> },
  { id: 'drive',  label: 'Drive',        icon: <HardDrive size={13} /> },
  { id: 'r2',     label: 'R2 Storage',   icon: <Cloud    size={13} /> },
];

// ─── Component ────────────────────────────────────────────────────────────────

export const RemoteExplorer: React.FC<RemoteExplorerProps> = ({
  activeSource:      initialSource = 'github',
  onOpenInEditor,
  expandRepoFullName,
  onExpandRepoConsumed,
}) => {
  const [source, setSource] = useState<RemoteSource>(initialSource);

  return (
    <div className="flex flex-col h-full bg-[var(--bg-panel)] overflow-hidden">
      {/* Source switcher */}
      <div className="flex items-center border-b border-[var(--border-subtle)] shrink-0 px-2 pt-2 gap-1">
        {SOURCES.map(s => (
          <button
            key={s.id}
            onClick={() => setSource(s.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t text-[11px] font-semibold transition-colors border-b-2 ${
              source === s.id
                ? 'text-[var(--color-primary)] border-[var(--color-primary)] bg-[var(--bg-hover)]'
                : 'text-[var(--text-muted)] border-transparent hover:text-[var(--text-main)]'
            }`}
          >
            {s.icon}
            {s.label}
          </button>
        ))}
      </div>

      {/* Source panel */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {source === 'github' && (
          <GithubPanel
            onOpenInEditor={onOpenInEditor}
            expandRepoFullName={expandRepoFullName}
            onExpandRepoConsumed={onExpandRepoConsumed}
          />
        )}
        {source === 'drive' && (
          <DrivePanel onOpenInEditor={onOpenInEditor} />
        )}
        {source === 'r2' && (
          <R2Panel onOpenInEditor={onOpenInEditor} />
        )}
      </div>
    </div>
  );
};

// ─── Backward-compat named exports ───────────────────────────────────────────
// App.tsx imports these by their original names. We re-export RemoteExplorer
// under each name with the correct default source pre-set.

export const GitHubExplorer: React.FC<{
  expandRepoFullName?:   string | null;
  onExpandRepoConsumed?: () => void;
  onOpenInEditor:        (file: ActiveFile) => void;
}> = (props) => <RemoteExplorer activeSource="github" {...props} />;

export const GoogleDriveExplorer: React.FC<{
  onOpenInEditor: (file: ActiveFile) => void;
}> = (props) => <RemoteExplorer activeSource="drive" {...props} />;

export const R2Explorer: React.FC<{
  onOpenInEditor: (file: ActiveFile) => void;
}> = (props) => <RemoteExplorer activeSource="r2" {...props} />;

// ─── GitHub panel ─────────────────────────────────────────────────────────────

const GithubPanel: React.FC<{
  onOpenInEditor:        (file: ActiveFile) => void;
  expandRepoFullName?:   string | null;
  onExpandRepoConsumed?: () => void;
}> = ({ onOpenInEditor, expandRepoFullName, onExpandRepoConsumed }) => {
  const [repos,         setRepos]         = useState<GithubRepo[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  const [expandedRepos, setExpandedRepos] = useState<Record<string, GithubTreeItem[]>>({});
  const [loadingRepo,   setLoadingRepo]   = useState<string | null>(null);
  const [expandedDirs,  setExpandedDirs]  = useState<Set<string>>(new Set());
  const [search,        setSearch]        = useState('');
  const [loadingFile,   setLoadingFile]   = useState<string | null>(null);
  const [branches,      setBranches]      = useState<Record<string, string>>({});

  useEffect(() => {
    setLoading(true);
    fetch('/api/github/repos', { credentials: 'same-origin' })
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then((data: { repos?: GithubRepo[] } | GithubRepo[]) => {
        const list = Array.isArray(data) ? data : (data.repos ?? []);
        setRepos(list);
        setError(null);
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!expandRepoFullName) return;
    const repo = repos.find(r => r.full_name === expandRepoFullName);
    if (repo) {
      loadRepoTree(repo);
      onExpandRepoConsumed?.();
    }
  }, [expandRepoFullName, repos]);

  const loadRepoTree = async (repo: GithubRepo) => {
    const fn = repo.full_name;
    if (expandedRepos[fn]) {
      setExpandedRepos(prev => { const n = { ...prev }; delete n[fn]; return n; });
      return;
    }
    setLoadingRepo(fn);
    try {
      const branch = branches[fn] || repo.default_branch;
      const [owner, name] = fn.split('/');
      const res  = await fetch(
        `/api/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/tree?ref=${branch}`,
        { credentials: 'same-origin' }
      );
      const data = await res.json();
      const tree: GithubTreeItem[] = Array.isArray(data.tree) ? data.tree : [];
      setExpandedRepos(prev => ({ ...prev, [fn]: tree }));
    } catch {
      setError('Failed to load repo tree');
    } finally {
      setLoadingRepo(null);
    }
  };

  const openFile = async (repo: GithubRepo, item: GithubTreeItem) => {
    if (!isTextFile(item.path)) return;
    setLoadingFile(item.path);
    try {
      const [owner, name] = repo.full_name.split('/');
      const branch = branches[repo.full_name] || repo.default_branch;
      const qs  = new URLSearchParams({ path: item.path, ref: branch });
      const res = await fetch(
        `/api/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/contents?${qs}`,
        { credentials: 'same-origin' }
      );
      const data = await res.json();
      if (!res.ok || data.type !== 'file') throw new Error('not a file');
      const raw    = String(data.content || '').replace(/\n/g, '');
      const bytes  = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
      const content = new TextDecoder().decode(bytes);
      onOpenInEditor({
        name:        data.name || item.path.split('/').pop() || item.path,
        content,
        originalContent: content,
        githubRepo:  repo.full_name,
        githubPath:  item.path,
        githubSha:   typeof data.sha === 'string' ? data.sha : undefined,
        githubBranch: branch,
        language:    extToLanguage(item.path),
      });
    } catch {
      setError('Failed to load file');
    } finally {
      setLoadingFile(null);
    }
  };

  const filteredRepos = repos.filter(r =>
    r.full_name.toLowerCase().includes(search.toLowerCase())
  );

  const renderTree = (repo: GithubRepo, items: GithubTreeItem[], prefix = '') => {
    const children = items.filter(i => {
      const rel = i.path.slice(prefix.length);
      return i.path.startsWith(prefix) && !rel.slice(1).includes('/') && rel !== '';
    });

    return children.map(item => {
      const isDir   = item.type === 'tree';
      const name    = item.path.split('/').pop() || item.path;
      const isOpen  = expandedDirs.has(item.path);
      const loading = loadingFile === item.path;

      return (
        <div key={item.path}>
          <button
            onClick={() => {
              if (isDir) {
                setExpandedDirs(prev => {
                  const n = new Set(prev);
                  n.has(item.path) ? n.delete(item.path) : n.add(item.path);
                  return n;
                });
              } else {
                openFile(repo, item);
              }
            }}
            className={`w-full flex items-center gap-1.5 px-2 py-0.5 text-[11px] hover:bg-[var(--bg-hover)] transition-colors text-left group ${
              isTextFile(item.path) || isDir ? 'cursor-pointer' : 'cursor-default opacity-50'
            }`}
            style={{ paddingLeft: `${(prefix.split('/').filter(Boolean).length + 1) * 12 + 8}px` }}
          >
            {isDir
              ? isOpen ? <ChevronDown size={10} className="shrink-0 text-[var(--text-muted)]" /> : <ChevronRight size={10} className="shrink-0 text-[var(--text-muted)]" />
              : <span className="w-2.5 shrink-0" />
            }
            {isDir
              ? isOpen ? <FolderOpen size={12} className="shrink-0 text-[var(--solar-yellow)]" /> : <Folder size={12} className="shrink-0 text-[var(--solar-yellow)]" />
              : loading ? <Loader2 size={12} className="shrink-0 animate-spin text-[var(--color-primary)]" /> : <File size={12} className="shrink-0 text-[var(--text-muted)]" />
            }
            <span className="truncate text-[var(--text-main)]">{name}</span>
          </button>
          {isDir && isOpen && renderTree(repo, items, item.path + '/')}
        </div>
      );
    });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2 shrink-0">
        <div className="relative">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter repos..."
            className="w-full bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-2 py-1 pl-7 text-[11px] focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)]"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && <div className="flex items-center justify-center py-8"><Loader2 size={16} className="animate-spin text-[var(--text-muted)]" /></div>}
        {error && <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-[var(--color-danger)]"><AlertTriangle size={12} />{error}</div>}
        {filteredRepos.map(repo => (
          <div key={repo.full_name}>
            <button
              onClick={() => loadRepoTree(repo)}
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--bg-hover)] transition-colors text-left"
            >
              {loadingRepo === repo.full_name
                ? <Loader2 size={12} className="shrink-0 animate-spin text-[var(--color-primary)]" />
                : expandedRepos[repo.full_name]
                  ? <ChevronDown size={12} className="shrink-0 text-[var(--text-muted)]" />
                  : <ChevronRight size={12} className="shrink-0 text-[var(--text-muted)]" />
              }
              <Github size={12} className="shrink-0 text-[var(--text-muted)]" />
              <span className="text-[11px] font-medium text-[var(--text-main)] truncate">{repo.full_name}</span>
              <span className="ml-auto flex items-center gap-1 text-[9px] text-[var(--text-muted)] shrink-0">
                <GitBranch size={9} />{repo.default_branch}
              </span>
            </button>
            {expandedRepos[repo.full_name] && renderTree(repo, expandedRepos[repo.full_name])}
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Drive panel ──────────────────────────────────────────────────────────────

const DrivePanel: React.FC<{ onOpenInEditor: (file: ActiveFile) => void }> = ({ onOpenInEditor }) => {
  const [files,   setFiles]   = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [search,  setSearch]  = useState('');
  const [loading2, setLoading2] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/integrations/gdrive/files', { credentials: 'same-origin' })
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then((data: { files?: DriveFile[] } | DriveFile[]) => {
        const list = Array.isArray(data) ? data : (data.files ?? []);
        setFiles(list);
        setError(null);
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const openFile = async (file: DriveFile) => {
    setLoading2(file.id);
    try {
      const res  = await fetch(`/api/integrations/gdrive/file?fileId=${encodeURIComponent(file.id)}`, { credentials: 'same-origin' });
      const data = await res.json();
      const content = typeof data.content === 'string' ? data.content : '';
      onOpenInEditor({
        name:          file.name,
        content,
        originalContent: content,
        driveFileId:   file.id,
        language:      extToLanguage(file.name),
      });
    } catch {
      setError('Failed to load file');
    } finally {
      setLoading2(null);
    }
  };

  const filtered = files.filter(f => f.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2 flex items-center gap-2 shrink-0">
        <div className="relative flex-1">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter files..."
            className="w-full bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-2 py-1 pl-7 text-[11px] focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)]"
          />
        </div>
        <button onClick={load} className="p-1 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors">
          <RefreshCw size={12} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && <div className="flex justify-center py-8"><Loader2 size={16} className="animate-spin text-[var(--text-muted)]" /></div>}
        {error && <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-[var(--color-danger)]"><AlertTriangle size={12} />{error}</div>}
        {filtered.map(file => (
          <button
            key={file.id}
            onClick={() => openFile(file)}
            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--bg-hover)] transition-colors text-left"
          >
            {loading2 === file.id
              ? <Loader2 size={12} className="shrink-0 animate-spin text-[var(--color-primary)]" />
              : <File size={12} className="shrink-0 text-[var(--text-muted)]" />
            }
            <span className="text-[11px] text-[var(--text-main)] truncate flex-1">{file.name}</span>
            {file.size && <span className="text-[9px] text-[var(--text-muted)] shrink-0">{formatBytes(parseInt(file.size))}</span>}
          </button>
        ))}
        {!loading && filtered.length === 0 && (
          <p className="text-center text-[11px] text-[var(--text-muted)] py-8">No files found</p>
        )}
      </div>
    </div>
  );
};

// ─── R2 panel ─────────────────────────────────────────────────────────────────

const R2Panel: React.FC<{ onOpenInEditor: (file: ActiveFile) => void }> = ({ onOpenInEditor }) => {
  const [bucket,       setBucket]       = useState(BUCKETS[0]);
  const [objects,      setObjects]      = useState<R2Object[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [search,       setSearch]       = useState('');
  const [loadingKey,   setLoadingKey]   = useState<string | null>(null);
  const [prefix,       setPrefix]       = useState('');

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams({ bucket, ...(prefix ? { prefix } : {}) });
    fetch(`/api/r2/list?${qs}`, { credentials: 'same-origin' })
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then((data: { objects?: R2Object[] } | R2Object[]) => {
        const list = Array.isArray(data) ? data : (data.objects ?? []);
        setObjects(list);
        setError(null);
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [bucket, prefix]);

  useEffect(() => { load(); }, [load]);

  const openFile = async (obj: R2Object) => {
    if (!isTextFile(obj.key)) return;
    setLoadingKey(obj.key);
    try {
      const res  = await fetch(`/api/r2/file?bucket=${encodeURIComponent(bucket)}&key=${encodeURIComponent(obj.key)}`, { credentials: 'same-origin' });
      const data = await res.json();
      const content = typeof data.content === 'string' ? data.content : '';
      onOpenInEditor({
        name:          obj.key.split('/').pop() || obj.key,
        content,
        originalContent: content,
        r2Key:         obj.key,
        r2Bucket:      bucket,
        language:      extToLanguage(obj.key),
      });
    } catch {
      setError('Failed to load file');
    } finally {
      setLoadingKey(null);
    }
  };

  const filtered = objects.filter(o => o.key.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2 space-y-2 shrink-0">
        <select
          value={bucket}
          onChange={e => { setBucket(e.target.value); setPrefix(''); }}
          className="w-full bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-2 py-1 text-[11px] focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)]"
        >
          {BUCKETS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <div className="relative">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter objects..."
            className="w-full bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-2 py-1 pl-7 text-[11px] focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)]"
          />
        </div>
        {prefix && (
          <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
            <span className="truncate">{prefix}</span>
            <button onClick={() => setPrefix('')} className="shrink-0 hover:text-[var(--color-danger)]"><X size={10} /></button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && <div className="flex justify-center py-8"><Loader2 size={16} className="animate-spin text-[var(--text-muted)]" /></div>}
        {error && <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-[var(--color-danger)]"><AlertTriangle size={12} />{error}</div>}
        {filtered.map(obj => (
          <button
            key={obj.key}
            onClick={() => openFile(obj)}
            disabled={!isTextFile(obj.key)}
            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--bg-hover)] transition-colors text-left disabled:opacity-40 disabled:cursor-default"
          >
            {loadingKey === obj.key
              ? <Loader2 size={12} className="shrink-0 animate-spin text-[var(--color-primary)]" />
              : <File size={12} className="shrink-0 text-[var(--text-muted)]" />
            }
            <span className="text-[11px] text-[var(--text-main)] truncate flex-1">{obj.key}</span>
            <span className="text-[9px] text-[var(--text-muted)] shrink-0">{formatBytes(obj.size)}</span>
          </button>
        ))}
        {!loading && filtered.length === 0 && (
          <p className="text-center text-[11px] text-[var(--text-muted)] py-8">No objects found</p>
        )}
      </div>
    </div>
  );
};

export default RemoteExplorer;
