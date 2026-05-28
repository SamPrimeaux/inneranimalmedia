import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ChevronRight,
  Database,
  HardDrive,
  Layers,
  Loader2,
  MessageSquare,
  Search,
  Terminal,
  Workflow,
  LayoutGrid,
  FileText,
} from 'lucide-react';
import { IAM_AGENT_CHAT_CONVERSATION_CHANGE, LS_AGENT_CHAT_CONVERSATION_ID } from '../agentChatConstants';
import { SetiFileIcon } from '../src/components/SetiFileIcon';
import {
  WRANGLER_CATEGORY_LABELS,
  filterWranglerCatalog,
  groupWranglerCatalog,
  normalizeCommandRow,
  type WranglerCatalogEntry,
  type WranglerCommandCategory,
} from '../lib/wranglerCommandCatalog';

export type UnifiedSearchNavigate =
  | { kind: 'table'; name: string }
  | { kind: 'conversation'; id: string }
  | { kind: 'knowledge'; url: string | null; label: string }
  | { kind: 'sql'; sql: string }
  | { kind: 'deployment'; summary: string }
  | { kind: 'column'; sql: string }
  | { kind: 'file'; path: string };

type SourceChipId = 'all' | 'r2' | 'd1' | 'commands' | 'workflows' | 'chats';

type PaletteCategory =
  | 'resource'
  | 'r2'
  | 'd1'
  | 'chat'
  | 'deploy'
  | 'command'
  | 'workflow'
  | 'file'
  | 'tip'
  | 'search';

type PaletteItem = {
  id: string;
  category: PaletteCategory;
  title: string;
  subtitle?: string;
  bound?: boolean;
  objectCount?: number | null;
  commandText?: string;
  conversationId?: string;
  workflowKey?: string;
  r2Bucket?: string;
  dbTarget?: 'd1' | 'hyperdrive';
  filePath?: string;
  deploySummary?: string;
  commandCategory?: WranglerCommandCategory;
  /** Unified-search row passthrough */
  legacyRow?: LegacyUnifiedRow;
};

type CommandSection = { key: string; label: string; rows: PaletteItem[] };

type LegacyUnifiedRow = {
  type: string;
  id: string;
  title: string;
  subtitle?: string;
  sql_text?: string;
  url?: string | null;
  summary?: string;
};

type QueryMode = 'default' | 'r2' | 'd1' | 'command' | 'workflow' | 'file' | 'search';

const SOURCE_CHIPS: { id: SourceChipId; label: string; Icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { id: 'all', label: 'All', Icon: LayoutGrid },
  { id: 'r2', label: 'R2', Icon: HardDrive },
  { id: 'd1', label: 'D1', Icon: Database },
  { id: 'commands', label: 'Commands', Icon: Terminal },
  { id: 'workflows', label: 'Workflows', Icon: Workflow },
  { id: 'chats', label: 'Chats', Icon: MessageSquare },
];

const SEARCH_TIPS: PaletteItem[] = [
  { id: 'tip-r2', category: 'tip', title: 'r2:', subtitle: 'Search R2 buckets' },
  { id: 'tip-d1', category: 'tip', title: 'd1:', subtitle: 'D1 & data stores' },
  { id: 'tip-cmd', category: 'tip', title: '/', subtitle: 'Wrangler commands (R2, D1, KV, Workers…)' },
  { id: 'tip-wf', category: 'tip', title: 'wf', subtitle: 'D1 agentsam_workflows' },
  { id: 'tip-at', category: 'tip', title: '@', subtitle: 'Recent files' },
];

function catalogEntryToPalette(c: WranglerCatalogEntry): PaletteItem {
  return {
    id: c.id,
    category: 'command',
    title: c.display_name,
    subtitle: c.mapped_command,
    commandText: c.mapped_command,
    commandCategory: c.category,
  };
}

function mergeCommandCatalog(
  apiRows: Record<string, unknown>[],
  searchTerm: string,
  limit = 80,
): WranglerCatalogEntry[] {
  const byCmd = new Map<string, WranglerCatalogEntry>();
  for (const raw of apiRows) {
    const n = normalizeCommandRow(raw);
    if (n) byCmd.set(n.mapped_command.toLowerCase(), n);
  }
  for (const c of filterWranglerCatalog(searchTerm, limit)) {
    if (!byCmd.has(c.mapped_command.toLowerCase())) byCmd.set(c.mapped_command.toLowerCase(), c);
  }
  return [...byCmd.values()].sort((a, b) => (a.sort_order ?? 50) - (b.sort_order ?? 0));
}

function parseQueryMode(raw: string): { mode: QueryMode; term: string } {
  const q = raw.trim();
  const lower = q.toLowerCase();
  if (lower.startsWith('r2:')) return { mode: 'r2', term: q.slice(3).trim() };
  if (lower === 'r2' || lower.startsWith('r2 ')) return { mode: 'r2', term: q.replace(/^r2\s*/i, '').trim() };
  if (lower.startsWith('d1:')) return { mode: 'd1', term: q.slice(3).trim() };
  if (lower === 'd1' || lower.startsWith('d1 ')) return { mode: 'd1', term: q.replace(/^d1\s*/i, '').trim() };
  if (q.startsWith('/')) return { mode: 'command', term: q.slice(1).trim() };
  if (lower.startsWith('wf:') || lower === 'wf' || lower.startsWith('wf ')) {
    return { mode: 'workflow', term: q.replace(/^wf:?/i, '').trim() };
  }
  if (q.startsWith('@')) return { mode: 'file', term: q.slice(1).trim() };
  if (q.length >= 2) return { mode: 'search', term: q };
  return { mode: 'default', term: q };
}

function chipMatchesCategory(chip: SourceChipId, category: PaletteCategory): boolean {
  if (chip === 'all') return category !== 'tip';
  if (chip === 'r2') return category === 'r2' || category === 'resource';
  if (chip === 'd1') return category === 'd1';
  if (chip === 'commands') return category === 'command';
  if (chip === 'workflows') return category === 'workflow';
  if (chip === 'chats') return category === 'chat';
  return true;
}

function matchesTerm(item: PaletteItem, term: string): boolean {
  if (!term) return true;
  const hay = `${item.title} ${item.subtitle || ''}`.toLowerCase();
  return hay.includes(term.toLowerCase());
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function fetchBoundR2Buckets(): Promise<string[]> {
  const fromBuckets = await fetchJson<{ buckets?: string[] }>('/api/r2/buckets');
  if (fromBuckets?.buckets?.length) return fromBuckets.buckets.map(String);
  const fromList = await fetchJson<{ buckets?: string[] }>('/api/r2/list?buckets=true');
  if (fromList?.buckets?.length) return fromList.buckets.map(String);
  return [];
}

async function fetchAllR2BucketNames(): Promise<{ name: string; bound: boolean; object_count?: number }[]> {
  const bound = await fetchBoundR2Buckets();
  const boundSet = new Set(bound);
  let account: string[] = [];

  const fromAll = await fetchJson<{ buckets?: string[]; bucket_names?: string[] }>(
    '/api/r2/list?buckets=true&all=true',
  );
  if (fromAll) {
    account = (fromAll.buckets || fromAll.bucket_names || []).map(String);
  }
  if (!account.length) {
    const storage = await fetchJson<{ buckets?: { storage_name?: string; bucket_name?: string; object_count?: number }[] }>(
      '/api/storage/buckets',
    );
    if (storage?.buckets?.length) {
      account = storage.buckets
        .map((b) => String(b.storage_name || b.bucket_name || '').trim())
        .filter(Boolean);
    }
  }

  const merged: string[] = [...bound];
  for (const n of account) {
    if (!boundSet.has(n)) merged.push(n);
  }

  const withCounts = await Promise.all(
    merged.slice(0, 80).map(async (name) => {
      const stats = await fetchJson<{ object_count?: number }>(
        `/api/r2/stats?bucket=${encodeURIComponent(name)}`,
      );
      return {
        name,
        bound: boundSet.has(name),
        object_count: typeof stats?.object_count === 'number' ? stats.object_count : undefined,
      };
    }),
  );
  return withCounts;
}

function sortBuckets(
  rows: { name: string; bound: boolean }[],
  term: string,
): { name: string; bound: boolean; object_count?: number }[] {
  const t = term.toLowerCase();
  const filtered = t ? rows.filter((r) => r.name.toLowerCase().includes(t)) : rows;
  const bound = filtered.filter((r) => r.bound);
  const rest = filtered.filter((r) => !r.bound).sort((a, b) => a.name.localeCompare(b.name));
  return [...bound, ...rest];
}

function buildDefaultDataStores(): PaletteItem[] {
  return [
    {
      id: 'db-d1',
      category: 'd1',
      title: 'inneranimalmedia-business',
      subtitle: 'Cloudflare D1 · bound Worker database',
      dbTarget: 'd1',
    },
    {
      id: 'db-hyperdrive',
      category: 'd1',
      title: 'Supabase (Hyperdrive)',
      subtitle: 'Postgres mirror · session-scoped',
      dbTarget: 'hyperdrive',
    },
    {
      id: 'db-vectorize',
      category: 'd1',
      title: 'Vectorize',
      subtitle: 'Embeddings index · tenant registry',
    },
    {
      id: 'db-autorag',
      category: 'd1',
      title: 'AutoRAG',
      subtitle: 'RAG pipeline · autorag bucket',
    },
  ];
}

function normalizeLegacySearchRows(data: Record<string, unknown>): LegacyUnifiedRow[] {
  const ranked = data.results;
  if (!Array.isArray(ranked)) return [];
  const out: LegacyUnifiedRow[] = [];
  for (const raw of ranked) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const type = String(r.type || '');
    out.push({
      type,
      id: String(r.id ?? r.path ?? ''),
      title: String(r.title ?? ''),
      subtitle: r.subtitle != null ? String(r.subtitle) : undefined,
      sql_text: r.sql_text != null ? String(r.sql_text) : undefined,
      url: r.url != null ? String(r.url) : null,
      summary: r.summary != null ? String(r.summary) : undefined,
    });
  }
  return out;
}

function legacyToPalette(row: LegacyUnifiedRow): PaletteItem | null {
  const id = `${row.type}-${row.id}`;
  switch (row.type) {
    case 'deployment':
      return {
        id,
        category: 'deploy',
        title: row.title,
        subtitle: row.subtitle,
        deploySummary: row.summary || row.subtitle || row.title,
        legacyRow: row,
      };
    case 'conversation':
      return {
        id,
        category: 'chat',
        title: row.title,
        subtitle: row.subtitle,
        conversationId: row.id,
        legacyRow: row,
      };
    case 'command':
      return {
        id,
        category: 'command',
        title: row.title,
        subtitle: row.subtitle,
        commandText: row.sql_text || row.title,
        legacyRow: row,
      };
    case 'workspace':
    case 'branch':
    case 'repo':
      return {
        id,
        category: 'search',
        title: row.title,
        subtitle: row.subtitle || row.type,
        legacyRow: row,
      };
    default:
      if (row.type === 'table' || row.type === 'snippet' || row.type === 'query' || row.type === 'column') {
        return {
          id,
          category: 'search',
          title: row.title,
          subtitle: row.subtitle || row.type,
          legacyRow: row,
        };
      }
      return {
        id,
        category: 'search',
        title: row.title,
        subtitle: row.subtitle,
        legacyRow: row,
      };
  }
}

function sectionTitle(mode: QueryMode, chip: SourceChipId, hasQuery: boolean): string | null {
  if (!hasQuery && mode === 'default') return null;
  if (mode === 'r2') return 'R2 Buckets';
  if (mode === 'd1') return 'Databases';
  if (mode === 'command') return 'Commands';
  if (mode === 'workflow') return 'Workflows';
  if (mode === 'file') return 'Files';
  if (chip !== 'all') return SOURCE_CHIPS.find((c) => c.id === chip)?.label ?? 'Results';
  return 'Results';
}

function rowIcon(category: PaletteCategory) {
  switch (category) {
    case 'r2':
    case 'resource':
      return HardDrive;
    case 'd1':
      return Database;
    case 'command':
      return Terminal;
    case 'workflow':
      return Workflow;
    case 'chat':
      return MessageSquare;
    case 'deploy':
      return Layers;
    case 'file':
      return FileText;
    default:
      return Search;
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
  initialQuery?: string;
  onInitialQueryConsumed?: () => void;
}> = ({
  workspaceLabel,
  recentFiles = [],
  onNavigate,
  onRunCommand: _onRunCommand,
  controlledOpen,
  onControlledOpenChange,
  initialFacets,
  initialQuery,
  onInitialQueryConsumed,
}) => {
  const navigate = useNavigate();
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
  const [items, setItems] = useState<PaletteItem[]>([]);
  const [recentSearches, setRecentSearches] = useState<PaletteItem[]>([]);
  const [active, setActive] = useState(0);
  const [sourceChip, setSourceChip] = useState<SourceChipId>('all');
  const [commandSections, setCommandSections] = useState<CommandSection[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [bucketMenuOpen, setBucketMenuOpen] = useState(false);
  const [bucketMenuRows, setBucketMenuRows] = useState<{ name: string; bound: boolean }[]>([]);
  const [bucketMenuLoading, setBucketMenuLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const bucketMenuRef = useRef<HTMLDivElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { mode, term } = useMemo(() => parseQueryMode(q), [q]);

  useEffect(() => {
    if (!open) return;
    if (initialQuery) {
      setQ(initialQuery);
      onInitialQueryConsumed?.();
    }
    if (initialFacets?.length) {
      const map: Record<string, SourceChipId> = {
        d1: 'd1',
        commands: 'commands',
        codebase: 'all',
        scripts: 'commands',
      };
      const first = initialFacets.map((f) => map[f]).find(Boolean);
      if (first) setSourceChip(first);
    }
    setActive(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open, initialFacets, initialQuery, onInitialQueryConsumed]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const loadDefault = useCallback(async () => {
    setLoading(true);
    try {
      const [buckets, sessions, deploys, vectors, recentRes] = await Promise.all([
        fetchBoundR2Buckets(),
        fetchJson<
          { id?: string; name?: string; message_count?: number; started_at?: number }[]
        >('/api/agent/sessions?limit=5').then((d) => (Array.isArray(d) ? d : [])),
        fetchJson<{ deployments?: { worker_name?: string; environment?: string; status?: string; deployed_at?: string; deployment_notes?: string }[] }>(
          '/api/overview/deployments?limit=5',
        ).then((d) => (d?.deployments || []).slice(0, 5)),
        fetchJson<{ indexes?: { display_name?: string; binding_name?: string; index_name?: string }[] }>(
          '/api/storage/vectors',
        ),
        fetch('/api/unified-search/recent', { credentials: 'same-origin' }),
      ]);

      const recentItems: PaletteItem[] = [];
      if (recentRes.ok) {
        const recentJson = (await recentRes.json()) as {
          items?: { query?: string; result_kind?: string }[];
        };
        for (const [i, row] of (recentJson.items || []).entries()) {
          const queryText = String(row?.query || '').trim();
          if (!queryText) continue;
          recentItems.push({
            id: `recent-${i}-${queryText.slice(0, 40)}`,
            category: 'search',
            title: queryText,
            subtitle: row.result_kind ? `Last opened: ${row.result_kind}` : 'Recent search',
          });
        }
      }
      setRecentSearches(recentItems);

      const resourceRows: PaletteItem[] = buckets.slice(0, 6).map((name) => ({
        id: `res-r2-${name}`,
        category: 'resource',
        title: name,
        subtitle: 'R2 bucket · Worker binding',
        r2Bucket: name,
        bound: true,
      }));

      const stores = buildDefaultDataStores();
      if (vectors?.indexes?.[0]) {
        const vx = vectors.indexes[0];
        stores[2] = {
          ...stores[2],
          title: vx.display_name || vx.index_name || vx.binding_name || 'Vectorize',
          subtitle: `${vx.binding_name || 'VECTORIZE'} · embeddings`,
        };
      }

      const chatRows: PaletteItem[] = sessions.slice(0, 5).map((s) => ({
        id: `chat-${s.id}`,
        category: 'chat',
        title: String(s.name || 'Conversation'),
        subtitle:
          typeof s.message_count === 'number'
            ? `${s.message_count} messages`
            : s.started_at
              ? new Date(s.started_at * 1000).toLocaleString()
              : undefined,
        conversationId: String(s.id || ''),
      }));

      const deployRows: PaletteItem[] = deploys.map((d, i) => {
        const title = [d.worker_name, d.environment].filter(Boolean).join(' · ') || 'Deployment';
        const summary = [d.status, d.deployed_at, d.deployment_notes].filter(Boolean).join(' — ');
        return {
          id: `deploy-${i}-${title}`,
          category: 'deploy',
          title,
          subtitle: summary,
          deploySummary: summary || title,
        };
      });

      setItems([...resourceRows, ...stores, ...chatRows, ...deployRows]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadR2 = useCallback(async (searchTerm: string) => {
    setLoading(true);
    try {
      const rows = await fetchAllR2BucketNames();
      const sorted = sortBuckets(rows, searchTerm);
      setItems(
        sorted.map((b) => ({
          id: `r2-${b.name}`,
          category: 'r2',
          title: b.name,
          subtitle: b.bound ? 'Bound to this Worker' : 'Account bucket',
          bound: b.bound,
          objectCount: b.object_count ?? null,
          r2Bucket: b.name,
        })),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadD1 = useCallback(async (searchTerm: string) => {
    setLoading(true);
    try {
      const stores = buildDefaultDataStores().filter((s) => matchesTerm(s, searchTerm));
      const tableRows: PaletteItem[] = [];
      const tables = await fetchJson<{ tables?: { name: string }[] }>('/api/d1/tables');
      if (tables?.tables?.length) {
        for (const t of tables.tables.slice(0, 12)) {
          const name = String(t.name || '');
          if (!name || (searchTerm && !name.toLowerCase().includes(searchTerm.toLowerCase()))) continue;
          tableRows.push({
            id: `d1-table-${name}`,
            category: 'd1',
            title: name,
            subtitle: 'D1 table · inneranimalmedia-business',
            dbTarget: 'd1',
          });
        }
      }
      setItems([...stores, ...tableRows]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCommands = useCallback(async (searchTerm: string) => {
    setLoading(true);
    try {
      const chipCategory =
        sourceChip === 'r2'
          ? 'r2'
          : sourceChip === 'd1'
            ? 'd1'
            : sourceChip === 'workflows'
              ? 'workflows'
              : '';
      const qs = new URLSearchParams({ limit: '80' });
      if (searchTerm) qs.set('q', searchTerm);
      if (chipCategory && chipCategory !== 'workflows') qs.set('category', chipCategory);

      const primary = await fetchJson<{ commands?: Record<string, unknown>[] }>(`/api/commands?${qs}`);
      const apiRows = Array.isArray(primary?.commands) ? primary.commands : [];

      const merged = mergeCommandCatalog(apiRows, searchTerm, 80);
      const grouped = groupWranglerCatalog(merged);
      const sections: CommandSection[] = grouped.map((g) => ({
        key: g.category,
        label: g.label,
        rows: g.rows.map(catalogEntryToPalette),
      }));

      setCommandSections(sections);
      setItems(sections.flatMap((s) => s.rows));
    } finally {
      setLoading(false);
    }
  }, [sourceChip]);

  const loadWorkflows = useCallback(async (searchTerm: string) => {
    setLoading(true);
    try {
      let rows: { id?: string; workflow_key?: string; display_name?: string; description?: string }[] = [];

      const primary = await fetchJson<typeof rows | { workflows?: typeof rows }>(
        `/api/workflows?limit=10${searchTerm ? `&q=${encodeURIComponent(searchTerm)}` : ''}`,
      );
      if (Array.isArray(primary)) rows = primary;
      else if (primary && typeof primary === 'object' && Array.isArray((primary as { workflows?: typeof rows }).workflows)) {
        rows = (primary as { workflows: typeof rows }).workflows;
      }

      if (!rows.length) {
        const fallback = await fetchJson<typeof rows>('/api/agentsam/workflows');
        if (Array.isArray(fallback)) rows = fallback;
      }

      const filtered = rows
        .filter((w) => {
          if (!searchTerm) return true;
          const hay = `${w.workflow_key || ''} ${w.display_name || ''} ${w.description || ''}`.toLowerCase();
          return hay.includes(searchTerm.toLowerCase());
        })
        .slice(0, 10);

      setItems(
        filtered.map((w) => ({
          id: `wf-${w.id || w.workflow_key}`,
          category: 'workflow',
          title: String(w.display_name || w.workflow_key || 'Workflow'),
          subtitle: w.workflow_key || w.description || undefined,
          workflowKey: String(w.workflow_key || w.id || ''),
        })),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFiles = useCallback(
    async (searchTerm: string) => {
      setLoading(true);
      try {
        const local: PaletteItem[] = recentFiles
          .filter((f) => !searchTerm || `${f.name} ${f.path}`.toLowerCase().includes(searchTerm.toLowerCase()))
          .slice(0, 8)
          .map((f) => ({
            id: `file-local-${f.path}`,
            category: 'file',
            title: f.name,
            subtitle: f.label || f.path,
            filePath: f.path,
          }));

        let remote: PaletteItem[] = [];
        if (searchTerm.length >= 2) {
          const res = await fetch('/api/unified-search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ query: searchTerm, limit: 12, source_filters: ['codebase'] }),
          });
          const data = res.ok ? await res.json() : {};
          remote = normalizeLegacySearchRows(data as Record<string, unknown>)
            .filter((r) => r.type === 'knowledge' || r.type === 'file')
            .map((r) =>
              legacyToPalette(r),
            )
            .filter((x): x is PaletteItem => !!x)
            .map((r) => ({ ...r, category: 'file' as const, filePath: r.legacyRow?.url || r.title }));
        }

        setItems([...local, ...remote]);
      } finally {
        setLoading(false);
      }
    },
    [recentFiles],
  );

  const loadUnifiedSearch = useCallback(
    async (searchTerm: string, chip: SourceChipId) => {
      setLoading(true);
      try {
        const sourceMap: Record<SourceChipId, string[] | undefined> = {
          all: undefined,
          r2: ['codebase'],
          d1: ['d1'],
          commands: ['commands'],
          workflows: ['codebase'],
          chats: ['memory'],
        };
        const filters = sourceMap[chip];

        let legacy: LegacyUnifiedRow[] = [];
        const getUrl = `/api/unified-search?q=${encodeURIComponent(searchTerm)}&sources=all`;
        const getRes = await fetch(getUrl, { credentials: 'same-origin' });
        if (getRes.ok) {
          legacy = normalizeLegacySearchRows((await getRes.json()) as Record<string, unknown>);
        } else {
          const res = await fetch('/api/unified-search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
              query: searchTerm,
              limit: 24,
              ...(filters ? { source_filters: filters } : {}),
            }),
          });
          if (res.ok) legacy = normalizeLegacySearchRows((await res.json()) as Record<string, unknown>);
        }

        const palette = legacy.map(legacyToPalette).filter((x): x is PaletteItem => !!x);
        if (chip === 'all') {
          setItems(palette);
          return;
        }
        setItems(palette.filter((p) => chipMatchesCategory(chip, p.category)));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const runQuery = useCallback(async () => {
    if (mode === 'default') {
      if (sourceChip === 'commands') {
        await loadCommands('');
        return;
      }
      setCommandSections([]);
      await loadDefault();
      return;
    }
    if (mode === 'r2') {
      await loadR2(term);
      return;
    }
    if (mode === 'd1') {
      await loadD1(term);
      return;
    }
    if (mode === 'command') {
      await loadCommands(term);
      return;
    }
    if (mode === 'workflow') {
      await loadWorkflows(term);
      return;
    }
    if (mode === 'file') {
      await loadFiles(term);
      return;
    }
    if (sourceChip === 'commands') {
      await loadCommands(term);
      return;
    }
    await loadUnifiedSearch(term, sourceChip);
  }, [mode, term, sourceChip, loadDefault, loadR2, loadD1, loadCommands, loadWorkflows, loadFiles, loadUnifiedSearch]);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void runQuery(), mode === 'default' ? 0 : 180);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [open, q, mode, sourceChip, runQuery]);

  const closePalette = useCallback(() => {
    setOpen(false);
    setQ('');
    setItems([]);
    setRecentSearches([]);
    setCommandSections([]);
    setSourceChip('all');
    setActive(0);
  }, []);

  const openR2Bucket = useCallback((bucket: string) => {
    try {
      sessionStorage.setItem('iam-palette-r2-bucket', bucket);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent('iam-sidebar-toggle', { detail: { activity: 'remote', r2Bucket: bucket } }));
  }, []);

  const loadBucketMenu = useCallback(async () => {
    setBucketMenuLoading(true);
    try {
      const rows = await fetchAllR2BucketNames();
      setBucketMenuRows(rows);
    } catch (e) {
      console.error('Failed to load R2 bucket menu:', e);
    } finally { // Preserve existing rows on transient failure
      setBucketMenuLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!bucketMenuOpen) return;
    void loadBucketMenu();
  }, [bucketMenuOpen, loadBucketMenu]);

  useEffect(() => {
    if (!bucketMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (bucketMenuRef.current?.contains(e.target as Node)) return;
      setBucketMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [bucketMenuOpen]);

  const openDatabase = useCallback((target?: 'd1' | 'hyperdrive') => {
    try {
      if (target) sessionStorage.setItem('iam-palette-db-target', target);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent('iam-sidebar-toggle', { detail: { activity: 'database', dbTarget: target } }));
  }, []);

  const applyItem = useCallback(
    (item: PaletteItem, searchQuery: string) => {
      if (item.category === 'tip' || item.category === 'search') {
        setQ(item.title);
        return;
      }

      void fetch('/api/unified-search/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          query: searchQuery,
          result_kind: item.category,
          search_type: item.category,
          opened_id: item.id,
          clicked_result_id: item.id,
          source: 'dashboard',
        }),
      }).catch(() => {});

      if (item.category === 'r2' || (item.category === 'resource' && item.r2Bucket)) {
        openR2Bucket(item.r2Bucket || item.title);
        closePalette();
        return;
      }

      if (item.category === 'd1') {
        if (item.id.startsWith('d1-table-')) {
          onNavigate({ kind: 'table', name: item.title }, searchQuery);
        } else {
          openDatabase(item.dbTarget);
        }
        closePalette();
        return;
      }

      if (item.category === 'chat' && item.conversationId) {
        try {
          localStorage.setItem(LS_AGENT_CHAT_CONVERSATION_ID, item.conversationId);
        } catch {
          /* ignore */
        }
        window.dispatchEvent(
          new CustomEvent(IAM_AGENT_CHAT_CONVERSATION_CHANGE, { detail: { id: item.conversationId } }),
        );
        onNavigate({ kind: 'conversation', id: item.conversationId }, searchQuery);
        closePalette();
        return;
      }

      if (item.category === 'deploy') {
        navigate('/dashboard/analytics/deploys');
        closePalette();
        return;
      }

      if (item.category === 'command' && item.commandText) {
        void navigator.clipboard?.writeText(item.commandText).catch(() => {});
        setToast('Copied to clipboard');
        closePalette();
        return;
      }

      if (item.category === 'workflow' && item.workflowKey) {
        navigate('/dashboard/workflows');
        closePalette();
        return;
      }

      if (item.category === 'file' && item.filePath) {
        onNavigate({ kind: 'knowledge', url: item.filePath, label: item.title }, searchQuery);
        closePalette();
        return;
      }

      if (item.legacyRow) {
        const row = item.legacyRow;
        if (row.type === 'conversation' && row.id) {
          onNavigate({ kind: 'conversation', id: row.id }, searchQuery);
        } else if (row.type === 'table') {
          onNavigate({ kind: 'table', name: row.id }, searchQuery);
        } else if ((row.type === 'snippet' || row.type === 'query' || row.type === 'column') && row.sql_text) {
          onNavigate({ kind: row.type === 'column' ? 'column' : 'sql', sql: row.sql_text }, searchQuery);
        } else if (row.type === 'deployment') {
          navigate('/dashboard/analytics/deploys');
        } else {
          onNavigate({ kind: 'knowledge', url: row.url ?? null, label: row.title }, searchQuery);
        }
        closePalette();
        return;
      }

      closePalette();
    },
    [closePalette, navigate, onNavigate, openDatabase, openR2Bucket],
  );

  const displaySections = useMemo(() => {
    if ((mode === 'command' || (mode === 'default' && sourceChip === 'commands')) && commandSections.length > 0) {
      return commandSections;
    }

    const filtered = items.filter((item) => {
      if (item.category === 'tip') return mode === 'default' && !q.trim();
      if (mode !== 'default' && mode !== 'search') return true;
      if (mode === 'search') return chipMatchesCategory(sourceChip, item.category);
      return chipMatchesCategory(sourceChip, item.category);
    });

    if (mode === 'default' && !q.trim()) {
      const resources = filtered.filter((i) => i.category === 'resource' || i.category === 'd1');
      const chats = filtered.filter((i) => i.category === 'chat');
      const deploys = filtered.filter((i) => i.category === 'deploy');
      const tips = SEARCH_TIPS;
      return [
        ...(recentSearches.length
          ? [{ key: 'recent', label: 'Recent searches', rows: recentSearches }]
          : []),
        { key: 'resources', label: 'Resources', rows: resources },
        { key: 'chats', label: 'Recent chats', rows: chats },
        { key: 'deploys', label: 'Recent deploys', rows: deploys },
        { key: 'tips', label: 'Search tips', rows: tips },
      ].filter((s) => s.rows.length > 0);
    }

    const title = sectionTitle(mode, sourceChip, !!q.trim());
    return [{ key: 'main', label: title || 'Results', rows: filtered }];
  }, [items, mode, q, sourceChip, commandSections, recentSearches]);

  const flatList = useMemo(() => displaySections.flatMap((s) => s.rows), [displaySections]);

  useEffect(() => {
    setActive(0);
  }, [flatList.length, q, sourceChip, mode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        closePalette();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, closePalette]);

  /** Click-outside closes palette — no fullscreen blur scrim (Cursor-style anchored dropdown). */
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (paletteRef.current?.contains(e.target as Node)) return;
      closePalette();
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open, closePalette]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(0, flatList.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && flatList.length > 0) {
      e.preventDefault();
      const item = flatList[active];
      if (item) applyItem(item, q.trim());
    }
  };

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  let rowIndex = -1;

  return (
    <div ref={paletteRef} className="nav-search-container w-full max-w-lg min-w-0">
      <div className="flex items-stretch w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-app)] hover:border-[var(--solar-cyan)]/40 transition-colors overflow-hidden">
        <div ref={bucketMenuRef} className="relative shrink-0 max-w-[45%] border-r border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={() => setBucketMenuOpen((o) => !o)}
            className="flex items-center gap-1 px-2 py-1.5 text-left w-full min-w-0 hover:bg-[var(--bg-hover)] transition-colors"
            aria-expanded={bucketMenuOpen}
            aria-haspopup="listbox"
            title="R2 buckets"
          >
            <HardDrive size={13} className="shrink-0 opacity-70 text-[var(--text-muted)]" />
            <span className="text-[11px] text-[var(--text-muted)] truncate">
              <span className="text-[var(--text-main)] font-medium">{workspaceLabel?.trim() || 'dashboard'}</span>
            </span>
            <ChevronRight
              size={12}
              className={`shrink-0 text-[var(--text-muted)] transition-transform ${bucketMenuOpen ? 'rotate-90' : ''}`}
            />
          </button>
          {bucketMenuOpen ? (
            <div
              role="listbox"
              className="absolute top-full left-0 mt-1 z-[60] min-w-[220px] max-w-[min(320px,90vw)] max-h-[min(280px,50vh)] overflow-y-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] shadow-xl py-1"
            >
              {bucketMenuLoading ? (
                <div className="px-3 py-2 text-[11px] text-[var(--text-muted)] flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" /> Loading buckets…
                </div>
              ) : bucketMenuRows.length === 0 ? (
                <div className="px-3 py-2 text-[11px] text-[var(--text-muted)]">No buckets</div>
              ) : (
                bucketMenuRows.map((b) => (
                  <button
                    key={b.name}
                    type="button"
                    role="option"
                    className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-[var(--bg-hover)] flex items-center justify-between gap-2"
                    onClick={() => {
                      openR2Bucket(b.name);
                      setBucketMenuOpen(false);
                    }}
                  >
                    <span className="truncate text-[var(--text-main)]">{b.name}</span>
                    {b.bound ? (
                      <span className="shrink-0 text-[9px] uppercase tracking-wide text-[var(--solar-cyan)]">bound</span>
                    ) : null}
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex flex-1 items-center gap-2 min-w-0 px-2 py-1.5 text-left hover:bg-[var(--bg-hover)] transition-colors"
          title="Search (Cmd+K)"
        >
          <Search size={14} className="shrink-0 opacity-70 text-[var(--text-muted)]" />
          <span className="text-[11px] text-[var(--text-muted)] truncate flex-1">Search…</span>
          <kbd className="hidden xl:inline text-[9px] font-mono px-1 py-px rounded border border-[var(--border-subtle)] text-[var(--text-muted)] shrink-0">
            {isMac ? 'Cmd' : 'Ctrl'}+K
          </kbd>
        </button>
      </div>

      {open && (
          <div
            className="nav-dropdown rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] shadow-2xl overflow-hidden flex flex-col max-h-[min(70vh,520px)]"
            role="dialog"
            aria-label="Command palette"
          >
            <div className="px-3 py-2.5 border-b border-[var(--border-subtle)] space-y-2">
              <div className="flex items-center gap-2">
                <Search size={16} className="text-[var(--text-muted)] shrink-0" />
                <input
                  ref={inputRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Search buckets, D1, commands, chats…"
                  className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[13px] text-[var(--text-main)] placeholder:text-[var(--text-muted)]"
                />
                <kbd className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-[var(--border-subtle)] text-[var(--text-muted)] shrink-0">
                  Esc
                </kbd>
                {loading ? <Loader2 size={16} className="animate-spin text-[var(--solar-cyan)] shrink-0" /> : null}
              </div>
              <div className="flex flex-wrap gap-1">
                {SOURCE_CHIPS.map(({ id, label, Icon }) => {
                  const on = sourceChip === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      title={label}
                      onClick={() => setSourceChip(id)}
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium border transition-colors ${
                        on
                          ? 'border-[var(--solar-cyan)]/50 bg-[var(--solar-cyan)]/10 text-[var(--text-main)]'
                          : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      <Icon size={11} className="shrink-0 opacity-80" />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto chat-hide-scroll">
              {flatList.length === 0 && !loading ? (
                <div className="px-3 py-6 text-center text-[12px] text-[var(--text-muted)]">No results</div>
              ) : null}

              {displaySections.map((section) => (
                <div key={section.key}>
                  {section.label ? (
                    <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      {section.label}
                    </div>
                  ) : null}
                  {section.rows.map((item) => {
                    rowIndex += 1;
                    const i = rowIndex;
                    const Icon = rowIcon(item.category);
                    const selected = i === active;
                    const isTip = item.category === 'tip';
                    return (
                      <button
                        key={`${item.id}-${i}`}
                        type="button"
                        onClick={() => applyItem(item, q.trim())}
                        onMouseEnter={() => setActive(i)}
                        className={`w-full text-left px-3 py-2 border-b border-[var(--border-subtle)]/50 transition-colors flex items-center gap-2.5 group ${
                          selected ? 'bg-[var(--bg-hover)]' : 'hover:bg-[var(--bg-hover)]/70'
                        }`}
                      >
                        {item.category === 'file' ? (
                          <SetiFileIcon
                            filename={item.filePath || item.title}
                            size={14}
                            className="shrink-0"
                          />
                        ) : (
                          <Icon
                            size={14}
                            className={`shrink-0 ${item.category === 'r2' || item.category === 'resource' ? 'text-amber-500/90' : 'text-[var(--text-muted)]'}`}
                            aria-hidden
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[12px] font-medium text-[var(--text-main)] truncate">{item.title}</span>
                            {item.bound ? (
                              <span className="text-[9px] uppercase tracking-wide text-[var(--solar-cyan)] shrink-0">bound</span>
                            ) : null}
                          </div>
                          {item.commandCategory ? (
                            <div className="text-[9px] font-semibold uppercase tracking-wider text-[var(--solar-cyan)]/80">
                              {WRANGLER_CATEGORY_LABELS[item.commandCategory]}
                            </div>
                          ) : null}
                          {item.subtitle ? (
                            <div className="text-[11px] font-mono text-[var(--text-muted)] truncate">{item.subtitle}</div>
                          ) : null}
                          {typeof item.objectCount === 'number' ? (
                            <div className="text-[10px] text-[var(--text-muted)] font-mono">
                              {item.objectCount.toLocaleString()} objects
                            </div>
                          ) : null}
                        </div>
                        {selected && !isTip ? (
                          <ArrowRight size={14} className="shrink-0 text-[var(--text-muted)] opacity-70" />
                        ) : isTip ? (
                          <ChevronRight size={14} className="shrink-0 text-[var(--text-muted)] opacity-50" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="px-3 py-2 border-t border-[var(--border-subtle)] flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
              <span>↑ ↓ to navigate</span>
              <span>↵ to select</span>
            </div>
          </div>
      )}

      {toast ? (
        <div className="fixed bottom-6 left-1/2 z-[200] -translate-x-1/2 px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[12px] text-[var(--text-main)] shadow-xl">
          {toast}
        </div>
      ) : null}
    </div>
  );
};
