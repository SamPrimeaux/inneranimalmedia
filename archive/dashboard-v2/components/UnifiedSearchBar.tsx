import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Command, Loader2, Search, KeyRound, Terminal, Globe, HardDrive } from 'lucide-react';

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

type UnifiedRow = DeployRow | SnippetRow | QueryRow | TableRow | ColumnRow | ConvRow | KnowRow | CommandRow | RecentFileRow;

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
    default: return 'Knowledge';
  }
}

export const UnifiedSearchBar: React.FC<{
  workspaceLabel?: string;
  recentFiles?: { name: string; path: string; label?: string }[];
  onNavigate: (nav: UnifiedSearchNavigate, searchQuery: string) => void;
  onRunCommand?: (cmd: string) => void;
}> = ({ workspaceLabel, recentFiles = [], onNavigate, onRunCommand }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<UnifiedRow[]>([]);
  const [recentSearches, setRecentSearches] = useState<{ query?: string; result_kind?: string; opened_id?: string }[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (t.length < 2) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/unified-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ query: t, limit: 22 }),
      });
      const data = res.ok ? await res.json() : {};
      setRows(normalizeSearchRows(data && typeof data === 'object' ? (data as Record<string, unknown>) : {}));
      setActive(0);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void runSearch(q), 220);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, open, runSearch]);

  const applyRow = useCallback(
    (row: UnifiedRow, searchQuery: string) => {
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
    if (q.trim().length >= 2) return rows;
    const palette: UnifiedRow[] = [];
    recentFiles.slice(0, 5).forEach(f => {
      palette.push({ type: 'file', id: f.path, title: f.name, subtitle: f.label || f.path, path: f.path });
    });
    IDE_COMMANDS.forEach(c => palette.push(c));
    return palette;
  }, [q, rows, recentFiles]);

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
    <div className="nav-search-container w-full max-w-lg hidden lg:block">
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
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto chat-hide-scroll">
              {flatList.map((row, i) => (
                <button
                  key={`${row.type}-${row.id}-${i}`}
                  type="button"
                  onClick={() => applyRow(row, q.trim())}
                  className={`w-full text-left px-3 py-2.5 border-b border-[var(--border-subtle)]/60 transition-colors ${
                    i === active ? 'bg-[var(--bg-hover)]' : 'hover:bg-[var(--bg-hover)]/70'
                  }`}
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
              ))}
            </div>
        </div>
      )}
    </div>
  );
};
