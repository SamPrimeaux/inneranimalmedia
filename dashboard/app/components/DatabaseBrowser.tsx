/**
 * DatabaseBrowser — Single-file DB workbench
 *
 * Replaces: DatabaseBrowser.tsx + SQLConsole.tsx + DataGrid.tsx + DatabaseAgentChat.tsx
 * Those files should be deleted.
 *
 * Layout (responsive):
 *   Desktop  — left sidebar (tables + snippets + history) | right (Monaco + results)
 *   Mobile   — bottom sheet table picker, full-screen Monaco + results, FAB to run
 *
 * Agent Sam integration:
 *   - /run-hyperdrive in main chat → agent executes headless, reports in chat
 *   - This panel = viewer/editor only — no embedded agent chat
 *   - Panel fires 'iam-db-result' CustomEvent so chat panel can surface inline previews
 *
 * Connections:
 *   D1      → POST /api/d1/query        (SQLite dialect)
 *   Hyperdrive → POST /api/hyperdrive/query (PostgreSQL dialect)
 *
 * Connection label pulled from /api/hyperdrive/status — never hardcoded.
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';
import {
  Database,
  Search,
  RefreshCw,
  Play,
  ChevronRight,
  ChevronDown,
  X,
  Check,
  AlertCircle,
  CheckCircle2,
  Clock,
  Save,
  Trash2,
  Table as TableIcon,
  Zap,
  ExternalLink,
  MoreHorizontal,
  PanelBottomOpen,
  Loader2,
} from 'lucide-react';

// ── Constants ─────────────────────────────────────────────────────────────────
const API_D1_QUERY        = '/api/d1/query';
const API_HYP_QUERY       = '/api/hyperdrive/query';
const API_HYP_STATUS      = '/api/hyperdrive/status';
const API_D1_TABLES       = '/api/agent/db/tables';
const API_HYP_TABLES      = '/api/hyperdrive/tables';
const API_HISTORY         = '/api/agent/db/query-history';
const API_SNIPPETS        = '/api/agent/db/snippets';
const MONACO_THEME_ID     = 'iam-db';
const EVENT_DB_RESULT     = 'iam-db-result';
const HISTORY_LIMIT       = 30;

type Dialect = 'd1' | 'hyperdrive';

// ── Types ─────────────────────────────────────────────────────────────────────
interface RunResult {
  success:     boolean;
  results?:    Record<string, unknown>[];
  error?:      string;
  executionMs?: number | null;
}

interface HistoryRow {
  id?:          string;
  sql_text?:    string;
  ok?:          number;
  duration_ms?: number;
  created_at?:  number;
}

interface SnippetRow {
  id?:       string;
  title?:    string;
  sql_text?: string;
}

interface HypStatus {
  name?:   string;
  label?:  string;
  ok?:     boolean;
}

// ── Inline DataGrid ───────────────────────────────────────────────────────────
const DataGrid: React.FC<{
  data:        Record<string, unknown>[];
  onRowClick?: (row: Record<string, unknown>) => void;
}> = ({ data, onRowClick }) => {
  if (!data.length) return (
    <div className="flex items-center justify-center h-20 text-[var(--text-muted)] text-[11px] font-[var(--font-mono)]">
      0 rows returned
    </div>
  );

  const columns = Object.keys(data[0]);
  const rowKey  = (row: Record<string, unknown>, i: number) =>
    String(row['id'] ?? row['uuid'] ?? row['name'] ?? i);

  return (
    <div className="w-full overflow-auto">
      <table className="w-full text-left border-collapse min-w-max text-[11px] font-[var(--font-mono)]">
        <thead className="sticky top-0 z-10">
          <tr className="bg-[var(--bg-panel)] border-b border-[var(--border-subtle)]">
            {columns.map(col => (
              <th
                key={col}
                className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] border-r border-[var(--border-subtle)] last:border-r-0 whitespace-nowrap"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr
              key={rowKey(row, i)}
              onClick={() => onRowClick?.(row)}
              className={`
                border-b border-[var(--border-subtle)] last:border-b-0
                transition-colors
                ${onRowClick ? 'cursor-pointer hover:bg-[var(--bg-hover)]' : ''}
                ${i % 2 === 0 ? '' : 'bg-[var(--bg-panel)]/30'}
              `}
            >
              {columns.map(col => {
                const val = row[col];
                const display =
                  val === null        ? null
                  : val === undefined ? null
                  : typeof val === 'object' ? JSON.stringify(val)
                  : String(val);
                return (
                  <td
                    key={col}
                    title={display ?? 'null'}
                    className="px-3 py-1.5 border-r border-[var(--border-subtle)] last:border-r-0 max-w-[180px] truncate"
                  >
                    {display === null
                      ? <span className="italic opacity-30 text-[var(--text-muted)]">null</span>
                      : <span className="text-[var(--text-main)]">{display}</span>
                    }
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ── Snippet inline title editor ───────────────────────────────────────────────
const SnippetTitleInput: React.FC<{
  onSave:   (title: string) => void;
  onCancel: () => void;
}> = ({ onSave, onCancel }) => {
  const [val, setVal] = useState('');
  return (
    <div className="flex items-center gap-1 px-2 py-1">
      <input
        autoFocus
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && val.trim()) onSave(val.trim());
          if (e.key === 'Escape') onCancel();
        }}
        placeholder="Snippet name…"
        className="flex-1 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-2 py-0.5 text-[11px] font-[var(--font-mono)] text-[var(--text-main)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--solar-cyan)]/50"
      />
      <button
        type="button"
        onClick={() => val.trim() && onSave(val.trim())}
        disabled={!val.trim()}
        className="p-1 text-[var(--solar-green)] disabled:opacity-30"
      >
        <Check size={12} />
      </button>
      <button type="button" onClick={onCancel} className="p-1 text-[var(--text-muted)]">
        <X size={12} />
      </button>
    </div>
  );
};

// ── Connection card (settings view) ──────────────────────────────────────────
const ConnectionCard: React.FC<{
  name:     string;
  sublabel: string;
  status:   string;
  active:   boolean;
  color:    string;
  icon:     React.ReactNode;
  onSelect: () => void;
  disabled?: boolean;
}> = ({ name, sublabel, status, active, color, icon, onSelect, disabled }) => (
  <div
    role="button"
    tabIndex={disabled ? -1 : 0}
    onClick={!disabled ? onSelect : undefined}
    onKeyDown={e => !disabled && (e.key === 'Enter' || e.key === ' ') && onSelect()}
    className={`
      p-4 rounded-xl border transition-all
      ${disabled
        ? 'opacity-40 cursor-not-allowed border-[var(--border-subtle)]'
        : active
          ? 'cursor-pointer border-transparent ring-1 shadow-lg bg-[var(--bg-panel)]'
          : 'cursor-pointer border-[var(--border-subtle)] hover:border-[var(--solar-cyan)]/40 bg-[var(--bg-panel)]'
      }
    `}
    style={active && !disabled ? { boxShadow: `0 0 20px ${color}22` } : {}}
  >
    <div className="flex items-center gap-4">
      <div className="p-2 bg-[var(--bg-app)] rounded-lg shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <h4 className="text-[0.8125rem] font-bold truncate">{name}</h4>
        <span className="text-[0.625rem] font-[var(--font-mono)] text-[var(--text-muted)] truncate block">{sublabel}</span>
      </div>
      <span
        className="text-[0.625rem] font-black uppercase tracking-widest shrink-0"
        style={{ color: status === 'Connected' ? 'var(--solar-green)' : 'var(--text-muted)' }}
      >
        {status}
      </span>
    </div>
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────
export const DatabaseBrowser: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const monaco = useMonaco();

  // ── Connection state ────────────────────────────────────────────────────────
  const [dialect,       setDialect]       = useState<Dialect>('d1');
  const [hypStatus,     setHypStatus]     = useState<HypStatus | null>(null);
  const [hypChecking,   setHypChecking]   = useState(true);
  const [d1Label,       setD1Label]       = useState('inneranimalmedia-business');

  // ── Table list ──────────────────────────────────────────────────────────────
  const [tables,        setTables]        = useState<string[]>([]);
  const [tableFilter,   setTableFilter]   = useState('');
  const [tablesLoading, setTablesLoading] = useState(false);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  // ── SQL editor ──────────────────────────────────────────────────────────────
  const [sql,           setSql]           = useState('-- Write SQL here\n-- Cmd+Enter or ⌘↵ to run\n');
  const editorRef = useRef<Parameters<NonNullable<Parameters<typeof Editor>[0]['onMount']>>[0] | null>(null);

  // ── Results ─────────────────────────────────────────────────────────────────
  const [running,       setRunning]       = useState(false);
  const [result,        setResult]        = useState<RunResult | null>(null);
  const [execMs,        setExecMs]        = useState<number | null>(null);

  // ── Snippets + history ──────────────────────────────────────────────────────
  const [snippets,      setSnippets]      = useState<SnippetRow[]>([]);
  const [history,       setHistory]       = useState<HistoryRow[]>([]);
  const [savingSnippet, setSavingSnippet] = useState(false);

  // ── UI panels ───────────────────────────────────────────────────────────────
  const [view,          setView]          = useState<'console'|'settings'>('console');
  const [sideOpen,      setSideOpen]      = useState(true);   // desktop sidebar
  const [sheetOpen,     setSheetOpen]     = useState(false);  // mobile bottom sheet
  const [snippetsOpen,  setSnippetsOpen]  = useState(false);
  const [historyOpen,   setHistoryOpen]   = useState(false);
  const [resultsOpen,   setResultsOpen]   = useState(true);   // mobile collapsible results

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  // ── Monaco theme ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!monaco) return;
    const st = getComputedStyle(document.documentElement);
    const g  = (v: string, fb: string) => st.getPropertyValue(v).trim() || fb;
    monaco.editor.defineTheme(MONACO_THEME_ID, {
      base:    'vs-dark',
      inherit: true,
      rules:   [
        { token: 'keyword.sql',   foreground: g('--solar-cyan',   '2dd4bf') },
        { token: 'string.sql',    foreground: g('--solar-green',  'a3b800') },
        { token: 'number',        foreground: g('--solar-yellow', 'e6ac00') },
        { token: 'comment',       foreground: g('--text-muted',   '4a7a87'), fontStyle: 'italic' },
      ],
      colors: {
        'editor.background':              g('--bg-app',       '#00212b'),
        'editor.foreground':              g('--solar-base0',  '#9cb5bc'),
        'editorCursor.foreground':        g('--solar-cyan',   '#2dd4bf'),
        'editor.lineHighlightBackground': g('--bg-panel',     '#0a2d38'),
        'editorLineNumber.foreground':    g('--text-muted',   '#4a7a87'),
        'scrollbarSlider.background':     g('--border-subtle','#1e3e4a') + '80',
        'minimap.background':             g('--bg-app',       '#00212b'),
      },
    });
    monaco.editor.setTheme(MONACO_THEME_ID);
  }, [monaco]);

  // ── Hyperdrive health + label ────────────────────────────────────────────────
  useEffect(() => {
    setHypChecking(true);
    fetch(API_HYP_STATUS, { credentials: 'same-origin' })
      .then(r => r.json())
      .then((d: HypStatus) => setHypStatus({ ...d, ok: true }))
      .catch(() => setHypStatus({ ok: false }))
      .finally(() => setHypChecking(false));
  }, []);

  // ── D1 label from env/API ────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/health', { credentials: 'same-origin' })
      .then(r => r.json())
      .then((d: { db_name?: string }) => { if (d.db_name) setD1Label(d.db_name); })
      .catch(() => {});
  }, []);

  // ── Load tables ──────────────────────────────────────────────────────────────
  const loadTables = useCallback(async () => {
    setTablesLoading(true);
    setSelectedTable(null);
    try {
      const endpoint = dialect === 'hyperdrive' ? API_HYP_TABLES : API_D1_TABLES;
      const res  = await fetch(endpoint, { credentials: 'same-origin' });
      const data = (await res.json()) as { tables?: string[] };
      setTables(Array.isArray(data.tables) ? data.tables : []);
    } catch { setTables([]); }
    finally  { setTablesLoading(false); }
  }, [dialect]);

  useEffect(() => { void loadTables(); }, [loadTables]);

  // ── Load snippets + history ───────────────────────────────────────────────────
  const loadSnippets = useCallback(async () => {
    try {
      const r = await fetch(API_SNIPPETS, { credentials: 'same-origin' });
      const d = (await r.json()) as { items?: SnippetRow[] };
      setSnippets(Array.isArray(d.items) ? d.items : []);
    } catch { setSnippets([]); }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const r = await fetch(API_HISTORY, { credentials: 'same-origin' });
      const d = (await r.json()) as { items?: HistoryRow[] };
      setHistory(Array.isArray(d.items) ? d.items.slice(0, HISTORY_LIMIT) : []);
    } catch { setHistory([]); }
  }, []);

  useEffect(() => { void loadSnippets(); void loadHistory(); }, [loadSnippets, loadHistory]);

  // ── Execute SQL ───────────────────────────────────────────────────────────────
  const runSQL = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed || running) return;
    setRunning(true);
    setResult(null);
    const t0 = performance.now();
    const endpoint = dialect === 'hyperdrive' ? API_HYP_QUERY : API_D1_QUERY;
    try {
      const res  = await fetch(endpoint, {
        method:      'POST',
        credentials: 'same-origin',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ sql: trimmed }),
      });
      const data = (await res.json()) as {
        results?: Record<string, unknown>[];
        error?:   string;
        executionMs?: number;
      };
      const ms = data.executionMs ?? Math.round(performance.now() - t0);
      setExecMs(ms);
      const out: RunResult = Array.isArray(data.results)
        ? { success: true, results: data.results, executionMs: ms }
        : { success: false, error: data.error ?? 'Query failed', executionMs: ms };
      setResult(out);

      // Log to history API (fire-and-forget)
      void fetch(API_HISTORY, {
        method:  'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          sql_text: trimmed, db_target: dialect,
          ok: out.success ? 1 : 0,
          row_count: out.results?.length ?? 0,
          duration_ms: ms,
        }),
      }).catch(() => {}).then(() => void loadHistory());

      // Notify chat panel (Agent Sam surfaces inline preview)
      window.dispatchEvent(new CustomEvent(EVENT_DB_RESULT, { detail: out }));

      // Open results on mobile
      setResultsOpen(true);
    } catch (e) {
      const ms = Math.round(performance.now() - t0);
      setExecMs(ms);
      setResult({ success: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setRunning(false);
    }
  }, [dialect, running, loadHistory]);

  // ── Snippet save ──────────────────────────────────────────────────────────────
  const saveSnippet = useCallback(async (title: string) => {
    setSavingSnippet(false);
    try {
      await fetch(API_SNIPPETS, {
        method:  'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ title, sql_text: sql, db_target: dialect }),
      });
      void loadSnippets();
    } catch { /* ignore */ }
  }, [sql, dialect, loadSnippets]);

  // ── Table click → SELECT preview ─────────────────────────────────────────────
  const handleTableClick = (name: string) => {
    setSelectedTable(name);
    const q = dialect === 'hyperdrive'
      ? `SELECT * FROM "${name.replace(/"/g, '""')}" LIMIT 100;`
      : `SELECT * FROM "${name.replace(/"/g, '""')}" LIMIT 100;`;
    setSql(q);
    setSheetOpen(false); // close mobile sheet
    void runSQL(q);
  };

  const filteredTables = tables.filter(t =>
    t.toLowerCase().includes(tableFilter.toLowerCase())
  );

  const connLabel = dialect === 'd1'
    ? d1Label
    : (hypStatus?.label ?? hypStatus?.name ?? 'postgres / supabase');

  // ── Sidebar (shared between desktop + mobile sheet) ───────────────────────────
  const SidebarContent = (
    <div className="flex flex-col h-full bg-[var(--bg-panel)] overflow-hidden">
      {/* Connection header */}
      <div className="px-3 pt-3 pb-2 shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <Database size={13} className="text-[var(--solar-blue)] shrink-0" />
          <span className="text-[11px] font-black uppercase tracking-widest">DB Explorer</span>
        </div>
        <p className="text-[10px] font-[var(--font-mono)] text-[var(--text-muted)] truncate">{connLabel}</p>

        {/* D1 / Hyperdrive switcher */}
        <div className="flex gap-1 mt-2">
          {(['d1', 'hyperdrive'] as Dialect[]).map(d => {
            const hyp   = d === 'hyperdrive';
            const ok    = !hyp || hypStatus?.ok;
            const label = hyp ? 'Hyperdrive' : 'D1';
            return (
              <button
                key={d}
                type="button"
                disabled={hyp && !ok}
                onClick={() => setDialect(d)}
                className={`
                  flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest transition-all
                  disabled:opacity-40 disabled:cursor-not-allowed
                  ${dialect === d
                    ? 'bg-[var(--bg-app)] text-[var(--text-heading)] border border-[var(--border-subtle)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-heading)]'
                  }
                `}
              >
                {label}
                {hyp && (
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    hypChecking ? 'bg-[var(--solar-yellow)] animate-pulse'
                    : ok ? 'bg-[var(--solar-green)]'
                    : 'bg-[var(--solar-red)]'
                  }`} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Table filter */}
      <div className="px-2 pb-2 shrink-0">
        <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)] focus-within:border-[var(--solar-cyan)]/40 transition-all">
          <Search size={11} className="text-[var(--text-muted)] shrink-0" />
          <input
            type="text"
            placeholder="Filter tables…"
            value={tableFilter}
            onChange={e => setTableFilter(e.target.value)}
            className="flex-1 bg-transparent text-[11px] font-[var(--font-mono)] outline-none placeholder:text-[var(--text-muted)]"
          />
          {tableFilter && (
            <button type="button" onClick={() => setTableFilter('')}>
              <X size={10} className="text-[var(--text-muted)]" />
            </button>
          )}
        </div>
      </div>

      {/* Table list */}
      <div className="flex-1 overflow-y-auto min-h-0 px-1">
        <div className="flex items-center justify-between px-2 mb-1">
          <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
            Tables / Views
          </span>
          <div className="flex items-center gap-1">
            <span className="text-[9px] font-mono text-[var(--text-muted)] opacity-60">{filteredTables.length}</span>
            <button type="button" onClick={() => void loadTables()} className="p-0.5 hover:text-[var(--text-main)] text-[var(--text-muted)]">
              <RefreshCw size={10} className={tablesLoading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {filteredTables.map(t => (
          <button
            key={t}
            type="button"
            onClick={() => handleTableClick(t)}
            className={`
              w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-all group relative
              ${selectedTable === t
                ? 'bg-[var(--bg-hover)] text-[var(--solar-blue)]'
                : 'text-[var(--text-main)] hover:bg-[var(--bg-hover)]'
              }
            `}
          >
            {selectedTable === t && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-[var(--solar-blue)] rounded-r" />
            )}
            <TableIcon size={12} className={`shrink-0 ${selectedTable === t ? 'text-[var(--solar-blue)]' : 'text-[var(--text-muted)] group-hover:text-[var(--solar-blue)]'}`} />
            <span className="text-[11px] font-[var(--font-mono)] truncate flex-1">{t}</span>
            <ChevronRight size={10} className="opacity-0 group-hover:opacity-40 shrink-0" />
          </button>
        ))}

        {!tablesLoading && filteredTables.length === 0 && (
          <p className="px-3 py-6 text-[10px] text-[var(--text-muted)] text-center font-mono">
            {tableFilter ? 'No match' : 'No tables found'}
          </p>
        )}

        {/* System tables */}
        <div className="mt-3 px-2 mb-1">
          <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">System</span>
        </div>
        <button
          type="button"
          onClick={() => handleTableClick(dialect === 'hyperdrive' ? 'information_schema.tables' : 'sqlite_master')}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] transition-all text-left"
        >
          <Database size={11} className="shrink-0" />
          <span className="text-[10px] font-[var(--font-mono)]">
            {dialect === 'hyperdrive' ? 'information_schema' : 'sqlite_master'}
          </span>
        </button>

        {/* Snippets */}
        <div className="mt-3 border-t border-[var(--border-subtle)]/40 pt-2">
          <button
            type="button"
            onClick={() => setSnippetsOpen(v => !v)}
            className="w-full flex items-center justify-between px-2 py-1 text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--text-main)]"
          >
            <span>Saved Snippets</span>
            <div className="flex items-center gap-1">
              <span className="opacity-60">{snippets.length}</span>
              {snippetsOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            </div>
          </button>
          {snippetsOpen && (
            <>
              {savingSnippet
                ? <SnippetTitleInput onSave={saveSnippet} onCancel={() => setSavingSnippet(false)} />
                : (
                  <button
                    type="button"
                    onClick={() => setSavingSnippet(true)}
                    className="w-full flex items-center gap-1.5 px-2 py-1 text-[10px] text-[var(--solar-cyan)] hover:bg-[var(--bg-hover)] rounded transition-colors"
                  >
                    <Save size={10} /> Save current query
                  </button>
                )
              }
              {snippets.map(s => (
                <button
                  key={s.id ?? s.title}
                  type="button"
                  onClick={() => { if (s.sql_text) setSql(s.sql_text); }}
                  className="w-full text-left px-2 py-1 text-[11px] font-[var(--font-mono)] text-[var(--text-main)] hover:bg-[var(--bg-hover)] rounded truncate"
                  title={s.sql_text}
                >
                  {s.title ?? 'Untitled'}
                </button>
              ))}
              {snippets.length === 0 && (
                <p className="px-2 py-1 text-[10px] text-[var(--text-muted)] italic">No snippets yet</p>
              )}
            </>
          )}
        </div>

        {/* History */}
        <div className="mt-2 border-t border-[var(--border-subtle)]/40 pt-2 pb-4">
          <button
            type="button"
            onClick={() => setHistoryOpen(v => !v)}
            className="w-full flex items-center justify-between px-2 py-1 text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--text-main)]"
          >
            <div className="flex items-center gap-1"><Clock size={9} /> History</div>
            {historyOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          </button>
          {historyOpen && history.map((h, i) => {
            const ok  = h.ok !== 0;
            const txt = (h.sql_text ?? '').replace(/\s+/g, ' ').slice(0, 60);
            return (
              <button
                key={h.id ?? i}
                type="button"
                onClick={() => { if (h.sql_text) setSql(h.sql_text); }}
                className="w-full text-left px-2 py-1 text-[10px] font-[var(--font-mono)] hover:bg-[var(--bg-hover)] rounded border-b border-[var(--border-subtle)]/30 transition-colors"
                title={h.sql_text}
              >
                <span className={ok ? 'text-[var(--solar-green)]' : 'text-[var(--solar-red)]'}>
                  {ok ? 'ok' : 'err'}
                </span>{' '}
                <span className="text-[var(--text-muted)] truncate block">{txt}</span>
                {h.duration_ms != null && (
                  <span className="text-[9px] text-[var(--text-muted)] opacity-50">{h.duration_ms}ms</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer status */}
      <div className="px-3 py-2 border-t border-[var(--border-subtle)] shrink-0 flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--solar-green)] animate-pulse" />
        <span className="text-[10px] text-[var(--text-muted)] font-[var(--font-mono)]">Connected</span>
      </div>
    </div>
  );

  // ── Quick snippets bar (SQL suggestions for active dialect) ──────────────────
  const QUICK_SQL: Record<Dialect, { label: string; sql: string }[]> = {
    d1: [
      { label: 'Tables',  sql: `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;` },
      { label: 'Version', sql: `SELECT sqlite_version() AS version;` },
      { label: 'Count',   sql: `SELECT COUNT(*) AS total FROM sqlite_master WHERE type='table';` },
    ],
    hyperdrive: [
      { label: 'Tables',     sql: `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name LIMIT 50;` },
      { label: 'Extensions', sql: `SELECT extname, extversion FROM pg_extension ORDER BY 1;` },
      { label: 'pgvector',   sql: `SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='vector') AS installed;` },
    ],
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="w-full h-full flex flex-col bg-[var(--bg-app)] overflow-hidden text-[var(--text-main)]">

      {/* ── Top header bar ─────────────────────────────────────────────────── */}
      <div className="h-9 flex items-center justify-between px-3 border-b border-[var(--border-subtle)] bg-[var(--bg-panel)] shrink-0 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Database size={13} className="text-[var(--solar-blue)] shrink-0" />
          <span className="text-[11px] font-bold uppercase tracking-widest hidden sm:block">Database Explorer</span>
          <span className="text-[10px] font-[var(--font-mono)] text-[var(--text-muted)] truncate hidden md:block">{connLabel}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* Console / Settings */}
          <button
            type="button"
            onClick={() => setView('console')}
            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest transition-all ${view === 'console' ? 'bg-[var(--solar-cyan)]/20 text-[var(--solar-cyan)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'}`}
          >Console</button>
          <button
            type="button"
            onClick={() => setView('settings')}
            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest transition-all ${view === 'settings' ? 'bg-[var(--solar-cyan)]/20 text-[var(--solar-cyan)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'}`}
          >Conns</button>
          {/* Mobile: toggle sidebar sheet */}
          <button
            type="button"
            onClick={() => setSheetOpen(v => !v)}
            className="md:hidden p-1.5 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)]"
            title="Table list"
          >
            <TableIcon size={14} />
          </button>
          {/* Desktop: toggle sidebar */}
          <button
            type="button"
            onClick={() => setSideOpen(v => !v)}
            className="hidden md:flex p-1.5 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)]"
            title="Toggle sidebar"
          >
            <MoreHorizontal size={14} />
          </button>
          {onClose && (
            <button type="button" onClick={onClose} className="p-1.5 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-[var(--solar-red)]">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* Desktop sidebar */}
        {sideOpen && (
          <div className="hidden md:flex w-56 lg:w-64 shrink-0 flex-col border-r border-[var(--border-subtle)] min-h-0">
            {SidebarContent}
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">

          {/* Settings view */}
          {view === 'settings' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <h2 className="text-[13px] font-bold flex items-center gap-2">
                <ExternalLink size={14} className="text-[var(--solar-cyan)]" /> Connections
              </h2>
              <ConnectionCard
                name="Cloudflare D1 (SQLite)"
                sublabel={d1Label}
                status="Connected"
                active={dialect === 'd1'}
                color="var(--solar-blue)"
                icon={<Database size={16} style={{ color: 'var(--solar-blue)' }} />}
                onSelect={() => { setDialect('d1'); setView('console'); }}
              />
              <ConnectionCard
                name="Supabase via Hyperdrive"
                sublabel={hypStatus?.label ?? hypStatus?.name ?? 'postgres / supabase'}
                status={hypChecking ? 'Checking…' : hypStatus?.ok ? 'Connected' : 'Unavailable'}
                active={dialect === 'hyperdrive'}
                color="var(--solar-green)"
                icon={<ExternalLink size={16} style={{ color: 'var(--solar-green)' }} />}
                onSelect={() => { if (hypStatus?.ok) { setDialect('hyperdrive'); setView('console'); } }}
                disabled={!hypStatus?.ok}
              />
            </div>
          )}

          {/* Console view */}
          {view === 'console' && (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

              {/* Quick snippets bar */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-[var(--border-subtle)]/60 bg-[var(--bg-panel)]/40 shrink-0 overflow-x-auto no-scrollbar">
                {QUICK_SQL[dialect].map(q => (
                  <button
                    key={q.label}
                    type="button"
                    onClick={() => { setSql(q.sql); void runSQL(q.sql); }}
                    disabled={running}
                    className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--solar-cyan)]/40 hover:text-[var(--text-main)] disabled:opacity-40 whitespace-nowrap transition-all"
                  >
                    <Zap size={9} className="text-[var(--solar-orange)]" /> {q.label}
                  </button>
                ))}
              </div>

              {/* Editor + run bar */}
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden" style={{ minHeight: '160px', maxHeight: '50vh' }}>
                <Editor
                  height="100%"
                  language={dialect === 'hyperdrive' ? 'pgsql' : 'sql'}
                  theme={MONACO_THEME_ID}
                  value={sql}
                  onChange={v => setSql(v ?? '')}
                  onMount={editor => {
                    editorRef.current = editor;
                    // Cmd+Enter / Ctrl+Enter → run
                    editor.addCommand(
                      // Monaco KeyMod + KeyCode
                      2048 /* CtrlCmd */ | 3 /* Enter */,
                      () => void runSQL(editor.getValue())
                    );
                  }}
                  options={{
                    fontSize:                   13,
                    fontFamily:                 'var(--font-mono, "JetBrains Mono", monospace)',
                    lineHeight:                 20,
                    minimap:                    { enabled: false },
                    scrollBeyondLastLine:       false,
                    padding:                    { top: 10 },
                    wordWrap:                   'on',
                    folding:                    false,
                    lineNumbers:                'on',
                    glyphMargin:                false,
                    tabSize:                    2,
                    insertSpaces:               true,
                    quickSuggestions:           true,
                    bracketPairColorization:    { enabled: true },
                  }}
                />
              </div>

              {/* Run bar */}
              <div className="flex items-center gap-2 px-3 py-2 border-t border-b border-[var(--border-subtle)] bg-[var(--bg-panel)] shrink-0">
                <button
                  type="button"
                  onClick={() => void runSQL(sql)}
                  disabled={running || !sql.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--solar-green)]/10 hover:bg-[var(--solar-green)]/20 border border-[var(--solar-green)]/30 text-[var(--solar-green)] rounded text-[11px] font-bold transition-all disabled:opacity-40"
                >
                  {running
                    ? <Loader2 size={13} className="animate-spin" />
                    : <Play size={13} fill="currentColor" />
                  }
                  <span className="hidden sm:block">{running ? 'Running…' : 'Run'}</span>
                  <span className="sm:hidden">{running ? '…' : 'Run'}</span>
                </button>
                <span className="text-[10px] text-[var(--text-muted)] font-[var(--font-mono)] hidden sm:block">
                  {dialect === 'hyperdrive' ? 'PostgreSQL' : 'SQLite / D1'} · ⌘↵ to run
                </span>
                {result && execMs != null && (
                  <div className={`ml-auto flex items-center gap-1.5 text-[10px] font-[var(--font-mono)] ${result.success ? 'text-[var(--solar-green)]' : 'text-[var(--solar-red)]'}`}>
                    {result.success
                      ? <CheckCircle2 size={12} />
                      : <AlertCircle size={12} />
                    }
                    {result.success
                      ? `${result.results?.length ?? 0} rows · ${execMs}ms`
                      : `error · ${execMs}ms`
                    }
                  </div>
                )}
              </div>

              {/* Results — collapsible on mobile */}
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                {/* Mobile results toggle */}
                <button
                  type="button"
                  onClick={() => setResultsOpen(v => !v)}
                  className="md:hidden flex items-center justify-between px-3 py-2 border-b border-[var(--border-subtle)] text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] bg-[var(--bg-panel)]/50"
                >
                  <div className="flex items-center gap-1.5">
                    <PanelBottomOpen size={11} />
                    Results
                    {result?.results && <span className="font-mono opacity-60">({result.results.length})</span>}
                  </div>
                  {resultsOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                </button>

                {/* Desktop results label */}
                <div className="hidden md:flex items-center justify-between px-3 py-1.5 border-b border-[var(--border-subtle)] bg-[var(--bg-panel)]/30 shrink-0">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Results</span>
                  {result?.results && (
                    <span className="text-[10px] font-[var(--font-mono)] text-[var(--text-muted)]">
                      {result.results.length} row{result.results.length === 1 ? '' : 's'}
                    </span>
                  )}
                </div>

                {/* Results body */}
                {(resultsOpen || !isMobile) && (
                  <div className="flex-1 overflow-auto">
                    {!result && (
                      <div className="flex flex-col items-center justify-center h-full opacity-30 text-[11px] font-[var(--font-mono)] gap-2">
                        <span className="text-lg">›_</span>
                        Run a query to see results
                      </div>
                    )}
                    {result && result.success && result.results && (
                      <DataGrid data={result.results} />
                    )}
                    {result && !result.success && (
                      <div className="m-4 p-3 bg-[var(--solar-red)]/10 border border-[var(--solar-red)]/20 rounded-lg text-[var(--solar-red)] text-[12px] font-[var(--font-mono)]">
                        <div className="flex items-center gap-2 font-black mb-1">
                          <AlertCircle size={13} /> Error
                        </div>
                        <pre className="whitespace-pre-wrap break-all text-[11px]">{result.error}</pre>
                      </div>
                    )}
                    {result && result.success && result.results?.length === 0 && (
                      <div className="flex items-center justify-center h-full text-[11px] text-[var(--text-muted)] font-[var(--font-mono)] opacity-60">
                        Query succeeded · 0 rows returned
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Mobile bottom sheet (table list) ─────────────────────────────────── */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setSheetOpen(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="absolute bottom-0 left-0 right-0 rounded-t-2xl overflow-hidden"
            style={{ maxHeight: '75vh' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="h-1 w-10 bg-[var(--border-subtle)] rounded-full mx-auto mt-3 mb-1" />
            <div style={{ height: 'calc(75vh - 20px)' }}>
              {SidebarContent}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
