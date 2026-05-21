/**
 * DatabasePage — /dashboard/database
 *
 * D1 Studio–style explorer: flat table list, multi-buffer SQL workspace, schema/data/DDL tabs.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  Database,
  Download,
  Filter,
  Key,
  Link2,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Search,
  Table as TableIcon,
  Trash2,
  X,
} from 'lucide-react';

import { MonacoSurface } from './MonacoSurface';
import { highlightSearchMatchAll } from '../src/lib/highlightSearchMatch';
import {
  evaluateDatabaseSqlSafety,
  getDatabaseSqlRunGate,
} from '../src/lib/databaseSqlSafety';
import {
  publishDatabaseSurfaceContext,
  type DatabaseDatasource,
  type DatabaseSurfaceContext,
  type DbApplySqlMode,
} from '../src/lib/databaseStudioEvents';
import {
  DATABASE_FILTER_UI_OPS,
  DATABASE_FILTER_UI_LABELS,
  serializeDatabaseFilters,
  type DatabaseFilterRule,
  type DatabaseFilterUiOp,
} from '../src/lib/databaseTableFilters';
import { DatabaseSqlConfirmModal, type SqlConfirmPayload } from './database/DatabaseSqlConfirmModal';
import { DatabaseCellDetailDrawer, type CellDetailPayload } from './database/DatabaseCellDetailDrawer';
import '../components/database/database-page.css';

type Datasource = 'd1' | 'hyperdrive';
type MainTab = 'schema' | 'data' | 'sql' | 'indexes' | 'relations';
type SortDir = 'asc' | 'desc';
type LoadStatus = 'idle' | 'loading' | 'ok' | 'error';
type SqlRunState = 'idle' | 'running' | 'success' | 'error';

const LS_DATASOURCE = 'iam.database.datasource';
const LS_TABLE = 'iam.database.selectedTable';
const LS_TAB = 'iam.database.activeTab';
const LS_RESULTS_H = 'iam.database.resultsPaneHeight';
const DEFAULT_RESULTS_PANE_H = 220;
const MIN_RESULTS_PANE_H = 160;
const MIN_SQL_EDITOR_H = 120;

type TableMeta = {
  name: string;
  row_count?: number | null;
  table_schema?: string;
  sql?: string | null;
};

type SchemaColumn = {
  cid?: number;
  name: string;
  type: string;
  notnull?: number | boolean;
  nullable?: boolean;
  dflt_value?: string | null;
  column_default?: string | null;
  pk?: number | boolean;
  constraints?: string[];
};

type IndexMeta = {
  name: string;
  sql?: string | null;
  unique?: boolean | number;
};

type RelationMeta = {
  id?: number;
  from?: string;
  to?: string;
  table?: string;
  target_table?: string;
  target_column?: string;
  source_column?: string;
  direction?: 'inbound' | 'outbound';
};

type DataResponse = {
  rows: Record<string, unknown>[];
  total_count: number;
  columns?: string[];
  page: number;
  total_pages: number;
};


type SqlQueryTab = {
  id: string;
  title: string;
  sql: string;
};

const PAGE_SIZE = 50;
const FILTER_OPS: DatabaseFilterUiOp[] = DATABASE_FILTER_UI_OPS;

function quoteIdent(name: string) {
  return `"${name.replace(/"/g, '""')}"`;
}

function readStoredDatasource(): Datasource {
  try {
    const v = localStorage.getItem(LS_DATASOURCE);
    if (v === 'd1' || v === 'hyperdrive') return v;
  } catch {
    /* ignore */
  }
  return 'd1';
}

function readStoredMainTab(): MainTab {
  try {
    const v = localStorage.getItem(LS_TAB);
    if (v === 'schema' || v === 'data' || v === 'sql' || v === 'indexes' || v === 'relations') return v;
  } catch {
    /* ignore */
  }
  return 'schema';
}

function readStoredResultsHeight(): number {
  try {
    const n = Number(localStorage.getItem(LS_RESULTS_H));
    if (Number.isFinite(n) && n >= MIN_RESULTS_PANE_H) return Math.round(n);
  } catch {
    /* ignore */
  }
  return DEFAULT_RESULTS_PANE_H;
}

function normalizeTables(payload: unknown): TableMeta[] {
  const data = payload as { tables?: unknown[] };
  if (!Array.isArray(data?.tables)) return [];
  return data.tables
    .map((item) => {
      if (typeof item === 'string') return { name: item };
      const row = item as Partial<TableMeta> & { tablename?: string; table_name?: string };
      return {
        name: String(row.name ?? row.table_name ?? row.tablename ?? '').trim(),
        row_count: row.row_count == null ? null : Number(row.row_count),
        table_schema: row.table_schema,
        sql: row.sql ?? null,
      };
    })
    .filter((t) => t.name)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

function isPrimaryKey(col: SchemaColumn) {
  return col.pk === true || Number(col.pk) > 0;
}

function isNotNull(col: SchemaColumn) {
  return col.notnull === true || Number(col.notnull) > 0 || col.nullable === false;
}

function columnDefault(col: SchemaColumn) {
  return col.dflt_value ?? col.column_default ?? null;
}

function formatValue(value: unknown, columnName = '') {
  if (value === null || value === undefined) return <span className="database-null-chip">NULL</span>;
  if (typeof value === 'number') {
    const isLikelyEpoch = /(_at|time|date|timestamp)$/i.test(columnName) && value > 946684800 && value < 4102444800;
    if (isLikelyEpoch) {
      const d = new Date(value * 1000);
      return <span title={String(value)}>{d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>;
    }
    return <span className="font-mono text-right tabular-nums">{value}</span>;
  }
  if (typeof value === 'boolean' || value === 0 || value === 1) {
    return (
      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${value ? 'bg-[var(--solar-green)]/15 text-[var(--solar-green)]' : 'bg-[var(--bg-hover)] text-[var(--text-muted)]'}`}>
        {value ? 'true' : 'false'}
      </span>
    );
  }
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  const trimmed = text.trim();
  if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && trimmed.length > 1) {
    try {
      JSON.parse(trimmed);
      return (
        <details className="max-w-[280px]">
          <summary className="cursor-pointer text-[var(--solar-cyan)]">JSON</summary>
          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded border border-[var(--border-subtle)] bg-[var(--bg-app)] p-2 text-[10px]">
            {JSON.stringify(JSON.parse(trimmed), null, 2)}
          </pre>
        </details>
      );
    } catch {
      return <span title={text}>{text}</span>;
    }
  }
  return <span title={text}>{text.length > 80 ? `${text.slice(0, 80)}...` : text}</span>;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin', ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || res.statusText);
  return data as T;
}

function isTransientFetchError(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return /failed to fetch|network|load failed|aborted|timed out|timeout/i.test(m);
}

function Drawer({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <aside className="absolute right-0 top-0 z-30 flex h-full w-full max-w-[420px] flex-col border-l border-[var(--border-subtle)] bg-[var(--bg-panel)] shadow-2xl">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          {subtitle && <p className="mt-0.5 truncate font-mono text-[11px] text-[var(--text-muted)]">{subtitle}</p>}
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]">
          <X size={15} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
    </aside>
  );
}

function newTabId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `q_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

const INITIAL_SQL_WORKSPACE = (() => {
  const id = newTabId();
  return {
    tabs: [{ id, title: 'Query', sql: "-- SQL\nSELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name LIMIT 50;" }] as SqlQueryTab[],
    activeId: id,
  };
})();

function SetupCard({ title, body, to }: { title: string; body: string; to: string }) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-6 shadow-sm">
      <h3 className="text-sm font-semibold text-[var(--text-main)]">{title}</h3>
      <p className="mt-2 text-[12px] leading-relaxed text-[var(--text-muted)]">{body}</p>
      <Link
        to={to}
        className="mt-4 inline-flex rounded-lg bg-[var(--color-accent,var(--solar-cyan))]/15 px-3 py-2 text-[11px] font-bold text-[var(--color-accent,var(--solar-cyan))] hover:bg-[var(--color-accent,var(--solar-cyan))]/25"
      >
        Open settings
      </Link>
    </div>
  );
}

export const DatabasePage: React.FC = () => {
  const [sidebarSource, setSidebarSource] = useState<Datasource>(readStoredDatasource);
  const datasource: Datasource = sidebarSource;
  const [tables, setTables] = useState<Record<Datasource, TableMeta[]>>({ d1: [], hyperdrive: [] });
  const [d1Status, setD1Status] = useState<LoadStatus>('idle');
  const [hyperStatus, setHyperStatus] = useState<LoadStatus>('idle');
  const [tableSearch, setTableSearch] = useState('');
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [columnCache, setColumnCache] = useState<Record<string, SchemaColumn[]>>({});
  const [columnLoading, setColumnLoading] = useState<Record<string, boolean>>({});
  const [selectedTable, setSelectedTable] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LS_TABLE);
    } catch {
      return null;
    }
  });
  const [activeMainTab, setActiveMainTab] = useState<MainTab>(readStoredMainTab);
  const [loadingTables, setLoadingTables] = useState(false);

  const [schema, setSchema] = useState<SchemaColumn[]>([]);
  const [indexes, setIndexes] = useState<IndexMeta[]>([]);
  const [relations, setRelations] = useState<RelationMeta[]>([]);
  const [data, setData] = useState<DataResponse>({ rows: [], total_count: 0, page: 1, total_pages: 1 });
  const [dataError, setDataError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [sortCol, setSortCol] = useState('');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [filters, setFilters] = useState<DatabaseFilterRule[]>([]);
  const [loadingMain, setLoadingMain] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [deleteRowsModal, setDeleteRowsModal] = useState(false);
  const [sqlConfirmModal, setSqlConfirmModal] = useState<SqlConfirmPayload | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ rowKey: string; col: string } | null>(null);
  const [cellDetail, setCellDetail] = useState<CellDetailPayload | null>(null);

  const [queryTabs, setQueryTabs] = useState<SqlQueryTab[]>(INITIAL_SQL_WORKSPACE.tabs);
  const [activeQueryTabId, setActiveQueryTabId] = useState(INITIAL_SQL_WORKSPACE.activeId);
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  const [sqlResults, setSqlResults] = useState<Record<string, unknown>[]>([]);
  const [sqlColumns, setSqlColumns] = useState<string[]>([]);
  const [sqlError, setSqlError] = useState<string | null>(null);
  const [sqlRunState, setSqlRunState] = useState<SqlRunState>('idle');
  const [lastAttemptedSql, setLastAttemptedSql] = useState('');
  const [lastQueryMs, setLastQueryMs] = useState<number | null>(null);
  const [lastRowsRead, setLastRowsRead] = useState<number | null>(null);
  const [resultsPaneHeight, setResultsPaneHeight] = useState(readStoredResultsHeight);
  const [splitterDragging, setSplitterDragging] = useState(false);

  const [drawer, setDrawer] = useState<'insert' | null>(null);
  const [insertValues, setInsertValues] = useState<Record<string, string>>({});
  const [editingCell, setEditingCell] = useState<{ rowKey: string; col: string; value: string } | null>(null);

  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [capLoaded, setCapLoaded] = useState(false);
  const [pageReady, setPageReady] = useState(false);
  const [hyperHealthBad, setHyperHealthBad] = useState(false);

  const sqlEditorRef = useRef<import('monaco-editor').editor.IStandaloneCodeEditor | null>(null);
  const sqlStackRef = useRef<HTMLDivElement | null>(null);
  const resultsPaneHeightRef = useRef(resultsPaneHeight);
  resultsPaneHeightRef.current = resultsPaneHeight;
  const activeQueryTabIdRef = useRef(activeQueryTabId);
  activeQueryTabIdRef.current = activeQueryTabId;
  const runSqlRef = useRef<(statement: string) => Promise<void>>(async () => {});

  const sqlRunning = sqlRunState === 'running';

  const activeTables = tables[datasource];
  const datasourceLabel = datasource === 'd1' ? 'Cloudflare D1 (SQLite)' : 'Supabase via Hyperdrive (Postgres)';
  const selectedTableSqlName = selectedTable ? quoteIdent(selectedTable) : '';
  const pk = useMemo(() => schema.find(isPrimaryKey)?.name || '', [schema]);
  const canWriteRows = isSuperadmin && capLoaded;
  const canEditDataCell = canWriteRows && datasource === 'd1' && Boolean(pk) && Boolean(selectedTable);
  const canInsertRow = canWriteRows && Boolean(selectedTable) && datasource === 'd1';
  const canDeleteRows =
    canWriteRows && datasource === 'd1' && Boolean(selectedTable) && Boolean(pk) && selectedRows.size > 0;
  const insertDisabledReason =
    !canWriteRows
      ? 'Insert requires write access (superadmin).'
      : !selectedTable
        ? 'Select a table first.'
        : datasource === 'hyperdrive'
          ? 'Insert row is D1-only for v1. Use the SQL tab for Hyperdrive mutations after confirmation.'
          : '';
  const deleteDisabledReason =
    !canWriteRows
      ? 'Delete requires write access (superadmin).'
      : datasource === 'hyperdrive'
        ? 'Row delete is D1-only for v1. Use the SQL tab for Hyperdrive deletes after confirmation.'
        : !pk
          ? 'Deleting requires a primary key so rows can be targeted safely.'
          : selectedRows.size === 0
            ? 'Select one or more rows to delete.'
            : '';
  const editDisabledReason =
    !canWriteRows
      ? 'Editing requires write access (superadmin).'
      : datasource === 'hyperdrive'
        ? 'Hyperdrive inline edit is disabled until safe parameterized row updates exist.'
        : !pk
          ? 'Editing requires a primary key so this row can be updated safely.'
          : !selectedTable
            ? 'Select a table on the Data tab.'
            : '';
  const filteredTables = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    return q ? activeTables.filter((t) => t.name.toLowerCase().includes(q)) : activeTables;
  }, [activeTables, tableSearch]);
  const columns = data.columns?.length ? data.columns : Object.keys(data.rows[0] || {});

  const insertSql = useMemo(() => {
    if (!selectedTable) return '';
    const pairs = schema
      .filter((col) => insertValues[col.name] !== undefined && insertValues[col.name] !== '')
      .map((col) => [col.name, insertValues[col.name]] as const);
    if (!pairs.length) return `INSERT INTO ${selectedTableSqlName} DEFAULT VALUES;`;
    const cols = pairs.map(([name]) => quoteIdent(name)).join(', ');
    const vals = pairs.map(([, value]) => (value.toLowerCase() === 'null' ? 'NULL' : `'${value.replace(/'/g, "''")}'`)).join(', ');
    return `INSERT INTO ${selectedTableSqlName} (${cols}) VALUES (${vals});`;
  }, [insertValues, schema, selectedTable, selectedTableSqlName]);

  const activeSql = useMemo(() => queryTabs.find((t) => t.id === activeQueryTabId)?.sql ?? '', [queryTabs, activeQueryTabId]);

  const loadThemeAccent = useCallback(async () => {
    const root = document.documentElement;
    const cmsReady =
      root.getAttribute('data-dashboard-theme-ready') === 'true' || Boolean(root.getAttribute('data-cms-theme'));
    if (cmsReady) {
      const hasMonacoBg =
        root.style.getPropertyValue('--database-monaco-bg').trim() || root.getAttribute('data-monaco-bg')?.trim();
      if (hasMonacoBg) return;
    }
    try {
      const theme = await fetchJson<{
        theme?: { config?: Record<string, unknown>; monaco_bg?: string };
        variables?: Record<string, string>;
      }>('/api/workspace/settings');
      if (!cmsReady) {
        const config = theme.theme?.config || {};
        const variables = theme.variables || {};
        const accent = String((config.accent_color || config.accentColor || variables['--color-accent'] || variables['--solar-cyan'] || '') ?? '').trim();
        if (accent) root.style.setProperty('--color-accent', accent);
      }
      const monacoBg = theme.theme?.monaco_bg;
      if (monacoBg && !root.style.getPropertyValue('--database-monaco-bg').trim()) {
        root.style.setProperty('--database-monaco-bg', String(monacoBg));
      }
    } catch {
      /* ignore */
    }
  }, []);

  const loadCapabilities = useCallback(async () => {
    try {
      const payload = await fetchJson<{ capabilities?: { is_superadmin?: boolean } }>('/api/integrations/summary');
      setIsSuperadmin(payload.capabilities?.is_superadmin === true);
    } catch {
      setIsSuperadmin(false);
    } finally {
      setCapLoaded(true);
    }
  }, []);

  const loadTables = useCallback(async (target: Datasource) => {
    if (target === 'd1') setD1Status('loading');
    else setHyperStatus('loading');
    setLoadingTables(true);
    const endpoint = target === 'd1' ? '/api/d1/tables' : '/api/hyperdrive/tables';

    const loadOnce = async () => {
      const res = await fetch(endpoint, { credentials: 'same-origin' });
      const payload = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setTables((prev) => ({ ...prev, [target]: [] }));
        if (target === 'd1') setD1Status('ok');
        else setHyperStatus('ok');
        return;
      }
      if (!res.ok) {
        throw new Error((payload as { error?: string }).error || res.statusText);
      }
      setTables((prev) => ({ ...prev, [target]: normalizeTables(payload) }));
      if (target === 'd1') setD1Status('ok');
      else setHyperStatus('ok');
    };

    try {
      try {
        await loadOnce();
      } catch (first) {
        if (!isTransientFetchError(first)) throw first;
        await new Promise((r) => setTimeout(r, 1000));
        await loadOnce();
      }
    } catch {
      setTables((prev) => ({ ...prev, [target]: [] }));
      if (target === 'd1') setD1Status('error');
      else setHyperStatus('error');
    } finally {
      setLoadingTables(false);
    }
  }, []);

  const loadAllTables = useCallback(async () => {
    await Promise.all([loadTables('d1'), loadTables('hyperdrive')]);
  }, [loadTables]);

  const loadSchema = useCallback(
    async (table: string) => {
      setLoadingMain(true);
      try {
        const base = datasource === 'd1' ? '/api/d1/table' : '/api/hyperdrive/table';
        const payload = await fetchJson<{ columns?: SchemaColumn[]; schema?: SchemaColumn[]; indexes?: IndexMeta[]; foreign_keys?: RelationMeta[] }>(
          `${base}/${encodeURIComponent(table)}/schema`,
        );
        setSchema(payload.columns || payload.schema || []);
        setIndexes(payload.indexes || []);
        setRelations(payload.foreign_keys || []);
      } finally {
        setLoadingMain(false);
      }
    },
    [datasource],
  );

  const loadData = useCallback(
    async (table: string, nextPage = page) => {
      setLoadingMain(true);
      setDataError(null);
      try {
        const base = datasource === 'd1' ? '/api/d1/table' : '/api/hyperdrive/table';
        const qs = new URLSearchParams({ page: String(nextPage), limit: String(PAGE_SIZE) });
        if (sortCol) qs.set('sort', sortCol);
        if (sortCol) qs.set('dir', sortDir);
        if (filters.length) qs.set('filter', serializeDatabaseFilters(filters));
        const payload = await fetchJson<DataResponse>(`${base}/${encodeURIComponent(table)}/data?${qs.toString()}`);
        setData(payload);
        setSelectedRows(new Set());
      } catch (e) {
        setDataError(e instanceof Error ? e.message : String(e));
        setData({ rows: [], total_count: 0, page: nextPage, total_pages: 1 });
      } finally {
        setLoadingMain(false);
      }
    },
    [datasource, filters, page, sortCol, sortDir],
  );

  useEffect(() => {
    void loadThemeAccent();
  }, [loadThemeAccent]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadCapabilities();
      await loadAllTables();
      if (!cancelled) setPageReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadAllTables, loadCapabilities]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/hyperdrive/health', { credentials: 'same-origin' });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.status === 401) {
          setHyperHealthBad(false);
          return;
        }
        if (res.status >= 500 || res.status === 503) {
          setHyperHealthBad(true);
          return;
        }
        setHyperHealthBad(data.ok === false);
      } catch {
        if (!cancelled) setHyperHealthBad(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setColumnCache({});
    setExpandedTables(new Set());
  }, [datasource]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_DATASOURCE, datasource);
    } catch {
      /* ignore */
    }
  }, [datasource]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_TAB, activeMainTab);
    } catch {
      /* ignore */
    }
  }, [activeMainTab]);

  useEffect(() => {
    try {
      if (selectedTable) localStorage.setItem(LS_TABLE, selectedTable);
      else localStorage.removeItem(LS_TABLE);
    } catch {
      /* ignore */
    }
  }, [selectedTable]);

  useEffect(() => {
    if (!pageReady || !selectedTable || loadingTables) return;
    if (!activeTables.length) return;
    const exists = activeTables.some((t) => t.name === selectedTable);
    if (!exists) setSelectedTable(null);
  }, [pageReady, activeTables, selectedTable, loadingTables]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_RESULTS_H, String(resultsPaneHeight));
    } catch {
      /* ignore */
    }
  }, [resultsPaneHeight]);

  useEffect(() => {
    if (!selectedTable || activeMainTab === 'sql') return;
    void loadSchema(selectedTable);
    void loadData(selectedTable, 1);
  }, [datasource, loadData, loadSchema, selectedTable, activeMainTab]);

  const setActiveSql = useCallback((text: string) => {
    const id = activeQueryTabIdRef.current;
    setQueryTabs((tabs) => tabs.map((t) => (t.id === id ? { ...t, sql: text } : t)));
  }, []);

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  }, []);

  const executeSqlInternal = useCallback(
    async (
      raw: string,
      opts: { studioApproved?: boolean; destructiveConfirmed?: boolean } = {},
    ) => {
      setLastAttemptedSql(raw);
      setSqlRunState('running');
      setSqlError(null);
      const t0 = performance.now();
      try {
        const endpoint = datasource === 'd1' ? '/api/d1/query' : '/api/hyperdrive/query';
        const payload = await fetchJson<{ rows?: Record<string, unknown>[]; results?: Record<string, unknown>[]; error?: string }>(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sql: raw,
            params: [],
            studio_approved: opts.studioApproved === true,
            destructive_confirmed: opts.destructiveConfirmed === true,
          }),
        });
        if (payload.error) {
          setSqlError(payload.error);
          setSqlResults([]);
          setSqlColumns([]);
          setSqlRunState('error');
          setLastQueryMs(Math.round(performance.now() - t0));
          setLastRowsRead(0);
          return;
        }
        const rows = payload.rows || payload.results || [];
        setSqlResults(Array.isArray(rows) ? rows : []);
        const keys = rows.length && typeof rows[0] === 'object' && rows[0] ? Object.keys(rows[0] as object) : [];
        setSqlColumns(keys);
        setLastQueryMs(Math.round(performance.now() - t0));
        setLastRowsRead(Array.isArray(rows) ? rows.length : 0);
        setSqlRunState('success');
      } catch (e) {
        setSqlError(e instanceof Error ? e.message : String(e));
        setSqlResults([]);
        setSqlColumns([]);
        setSqlRunState('error');
        setLastQueryMs(Math.round(performance.now() - t0));
        setLastRowsRead(0);
      }
    },
    [datasource],
  );

  const requestRunSql = useCallback(
    (statement?: string) => {
      const raw = (statement ?? queryTabs.find((t) => t.id === activeQueryTabId)?.sql ?? '').trim();
      if (!raw) {
        setSqlError('Empty query');
        setSqlResults([]);
        setSqlColumns([]);
        setSqlRunState('error');
        return;
      }
      const safety = evaluateDatabaseSqlSafety(raw, { isSuperadmin });
      if (!safety.allowed) {
        setSqlError(safety.error || 'SQL not permitted');
        setSqlResults([]);
        setSqlColumns([]);
        setSqlRunState('error');
        return;
      }
      const gate = getDatabaseSqlRunGate(raw, { isSuperadmin });
      if (!gate.canExecute) {
        if (gate.requiresApproval || gate.requiresRunModal) {
          setSqlConfirmModal({
            sql: raw,
            kind: gate.kind,
            riskLevel: gate.riskLevel,
            requiresConfirmTyping: gate.requiresConfirmTyping,
            datasourceLabel,
          });
          return;
        }
        setSqlError(gate.error || 'SQL not permitted');
        setSqlResults([]);
        setSqlColumns([]);
        setSqlRunState('error');
        return;
      }
      void executeSqlInternal(raw, { studioApproved: true, destructiveConfirmed: gate.requiresConfirmTyping });
    },
    [activeQueryTabId, datasourceLabel, executeSqlInternal, isSuperadmin, queryTabs],
  );

  const confirmSqlModalRun = useCallback(() => {
    if (!sqlConfirmModal) return;
    const raw = sqlConfirmModal.sql;
    setSqlConfirmModal(null);
    void executeSqlInternal(raw, {
      studioApproved: true,
      destructiveConfirmed: sqlConfirmModal.requiresConfirmTyping,
    });
  }, [executeSqlInternal, sqlConfirmModal]);

  const runSql = requestRunSql;

  useEffect(() => {
    runSqlRef.current = (statement: string) => requestRunSql(statement);
  }, [requestRunSql]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (activeMainTab !== 'sql') return;
      if (!(event.metaKey || event.ctrlKey) || event.key !== 'Enter') return;
      if (event.shiftKey) return;
      event.preventDefault();
      void runSql();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeMainTab, runSql]);

  const beginResultsPaneResize = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches) return;
    e.preventDefault();
    const el = e.currentTarget;
    const pointerId = e.pointerId;
    try {
      el.setPointerCapture(pointerId);
    } catch {
      /* ignore */
    }
    setSplitterDragging(true);
    document.body.classList.add('is-resizing-row');
    const startY = e.clientY;
    const startH = resultsPaneHeightRef.current;
    const stackH = sqlStackRef.current?.getBoundingClientRect().height ?? 600;
    const maxResults = Math.max(MIN_RESULTS_PANE_H, stackH - MIN_SQL_EDITOR_H - 8);

    let finished = false;
    const endDrag = () => {
      if (finished) return;
      finished = true;
      setSplitterDragging(false);
      document.body.classList.remove('is-resizing-row');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      try {
        el.releasePointerCapture(pointerId);
      } catch {
        /* ignore */
      }
      try {
        localStorage.setItem(LS_RESULTS_H, String(resultsPaneHeightRef.current));
      } catch {
        /* ignore */
      }
    };

    const onMove = (pe: PointerEvent) => {
      if (pe.pointerId !== pointerId) return;
      const delta = startY - pe.clientY;
      const next = Math.max(MIN_RESULTS_PANE_H, Math.min(maxResults, startH + delta));
      setResultsPaneHeight(next);
    };
    const onEnd = (pe: PointerEvent) => {
      if (pe.pointerId !== pointerId) return;
      endDrag();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
  }, []);

  const resetResultsPaneHeight = useCallback(() => {
    setResultsPaneHeight(DEFAULT_RESULTS_PANE_H);
  }, []);

  useEffect(() => {
    const onFmt = (event: KeyboardEvent) => {
      if (activeMainTab !== 'sql' || renamingTabId) return;
      if (!event.altKey || event.metaKey || event.ctrlKey) return;
      if (event.key.toLowerCase() !== 'f') return;
      event.preventDefault();
      void sqlEditorRef.current?.getAction('editor.action.formatDocument')?.run();
    };
    window.addEventListener('keydown', onFmt);
    return () => window.removeEventListener('keydown', onFmt);
  }, [activeMainTab, renamingTabId]);

  const selectTableSql = useCallback(
    (name: string) => {
      if (datasource === 'd1') {
        return `SELECT * FROM ${quoteIdent(name)} LIMIT 50;`;
      }
      return `SELECT * FROM public.${quoteIdent(name)} LIMIT 50;`;
    },
    [datasource],
  );

  useEffect(() => {
    const sqlForTable = (name: string, ds: Datasource) => {
      if (ds === 'd1') return `SELECT * FROM ${quoteIdent(name)} LIMIT 50;`;
      return `SELECT * FROM public.${quoteIdent(name)} LIMIT 50;`;
    };

    const onApply = (ev: Event) => {
      const e = ev as CustomEvent<{
        sql?: string;
        run?: boolean;
        autorun?: boolean;
        mode?: DbApplySqlMode;
        datasource?: DatabaseDatasource;
      }>;
      const text = String(e.detail?.sql ?? '').trim();
      if (!text) return;

      const targetDs = e.detail?.datasource;
      if (targetDs === 'd1' || targetDs === 'hyperdrive') {
        setSidebarSource(targetDs);
      }

      setActiveMainTab('sql');
      const mode = e.detail?.mode ?? 'replace';
      const shouldRun = e.detail?.run === true || e.detail?.autorun === true;

      if (mode === 'new_tab') {
        const id = newTabId();
        setQueryTabs((tabs) => [...tabs, { id, title: 'Agent query', sql: text }]);
        setActiveQueryTabId(id);
      } else if (mode === 'append') {
        const id = activeQueryTabIdRef.current;
        setQueryTabs((tabs) =>
          tabs.map((t) => (t.id === id ? { ...t, sql: t.sql.trim() ? `${t.sql.trim()}\n\n${text}` : text } : t)),
        );
      } else {
        const id = activeQueryTabIdRef.current;
        setQueryTabs((tabs) => tabs.map((t) => (t.id === id ? { ...t, sql: text } : t)));
      }

      if (shouldRun) {
        queueMicrotask(() => runSqlRef.current(text));
      }
    };

    const onOpenTable = (ev: Event) => {
      const e = ev as CustomEvent<{ datasource?: DatabaseDatasource; table?: string; tab?: MainTab }>;
      const name = String(e.detail?.table ?? '').trim();
      if (!name) return;
      const ds: Datasource = e.detail?.datasource === 'hyperdrive' ? 'hyperdrive' : 'd1';
      setSidebarSource(ds);
      setSelectedTable(name);
      setPage(1);
      const tab = e.detail?.tab ?? 'schema';
      setActiveMainTab(tab);
      if (tab === 'sql') {
        setActiveSql(sqlForTable(name, ds));
      }
    };

    const onQueryAnalysis = (ev: Event) => {
      const e = ev as CustomEvent<{ sql?: string; error?: string; datasource?: DatabaseDatasource }>;
      if (e.detail?.datasource === 'd1' || e.detail?.datasource === 'hyperdrive') {
        setSidebarSource(e.detail.datasource);
      }
      const sqlText = String(e.detail?.sql ?? lastAttemptedSql ?? '').trim();
      const errText = e.detail?.error != null ? String(e.detail.error) : '';
      if (sqlText) {
        setActiveMainTab('sql');
        const id = activeQueryTabIdRef.current;
        setQueryTabs((tabs) =>
          tabs.map((t) =>
            t.id === id
              ? {
                  ...t,
                  sql: errText ? `${sqlText}\n\n-- Last error:\n-- ${errText.replace(/\n/g, '\n-- ')}` : sqlText,
                }
              : t,
          ),
        );
      }
      if (errText) {
        setSqlError(errText);
        setSqlRunState('error');
      }
    };

    window.addEventListener('db:apply-sql', onApply as EventListener);
    window.addEventListener('db:open-table', onOpenTable as EventListener);
    window.addEventListener('db:open-query-analysis', onQueryAnalysis as EventListener);
    return () => {
      window.removeEventListener('db:apply-sql', onApply as EventListener);
      window.removeEventListener('db:open-table', onOpenTable as EventListener);
      window.removeEventListener('db:open-query-analysis', onQueryAnalysis as EventListener);
    };
  }, [isSuperadmin, lastAttemptedSql, setActiveSql]);

  useEffect(() => {
    const dialect = datasource === 'hyperdrive' ? 'postgresql' : 'sqlite';
    const selectedRow =
      selectedCell && pk
        ? data.rows.find((r, i) => String(r[pk] ?? i) === selectedCell.rowKey)
        : null;
    const cellRow =
      selectedCell && selectedTable
        ? data.rows.find((r, i) => String(r[pk] ?? i) === selectedCell.rowKey)
        : null;
    const payload: DatabaseSurfaceContext = {
      route: '/dashboard/database',
      surface: 'database',
      datasource,
      dialect,
      selectedTable,
      activeMainTab,
      currentSqlBuffer: activeSql ? activeSql.slice(0, 4000) : '',
      selectedSql: activeSql ? activeSql.slice(0, 2000) : '',
      lastAttemptedSql: lastAttemptedSql ? lastAttemptedSql.slice(0, 4000) : '',
      lastError: sqlError,
      lastResultMeta: {
        rowsRead: lastRowsRead,
        durationMs: lastQueryMs,
        runState: sqlRunState,
      },
      selectedCellSummary:
        selectedCell && selectedTable
          ? {
              table: selectedTable,
              column: selectedCell.col,
              rowKey: selectedCell.rowKey,
              valuePreview: (() => {
                const v = cellRow?.[selectedCell.col];
                if (v == null) return 'NULL';
                return typeof v === 'object' ? JSON.stringify(v).slice(0, 200) : String(v).slice(0, 200);
              })(),
            }
          : null,
      selectedRowSummary: selectedRow ? { ...selectedRow } : null,
      schemaSummary: schema.length
        ? {
            columnCount: schema.length,
            primaryKeys: schema.filter(isPrimaryKey).map((c) => c.name),
            columns: schema.slice(0, 40).map((c) => ({
              name: c.name,
              type: c.type,
              pk: isPrimaryKey(c),
            })),
          }
        : null,
      dataSummary: {
        page: data.page,
        totalPages: data.total_pages,
        totalCount: data.total_count,
        rowsOnPage: data.rows.length,
      },
      activeFilters: filters.map(({ col, op, val }) => ({ col, op, val })),
      capabilities: {
        canRead: true,
        canWrite: isSuperadmin,
        isSuperadmin,
      },
      sqlRunState,
      updatedAt: Date.now(),
    };
    publishDatabaseSurfaceContext(payload);
  }, [
    activeMainTab,
    activeSql,
    data.page,
    data.rows,
    data.total_count,
    data.total_pages,
    datasource,
    filters,
    isSuperadmin,
    lastAttemptedSql,
    lastQueryMs,
    lastRowsRead,
    pk,
    schema,
    selectedCell,
    selectedTable,
    sqlError,
    sqlRunState,
  ]);

  const onPickTable = (name: string) => {
    setSelectedTable(name);
    setPage(1);
    setActiveMainTab('sql');
    setActiveSql(selectTableSql(name));
  };

  const toggleColumns = async (table: string, ev: React.MouseEvent) => {
    ev.stopPropagation();
    setExpandedTables((prev) => {
      const next = new Set(prev);
      if (next.has(table)) next.delete(table);
      else next.add(table);
      return next;
    });
    if (columnCache[table] || columnLoading[table]) return;
    setColumnLoading((c) => ({ ...c, [table]: true }));
    try {
      const base = datasource === 'd1' ? '/api/d1/table' : '/api/hyperdrive/table';
      const payload = await fetchJson<{ columns?: SchemaColumn[]; schema?: SchemaColumn[] }>(`${base}/${encodeURIComponent(table)}/schema`);
      const cols = payload.columns || payload.schema || [];
      setColumnCache((c) => ({ ...c, [table]: cols }));
    } catch {
      setColumnCache((c) => ({ ...c, [table]: [] }));
    } finally {
      setColumnLoading((c) => ({ ...c, [table]: false }));
    }
  };

  const addQueryTab = () => {
    const id = newTabId();
    const starter =
      datasource === 'd1'
        ? "-- New query\nSELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name LIMIT 20;"
        : '-- New query\nSELECT table_name FROM information_schema.tables WHERE table_schema = \'public\' ORDER BY table_name LIMIT 20;';
    setQueryTabs((t) => [...t, { id, title: 'Query', sql: starter }]);
    setActiveQueryTabId(id);
    setActiveMainTab('sql');
  };

  const commitCell = async () => {
    if (!canEditDataCell || !editingCell || !selectedTable || !pk) return;
    const row = data.rows.find((r) => String(r[pk]) === editingCell.rowKey);
    if (!row) return;
    if (editingCell.col === pk) return;
    try {
      await fetchJson(`/api/d1/table/${encodeURIComponent(selectedTable)}/row`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pk_col: pk, pk_val: row[pk], updates: { [editingCell.col]: editingCell.value } }),
      });
      setEditingCell(null);
      await loadData(selectedTable, page);
    } catch (e) {
      setDataError(e instanceof Error ? e.message : String(e));
    }
  };

  const insertRow = async () => {
    if (!canInsertRow || !selectedTable) return;
    const missing = schema.filter((c) => isNotNull(c) && !isPrimaryKey(c) && columnDefault(c) == null && !insertValues[c.name]);
    if (missing.length) {
      setDataError(`Required fields missing: ${missing.map((c) => c.name).join(', ')}`);
      return;
    }
    try {
      await fetchJson(`/api/d1/table/${encodeURIComponent(selectedTable)}/row`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columns: insertValues }),
      });
      setDrawer(null);
      setInsertValues({});
      await loadData(selectedTable, page);
    } catch (e) {
      setDataError(e instanceof Error ? e.message : String(e));
    }
  };

  const deleteSelectedRows = async () => {
    if (!canDeleteRows || !selectedTable || !pk) return;
    const pkVals = data.rows.filter((r) => selectedRows.has(String(r[pk]))).map((r) => r[pk]);
    try {
      await fetchJson(`/api/d1/table/${encodeURIComponent(selectedTable)}/rows`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pk_col: pk, pk_vals: pkVals, confirm: true }),
      });
      setDeleteRowsModal(false);
      setSelectedRows(new Set());
      await loadData(selectedTable, page);
    } catch (e) {
      setDataError(e instanceof Error ? e.message : String(e));
    }
  };

  const openCellDetail = useCallback(
    (rowKey: string, col: string) => {
      if (!selectedTable) return;
      const row = data.rows.find((r, i) => String(r[pk] ?? i) === rowKey);
      if (!row) return;
      setCellDetail({
        datasourceLabel,
        tableName: selectedTable,
        columnName: col,
        rowKey: pk ? String(row[pk]) : rowKey,
        rawValue: row[col],
      });
    },
    [data.rows, datasourceLabel, pk, selectedTable],
  );

  const exportRows = useCallback((rows: Record<string, unknown>[], filename: string) => {
    const cols = Object.keys(rows[0] || {});
    const csv = [cols.join(','), ...rows.map((row) => cols.map((col) => JSON.stringify(row[col] ?? '')).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const copyVisibleDataCsv = useCallback(() => {
    exportRows(data.rows, `${selectedTable || 'table'}-page.csv`);
  }, [data.rows, exportRows, selectedTable]);

  const copyRowJson = useCallback(
    (row: Record<string, unknown>) => {
      void copyToClipboard(JSON.stringify(row, null, 2));
    },
    [copyToClipboard],
  );

  useEffect(() => {
    if (activeMainTab !== 'data') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCellDetail(null);
        setEditingCell(null);
        return;
      }
      if (event.key === 'Enter' && selectedCell && !editingCell) {
        event.preventDefault();
        openCellDetail(selectedCell.rowKey, selectedCell.col);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeMainTab, editingCell, openCellDetail, selectedCell]);

  const onboardingEligible = capLoaded && pageReady && !isSuperadmin;
  const showD1Setup = onboardingEligible && d1Status === 'error';
  const showHyperSetup = onboardingEligible && hyperHealthBad;
  const dsNeedsSetup = datasource === 'd1' ? showD1Setup : showHyperSetup;
  const bothDisconnected = showD1Setup && showHyperSetup;
  const sidebarEmptyMuted = onboardingEligible && (datasource === 'd1' ? showD1Setup : showHyperSetup);

  const mainPlaceholder =
    !selectedTable && activeMainTab !== 'sql' ? (
      <div className="flex h-full items-center justify-center text-center">
        <div>
          <Database size={34} className="mx-auto mb-3 text-[var(--text-muted)] opacity-40" />
          <p className="text-sm font-semibold">Select a table</p>
          <p className="mt-1 text-[12px] text-[var(--text-muted)]">Pick a table in the sidebar or open the SQL tab.</p>
        </div>
      </div>
    ) : null;

  const setupContent =
    !pageReady || isSuperadmin
      ? null
      : bothDisconnected
        ? (
          <div className="flex h-full items-stretch justify-center gap-4 p-8">
            <div className="w-full max-w-md">
              <SetupCard
                title="Cloudflare D1 not configured"
                body="Connect D1 storage for this workspace to browse tables and run queries against the edge database."
                to="/dashboard/settings/storage"
              />
            </div>
            <div className="w-full max-w-md">
              <SetupCard
                title="Supabase not connected"
                body="Connect Hyperdrive / Supabase in integrations so Postgres tables appear here."
                to="/dashboard/settings/integrations"
              />
            </div>
          </div>
        )
        : dsNeedsSetup
          ? (
            <div className="flex h-full items-center justify-center p-8">
              <div className="w-full max-w-lg">
                {datasource === 'd1' ? (
                  <SetupCard
                    title="Cloudflare D1 not configured"
                    body="We could not load the D1 table list. Check storage bindings and try again."
                    to="/dashboard/settings/storage"
                  />
                ) : (
                  <SetupCard
                    title="Supabase not connected"
                    body="We could not reach Postgres via Hyperdrive. Finish Supabase setup in integrations."
                    to="/dashboard/settings/integrations"
                  />
                )}
              </div>
            </div>
          )
          : null;

  return (
    <div className="database-page relative flex h-full min-h-0 overflow-hidden">
      <aside className="flex w-[220px] shrink-0 flex-col border-r border-[var(--database-border)] bg-[var(--database-panel)]">
        <div className="border-b border-[var(--border-subtle)] p-3">
          <div className="flex rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] p-0.5">
            <button
              type="button"
              onClick={() => {
                setSidebarSource('d1');
                setSelectedTable(null);
              }}
              className={`flex-1 rounded-md px-2 py-1.5 text-[10px] font-black tracking-widest ${
                sidebarSource === 'd1' ? 'bg-[var(--color-accent,var(--solar-cyan))]/15 text-[var(--color-accent,var(--solar-cyan))]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              D1
            </button>
            <button
              type="button"
              onClick={() => {
                setSidebarSource('hyperdrive');
                setSelectedTable(null);
              }}
              className={`flex-1 rounded-md px-2 py-1.5 text-[10px] font-black tracking-widest ${
                sidebarSource === 'hyperdrive' ? 'bg-[var(--color-accent,var(--solar-cyan))]/15 text-[var(--color-accent,var(--solar-cyan))]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              Supabase
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <button
              type="button"
              title="Refresh tables"
              onClick={() => void loadTables(datasource)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-subtle)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]"
            >
              <RefreshCw size={14} className={loadingTables ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              title="New query tab"
              onClick={addQueryTab}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-subtle)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>

        <div className="border-b border-[var(--border-subtle)] p-3">
          <div className="flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] px-2 py-1.5">
            <Search size={12} className="shrink-0 text-[var(--text-muted)]" />
            <input
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              placeholder="Search tables"
              className="min-w-0 flex-1 bg-transparent font-mono text-[11px] outline-none placeholder:text-[var(--text-muted)]"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto py-1">
          {filteredTables.map((table) => {
            const open = expandedTables.has(table.name);
            const cols = columnCache[table.name];
            const loadingCols = columnLoading[table.name];
            return (
              <div key={table.name} className="border-b border-[var(--border-subtle)]/40">
                <div className="flex items-stretch">
                  <button
                    type="button"
                    title={open ? 'Collapse columns' : 'Expand columns'}
                    onClick={(e) => void toggleColumns(table.name, e)}
                    className="flex w-7 shrink-0 items-center justify-center text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                  >
                    <ChevronRight size={13} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onPickTable(table.name)}
                    className={`flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-2 text-left font-mono text-[11px] ${
                      selectedTable === table.name ? 'bg-[var(--color-accent,var(--solar-cyan))]/10 text-[var(--color-accent,var(--solar-cyan))]' : 'hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    <TableIcon size={12} className="shrink-0 opacity-70" />
                    <span className="min-w-0 truncate">{highlightSearchMatchAll(table.name, tableSearch)}</span>
                  </button>
                </div>
                {open && (
                  <div className="border-t border-[var(--border-subtle)]/30 bg-[var(--bg-app)]/50 py-1 pl-8 pr-2">
                    {loadingCols ? (
                      <div className="flex items-center gap-2 py-1 text-[10px] text-[var(--text-muted)]">
                        <Loader2 size={11} className="animate-spin" /> Loading columns…
                      </div>
                    ) : (cols || []).length ? (
                      <ul className="space-y-0.5 text-[10px] text-[var(--text-muted)]">
                        {cols!.map((c) => (
                          <li key={c.name} className="flex justify-between gap-2 font-mono">
                            <span className="min-w-0 truncate text-[var(--text-main)]">{c.name}</span>
                            <span className="shrink-0 opacity-80">{c.type || 'TEXT'}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="py-1 text-[10px] text-[var(--text-muted)]">No columns</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {!filteredTables.length && (
            <p className="p-4 text-center font-mono text-[11px] text-[var(--text-muted)]">
              {!pageReady ? 'Loading tables…' : loadingTables ? 'Loading tables…' : sidebarEmptyMuted ? '—' : 'No tables match'}
            </p>
          )}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-panel)] px-4 py-2">
          <div className="min-w-0">
            <p className="truncate font-mono text-sm font-semibold">{selectedTable || 'Database'}</p>
            <p className="text-[11px] text-[var(--text-muted)]">
              {datasource === 'd1' ? 'Cloudflare D1 (SQLite)' : 'Supabase via Hyperdrive (Postgres)'}
              {!isSuperadmin ? ' · read-only SQL' : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] p-1">
            {(['schema', 'data', 'sql', 'indexes', 'relations'] as MainTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setActiveMainTab(tab);
                  if (tab === 'data' && selectedTable) void loadData(selectedTable, page);
                }}
                className={`rounded-md px-3 py-1 text-[10px] font-black uppercase tracking-widest ${
                  activeMainTab === tab ? 'bg-[var(--color-accent,var(--solar-cyan))]/15 text-[var(--color-accent,var(--solar-cyan))]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden">
          {setupContent}

          {!setupContent && activeMainTab === 'sql' && (
            <div ref={sqlStackRef} className="flex h-full min-h-0 flex-col">
              <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-[var(--database-border)] bg-[var(--database-panel)] px-2 py-1">
                {queryTabs.map((tab) => (
                  <div
                    key={tab.id}
                    className={`flex max-w-[160px] shrink-0 items-center rounded-md border px-2 py-1 text-[11px] ${
                      tab.id === activeQueryTabId ? 'border-[var(--color-accent,var(--solar-cyan))]/40 bg-[var(--color-accent,var(--solar-cyan))]/10' : 'border-transparent hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    {renamingTabId === tab.id ? (
                      <input
                        autoFocus
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onBlur={() => {
                          const t = renameDraft.trim() || tab.title;
                          setQueryTabs((q) => q.map((x) => (x.id === tab.id ? { ...x, title: t } : x)));
                          setRenamingTabId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          if (e.key === 'Escape') setRenamingTabId(null);
                        }}
                        className="w-full min-w-0 bg-transparent font-mono text-[11px] outline-none"
                      />
                    ) : (
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate text-left font-mono"
                        onClick={() => setActiveQueryTabId(tab.id)}
                        onDoubleClick={() => {
                          setRenamingTabId(tab.id);
                          setRenameDraft(tab.title);
                        }}
                      >
                        {tab.title}
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addQueryTab}
                  className="shrink-0 rounded-md px-2 py-1 text-[10px] font-bold text-[var(--color-accent,var(--solar-cyan))] hover:bg-[var(--bg-hover)]"
                >
                  + New
                </button>
              </div>

              <div
                className="min-h-0 flex-1"
                style={{ minHeight: MIN_SQL_EDITOR_H, background: 'var(--database-monaco-bg)' }}
              >
                <MonacoSurface
                  height="100%"
                  language="sql"
                  value={activeSql}
                  onChange={(v) => {
                    const id = activeQueryTabId;
                    setQueryTabs((tabs) => tabs.map((t) => (t.id === id ? { ...t, sql: v } : t)));
                  }}
                  onMount={(ed) => {
                    sqlEditorRef.current = ed;
                  }}
                />
              </div>

              <div
                role="separator"
                aria-orientation="horizontal"
                aria-valuenow={resultsPaneHeight}
                title="Drag to resize results · double-click to reset"
                className="database-splitter hidden md:block"
                data-dragging={splitterDragging ? 'true' : undefined}
                onPointerDown={beginResultsPaneResize}
                onDoubleClick={resetResultsPaneHeight}
              />

              <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--database-border)] bg-[var(--database-panel)] px-4 py-2">
                <button
                  type="button"
                  onClick={() => void sqlEditorRef.current?.getAction('editor.action.formatDocument')?.run()}
                  className="text-[11px] font-medium text-[var(--database-text-muted)] hover:text-[var(--database-text)]"
                >
                  Format <span className="font-mono text-[10px] opacity-70">(⌥F)</span>
                </button>
                <div className="flex items-center gap-2">
                  {sqlRunState === 'success' && lastQueryMs != null && (
                    <span className="font-mono text-[10px] text-[var(--database-text-muted)]">
                      {lastQueryMs}ms · {lastRowsRead ?? 0} rows · {datasource}
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={sqlRunning}
                    onClick={() => void runSql()}
                    className="inline-flex items-center gap-2 rounded-lg bg-[var(--database-accent)] px-4 py-1.5 text-[11px] font-bold text-[var(--database-bg)] shadow-sm disabled:opacity-50"
                  >
                    {sqlRunning ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} fill="currentColor" />}
                    {sqlRunning ? 'Running…' : 'Run'}
                  </button>
                </div>
              </div>

              <div
                className="database-results-pane--mobile flex shrink-0 flex-col border-t border-[var(--database-border)] md:max-h-[75%]"
                style={{ height: resultsPaneHeight, minHeight: MIN_RESULTS_PANE_H }}
              >
                <div className="shrink-0 border-b border-[var(--database-border)] px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-[var(--database-text-muted)]">
                  {sqlRunState === 'error' ? 'Query error' : 'Results'}
                </div>
                <div className="min-h-0 flex-1 overflow-auto">
                  {sqlRunState === 'error' && sqlError ? (
                    <div className="database-sql-error-panel">
                      <p className="font-semibold">{sqlError}</p>
                      <p className="mt-2 text-[10px] opacity-90">
                        Datasource: <span className="font-mono">{datasourceLabel}</span>
                      </p>
                      {lastAttemptedSql ? (
                        <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded border border-[var(--database-border)] bg-[var(--database-bg)] p-2 text-[11px] text-[var(--database-text)]">
                          {lastAttemptedSql}
                        </pre>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void copyToClipboard(sqlError)}
                          className="inline-flex items-center gap-1 rounded border border-[var(--database-border)] px-2 py-1 text-[10px] font-bold hover:bg-[var(--database-row-hover-bg)]"
                        >
                          <ClipboardCopy size={12} /> Copy error
                        </button>
                        {lastAttemptedSql ? (
                          <button
                            type="button"
                            onClick={() => void copyToClipboard(lastAttemptedSql)}
                            className="inline-flex items-center gap-1 rounded border border-[var(--database-border)] px-2 py-1 text-[10px] font-bold hover:bg-[var(--database-row-hover-bg)]"
                          >
                            <ClipboardCopy size={12} /> Copy SQL
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : sqlResults.length ? (
                    <table className="w-full min-w-max border-collapse text-left text-[12px]">
                      <thead className="sticky top-0 bg-[var(--database-bg)]">
                        <tr className="border-b border-[var(--database-border)] text-[10px] uppercase tracking-widest text-[var(--database-text-muted)]">
                          {(sqlColumns.length ? sqlColumns : Object.keys(sqlResults[0] || {})).map((h) => (
                            <th key={h} className="whitespace-nowrap px-3 py-2 font-semibold">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sqlResults.map((row, i) => (
                          <tr key={i} className="border-b border-[var(--database-border)]/50 hover:bg-[var(--database-row-hover-bg)]">
                            {(sqlColumns.length ? sqlColumns : Object.keys(row)).map((k) => (
                              <td key={k} className="max-w-[320px] truncate px-3 py-1.5 font-mono">
                                {formatValue((row as Record<string, unknown>)[k], k)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="p-4 text-[12px] text-[var(--database-text-muted)]">
                      {sqlRunState === 'running' ? 'Running query…' : 'Run a query to see results.'}
                    </p>
                  )}
                </div>
                <div className="shrink-0 border-t border-[var(--database-border)] px-4 py-1.5 font-mono text-[10px] text-[var(--database-text-muted)]">
                  Query Time: {lastQueryMs != null ? `${lastQueryMs}ms` : '—'} | Rows: {lastRowsRead != null ? lastRowsRead : '—'} |{' '}
                  {datasource}
                </div>
              </div>
            </div>
          )}

          {!setupContent && activeMainTab !== 'sql' && !selectedTable && mainPlaceholder}

          {!setupContent && activeMainTab === 'schema' && selectedTable && (
            <div className="flex h-full flex-col overflow-hidden">
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-3">
                <div>
                  <h2 className="font-mono text-lg">{selectedTable}</h2>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {schema.length} columns · {data.total_count.toLocaleString()} rows
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={!isSuperadmin}
                    onClick={() => {
                      setActiveSql(`ALTER TABLE ${selectedTableSqlName}\nADD COLUMN new_column TEXT;`);
                      setActiveMainTab('sql');
                    }}
                    className="rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-[11px] font-bold hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Add Column
                  </button>
                  <button
                    type="button"
                    disabled={!isSuperadmin}
                    onClick={() => {
                      setActiveSql(`ALTER TABLE ${selectedTableSqlName}\nRENAME TO ${quoteIdent(`${selectedTable}_new`)};`);
                      setActiveMainTab('sql');
                    }}
                    className="rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-[11px] font-bold hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Edit Table
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full min-w-[760px] border-collapse text-left text-[12px]">
                  <thead className="sticky top-0 bg-[var(--bg-app)]">
                    <tr className="border-b border-[var(--border-subtle)] text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
                      {['#', 'Column name', 'Type', 'Nullable', 'Default', 'Constraints'].map((h) => (
                        <th key={h} className="px-4 py-2">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {schema.map((col, index) => (
                      <tr key={col.name} className="border-b border-[var(--border-subtle)]/50 hover:bg-[var(--bg-hover)]">
                        <td className="px-4 py-2 font-mono text-[var(--text-muted)]">{index + 1}</td>
                        <td className="px-4 py-2 font-mono font-semibold">
                          {isPrimaryKey(col) && <Key size={12} className="mr-1 inline text-[var(--solar-yellow)]" />}
                          {relations.some((r) => (r.from || r.source_column) === col.name) && <Link2 size={12} className="mr-1 inline text-[var(--color-accent,var(--solar-cyan))]" />}
                          {col.name}
                        </td>
                        <td className="px-4 py-2 font-mono text-[var(--color-accent,var(--solar-cyan))]">{col.type || 'TEXT'}</td>
                        <td className="px-4 py-2">
                          {isNotNull(col) ? (
                            <span className="rounded bg-[var(--solar-red)]/10 px-2 py-0.5 text-[10px] font-black text-[var(--solar-red)]">NOT NULL</span>
                          ) : (
                            <span className="text-[var(--text-muted)]">nullable</span>
                          )}
                        </td>
                        <td className="px-4 py-2 font-mono text-[var(--text-muted)]">{columnDefault(col) ?? '-'}</td>
                        <td className="px-4 py-2">
                          {isPrimaryKey(col) && <span className="rounded border border-[var(--solar-yellow)]/30 px-2 py-0.5 text-[10px] text-[var(--solar-yellow)]">primary key</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!setupContent && activeMainTab === 'data' && selectedTable && (
            <div className="relative flex h-full flex-col overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-app)] px-4 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!canInsertRow}
                    title={!canInsertRow ? insertDisabledReason : 'Insert a new row'}
                    onClick={() => canInsertRow && setDrawer('insert')}
                    className="flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-[11px] font-bold text-[var(--color-accent,var(--solar-cyan))] hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Plus size={12} /> Insert Row
                  </button>
                  <button
                    type="button"
                    disabled={!canDeleteRows}
                    title={!canDeleteRows ? deleteDisabledReason : `Delete ${selectedRows.size} selected row(s)`}
                    onClick={() => canDeleteRows && setDeleteRowsModal(true)}
                    className="flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-[11px] font-bold text-[var(--solar-red)] hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Trash2 size={12} /> Delete Row
                  </button>
                  <button
                    type="button"
                    onClick={() => selectedTable && loadData(selectedTable, page)}
                    className="rounded-lg border border-[var(--border-subtle)] p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                  >
                    <RefreshCw size={13} className={loadingMain ? 'animate-spin' : ''} />
                  </button>
                  <button
                    type="button"
                    onClick={() => copyVisibleDataCsv()}
                    className="flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-[11px] font-bold hover:bg-[var(--bg-hover)]"
                  >
                    <Download size={12} /> Copy CSV
                  </button>
                  {editDisabledReason && activeMainTab === 'data' && (
                    <span className="text-[10px] text-[var(--text-muted)]" title={editDisabledReason}>
                      {datasource === 'hyperdrive' ? 'Edit: Hyperdrive disabled (v1)' : !pk ? 'Edit: no PK' : ''}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Filter size={12} className="text-[var(--text-muted)]" />
                  <select
                    value={filters[0]?.col || ''}
                    onChange={(e) =>
                      setFilters(e.target.value ? [{ id: 'f1', col: e.target.value, op: 'contains', val: '' }] : [])
                    }
                    className="rounded border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-2 py-1 text-[11px]"
                  >
                    <option value="">Filter</option>
                    {schema.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {filters[0] && (
                    <select
                      value={filters[0].op}
                      onChange={(e) =>
                        setFilters([{ ...filters[0], op: e.target.value as DatabaseFilterUiOp }])
                      }
                      className="rounded border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-2 py-1 text-[11px]"
                    >
                      {FILTER_OPS.map((op) => (
                        <option key={op} value={op}>
                          {DATABASE_FILTER_UI_LABELS[op]}
                        </option>
                      ))}
                    </select>
                  )}
                  {filters[0] && !['is_null', 'is_not_null'].includes(filters[0].op) && (
                    <input
                      value={filters[0].val}
                      onChange={(e) => setFilters([{ ...filters[0], val: e.target.value }])}
                      onKeyDown={(e) => e.key === 'Enter' && selectedTable && loadData(selectedTable, 1)}
                      className="w-28 rounded border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-2 py-1 text-[11px]"
                    />
                  )}
                </div>
              </div>
              {dataError && <div className="border-b border-[var(--solar-red)]/20 bg-[var(--solar-red)]/10 px-4 py-2 text-[12px] text-[var(--solar-red)]">{dataError}</div>}
              <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full min-w-max border-collapse text-left text-[12px]">
                  <thead className="sticky top-0 bg-[var(--bg-app)]">
                    <tr className="border-b border-[var(--border-subtle)] text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
                      <th className="px-3 py-2">
                        <input
                          type="checkbox"
                          disabled={!isSuperadmin}
                          checked={data.rows.length > 0 && selectedRows.size === data.rows.length}
                          onChange={(e) =>
                            setSelectedRows(e.target.checked ? new Set(data.rows.map((r, i) => String(r[pk] ?? i))) : new Set())
                          }
                        />
                      </th>
                      {columns.map((col) => (
                        <th
                          key={col}
                          className="cursor-pointer px-3 py-2"
                          onClick={() => {
                            setSortCol(col);
                            setSortDir(sortCol === col && sortDir === 'asc' ? 'desc' : 'asc');
                            selectedTable && loadData(selectedTable, 1);
                          }}
                        >
                          {col}
                          {sortCol === col ? ` ${sortDir}` : ''}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row, i) => {
                      const key = String(row[pk] ?? i);
                      return (
                        <tr key={key} className="group border-b border-[var(--border-subtle)]/50 hover:bg-[var(--bg-hover)]">
                          <td className="px-3 py-1.5">
                            <input
                              type="checkbox"
                              disabled={!isSuperadmin}
                              checked={selectedRows.has(key)}
                              onChange={(e) =>
                                setSelectedRows((prev) => {
                                  const next = new Set(prev);
                                  e.target.checked ? next.add(key) : next.delete(key);
                                  return next;
                                })
                              }
                            />
                          </td>
                          {columns.map((col) => {
                            const isSelected = selectedCell?.rowKey === key && selectedCell.col === col;
                            const isPkCol = col === pk;
                            const canEditThis =
                              canEditDataCell && !isPkCol && editingCell?.rowKey === key && editingCell.col === col;
                            return (
                              <td
                                key={col}
                                className={`max-w-[300px] truncate border-r border-[var(--border-subtle)]/40 px-3 py-1.5 font-mono ${
                                  isSelected ? 'database-data-cell--selected' : ''
                                }`}
                                title={
                                  canEditDataCell && !isPkCol
                                    ? 'Click to select · double-click to edit · Enter for detail'
                                    : editDisabledReason || 'Click to select · double-click for detail'
                                }
                                onClick={() => setSelectedCell({ rowKey: key, col })}
                                onDoubleClick={() => {
                                  if (canEditDataCell && !isPkCol) {
                                    setEditingCell({ rowKey: key, col, value: row[col] == null ? '' : String(row[col]) });
                                    return;
                                  }
                                  openCellDetail(key, col);
                                }}
                              >
                                {canEditThis ? (
                                  <input
                                    autoFocus
                                    value={editingCell.value}
                                    onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') void commitCell();
                                      if (e.key === 'Escape') setEditingCell(null);
                                    }}
                                    onBlur={() => void commitCell()}
                                    className="w-full rounded border border-[var(--color-accent,var(--solar-cyan))] bg-[var(--bg-panel)] px-2 py-1 outline-none"
                                  />
                                ) : (
                                  <div className="flex items-center gap-1">
                                    <span className="min-w-0 flex-1 truncate">{formatValue(row[col], col)}</span>
                                    <button
                                      type="button"
                                      title="Copy cell"
                                      className="shrink-0 rounded p-0.5 opacity-0 hover:bg-[var(--bg-hover)] group-hover:opacity-100 [.database-data-cell--selected+&]:opacity-100"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const v = row[col];
                                        void copyToClipboard(v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
                                      }}
                                    >
                                      <ClipboardCopy size={10} />
                                    </button>
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-[var(--border-subtle)] px-4 py-2 text-[11px] text-[var(--text-muted)]">
                <span>
                  {data.total_count.toLocaleString()} rows · page {data.page} of {data.total_pages}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => {
                      const next = Math.max(1, page - 1);
                      setPage(next);
                      selectedTable && loadData(selectedTable, next);
                    }}
                    className="rounded border border-[var(--border-subtle)] px-2 py-1 disabled:opacity-40"
                  >
                    <ChevronLeft size={12} />
                  </button>
                  <input
                    value={page}
                    onChange={(e) => setPage(Math.max(1, Number(e.target.value) || 1))}
                    onKeyDown={(e) => e.key === 'Enter' && selectedTable && loadData(selectedTable, page)}
                    className="w-14 rounded border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-2 py-1 text-center font-mono"
                  />
                  <button
                    type="button"
                    disabled={page >= data.total_pages}
                    onClick={() => {
                      const next = Math.min(data.total_pages, page + 1);
                      setPage(next);
                      selectedTable && loadData(selectedTable, next);
                    }}
                    className="rounded border border-[var(--border-subtle)] px-2 py-1 disabled:opacity-40"
                  >
                    <ChevronRight size={12} />
                  </button>
                </div>
              </div>
              <DatabaseCellDetailDrawer payload={cellDetail} onClose={() => setCellDetail(null)} onCopy={(t) => void copyToClipboard(t)} />
            </div>
          )}

          {!setupContent && activeMainTab === 'indexes' && selectedTable && (
            <div className="h-full overflow-auto p-5">
              <button
                type="button"
                disabled={!isSuperadmin}
                onClick={() => {
                  setActiveSql(`CREATE INDEX idx_${selectedTable}_column\nON ${selectedTableSqlName} (column_name);`);
                  setActiveMainTab('sql');
                }}
                className="mb-4 rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-[11px] font-bold text-[var(--color-accent,var(--solar-cyan))] hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus size={12} className="mr-1 inline" /> Add Index
              </button>
              {indexes.map((idx) => (
                <div key={idx.name} className="mb-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-3">
                  <div className="font-mono text-sm">{idx.name}</div>
                  <pre className="mt-2 whitespace-pre-wrap text-[11px] text-[var(--text-muted)]">{idx.sql || 'auto index'}</pre>
                </div>
              ))}
            </div>
          )}

          {!setupContent && activeMainTab === 'relations' && selectedTable && (
            <div className="h-full overflow-auto p-5">
              {relations.length ? (
                relations.map((rel, i) => (
                  <div
                    key={`${rel.from}-${rel.to}-${i}`}
                    className="mb-3 flex items-center gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-3 font-mono text-[12px]"
                  >
                    <Link2 size={14} className="text-[var(--color-accent,var(--solar-cyan))]" />
                    <span>{rel.source_column || rel.from}</span>
                    <span className="text-[var(--text-muted)]">to</span>
                    <span>
                      {rel.target_table || rel.table}.{rel.target_column || rel.to}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-[12px] text-[var(--text-muted)]">No foreign keys found for this table.</p>
              )}
            </div>
          )}
        </div>
      </main>

      <DatabaseSqlConfirmModal
        payload={sqlConfirmModal}
        onCancel={() => setSqlConfirmModal(null)}
        onConfirm={() => confirmSqlModalRun()}
      />

      {deleteRowsModal && selectedTable && (
        <div className="database-modal-overlay" role="dialog" aria-modal="true">
          <div className="database-modal-panel">
            <div className="border-b border-[var(--database-border)] px-4 py-3">
              <h2 className="text-sm font-semibold text-[var(--database-text)]">Delete rows</h2>
              <p className="mt-1 text-[11px] text-[var(--database-text-muted)]">
                Delete {selectedRows.size} row(s) from <span className="font-mono">{selectedTable}</span>? This cannot be undone.
              </p>
            </div>
            <div className="flex justify-end gap-2 px-4 py-3">
              <button type="button" onClick={() => setDeleteRowsModal(false)} className="rounded-lg border border-[var(--database-border)] px-3 py-2 text-[11px] font-bold">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void deleteSelectedRows()}
                className="rounded-lg border border-[var(--database-error-text)]/40 bg-[var(--database-error-bg)] px-3 py-2 text-[11px] font-bold text-[var(--database-error-text)]"
              >
                Delete {selectedRows.size} row(s)
              </button>
            </div>
          </div>
        </div>
      )}

      {drawer === 'insert' && (
        <Drawer title="Insert Row" subtitle={selectedTable || undefined} onClose={() => setDrawer(null)}>
          <div className="space-y-3">
            {schema.map((col) => (
              <label key={col.name} className="block">
                <span className="mb-1 flex items-center gap-2 text-[11px] font-bold">
                  {col.name}
                  <span className="font-mono text-[10px] text-[var(--text-muted)]">{col.type || 'TEXT'}</span>
                  {isNotNull(col) && !isPrimaryKey(col) && <span className="text-[var(--solar-red)]">*</span>}
                </span>
                <input
                  value={insertValues[col.name] ?? ''}
                  onChange={(e) => setInsertValues((prev) => ({ ...prev, [col.name]: e.target.value }))}
                  placeholder={columnDefault(col) ? `default: ${columnDefault(col)}` : ''}
                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] px-3 py-2 font-mono text-[12px] outline-none focus:border-[var(--color-accent,var(--solar-cyan))]"
                />
              </label>
            ))}
            <div>
              <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Generated SQL</p>
              <pre className="max-h-36 overflow-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] p-3 font-mono text-[11px] text-[var(--color-accent,var(--solar-cyan))]">{insertSql}</pre>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setDrawer(null)} className="rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-[11px] font-bold hover:bg-[var(--bg-hover)]">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void insertRow()}
                className="rounded-lg border border-[var(--color-accent,var(--solar-cyan))]/30 bg-[var(--color-accent,var(--solar-cyan))]/15 px-3 py-2 text-[11px] font-bold text-[var(--color-accent,var(--solar-cyan))]"
              >
                Insert Row
              </button>
            </div>
          </div>
        </Drawer>
      )}

      {loadingMain && (
        <div className="pointer-events-none absolute left-[220px] top-0 flex items-center gap-2 rounded-br-lg border-b border-r border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2 text-[11px] text-[var(--text-muted)]">
          <Loader2 size={12} className="animate-spin" /> Loading
        </div>
      )}
      {dataError && !drawer && (
        <div className="absolute bottom-3 left-1/2 flex max-w-xl -translate-x-1/2 items-center gap-2 rounded-lg border border-[var(--solar-red)]/30 bg-[var(--bg-panel)] px-3 py-2 text-[12px] text-[var(--solar-red)]">
          <AlertTriangle size={13} /> {dataError}
          <button type="button" onClick={() => setDataError(null)}>
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
};

export default DatabasePage;
