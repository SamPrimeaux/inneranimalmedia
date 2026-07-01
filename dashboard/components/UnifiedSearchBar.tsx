import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Database,
  HardDrive,
  Layers,
  Loader2,
  MessageSquare,
  Router,
  Search,
  Terminal,
  Workflow,
  LayoutGrid,
  FileText,
} from 'lucide-react';
import { resumeAgentChatSession } from '../lib/openAgentConversation';
import { SetiFileIcon } from '../src/components/SetiFileIcon';
import {
  WRANGLER_CATEGORY_LABELS,
  filterWranglerCatalog,
  groupWranglerCatalog,
  normalizeCommandRow,
  type WranglerCatalogEntry,
  type WranglerCommandCategory,
} from '../lib/wranglerCommandCatalog';
import { useWorkspace } from '../src/context/WorkspaceContext';
import {
  databaseStudioPathFromName,
  expectedDatabaseNameForWorkspace,
  expectedR2BucketForWorkspace,
  isPlatformWorkspace,
} from '../src/lib/databaseStudioRoute';
import { ConnectionMenuPanel, type ConnectionMenuAction } from './ConnectionMenuPanel';
import { GitRepoBranchMenuPanel, GitRepoBranchNavTrigger } from './GitRepoBranchDropdown';
import { SHELL_DROPDOWN_WIDTH_PX } from './ShellDropdownPanel';
import { filterDeployPaletteRows } from '../src/lib/deployPaletteItems';
import { IAM_GIT_SYNC_PUBLISH, IAM_OPEN_CONNECTION_MENU, IAM_OPEN_GIT_REPO_MENU } from '../src/lib/openCommandPalette';
import type { OpenCommandPaletteDetail } from '../src/lib/openCommandPalette';
import { isGithubCloneQuery, parseGithubCloneRef } from '../src/lib/githubClone';
import {
  PALETTE_CONNECT_CLOUDFLARE,
  PALETTE_R2_PAGE_SIZE,
  fetchPaletteCloudflareCatalog,
  fetchPaletteD1Databases,
  fetchPaletteHyperdriveConfigs,
  fetchPaletteR2Buckets,
  fetchPaletteVectorizeIndexes,
  filterPaletteR2Buckets,
  probePaletteCloudflareConnected,
  type PaletteCfCatalog,
} from '../src/lib/paletteCloudflare';

export type UnifiedSearchNavigate =
  | { kind: 'table'; name: string }
  | { kind: 'conversation'; id: string }
  | { kind: 'knowledge'; url: string | null; label: string }
  | { kind: 'sql'; sql: string }
  | { kind: 'deployment'; summary: string }
  | { kind: 'column'; sql: string }
  | { kind: 'file'; path: string };

type SourceChipId = 'all' | 'planes' | 'r2' | 'd1' | 'commands' | 'workflows' | 'chats';

type PaletteCategory =
  | 'resource'
  | 'r2'
  | 'd1'
  | 'hyperdrive'
  | 'vectorize'
  | 'chat'
  | 'deploy'
  | 'command'
  | 'workflow'
  | 'file'
  | 'tip'
  | 'search'
  | 'github_clone'
  | 'connect';

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
  deployAction?: 'workers_builds' | 'open_deploys';
  commandCategory?: WranglerCommandCategory;
  /** Unified-search row passthrough */
  legacyRow?: LegacyUnifiedRow;
  cloneRef?: string;
  d1DatabaseName?: string;
  hyperdriveId?: string;
  vectorizeIndexName?: string;
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

type QueryMode = 'default' | 'planes' | 'r2' | 'd1' | 'hyperdrive' | 'vectorize' | 'command' | 'workflow' | 'file' | 'search' | 'clone';

const SOURCE_CHIPS: { id: SourceChipId; label: string; Icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { id: 'all', label: 'All', Icon: LayoutGrid },
  { id: 'planes', label: 'Planes', Icon: Layers },
  { id: 'r2', label: 'R2', Icon: HardDrive },
  { id: 'd1', label: 'D1', Icon: Database },
  { id: 'commands', label: 'Commands', Icon: Terminal },
  { id: 'workflows', label: 'Workflows', Icon: Workflow },
  { id: 'chats', label: 'Chats', Icon: MessageSquare },
];

const CF_DATA_TIP_PREFIXES = ['r2', 'd1', 'planes', 'hyperdrive', 'vectorize', 'hd', 'vx'];

const SEARCH_TIPS: PaletteItem[] = [
  { id: 'tip-planes', category: 'tip', title: 'planes:', subtitle: 'D1, R2, Hyperdrive & Vectorize in your account' },
  { id: 'tip-r2', category: 'tip', title: 'r2:', subtitle: 'Search R2 buckets' },
  { id: 'tip-d1', category: 'tip', title: 'd1:', subtitle: 'List D1 databases in your account' },
  { id: 'tip-hd', category: 'tip', title: 'hyperdrive:', subtitle: 'List Hyperdrive configs' },
  { id: 'tip-vx', category: 'tip', title: 'vectorize:', subtitle: 'List Vectorize indexes' },
  { id: 'tip-cmd', category: 'tip', title: '/', subtitle: 'Wrangler commands (R2, D1, KV, Workers…)' },
  { id: 'tip-wf', category: 'tip', title: 'wf', subtitle: 'D1 agentsam_workflows' },
  { id: 'tip-at', category: 'tip', title: '@', subtitle: 'Recent files' },
];

function isCfDataTip(title: string): boolean {
  const t = title.replace(/:$/, '').toLowerCase();
  return CF_DATA_TIP_PREFIXES.includes(t);
}

function paletteSearchTips(cfConnected: boolean | null): PaletteItem[] {
  const connected = cfConnected === true;
  const tips = SEARCH_TIPS.filter((tip) => connected || !isCfDataTip(tip.title));
  if (!connected) {
    return [{ ...PALETTE_CONNECT_CLOUDFLARE }, ...tips];
  }
  return tips;
}

function r2CatalogToPaletteItems(rows: { name: string; bound: boolean }[]): PaletteItem[] {
  return rows.map((b) => ({
    id: `r2-${b.name}`,
    category: 'r2' as const,
    title: b.name,
    subtitle: b.bound ? 'Bound to this Worker' : 'Account bucket',
    bound: b.bound,
    r2Bucket: b.name,
  }));
}

function d1RowsToPalette(
  rows: { name: string; uuid?: string; bound?: boolean }[],
): PaletteItem[] {
  return rows.map((db) => ({
    id: `d1-db-${db.name}`,
    category: 'd1' as const,
    title: db.name,
    subtitle: db.bound ? 'D1 database · bound to Worker' : 'D1 database · your Cloudflare account',
    bound: db.bound,
    d1DatabaseName: db.name,
    dbTarget: 'd1' as const,
  }));
}

function hyperdriveRowsToPalette(
  rows: { id: string; name: string; bound?: boolean }[],
): PaletteItem[] {
  return rows.map((cfg) => ({
    id: `hd-${cfg.id}`,
    category: 'hyperdrive' as const,
    title: cfg.name,
    subtitle: cfg.bound ? 'Hyperdrive · bound to Worker' : 'Hyperdrive config · your account',
    bound: cfg.bound,
    hyperdriveId: cfg.id,
    dbTarget: 'hyperdrive' as const,
  }));
}

function vectorizeRowsToPalette(
  rows: { name: string; description?: string | null; bound?: boolean }[],
): PaletteItem[] {
  return rows.map((idx) => ({
    id: `vx-${idx.name}`,
    category: 'vectorize' as const,
    title: idx.name,
    subtitle: idx.bound
      ? 'Vectorize index · bound to Worker'
      : idx.description || 'Vectorize index · your account',
    bound: idx.bound,
    vectorizeIndexName: idx.name,
  }));
}

function buildPlaneSectionsFromCatalog(
  catalog: {
    d1?: { name: string; id?: string; bound?: boolean }[];
    r2?: { name: string; bound?: boolean }[];
    hyperdrive?: { id: string; name: string; bound?: boolean }[];
    vectorize?: { name: string; description?: string | null; bound?: boolean }[];
  },
  searchTerm: string,
  r2PageNum: number,
): { sections: CommandSection[]; r2Catalog: { name: string; bound: boolean }[] } {
  const term = searchTerm.trim().toLowerCase();
  const match = (name: string) => !term || name.toLowerCase().includes(term);

  const sections: CommandSection[] = [];

  const d1Rows = d1RowsToPalette((catalog.d1 || []).filter((db) => match(db.name)));
  if (d1Rows.length) sections.push({ key: 'd1', label: 'D1 Databases', rows: d1Rows });

  const r2Sorted = filterPaletteR2Buckets(
    (catalog.r2 || []).map((b) => ({ name: b.name, bound: !!b.bound })),
    searchTerm,
  );
  const r2Start = (r2PageNum - 1) * PALETTE_R2_PAGE_SIZE;
  const r2PageRows = r2CatalogToPaletteItems(r2Sorted.slice(r2Start, r2Start + PALETTE_R2_PAGE_SIZE));
  if (r2PageRows.length) sections.push({ key: 'r2', label: 'R2 Buckets', rows: r2PageRows });

  const hdRows = hyperdriveRowsToPalette(
    (catalog.hyperdrive || []).filter((c) => match(c.name || c.id)),
  );
  if (hdRows.length) sections.push({ key: 'hyperdrive', label: 'Hyperdrive', rows: hdRows });

  const vxRows = vectorizeRowsToPalette((catalog.vectorize || []).filter((i) => match(i.name)));
  if (vxRows.length) sections.push({ key: 'vectorize', label: 'Vectorize', rows: vxRows });

  return { sections, r2Catalog: r2Sorted };
}

function deployRowToPalette(row: ReturnType<typeof filterDeployPaletteRows>[number]): PaletteItem {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    subtitle: row.subtitle,
    commandText: row.commandText,
    deployAction: row.deployAction,
  };
}

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
  if (lower.startsWith('planes:')) return { mode: 'planes', term: q.slice(7).trim() };
  if (lower === 'planes' || lower.startsWith('planes ')) {
    return { mode: 'planes', term: q.replace(/^planes\s*/i, '').trim() };
  }
  if (lower.startsWith('hyperdrive:') || lower.startsWith('hd:')) {
    return { mode: 'hyperdrive', term: q.replace(/^(hyperdrive|hd):/i, '').trim() };
  }
  if (lower === 'hyperdrive' || lower === 'hd' || lower.startsWith('hyperdrive ') || lower.startsWith('hd ')) {
    return { mode: 'hyperdrive', term: q.replace(/^(hyperdrive|hd)\s*/i, '').trim() };
  }
  if (lower.startsWith('vectorize:') || lower.startsWith('vx:')) {
    return { mode: 'vectorize', term: q.replace(/^(vectorize|vx):/i, '').trim() };
  }
  if (lower === 'vectorize' || lower === 'vx' || lower.startsWith('vectorize ') || lower.startsWith('vx ')) {
    return { mode: 'vectorize', term: q.replace(/^(vectorize|vx)\s*/i, '').trim() };
  }
  if (q.startsWith('/')) return { mode: 'command', term: q.slice(1).trim() };
  if (lower.startsWith('wf:') || lower === 'wf' || lower.startsWith('wf ')) {
    return { mode: 'workflow', term: q.replace(/^wf:?/i, '').trim() };
  }
  if (q.startsWith('@')) return { mode: 'file', term: q.slice(1).trim() };
  if (lower.startsWith('clone ') || lower === 'clone' || isGithubCloneQuery(q)) {
    return { mode: 'clone', term: q.replace(/^clone\s*/i, '').trim() || q.trim() };
  }
  if (q.length >= 2) return { mode: 'search', term: q };
  return { mode: 'default', term: q };
}

function chipMatchesCategory(chip: SourceChipId, category: PaletteCategory): boolean {
  if (chip === 'all') return category !== 'tip' && category !== 'connect';
  if (chip === 'r2') return category === 'r2' || category === 'resource';
  if (chip === 'd1') return category === 'd1';
  if (chip === 'planes') {
    return category === 'd1' || category === 'r2' || category === 'hyperdrive' || category === 'vectorize';
  }
  if (chip === 'commands') return category === 'command' || category === 'deploy';
  if (chip === 'workflows') return category === 'workflow';
  if (chip === 'chats') return category === 'chat';
  return true;
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
  if (mode === 'd1') return 'D1 Databases';
  if (mode === 'planes') return 'Data planes';
  if (mode === 'hyperdrive') return 'Hyperdrive';
  if (mode === 'vectorize') return 'Vectorize';
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
    case 'hyperdrive':
      return Router;
    case 'vectorize':
      return Layers;
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
    case 'connect':
      return HardDrive;
    default:
      return Search;
  }
}

export const UnifiedSearchBar: React.FC<{
  workspaceLabel?: string;
  /** Mobile (≤430px): search-only trigger — no workspace chip in top bar on any route. */
  hideWorkspaceSegment?: boolean;
  /** Mobile top-bar right cluster: anchor palette to the right edge. */
  mobileToolbar?: boolean;
  onWorkspacePickerClick?: () => void;
  /** Opens global repo/branch menu (rendered by App shell). */
  onGitRepoMenuOpen?: () => void;
  gitBranch?: string;
  activeWorkspaceId?: string | null;
  workspaceRepoHint?: string | null;
  onGitBranchSelect?: (branch: string) => void;
  onGitBranchPanelClick?: () => void;
  onOpenCommandPalette?: (detail?: OpenCommandPaletteDetail) => void;
  recentFiles?: { name: string; path: string; label?: string }[];
  onNavigate: (nav: UnifiedSearchNavigate, searchQuery: string) => void;
  onRunCommand?: (cmd: string) => void;
  controlledOpen?: boolean;
  onControlledOpenChange?: (open: boolean) => void;
  initialFacets?: string[];
  initialQuery?: string;
  onInitialQueryConsumed?: () => void;
  /** When true, this instance owns StatusBar-triggered git/connection dropdowns (one per viewport). */
  shellDropdownHost?: boolean;
  onConnectionMenuAction?: (action: ConnectionMenuAction) => void;
}> = ({
  workspaceLabel,
  hideWorkspaceSegment = false,
  mobileToolbar = false,
  onWorkspacePickerClick,
  onGitRepoMenuOpen,
  gitBranch,
  activeWorkspaceId,
  workspaceRepoHint,
  onGitBranchSelect,
  onGitBranchPanelClick,
  onOpenCommandPalette,
  recentFiles = [],
  onNavigate,
  onRunCommand: _onRunCommand,
  controlledOpen,
  onControlledOpenChange,
  initialFacets,
  initialQuery,
  onInitialQueryConsumed,
  shellDropdownHost = false,
  onConnectionMenuAction,
}) => {
  const navigate = useNavigate();
  const { workspaceId, workspaces } = useWorkspace();
  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.id === workspaceId) ?? null,
    [workspaces, workspaceId],
  );
  const collabDbName = expectedDatabaseNameForWorkspace(activeWorkspace);
  const collabR2Bucket = expectedR2BucketForWorkspace(activeWorkspace);

  const workspaceFetchInit = useCallback(
    (init?: RequestInit): RequestInit => {
      const headers: Record<string, string> = {
        ...((init?.headers as Record<string, string> | undefined) || {}),
      };
      const ws = workspaceId?.trim();
      if (ws) headers['X-IAM-Workspace-Id'] = ws;
      if (collabDbName) headers['X-IAM-Database-Name'] = collabDbName;
      return { ...init, headers };
    },
    [workspaceId, collabDbName],
  );

  const workspaceFetchJson = useCallback(
    async <T,>(url: string, init?: RequestInit): Promise<T | null> => {
      try {
        const res = await fetch(url, { credentials: 'same-origin', ...workspaceFetchInit(init) });
        if (!res.ok) return null;
        return (await res.json()) as T;
      } catch {
        return null;
      }
    },
    [workspaceFetchInit],
  );

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
  const [cfConnected, setCfConnected] = useState<boolean | null>(null);
  const [r2Catalog, setR2Catalog] = useState<{ name: string; bound: boolean }[]>([]);
  const [r2Page, setR2Page] = useState(1);
  const [commandSections, setCommandSections] = useState<CommandSection[]>([]);
  const [planeSections, setPlaneSections] = useState<CommandSection[]>([]);
  const [planesCatalog, setPlanesCatalog] = useState<PaletteCfCatalog | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [cloneBusy, setCloneBusy] = useState(false);
  const [bucketMenuOpen, setBucketMenuOpen] = useState(false);
  const [bucketMenuRows, setBucketMenuRows] = useState<{ name: string; bound: boolean }[]>([]);
  const [bucketMenuLoading, setBucketMenuLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const bucketMenuRef = useRef<HTMLDivElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [connectionMenuOpen, setConnectionMenuOpen] = useState(false);
  const [gitMenuOpen, setGitMenuOpen] = useState(false);
  const connectionMenuRef = useRef<HTMLDivElement>(null);
  const gitMenuRef = useRef<HTMLDivElement>(null);

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
        deploy: 'commands',
        codebase: 'all',
        scripts: 'commands',
      };
      const first = initialFacets.map((f) => map[f]).find(Boolean);
      if (first) setSourceChip(first);
      if (initialFacets.includes('deploy') && !initialQuery) {
        setQ('deploy');
      }
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
      const connected = await probePaletteCloudflareConnected(workspaceFetchInit);
      setCfConnected(connected);

      const [sessions, deploys, recentRes] = await Promise.all([
        workspaceFetchJson<
          { id?: string; name?: string; message_count?: number; started_at?: number }[]
        >('/api/agent/sessions?limit=5').then((d) => (Array.isArray(d) ? d : [])),
        workspaceFetchJson<{ deployments?: { worker_name?: string; environment?: string; status?: string; deployed_at?: string; deployment_notes?: string }[] }>(
          '/api/overview/deployments?limit=5',
        ).then((d) => (d?.deployments || []).slice(0, 5)),
        fetch('/api/unified-search/recent', { credentials: 'same-origin', ...workspaceFetchInit() }),
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

      const workspaceSlug = activeWorkspace?.slug?.trim().toLowerCase();
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

      const deployRows: PaletteItem[] = deploys
        .filter((d) => {
          if (!workspaceSlug || isPlatformWorkspace(activeWorkspace)) return true;
          const worker = String(d.worker_name || '').trim().toLowerCase();
          return !worker || worker === workspaceSlug || worker.includes(workspaceSlug);
        })
        .map((d, i) => {
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

      setItems([...chatRows, ...deployRows]);
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace, workspaceFetchInit, workspaceFetchJson]);

  const loadR2 = useCallback(async (searchTerm: string) => {
    setLoading(true);
    try {
      setPlaneSections([]);
      const connected = await probePaletteCloudflareConnected(workspaceFetchInit);
      setCfConnected(connected);
      if (!connected) {
        setR2Catalog([]);
        setR2Page(1);
        setItems([{ ...PALETTE_CONNECT_CLOUDFLARE }]);
        return;
      }
      const rows = await fetchPaletteR2Buckets(workspaceFetchInit, activeWorkspace);
      const sorted = filterPaletteR2Buckets(rows, searchTerm);
      setR2Catalog(sorted);
      setR2Page(1);
      setItems(r2CatalogToPaletteItems(sorted.slice(0, PALETTE_R2_PAGE_SIZE)));
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace, workspaceFetchInit]);

  const loadD1 = useCallback(async (searchTerm: string) => {
    setLoading(true);
    try {
      setPlaneSections([]);
      const connected = await probePaletteCloudflareConnected(workspaceFetchInit);
      setCfConnected(connected);
      if (!connected) {
        setItems([{ ...PALETTE_CONNECT_CLOUDFLARE }]);
        return;
      }
      const databases = await fetchPaletteD1Databases(workspaceFetchInit);
      const filtered = searchTerm
        ? databases.filter((db) => db.name.toLowerCase().includes(searchTerm.toLowerCase()))
        : databases;
      setItems(
        d1RowsToPalette(filtered),
      );
    } finally {
      setLoading(false);
    }
  }, [workspaceFetchInit]);

  const loadHyperdrive = useCallback(async (searchTerm: string) => {
    setLoading(true);
    try {
      setPlaneSections([]);
      const connected = await probePaletteCloudflareConnected(workspaceFetchInit);
      setCfConnected(connected);
      if (!connected) {
        setItems([{ ...PALETTE_CONNECT_CLOUDFLARE }]);
        return;
      }
      const configs = await fetchPaletteHyperdriveConfigs(workspaceFetchInit);
      const term = searchTerm.trim().toLowerCase();
      const filtered = term
        ? configs.filter((c) => `${c.name} ${c.id}`.toLowerCase().includes(term))
        : configs;
      setItems(hyperdriveRowsToPalette(filtered));
    } finally {
      setLoading(false);
    }
  }, [workspaceFetchInit]);

  const loadVectorize = useCallback(async (searchTerm: string) => {
    setLoading(true);
    try {
      setPlaneSections([]);
      const connected = await probePaletteCloudflareConnected(workspaceFetchInit);
      setCfConnected(connected);
      if (!connected) {
        setItems([{ ...PALETTE_CONNECT_CLOUDFLARE }]);
        return;
      }
      const indexes = await fetchPaletteVectorizeIndexes(workspaceFetchInit);
      const term = searchTerm.trim().toLowerCase();
      const filtered = term
        ? indexes.filter((i) => `${i.name} ${i.description || ''}`.toLowerCase().includes(term))
        : indexes;
      setItems(vectorizeRowsToPalette(filtered));
    } finally {
      setLoading(false);
    }
  }, [workspaceFetchInit]);

  const loadPlanes = useCallback(async (searchTerm: string, page = 1) => {
    setLoading(true);
    try {
      setCommandSections([]);
      if (!workspaceId?.trim()) {
        setPlaneSections([]);
        setItems([
          {
            id: 'workspace-required',
            category: 'connect',
            title: 'Select a workspace',
            subtitle: 'Choose a workspace to browse your Cloudflare data planes',
          },
        ]);
        return;
      }
      const connected = await probePaletteCloudflareConnected(workspaceFetchInit);
      setCfConnected(connected);
      if (!connected) {
        setPlaneSections([]);
        setR2Catalog([]);
        setR2Page(1);
        setItems([{ ...PALETTE_CONNECT_CLOUDFLARE }]);
        return;
      }
      const catalog = await fetchPaletteCloudflareCatalog(workspaceFetchInit);
      if (!catalog?.ok) {
        setPlaneSections([]);
        setPlanesCatalog(null);
        setItems([{ ...PALETTE_CONNECT_CLOUDFLARE }]);
        return;
      }
      setPlanesCatalog(catalog);
      const built = buildPlaneSectionsFromCatalog(catalog, searchTerm, page);
      setR2Catalog(built.r2Catalog);
      setR2Page(page);
      setPlaneSections(built.sections);
      setItems(built.sections.flatMap((s) => s.rows));
    } finally {
      setLoading(false);
    }
  }, [workspaceFetchInit, workspaceId]);

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
      const deployRows = filterDeployPaletteRows(searchTerm).map(deployRowToPalette);
      const grouped = groupWranglerCatalog(merged);
      const sections: CommandSection[] = [];
      if (deployRows.length > 0) {
        sections.push({ key: 'deploy', label: 'Deploy', rows: deployRows });
      }
      for (const g of grouped) {
        sections.push({
          key: g.category,
          label: g.label,
          rows: g.rows.map(catalogEntryToPalette),
        });
      }

      setCommandSections(sections);
      setItems(sections.flatMap((s) => s.rows));
    } finally {
      setLoading(false);
    }
  }, [sourceChip]);

  const loadWorkflows = useCallback(async (searchTerm: string) => {
    setLoading(true);
    try {
      let rows: {
        id?: string;
        workflow_key?: string;
        display_name?: string;
        status?: string;
        created_at?: string | number | null;
        description?: string;
      }[] = [];

      const qs = new URLSearchParams({ limit: '10' });
      if (searchTerm) qs.set('q', searchTerm);
      const ws = workspaceId?.trim();
      if (ws) qs.set('workspace_id', ws);

      const primary = await workspaceFetchJson<typeof rows | { workflows?: typeof rows }>(
        `/api/workflows?${qs}`,
      );
      if (Array.isArray(primary)) rows = primary;
      else if (primary && typeof primary === 'object' && Array.isArray((primary as { workflows?: typeof rows }).workflows)) {
        rows = (primary as { workflows: typeof rows }).workflows;
      }

      if (!rows.length) {
        const fallback = await workspaceFetchJson<typeof rows>('/api/agentsam/workflows');
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
          subtitle:
            w.workflow_key
            || [w.status ? String(w.status) : '', w.created_at != null ? String(w.created_at) : ''].filter(Boolean).join(' · ')
            || w.description
            || undefined,
          workflowKey: String(w.workflow_key || w.id || ''),
        })),
      );
    } finally {
      setLoading(false);
    }
  }, [workspaceId, workspaceFetchJson]);

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

  const loadClone = useCallback((searchTerm: string) => {
    const ref = parseGithubCloneRef(searchTerm);
    if (!ref) {
      setItems([]);
      return;
    }
    setItems([
      {
        id: `github-clone-${ref}`,
        category: 'github_clone',
        title: `Clone ${ref}`,
        subtitle: 'Git clone on your connected terminal lane · binds workspace_root',
        cloneRef: ref,
      },
    ]);
    setLoading(false);
  }, []);

  const runGithubClone = useCallback(
    async (raw: string) => {
      const ref = parseGithubCloneRef(raw);
      if (!ref || cloneBusy) return;
      setCloneBusy(true);
      setLoading(true);
      try {
        const res = await fetch('/api/agent/git/clone', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            ...(workspaceId?.trim() ? { 'X-IAM-Workspace-Id': workspaceId.trim() } : {}),
          },
          body: JSON.stringify({ repo: ref, workspace_id: workspaceId?.trim() || undefined }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          repo_path?: string;
          github_repo?: string;
          body?: { user_message?: string };
        };
        if (!res.ok || !data.ok) {
          const msg =
            data.body?.user_message ||
            (data.error === 'github_not_connected'
              ? 'Connect GitHub in Integrations first.'
              : data.error === 'terminal_unavailable'
                ? 'Connect Local or Cloud terminal, then retry.'
                : data.error === 'path_exists'
                  ? `Path already exists: ${data.repo_path || ref}`
                  : data.error || `Clone failed (${res.status})`);
          setToast(msg);
          return;
        }
        setToast(`Cloned ${data.github_repo || ref} → ${data.repo_path || 'workspace'}`);
        window.dispatchEvent(
          new CustomEvent('iam_workspace_github_repo', {
            detail: { workspaceId: workspaceId?.trim() || null, github_repo: data.github_repo || ref },
          }),
        );
        setOpen(false);
        setQ('');
        setItems([]);
        navigate('/dashboard/agent/editor');
      } catch (e) {
        setToast(e instanceof Error ? e.message : 'Clone failed');
      } finally {
        setCloneBusy(false);
        setLoading(false);
      }
    },
    [cloneBusy, workspaceId, navigate, setOpen],
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
    if (mode === 'planes') {
      await loadPlanes(term, 1);
      return;
    }
    if (mode === 'hyperdrive') {
      await loadHyperdrive(term);
      return;
    }
    if (mode === 'vectorize') {
      await loadVectorize(term);
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
    if (mode === 'clone') {
      loadClone(term || q.trim());
      return;
    }
    if (sourceChip === 'commands') {
      await loadCommands(term);
      return;
    }
    await loadUnifiedSearch(term, sourceChip);
  }, [mode, term, q, sourceChip, loadDefault, loadR2, loadD1, loadPlanes, loadHyperdrive, loadVectorize, loadCommands, loadWorkflows, loadFiles, loadClone, loadUnifiedSearch]);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const delay = mode === 'default' ? 0 : mode === 'clone' ? 0 : 180;
    debounceRef.current = setTimeout(() => void runQuery(), delay);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [open, q, mode, sourceChip, runQuery, workspaceId]);

  const closePalette = useCallback(() => {
    setOpen(false);
    setQ('');
    setItems([]);
    setRecentSearches([]);
    setCommandSections([]);
    setPlaneSections([]);
    setPlanesCatalog(null);
    setSourceChip('all');
    setActive(0);
    setR2Catalog([]);
    setR2Page(1);
    setCfConnected(null);
  }, []);

  useEffect(() => {
    if (!shellDropdownHost) return;
    const onGitMenu = () => {
      setConnectionMenuOpen(false);
      setGitMenuOpen(true);
      closePalette();
    };
    const onConnectionMenu = () => {
      setGitMenuOpen(false);
      setConnectionMenuOpen(true);
      closePalette();
    };
    window.addEventListener(IAM_OPEN_GIT_REPO_MENU, onGitMenu);
    window.addEventListener(IAM_OPEN_CONNECTION_MENU, onConnectionMenu);
    return () => {
      window.removeEventListener(IAM_OPEN_GIT_REPO_MENU, onGitMenu);
      window.removeEventListener(IAM_OPEN_CONNECTION_MENU, onConnectionMenu);
    };
  }, [shellDropdownHost, closePalette]);

  useEffect(() => {
    if (!shellDropdownHost || (!gitMenuOpen && !connectionMenuOpen)) return;
    const onDocDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (paletteRef.current?.contains(t)) return;
      if (connectionMenuRef.current?.contains(t)) return;
      if (gitMenuRef.current?.contains(t)) return;
      setGitMenuOpen(false);
      setConnectionMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [shellDropdownHost, gitMenuOpen, connectionMenuOpen]);

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
      if (collabR2Bucket && !isPlatformWorkspace(activeWorkspace)) {
        setBucketMenuRows([{ name: collabR2Bucket, bound: true }]);
        return;
      }
      const payload = await workspaceFetchJson<{ buckets?: string[]; bound?: string[] }>(
        '/api/r2/buckets',
      );
      const names = (payload?.buckets || payload?.bound || []).map(String);
      setBucketMenuRows(names.map((name) => ({ name, bound: true })));
    } catch (e) {
      console.error('Failed to load R2 bucket menu:', e);
    } finally {
      setBucketMenuLoading(false);
    }
  }, [activeWorkspace, collabR2Bucket, workspaceFetchJson]);

  useEffect(() => {
    if (!bucketMenuOpen) return;
    void loadBucketMenu();
  }, [bucketMenuOpen, loadBucketMenu, workspaceId]);

  useEffect(() => {
    if (!bucketMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (bucketMenuRef.current?.contains(e.target as Node)) return;
      setBucketMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [bucketMenuOpen]);

  const openDatabase = useCallback(
    (target?: 'd1' | 'hyperdrive') => {
      if (target === 'd1' && collabDbName) {
        navigate(databaseStudioPathFromName(collabDbName));
        return;
      }
      try {
        if (target) sessionStorage.setItem('iam-palette-db-target', target);
      } catch {
        /* ignore */
      }
      window.dispatchEvent(new CustomEvent('iam-sidebar-toggle', { detail: { activity: 'database', dbTarget: target } }));
    },
    [collabDbName, navigate],
  );

  const applyItem = useCallback(
    (item: PaletteItem, searchQuery: string) => {
      if (item.category === 'tip' || item.category === 'search') {
        setQ(item.title);
        return;
      }

      if (item.category === 'connect') {
        navigate('/dashboard/settings/integrations');
        closePalette();
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
        const dbName = item.d1DatabaseName || item.title;
        if (dbName) {
          navigate(databaseStudioPathFromName(dbName));
          closePalette();
          return;
        }
        openDatabase(item.dbTarget);
        closePalette();
        return;
      }

      if (item.category === 'hyperdrive') {
        openDatabase('hyperdrive');
        closePalette();
        return;
      }

      if (item.category === 'vectorize') {
        if (item.vectorizeIndexName) {
          try {
            sessionStorage.setItem('iam-palette-vectorize-index', item.vectorizeIndexName);
          } catch {
            /* ignore */
          }
        }
        navigate('/dashboard/storage');
        closePalette();
        return;
      }

      if (item.category === 'chat' && item.conversationId) {
        resumeAgentChatSession({ id: item.conversationId, force: true });
        onNavigate({ kind: 'conversation', id: item.conversationId }, searchQuery);
        closePalette();
        return;
      }

      if (item.category === 'deploy') {
        if (item.deployAction === 'workers_builds') {
          window.dispatchEvent(new CustomEvent(IAM_GIT_SYNC_PUBLISH));
          closePalette();
          return;
        }
        navigate('/dashboard/analytics/deploys');
        closePalette();
        return;
      }

      if (item.category === 'github_clone' && item.cloneRef) {
        void runGithubClone(item.cloneRef);
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
    [closePalette, navigate, onNavigate, openDatabase, openR2Bucket, runGithubClone],
  );

  const displaySections = useMemo(() => {
    if ((mode === 'command' || (mode === 'default' && sourceChip === 'commands')) && commandSections.length > 0) {
      return commandSections;
    }
    if (mode === 'planes' && planeSections.length > 0) {
      return planeSections;
    }

    const filtered = items.filter((item) => {
      if (item.category === 'tip' || item.category === 'connect') return mode === 'default' && !q.trim();
      if (mode !== 'default' && mode !== 'search') return true;
      if (mode === 'search') return chipMatchesCategory(sourceChip, item.category);
      return chipMatchesCategory(sourceChip, item.category);
    });

    if (mode === 'default' && !q.trim()) {
      const chats = filtered.filter((i) => i.category === 'chat');
      const deploys = filtered.filter((i) => i.category === 'deploy');
      const tips = paletteSearchTips(cfConnected);
      return [
        ...(recentSearches.length
          ? [{ key: 'recent', label: 'Recent searches', rows: recentSearches }]
          : []),
        { key: 'chats', label: 'Recent chats', rows: chats },
        { key: 'deploys', label: 'Recent deploys', rows: deploys },
        { key: 'tips', label: 'Search tips', rows: tips },
      ].filter((s) => s.rows.length > 0);
    }

    const title = sectionTitle(mode, sourceChip, !!q.trim());
    return [{ key: 'main', label: title || 'Results', rows: filtered }];
  }, [items, mode, q, sourceChip, commandSections, planeSections, recentSearches, cfConnected]);

  const r2TotalPages = useMemo(
    () => Math.max(1, Math.ceil(r2Catalog.length / PALETTE_R2_PAGE_SIZE)),
    [r2Catalog.length],
  );

  useEffect(() => {
    if (mode === 'r2' && r2Catalog.length) {
      const start = (r2Page - 1) * PALETTE_R2_PAGE_SIZE;
      setItems(r2CatalogToPaletteItems(r2Catalog.slice(start, start + PALETTE_R2_PAGE_SIZE)));
      return;
    }
    if (mode === 'planes' && planesCatalog?.ok && r2Catalog.length) {
      const built = buildPlaneSectionsFromCatalog(planesCatalog, term, r2Page);
      setPlaneSections(built.sections);
      setItems(built.sections.flatMap((s) => s.rows));
    }
  }, [r2Page, r2Catalog, mode, planesCatalog, term]);

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
    } else if (e.key === 'Enter') {
      if (flatList.length > 0) {
        e.preventDefault();
        const item = flatList[active];
        if (item) applyItem(item, q.trim());
        return;
      }
      if (mode === 'clone') {
        const ref = parseGithubCloneRef(term || q.trim());
        if (ref) {
          e.preventDefault();
          void runGithubClone(ref);
        }
      }
    }
  };

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  const mobileCompact = hideWorkspaceSegment;
  let rowIndex = -1;

  return (
    <div
      ref={paletteRef}
      className={`nav-search-container min-w-0 ${mobileCompact ? `iam-nav-search--mobile${mobileToolbar ? ' iam-nav-search--toolbar' : ''}` : ''}`}
      data-mobile-compact={mobileCompact ? 'true' : undefined}
      data-palette-open={open && !mobileCompact ? 'true' : undefined}
    >
      {mobileCompact ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={
            mobileToolbar
              ? `p-1.5 rounded transition-colors ${
                  open
                    ? 'text-[var(--solar-cyan)] bg-[var(--bg-hover)]'
                    : 'text-muted hover:text-white hover:bg-[var(--bg-hover)]'
                }`
              : `flex items-center justify-center w-9 h-9 rounded-md border transition-colors ${
                  open
                    ? 'border-[var(--solar-cyan)]/50 bg-[var(--bg-hover)] text-[var(--solar-cyan)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-app)] text-muted hover:border-[var(--solar-cyan)]/40 hover:bg-[var(--bg-hover)] hover:text-main'
                }`
          }
          title="Search (Cmd+K)"
          aria-label="Search"
          aria-expanded={open}
        >
          <Search size={mobileToolbar ? 15 : 18} strokeWidth={1.75} aria-hidden />
        </button>
      ) : (
      <div className="nav-search-trigger flex items-stretch w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-app)] hover:border-[var(--solar-cyan)]/40 transition-colors overflow-visible">
        {!hideWorkspaceSegment ? (
        <div className="flex items-stretch shrink-0 border-r border-[var(--border-subtle)]">
          <div className="relative shrink-0 max-w-[45%] border-r border-[var(--border-subtle)]" ref={gitMenuRef}>
            <GitRepoBranchNavTrigger
              workspaceLabel={workspaceLabel}
              gitBranch={gitBranch}
              open={gitMenuOpen}
              onToggle={() => {
                setConnectionMenuOpen(false);
                setGitMenuOpen((v) => !v);
                closePalette();
              }}
            />
            {gitMenuOpen ? (
              <GitRepoBranchMenuPanel
                open={gitMenuOpen}
                onClose={() => setGitMenuOpen(false)}
                variant="anchored"
                activeWorkspaceId={activeWorkspaceId}
                currentBranch={gitBranch}
                workspaceRepoHint={workspaceRepoHint}
                onBranchSelect={onGitBranchSelect}
                onOpenCommandPalette={onOpenCommandPalette}
                onGitBranchClick={() => {
                  setGitMenuOpen(false);
                  onGitBranchPanelClick?.();
                }}
                onWorkspacePickerClick={() => {
                  setGitMenuOpen(false);
                  onWorkspacePickerClick?.();
                }}
              />
            ) : null}
          </div>
          <div className="relative shrink-0" ref={connectionMenuRef}>
            <button
              type="button"
              onClick={() => {
                setGitMenuOpen(false);
                setConnectionMenuOpen((v) => !v);
                closePalette();
              }}
              className="flex items-center justify-center h-full px-2.5 hover:bg-[var(--bg-hover)] transition-colors text-muted hover:text-main"
              title="Connection options"
              aria-label="Connection options"
              aria-expanded={connectionMenuOpen}
            >
              <Router size={12} className="text-[var(--solar-cyan)]" strokeWidth={1.25} />
            </button>
            {connectionMenuOpen ? (
              <ConnectionMenuPanel
                open={connectionMenuOpen}
                onClose={() => setConnectionMenuOpen(false)}
                onAction={(action) => onConnectionMenuAction?.(action)}
                variant="anchored"
              />
            ) : null}
          </div>
        </div>
        ) : null}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex flex-1 items-center gap-2 min-w-0 px-2 py-1.5 text-left hover:bg-[var(--bg-hover)] transition-colors"
          title="Search (Cmd+K)"
        >
          <Search size={14} className="shrink-0 opacity-70 text-muted" />
          <span className="text-[11px] text-muted truncate flex-1">Search…</span>
          <kbd className="hidden xl:inline text-[9px] font-mono px-1 py-px rounded border border-[var(--border-subtle)] text-muted shrink-0">
            {isMac ? 'Cmd' : 'Ctrl'}+K
          </kbd>
        </button>
      </div>
      )}

      {open && (
          <div
            className="nav-dropdown iam-shell-dropdown shadow-2xl overflow-hidden flex flex-col"
            role="dialog"
            aria-label="Command palette"
            style={{
              background: 'rgba(12, 19, 26, 0.82)',
              backdropFilter: 'blur(16px) saturate(140%)',
              WebkitBackdropFilter: 'blur(16px) saturate(140%)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <div className="px-3.5 py-2.5 space-y-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-2">
                <Search size={16} className="text-muted shrink-0" />
                <input
                  ref={inputRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Search buckets, D1, commands, chats…"
                  className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[13px] text-main placeholder:text-muted"
                />
                <kbd className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-[var(--border-subtle)] text-muted shrink-0">
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
                      onClick={() => {
                        if (id === 'planes') {
                          setSourceChip('planes');
                          setQ('planes:');
                          return;
                        }
                        if (id === 'r2') {
                          setSourceChip('r2');
                          setQ('r2:');
                          return;
                        }
                        if (id === 'd1') {
                          setSourceChip('d1');
                          setQ('d1:');
                          return;
                        }
                        setSourceChip(id);
                      }}
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium border transition-colors ${
                        on
                          ? 'border-[var(--solar-cyan)]/50 bg-[var(--solar-cyan)]/10 text-main'
                          : 'border-[var(--border-subtle)] text-muted hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      <Icon size={11} className="shrink-0 opacity-80" />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="nav-dropdown__results flex-1 min-h-0 overflow-y-auto chat-hide-scroll">
              {flatList.length === 0 && !loading ? (
                <div className="px-3 py-6 text-center text-[12px] text-muted">No results</div>
              ) : null}

              {displaySections.map((section) => (
                <div key={section.key}>
                  {section.label ? (
                    <div className="px-3.5 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted font-[var(--font-sans)]">
                      {section.label}
                    </div>
                  ) : null}
                  {section.rows.map((item) => {
                    rowIndex += 1;
                    const i = rowIndex;
                    const Icon = rowIcon(item.category);
                    const selected = i === active;
                    const isTip = item.category === 'tip' || item.category === 'connect';
                    return (
                      <button
                        key={`${item.id}-${i}`}
                        type="button"
                        onClick={() => applyItem(item, q.trim())}
                        onMouseEnter={() => setActive(i)}
                        className={`w-full text-left px-3.5 py-2 transition-colors flex items-center gap-2.5 group ${
                          selected ? 'bg-[#2d5a7a]/90' : 'hover:bg-white/[0.06]'
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
                            className={`shrink-0 ${item.category === 'r2' || item.category === 'resource' ? 'text-amber-500/90' : 'text-muted'}`}
                            aria-hidden
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[12px] font-medium text-main truncate">{item.title}</span>
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
                            <div className="text-[11px] font-mono text-muted truncate">{item.subtitle}</div>
                          ) : null}
                          {typeof item.objectCount === 'number' ? (
                            <div className="text-[10px] text-muted font-mono">
                              {item.objectCount.toLocaleString()} objects
                            </div>
                          ) : null}
                        </div>
                        {selected && !isTip ? (
                          <ArrowRight size={14} className="shrink-0 text-muted opacity-70" />
                        ) : isTip ? (
                          <ChevronRight size={14} className="shrink-0 text-muted opacity-50" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            {(mode === 'r2' || mode === 'planes') && r2TotalPages > 1 ? (
              <div
                className="px-3.5 py-1.5 flex items-center justify-between gap-2 text-[10px] text-muted font-[var(--font-sans)]"
                style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.12)' }}
              >
                <button
                  type="button"
                  disabled={r2Page <= 1}
                  onClick={() => setR2Page((p) => Math.max(1, p - 1))}
                  className="px-2 py-0.5 rounded border border-[var(--border-subtle)] disabled:opacity-40 hover:bg-[var(--bg-hover)]"
                >
                  Previous
                </button>
                <span>
                  Page {r2Page} of {r2TotalPages} · {r2Catalog.length} buckets
                </span>
                <button
                  type="button"
                  disabled={r2Page >= r2TotalPages}
                  onClick={() => setR2Page((p) => Math.min(r2TotalPages, p + 1))}
                  className="px-2 py-0.5 rounded border border-[var(--border-subtle)] disabled:opacity-40 hover:bg-[var(--bg-hover)]"
                >
                  Next
                </button>
              </div>
            ) : null}

            <div
              className="px-3.5 py-1.5 text-[10px] text-muted flex items-center gap-3 font-[var(--font-sans)]"
              style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.18)' }}
            >
              <span>↑↓ to navigate</span>
              <span>↵ to select</span>
            </div>
          </div>
      )}

      {toast ? (
        <div className="fixed bottom-6 left-1/2 z-[200] -translate-x-1/2 px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[12px] text-main shadow-xl">
          {toast}
        </div>
      ) : null}

      {shellDropdownHost &&
        hideWorkspaceSegment &&
        (gitMenuOpen || connectionMenuOpen) &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed z-[199] left-1/2 -translate-x-1/2 rounded-b-[var(--shell-dropdown-radius,6px)] overflow-hidden shadow-2xl"
            style={{
              top: 'var(--dashboard-topbar-height, 2.5rem)',
              width: SHELL_DROPDOWN_WIDTH_PX,
              maxWidth: 'min(600px, calc(100vw - 1.5rem))',
            }}
          >
            {gitMenuOpen ? (
              <GitRepoBranchMenuPanel
                open={gitMenuOpen}
                onClose={() => setGitMenuOpen(false)}
                variant="floating"
                className="rounded-t-none rounded-b-[var(--shell-dropdown-radius,6px)] w-full"
                activeWorkspaceId={activeWorkspaceId}
                currentBranch={gitBranch}
                workspaceRepoHint={workspaceRepoHint}
                onBranchSelect={onGitBranchSelect}
                onOpenCommandPalette={onOpenCommandPalette}
                onGitBranchClick={() => {
                  setGitMenuOpen(false);
                  onGitBranchPanelClick?.();
                }}
                onWorkspacePickerClick={() => {
                  setGitMenuOpen(false);
                  onWorkspacePickerClick?.();
                }}
              />
            ) : null}
            {connectionMenuOpen ? (
              <ConnectionMenuPanel
                open={connectionMenuOpen}
                onClose={() => setConnectionMenuOpen(false)}
                onAction={(action) => onConnectionMenuAction?.(action)}
                variant="floating"
                className="rounded-t-none rounded-b-[var(--shell-dropdown-radius,6px)] w-full"
              />
            ) : null}
          </div>,
          document.body,
        )}
    </div>
  );
};
