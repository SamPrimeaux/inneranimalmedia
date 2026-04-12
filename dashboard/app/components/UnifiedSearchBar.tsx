/**
 * UnifiedSearchBar — Production search for IAM Agent Dashboard
 *
 * Two modes:
 *   Cmd+K          → Command palette (files, commands, tables, deployments, knowledge)
 *   Cmd+Shift+F    → Full-text search panel (repo-wide, like Cursor's search sidebar)
 *
 * Search layers (parallel):
 *   1. D1 keyword  → /api/unified-search  (instant)
 *   2. Vectorize   → /api/rag/vector-search (semantic, ~200ms)
 *   3. AutoRAG     → /api/rag/search (chunked knowledge)
 *   4. File changes→ agent_file_changes table
 *   5. R2 assets   → /api/r2/search
 *
 * Agent Sam autonomy:
 *   window.__iamSearch(query, opts?) → Promise<UnifiedResult[]>
 *   Fires 'iam-search-navigate' CustomEvent to open panels programmatically.
 *
 * Mobile: full-screen overlay instead of dropdown.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Search,
  Command,
  Loader2,
  GitCommit,
  BookOpen,
  Cloud,
  Clock,
  Zap,
  Table as TableIcon,
  MessageSquare,
  FileCode2,
  Terminal,
  ChevronRight,
  X,
  ArrowRight,
  RotateCcw,
  Replace,
  FolderOpen,
  FileText,
  AlertCircle,
} from 'lucide-react';

// ── Constants ─────────────────────────────────────────────────────────────────
const API_SEARCH         = '/api/unified-search';
const API_VECTOR         = '/api/rag/vector-search';
const API_RAG            = '/api/rag/search';
const API_R2_SEARCH      = '/api/r2/search';
const API_SEARCH_TRACK   = '/api/unified-search/track';
const API_SEARCH_RECENT  = '/api/unified-search/recent';
const DEBOUNCE_MS        = 180;
const MAX_RESULTS        = 28;
const EVENT_NAVIGATE     = 'iam-search-navigate';

// ── Types ─────────────────────────────────────────────────────────────────────
type ResultKind =
  | 'table' | 'conversation' | 'knowledge' | 'sql' | 'deployment'
  | 'column' | 'file_change' | 'r2_asset' | 'recent_file' | 'cicd'
  | 'command' | 'file';

export interface UnifiedResult {
  kind:      ResultKind;
  id:        string;
  title:     string;
  subtitle?: string;
  /** For sql/column kinds */
  sql?:      string;
  /** For knowledge/r2 kinds */
  url?:      string | null;
  /** For file_change kind */
  path?:     string;
  /** Relevance score 0-1 */
  score?:    number;
  /** Source label */
  source?:   string;
}

export type SearchNavigate =
  | { kind: 'table';       name: string }
  | { kind: 'conversation';id: string }
  | { kind: 'knowledge';   url: string | null; label: string }
  | { kind: 'sql';         sql: string }
  | { kind: 'deployment';  summary: string }
  | { kind: 'file_change'; path: string }
  | { kind: 'r2_asset';    url: string; label: string }
  | { kind: 'recent_file'; path: string; label: string }
  | { kind: 'command';     cmd: string }
  | { kind: 'file';        path: string };

interface RecentSearch {
  query?:       string;
  result_kind?: string;
  opened_id?:   string;
}

// ── Built-in commands ─────────────────────────────────────────────────────────
const BUILTIN_COMMANDS: UnifiedResult[] = [
  { kind: 'command', id: 'format',      title: 'Format Document',   subtitle: 'Run Prettier on active file',     source: 'cmd' },
  { kind: 'command', id: 'terminal',    title: 'Toggle Terminal',   subtitle: 'Open / close XTerm shell',        source: 'cmd' },
  { kind: 'command', id: 'db',          title: 'Open Database',     subtitle: 'Launch DB explorer panel',        source: 'cmd' },
  { kind: 'command', id: 'mcp',         title: 'MCP Servers',       subtitle: 'Browse connected MCP tools',      source: 'cmd' },
  { kind: 'command', id: 'draw',        title: 'Open Draw',         subtitle: 'Launch Excalidraw canvas',        source: 'cmd' },
  { kind: 'command', id: 'voxel',       title: 'Open Studio',       subtitle: 'Launch 3D/Voxel engine',          source: 'cmd' },
  { kind: 'command', id: 'browser',     title: 'Open Browser',      subtitle: 'Launch internal browser panel',   source: 'cmd' },
  { kind: 'command', id: 'deploy',      title: 'Deploy to Sandbox', subtitle: 'Trigger sandbox deploy pipeline', source: 'cmd' },
  { kind: 'command', id: 'theme',       title: 'Switch Theme',      subtitle: 'Change active CMS theme',         source: 'cmd' },
  { kind: 'command', id: 'new-chat',    title: 'New Agent Chat',    subtitle: 'Start a fresh Agent Sam session', source: 'cmd' },
];

// ── Kind metadata ─────────────────────────────────────────────────────────────
const KIND_META: Record<ResultKind, { label: string; color: string; Icon: React.FC<{ size: number; className?: string }> }> = {
  table:       { label: 'Table',    color: 'text-[var(--solar-blue)]',    Icon: TableIcon    },
  conversation:{ label: 'Chat',     color: 'text-[var(--solar-cyan)]',    Icon: MessageSquare},
  knowledge:   { label: 'Knowledge',color: 'text-[var(--solar-violet)]',  Icon: BookOpen     },
  sql:         { label: 'SQL',      color: 'text-[var(--solar-green)]',   Icon: Terminal     },
  deployment:  { label: 'Deploy',   color: 'text-[var(--solar-orange)]',  Icon: Zap          },
  column:      { label: 'Column',   color: 'text-[var(--solar-blue)]',    Icon: TableIcon    },
  file_change: { label: 'Change',   color: 'text-[var(--solar-yellow)]',  Icon: GitCommit    },
  r2_asset:    { label: 'Asset',    color: 'text-[var(--solar-cyan)]',    Icon: Cloud        },
  recent_file: { label: 'Recent',   color: 'text-[var(--text-muted)]',    Icon: Clock        },
  cicd:        { label: 'CI/CD',    color: 'text-[var(--solar-orange)]',  Icon: Zap          },
  command:     { label: 'Cmd',      color: 'text-[var(--solar-magenta)]', Icon: Command      },
  file:        { label: 'File',     color: 'text-[var(--text-muted)]',    Icon: FileCode2    },
};

// ── Normalize raw API results ─────────────────────────────────────────────────
function normalize(raw: unknown[]): UnifiedResult[] {
  return raw.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const r = item as Record<string, unknown>;
    const kind = String(r.type ?? r.kind ?? 'knowledge') as ResultKind;
    return [{
      kind,
      id:       String(r.id ?? r.path ?? Math.random()),
      title:    String(r.title ?? r.name ?? r.file_path ?? ''),
      subtitle: r.subtitle != null ? String(r.subtitle) : undefined,
      sql:      r.sql_text != null ? String(r.sql_text) : undefined,
      url:      r.url != null ? String(r.url) : r.r2_url != null ? String(r.r2_url) : undefined,
      path:     r.file_path != null ? String(r.file_path) : r.path != null ? String(r.path) : undefined,
      score:    typeof r.score === 'number' ? r.score : undefined,
      source:   r.source != null ? String(r.source) : undefined,
    }];
  });
}

// ── isMac (memoized once) ────────────────────────────────────────────────────
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent);

// ── Full-text search panel (Cmd+Shift+F mode) ─────────────────────────────────
const FullTextPanel: React.FC<{
  onClose:    () => void;
  onNavigate: (nav: SearchNavigate) => void;
}> = ({ onClose, onNavigate }) => {
  const [query,       setQuery]       = useState('');
  const [replace,     setReplace]     = useState('');
  const [include,     setInclude]     = useState('');
  const [exclude,     setExclude]     = useState('');
  const [results,     setResults]     = useState<UnifiedResult[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const runSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      // Hit all layers in parallel
      const [d1Res, ragRes, r2Res] = await Promise.allSettled([
        fetch(API_SEARCH, {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q.trim(), limit: 20, include, exclude }),
        }).then(r => r.json()),
        fetch(API_RAG, {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q.trim(), limit: 10 }),
        }).then(r => r.json()),
        fetch(`${API_R2_SEARCH}?q=${encodeURIComponent(q.trim())}&limit=8`, {
          credentials: 'same-origin',
        }).then(r => r.json()),
      ]);

      const all: UnifiedResult[] = [];
      if (d1Res.status === 'fulfilled') {
        const d = d1Res.value as Record<string, unknown>;
        const rows = Array.isArray(d.results) ? d.results : [];
        all.push(...normalize(rows));
      }
      if (ragRes.status === 'fulfilled') {
        const d = ragRes.value as Record<string, unknown>;
        const rows = Array.isArray(d.results) ? d.results
          : Array.isArray(d.chunks) ? d.chunks : [];
        all.push(...normalize(rows).map(r => ({ ...r, kind: 'knowledge' as ResultKind })));
      }
      if (r2Res.status === 'fulfilled') {
        const d = r2Res.value as Record<string, unknown>;
        const rows = Array.isArray(d.objects) ? d.objects : Array.isArray(d.results) ? d.results : [];
        all.push(...normalize(rows).map(r => ({ ...r, kind: 'r2_asset' as ResultKind })));
      }

      // Deduplicate by id
      const seen = new Set<string>();
      setResults(all.filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; }));
    } catch { setResults([]); }
    finally { setLoading(false); }
  }, [include, exclude]);

  useEffect(() => {
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => void runSearch(query), DEBOUNCE_MS);
    return () => { if (debRef.current) clearTimeout(debRef.current); };
  }, [query, runSearch]);

  // Group results by kind
  const grouped = useMemo(() => {
    const map = new Map<ResultKind, UnifiedResult[]>();
    results.forEach(r => {
      const arr = map.get(r.kind) ?? [];
      arr.push(r);
      map.set(r.kind, arr);
    });
    return map;
  }, [results]);

  return (
    <div className="fixed inset-0 z-[200] flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel — right side like Cursor */}
      <div className="relative ml-auto w-full max-w-sm h-full bg-[var(--bg-panel)] border-l border-[var(--border-subtle)] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)] shrink-0">
          <span className="text-[11px] font-black uppercase tracking-widest text-[var(--text-muted)]">Search</span>
          <button type="button" onClick={onClose} className="p-1 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)]">
            <X size={14} />
          </button>
        </div>

        {/* Search inputs */}
        <div className="px-3 py-2 space-y-1.5 border-b border-[var(--border-subtle)] shrink-0">
          <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] focus-within:border-[var(--solar-cyan)]/50">
            <Search size={12} className="text-[var(--text-muted)] shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search"
              className="flex-1 bg-transparent text-[12px] outline-none text-[var(--text-main)] placeholder:text-[var(--text-muted)] font-[var(--font-ui)]"
            />
            {loading && <Loader2 size={12} className="animate-spin text-[var(--solar-cyan)] shrink-0" />}
            <button
              type="button"
              onClick={() => setShowReplace(v => !v)}
              className={`p-0.5 rounded transition-colors ${showReplace ? 'text-[var(--solar-cyan)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
              title="Toggle replace"
            >
              <Replace size={11} />
            </button>
          </div>

          {showReplace && (
            <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] focus-within:border-[var(--solar-cyan)]/50">
              <Replace size={12} className="text-[var(--text-muted)] shrink-0" />
              <input
                value={replace}
                onChange={e => setReplace(e.target.value)}
                placeholder="Replace"
                className="flex-1 bg-transparent text-[12px] outline-none text-[var(--text-main)] placeholder:text-[var(--text-muted)] font-[var(--font-ui)]"
              />
            </div>
          )}

          <div className="flex gap-1.5">
            <input
              value={include}
              onChange={e => setInclude(e.target.value)}
              placeholder="files to include"
              className="flex-1 px-2 py-1 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[10px] font-[var(--font-mono)] text-[var(--text-muted)] outline-none focus:border-[var(--solar-cyan)]/40"
            />
            <input
              value={exclude}
              onChange={e => setExclude(e.target.value)}
              placeholder="files to exclude"
              className="flex-1 px-2 py-1 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[10px] font-[var(--font-mono)] text-[var(--text-muted)] outline-none focus:border-[var(--solar-cyan)]/40"
            />
          </div>

          {results.length > 0 && (
            <p className="text-[10px] text-[var(--text-muted)] font-[var(--font-mono)] px-1">
              {results.length} result{results.length === 1 ? '' : 's'}
            </p>
          )}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto no-scrollbar">
          {query.trim().length < 2 && (
            <div className="flex flex-col items-center justify-center h-32 text-[var(--text-muted)] gap-2">
              <Search size={20} className="opacity-20" />
              <p className="text-[11px] opacity-50">Type to search across all sources</p>
            </div>
          )}

          {Array.from(grouped.entries()).map(([kind, items]) => {
            const meta = KIND_META[kind] ?? KIND_META.knowledge;
            return (
              <div key={kind}>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--bg-app)]/50 sticky top-0">
                  <meta.Icon size={11} className={meta.color} />
                  <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">{meta.label}</span>
                  <span className="text-[9px] font-mono text-[var(--text-muted)] opacity-50">{items.length}</span>
                </div>
                {items.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onNavigate(toNavigation(item));
                      onClose();
                    }}
                    className="w-full text-left px-3 py-2 border-b border-[var(--border-subtle)]/40 hover:bg-[var(--bg-hover)] transition-colors group"
                  >
                    <div className="text-[12px] font-medium text-[var(--text-main)] truncate group-hover:text-[var(--solar-cyan)]">
                      {item.title}
                    </div>
                    {item.subtitle && (
                      <div className="text-[10px] text-[var(--text-muted)] font-[var(--font-mono)] truncate mt-0.5">
                        {item.subtitle}
                      </div>
                    )}
                    {item.path && (
                      <div className="text-[10px] text-[var(--text-muted)] font-[var(--font-mono)] truncate">
                        {item.path}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ── Convert UnifiedResult → SearchNavigate ────────────────────────────────────
function toNavigation(item: UnifiedResult): SearchNavigate {
  switch (item.kind) {
    case 'table':        return { kind: 'table',       name: item.id };
    case 'conversation': return { kind: 'conversation', id: item.id };
    case 'sql':
    case 'column':       return { kind: 'sql',          sql: item.sql ?? item.title };
    case 'deployment':   return { kind: 'deployment',   summary: item.subtitle ?? item.title };
    case 'file_change':  return { kind: 'file_change',  path: item.path ?? item.title };
    case 'r2_asset':     return { kind: 'r2_asset',     url: item.url ?? '', label: item.title };
    case 'recent_file':  return { kind: 'recent_file',  path: item.path ?? item.id, label: item.title };
    case 'file':         return { kind: 'file',         path: item.path ?? item.id };
    case 'command':      return { kind: 'command',      cmd: item.id };
    default:             return { kind: 'knowledge',    url: item.url ?? null, label: item.title };
  }
}

// ── Result row ────────────────────────────────────────────────────────────────
const ResultRow: React.FC<{
  item:      UnifiedResult;
  active:    boolean;
  onClick:   () => void;
  highlight: string;
}> = ({ item, active, onClick, highlight }) => {
  const meta   = KIND_META[item.kind] ?? KIND_META.knowledge;
  const Icon   = meta.Icon;

  const highlightText = (text: string) => {
    if (!highlight || highlight.length < 2) return text;
    const idx = text.toLowerCase().indexOf(highlight.toLowerCase());
    if (idx < 0) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-[var(--solar-cyan)]/25 text-[var(--solar-cyan)] rounded-sm not-italic">
          {text.slice(idx, idx + highlight.length)}
        </mark>
        {text.slice(idx + highlight.length)}
      </>
    );
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        w-full text-left px-3 py-2 border-b border-[var(--border-subtle)]/50
        transition-colors flex items-start gap-2.5
        ${active ? 'bg-[var(--bg-hover)]' : 'hover:bg-[var(--bg-hover)]/60'}
      `}
    >
      <div className={`mt-0.5 shrink-0 ${meta.color}`}>
        <Icon size={13} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`text-[9px] font-black uppercase tracking-widest shrink-0 ${meta.color}`}>
            {meta.label}
          </span>
          <span className="text-[12px] font-medium text-[var(--text-main)] truncate">
            {highlightText(item.title)}
          </span>
        </div>
        {item.subtitle && (
          <p className="text-[10px] text-[var(--text-muted)] font-[var(--font-mono)] truncate">
            {item.subtitle}
          </p>
        )}
        {item.path && (
          <p className="text-[10px] text-[var(--text-muted)] font-[var(--font-mono)] truncate opacity-70">
            {item.path}
          </p>
        )}
        {item.sql && (
          <p className="text-[10px] font-[var(--font-mono)] text-[var(--solar-cyan)] truncate opacity-80">
            {item.sql.slice(0, 80)}
          </p>
        )}
      </div>
      {active && <ChevronRight size={12} className="text-[var(--text-muted)] shrink-0 mt-0.5" />}
    </button>
  );
};

// ── Props ─────────────────────────────────────────────────────────────────────
interface UnifiedSearchBarProps {
  workspaceLabel?: string;
  recentFiles?:    { name: string; path: string; label?: string }[];
  onNavigate:      (nav: SearchNavigate, query: string) => void;
  onRunCommand?:   (cmd: string) => void;
}

// ── Main component ────────────────────────────────────────────────────────────
export const UnifiedSearchBar: React.FC<UnifiedSearchBarProps> = ({
  workspaceLabel,
  recentFiles = [],
  onNavigate,
  onRunCommand,
}) => {
  const [paletteOpen,   setPaletteOpen]   = useState(false);
  const [fullTextOpen,  setFullTextOpen]  = useState(false);
  const [query,         setQuery]         = useState('');
  const [loading,       setLoading]       = useState(false);
  const [results,       setResults]       = useState<UnifiedResult[]>([]);
  const [recentSearches,setRecentSearches]= useState<RecentSearch[]>([]);
  const [active,        setActive]        = useState(0);

  const inputRef   = useRef<HTMLInputElement>(null);
  const debRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paletteRef = useRef<HTMLDivElement>(null);

  // ── Load recent searches on open ──────────────────────────────────────────
  const loadRecent = useCallback(async () => {
    try {
      const r = await fetch(API_SEARCH_RECENT, { credentials: 'same-origin' });
      const d = r.ok ? await r.json() as { items?: RecentSearch[] } : { items: [] };
      setRecentSearches(Array.isArray(d.items) ? d.items.slice(0, 5) : []);
    } catch { setRecentSearches([]); }
  }, []);

  useEffect(() => {
    if (!paletteOpen) return;
    void loadRecent();
    setQuery('');
    setResults([]);
    setActive(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [paletteOpen, loadRecent]);

  // ── Search all layers ─────────────────────────────────────────────────────
  const runSearch = useCallback(async (q: string) => {
    const t = q.trim();
    if (t.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const [d1Res, vectorRes, ragRes] = await Promise.allSettled([
        // Layer 1: D1 keyword
        fetch(API_SEARCH, {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: t, limit: MAX_RESULTS }),
        }).then(r => r.json()),
        // Layer 2: Vectorize semantic
        fetch(API_VECTOR, {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: t, limit: 8 }),
        }).then(r => r.json()),
        // Layer 3: AutoRAG chunks
        fetch(API_RAG, {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: t, limit: 5 }),
        }).then(r => r.json()),
      ]);

      const all: UnifiedResult[] = [];

      if (d1Res.status === 'fulfilled') {
        const d = d1Res.value as Record<string, unknown>;
        const rows = Array.isArray(d.results) ? d.results : [];
        all.push(...normalize(rows));
      }
      if (vectorRes.status === 'fulfilled') {
        const d = vectorRes.value as Record<string, unknown>;
        const rows = Array.isArray(d.results) ? d.results : [];
        all.push(...normalize(rows).map(r => ({
          ...r,
          kind: 'knowledge' as ResultKind,
          source: 'vector',
        })));
      }
      if (ragRes.status === 'fulfilled') {
        const d = ragRes.value as Record<string, unknown>;
        const rows = Array.isArray(d.results) ? d.results
          : Array.isArray(d.chunks) ? d.chunks : [];
        all.push(...normalize(rows).map(r => ({
          ...r,
          kind: 'knowledge' as ResultKind,
          source: 'autorag',
        })));
      }

      // Deduplicate + sort by score
      const seen = new Set<string>();
      const deduped = all
        .filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; })
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        .slice(0, MAX_RESULTS);

      setResults(deduped);
      setActive(0);
    } catch { setResults([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!paletteOpen) return;
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => void runSearch(query), DEBOUNCE_MS);
    return () => { if (debRef.current) clearTimeout(debRef.current); };
  }, [query, paletteOpen, runSearch]);

  // ── Global keyboard shortcuts ─────────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.shiftKey && e.key === 'f') {
        e.preventDefault();
        setFullTextOpen(v => !v);
        setPaletteOpen(false);
        return;
      }
      if (meta && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen(v => !v);
        setFullTextOpen(false);
        return;
      }
      if (e.key === 'Escape') {
        setPaletteOpen(false);
        setFullTextOpen(false);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // ── Close on outside click ────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (paletteRef.current && !paletteRef.current.contains(e.target as Node)) {
        setPaletteOpen(false);
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // ── Track + navigate ──────────────────────────────────────────────────────
  const applyResult = useCallback((item: UnifiedResult) => {
    const nav = toNavigation(item);

    if (item.kind === 'command') {
      onRunCommand?.(item.id);
      // Fire event for shell to handle
      window.dispatchEvent(new CustomEvent(EVENT_NAVIGATE, { detail: nav }));
      setPaletteOpen(false);
      return;
    }

    void fetch(API_SEARCH_TRACK, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, result_kind: item.kind, opened_id: item.id }),
    }).catch(() => {});

    onNavigate(nav, query);
    window.dispatchEvent(new CustomEvent(EVENT_NAVIGATE, { detail: nav }));
    setPaletteOpen(false);
    setQuery('');
    setResults([]);
  }, [query, onNavigate, onRunCommand]);

  // ── Keyboard navigation inside palette ───────────────────────────────────
  const flatList = useMemo<UnifiedResult[]>(() => {
    if (query.trim().length >= 2) return results;
    // Default: recent files + commands
    const out: UnifiedResult[] = [];
    recentFiles.slice(0, 6).forEach(f => out.push({
      kind: 'recent_file', id: f.path, title: f.name,
      subtitle: f.label ?? f.path, path: f.path,
    }));
    // Recent searches as items
    recentSearches.forEach(r => {
      if (r.query) out.push({
        kind: 'knowledge', id: `recent-${r.query}`,
        title: r.query, subtitle: `Recent search · ${r.result_kind ?? ''}`,
        source: 'recent',
      });
    });
    out.push(...BUILTIN_COMMANDS);
    return out;
  }, [query, results, recentFiles, recentSearches]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(i => Math.min(i + 1, flatList.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(i => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = flatList[active];
      if (item) applyResult(item);
    }
  };

  // ── Expose to Agent Sam ───────────────────────────────────────────────────
  useEffect(() => {
    (window as Window & { __iamSearch?: unknown }).__iamSearch = async (
      q: string,
      opts?: { limit?: number }
    ): Promise<UnifiedResult[]> => {
      if (!q || q.trim().length < 2) return [];
      try {
        const res = await fetch(API_SEARCH, {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q.trim(), limit: opts?.limit ?? 10 }),
        });
        const d = await res.json() as Record<string, unknown>;
        return normalize(Array.isArray(d.results) ? d.results : []);
      } catch { return []; }
    };
    return () => {
      delete (window as Window & { __iamSearch?: unknown }).__iamSearch;
    };
  }, []);

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Trigger button */}
      <div className="relative" ref={paletteRef}>
        <button
          type="button"
          onClick={() => setPaletteOpen(v => !v)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] hover:border-[var(--solar-cyan)]/30 transition-all w-full max-w-sm"
        >
          <Search size={13} className="text-[var(--text-muted)] shrink-0" />
          <span className="text-[11px] text-[var(--text-muted)] flex-1 text-left truncate font-[var(--font-ui)]">
            workspace:{' '}
            <span className="text-[var(--text-main)] font-medium">
              {workspaceLabel?.trim() || 'dashboard'}
            </span>
          </span>
          <div className="hidden sm:flex items-center gap-1 shrink-0">
            <kbd className="text-[9px] font-mono px-1 py-px rounded border border-[var(--border-subtle)] text-[var(--text-muted)]">
              {IS_MAC ? '⌘' : 'Ctrl'}
            </kbd>
            <kbd className="text-[9px] font-mono px-1 py-px rounded border border-[var(--border-subtle)] text-[var(--text-muted)]">K</kbd>
          </div>
        </button>

        {/* Palette overlay */}
        {paletteOpen && (
          <div className={`
            ${isMobile
              ? 'fixed inset-0 z-[200] flex flex-col'
              : 'absolute top-full mt-2 left-1/2 -translate-x-1/2 z-[200] w-[min(600px,96vw)]'
            }
          `}>
            {/* Mobile backdrop */}
            {isMobile && (
              <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setPaletteOpen(false)} />
            )}

            <div className={`
              relative bg-[var(--bg-panel)] border border-[var(--border-subtle)] shadow-2xl overflow-hidden flex flex-col
              ${isMobile
                ? 'rounded-b-none rounded-t-2xl mt-auto max-h-[85vh]'
                : 'rounded-xl max-h-[min(65vh,520px)]'
              }
            `}>
              {/* Mobile drag handle */}
              {isMobile && (
                <div className="w-10 h-1 bg-[var(--border-subtle)] rounded-full mx-auto mt-3 mb-1 shrink-0" />
              )}

              {/* Search input */}
              <div className="px-4 py-3 border-b border-[var(--border-subtle)] shrink-0">
                <div className="flex items-center gap-3">
                  {loading
                    ? <Loader2 size={16} className="animate-spin text-[var(--solar-cyan)] shrink-0" />
                    : <Search size={16} className="text-[var(--text-muted)] shrink-0" />
                  }
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={e => { setQuery(e.target.value); setActive(0); }}
                    onKeyDown={onKeyDown}
                    placeholder="Search files, commands, tables, knowledge…"
                    className="flex-1 bg-transparent border-none outline-none text-[14px] text-[var(--text-main)] placeholder:text-[var(--text-muted)] font-[var(--font-ui)]"
                  />
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => { setFullTextOpen(true); setPaletteOpen(false); }}
                      className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-main)] px-1.5 py-0.5 rounded border border-[var(--border-subtle)] font-mono"
                      title="Full text search (Cmd+Shift+F)"
                    >
                      ⇧F
                    </button>
                    <button type="button" onClick={() => setPaletteOpen(false)} className="p-0.5 text-[var(--text-muted)] hover:text-[var(--text-main)]">
                      <X size={13} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Results list */}
              <div className="flex-1 overflow-y-auto no-scrollbar">
                {flatList.length === 0 && query.trim().length >= 2 && !loading && (
                  <div className="flex flex-col items-center justify-center py-12 text-[var(--text-muted)] gap-2">
                    <AlertCircle size={20} className="opacity-30" />
                    <p className="text-[11px] opacity-50">No results for "{query}"</p>
                  </div>
                )}

                {flatList.map((item, i) => (
                  <ResultRow
                    key={`${item.kind}-${item.id}-${i}`}
                    item={item}
                    active={i === active}
                    onClick={() => applyResult(item)}
                    highlight={query.trim()}
                  />
                ))}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-4 py-2 border-t border-[var(--border-subtle)] shrink-0 bg-[var(--bg-app)]/50">
                <div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)] font-[var(--font-mono)]">
                  <span>↑↓ navigate</span>
                  <span>↵ open</span>
                  <span>esc close</span>
                </div>
                {results.length > 0 && (
                  <span className="text-[10px] text-[var(--text-muted)] font-mono">
                    {results.length} result{results.length === 1 ? '' : 's'}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile icon-only trigger (below lg) */}
      <button
        type="button"
        onClick={() => setPaletteOpen(v => !v)}
        className="lg:hidden p-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
        title="Search (Cmd+K)"
      >
        <Search size={16} />
      </button>

      {/* Full text search panel */}
      {fullTextOpen && (
        <FullTextPanel
          onClose={() => setFullTextOpen(false)}
          onNavigate={(nav) => { onNavigate(nav, ''); }}
        />
      )}
    </>
  );
};
