/**
 * WorkspaceLauncher — Workspace context selector for Agent Sam.
 *
 * Data: /api/settings/workspaces (same endpoint as App.tsx)
 * Filter: type-based sidebar + live search across name/repo/path
 * Selection: fires onSelect with the chosen workspace row
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  FolderOpen, Github, Terminal, Database,
  Search, Plus, Server, Settings, ShieldCheck,
  Loader2, AlertCircle, X,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type WorkspaceType = 'local' | 'github' | 'r2' | 'ssh' | 'unknown';

interface WorkspaceItem {
  id:           string;
  name:         string;
  type:         WorkspaceType;
  environment?: string;
  githubRepo?:  string;
  domain?:      string;
  lastOpenedAt?: string;
}

interface WorkspaceLauncherProps {
  onSelect?:           (ws: WorkspaceItem) => void;
  onClose:             () => void;
  onOpenLocalFolder?:  () => void;
  onConnectWorkspace?: () => void;
}

type FilterId = 'all' | WorkspaceType;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function inferWorkspaceType(raw: Record<string, unknown>): WorkspaceType {
  if (raw.github_repo || raw.type === 'github') return 'github';
  if (raw.type === 'r2' || raw.bucket)          return 'r2';
  if (raw.type === 'ssh' || raw.host)            return 'ssh';
  if (raw.type === 'local')                      return 'local';
  return 'unknown';
}

function workspaceMatchesSearch(ws: WorkspaceItem, q: string): boolean {
  const lower = q.toLowerCase();
  return (
    ws.name.toLowerCase().includes(lower)         ||
    (ws.githubRepo?.toLowerCase().includes(lower) ?? false) ||
    (ws.domain?.toLowerCase().includes(lower)     ?? false) ||
    ws.id.toLowerCase().includes(lower)
  );
}

// ─── Icon map ─────────────────────────────────────────────────────────────────

const TYPE_ICON: Record<WorkspaceType | 'all', React.ReactNode> = {
  all:     <Server   size={14} />,
  local:   <FolderOpen size={14} />,
  github:  <Github   size={14} />,
  r2:      <Database size={14} />,
  ssh:     <Terminal size={14} />,
  unknown: <Server   size={14} />,
};

const TYPE_LABEL: Record<WorkspaceType, string> = {
  local:   'Local',
  github:  'GitHub',
  r2:      'R2 Bucket',
  ssh:     'SSH',
  unknown: 'Other',
};

const ENV_DOT: Record<string, string> = {
  production: 'var(--solar-green)',
  staging:    'var(--solar-yellow)',
  sandbox:    'var(--solar-blue)',
};

// ─── Component ────────────────────────────────────────────────────────────────

export const WorkspaceLauncher: React.FC<WorkspaceLauncherProps> = ({
  onSelect,
  onClose,
  onOpenLocalFolder,
  onConnectWorkspace,
}) => {
  const [activeFilter, setActiveFilter] = useState<FilterId>('all');
  const [search, setSearch]             = useState('');
  const [workspaces, setWorkspaces]     = useState<WorkspaceItem[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [currentId, setCurrentId]       = useState<string | null>(null);

  // ── Fetch from the same endpoint App.tsx uses ─────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch('/api/settings/workspaces', { credentials: 'same-origin' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json() as {
          current?: string;
          data?: Array<Record<string, unknown>>;
        };

        if (typeof data.current === 'string') setCurrentId(data.current);

        const mapped: WorkspaceItem[] = (Array.isArray(data.data) ? data.data : [])
          .filter(ws => ws && typeof ws.id === 'string')
          .map(ws => ({
            id:          ws.id as string,
            name:        typeof ws.name === 'string' ? ws.name : (ws.id as string),
            type:        inferWorkspaceType(ws),
            environment: typeof ws.environment === 'string' ? ws.environment : undefined,
            githubRepo:  typeof ws.github_repo === 'string' ? ws.github_repo : undefined,
            domain:      typeof ws.domain === 'string' ? ws.domain : undefined,
            lastOpenedAt: typeof ws.last_opened_at === 'string' ? ws.last_opened_at : undefined,
          }));

        setWorkspaces(mapped);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load workspaces');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  // ── Available filter tabs (only show types that exist) ───────────────────
  const availableTypes = useMemo<WorkspaceType[]>(() => {
    const seen = new Set(workspaces.map(w => w.type));
    return (['local', 'github', 'r2', 'ssh', 'unknown'] as WorkspaceType[]).filter(t => seen.has(t));
  }, [workspaces]);

  // ── Filtered + searched list ─────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = workspaces;
    if (activeFilter !== 'all') list = list.filter(ws => ws.type === activeFilter);
    if (search.trim())          list = list.filter(ws => workspaceMatchesSearch(ws, search.trim()));
    return list;
  }, [workspaces, activeFilter, search]);

  // ── Close on backdrop click ──────────────────────────────────────────────
  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--bg-app)]/80 backdrop-blur-md"
      onClick={handleBackdrop}
    >
      <div className="w-full max-w-4xl h-[600px] bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="p-6 border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--solar-cyan)]/10 border border-[var(--solar-cyan)]/20 flex items-center justify-center text-[var(--solar-cyan)]">
              <Server size={20} />
            </div>
            <div>
              <h2 className="text-[1rem] font-bold text-[var(--text-heading)]">Switch Workspace</h2>
              <p className="text-[12px] text-[var(--text-muted)]">Select or create a development environment</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-[var(--bg-hover)] rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
            aria-label="Close workspace launcher"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* ── Sidebar ── */}
          <div className="w-56 shrink-0 border-r border-[var(--border-subtle)] bg-[var(--bg-app)]/40 p-3 flex flex-col gap-1 overflow-y-auto">
            {/* All filter */}
            <button
              type="button"
              onClick={() => setActiveFilter('all')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium transition-all ${
                activeFilter === 'all'
                  ? 'bg-[var(--bg-panel)] text-[var(--solar-cyan)] border border-[var(--border-subtle)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-panel)]/50'
              }`}
            >
              {TYPE_ICON.all}
              <span>All Projects</span>
              <span className="ml-auto text-[10px] font-mono opacity-60">{workspaces.length}</span>
            </button>

            {/* Type filters — only rendered if that type exists */}
            {availableTypes.map(type => {
              const count = workspaces.filter(w => w.type === type).length;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setActiveFilter(type)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium transition-all ${
                    activeFilter === type
                      ? 'bg-[var(--bg-panel)] text-[var(--solar-cyan)] border border-[var(--border-subtle)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-panel)]/50'
                  }`}
                >
                  {TYPE_ICON[type]}
                  <span>{TYPE_LABEL[type]}</span>
                  <span className="ml-auto text-[10px] font-mono opacity-60">{count}</span>
                </button>
              );
            })}

            {/* Operations */}
            <div className="mt-auto pt-4 border-t border-[var(--border-subtle)] flex flex-col gap-1">
              <p className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-muted)] px-3 mb-2">
                Operations
              </p>
              <button
                type="button"
                onClick={onOpenLocalFolder}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-panel)]/50 transition-colors"
              >
                <Plus size={13} /> New Workspace
              </button>
              <button
                type="button"
                onClick={onConnectWorkspace}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-panel)]/50 transition-colors"
              >
                <Settings size={13} /> Manage Environments
              </button>
            </div>
          </div>

          {/* ── Main panel ── */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0">

            {/* Search */}
            <div className="p-4 border-b border-[var(--border-subtle)] shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={15} />
                <input
                  type="search"
                  placeholder="Search by name, repo, or domain..."
                  className="w-full bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-xl py-2 pl-9 pr-4 text-[13px] focus:outline-none focus:border-[var(--solar-cyan)]/50 transition-all text-[var(--text-main)] placeholder:text-[var(--text-muted)]"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
              {loading ? (
                <div className="h-full flex items-center justify-center gap-2 text-[var(--text-muted)]">
                  <Loader2 size={16} className="animate-spin" />
                  <span className="text-[13px]">Loading workspaces...</span>
                </div>
              ) : error ? (
                <div className="h-full flex flex-col items-center justify-center gap-3 text-[var(--text-muted)]">
                  <AlertCircle size={24} className="text-[var(--solar-red)]" />
                  <p className="text-[13px]">Failed to load workspaces</p>
                  <p className="text-[11px] font-mono opacity-60">{error}</p>
                </div>
              ) : filtered.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
                  <Server size={24} className="opacity-30" />
                  <p className="text-[13px]">
                    {search.trim() ? `No workspaces match "${search}"` : 'No workspaces found'}
                  </p>
                  {activeFilter !== 'all' && (
                    <button
                      type="button"
                      onClick={() => setActiveFilter('all')}
                      className="text-[12px] text-[var(--solar-cyan)] hover:brightness-110"
                    >
                      Clear filter
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <p className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-muted)] px-1 pb-1">
                    {activeFilter === 'all' ? 'All Workspaces' : TYPE_LABEL[activeFilter as WorkspaceType]}
                    <span className="ml-2 font-mono normal-case opacity-60">{filtered.length}</span>
                  </p>
                  {filtered.map(ws => {
                    const isCurrent = ws.id === currentId;
                    const dotColor  = ws.environment ? (ENV_DOT[ws.environment] ?? 'var(--text-muted)') : null;
                    return (
                      <button
                        key={ws.id}
                        type="button"
                        onClick={() => onSelect?.(ws)}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all border ${
                          isCurrent
                            ? 'bg-[var(--solar-cyan)]/8 border-[var(--solar-cyan)]/30 text-[var(--text-main)]'
                            : 'bg-[var(--bg-app)]/50 border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] hover:border-[var(--solar-cyan)]/20'
                        }`}
                      >
                        {/* Type icon */}
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${
                          isCurrent
                            ? 'bg-[var(--solar-cyan)]/15 border-[var(--solar-cyan)]/30 text-[var(--solar-cyan)]'
                            : 'bg-[var(--bg-panel)] border-[var(--border-subtle)] text-[var(--text-muted)]'
                        }`}>
                          {TYPE_ICON[ws.type]}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-semibold text-[var(--text-main)] truncate">
                              {ws.name}
                            </span>
                            {isCurrent && (
                              <span className="shrink-0 text-[9px] font-bold uppercase tracking-widest text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/30 px-1.5 py-0.5 rounded-full">
                                Active
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {dotColor && (
                              <span className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                                <span className="w-1.5 h-1.5 rounded-full" style={{ background: dotColor }} />
                                {ws.environment}
                              </span>
                            )}
                            {ws.githubRepo && (
                              <span className="text-[10px] text-[var(--text-muted)] font-mono truncate">
                                {ws.githubRepo}
                              </span>
                            )}
                            {ws.domain && !ws.githubRepo && (
                              <span className="text-[10px] text-[var(--text-muted)] font-mono truncate">
                                {ws.domain}
                              </span>
                            )}
                            {!ws.githubRepo && !ws.domain && (
                              <span className="text-[10px] text-[var(--text-muted)] opacity-50">
                                {TYPE_LABEL[ws.type]}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Arrow */}
                        <div className={`shrink-0 transition-colors ${isCurrent ? 'text-[var(--solar-cyan)]' : 'text-[var(--text-muted)] opacity-0 group-hover:opacity-100'}`}>
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M3 7h8M7 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="shrink-0 px-6 py-3 bg-[var(--bg-app)]/60 border-t border-[var(--border-subtle)] flex items-center justify-between">
          <div className="flex items-center gap-4 text-[11px] text-[var(--text-muted)]">
            <span className="flex items-center gap-1.5">
              <ShieldCheck size={11} className="text-[var(--solar-green)]" />
              Authenticated
            </span>
            <span className="flex items-center gap-1.5">
              <Server size={11} />
              {workspaces.length} workspace{workspaces.length !== 1 ? 's' : ''} available
            </span>
          </div>
          {currentId && (
            <span className="text-[10px] font-mono text-[var(--text-muted)] opacity-50 truncate max-w-[200px]">
              {currentId}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
