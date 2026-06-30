/**
 * DatabaseStudio — lazy-mounted SQL explorer for /dashboard/database (Studio mode).
 *
 * D1 Studio–style explorer: searchable table sidebar, single SQL editor, results grid.
 * Schema / indexes / relations open from per-table context menu (not top-level tabs).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  Download,
  Filter,
  Key,
  Link2,
  Loader2,
  MoreHorizontal,
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
import { DatabaseResultsGrid } from './database/DatabaseResultsGrid';
import { rowKeyForRow, type SelectedGridCell } from './database/databaseGridTypes';
import { useWorkspace } from '../src/context/WorkspaceContext';
import { isPlatformWorkspace } from '../src/lib/databaseStudioRoute';
import '../components/database/database-page.css';

type Datasource = 'd1' | 'hyperdrive';
type StudioSection = 'platform_d1' | 'platform_hyperdrive' | 'public_learning' | 'customer_supabase' | 'workspace_d1';
type MetaPanel = 'schema' | 'indexes' | 'relations';
type SortDir = 'asc' | 'desc';
type LoadStatus = 'idle' | 'loading' | 'ok' | 'error';
type SqlRunState = 'idle' | 'running' | 'success' | 'error';

const LS_DATASOURCE = 'iam.database.datasource';
const LS_TABLE = 'iam.database.selectedTable';
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


const PAGE_SIZE = 50;
const FILTER_OPS: DatabaseFilterUiOp[] = DATABASE_FILTER_UI_OPS;

function quoteIdent(name: string) {
  return `"${name.replace(/"/g, '""')}"`;
}

function qualifiedTableRef(table: TableMeta, datasource: Datasource): string {
  if (datasource === 'd1') return quoteIdent(table.name);
  const schema = table.table_schema?.trim() || 'agentsam';
  return `${schema}.${quoteIdent(table.name)}`;
}

function tableDisplayLabel(table: TableMeta, datasource: Datasource): string {
  if (datasource === 'd1' || !table.table_schema || table.table_schema === 'agentsam') {
    return table.name;
  }
  return `${table.table_schema}.${table.name}`;
}

function tableApiPath(table: TableMeta | { name: string; table_schema?: string }, datasource: Datasource, suffix: string) {
  const base = datasource === 'd1' ? '/api/d1/table' : '/api/hyperdrive/table';
  const schema = table.table_schema?.trim() || 'agentsam';
  const q = datasource === 'hyperdrive' ? `?schema=${encodeURIComponent(schema)}` : '';
  return `${base}/${encodeURIComponent(table.name)}/${suffix}${q}`;
}

function readStoredDatasource(): Datasource {
  try {
    const v = localStorage.getItem(LS_DATASOURCE);
    if (v === 'd1' || v === 'hyperdrive') return v;
  } catch {
    /* ignore */
  }
  return 'hyperdrive';
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
          {subtitle && <p className="mt-0.5 truncate font-mono text-[11px] text-muted">{subtitle}</p>}
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-[var(--bg-hover)] hover:text-main">
          <X size={15} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
    </aside>
  );
}

function SetupCard({ title, body, to }: { title: string; body: string; to: string }) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-6 shadow-sm">
      <h3 className="text-sm font-semibold text-main">{title}</h3>
      <p className="mt-2 text-[12px] leading-relaxed text-muted">{body}</p>
      <Link
        to={to}
        className="mt-4 inline-flex rounded-lg bg-[var(--color-accent,var(--solar-cyan))]/15 px-3 py-2 text-[11px] font-bold text-[var(--color-accent,var(--solar-cyan))] hover:bg-[var(--color-accent,var(--solar-cyan))]/25"
      >
        Open settings
      </Link>
    </div>
  );
}

export type DatabaseStudioProps = {
  databaseName?: string;
  onBackToOverview?: () => void;
};

export const DatabaseStudio: React.FC<DatabaseStudioProps> = ({ databaseName, onBackToOverview }) => {
  const { workspaceId, workspaces } = useWorkspace();
  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.id === workspaceId) ?? null,
    [workspaces, workspaceId],
  );
  const navigate = useNavigate();
  const [sidebarSource, setSidebarSource] = useState<Datasource>(readStoredDatasource);
  const datasource: Datasource = sidebarSource;
  const [tables, setTables] = useState<Record<Datasource, TableMeta[]>>({ d1: [], hyperdrive: [] });
  const [d1Status, setD1Status] = useState<LoadStatus>('idle');
  const [d1OnboardingRequired, setD1OnboardingRequired] = useState(false);
  const [d1LoadError, setD1LoadError] = useState<string | null>(null);
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
  const [metaPanel, setMetaPanel] = useState<MetaPanel | null>(null);
  const [tableMenu, setTableMenu] = useState<{ table: string; x: number; y: number } | null>(null);
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
  const [selectedCell, setSelectedCell] = useState<SelectedGridCell | null>(null);
  const [cellDetail, setCellDetail] = useState<CellDetailPayload | null>(null);

  const [sql, setSql] = useState('');
  const [browseMeta, setBrowseMeta] = useState<{ page: number; total_pages: number; total_count: number }>({
    page: 1,
    total_pages: 1,
    total_count: 0,
  });

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
  const [studioSection, setStudioSection] = useState<StudioSection>(() =>
    databaseName?.trim() ? 'workspace_d1' : 'public_learning',
  );
  const [learningTables, setLearningTables] = useState<TableMeta[]>([]);
  const [learningStatus, setLearningStatus] = useState<LoadStatus>('idle');
  const [supabaseConnected, setSupabaseConnected] = useState(false);
  const [capLoaded, setCapLoaded] = useState(false);
  const [pageReady, setPageReady] = useState(false);
  const [hyperHealthBad, setHyperHealthBad] = useState(false);
  const [workspaceD1Available, setWorkspaceD1Available] = useState(false);

  const d1FetchInit = useCallback(
    (init?: RequestInit): RequestInit => {
      const headers: Record<string, string> = {
        ...((init?.headers as Record<string, string> | undefined) || {}),
      };
      const ws = workspaceId?.trim();
      if (ws) headers['X-IAM-Workspace-Id'] = ws;
      const dbName = databaseName?.trim();
      if (dbName) headers['X-IAM-Database-Name'] = dbName;
      if (!ws && !dbName) return init || {};
      return { ...init, headers };
    },
    [workspaceId, databaseName],
  );

  const fetchD1Json = useCallback(
    async <T,>(url: string, init?: RequestInit): Promise<T> => {
      return fetchJson<T>(url, d1FetchInit(init));
    },
    [d1FetchInit],
  );
  const sqlEditorRef = useRef<import('monaco-editor').editor.IStandaloneCodeEditor | null>(null);
  const sqlStackRef = useRef<HTMLDivElement | null>(null);
  const resultsPaneHeightRef = useRef(resultsPaneHeight);
  resultsPaneHeightRef.current = resultsPaneHeight;
  const sqlRef = useRef(sql);
  sqlRef.current = sql;
  const runSqlRef = useRef<(statement: string) => Promise<void>>(async () => {});

  const sqlRunning = sqlRunState === 'running';

  const effectiveDatasource: Datasource =
    databaseName?.trim() || (!isSuperadmin && studioSection === 'workspace_d1') ? 'd1' : datasource;

  const activeTables =
    !isSuperadmin && studioSection === 'public_learning'
      ? learningTables
      : !isSuperadmin && studioSection === 'workspace_d1'
        ? tables.d1
        : tables[datasource];
  const datasourceLabel =
    databaseName?.trim()
      ? `${databaseName.trim()} · Cloudflare D1`
      : !isSuperadmin && studioSection === 'public_learning'
      ? 'Public learning (public.iam_*)'
      : !isSuperadmin && studioSection === 'workspace_d1'
        ? 'Workspace D1 (Cloudflare SQLite)'
        : !isSuperadmin && studioSection === 'customer_supabase'
          ? 'My Supabase project'
          : datasource === 'd1'
            ? 'Cloudflare D1 (SQLite)'
            : 'Supabase via Hyperdrive (Postgres)';
  const selectedTableMeta = useMemo(
    () => (selectedTable ? activeTables.find((t) => t.name === selectedTable) : undefined),
    [activeTables, selectedTable],
  );
  const selectedTableSqlName = selectedTableMeta
    ? qualifiedTableRef(selectedTableMeta, effectiveDatasource)
    : selectedTable
      ? qualifiedTableRef({ name: selectedTable, table_schema: 'agentsam' }, effectiveDatasource)
      : '';
  const pk = useMemo(() => schema.find(isPrimaryKey)?.name || '', [schema]);
  const canWriteRows = isSuperadmin && capLoaded;
  const canEditDataCell = canWriteRows && effectiveDatasource === 'd1' && Boolean(pk) && Boolean(selectedTable);
  const canInsertRow = canWriteRows && Boolean(selectedTable) && effectiveDatasource === 'd1';
  const canDeleteRows =
    canWriteRows && effectiveDatasource === 'd1' && Boolean(selectedTable) && Boolean(pk) && selectedRows.size > 0;
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
            ? 'Select a table first.'
            : '';
  const filteredTables = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    if (!q) return activeTables;
    return activeTables.filter((t) => {
      const label = tableDisplayLabel(t, datasource).toLowerCase();
      return label.includes(q) || t.name.toLowerCase().includes(q);
    });
  }, [activeTables, datasource, tableSearch]);
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

  const loadCapabilities = useCallback(async (): Promise<boolean> => {
    try {
      const payload = await fetchJson<{ capabilities?: { is_superadmin?: boolean } }>('/api/integrations/summary');
      const superadmin = payload.capabilities?.is_superadmin === true;
      setIsSuperadmin(superadmin);
      if (!superadmin && !databaseName?.trim()) {
        setStudioSection('public_learning');
      }
      return superadmin;
    } catch {
      setIsSuperadmin(false);
      if (!databaseName?.trim()) setStudioSection('public_learning');
      return false;
    } finally {
      setCapLoaded(true);
    }
  }, [databaseName]);

  const loadDataPlaneContext = useCallback(async (superadmin: boolean) => {
    try {
      const ctx = await fetchJson<{
        banner?: string;
        active_data_plane?: string;
        connections?: { supabase?: boolean };
      }>('/api/data-plane/context');
      setSupabaseConnected(ctx.connections?.supabase === true);
      if (!superadmin && !databaseName?.trim() && ctx.active_data_plane === 'customer_supabase' && ctx.connections?.supabase) {
        setStudioSection('customer_supabase');
      }
    } catch {
      /* ignore */
    }
  }, [databaseName]);

  const loadPublicLearningTables = useCallback(async () => {
    setLearningStatus('loading');
    try {
      const payload = await fetchJson<{ tables?: Array<{ name: string; table_schema?: string }> }>(
        '/api/data-plane/public-learning/tables',
      );
      const list = (payload.tables || []).map((t) => ({
        name: String(t.name || ''),
        table_schema: t.table_schema || 'public',
      }));
      setLearningTables(list.filter((t) => t.name));
      setLearningStatus('ok');
    } catch {
      setLearningTables([]);
      setLearningStatus('error');
    }
  }, []);

  const loadTables = useCallback(async (target: Datasource) => {
    if (target === 'd1') {
      setD1Status('loading');
      setD1LoadError(null);
    } else setHyperStatus('loading');
    setLoadingTables(true);
    const endpoint = target === 'd1' ? '/api/d1/tables' : '/api/hyperdrive/tables';

    const loadOnce = async () => {
      const fetchInit =
        target === 'd1' ? d1FetchInit({ credentials: 'same-origin' }) : { credentials: 'same-origin' as const };
      const res = await fetch(endpoint, fetchInit);
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
      if (target === 'd1') {
        const onboarding = (payload as { onboarding_required?: boolean }).onboarding_required === true;
        setD1OnboardingRequired(onboarding);
        if (onboarding) {
          const msg =
            (payload as { message?: string }).message ||
            'Connect your Cloudflare D1 to use Database Studio';
          setD1LoadError(msg);
        }
        if (!isSuperadmin) {
          setWorkspaceD1Available(!onboarding && normalizeTables(payload).length > 0);
        }
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
    } catch (e) {
      setTables((prev) => ({ ...prev, [target]: [] }));
      if (target === 'd1') {
        setD1Status('error');
        setD1LoadError(e instanceof Error ? e.message : String(e));
        if (!isSuperadmin) setWorkspaceD1Available(false);
      } else setHyperStatus('error');
    } finally {
      setLoadingTables(false);
    }
  }, [d1FetchInit, isSuperadmin, databaseName]);

  useEffect(() => {
    if (databaseName?.trim()) {
      setStudioSection('workspace_d1');
      setSidebarSource('d1');
    }
  }, [databaseName]);

  useEffect(() => {
    if (databaseName?.trim() || !workspaceId?.trim() || !pageReady) return;
    if (isPlatformWorkspace(activeWorkspace)) return;
    let cancelled = false;
    (async () => {
      try {
        const ctx = await fetchD1Json<{
          databases?: Array<{ database_name: string; workspace_id: string }>;
          active_database_name?: string | null;
        }>('/api/d1/context');
        if (cancelled) return;
        const match = ctx.databases?.find((d) => d.workspace_id === workspaceId);
        const name = match?.database_name || ctx.active_database_name || '';
        if (name.trim()) {
          navigate(`/dashboard/database/${encodeURIComponent(name.trim())}`, { replace: true });
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [databaseName, workspaceId, pageReady, fetchD1Json, navigate, activeWorkspace]);

  const loadSchema = useCallback(
    async (table: string) => {
      setLoadingMain(true);
      try {
        const meta = activeTables.find((t) => t.name === table) ?? { name: table, table_schema: 'agentsam' };
        const path = tableApiPath(meta, effectiveDatasource, 'schema');
        const payload = effectiveDatasource === 'd1'
          ? await fetchD1Json<{ columns?: SchemaColumn[]; schema?: SchemaColumn[]; indexes?: IndexMeta[]; foreign_keys?: RelationMeta[] }>(path)
          : await fetchJson<{ columns?: SchemaColumn[]; schema?: SchemaColumn[]; indexes?: IndexMeta[]; foreign_keys?: RelationMeta[] }>(path);
        setSchema(payload.columns || payload.schema || []);
        setIndexes(payload.indexes || []);
        setRelations(payload.foreign_keys || []);
      } finally {
        setLoadingMain(false);
      }
    },
    [activeTables, effectiveDatasource, fetchD1Json],
  );

  useEffect(() => {
    let cancelled = false;
    const initialDs = databaseName?.trim() ? 'd1' : readStoredDatasource();
    (async () => {
      const [, superadmin] = await Promise.all([loadThemeAccent(), loadCapabilities()]);
      if (cancelled) return;
      setPageReady(true);
      void loadDataPlaneContext(superadmin);
      if (databaseName?.trim()) {
        void loadTables('d1');
        return;
      }
      if (superadmin) {
        void loadTables(initialDs);
        if (initialDs === 'd1') {
          void loadTables('hyperdrive');
        }
      } else {
        void loadPublicLearningTables();
        if (workspaceId?.trim()) void loadTables('d1');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [databaseName, loadCapabilities, loadDataPlaneContext, loadPublicLearningTables, loadTables, loadThemeAccent, workspaceId]);

  useEffect(() => {
    if (!pageReady) return;
    if (databaseName?.trim()) {
      void loadTables('d1');
      return;
    }
    if (isSuperadmin && sidebarSource === 'd1') {
      void loadTables('d1');
      return;
    }
    if (!isSuperadmin && workspaceId?.trim()) {
      void loadTables('d1');
    }
  }, [pageReady, workspaceId, databaseName, isSuperadmin, sidebarSource, loadTables]);

  useEffect(() => {
    if (!capLoaded || isSuperadmin || databaseName?.trim() || !workspaceD1Available) return;
    setStudioSection((prev) => (prev === 'public_learning' ? 'workspace_d1' : prev));
    setSidebarSource('d1');
  }, [capLoaded, isSuperadmin, workspaceD1Available, databaseName]);

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

  const syncDataResponseToGrid = useCallback((payload: DataResponse) => {
    setSqlResults(payload.rows);
    const cols = payload.columns?.length ? payload.columns : Object.keys(payload.rows[0] || {});
    setSqlColumns(cols);
    setBrowseMeta({
      page: payload.page,
      total_pages: payload.total_pages,
      total_count: payload.total_count,
    });
    setSqlRunState('success');
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
        const endpoint =
          !isSuperadmin && studioSection === 'public_learning'
            ? '/api/data-plane/public-learning/query'
            : !isSuperadmin && studioSection === 'customer_supabase'
              ? '/api/data-plane/customer-supabase/query'
              : effectiveDatasource === 'd1'
                ? '/api/d1/query'
                : '/api/hyperdrive/query';
        const fetchQuery = effectiveDatasource === 'd1' ? fetchD1Json : fetchJson;
        const payload = await fetchQuery<{ rows?: Record<string, unknown>[]; results?: Record<string, unknown>[]; error?: string }>(endpoint, {
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
    [effectiveDatasource, fetchD1Json, isSuperadmin, studioSection],
  );

  const requestRunSql = useCallback(
    (statement?: string) => {
      const raw = (statement ?? sqlRef.current).trim();
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
    [datasourceLabel, executeSqlInternal, isSuperadmin, studioSection],
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
      if (!(event.metaKey || event.ctrlKey) || event.key !== 'Enter') return;
      if (event.shiftKey) return;
      event.preventDefault();
      void runSql();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [runSql]);

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
      if (!event.altKey || event.metaKey || event.ctrlKey) return;
      if (event.key.toLowerCase() !== 'f') return;
      event.preventDefault();
      void sqlEditorRef.current?.getAction('editor.action.formatDocument')?.run();
    };
    window.addEventListener('keydown', onFmt);
    return () => window.removeEventListener('keydown', onFmt);
  }, []);

  const selectTableSql = useCallback(
    (table: TableMeta | string, pageNum = 1) => {
      const offset = (Math.max(1, pageNum) - 1) * PAGE_SIZE;
      const meta =
        typeof table === 'string'
          ? activeTables.find((t) => t.name === table) ?? { name: table, table_schema: 'agentsam' }
          : table;
      return `SELECT * FROM ${qualifiedTableRef(meta, datasource)} LIMIT ${PAGE_SIZE} OFFSET ${offset};`;
    },
    [activeTables, datasource],
  );

  const tableBrowseTotalPages = useMemo(() => {
    if (filters.length && browseMeta.total_pages) return browseMeta.total_pages;
    const count = selectedTableMeta?.row_count;
    if (count != null && Number.isFinite(count)) return Math.max(1, Math.ceil(count / PAGE_SIZE));
    if (sqlResults.length < PAGE_SIZE) return Math.max(1, page);
    return Math.max(browseMeta.total_pages, page + 1);
  }, [browseMeta.total_pages, filters.length, page, selectedTableMeta?.row_count, sqlResults.length]);

  useEffect(() => {
    const sqlForTable = (name: string, ds: Datasource) => {
      const meta = tables[ds].find((t) => t.name === name) ?? { name, table_schema: 'agentsam' };
      return `SELECT * FROM ${qualifiedTableRef(meta, ds)} LIMIT 50;`;
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

      const mode = e.detail?.mode ?? 'replace';
      const shouldRun = e.detail?.run === true || e.detail?.autorun === true;

      if (mode === 'append') {
        setSql((prev) => (prev.trim() ? `${prev.trim()}\n\n${text}` : text));
      } else {
        setSql(text);
      }

      if (shouldRun) {
        queueMicrotask(() => runSqlRef.current(text));
      }
    };

    const onOpenTable = (ev: Event) => {
      const e = ev as CustomEvent<{ datasource?: DatabaseDatasource; table?: string; tab?: MetaPanel | 'data' | 'sql' }>;
      const name = String(e.detail?.table ?? '').trim();
      if (!name) return;
      const ds: Datasource = e.detail?.datasource === 'hyperdrive' ? 'hyperdrive' : 'd1';
      setSidebarSource(ds);
      setPage(1);
      const tab = e.detail?.tab;
      if (tab === 'schema' || tab === 'indexes' || tab === 'relations') {
        setSelectedTable(name);
        setMetaPanel(tab);
        void loadSchema(name);
        return;
      }
      const sqlText = sqlForTable(name, ds);
      setSelectedTable(name);
      setSql(sqlText);
      setMetaPanel(null);
      queueMicrotask(() => runSqlRef.current(sqlText));
    };

    const onQueryAnalysis = (ev: Event) => {
      const e = ev as CustomEvent<{ sql?: string; error?: string; datasource?: DatabaseDatasource }>;
      if (e.detail?.datasource === 'd1' || e.detail?.datasource === 'hyperdrive') {
        setSidebarSource(e.detail.datasource);
      }
      const sqlText = String(e.detail?.sql ?? lastAttemptedSql ?? '').trim();
      const errText = e.detail?.error != null ? String(e.detail.error) : '';
      if (sqlText) {
        setSql(errText ? `${sqlText}\n\n-- Last error:\n-- ${errText.replace(/\n/g, '\n-- ')}` : sqlText);
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
  }, [isSuperadmin, lastAttemptedSql, loadSchema]);

  useEffect(() => {
    const dialect = datasource === 'hyperdrive' ? 'postgresql' : 'sqlite';
    const gridRows = sqlResults.length ? sqlResults : data.rows;
    const selectedRow =
      selectedCell && pk
        ? gridRows.find((r, i) => rowKeyForRow(r, pk, i) === selectedCell.rowKey)
        : selectedCell?.row ?? null;
    const cellRow = selectedCell?.row ?? null;
    const payload: DatabaseSurfaceContext = {
      route: databaseName?.trim()
        ? `/dashboard/database/${encodeURIComponent(databaseName.trim())}`
        : '/dashboard/database',
      surface: 'database',
      datasource,
      dialect,
      selectedTable,
      activeMainTab: 'sql',
      currentSqlBuffer: sql ? sql.slice(0, 4000) : '',
      selectedSql: sql ? sql.slice(0, 2000) : '',
      lastAttemptedSql: lastAttemptedSql ? lastAttemptedSql.slice(0, 4000) : '',
      lastError: sqlError,
      lastResultMeta: {
        rowsRead: lastRowsRead,
        durationMs: lastQueryMs,
        runState: sqlRunState,
      },
      selectedCellSummary:
        selectedCell
          ? {
              table: selectedCell.table || selectedTable || (selectedCell.source === 'sql_result' ? 'query' : ''),
              column: selectedCell.columnKey,
              rowKey: selectedCell.rowKey,
              valuePreview: (() => {
                const v = cellRow?.[selectedCell.columnKey] ?? selectedCell.value;
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
        page: filters.length ? browseMeta.page : page,
        totalPages: filters.length ? browseMeta.total_pages : tableBrowseTotalPages,
        totalCount: filters.length ? browseMeta.total_count : (selectedTableMeta?.row_count ?? browseMeta.total_count),
        rowsOnPage: sqlResults.length,
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
    browseMeta,
    data.rows,
    datasource,
    filters.length,
    isSuperadmin,
    lastAttemptedSql,
    lastQueryMs,
    lastRowsRead,
    page,
    pk,
    schema,
    selectedCell,
    selectedTable,
    selectedTableMeta?.row_count,
    sql,
    sqlError,
    sqlResults,
    sqlRunState,
    tableBrowseTotalPages,
  ]);

  const refreshTableRows = useCallback(
    async (nextPage = page) => {
      if (!selectedTable) return;
      setPage(nextPage);
      if (filters.length) {
        setLoadingMain(true);
        setDataError(null);
        try {
          const meta = selectedTableMeta ?? { name: selectedTable, table_schema: 'agentsam' };
          const qs = new URLSearchParams({ page: String(nextPage), limit: String(PAGE_SIZE) });
          if (sortCol) qs.set('sort', sortCol);
          if (sortCol) qs.set('dir', sortDir);
          qs.set('filter', serializeDatabaseFilters(filters));
          const dataPath = tableApiPath(meta, effectiveDatasource, 'data');
          const dataUrl = `${dataPath}${dataPath.includes('?') ? '&' : '?'}${qs.toString()}`;
          const payload =
            effectiveDatasource === 'd1'
              ? await fetchD1Json<DataResponse>(dataUrl)
              : await fetchJson<DataResponse>(dataUrl);
          setData(payload);
          syncDataResponseToGrid(payload);
          setSelectedRows(new Set());
        } catch (e) {
          setDataError(e instanceof Error ? e.message : String(e));
        } finally {
          setLoadingMain(false);
        }
        return;
      }
      const statement = selectTableSql(selectedTable, nextPage);
      setSql(statement);
      await requestRunSql(statement);
    },
    [
      effectiveDatasource,
      fetchD1Json,
      filters,
      page,
      requestRunSql,
      selectedTable,
      selectedTableMeta,
      selectTableSql,
      sortCol,
      sortDir,
      syncDataResponseToGrid,
    ],
  );

  const onPickTable = (name: string) => {
    setSelectedTable(name);
    setPage(1);
    setMetaPanel(null);
    setFilters([]);
    setSelectedRows(new Set());
    void loadSchema(name);
    const statement = selectTableSql(name, 1);
    setSql(statement);
    void requestRunSql(statement);
  };

  const openTableMeta = (name: string, panel: MetaPanel) => {
    setSelectedTable(name);
    setMetaPanel(panel);
    setTableMenu(null);
    void loadSchema(name);
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
      const meta = activeTables.find((t) => t.name === table) ?? { name: table, table_schema: 'agentsam' };
      const payload =
        effectiveDatasource === 'd1'
          ? await fetchD1Json<{ columns?: SchemaColumn[]; schema?: SchemaColumn[] }>(tableApiPath(meta, effectiveDatasource, 'schema'))
          : await fetchJson<{ columns?: SchemaColumn[]; schema?: SchemaColumn[] }>(tableApiPath(meta, effectiveDatasource, 'schema'));
      const cols = payload.columns || payload.schema || [];
      setColumnCache((c) => ({ ...c, [table]: cols }));
    } catch {
      setColumnCache((c) => ({ ...c, [table]: [] }));
    } finally {
      setColumnLoading((c) => ({ ...c, [table]: false }));
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
      await fetchD1Json(`/api/d1/table/${encodeURIComponent(selectedTable)}/row`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columns: insertValues }),
      });
      setDrawer(null);
      setInsertValues({});
      await refreshTableRows(page);
    } catch (e) {
      setDataError(e instanceof Error ? e.message : String(e));
    }
  };

  const deleteSelectedRows = async () => {
    if (!canDeleteRows || !selectedTable || !pk) return;
    const gridRows = sqlResults.length ? sqlResults : data.rows;
    const pkVals = gridRows.filter((r, i) => selectedRows.has(rowKeyForRow(r, pk, i))).map((r) => r[pk]);
    try {
      await fetchD1Json(`/api/d1/table/${encodeURIComponent(selectedTable)}/rows`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pk_col: pk, pk_vals: pkVals, confirm: true }),
      });
      setDeleteRowsModal(false);
      setSelectedRows(new Set());
      await refreshTableRows(page);
    } catch (e) {
      setDataError(e instanceof Error ? e.message : String(e));
    }
  };

  const getDataCellEditable = useCallback(
    (row: Record<string, unknown>, col: string) => {
      const isPkCol = Boolean(pk && col === pk);
      if (isPkCol) return { editable: false, reason: 'Primary key columns cannot be edited inline.' };
      if (!canEditDataCell) return { editable: false, reason: editDisabledReason };
      return { editable: true };
    },
    [canEditDataCell, editDisabledReason, pk],
  );

  const openCellDetail = useCallback((cell: SelectedGridCell) => {
    setSelectedCell(cell);
    const tableLabel =
      cell.source === 'sql_result' ? (selectedTable ? `Query result · ${selectedTable}` : 'Query result') : cell.table || 'Table';
    setCellDetail({
      datasourceLabel,
      tableName: tableLabel,
      columnName: cell.columnKey,
      rowKey: cell.source === 'data_tab' && pk && cell.row[pk] != null ? String(cell.row[pk]) : cell.rowKey,
      rowIndex: cell.rowIndex,
      rawValue: cell.value,
      editable: cell.editable,
      reasonIfNotEditable: cell.reasonIfNotEditable,
    });
  }, [datasourceLabel, pk, selectedTable]);

  const applyCellEdit = useCallback(
    async (cell: SelectedGridCell, nextValue: string) => {
      if (!canEditDataCell || !selectedTable || !pk || cell.columnKey === pk) return;
      const pkVal = cell.row[pk];
      if (pkVal == null) return;
      try {
        await fetchD1Json(`/api/d1/table/${encodeURIComponent(selectedTable)}/row`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pk_col: pk, pk_val: pkVal, updates: { [cell.columnKey]: nextValue } }),
        });
        setEditingCell(null);
        setCellDetail(null);
        await refreshTableRows(page);
      } catch (e) {
        setDataError(e instanceof Error ? e.message : String(e));
      }
    },
    [canEditDataCell, page, pk, refreshTableRows, selectedTable],
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
    const rows = sqlResults.length ? sqlResults : data.rows;
    exportRows(rows, `${selectedTable || 'table'}-page.csv`);
  }, [data.rows, exportRows, selectedTable, sqlResults]);

  const exportSqlResultsCsv = useCallback(() => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const base = selectedTable || 'query';
    exportRows(sqlResults, `${datasource}-${base}-${stamp}.csv`);
  }, [datasource, exportRows, selectedTable, sqlResults]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCellDetail(null);
        setEditingCell(null);
        return;
      }
      if (event.key === 'Enter' && selectedCell && !editingCell) {
        const tag = (event.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        event.preventDefault();
        openCellDetail(selectedCell);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editingCell, openCellDetail, selectedCell]);

  useEffect(() => {
    if (!tableMenu) return;
    const close = () => setTableMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [tableMenu]);

  const applyFiltersToTable = useCallback(() => {
    if (!selectedTable) return;
    setPage(1);
    void refreshTableRows(1);
  }, [refreshTableRows, selectedTable]);

  const onboardingEligible = capLoaded && pageReady && !isSuperadmin;
  const showD1Setup = false;
  const showHyperSetup = onboardingEligible && studioSection === 'customer_supabase' && !supabaseConnected;
  const showLearningSetup = onboardingEligible && studioSection === 'public_learning' && learningStatus === 'error';
  const dsNeedsSetup = studioSection === 'customer_supabase' ? showHyperSetup : showLearningSetup;
  const bothDisconnected =
    onboardingEligible && !supabaseConnected && learningStatus === 'error';
  const sidebarEmptyMuted = onboardingEligible && dsNeedsSetup;

  const setupContent =
    !pageReady || isSuperadmin
      ? null
      : bothDisconnected
        ? (
          <div className="flex h-full items-stretch justify-center gap-4 p-8">
            <div className="w-full max-w-md">
              <SetupCard
                title="Public learning"
                body="Explore safe public.iam_* examples while you connect your own database."
                to="/dashboard/database"
              />
            </div>
            <div className="w-full max-w-md">
              <SetupCard
                title="Connect your Supabase"
                body="Link Supabase OAuth in integrations, then select your project as the workspace default."
                to="/dashboard/settings/integrations"
              />
            </div>
          </div>
        )
        : dsNeedsSetup
          ? (
            <div className="flex h-full items-center justify-center p-8">
              <div className="w-full max-w-lg">
                {studioSection === 'customer_supabase' ? (
                  <SetupCard
                    title="Supabase not connected"
                    body="Connect Supabase via OAuth, select a project for this workspace, then return here."
                    to="/dashboard/settings/integrations"
                  />
                ) : (
                  <SetupCard
                    title="Public learning unavailable"
                    body="Could not load public.iam_* tables. Try again or connect your own Supabase."
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
            {isSuperadmin ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setSidebarSource('d1');
                    setStudioSection('platform_d1');
                    setSelectedTable(null);
                  }}
                  className={`flex-1 rounded-md px-2 py-1.5 text-[10px] font-black tracking-widest ${
                    sidebarSource === 'd1' ? 'bg-[var(--color-accent,var(--solar-cyan))]/15 text-[var(--color-accent,var(--solar-cyan))]' : 'text-muted hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  D1
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSidebarSource('hyperdrive');
                    setStudioSection('platform_hyperdrive');
                    setSelectedTable(null);
                  }}
                  className={`flex-1 rounded-md px-2 py-1.5 text-[10px] font-black tracking-widest ${
                    sidebarSource === 'hyperdrive' ? 'bg-[var(--color-accent,var(--solar-cyan))]/15 text-[var(--color-accent,var(--solar-cyan))]' : 'text-muted hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  Platform
                </button>
              </>
            ) : (
              <>
                {workspaceD1Available ? (
                  <button
                    type="button"
                    onClick={() => {
                      setStudioSection('workspace_d1');
                      setSidebarSource('d1');
                      setSelectedTable(null);
                      void loadTables('d1');
                    }}
                    className={`flex-1 rounded-md px-2 py-1.5 text-[10px] font-black tracking-widest ${
                      studioSection === 'workspace_d1'
                        ? 'bg-[var(--color-accent,var(--solar-cyan))]/15 text-[var(--color-accent,var(--solar-cyan))]'
                        : 'text-muted hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    D1
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setStudioSection('public_learning');
                    setSelectedTable(null);
                    void loadPublicLearningTables();
                  }}
                  className={`flex-1 rounded-md px-2 py-1.5 text-[10px] font-black tracking-widest ${
                    studioSection === 'public_learning' ? 'bg-[var(--color-accent,var(--solar-cyan))]/15 text-[var(--color-accent,var(--solar-cyan))]' : 'text-muted hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  Learning
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStudioSection('customer_supabase');
                    setSelectedTable(null);
                  }}
                  className={`flex-1 rounded-md px-2 py-1.5 text-[10px] font-black tracking-widest ${
                    studioSection === 'customer_supabase' ? 'bg-[var(--color-accent,var(--solar-cyan))]/15 text-[var(--color-accent,var(--solar-cyan))]' : 'text-muted hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  My DB
                </button>
              </>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <button
              type="button"
              title="Refresh tables"
              onClick={() => {
                if (studioSection === 'workspace_d1' || effectiveDatasource === 'd1') void loadTables('d1');
                else void loadTables(datasource);
              }}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-subtle)] text-muted hover:bg-[var(--bg-hover)] hover:text-main"
            >
              <RefreshCw size={14} className={loadingTables ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              title="Clear SQL editor"
              onClick={() => {
                setSql('');
                setSqlResults([]);
                setSqlColumns([]);
                setSqlRunState('idle');
                setSqlError(null);
              }}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-subtle)] text-muted hover:bg-[var(--bg-hover)] hover:text-main"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="border-b border-[var(--border-subtle)] p-3">
          <div className="flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] px-2 py-1.5">
            <Search size={12} className="shrink-0 text-muted" />
            <input
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              placeholder="Search tables"
              className="min-w-0 flex-1 bg-transparent font-mono text-[11px] outline-none placeholder:text-muted"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto py-1">
          {filteredTables.map((table) => {
            const open = expandedTables.has(table.name);
            const cols = columnCache[table.name];
            const loadingCols = columnLoading[table.name];
            return (
              <div
                key={table.name}
                className="border-b border-[var(--border-subtle)]/40"
                onContextMenu={(e) => {
                  e.preventDefault();
                  setTableMenu({ table: table.name, x: e.clientX, y: e.clientY });
                }}
              >
                <div className="flex items-stretch">
                  <button
                    type="button"
                    title={open ? 'Collapse columns' : 'Expand columns'}
                    onClick={(e) => void toggleColumns(table.name, e)}
                    className="flex w-7 shrink-0 items-center justify-center text-muted hover:bg-[var(--bg-hover)]"
                  >
                    <ChevronRight size={13} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onPickTable(table.name)}
                    className={`flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-0 pr-1 text-left font-mono text-[11px] ${
                      selectedTable === table.name ? 'bg-[var(--color-accent,var(--solar-cyan))]/10 text-[var(--color-accent,var(--solar-cyan))]' : 'hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    <TableIcon size={12} className="shrink-0 opacity-70" />
                    <span className="min-w-0 truncate font-mono text-[11px]">
                      {table.table_schema && datasource === 'hyperdrive' && table.table_schema !== 'agentsam' ? (
                        <span className="text-muted">{table.table_schema}.</span>
                      ) : null}
                      {highlightSearchMatchAll(table.name, tableSearch)}
                    </span>
                  </button>
                  <button
                    type="button"
                    title="Table actions"
                    aria-label={`Actions for ${table.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      setTableMenu({ table: table.name, x: rect.right, y: rect.bottom });
                    }}
                    className="flex w-7 shrink-0 items-center justify-center text-muted hover:bg-[var(--bg-hover)] hover:text-main"
                  >
                    <MoreHorizontal size={13} />
                  </button>
                </div>
                {open && (
                  <div className="border-t border-[var(--border-subtle)]/30 bg-[var(--bg-app)]/50 py-1 pl-8 pr-2">
                    {loadingCols ? (
                      <div className="flex items-center gap-2 py-1 text-[10px] text-muted">
                        <Loader2 size={11} className="animate-spin" /> Loading columns…
                      </div>
                    ) : (cols || []).length ? (
                      <ul className="space-y-0.5 text-[10px] text-muted">
                        {cols!.map((c) => (
                          <li key={c.name} className="flex justify-between gap-2 font-mono">
                            <span className="min-w-0 truncate text-main">{c.name}</span>
                            <span className="shrink-0 opacity-80">{c.type || 'TEXT'}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="py-1 text-[10px] text-muted">No columns</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {!filteredTables.length && (
            <p className="p-4 text-center font-mono text-[11px] text-muted">
              {!pageReady
                ? 'Loading tables…'
                : d1LoadError
                  ? d1LoadError
                  : loadingTables
                    ? 'Loading tables…'
                    : sidebarEmptyMuted
                      ? '—'
                      : 'No tables match'}
            </p>
          )}
        </div>
      </aside>

      {tableMenu && (
        <div
          className="database-table-menu"
          style={{ top: tableMenu.y, left: tableMenu.x }}
          role="menu"
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" role="menuitem" onClick={() => onPickTable(tableMenu.table)}>
            Query table
          </button>
          <button type="button" role="menuitem" onClick={() => openTableMeta(tableMenu.table, 'schema')}>
            View schema
          </button>
          <button type="button" role="menuitem" onClick={() => openTableMeta(tableMenu.table, 'indexes')}>
            View indexes
          </button>
          <button type="button" role="menuitem" onClick={() => openTableMeta(tableMenu.table, 'relations')}>
            View relations
          </button>
        </div>
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-panel)] px-4 py-2">
          <div className="flex min-w-0 items-center gap-3">
            {onBackToOverview ? (
              <button
                type="button"
                onClick={onBackToOverview}
                className="shrink-0 text-[11px] font-semibold text-[var(--color-accent,var(--solar-cyan))] hover:underline"
              >
                ← Overview
              </button>
            ) : null}
            <div className="min-w-0">
              <p className="truncate font-mono text-sm font-semibold">{selectedTable || 'Query'}</p>
              <p className="text-[11px] text-muted">
                {datasourceLabel}
                {!isSuperadmin && studioSection !== 'workspace_d1' ? ' · read-only SQL' : !isSuperadmin ? ' · read-only SQL' : ''}
              </p>
            </div>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden">
          <DatabaseCellDetailDrawer
            payload={cellDetail}
            onClose={() => setCellDetail(null)}
            onCopy={(t) => void copyToClipboard(t)}
            onCopyRowJson={
              selectedCell
                ? () => void copyToClipboard(JSON.stringify(selectedCell.row, null, 2))
                : undefined
            }
            onApplyEdit={
              selectedCell?.editable && selectedTable && pk
                ? (nextValue) => applyCellEdit(selectedCell, nextValue)
                : undefined
            }
          />
          {setupContent}

          {!setupContent && (
            <div ref={sqlStackRef} className="flex h-full min-h-0 flex-col">
              <div
                className="min-h-0 flex-1"
                style={{ minHeight: MIN_SQL_EDITOR_H, background: 'var(--database-monaco-bg)' }}
              >
                <MonacoSurface
                  height="100%"
                  language="sql"
                  value={sql}
                  onChange={setSql}
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
                {selectedTable && (
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--database-border)] bg-[var(--database-panel)] px-4 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={!canInsertRow}
                        title={!canInsertRow ? insertDisabledReason : 'Insert a new row'}
                        onClick={() => canInsertRow && setDrawer('insert')}
                        className="flex items-center gap-1 rounded-lg border border-[var(--database-border)] px-3 py-1.5 text-[11px] font-bold text-[var(--database-accent)] hover:bg-[var(--database-row-hover-bg)] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Plus size={12} /> Insert Row
                      </button>
                      <button
                        type="button"
                        disabled={!canDeleteRows}
                        title={!canDeleteRows ? deleteDisabledReason : `Delete ${selectedRows.size} selected row(s)`}
                        onClick={() => canDeleteRows && setDeleteRowsModal(true)}
                        className="flex items-center gap-1 rounded-lg border border-[var(--database-border)] px-3 py-1.5 text-[11px] font-bold text-[var(--database-error-text)] hover:bg-[var(--database-row-hover-bg)] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Trash2 size={12} /> Delete Row
                      </button>
                      <button
                        type="button"
                        onClick={() => void refreshTableRows(page)}
                        className="rounded-lg border border-[var(--database-border)] p-1.5 text-[var(--database-text-muted)] hover:bg-[var(--database-row-hover-bg)]"
                      >
                        <RefreshCw size={13} className={loadingMain || sqlRunning ? 'animate-spin' : ''} />
                      </button>
                      <button
                        type="button"
                        onClick={() => copyVisibleDataCsv()}
                        className="flex items-center gap-1 rounded-lg border border-[var(--database-border)] px-3 py-1.5 text-[11px] font-bold hover:bg-[var(--database-row-hover-bg)]"
                      >
                        <Download size={12} /> Export CSV
                      </button>
                      {selectedRows.size > 0 && (
                        <span className="rounded bg-[var(--database-cell-selected-bg)] px-2 py-0.5 text-[10px] font-bold text-[var(--database-accent)]">
                          {selectedRows.size} selected
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Filter size={12} className="text-[var(--database-text-muted)]" />
                      <select
                        value={filters[0]?.col || ''}
                        onChange={(e) =>
                          setFilters(e.target.value ? [{ id: 'f1', col: e.target.value, op: 'contains', val: '' }] : [])
                        }
                        className="rounded border border-[var(--database-border)] bg-[var(--database-bg)] px-2 py-1 text-[11px]"
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
                          onChange={(e) => setFilters([{ ...filters[0], op: e.target.value as DatabaseFilterUiOp }])}
                          className="rounded border border-[var(--database-border)] bg-[var(--database-bg)] px-2 py-1 text-[11px]"
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
                          onKeyDown={(e) => e.key === 'Enter' && applyFiltersToTable()}
                          className="w-28 rounded border border-[var(--database-border)] bg-[var(--database-bg)] px-2 py-1 text-[11px]"
                        />
                      )}
                      {filters.length > 0 && (
                        <button
                          type="button"
                          onClick={() => applyFiltersToTable()}
                          className="rounded border border-[var(--database-border)] px-2 py-1 text-[10px] font-bold hover:bg-[var(--database-row-hover-bg)]"
                        >
                          Apply
                        </button>
                      )}
                    </div>
                  </div>
                )}
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--database-border)] px-4 py-1.5">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--database-text-muted)]">
                    {sqlRunState === 'error' ? 'Query error' : 'Results'}
                  </span>
                  {!selectedTable && sqlResults.length > 0 && sqlRunState !== 'error' && (
                    <button
                      type="button"
                      onClick={() => exportSqlResultsCsv()}
                      className="inline-flex items-center gap-1 rounded border border-[var(--database-border)] px-2 py-0.5 text-[10px] font-bold hover:bg-[var(--database-row-hover-bg)]"
                    >
                      <Download size={11} /> Export CSV
                    </button>
                  )}
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
                    <DatabaseResultsGrid
                      rows={sqlResults}
                      columns={sqlColumns.length ? sqlColumns : Object.keys(sqlResults[0] || {})}
                      source="sql_result"
                      datasource={datasource}
                      table={selectedTable || undefined}
                      pk={pk || undefined}
                      selectedCell={selectedCell?.source === 'sql_result' ? selectedCell : null}
                      onSelectCell={(cell) => {
                        setSelectedCell(cell);
                        setCellDetail(null);
                      }}
                      onOpenCellDetail={openCellDetail}
                      onCopyCell={(text) => void copyToClipboard(text)}
                      showRowSelector={Boolean(selectedTable)}
                      selectedRows={selectedRows}
                      rowSelectorDisabled={!isSuperadmin}
                      onToggleRow={(rowKey, checked) =>
                        setSelectedRows((prev) => {
                          const next = new Set(prev);
                          checked ? next.add(rowKey) : next.delete(rowKey);
                          return next;
                        })
                      }
                      onToggleAllRows={(checked) =>
                        setSelectedRows(
                          checked ? new Set(sqlResults.map((r, i) => rowKeyForRow(r, pk, i))) : new Set(),
                        )
                      }
                      editingCell={editingCell}
                      getCellEditable={(row, col, rowIndex) => getDataCellEditable(row, col)}
                      onBeginInlineEdit={(cell) => {
                        setSelectedCell(cell);
                        setEditingCell({
                          rowKey: cell.rowKey,
                          col: cell.columnKey,
                          value: cell.value == null ? '' : String(cell.value),
                        });
                      }}
                      onEditingValueChange={(value) => setEditingCell((prev) => (prev ? { ...prev, value } : prev))}
                      onCommitInlineEdit={() => {
                        if (!editingCell) return;
                        const rowIndex = sqlResults.findIndex((r, i) => rowKeyForRow(r, pk, i) === editingCell.rowKey);
                        if (rowIndex < 0) return;
                        const row = sqlResults[rowIndex];
                        const editMeta = getDataCellEditable(row, editingCell.col);
                        void applyCellEdit(
                          {
                            source: 'sql_result',
                            datasource,
                            table: selectedTable || undefined,
                            rowIndex,
                            rowKey: editingCell.rowKey,
                            columnKey: editingCell.col,
                            value: row[editingCell.col],
                            row,
                            editable: editMeta.editable,
                            reasonIfNotEditable: editMeta.reason,
                          },
                          editingCell.value,
                        );
                      }}
                      onCancelInlineEdit={() => setEditingCell(null)}
                      sortCol={sortCol}
                      sortDir={sortDir}
                      onSortColumn={(col) => {
                        setSortCol(col);
                        setSortDir(sortCol === col && sortDir === 'asc' ? 'desc' : 'asc');
                        if (selectedTable) void refreshTableRows(1);
                      }}
                    />
                  ) : (
                    <p className="p-4 text-[12px] text-[var(--database-text-muted)]">
                      {sqlRunState === 'running' ? 'Running query…' : 'Run a query to see results.'}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--database-border)] px-4 py-1.5 font-mono text-[10px] text-[var(--database-text-muted)]">
                  <span>
                    Query {lastQueryMs != null ? `${lastQueryMs}ms` : '—'} · {lastRowsRead != null ? lastRowsRead : '—'} rows on page
                    {selectedTable && (
                      <>
                        {' '}
                        ·{' '}
                        {(filters.length ? browseMeta.total_count : selectedTableMeta?.row_count)?.toLocaleString() ?? '—'} total
                      </>
                    )}
                  </span>
                  {selectedTable && (
                    <div className="flex items-center gap-2">
                      <span>
                        Page {page} of {tableBrowseTotalPages}
                      </span>
                      <button
                        type="button"
                        disabled={page <= 1}
                        onClick={() => void refreshTableRows(Math.max(1, page - 1))}
                        className="rounded border border-[var(--database-border)] px-2 py-1 disabled:opacity-40"
                        aria-label="Previous page"
                      >
                        <ChevronLeft size={12} />
                      </button>
                      <button
                        type="button"
                        disabled={page >= tableBrowseTotalPages}
                        onClick={() => void refreshTableRows(Math.min(tableBrowseTotalPages, page + 1))}
                        className="rounded border border-[var(--database-border)] px-2 py-1 disabled:opacity-40"
                        aria-label="Next page"
                      >
                        <ChevronRight size={12} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {metaPanel && selectedTable && !setupContent && (
            <div className="database-meta-overlay" role="dialog" aria-modal="true">
              <div className="database-meta-panel">
                <div className="flex items-start justify-between gap-3 border-b border-[var(--database-border)] px-4 py-3">
                  <div>
                    <h2 className="font-mono text-sm font-semibold">
                      {selectedTable} · {metaPanel}
                    </h2>
                    <p className="text-[11px] text-[var(--database-text-muted)]">{datasourceLabel}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMetaPanel(null)}
                    className="rounded-lg p-1.5 text-[var(--database-text-muted)] hover:bg-[var(--database-row-hover-bg)]"
                  >
                    <X size={15} />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-auto p-4">
                  {metaPanel === 'schema' && (
                    <>
                      <div className="mb-3 flex gap-2">
                        <button
                          type="button"
                          disabled={!isSuperadmin}
                          onClick={() => {
                            setSql(`ALTER TABLE ${selectedTableSqlName}\nADD COLUMN new_column TEXT;`);
                            setMetaPanel(null);
                          }}
                          className="rounded-lg border border-[var(--database-border)] px-3 py-1.5 text-[11px] font-bold hover:bg-[var(--database-row-hover-bg)] disabled:opacity-40"
                        >
                          Add Column
                        </button>
                        <button
                          type="button"
                          disabled={!isSuperadmin}
                          onClick={() => {
                            setSql(`ALTER TABLE ${selectedTableSqlName}\nRENAME TO ${quoteIdent(`${selectedTable}_new`)};`);
                            setMetaPanel(null);
                          }}
                          className="rounded-lg border border-[var(--database-border)] px-3 py-1.5 text-[11px] font-bold hover:bg-[var(--database-row-hover-bg)] disabled:opacity-40"
                        >
                          Edit Table
                        </button>
                      </div>
                      <table className="w-full min-w-[560px] border-collapse text-left text-[12px]">
                        <thead>
                          <tr className="border-b border-[var(--database-border)] text-[10px] uppercase tracking-widest text-[var(--database-text-muted)]">
                            {['#', 'Column', 'Type', 'Nullable', 'Default'].map((h) => (
                              <th key={h} className="px-3 py-2">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {schema.map((col, index) => (
                            <tr key={col.name} className="border-b border-[var(--database-border)]/50">
                              <td className="px-3 py-2 font-mono text-[var(--database-text-muted)]">{index + 1}</td>
                              <td className="px-3 py-2 font-mono font-semibold">
                                {isPrimaryKey(col) && <Key size={12} className="mr-1 inline text-[var(--solar-yellow)]" />}
                                {col.name}
                              </td>
                              <td className="px-3 py-2 font-mono text-[var(--database-accent)]">{col.type || 'TEXT'}</td>
                              <td className="px-3 py-2">{isNotNull(col) ? 'NOT NULL' : 'nullable'}</td>
                              <td className="px-3 py-2 font-mono text-[var(--database-text-muted)]">{columnDefault(col) ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}
                  {metaPanel === 'indexes' && (
                    <>
                      <button
                        type="button"
                        disabled={!isSuperadmin}
                        onClick={() => {
                          setSql(`CREATE INDEX idx_${selectedTable}_column\nON ${selectedTableSqlName} (column_name);`);
                          setMetaPanel(null);
                        }}
                        className="mb-4 rounded-lg border border-[var(--database-border)] px-3 py-2 text-[11px] font-bold text-[var(--database-accent)] hover:bg-[var(--database-row-hover-bg)] disabled:opacity-40"
                      >
                        <Plus size={12} className="mr-1 inline" /> Add Index
                      </button>
                      {indexes.map((idx) => (
                        <div key={idx.name} className="mb-3 rounded-lg border border-[var(--database-border)] bg-[var(--database-bg)] p-3">
                          <div className="font-mono text-sm">{idx.name}</div>
                          <pre className="mt-2 whitespace-pre-wrap text-[11px] text-[var(--database-text-muted)]">{idx.sql || 'auto index'}</pre>
                        </div>
                      ))}
                    </>
                  )}
                  {metaPanel === 'relations' && (
                    <>
                      {relations.length ? (
                        relations.map((rel, i) => (
                          <div
                            key={`${rel.from}-${rel.to}-${i}`}
                            className="mb-3 flex items-center gap-3 rounded-lg border border-[var(--database-border)] bg-[var(--database-bg)] p-3 font-mono text-[12px]"
                          >
                            <Link2 size={14} className="text-[var(--database-accent)]" />
                            <span>{rel.source_column || rel.from}</span>
                            <span className="text-[var(--database-text-muted)]">→</span>
                            <span>
                              {rel.target_table || rel.table}.{rel.target_column || rel.to}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-[12px] text-[var(--database-text-muted)]">No foreign keys found for this table.</p>
                      )}
                    </>
                  )}
                </div>
              </div>
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
                  <span className="font-mono text-[10px] text-muted">{col.type || 'TEXT'}</span>
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
              <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-muted">Generated SQL</p>
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
        <div className="pointer-events-none absolute left-[220px] top-0 flex items-center gap-2 rounded-br-lg border-b border-r border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2 text-[11px] text-muted">
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

export default DatabaseStudio;
