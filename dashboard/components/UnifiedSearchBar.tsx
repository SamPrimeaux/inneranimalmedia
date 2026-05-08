import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Loader2, Search, Folder, GitBranch, Github } from 'lucide-react';

export type UnifiedSearchNavigate =
  | { kind: 'table'; name: string }
  | { kind: 'conversation'; id: string }
  | { kind: 'knowledge'; url: string | null; label: string }
  | { kind: 'sql'; sql: string }
  | { kind: 'deployment'; summary: string }
  | { kind: 'column'; sql: string }
  | { kind: 'file'; path: string };

type DeployRow = {
  type: 'deployment';
  id: string;
  title: string;
  subtitle?: string;
  summary?: string;
};
type SnippetRow = { type: 'snippet'; id: string; title: string; subtitle?: string; sql_text: string };
type QueryRow = { type: 'query'; id: string; title: string; subtitle?: string; sql_text: string };
type TableRow = { type: 'table'; id: string; title: string; subtitle?: string };
type ColumnRow = { type: 'column'; id: string; title: string; subtitle?: string; sql_text: string };
type ConvRow = { type: 'conversation'; id: string; title: string; subtitle?: string };
type KnowRow = {
  type: 'knowledge';
  id: string;
  title: string;
  subtitle?: string;
  url?: string | null;
  score?: number | null;
};
type CommandRow = { type: 'command'; id: string; title: string; subtitle?: string; cmd: string };
type RecentFileRow = { type: 'file'; id: string; title: string; subtitle?: string; path: string };

type WorkspaceRow = {
  type: 'workspace';
  id: string;
  title: string;
  subtitle?: string;
  slug: string;
  status: string;
  github_repo: string | null;
  member_role?: string;
};
type BranchRow = {
  type: 'branch';
  id: string;
  title: string;
  subtitle?: string;
  ref: string;
  sha: string;
  isProtected: boolean;
  repo: string;
};
type RepoRow = {
  type: 'repo';
  id: string;
  title: string;
  subtitle?: string;
  full_name: string;
  owner: string;
  isPrivate: boolean;
  pushed_at: string;
  default_branch: string;
  linked_worker: string | null;
};

type UnifiedRow =
  | DeployRow
  | SnippetRow
  | QueryRow
  | TableRow
  | ColumnRow
  | ConvRow
  | KnowRow
  | CommandRow
  | RecentFileRow
  | WorkspaceRow
  | BranchRow
  | RepoRow;

/** Must stay in sync with `src/core/unified-source-filters.js` ALLOWED_SOURCE_FILTERS (except `all`). */
const SOURCE_FACETS: { id: string; label: string }[] = [
  { id: 'docs', label: 'Docs' },
  { id: 'd1', label: 'D1' },
  { id: 'commands', label: 'Commands' },
  { id: 'rules', label: 'Rules' },
  { id: 'guardrails', label: 'Guardrails' },
  { id: 'memory', label: 'Memory' },
  { id: 'codebase', label: 'Code' },
  { id: 'scripts', label: 'Scripts' },
  { id: 'workspace', label: 'Workspaces' },
  { id: 'branch', label: 'Branches' },
  { id: 'repo', label: 'Repos' },
];

const IDE_COMMANDS: CommandRow[] = [
  { type: 'command', id: 'fmt', title: 'Format Document', subtitle: 'Run Prettier on active file', cmd: 'editor.format' },
  { type: 'command', id: 'debug', title: 'Start Debugging', subtitle: 'Attach debugger to local process', cmd: 'debug.start' },
  { type: 'command', id: 'clear', title: 'Clear Console', subtitle: 'Reset terminal buffers', cmd: 'terminal.clear' },
];

function flattenResults(data: {
  deployments?: DeployRow[];
  snippets?: SnippetRow[];
  past_queries?: QueryRow[];
  tables?: TableRow[];
  columns?: ColumnRow[];
  conversations?: ConvRow[];
  knowledge?: KnowRow[];
}): UnifiedRow[] {
  const out: UnifiedRow[] = [];
  for (const d of data.deployments || []) out.push(d);
  for (const s of data.snippets || []) out.push(s);
  for (const p of data.past_queries || []) out.push(p);
  for (const t of data.tables || []) out.push(t);
  for (const col of data.columns || []) out.push(col);
  for (const c of data.conversations || []) out.push(c);
  for (const k of data.knowledge || []) out.push(k);
  return out;
}

function normalizeSearchRows(data: Record<string, unknown>): UnifiedRow[] {
  const ranked = data.results;
  if (Array.isArray(ranked) && ranked.length > 0) {
    const out: UnifiedRow[] = [];
    for (const raw of ranked) {
      if (!raw || typeof raw !== 'object') continue;
      const r = raw as Record<string, unknown>;
      const type = String(r.type || '');
      const id = String(r.id ?? r.path ?? '');
      const title = String(r.title ?? '');
      const subtitle = r.subtitle != null ? String(r.subtitle) : undefined;
      if (type === 'deployment') {
        out.push({ type: 'deployment', id, title, subtitle, summary: r.summary != null ? String(r.summary) : undefined });
        continue;
      }
      if (type === 'snippet' || type === 'query' || type === 'column') {
        out.push({ type: type as any, id, title, subtitle, sql_text: String(r.sql_text ?? '') });
        continue;
      }
      if (type === 'table' || type === 'conversation') {
        out.push({ type: type as any, id, title, subtitle });
        continue;
      }
      if (type === 'knowledge') {
        out.push({ type: 'knowledge', id, title, subtitle, url: r.url != null ? String(r.url) : null, score: typeof r.score === 'number' ? r.score : null });
        continue;
      }
      switch (type) {
        case 'workspace':
          out.push({
            type: 'workspace',
            id: String(r.id),
            title: String(r.display_name || r.slug || r.id),
            subtitle: String(r.slug || ''),
            slug: String(r.slug || ''),
            status: String(r.status || 'active'),
            github_repo: r.github_repo ? String(r.github_repo) : null,
            member_role: r.member_role ? String(r.member_role) : undefined,
          });
          break;
        case 'branch':
          out.push({
            type: 'branch',
            id: String(r.ref ?? r.id ?? ''),
            title: String(r.ref ?? r.title ?? ''),
            subtitle: r.sha != null ? String(r.sha) : undefined,
            ref: String(r.ref ?? ''),
            sha: String(r.sha || ''),
            isProtected: Boolean(r.protected),
            repo: String(r.repo || ''),
          });
          break;
        case 'repo':
          out.push({
            type: 'repo',
            id: String(r.full_name ?? r.id ?? ''),
            title: String(r.name ?? r.title ?? ''),
            subtitle: r.owner != null ? String(r.owner) : undefined,
            full_name: String(r.full_name ?? ''),
            owner: String(r.owner || ''),
            isPrivate: Boolean(r.private),
            pushed_at: String(r.pushed_at || ''),
            default_branch: String(r.default_branch || 'main'),
            linked_worker: r.linked_worker ? String(r.linked_worker) : null,
          });
          break;
        default:
          break;
      }
    }
    return out;
  }
  return flattenResults(data as Parameters<typeof flattenResults>[0]);
}

function rowLabel(row: UnifiedRow): string {
  switch (row.type) {
    case 'deployment': return 'Deploy';
    case 'snippet': return 'Snippet';
    case 'query': return 'Query';
    case 'table': return 'Table';
    case 'column': return 'Column';
    case 'conversation': return 'Chat';
    case 'command': return 'Cmd';
    case 'file': return 'File';
    case 'workspace': return 'WS';
    case 'branch': return 'Branch';
    case 'repo': return 'Repo';
    default: return 'Knowledge';
  }
}

export const UnifiedSearchBar: React.FC<{
  workspaceLabel?: string;
  recentFiles?: { name: string; path: string; label?: string }[];
  onNavigate: (nav: UnifiedSearchNavigate, searchQuery: string) => void;
  onRunCommand?: (cmd: string) => void;
  controlledOpen?: boolean;
  onControlledOpenChange?: (open: boolean) => void;
  initialFacets?: string[];
}> = ({
  workspaceLabel,
  recentFiles = [],
  onNavigate,
  onRunCommand,
  controlledOpen,
  onControlledOpenChange,
  initialFacets,
}) => {
  const isControlled = controlledOpen !== undefined;
  const [localOpen, setLocalOpen] = useState(false);
  const open = isControlled ? controlledOpen : localOpen;
  const setOpen = (v: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof v === 'function' ? v(open) : v;
    if (isControlled) onControlledOpenChange?.(next);
    else setLocalOpen(next);
  };
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<UnifiedRow[]>([]);
  const [recentSearches, setRecentSearches] = useState<{ query?: string; result_kind?: string; opened_id?: string }[]>([]);
  /** Empty = search all document sources (server default). */
  const [sourceFacets, setSourceFacets] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open && initialFacets?.length) {
      setSourceFacets(initialFacets);
    }
    if (!open) {
      setSourceFacets([]);
    }
  }, [open, initialFacets]);

  const loadRecentSearches = useCallback(async () => {
    try {
      const r = await fetch('/api/unified-search/recent', { credentials: 'same-origin' });
      const j = r.ok ? await r.json() : { items: [] };
      setRecentSearches(Array.isArray(j.items) ? j.items : []);
    } catch {
      setRecentSearches([]);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadRecentSearches();
    setActive(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open, loadRecentSearches]);

  const runSearch = useCallback(async (query: string) => {
    const t = query.trim();
    const structural = sourceFacets.some((f) => f === 'workspace' || f === 'branch' || f === 'repo');
    if (t.length < 2 && !structural) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const payload: Record<string, unknown> = { query: t, limit: 22 };
      if (sourceFacets.length > 0) {
        payload.source_filters = sourceFacets;
      }
      const res = await fetch('/api/unified-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });
      const data = res.ok ? await res.json() : {};
      setRows(normalizeSearchRows(data && typeof data === 'object' ? (data as Record<string, unknown>) : {}));
      setActive(0);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [sourceFacets]);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void runSearch(q), 220);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, open, runSearch, sourceFacets]);

  const applyRow = useCallback(
    (row: UnifiedRow, searchQuery: string) => {
      if (row.type === 'workspace' || row.type === 'branch') {
        void fetch('/api/unified-search/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ query: searchQuery, result_kind: row.type, opened_id: row.id }),
        }).catch(() => {});
        setOpen(false);
        setQ('');
        setRows([]);
        return;
      }
      if (row.type === 'repo') {
        void fetch('/api/unified-search/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ query: searchQuery, result_kind: row.type, opened_id: row.id }),
        }).catch(() => {});
        if (row.full_name) {
          window.open(`https://github.com/${row.full_name}`, '_blank', 'noopener,noreferrer');
        }
        setOpen(false);
        setQ('');
        setRows([]);
        return;
      }
      if (row.type === 'command') {
        onRunCommand?.(row.cmd);
        setOpen(false);
        return;
      }
      if (row.type === 'file') {
        onNavigate({ kind: 'knowledge', url: row.path, label: row.title } as any, searchQuery);
        setOpen(false);
        return;
      }
      
      void fetch('/api/unified-search/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ query: searchQuery, result_kind: row.type, opened_id: row.id }),
      }).catch(() => {});

      if (row.type === 'table') {
        onNavigate({ kind: 'table', name: row.id }, searchQuery);
      } else if (row.type === 'conversation') {
        onNavigate({ kind: 'conversation', id: row.id }, searchQuery);
      } else if (row.type === 'column') {
        if (row.sql_text) onNavigate({ kind: 'column', sql: row.sql_text }, searchQuery);
      } else if (row.type === 'snippet' || row.type === 'query') {
        if (row.sql_text) onNavigate({ kind: 'sql', sql: row.sql_text }, searchQuery);
      } else if (row.type === 'deployment') {
        onNavigate({ kind: 'deployment', summary: row.summary || row.subtitle || row.title }, searchQuery);
      } else {
        onNavigate({ kind: 'knowledge', url: row.url ?? null, label: row.title || row.subtitle || 'Result' }, searchQuery);
      }
      setOpen(false);
      setQ('');
      setRows([]);
    },
    [onNavigate, onRunCommand],
  );

  const flatList = useMemo(() => {
    const t = q.trim();
    const structural = sourceFacets.some((f) => f === 'workspace' || f === 'branch' || f === 'repo');
    if (t.length >= 2 || structural) return rows;
    const palette: UnifiedRow[] = [];
    recentFiles.slice(0, 5).forEach(f => {
      palette.push({ type: 'file', id: f.path, title: f.name, subtitle: f.label || f.path, path: f.path });
    });
    IDE_COMMANDS.forEach(c => palette.push(c));
    return palette;
  }, [q, rows, recentFiles, sourceFacets]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(0, flatList.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && flatList.length > 0) {
      e.preventDefault();
      const row = flatList[active];
      if (row) applyRow(row, q.trim());
    }
  };

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent || '');

  return (
    <div className="nav-search-container w-full max-w-lg min-w-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex flex-col items-stretch w-full px-3 py-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-app)] text-left hover:border-[var(--solar-cyan)]/40 transition-colors gap-0.5"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Search size={14} className="shrink-0 opacity-70 text-[var(--text-muted)]" />
          <span className="text-[11px] text-[var(--text-muted)] truncate flex-1">
            workspace: <span className="text-[var(--text-main)] font-medium">{workspaceLabel?.trim() || 'dashboard'}</span>
          </span>
          <kbd className="hidden xl:inline text-[9px] font-mono px-1 py-px rounded border border-[var(--border-subtle)] text-[var(--text-muted)] shrink-0">
            {isMac ? 'Cmd' : 'Ctrl'}+K
          </kbd>
        </div>
      </button>

      {open && (
        <div className="nav-dropdown rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] shadow-2xl overflow-hidden flex flex-col max-h-[min(65vh,500px)]">
            <div className="px-3 py-2 border-b border-[var(--border-subtle)] space-y-1">
              <div className="flex items-center gap-2">
                <Search size={16} className="text-[var(--text-muted)] shrink-0" />
                <input
                  ref={inputRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Search files, commands, deploys, chats…"
                  className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[13px] text-[var(--text-main)] placeholder:text-[var(--text-muted)]"
                />
                {loading ? <Loader2 size={16} className="animate-spin text-[var(--solar-cyan)] shrink-0" /> : null}
              </div>
              <div className="flex flex-wrap gap-1 pt-1">
                <button
                  type="button"
                  onClick={() => setSourceFacets([])}
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium border transition-colors ${
                    sourceFacets.length === 0
                      ? 'border-[var(--solar-cyan)]/50 bg-[var(--solar-cyan)]/10 text-[var(--text-main)]'
                      : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  All sources
                </button>
                {SOURCE_FACETS.map((f) => {
                  const on = sourceFacets.includes(f.id);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() =>
                        setSourceFacets((prev) =>
                          prev.includes(f.id) ? prev.filter((x) => x !== f.id) : [...prev, f.id],
                        )
                      }
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium border transition-colors ${
                        on
                          ? 'border-[var(--solar-cyan)]/50 bg-[var(--solar-cyan)]/10 text-[var(--text-main)]'
                          : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto chat-hide-scroll">
              {flatList.map((row, i) => {
                const rowClass = `w-full text-left px-3 py-2.5 border-b border-[var(--border-subtle)]/60 transition-colors ${
                  i === active ? 'bg-[var(--bg-hover)]' : 'hover:bg-[var(--bg-hover)]/70'
                }`;
                if (row.type === 'workspace') {
                  return (
                    <button
                      key={`${row.type}-${row.id}-${i}`}
                      type="button"
                      onClick={() => applyRow(row, q.trim())}
                      className={rowClass}
                    >
                      <div className="flex items-start gap-2 min-w-0">
                        <Folder size={12} className="shrink-0 mt-0.5 text-[var(--text-muted)]" aria-hidden />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--solar-cyan)] shrink-0">
                              {rowLabel(row)}
                            </span>
                            <span
                              className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                                row.status === 'active' ? 'bg-emerald-500' : 'bg-[var(--text-muted)]/45'
                              }`}
                              title={row.status}
                            />
                          </div>
                          <div className="text-[12px] font-semibold text-[var(--text-main)] truncate">{row.title}</div>
                          <div className="text-[11px] font-mono text-[var(--text-muted)] truncate">
                            {row.slug}
                            {row.github_repo ? ` · ${row.github_repo}` : ''}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                }
                if (row.type === 'branch') {
                  return (
                    <button
                      key={`${row.type}-${row.id}-${i}`}
                      type="button"
                      onClick={() => applyRow(row, q.trim())}
                      className={rowClass}
                    >
                      <div className="flex items-start gap-2 min-w-0">
                        <GitBranch size={12} className="shrink-0 mt-0.5 text-[var(--text-muted)]" aria-hidden />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--solar-cyan)] shrink-0">
                              {rowLabel(row)}
                            </span>
                            {row.isProtected ? (
                              <span className="text-[9px] font-medium uppercase tracking-wide text-[var(--text-muted)] border border-[var(--border-subtle)] rounded px-1 shrink-0">
                                protected
                              </span>
                            ) : null}
                          </div>
                          <div className="text-[12px] text-[var(--text-main)] truncate">
                            <span className="font-semibold">{row.ref}</span>{' '}
                            <span className="font-mono text-[var(--text-muted)]">{row.sha}</span>
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)] truncate">{row.repo}</div>
                        </div>
                      </div>
                    </button>
                  );
                }
                if (row.type === 'repo') {
                  return (
                    <button
                      key={`${row.type}-${row.id}-${i}`}
                      type="button"
                      onClick={() => applyRow(row, q.trim())}
                      className={rowClass}
                    >
                      <div className="flex items-start gap-2 min-w-0">
                        <Github size={12} className="shrink-0 mt-0.5 text-[var(--text-muted)]" aria-hidden />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--solar-cyan)] shrink-0">
                              {rowLabel(row)}
                            </span>
                            {row.isPrivate ? (
                              <span className="text-[9px] font-medium uppercase tracking-wide text-[var(--text-muted)] border border-[var(--border-subtle)] rounded px-1 shrink-0">
                                private
                              </span>
                            ) : null}
                          </div>
                          <div className="text-[12px] truncate">
                            <span className="font-semibold text-[var(--text-main)]">{row.title}</span>
                            <span className="text-[var(--text-muted)]"> / {row.owner}</span>
                          </div>
                          <div
                            className={`text-[11px] truncate ${
                              row.linked_worker ? 'text-[var(--solar-cyan)]' : 'text-[var(--text-muted)]'
                            }`}
                          >
                            {row.linked_worker ? `linked: ${row.linked_worker}` : 'not linked'}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                }
                return (
                  <button
                    key={`${row.type}-${row.id}-${i}`}
                    type="button"
                    onClick={() => applyRow(row, q.trim())}
                    className={rowClass}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--solar-cyan)] shrink-0">
                        {rowLabel(row)}
                      </span>
                      <span className="text-[12px] font-semibold text-[var(--text-main)] truncate">{row.title}</span>
                    </div>
                    {row.subtitle ? (
                      <div className="text-[11px] text-[var(--text-muted)] line-clamp-2">{row.subtitle}</div>
                    ) : null}
                  </button>
                );
              })}
            </div>
        </div>
      )}
    </div>
  );
};
