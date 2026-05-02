/**
 * DatabasePage — /dashboard/database
 *
 * Supabase-style table editor for Cloudflare D1 and Hyperdrive-backed Postgres.
 * The page keeps schema, data, SQL, indexes, relations, and health in-page with
 * inline editing and drawers instead of modal flows.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import {
  Activity,
  AlertTriangle,
  Braces,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code2,
  Database,
  Download,
  ExternalLink,
  Filter,
  HardDrive,
  Key,
  Layers,
  Link2,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Table as TableIcon,
  Trash2,
  X,
} from 'lucide-react';

type Datasource = 'd1' | 'hyperdrive';
type SidebarTab = Datasource | 'infrastructure';
type MainTab = 'schema' | 'data' | 'sql' | 'indexes' | 'relations';
type SortDir = 'asc' | 'desc';

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

type FilterRule = {
  id: string;
  col: string;
  op: 'eq' | 'neq' | 'gt' | 'lt' | 'like' | 'is_null' | 'not_null';
  val: string;
};

type PlatformHealth = {
  kv?: { namespaces?: { binding: string; name?: string; estimated_keys?: number | null; status?: string }[] };
  durable_objects?: { classes?: { binding: string; class_name: string; status?: string }[] };
  d1?: { tables_count?: number; total_rows?: number; last_migration?: string | null; storage_used?: string | null; studio_url?: string };
  hyperdrive?: { ok?: boolean; latency_ms?: number | null; active_connections?: number | null; error?: string };
};

type ConnectionForm = {
  connection_type: string;
  display_name: string;
  host: string;
  port: string;
  database_name: string;
  username: string;
  password: string;
};

const PAGE_SIZE = 50;
const OPS: FilterRule['op'][] = ['eq', 'neq', 'gt', 'lt', 'like', 'is_null', 'not_null'];

const HYPERDRIVE_GROUPS = ['MISC', 'AGENT', 'AGENTSAM', 'COST', 'KNOWLEDGE', 'PROVIDER', 'SEMANTIC', 'SESSION', 'TENANT', 'WEBHOOK'];

function quoteIdent(name: string) {
  return `"${name.replace(/"/g, '""')}"`;
}

function cssVar(name: string, fallback: string) {
  if (typeof window === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function groupNameFor(table: string, datasource: Datasource) {
  const upper = table.toUpperCase();
  if (datasource === 'hyperdrive') {
    const found = HYPERDRIVE_GROUPS.find((g) => upper === g || upper.startsWith(`${g}_`) || upper.startsWith(`${g.toLowerCase()}_`.toUpperCase()));
    return found || 'MISC';
  }
  return table.includes('_') ? table.split('_')[0].toUpperCase() : 'MISC';
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
  if (value === null || value === undefined) return <span className="italic text-[var(--text-muted)] opacity-60">null</span>;
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

export const DatabasePage: React.FC = () => {
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('d1');
  const datasource: Datasource = sidebarTab === 'hyperdrive' ? 'hyperdrive' : 'd1';
  const [tables, setTables] = useState<Record<Datasource, TableMeta[]>>({ d1: [], hyperdrive: [] });
  const [tableSearch, setTableSearch] = useState('');
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(['AGENT', 'AGENTSAM', 'CMS', 'MISC']));
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MainTab>('schema');
  const [rightRailOpen, setRightRailOpen] = useState(true);
  const [loadingTables, setLoadingTables] = useState(false);
  const [hyperdriveHealth, setHyperdriveHealth] = useState<{ ok?: boolean; latency_ms?: number | null; error?: string } | null>(null);

  const [schema, setSchema] = useState<SchemaColumn[]>([]);
  const [indexes, setIndexes] = useState<IndexMeta[]>([]);
  const [relations, setRelations] = useState<RelationMeta[]>([]);
  const [data, setData] = useState<DataResponse>({ rows: [], total_count: 0, page: 1, total_pages: 1 });
  const [dataError, setDataError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [sortCol, setSortCol] = useState('');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [loadingMain, setLoadingMain] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [inlineConfirmDelete, setInlineConfirmDelete] = useState(false);

  const [sql, setSql] = useState('-- Select a table or write SQL here\nSELECT name FROM sqlite_master WHERE type = \'table\' ORDER BY name;');
  const [sqlResults, setSqlResults] = useState<Record<string, unknown>[]>([]);
  const [sqlError, setSqlError] = useState<string | null>(null);
  const [sqlRunning, setSqlRunning] = useState(false);
  const [queryHistory, setQueryHistory] = useState<string[]>([]);
  const [snippets, setSnippets] = useState<{ id?: string; title?: string; sql_text?: string }[]>([]);
  const editorRef = useRef<{ getSelection?: () => unknown; getModel?: () => { getValueInRange: (sel: unknown) => string } } | null>(null);

  const [drawer, setDrawer] = useState<'insert' | 'connect' | null>(null);
  const [insertValues, setInsertValues] = useState<Record<string, string>>({});
  const [editingCell, setEditingCell] = useState<{ rowKey: string; col: string; value: string } | null>(null);
  const [connectionForm, setConnectionForm] = useState<ConnectionForm>({
    connection_type: 'supabase',
    display_name: '',
    host: '',
    port: '5432',
    database_name: '',
    username: '',
    password: '',
  });
  const [connections, setConnections] = useState<{ id: string; display_name: string; connection_type: string; last_test_status?: string }[]>([]);
  const [canManageConnections, setCanManageConnections] = useState(false);
  const [platformHealth, setPlatformHealth] = useState<PlatformHealth>({});

  const activeTables = tables[datasource];
  const currentTable = selectedTable ? activeTables.find((t) => t.name === selectedTable) : null;
  const pk = useMemo(() => schema.find(isPrimaryKey)?.name || schema[0]?.name || '', [schema]);
  const filteredTables = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    return q ? activeTables.filter((t) => t.name.toLowerCase().includes(q)) : activeTables;
  }, [activeTables, tableSearch]);
  const groupedTables = useMemo(() => {
    const map = new Map<string, TableMeta[]>();
    for (const table of filteredTables) {
      const group = groupNameFor(table.name, datasource);
      map.set(group, [...(map.get(group) || []), table]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filteredTables, datasource]);
  const columns = data.columns?.length ? data.columns : Object.keys(data.rows[0] || {});
  const selectedTableSqlName = selectedTable ? quoteIdent(selectedTable) : '';
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

  const loadThemeSettings = useCallback(async () => {
    try {
      const theme = await fetchJson<{ theme?: { config?: Record<string, unknown>; monaco_theme?: string; monaco_bg?: string }; variables?: Record<string, string> }>('/api/workspace/settings');
      const config = theme.theme?.config || {};
      const variables = theme.variables || {};
      const accent = String((config.accent_color || config.accentColor || variables['--color-accent'] || variables['--solar-cyan'] || '') ?? '').trim();
      if (accent) document.documentElement.style.setProperty('--color-accent', accent);
      if (theme.theme?.monaco_bg) document.documentElement.style.setProperty('--database-monaco-bg', String(theme.theme.monaco_bg));
    } catch {
      document.documentElement.style.setProperty('--color-accent', cssVar('--solar-cyan', 'currentColor'));
    }
  }, []);

  const loadTables = useCallback(async (target: Datasource = datasource) => {
    setLoadingTables(true);
    try {
      const endpoint = target === 'd1' ? '/api/d1/tables' : '/api/hyperdrive/tables';
      const payload = await fetchJson<unknown>(endpoint);
      setTables((prev) => ({ ...prev, [target]: normalizeTables(payload) }));
    } catch {
      setTables((prev) => ({ ...prev, [target]: [] }));
    } finally {
      setLoadingTables(false);
    }
  }, [datasource]);

  const loadSchema = useCallback(async (table: string) => {
    setLoadingMain(true);
    try {
      const base = datasource === 'd1' ? '/api/d1/table' : '/api/hyperdrive/table';
      const payload = await fetchJson<{ columns?: SchemaColumn[]; schema?: SchemaColumn[]; indexes?: IndexMeta[]; foreign_keys?: RelationMeta[] }>(`${base}/${encodeURIComponent(table)}/schema`);
      setSchema(payload.columns || payload.schema || []);
      setIndexes(payload.indexes || []);
      setRelations(payload.foreign_keys || []);
    } finally {
      setLoadingMain(false);
    }
  }, [datasource]);

  const loadData = useCallback(async (table: string, nextPage = page) => {
    setLoadingMain(true);
    setDataError(null);
    try {
      const base = datasource === 'd1' ? '/api/d1/table' : '/api/hyperdrive/table';
      const qs = new URLSearchParams({ page: String(nextPage), limit: String(PAGE_SIZE) });
      if (sortCol) qs.set('sort', sortCol);
      if (sortCol) qs.set('dir', sortDir);
      if (filters.length) qs.set('filter', JSON.stringify(filters.map(({ col, op, val }) => ({ col, op, val }))));
      const payload = await fetchJson<DataResponse>(`${base}/${encodeURIComponent(table)}/data?${qs.toString()}`);
      setData(payload);
      setSelectedRows(new Set());
    } catch (e) {
      setDataError(e instanceof Error ? e.message : String(e));
      setData({ rows: [], total_count: 0, page: nextPage, total_pages: 1 });
    } finally {
      setLoadingMain(false);
    }
  }, [datasource, filters, page, sortCol, sortDir]);

  const loadPlatformHealth = useCallback(async () => {
    const next: PlatformHealth = {};
    const [kv, d1, hyperdrive] = await Promise.allSettled([
      fetchJson<PlatformHealth['kv']>('/api/platform/kv-health'),
      fetchJson<PlatformHealth['d1']>('/api/platform/d1-health'),
      fetchJson<PlatformHealth['hyperdrive']>('/api/hyperdrive/health'),
    ]);
    if (kv.status === 'fulfilled') next.kv = kv.value;
    if (d1.status === 'fulfilled') next.d1 = d1.value;
    if (hyperdrive.status === 'fulfilled') next.hyperdrive = hyperdrive.value;
    next.durable_objects = {
      classes: [
        { binding: 'IAM_COLLAB', class_name: 'IAMCollaborationSession', status: 'configured' },
        { binding: 'CHESS_SESSION', class_name: 'ChessRoom', status: 'configured' },
        { binding: 'AGENT_SESSION', class_name: 'AgentChatSqlV1', status: 'configured' },
      ],
    };
    setPlatformHealth(next);
  }, []);

  const loadConnections = useCallback(async () => {
    try {
      const payload = await fetchJson<{ connections?: { id: string; display_name: string; connection_type: string; last_test_status?: string }[]; can_manage_mcp?: boolean }>('/api/db/connections');
      setConnections(payload.connections || []);
      setCanManageConnections(Boolean(payload.can_manage_mcp));
    } catch {
      setConnections([]);
    }
  }, []);

  useEffect(() => {
    void loadThemeSettings();
    void loadTables('d1');
    void loadTables('hyperdrive');
    void loadPlatformHealth();
    void loadConnections();
    fetch('/api/hyperdrive/health', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then(setHyperdriveHealth)
      .catch(() => setHyperdriveHealth({ ok: false }));
    fetch('/api/agent/db/snippets', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setSnippets(Array.isArray(d.items) ? d.items : []))
      .catch(() => setSnippets([]));
  }, [loadConnections, loadPlatformHealth, loadTables, loadThemeSettings]);

  useEffect(() => {
    if (!selectedTable || sidebarTab === 'infrastructure') return;
    void loadSchema(selectedTable);
    void loadData(selectedTable, 1);
  }, [datasource, loadData, loadSchema, selectedTable, sidebarTab]);

  useEffect(() => {
    if (tableSearch.trim()) setOpenGroups(new Set(groupedTables.map(([name]) => name)));
  }, [groupedTables, tableSearch]);

  const selectTable = (name: string) => {
    setSelectedTable(name);
    setPage(1);
    setActiveTab('schema');
    setSql(`-- ${datasource === 'd1' ? 'SQLite / D1' : 'Postgres / Hyperdrive'}\nSELECT * FROM ${quoteIdent(name)} LIMIT 50;`);
  };

  const runSql = useCallback(async (statement = sql) => {
    setSqlRunning(true);
    setSqlError(null);
    try {
      const endpoint = datasource === 'd1' ? '/api/d1/query' : '/api/hyperdrive/query';
      const payload = await fetchJson<{ rows?: Record<string, unknown>[]; results?: Record<string, unknown>[]; error?: string }>(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: statement, params: [] }),
      });
      const rows = payload.rows || payload.results || [];
      setSqlResults(rows);
      setQueryHistory((prev) => [statement, ...prev.filter((q) => q !== statement)].slice(0, 20));
      if (payload.error) setSqlError(payload.error);
    } catch (e) {
      setSqlError(e instanceof Error ? e.message : String(e));
      setSqlResults([]);
    } finally {
      setSqlRunning(false);
    }
  }, [datasource, sql]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key !== 'Enter' || activeTab !== 'sql') return;
      event.preventDefault();
      void runSql();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeTab, runSql]);

  const commitCell = async () => {
    if (!editingCell || !selectedTable || !pk) return;
    const row = data.rows.find((r) => String(r[pk]) === editingCell.rowKey);
    if (!row) return;
    const endpoint = datasource === 'd1' ? `/api/d1/table/${encodeURIComponent(selectedTable)}/row` : '/api/hyperdrive/query';
    try {
      if (datasource === 'd1') {
        await fetchJson(endpoint, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pk_col: pk, pk_val: row[pk], updates: { [editingCell.col]: editingCell.value } }),
        });
      } else {
        await runSql(`UPDATE public.${quoteIdent(selectedTable)} SET ${quoteIdent(editingCell.col)} = '${editingCell.value.replace(/'/g, "''")}' WHERE ${quoteIdent(pk)} = '${String(row[pk]).replace(/'/g, "''")}';`);
      }
      setEditingCell(null);
      await loadData(selectedTable, page);
    } catch (e) {
      setDataError(e instanceof Error ? e.message : String(e));
    }
  };

  const insertRow = async () => {
    if (!selectedTable) return;
    const missing = schema.filter((c) => isNotNull(c) && !isPrimaryKey(c) && columnDefault(c) == null && !insertValues[c.name]);
    if (missing.length) {
      setDataError(`Required fields missing: ${missing.map((c) => c.name).join(', ')}`);
      return;
    }
    try {
      if (datasource === 'd1') {
        await fetchJson(`/api/d1/table/${encodeURIComponent(selectedTable)}/row`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ columns: insertValues }),
        });
      } else {
        await runSql(insertSql);
      }
      setDrawer(null);
      setInsertValues({});
      await loadData(selectedTable, page);
    } catch (e) {
      setDataError(e instanceof Error ? e.message : String(e));
    }
  };

  const deleteSelectedRows = async () => {
    if (!selectedTable || !pk || selectedRows.size === 0) return;
    const pkVals = data.rows.filter((r) => selectedRows.has(String(r[pk]))).map((r) => r[pk]);
    try {
      if (datasource === 'd1') {
        await fetchJson(`/api/d1/table/${encodeURIComponent(selectedTable)}/rows`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pk_col: pk, pk_vals: pkVals, confirm: true }),
        });
      } else {
        const list = pkVals.map((v) => `'${String(v).replace(/'/g, "''")}'`).join(', ');
        await runSql(`DELETE FROM public.${quoteIdent(selectedTable)} WHERE ${quoteIdent(pk)} IN (${list});`);
      }
      setInlineConfirmDelete(false);
      await loadData(selectedTable, page);
    } catch (e) {
      setDataError(e instanceof Error ? e.message : String(e));
    }
  };

  const exportRows = (rows: Record<string, unknown>[], filename: string) => {
    const cols = Object.keys(rows[0] || {});
    const csv = [cols.join(','), ...rows.map((row) => cols.map((col) => JSON.stringify(row[col] ?? '')).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const askAgentSam = () => {
    if (!selectedTable) return;
    const selection = editorRef.current?.getSelection?.();
    const selectedSql = selection ? editorRef.current?.getModel?.()?.getValueInRange(selection) : '';
    window.dispatchEvent(new CustomEvent('iam:agent-refactor', {
      detail: {
        selection: `Table: ${selectedTable}\nSchema:\n${schema.map((c) => `${c.name} ${c.type}`).join('\n')}\n\nSQL:\n${selectedSql || sql}`,
        path: 'database.sql',
        content: sql,
      },
    }));
  };

  return (
    <div className="relative flex h-full min-h-0 overflow-hidden bg-[var(--bg-app)] text-[var(--text-main)]">
      <aside className="flex w-[240px] shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-panel)]">
        <div className="border-b border-[var(--border-subtle)] p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h1 className="text-[12px] font-black uppercase tracking-[0.18em]">Data Manager</h1>
              <p className="mt-1 inline-flex rounded-full border border-[var(--border-subtle)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">ws_inneranimalmedia</p>
            </div>
            <Database size={17} className="text-[var(--color-accent,var(--solar-cyan))]" />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] p-1">
            {[
              ['d1', 'D1'],
              ['hyperdrive', 'HYPER'],
              ['infrastructure', 'INFRA'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setSidebarTab(id as SidebarTab)}
                className={`rounded-md px-2 py-1 text-[9px] font-black tracking-widest ${sidebarTab === id ? 'bg-[var(--color-accent,var(--solar-cyan))]/15 text-[var(--color-accent,var(--solar-cyan))]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {sidebarTab === 'infrastructure' ? (
          <div className="min-h-0 flex-1 overflow-auto p-3 text-[11px]">
            <button type="button" onClick={loadPlatformHealth} className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--border-subtle)] px-3 py-2 font-bold text-[var(--text-muted)] hover:bg-[var(--bg-hover)]">
              <RefreshCw size={12} /> Refresh Infrastructure
            </button>
            <section className="mb-4">
              <h2 className="mb-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">KV Namespaces</h2>
              {(platformHealth.kv?.namespaces || []).map((ns) => (
                <div key={ns.binding} className="mb-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] p-2">
                  <div className="font-mono text-[var(--text-main)]">{ns.binding}</div>
                  <div className="text-[var(--text-muted)]">{ns.name || 'bound namespace'} · {ns.estimated_keys ?? 'unknown'} keys</div>
                  {ns.binding === 'SESSION_CACHE' && (
                    <button type="button" className="mt-2 rounded border border-[var(--border-subtle)] px-2 py-1 text-[10px] font-bold text-[var(--solar-red)] hover:bg-[var(--bg-hover)]" onClick={() => fetch('/api/platform/kv/flush', { method: 'DELETE', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ namespace: 'SESSION_CACHE' }) })}>
                      Flush Cache
                    </button>
                  )}
                </div>
              ))}
            </section>
            <section className="mb-4">
              <h2 className="mb-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Durable Objects</h2>
              {(platformHealth.durable_objects?.classes || []).map((klass) => (
                <div key={klass.binding} className="mb-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] p-2">
                  <div className="font-mono">{klass.class_name}</div>
                  <div className="text-[var(--text-muted)]">{klass.binding} · {klass.status}</div>
                </div>
              ))}
            </section>
            <section className="mb-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] p-3">
              <h2 className="mb-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">D1 Health</h2>
              <div>{platformHealth.d1?.tables_count ?? 0} tables</div>
              <div>{platformHealth.d1?.total_rows ?? 0} estimated rows</div>
              {platformHealth.d1?.studio_url && <a className="mt-2 inline-flex items-center gap-1 text-[var(--color-accent,var(--solar-cyan))]" href={platformHealth.d1.studio_url} target="_blank" rel="noreferrer">Open D1 Studio <ExternalLink size={11} /></a>}
            </section>
            <section className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] p-3">
              <h2 className="mb-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Supabase Health</h2>
              <div className={platformHealth.hyperdrive?.ok ? 'text-[var(--solar-green)]' : 'text-[var(--solar-red)]'}>{platformHealth.hyperdrive?.ok ? 'Connected' : 'Unavailable'}</div>
              <div className="text-[var(--text-muted)]">{platformHealth.hyperdrive?.latency_ms ?? 'n/a'}ms latency</div>
            </section>
          </div>
        ) : (
          <>
            <div className="border-b border-[var(--border-subtle)] p-3">
              <div className="mb-2 flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] px-2 py-1.5">
                <Search size={12} className="text-[var(--text-muted)]" />
                <input value={tableSearch} onChange={(e) => setTableSearch(e.target.value)} placeholder="Search tables" className="min-w-0 flex-1 bg-transparent font-mono text-[11px] outline-none placeholder:text-[var(--text-muted)]" />
              </div>
              <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                <span>{datasource === 'd1' ? 'inneranimalmedia-business' : 'inneranimalmedia-business-supabase'}</span>
                {datasource === 'hyperdrive' && <span className={`h-2 w-2 rounded-full ${hyperdriveHealth?.ok ? 'bg-[var(--solar-green)]' : 'bg-[var(--solar-red)]'}`} />}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto py-2">
              {groupedTables.map(([group, groupTables]) => {
                const open = openGroups.has(group);
                return (
                  <section key={group}>
                    <button type="button" onClick={() => setOpenGroups((prev) => { const next = new Set(prev); next.has(group) ? next.delete(group) : next.add(group); return next; })} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--bg-hover)]">
                      <ChevronRight size={11} className={`text-[var(--text-muted)] transition-transform ${open ? 'rotate-90' : ''}`} />
                      <span className="flex-1 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">{group}</span>
                      <span className="rounded-full bg-[var(--bg-app)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--text-muted)]">{groupTables.length}</span>
                    </button>
                    {open && groupTables.map((table) => (
                      <button key={table.name} type="button" onClick={() => selectTable(table.name)} onContextMenu={(e) => { e.preventDefault(); setSql(`SELECT * FROM ${quoteIdent(table.name)} LIMIT 50;`); setActiveTab('sql'); }} className={`group flex w-full items-center gap-2 px-3 py-1.5 pl-7 text-left ${selectedTable === table.name ? 'bg-[var(--color-accent,var(--solar-cyan))]/10 text-[var(--color-accent,var(--solar-cyan))]' : 'hover:bg-[var(--bg-hover)]'}`}>
                        <TableIcon size={12} />
                        <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{table.name}</span>
                        {table.row_count != null && <span className="font-mono text-[9px] text-[var(--text-muted)]">{table.row_count}</span>}
                      </button>
                    ))}
                  </section>
                );
              })}
              {!groupedTables.length && <p className="p-4 text-center font-mono text-[11px] text-[var(--text-muted)]">{loadingTables ? 'Loading tables...' : 'No tables found'}</p>}
              {connections.length > 0 && (
                <section className="mt-3 border-t border-[var(--border-subtle)] pt-2">
                  <h2 className="px-3 py-1 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Connected Databases</h2>
                  {connections.map((conn) => (
                    <div key={conn.id} className="px-3 py-1.5 font-mono text-[11px] text-[var(--text-muted)]">{conn.display_name}</div>
                  ))}
                </section>
              )}
            </div>
            <div className="border-t border-[var(--border-subtle)] p-3">
              <button type="button" onClick={() => { setSql(`CREATE TABLE ${quoteIdent('new_table')} (\n  id TEXT PRIMARY KEY,\n  created_at INTEGER DEFAULT (unixepoch())\n);`); setActiveTab('sql'); }} className="mb-2 flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-[11px] font-bold hover:bg-[var(--bg-hover)]">
                <Plus size={12} /> New Table
              </button>
              {canManageConnections && <button type="button" onClick={() => setDrawer('connect')} className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-[11px] font-bold text-[var(--color-accent,var(--solar-cyan))] hover:bg-[var(--bg-hover)]"><Plus size={12} /> Connect Database</button>}
            </div>
          </>
        )}
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-panel)] px-4 py-2">
          <div className="min-w-0">
            <p className="font-mono text-sm font-semibold">{selectedTable || (sidebarTab === 'infrastructure' ? 'Infrastructure' : 'Select a table')}</p>
            <p className="text-[11px] text-[var(--text-muted)]">{sidebarTab === 'hyperdrive' ? 'Hyperdrive · Supabase public schema' : sidebarTab === 'd1' ? 'Cloudflare D1' : 'KV · Durable Objects · D1 · Supabase'}</p>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] p-1">
            {(['schema', 'data', 'sql', 'indexes', 'relations'] as MainTab[]).map((tab) => (
              <button key={tab} type="button" onClick={() => { setActiveTab(tab); if (tab === 'data' && selectedTable) void loadData(selectedTable, page); }} className={`rounded-md px-3 py-1 text-[10px] font-black uppercase tracking-widest ${activeTab === tab ? 'bg-[var(--color-accent,var(--solar-cyan))]/15 text-[var(--color-accent,var(--solar-cyan))]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'}`}>
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {!selectedTable && activeTab !== 'sql' ? (
            <div className="flex h-full items-center justify-center text-center">
              <div>
                <Database size={34} className="mx-auto mb-3 text-[var(--text-muted)] opacity-40" />
                <p className="text-sm font-semibold">Choose a table from the sidebar</p>
                <p className="mt-1 text-[12px] text-[var(--text-muted)]">Schema, rows, indexes, and relations stay in this workspace.</p>
              </div>
            </div>
          ) : activeTab === 'schema' ? (
            <div className="flex h-full flex-col overflow-hidden">
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-3">
                <div>
                  <h2 className="font-mono text-lg">{selectedTable}</h2>
                  <p className="text-[11px] text-[var(--text-muted)]">{schema.length} columns · {currentTable?.row_count ?? data.total_count ?? 0} rows</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setSql(`ALTER TABLE ${selectedTableSqlName}\nADD COLUMN new_column TEXT;`); setActiveTab('sql'); }} className="rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-[11px] font-bold hover:bg-[var(--bg-hover)]">Add Column</button>
                  <button type="button" onClick={() => { setSql(`ALTER TABLE ${selectedTableSqlName}\nRENAME TO ${quoteIdent(`${selectedTable || 'table'}_new`)};`); setActiveTab('sql'); }} className="rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-[11px] font-bold hover:bg-[var(--bg-hover)]">Edit Table</button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full min-w-[760px] border-collapse text-left text-[12px]">
                  <thead className="sticky top-0 bg-[var(--bg-app)]">
                    <tr className="border-b border-[var(--border-subtle)] text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
                      {['#', 'Column name', 'Type', 'Nullable', 'Default', 'Constraints'].map((h) => <th key={h} className="px-4 py-2">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {schema.map((col, index) => (
                      <tr key={col.name} className="border-b border-[var(--border-subtle)]/50 hover:bg-[var(--bg-hover)]">
                        <td className="px-4 py-2 font-mono text-[var(--text-muted)]">{index + 1}</td>
                        <td className="px-4 py-2 font-mono font-semibold">{isPrimaryKey(col) && <Key size={12} className="mr-1 inline text-[var(--solar-yellow)]" />}{relations.some((r) => (r.from || r.source_column) === col.name) && <Link2 size={12} className="mr-1 inline text-[var(--color-accent,var(--solar-cyan))]" />}{col.name}</td>
                        <td className="px-4 py-2 font-mono text-[var(--color-accent,var(--solar-cyan))]">{col.type || 'TEXT'}</td>
                        <td className="px-4 py-2">{isNotNull(col) ? <span className="rounded bg-[var(--solar-red)]/10 px-2 py-0.5 text-[10px] font-black text-[var(--solar-red)]">NOT NULL</span> : <span className="text-[var(--text-muted)]">nullable</span>}</td>
                        <td className="px-4 py-2 font-mono text-[var(--text-muted)]">{columnDefault(col) ?? '-'}</td>
                        <td className="px-4 py-2">{isPrimaryKey(col) && <span className="rounded border border-[var(--solar-yellow)]/30 px-2 py-0.5 text-[10px] text-[var(--solar-yellow)]">primary key</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : activeTab === 'data' ? (
            <div className="flex h-full flex-col overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-app)] px-4 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => setDrawer('insert')} className="flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-[11px] font-bold text-[var(--color-accent,var(--solar-cyan))] hover:bg-[var(--bg-hover)]"><Plus size={12} /> Insert Row</button>
                  <button type="button" onClick={() => setInlineConfirmDelete(true)} disabled={selectedRows.size === 0} className="flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-[11px] font-bold text-[var(--solar-red)] hover:bg-[var(--bg-hover)] disabled:opacity-40"><Trash2 size={12} /> Delete Row</button>
                  <button type="button" onClick={() => selectedTable && loadData(selectedTable, page)} className="rounded-lg border border-[var(--border-subtle)] p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"><RefreshCw size={13} className={loadingMain ? 'animate-spin' : ''} /></button>
                  <button type="button" onClick={() => exportRows(data.rows, `${selectedTable || 'table'}.csv`)} className="flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-[11px] font-bold hover:bg-[var(--bg-hover)]"><Download size={12} /> Export CSV</button>
                  {inlineConfirmDelete && <span className="rounded-lg border border-[var(--solar-red)]/30 bg-[var(--solar-red)]/10 px-2 py-1 text-[11px] text-[var(--solar-red)]">Delete {selectedRows.size} rows? <button className="ml-2 font-bold" onClick={deleteSelectedRows}>confirm</button> <button className="ml-2" onClick={() => setInlineConfirmDelete(false)}>cancel</button></span>}
                </div>
                <div className="flex items-center gap-2">
                  <Filter size={12} className="text-[var(--text-muted)]" />
                  <select value={filters[0]?.col || ''} onChange={(e) => setFilters(e.target.value ? [{ id: 'f1', col: e.target.value, op: 'like', val: '' }] : [])} className="rounded border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-2 py-1 text-[11px]">
                    <option value="">Filter</option>
                    {schema.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                  {filters[0] && <select value={filters[0].op} onChange={(e) => setFilters([{ ...filters[0], op: e.target.value as FilterRule['op'] }])} className="rounded border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-2 py-1 text-[11px]">{OPS.map((op) => <option key={op}>{op}</option>)}</select>}
                  {filters[0] && !['is_null', 'not_null'].includes(filters[0].op) && <input value={filters[0].val} onChange={(e) => setFilters([{ ...filters[0], val: e.target.value }])} onKeyDown={(e) => e.key === 'Enter' && selectedTable && loadData(selectedTable, 1)} className="w-28 rounded border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-2 py-1 text-[11px]" />}
                </div>
              </div>
              {dataError && <div className="border-b border-[var(--solar-red)]/20 bg-[var(--solar-red)]/10 px-4 py-2 text-[12px] text-[var(--solar-red)]">{dataError}</div>}
              <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full min-w-max border-collapse text-left text-[12px]">
                  <thead className="sticky top-0 bg-[var(--bg-app)]">
                    <tr className="border-b border-[var(--border-subtle)] text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
                      <th className="px-3 py-2"><input type="checkbox" checked={data.rows.length > 0 && selectedRows.size === data.rows.length} onChange={(e) => setSelectedRows(e.target.checked ? new Set(data.rows.map((r, i) => String(r[pk] ?? i))) : new Set())} /></th>
                      {columns.map((col) => (
                        <th key={col} className="cursor-pointer px-3 py-2" onClick={() => { setSortCol(col); setSortDir(sortCol === col && sortDir === 'asc' ? 'desc' : 'asc'); selectedTable && loadData(selectedTable, 1); }}>{col}{sortCol === col ? ` ${sortDir}` : ''}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row, i) => {
                      const key = String(row[pk] ?? i);
                      return (
                        <tr key={key} className="border-b border-[var(--border-subtle)]/50 hover:bg-[var(--bg-hover)]">
                          <td className="px-3 py-1.5"><input type="checkbox" checked={selectedRows.has(key)} onChange={(e) => setSelectedRows((prev) => { const next = new Set(prev); e.target.checked ? next.add(key) : next.delete(key); return next; })} /></td>
                          {columns.map((col) => (
                            <td key={col} className="max-w-[300px] truncate border-r border-[var(--border-subtle)]/40 px-3 py-1.5 font-mono" onDoubleClick={() => setEditingCell({ rowKey: key, col, value: row[col] == null ? '' : String(row[col]) })}>
                              {editingCell?.rowKey === key && editingCell.col === col ? (
                                <input autoFocus value={editingCell.value} onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') void commitCell(); if (e.key === 'Escape') setEditingCell(null); }} onBlur={() => void commitCell()} className="w-full rounded border border-[var(--color-accent,var(--solar-cyan))] bg-[var(--bg-panel)] px-2 py-1 outline-none" />
                              ) : formatValue(row[col], col)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-[var(--border-subtle)] px-4 py-2 text-[11px] text-[var(--text-muted)]">
                <span>{data.total_count.toLocaleString()} rows · page {data.page} of {data.total_pages}</span>
                <div className="flex gap-2">
                  <button type="button" disabled={page <= 1} onClick={() => { const next = Math.max(1, page - 1); setPage(next); selectedTable && loadData(selectedTable, next); }} className="rounded border border-[var(--border-subtle)] px-2 py-1 disabled:opacity-40"><ChevronLeft size={12} /></button>
                  <input value={page} onChange={(e) => setPage(Math.max(1, Number(e.target.value) || 1))} onKeyDown={(e) => e.key === 'Enter' && selectedTable && loadData(selectedTable, page)} className="w-14 rounded border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-2 py-1 text-center font-mono" />
                  <button type="button" disabled={page >= data.total_pages} onClick={() => { const next = Math.min(data.total_pages, page + 1); setPage(next); selectedTable && loadData(selectedTable, next); }} className="rounded border border-[var(--border-subtle)] px-2 py-1 disabled:opacity-40"><ChevronRight size={12} /></button>
                </div>
              </div>
            </div>
          ) : activeTab === 'sql' ? (
            <div className="flex h-full overflow-hidden">
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-app)] px-4 py-2">
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => void runSql()} disabled={sqlRunning} className="flex items-center gap-2 rounded-lg border border-[var(--solar-green)]/30 bg-[var(--solar-green)]/10 px-3 py-1.5 text-[11px] font-bold text-[var(--solar-green)] disabled:opacity-50">{sqlRunning ? <Loader2 size={12} className="animate-spin" /> : <Code2 size={12} />} Run</button>
                    <button type="button" onClick={askAgentSam} className="flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-[11px] font-bold text-[var(--color-accent,var(--solar-cyan))] hover:bg-[var(--bg-hover)]"><Sparkles size={12} /> Ask Agent Sam</button>
                  </div>
                  <span className="font-mono text-[10px] text-[var(--text-muted)]">Cmd+Enter</span>
                </div>
                <div className="min-h-0 flex-1" style={{ background: 'var(--database-monaco-bg,var(--scene-bg))' }}>
                  <Editor height="100%" language="sql" theme="meauxcad-dark" value={sql} onChange={(value) => setSql(value || '')} onMount={(editor) => { editorRef.current = editor; }} options={{ minimap: { enabled: false }, fontSize: 13, lineHeight: 22, fontFamily: 'var(--font-mono, Menlo, Monaco, monospace)', scrollBeyondLastLine: false }} />
                </div>
                <div className="h-[34%] min-h-[180px] border-t border-[var(--border-subtle)]">
                  <div className="border-b border-[var(--border-subtle)] px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Results</div>
                  <div className="h-[calc(100%-29px)] overflow-auto p-3">
                    {sqlError ? <div className="rounded border border-[var(--solar-red)]/20 bg-[var(--solar-red)]/10 p-3 font-mono text-[12px] text-[var(--solar-red)]">{sqlError}</div> : sqlResults.length ? <table className="w-full min-w-max border-collapse text-left text-[12px]"><tbody>{sqlResults.map((row, i) => <tr key={i} className="border-b border-[var(--border-subtle)]/50">{Object.values(row).map((v, j) => <td key={j} className="px-3 py-1.5 font-mono">{formatValue(v)}</td>)}</tr>)}</tbody></table> : <p className="text-[12px] text-[var(--text-muted)]">Run a query to see results.</p>}
                  </div>
                </div>
              </div>
              <aside className="w-[260px] shrink-0 overflow-auto border-l border-[var(--border-subtle)] bg-[var(--bg-panel)] p-3">
                <h3 className="mb-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Query History</h3>
                {queryHistory.slice(0, 20).map((item) => <button key={item} type="button" onClick={() => setSql(item)} className="mb-1 block w-full truncate rounded px-2 py-1.5 text-left font-mono text-[11px] hover:bg-[var(--bg-hover)]">{item.replace(/\s+/g, ' ')}</button>)}
                <h3 className="mb-2 mt-4 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Saved Snippets</h3>
                {snippets.map((item) => <button key={item.id || item.title} type="button" onClick={() => setSql(item.sql_text || '')} className="mb-1 block w-full truncate rounded px-2 py-1.5 text-left text-[11px] hover:bg-[var(--bg-hover)]">{item.title || 'Untitled'}</button>)}
              </aside>
            </div>
          ) : activeTab === 'indexes' ? (
            <div className="h-full overflow-auto p-5">
              <button type="button" onClick={() => { setSql(`CREATE INDEX idx_${selectedTable}_column\nON ${selectedTableSqlName} (column_name);`); setActiveTab('sql'); }} className="mb-4 rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-[11px] font-bold text-[var(--color-accent,var(--solar-cyan))] hover:bg-[var(--bg-hover)]"><Plus size={12} className="mr-1 inline" /> Add Index</button>
              {indexes.map((idx) => <div key={idx.name} className="mb-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-3"><div className="font-mono text-sm">{idx.name}</div><pre className="mt-2 whitespace-pre-wrap text-[11px] text-[var(--text-muted)]">{idx.sql || 'auto index'}</pre></div>)}
            </div>
          ) : (
            <div className="h-full overflow-auto p-5">
              {relations.length ? relations.map((rel, i) => <div key={`${rel.from}-${rel.to}-${i}`} className="mb-3 flex items-center gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-3 font-mono text-[12px]"><Link2 size={14} className="text-[var(--color-accent,var(--solar-cyan))]" /><span>{rel.source_column || rel.from}</span><span className="text-[var(--text-muted)]">to</span><span>{rel.target_table || rel.table}.{rel.target_column || rel.to}</span></div>) : <p className="text-[12px] text-[var(--text-muted)]">No foreign keys found for this table.</p>}
            </div>
          )}
        </div>
      </main>

      {rightRailOpen ? (
        <aside className="flex w-[320px] shrink-0 flex-col border-l border-[var(--border-subtle)] bg-[var(--bg-panel)]">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
            <h2 className="text-[11px] font-black uppercase tracking-widest">Agent Sam Context</h2>
            <button type="button" onClick={() => setRightRailOpen(false)} className="text-[var(--text-muted)] hover:text-[var(--text-main)]"><PanelRightClose size={15} /></button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-4 text-[12px]">
            <button type="button" onClick={askAgentSam} className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--border-subtle)] px-3 py-2 font-bold text-[var(--color-accent,var(--solar-cyan))] hover:bg-[var(--bg-hover)]"><Sparkles size={13} /> Ask about this table</button>
            <div className="mb-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] p-3">
              <h3 className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]"><Activity size={12} /> Table Health</h3>
              <div className="flex justify-between"><span>Rows</span><span className="font-mono">{(currentTable?.row_count ?? data.total_count ?? 0).toLocaleString()}</span></div>
              <div className="flex justify-between"><span>Columns</span><span className="font-mono">{schema.length}</span></div>
              <div className="flex justify-between"><span>Indexes</span><span className="font-mono">{indexes.length}</span></div>
              <div className="mt-2 text-[var(--text-muted)]">Null % is estimated from the visible page.</div>
              {schema.slice(0, 6).map((col) => {
                const nulls = data.rows.filter((row) => row[col.name] == null).length;
                const pct = data.rows.length ? Math.round((nulls / data.rows.length) * 100) : 0;
                return <div key={col.name} className="mt-1 flex justify-between font-mono text-[11px]"><span className="truncate">{col.name}</span><span>{pct}% null</span></div>;
              })}
            </div>
            <div className="grid grid-cols-1 gap-2">
              <button type="button" onClick={() => { setSql(insertSql || `INSERT INTO ${selectedTableSqlName} (...) VALUES (...);`); setActiveTab('sql'); }} className="rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-left font-bold hover:bg-[var(--bg-hover)]"><Plus size={12} className="mr-2 inline" />Generate INSERT</button>
              <button type="button" onClick={() => { setSql(`SELECT * FROM ${selectedTableSqlName} LIMIT 50;`); setActiveTab('sql'); }} className="rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-left font-bold hover:bg-[var(--bg-hover)]"><TableIcon size={12} className="mr-2 inline" />Generate SELECT</button>
              <button type="button" onClick={askAgentSam} className="rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-left font-bold hover:bg-[var(--bg-hover)]"><Braces size={12} className="mr-2 inline" />Analyze</button>
            </div>
          </div>
        </aside>
      ) : (
        <button type="button" onClick={() => setRightRailOpen(true)} className="absolute right-3 top-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-2 text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"><PanelRightOpen size={15} /></button>
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
                <input value={insertValues[col.name] ?? ''} onChange={(e) => setInsertValues((prev) => ({ ...prev, [col.name]: e.target.value }))} placeholder={columnDefault(col) ? `default: ${columnDefault(col)}` : ''} className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] px-3 py-2 font-mono text-[12px] outline-none focus:border-[var(--color-accent,var(--solar-cyan))]" />
              </label>
            ))}
            <div>
              <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Generated SQL</p>
              <pre className="max-h-36 overflow-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] p-3 font-mono text-[11px] text-[var(--color-accent,var(--solar-cyan))]">{insertSql}</pre>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setDrawer(null)} className="rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-[11px] font-bold hover:bg-[var(--bg-hover)]">Cancel</button>
              <button type="button" onClick={() => void insertRow()} className="rounded-lg border border-[var(--color-accent,var(--solar-cyan))]/30 bg-[var(--color-accent,var(--solar-cyan))]/15 px-3 py-2 text-[11px] font-bold text-[var(--color-accent,var(--solar-cyan))]">Insert Row</button>
            </div>
          </div>
        </Drawer>
      )}

      {drawer === 'connect' && (
        <Drawer title="Connect Database" subtitle="Stored per tenant and user" onClose={() => setDrawer(null)}>
          <div className="space-y-3">
            {(['connection_type', 'display_name', 'host', 'port', 'database_name', 'username', 'password'] as const).map((field) => (
              <label key={field} className="block">
                <span className="mb-1 block text-[11px] font-bold capitalize">{field.replace(/_/g, ' ')}</span>
                <input type={field === 'password' ? 'password' : 'text'} value={connectionForm[field]} onChange={(e) => setConnectionForm((prev) => ({ ...prev, [field]: e.target.value }))} className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] px-3 py-2 font-mono text-[12px] outline-none focus:border-[var(--color-accent,var(--solar-cyan))]" />
              </label>
            ))}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => fetchJson('/api/db/connections/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(connectionForm) }).catch((e) => setDataError(e.message))} className="rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-[11px] font-bold hover:bg-[var(--bg-hover)]">Test Connection</button>
              <button type="button" onClick={() => fetchJson('/api/db/connections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(connectionForm) }).then(() => { setDrawer(null); void loadConnections(); }).catch((e) => setDataError(e.message))} className="rounded-lg border border-[var(--color-accent,var(--solar-cyan))]/30 bg-[var(--color-accent,var(--solar-cyan))]/15 px-3 py-2 text-[11px] font-bold text-[var(--color-accent,var(--solar-cyan))]">Save</button>
            </div>
          </div>
        </Drawer>
      )}

      {loadingMain && <div className="pointer-events-none absolute left-[240px] top-0 flex items-center gap-2 rounded-br-lg border-b border-r border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2 text-[11px] text-[var(--text-muted)]"><Loader2 size={12} className="animate-spin" /> Loading</div>}
      {dataError && <div className="absolute bottom-3 left-1/2 flex max-w-xl -translate-x-1/2 items-center gap-2 rounded-lg border border-[var(--solar-red)]/30 bg-[var(--bg-panel)] px-3 py-2 text-[12px] text-[var(--solar-red)]"><AlertTriangle size={13} /> {dataError}<button onClick={() => setDataError(null)}><X size={12} /></button></div>}
    </div>
  );
};

export default DatabasePage;
