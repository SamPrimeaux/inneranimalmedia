/**
 * LeftSidebarPanel.tsx
 * Agent Sam — Left Panel System
 *
 * Panels: Explorer | Search | Source Control | Run & Debug
 * Overflow chevron: Remote Explorer | GitHub Actions
 *
 * ZERO hardcoded data. All data flows in through props.
 * Wire each fetchXxx prop to your preferred source:
 *   - GitHub API  (git status, commits, workflow runs)
 *   - Google Drive API
 *   - Cloudflare R2 bucket listing
 *   - Local filesystem API at /api/workspace/*
 *
 * Usage:
 *   <LeftSidebarPanel
 *     workspaceName="inneranimalmedia"
 *     activeFile={currentFile}
 *     onFileOpen={setCurrentFile}
 *     fetchFileTree={() => fetch('/api/workspace/files').then(r => r.json())}
 *     fetchGitStatus={() => fetch('/api/workspace/git/status').then(r => r.json())}
 *     fetchCommits={() => fetch('/api/workspace/git/log').then(r => r.json())}
 *     fetchOutline={(file) => fetch(`/api/workspace/outline?file=${file}`).then(r => r.json())}
 *     fetchTimeline={(file) => fetch(`/api/workspace/timeline?file=${file}`).then(r => r.json())}
 *     fetchDebugConfigs={() => fetch('/api/workspace/debug/configs').then(r => r.json())}
 *     fetchSshTargets={() => fetch('/api/ssh/targets').then(r => r.json())}
 *     fetchWorkflowRuns={() => fetch('/api/github/actions/runs').then(r => r.json())}
 *     onSearch={(params) => fetch('/api/workspace/search', { method: 'POST', body: JSON.stringify(params) }).then(r => r.json())}
 *     onCommit={(msg, files) => fetch('/api/workspace/git/commit', { method: 'POST', body: JSON.stringify({ message: msg, files }) })}
 *     onStage={(path) => fetch('/api/workspace/git/stage', { method: 'POST', body: JSON.stringify({ path }) })}
 *     onUnstage={(path) => fetch('/api/workspace/git/unstage', { method: 'POST', body: JSON.stringify({ path }) })}
 *     onAgentReview={(changes) => fetch('/api/agent/review', { method: 'POST', body: JSON.stringify({ changes }) }).then(r => r.json())}
 *     onLaunchDebug={(config) => fetch('/api/debug/launch', { method: 'POST', body: JSON.stringify(config) })}
 *     onSshConnect={(target) => fetch('/api/ssh/connect', { method: 'POST', body: JSON.stringify(target) })}
 *   />
 */

import { useState, useEffect, useRef, useCallback } from 'react';

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export type PanelId =
  | 'explorer'
  | 'search'
  | 'source-control'
  | 'run-debug'
  | 'remote-explorer'
  | 'github-actions'
  | 'cad'
  | 'projects'
  | 'drive'
  | 'playwright';

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  status?: 'M' | 'A' | 'D' | 'U' | 'R' | '?';
}

export interface GitChange {
  path: string;
  status: 'M' | 'A' | 'D' | 'R' | 'U' | '?';
  staged: boolean;
  oldPath?: string;
}

export interface Commit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
  branch?: string;
  tags?: string[];
  parents: string[];
}

export interface OutlineSymbol {
  name: string;
  kind: string;
  line: number;
  children?: OutlineSymbol[];
}

export interface TimelineEntry {
  label: string;
  description: string;
  timestamp: number;
  source: 'git' | 'local';
}

export interface SearchResult {
  file: string;
  line: number;
  column: number;
  text: string;
  matchStart: number;
  matchEnd: number;
}

export interface SearchParams {
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  useRegex: boolean;
  includePattern: string;
  excludePattern: string;
}

export interface SearchResponse {
  results: SearchResult[];
  totalResults: number;
  totalFiles: number;
}

export interface DebugConfig {
  name: string;
  type: string;
  request: string;
}

export interface SshTarget {
  label: string;
  host: string;
  user?: string;
  connected: boolean;
}

export interface WorkflowRun {
  name: string;
  status: 'success' | 'failure' | 'in_progress' | 'queued';
  branch: string;
  updatedAt: string;
}

export interface AgentIssue {
  file: string;
  line: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export interface GitStatusResponse {
  changes: GitChange[];
  branch: string;
  ahead: number;
  behind: number;
}

// ─────────────────────────────────────────────
// PROPS — all data injected, zero hardcoding
// ─────────────────────────────────────────────

export interface LeftSidebarPanelProps {
  workspaceName?: string;
  activeFile?: string;
  onFileOpen?: (path: string) => void;

  // Data fetchers — wire to any source
  fetchFileTree?: () => Promise<FileNode[]>;
  fetchGitStatus?: () => Promise<GitStatusResponse>;
  fetchCommits?: () => Promise<Commit[]>;
  fetchOutline?: (file: string) => Promise<OutlineSymbol[]>;
  fetchTimeline?: (file: string) => Promise<TimelineEntry[]>;
  fetchDebugConfigs?: () => Promise<DebugConfig[]>;
  fetchSshTargets?: () => Promise<SshTarget[]>;
  fetchWorkflowRuns?: () => Promise<WorkflowRun[]>;

  // Actions
  onSearch?: (params: SearchParams) => Promise<SearchResponse>;
  onCommit?: (message: string, files: GitChange[]) => Promise<void>;
  onStage?: (path: string) => Promise<void>;
  onUnstage?: (path: string) => Promise<void>;
  onAgentReview?: (changes: GitChange[]) => Promise<AgentIssue[]>;
  onLaunchDebug?: (config: DebugConfig) => Promise<void>;
  onStopDebug?: () => Promise<void>;
  onSshConnect?: (target: SshTarget) => Promise<void>;
  onSearchSelect?: (result: SearchResult) => void;
  onNavigate?: (route: any) => void;

  isCollapsed?: boolean;
  className?: string;
}


// ─────────────────────────────────────────────
// ICONS — inline SVG only, zero emoji, zero text-as-icon
// ─────────────────────────────────────────────

const Icon = {
  Explorer: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M3 4h6l2 2h6v10H3V4z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
    </svg>
  ),
  Search: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="8.5" cy="8.5" r="5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M12.5 12.5L16 16" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  ),
  SourceControl: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="6" cy="5" r="2" stroke="currentColor" strokeWidth="1.2"/>
      <circle cx="6" cy="15" r="2" stroke="currentColor" strokeWidth="1.2"/>
      <circle cx="14" cy="8" r="2" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M6 7v6" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M6 7c0-1 2-3 4-3h1a3 3 0 0 1 3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  ),
  RunDebug: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M7 5l8 5-8 5V5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
      <path d="M3 10h1M16 10h1M5 5.5l.7.7M14.3 14.5l.7.7M5 14.5l.7-.7M14.3 5.5l.7-.7"
            stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  ),
  Remote: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="3" y="7" width="14" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M7 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.2"/>
      <circle cx="10" cy="11.5" r="1.5" fill="currentColor"/>
    </svg>
  ),
  GitHub: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 2a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.39v-1.35c-2.34.51-2.83-1.23-2.83-1.23-.38-.97-.93-1.23-.93-1.23-.76-.52.06-.51.06-.51.84.06 1.28.86 1.28.86.75 1.28 1.96.91 2.44.7.07-.54.29-.91.53-1.12-1.86-.21-3.81-.93-3.81-4.14 0-.91.33-1.66.86-2.25-.09-.21-.37-1.06.08-2.21 0 0 .7-.22 2.3.86a7.96 7.96 0 0 1 4.2 0c1.6-1.08 2.3-.86 2.3-.86.45 1.15.17 2 .08 2.21.54.59.86 1.34.86 2.25 0 3.22-1.96 3.93-3.83 4.13.3.26.57.77.57 1.55v2.3c0 .22.15.48.58.4A8 8 0 0 0 10 2z"
            fill="currentColor"/>
    </svg>
  ),
  Database: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M3 5c0-1.5 3.5-2 7-2s7 .5 7 2-3.5 2-7 2-7-.5-7-2z" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M3 5v10c0 1.5 3.5 2 7 2s7-.5 7-2V5" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
      <path d="M3 10c0 1.5 3.5 2 7 2s7-.5 7-2" stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  ),
  ChevronRight: ({ size = 12 }: { size?: number }) => (

    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M4.5 2.5L8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.3"
            strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  ChevronDown: ({ size = 12 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.3"
            strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  More: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="3" cy="8" r="1.3" fill="currentColor"/>
      <circle cx="8" cy="8" r="1.3" fill="currentColor"/>
      <circle cx="13" cy="8" r="1.3" fill="currentColor"/>
    </svg>
  ),
  File: ({ ext }: { ext?: string }) => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M3 1h6l3 3v9H3V1z" stroke={extColor(ext)} strokeWidth="1" strokeLinejoin="round"/>
      <path d="M9 1v3h3" stroke={extColor(ext)} strokeWidth="1"/>
    </svg>
  ),
  Folder: ({ open }: { open?: boolean }) => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      {open
        ? <path d="M1 4h4l1.5 1.5H13L12 11H2L1 4z" stroke="var(--solar-yellow)" strokeWidth="1" strokeLinejoin="round"/>
        : <path d="M1 3h4l1.5 1.5H13v7H1V3z" stroke="var(--solar-yellow)" strokeWidth="1" strokeLinejoin="round"/>
      }
    </svg>
  ),
  Sync: () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M2 7a5 5 0 0 1 9-3M12 7a5 5 0 0 1-9 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M11 3.5V6h-2.5M3 10.5V8H5.5" stroke="currentColor" strokeWidth="1.2"
            strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Refresh: ({ size = 12 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M10 6A4 4 0 1 1 6 2h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M9 0v3H6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Plus: ({ size = 12 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  Minus: ({ size = 12 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  Trash: ({ size = 12 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2 3h8M5 3V2h2v1M4 3v6h4V3" stroke="currentColor" strokeWidth="1.2"
            strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Play: ({ size = 12 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M3 2l7 4-7 4V2z" fill="currentColor"/>
    </svg>
  ),
  Stop: ({ size = 12 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="8" height="8" rx="1" fill="currentColor"/>
    </svg>
  ),
  StepOver: ({ size = 12 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2 6h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M6 4l2 2-2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M5 2a4 4 0 0 1 0 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
    </svg>
  ),
  StepInto: ({ size = 12 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M6 2v6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M4 6l2 2 2-2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="6" cy="10" r="1" fill="currentColor"/>
    </svg>
  ),
  StepOut: ({ size = 12 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M6 10V4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M4 6l2-2 2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="6" cy="2" r="1" fill="currentColor"/>
    </svg>
  ),
  Sparkle: ({ size = 14 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M7 1v2M7 11v2M1 7h2M11 7h2M3.05 3.05l1.41 1.41M9.54 9.54l1.41 1.41M3.05 10.95l1.41-1.41M9.54 4.46l1.41-1.41"
            stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  ),
  Check: ({ size = 12 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  XMark: ({ size = 12 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  Spinner: ({ size = 12 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true"
         style={{ animation: 'iam-spin 1s linear infinite', flexShrink: 0 }}>
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"
              strokeLinecap="round" strokeDasharray="14 8"/>
    </svg>
  ),
  Clock: ({ size = 12 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M6 3.5V6l1.5 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  ),
  Warning: ({ size = 12 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M6 1L11 10H1L6 1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
      <path d="M6 4.5v2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <circle cx="6" cy="8.5" r="0.7" fill="currentColor"/>
    </svg>
  ),
  Info: ({ size = 12 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M6 5.5v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <circle cx="6" cy="3.5" r="0.7" fill="currentColor"/>
    </svg>
  ),
  ErrorCircle: ({ size = 12 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M4 4l4 4M8 4l-4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  ),
  Dot: ({ color, size = 8 }: { color: string; size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 8 8" fill="none" aria-hidden="true">
      <circle cx="4" cy="4" r="3" fill={color}/>
    </svg>
  ),
};

// ─────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────

function extColor(ext?: string): string {
  const map: Record<string, string> = {
    ts: '#3b82f6', tsx: '#38bdf8', js: '#facc15', jsx: '#f97316',
    css: '#a78bfa', json: '#6ee7b7', md: '#d1fae5', toml: '#fb923c',
    html: '#f87171', sh: '#86efac', txt: '#9ca3af', sql: '#f0abfc',
  };
  return map[ext ?? ''] ?? '#9ca3af';
}

function fileExt(name: string): string {
  return name.split('.').pop() ?? '';
}

// ─────────────────────────────────────────────
// PRIMITIVE UI COMPONENTS
// ─────────────────────────────────────────────

function SectionHeader({
  label, open, onToggle, count, actions,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  count?: number;
  actions?: React.ReactNode;
}) {
  return (
    <div
      className="iam-section-header"
      onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '4px 6px 4px 4px',
        cursor: 'pointer', userSelect: 'none',
        fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
        textTransform: 'uppercase', color: 'var(--text-secondary)',
        borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}
    >
      <span style={{ display: 'flex', flexShrink: 0 }}>
        {open ? <Icon.ChevronDown /> : <Icon.ChevronRight />}
      </span>
      <span style={{ flex: 1 }}>{label}</span>
      {count !== undefined && (
        <span style={{
          background: 'var(--color-primary)', color: '#fff', borderRadius: 10,
          padding: '0 5px', fontSize: 10, fontWeight: 700,
          minWidth: 16, height: 16, lineHeight: '16px',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {count}
        </span>
      )}
      {actions && (
        <span onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 2, marginLeft: 4 }}>
          {actions}
        </span>
      )}
    </div>
  );
}

function IconBtn({
  children, onClick, title, active, danger, disabled,
}: {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  title?: string;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        background: active ? 'var(--color-primary)22' : 'transparent',
        border: 'none',
        color: danger ? 'var(--solar-red)' : active ? 'var(--color-primary)' : 'var(--text-secondary)',
        padding: '2px 3px', borderRadius: 3,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: disabled ? 0.4 : 1, flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

function StatusBadge({ status }: { status: GitChange['status'] }) {
  const colors: Record<string, string> = {
    M: 'var(--solar-yellow)', A: 'var(--solar-green)',
    D: 'var(--solar-red)', R: 'var(--solar-cyan)',
    U: 'var(--solar-orange)', '?': 'var(--text-secondary)',
  };
  return (
    <span style={{
      fontFamily: 'monospace', fontSize: 10, fontWeight: 700,
      color: colors[status] ?? 'var(--text-secondary)',
      minWidth: 10, textAlign: 'center', flexShrink: 0,
    }}>
      {status}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
      {message}
    </div>
  );
}

function LoadingRow() {
  return (
    <div style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', fontSize: 12 }}>
      <Icon.Spinner /> Loading
    </div>
  );
}

// ─────────────────────────────────────────────
// HOOKS
// ─────────────────────────────────────────────

function useAsyncData<T>(
  fetchFn: (() => Promise<T>) | undefined,
  deps: unknown[] = [],
): { data: T | null; loading: boolean; error: string | null; refresh: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    if (!fetchFn) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchFn()
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) setError(e?.message ?? 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchFn, tick, ...deps]);

  return { data, loading, error, refresh };
}

function useSearch(onSearch?: LeftSidebarPanelProps['onSearch']) {
  const [params, setParams] = useState<SearchParams>({
    query: '', caseSensitive: false, wholeWord: false,
    useRegex: false, includePattern: '', excludePattern: '',
  });
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!params.query.trim() || !onSearch) { setResponse(null); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try { setResponse(await onSearch(params)); }
      catch { setResponse(null); }
      finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [params, onSearch]);

  return { params, setParams, response, searching };
}

// ─────────────────────────────────────────────
// EXPLORER PANEL
// ─────────────────────────────────────────────

function FileTreeNode({
  node, depth, onOpen, expanded, onToggle,
}: {
  node: FileNode;
  depth: number;
  onOpen: (path: string) => void;
  expanded: Set<string>;
  onToggle: (path: string) => void;
}) {
  const isOpen = expanded.has(node.path);
  const ext = fileExt(node.name);
  return (
    <>
      <div
        className="iam-file-tree-row"
        onClick={() => node.type === 'directory' ? onToggle(node.path) : onOpen(node.path)}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: `2px 6px 2px ${8 + depth * 12}px`,
          cursor: 'pointer', userSelect: 'none', fontSize: 13,
          color: node.status ? 'var(--solar-yellow)' : 'var(--text-primary)',
        }}
      >
        {node.type === 'directory' ? (
          <>
            <span style={{ display: 'flex', width: 12, flexShrink: 0, color: 'var(--text-secondary)' }}>
              {isOpen ? <Icon.ChevronDown size={10}/> : <Icon.ChevronRight size={10}/>}
            </span>
            <Icon.Folder open={isOpen}/>
          </>
        ) : (
          <>
            <span style={{ width: 12, flexShrink: 0 }}/>
            <Icon.File ext={ext}/>
          </>
        )}
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.name}
        </span>
        {node.status && <StatusBadge status={node.status}/>}
      </div>
      {node.type === 'directory' && isOpen && node.children?.map(child => (
        <FileTreeNode
          key={child.path} node={child} depth={depth + 1}
          onOpen={onOpen} expanded={expanded} onToggle={onToggle}
        />
      ))}
    </>
  );
}

function ExplorerPanel({
  workspaceName, activeFile, onFileOpen,
  fetchFileTree, fetchOutline, fetchTimeline,
}: LeftSidebarPanelProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [outlineExpanded, setOutlineExpanded] = useState<Set<string>>(new Set());

  const treeResult = useAsyncData(fetchFileTree);
  const fetchOutlineBound = useCallback(
    () => (activeFile && fetchOutline ? fetchOutline(activeFile) : Promise.resolve([])),
    [activeFile, fetchOutline],
  );
  const fetchTimelineBound = useCallback(
    () => (activeFile && fetchTimeline ? fetchTimeline(activeFile) : Promise.resolve([])),
    [activeFile, fetchTimeline],
  );
  const outlineResult = useAsyncData(activeFile ? fetchOutlineBound : undefined, [activeFile]);
  const timelineResult = useAsyncData(
    activeFile && timelineOpen ? fetchTimelineBound : undefined,
    [activeFile, timelineOpen],
  );

  const toggleTree = (path: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(path) ? n.delete(path) : n.add(path); return n; });
  const toggleOutline = (name: string) =>
    setOutlineExpanded(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n; });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Workspace label */}
      <div style={{
        padding: '6px 8px', fontSize: 11, fontWeight: 700,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)',
        userSelect: 'none', flexShrink: 0,
      }}>
        {workspaceName ?? 'No Workspace'}
      </div>

      {/* File tree */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {treeResult.loading && <LoadingRow/>}
        {treeResult.error && <EmptyState message={treeResult.error}/>}
        {!fetchFileTree && <EmptyState message="Wire fetchFileTree prop to browse files."/>}
        {(treeResult.data ?? []).map(node => (
          <FileTreeNode
            key={node.path} node={node} depth={0}
            onOpen={onFileOpen ?? (() => {})}
            expanded={expanded} onToggle={toggleTree}
          />
        ))}
      </div>

      {/* OUTLINE */}
      <div style={{ borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <SectionHeader
          label="Outline" open={outlineOpen} onToggle={() => setOutlineOpen(o => !o)}
          actions={<IconBtn title="Refresh outline" onClick={outlineResult.refresh}><Icon.Refresh/></IconBtn>}
        />
        {outlineOpen && (
          <div style={{ maxHeight: 160, overflowY: 'auto' }}>
            {outlineResult.loading && <LoadingRow/>}
            {!activeFile && <EmptyState message="Open a file to see its outline."/>}
            {activeFile && !outlineResult.loading && (outlineResult.data ?? []).length === 0 && (
              <EmptyState message="The active editor cannot provide outline information."/>
            )}
            {(outlineResult.data ?? []).map(sym => (
              <div key={sym.name}>
                <div
                  onClick={() => toggleOutline(sym.name)}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 12px', cursor: 'pointer', fontSize: 12, color: 'var(--text-primary)' }}
                >
                  {sym.children && (
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {outlineExpanded.has(sym.name) ? <Icon.ChevronDown size={10}/> : <Icon.ChevronRight size={10}/>}
                    </span>
                  )}
                  <span style={{ color: 'var(--solar-cyan)', fontFamily: 'monospace', fontSize: 10, minWidth: 12 }}>
                    {sym.kind === 'selector' ? '#' : sym.kind === 'property' ? '-' : sym.kind[0]?.toUpperCase() ?? '-'}
                  </span>
                  <span style={{ flex: 1 }}>{sym.name}</span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 10 }}>{sym.line}</span>
                </div>
                {sym.children && outlineExpanded.has(sym.name) && sym.children.map(child => (
                  <div
                    key={child.name}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 12px 2px 28px', fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}
                  >
                    <span style={{ color: 'var(--solar-blue)', fontFamily: 'monospace', fontSize: 10 }}>-</span>
                    <span style={{ flex: 1 }}>{child.name}</span>
                    <span style={{ fontSize: 10 }}>{child.line}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* TIMELINE */}
      <div style={{ borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <SectionHeader
          label="Timeline" open={timelineOpen} onToggle={() => setTimelineOpen(o => !o)}
          actions={<IconBtn title="Refresh timeline" onClick={timelineResult.refresh}><Icon.Refresh/></IconBtn>}
        />
        {timelineOpen && (
          <div style={{ maxHeight: 130, overflowY: 'auto' }}>
            {timelineResult.loading && <LoadingRow/>}
            {!activeFile && <EmptyState message="Open a file to see its history."/>}
            {activeFile && !timelineResult.loading && (timelineResult.data ?? []).length === 0 && (
              <EmptyState message="No timeline entries found."/>
            )}
            {(timelineResult.data ?? []).map((entry, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 12px', cursor: 'pointer', fontSize: 12 }}>
                <Icon.Dot color={entry.source === 'git' ? 'var(--solar-cyan)' : 'var(--text-secondary)'}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>{entry.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{entry.description}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// SEARCH PANEL
// ─────────────────────────────────────────────

function SearchPanel({ onSearch, onSearchSelect }: LeftSidebarPanelProps) {
  const { params, setParams, response, searching } = useSearch(onSearch);
  const [showReplace, setShowReplace] = useState(false);
  const [replaceValue, setReplaceValue] = useState('');
  const [groupedExpanded, setGroupedExpanded] = useState<Set<string>>(new Set());

  const update = (patch: Partial<SearchParams>) => setParams(p => ({ ...p, ...patch }));
  const grouped = (response?.results ?? []).reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.file] ??= []).push(r); return acc;
  }, {});
  const toggleGroup = (file: string) =>
    setGroupedExpanded(prev => { const n = new Set(prev); n.has(file) ? n.delete(file) : n.add(file); return n; });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '8px 8px 0', flexShrink: 0 }}>
        {/* Search row */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: 2,
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: 4, padding: '3px 6px',
          }}>
            <input
              value={params.query}
              onChange={e => update({ query: e.target.value })}
              placeholder="Search"
              style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: 13, outline: 'none', minWidth: 0 }}
            />
            <IconBtn title="Match Case" active={params.caseSensitive} onClick={() => update({ caseSensitive: !params.caseSensitive })}>
              <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'monospace' }}>Aa</span>
            </IconBtn>
            <IconBtn title="Match Whole Word" active={params.wholeWord} onClick={() => update({ wholeWord: !params.wholeWord })}>
              <span style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 700 }}>W</span>
            </IconBtn>
            <IconBtn title="Use Regular Expression" active={params.useRegex} onClick={() => update({ useRegex: !params.useRegex })}>
              <span style={{ fontSize: 10, fontFamily: 'monospace' }}>.*</span>
            </IconBtn>
          </div>
          <IconBtn title="Toggle Replace" onClick={() => setShowReplace(v => !v)} active={showReplace}>
            <Icon.ChevronRight size={10}/>
          </IconBtn>
        </div>
        {showReplace && (
          <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            <div style={{ flex: 1, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 6px' }}>
              <input
                value={replaceValue}
                onChange={e => setReplaceValue(e.target.value)}
                placeholder="Replace"
                style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}
              />
            </div>
          </div>
        )}
        {(['include', 'exclude'] as const).map(kind => (
          <div key={kind} style={{ marginBottom: 4 }}>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 2 }}>files to {kind}</div>
            <input
              value={kind === 'include' ? params.includePattern : params.excludePattern}
              onChange={e => update(kind === 'include' ? { includePattern: e.target.value } : { excludePattern: e.target.value })}
              placeholder={kind === 'include' ? 'e.g. *.ts, src/**' : 'e.g. node_modules, dist'}
              style={{ width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 6px', color: 'var(--text-primary)', fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
        ))}
        {params.query && (
          <div style={{ padding: '3px 0 6px', fontSize: 11, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
            {searching
              ? <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Icon.Spinner size={10}/> Searching</span>
              : response ? <>{response.totalResults.toLocaleString()} results in {response.totalFiles} files</> : null
            }
          </div>
        )}
        {!onSearch && <EmptyState message="Wire onSearch prop to enable workspace search."/>}
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {!params.query && onSearch && <EmptyState message="Type to search across your workspace."/>}
        {Object.entries(grouped).map(([file, hits]) => {
          const isOpen = groupedExpanded.has(file);
          const parts = file.split('/');
          const filename = parts.pop()!;
          const dir = parts.join('/');
          return (
            <div key={file}>
              <div
                onClick={() => toggleGroup(file)}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 12 }}
              >
                {isOpen ? <Icon.ChevronDown size={10}/> : <Icon.ChevronRight size={10}/>}
                <Icon.File ext={fileExt(filename)}/>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{filename}</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{dir}</span>
                <span style={{ marginLeft: 'auto', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', borderRadius: 8, padding: '0 5px', fontSize: 10 }}>{hits.length}</span>
              </div>
              {isOpen && hits.map((hit, i) => (
                <div
                  key={i}
                  onClick={() => onSearchSelect?.(hit)}
                  className="iam-file-tree-row"
                  style={{ padding: '2px 8px 2px 28px', cursor: 'pointer', fontSize: 12, fontFamily: 'monospace', color: 'var(--text-secondary)', display: 'flex', gap: 6 }}
                >
                  <span style={{ color: 'var(--text-secondary)', minWidth: 28, textAlign: 'right', flexShrink: 0 }}>{hit.line}</span>
                  <span>
                    {hit.text.slice(0, hit.matchStart)}
                    <mark style={{ background: 'var(--solar-yellow)33', color: 'var(--solar-yellow)', borderRadius: 2 }}>
                      {hit.text.slice(hit.matchStart, hit.matchEnd)}
                    </mark>
                    {hit.text.slice(hit.matchEnd)}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// SOURCE CONTROL PANEL
// Three stacked collapsible sections — no tabs
// ─────────────────────────────────────────────

/** Collapsible panel section with IAM teal accent styling */
function ScSection({
  label, open, onToggle, count, accent = false, actions, children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  count?: number;
  accent?: boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      borderBottom: '1px solid var(--border)',
      borderLeft: open && accent ? '2px solid var(--color-primary)' : '2px solid transparent',
      transition: 'border-color 0.15s',
    }}>
      {/* Section header */}
      <div
        className="iam-section-header"
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '5px 8px 5px 6px',
          cursor: 'pointer', userSelect: 'none',
          background: open ? 'var(--color-primary)0c' : 'transparent',
          transition: 'background 0.12s',
        }}
      >
        <span style={{ display: 'flex', color: open ? 'var(--color-primary)' : 'var(--text-secondary)', flexShrink: 0 }}>
          {open ? <Icon.ChevronDown size={11}/> : <Icon.ChevronRight size={11}/>}
        </span>
        <span style={{
          flex: 1, fontSize: 11, fontWeight: 600,
          letterSpacing: '0.06em', textTransform: 'uppercase',
          color: open ? 'var(--color-primary)' : 'var(--text-secondary)',
        }}>
          {label}
        </span>
        {count !== undefined && (
          <span style={{
            background: open ? 'var(--color-primary)' : 'var(--color-primary)44',
            color: open ? '#fff' : 'var(--color-primary)',
            borderRadius: 10, padding: '0 5px',
            fontSize: 10, fontWeight: 700,
            minWidth: 16, height: 16, lineHeight: '16px',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.12s',
          }}>
            {count}
          </span>
        )}
        {actions && (
          <span onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 2, marginLeft: 4 }}>
            {actions}
          </span>
        )}
      </div>

      {/* Animated body */}
      {open && (
        <div style={{ background: 'var(--color-primary)05' }}>
          {children}
        </div>
      )}
    </div>
  );
}

function SourceControlPanel({
  fetchGitStatus, fetchCommits, onCommit, onStage, onUnstage, onAgentReview,
}: LeftSidebarPanelProps) {
  const [changesOpen, setChangesOpen] = useState(true);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [graphOpen, setGraphOpen] = useState(false);

  const [message, setMessage] = useState('');
  const [localChanges, setLocalChanges] = useState<GitChange[] | null>(null);
  const [committing, setCommitting] = useState(false);
  const [reviewRunning, setReviewRunning] = useState(false);
  const [reviewIssues, setReviewIssues] = useState<AgentIssue[]>([]);

  const statusResult = useAsyncData(fetchGitStatus);
  const commitsResult = useAsyncData(fetchCommits);

  const changes: GitChange[] = localChanges ?? statusResult.data?.changes ?? [];
  const staged = changes.filter(c => c.staged);
  const unstaged = changes.filter(c => !c.staged);

  const handleStage = async (path: string) => {
    setLocalChanges(changes.map(c => c.path === path ? { ...c, staged: true } : c));
    await onStage?.(path);
  };
  const handleUnstage = async (path: string) => {
    setLocalChanges(changes.map(c => c.path === path ? { ...c, staged: false } : c));
    await onUnstage?.(path);
  };
  const handleStageAll = () => {
    setLocalChanges(changes.map(c => ({ ...c, staged: true })));
    unstaged.forEach(c => onStage?.(c.path));
  };
  const handleCommit = async () => {
    if (!message.trim() || staged.length === 0) return;
    setCommitting(true);
    try {
      await onCommit?.(message, staged);
      setMessage(''); setLocalChanges(null); statusResult.refresh();
    } finally { setCommitting(false); }
  };
  const handleFindIssues = async () => {
    if (!onAgentReview) return;
    setReviewRunning(true); setReviewIssues([]);
    try { setReviewIssues(await onAgentReview(changes)); }
    finally { setReviewRunning(false); }
  };

  const severityIcon = (s: AgentIssue['severity']) => {
    if (s === 'error') return <Icon.ErrorCircle size={11}/>;
    if (s === 'warning') return <Icon.Warning size={11}/>;
    return <Icon.Info size={11}/>;
  };
  const severityColor = (s: AgentIssue['severity']) =>
    s === 'error' ? 'var(--solar-red)' : s === 'warning' ? 'var(--solar-orange)' : 'var(--solar-blue)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>

      {/* Branch / sync bar */}
      {statusResult.data && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 10px',
          background: 'var(--color-primary)08',
          borderBottom: '1px solid var(--border)',
          fontSize: 11, flexShrink: 0,
        }}>
          <Icon.SourceControl />
          <span style={{ color: 'var(--color-primary)', fontFamily: 'monospace', fontWeight: 600, flex: 1 }}>
            {statusResult.data.branch}
          </span>
          <span style={{ color: 'var(--text-secondary)' }}>
            {statusResult.data.ahead > 0 && `${statusResult.data.ahead}\u2191`}
            {statusResult.data.behind > 0 && ` ${statusResult.data.behind}\u2193`}
          </span>
          <IconBtn title="Sync with remote" onClick={statusResult.refresh}>
            <Icon.Sync/>
          </IconBtn>
        </div>
      )}

      {/* Commit input — always visible at top */}
      <div style={{
        padding: '8px 8px 6px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        background: 'var(--bg-panel)',
      }}>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="Message (commit)"
          rows={2}
          onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) handleCommit(); }}
          style={{
            width: '100%', background: 'var(--bg-elevated)',
            border: `1px solid ${message.trim() ? 'var(--color-primary)66' : 'var(--border)'}`,
            borderRadius: 4, padding: '5px 8px',
            color: 'var(--text-primary)', fontSize: 12,
            resize: 'none', outline: 'none',
            boxSizing: 'border-box', fontFamily: 'inherit',
            transition: 'border-color 0.15s',
          }}
        />
        <button
          onClick={handleCommit}
          disabled={!message.trim() || staged.length === 0 || committing}
          style={{
            width: '100%', marginTop: 5,
            background: message.trim() && staged.length > 0
              ? 'var(--color-primary)'
              : 'var(--color-primary)33',
            color: message.trim() && staged.length > 0 ? '#fff' : 'var(--color-primary)',
            border: '1px solid var(--color-primary)66',
            borderRadius: 4, padding: '5px 8px',
            cursor: !message.trim() || staged.length === 0 || committing ? 'not-allowed' : 'pointer',
            fontSize: 12, fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            transition: 'background 0.15s, color 0.15s',
          }}
        >
          {committing && <Icon.Spinner size={11}/>}
          Commit{staged.length > 0 ? ` (${staged.length})` : ''}
        </button>
      </div>

      {/* Error state */}
      {statusResult.error && (
        <div style={{ padding: '8px 10px', background: 'var(--solar-red)11', borderBottom: '1px solid var(--solar-red)33' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--solar-red)', fontSize: 12, marginBottom: 5 }}>
            <Icon.Warning size={13}/> Failed to fetch git status
          </div>
          <button
            onClick={statusResult.refresh}
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 11 }}
          >
            Try Again
          </button>
        </div>
      )}

      {/* ── CHANGES SECTION ── */}
      <ScSection
        label="Changes"
        open={changesOpen}
        onToggle={() => setChangesOpen(v => !v)}
        count={changes.length}
        accent
        actions={
          <>
            <IconBtn title="Discard All" danger><Icon.Trash/></IconBtn>
            <IconBtn title="Stage All" onClick={handleStageAll}><Icon.Plus/></IconBtn>
          </>
        }
      >
        {statusResult.loading && <LoadingRow/>}
        {!fetchGitStatus && <EmptyState message="Wire fetchGitStatus prop to show changes."/>}

        {/* Staged sub-group */}
        {staged.length > 0 && (
          <>
            <div style={{ padding: '3px 10px', fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--solar-green)', background: 'var(--solar-green)0a', borderBottom: '1px solid var(--border)' }}>
              Staged
            </div>
            {staged.map(c => (
              <ChangeRow key={c.path + '-s'} change={c}
                action={<IconBtn title="Unstage" onClick={() => handleUnstage(c.path)}><Icon.Minus/></IconBtn>}
              />
            ))}
          </>
        )}

        {/* Unstaged sub-group */}
        {unstaged.length > 0 && (
          <>
            {staged.length > 0 && (
              <div style={{ padding: '3px 10px', fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--solar-yellow)', background: 'var(--solar-yellow)0a', borderBottom: '1px solid var(--border)' }}>
                Unstaged
              </div>
            )}
            {unstaged.map(c => (
              <ChangeRow key={c.path + '-u'} change={c}
                action={<IconBtn title="Stage" onClick={() => handleStage(c.path)}><Icon.Plus/></IconBtn>}
              />
            ))}
          </>
        )}

        {changes.length === 0 && !statusResult.loading && fetchGitStatus && (
          <EmptyState message="No changes. Working tree clean."/>
        )}
      </ScSection>

      {/* ── AGENT REVIEW SECTION ── */}
      <ScSection
        label="Agent Review"
        open={reviewOpen}
        onToggle={() => setReviewOpen(v => !v)}
        count={reviewIssues.length > 0 ? reviewIssues.length : undefined}
        accent
      >
        <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
          <button
            onClick={handleFindIssues}
            disabled={reviewRunning || !onAgentReview}
            style={{
              width: '100%',
              background: reviewRunning ? 'var(--color-primary)18' : 'var(--color-primary)22',
              border: '1px solid var(--color-primary)88',
              color: 'var(--color-primary)', borderRadius: 4,
              padding: '5px 10px',
              cursor: reviewRunning || !onAgentReview ? 'not-allowed' : 'pointer',
              fontSize: 12, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              opacity: !onAgentReview ? 0.4 : 1,
              letterSpacing: '0.02em',
            }}
          >
            {reviewRunning ? <Icon.Spinner size={12}/> : <Icon.Sparkle size={12}/>}
            {reviewRunning ? 'Analyzing' : 'Find Issues'}
          </button>
          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--color-primary)99', cursor: 'pointer', textAlign: 'center' }}>
            Review diffs
          </div>
        </div>

        {!onAgentReview && <EmptyState message="Wire onAgentReview prop to enable AI review."/>}
        {onAgentReview && !reviewRunning && reviewIssues.length === 0 && (
          <EmptyState message='Run "Find Issues" to review your current diffs.'/>
        )}
        {reviewIssues.map((issue, i) => (
          <div key={i} style={{
            padding: '6px 12px 6px 10px',
            borderBottom: '1px solid var(--border)',
            borderLeft: `3px solid ${severityColor(issue.severity)}`,
            fontSize: 12, display: 'flex', gap: 7, alignItems: 'flex-start',
          }}>
            <span style={{ flexShrink: 0, marginTop: 1, color: severityColor(issue.severity) }}>
              {severityIcon(issue.severity)}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: 'monospace', color: 'var(--text-secondary)', fontSize: 10, marginBottom: 2 }}>
                {issue.file}:{issue.line}
              </div>
              <div style={{ color: severityColor(issue.severity) }}>{issue.message}</div>
            </div>
          </div>
        ))}
      </ScSection>

      {/* ── GRAPH SECTION ── */}
      <ScSection
        label="Graph"
        open={graphOpen}
        onToggle={() => setGraphOpen(v => !v)}
        accent
      >
        {commitsResult.loading && <LoadingRow/>}
        {!fetchCommits && <EmptyState message="Wire fetchCommits prop to show git history."/>}
        {commitsResult.error && <EmptyState message={commitsResult.error}/>}
        {(commitsResult.data ?? []).length > 0 && <CommitGraph commits={commitsResult.data!}/>}
        {!commitsResult.loading && !commitsResult.error && (commitsResult.data ?? []).length === 0 && fetchCommits && (
          <EmptyState message="No commits found."/>
        )}
      </ScSection>

    </div>
  );
}

const STATUS_BORDER: Record<string, string> = {
  M: 'var(--solar-yellow)', A: 'var(--solar-green)',
  D: 'var(--solar-red)', R: 'var(--solar-cyan)',
  U: 'var(--solar-orange)', '?': 'var(--text-secondary)',
};

function ChangeRow({ change, action }: { change: GitChange; action: React.ReactNode }) {
  const parts = change.path.split('/');
  const filename = parts.pop()!;
  const dir = parts.join('/');
  return (
    <div
      className="iam-change-row"
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '4px 8px 4px 10px', fontSize: 12, cursor: 'pointer',
        borderLeft: `2px solid ${STATUS_BORDER[change.status] ?? 'var(--text-secondary)'}44`,
      }}
    >
      <StatusBadge status={change.status}/>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        <span style={{ color: 'var(--text-primary)' }}>{filename}</span>
        {dir && <span style={{ color: 'var(--text-secondary)', marginLeft: 4, fontSize: 10 }}>{dir}</span>}
      </span>
      {action}
    </div>
  );
}

function CommitGraph({ commits }: { commits: Commit[] }) {
  // Interpunct via charCode — no emoji, no hardcoded symbol
  const dot = String.fromCharCode(183);
  return (
    <div style={{ fontFamily: 'monospace', fontSize: 12 }}>
      {commits.map((c, i) => (
        <div key={c.hash} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '5px 10px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
          {/* Graph line */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 12, flexShrink: 0, paddingTop: 2 }}>
            <div style={{ width: 1, height: 6, background: i === 0 ? 'transparent' : 'var(--color-primary)' }}/>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: c.branch ? 'var(--color-primary)' : 'var(--solar-cyan)', border: '2px solid var(--bg-app)', flexShrink: 0 }}/>
            <div style={{ width: 1, flex: 1, minHeight: 6, background: i === commits.length - 1 ? 'transparent' : 'var(--color-primary)' }}/>
          </div>
          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginBottom: 2 }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: 10 }}>{c.shortHash}</span>
              {c.tags?.map(tag => (
                <span key={tag} style={{ background: 'var(--color-primary)', color: '#fff', borderRadius: 3, padding: '0 5px', fontSize: 9, fontWeight: 700 }}>{tag}</span>
              ))}
            </div>
            <div style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.message}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 10, marginTop: 2 }}>{c.author} {dot} {c.date}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// RUN & DEBUG PANEL
// ─────────────────────────────────────────────

function RunDebugPanel({ fetchDebugConfigs, onLaunchDebug, onStopDebug }: LeftSidebarPanelProps) {
  const configsResult = useAsyncData(fetchDebugConfigs);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [running, setRunning] = useState(false);
  const [watchExprs, setWatchExprs] = useState<string[]>([]);
  const [breakpoints] = useState<{ file: string; line: number; enabled: boolean }[]>([]);
  const [stackOpen, setStackOpen] = useState(true);
  const [variablesOpen, setVariablesOpen] = useState(true);
  const [watchOpen, setWatchOpen] = useState(true);
  const [bpOpen, setBpOpen] = useState(true);

  const configs = configsResult.data ?? [];
  const selected = configs[selectedIdx];

  const handleLaunch = async () => {
    if (!selected) return;
    setRunning(true);
    try { await onLaunchDebug?.(selected); } catch { setRunning(false); }
  };
  const handleStop = async () => {
    await onStopDebug?.();
    setRunning(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Config selector + toolbar */}
      <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 6 }}>
          {configsResult.loading
            ? <LoadingRow/>
            : !fetchDebugConfigs
              ? <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1 }}>Wire fetchDebugConfigs to load configs</span>
              : configs.length === 0
                ? <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1 }}>No configurations found</span>
                : (
                  <select
                    value={selectedIdx}
                    onChange={e => setSelectedIdx(+e.target.value)}
                    style={{ flex: 1, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)', padding: '3px 6px', fontSize: 12, outline: 'none' }}
                  >
                    {configs.map((c, i) => <option key={i} value={i}>{c.name}</option>)}
                  </select>
                )
          }
          <IconBtn title="Add Configuration"><Icon.Plus/></IconBtn>
        </div>
        <div style={{ display: 'flex', gap: 3 }}>
          <IconBtn title={running ? 'Stop' : 'Start Debugging'} onClick={running ? handleStop : handleLaunch} disabled={configs.length === 0} active={running}>
            {running ? <Icon.Stop/> : <Icon.Play/>}
          </IconBtn>
          {running && (
            <>
              <IconBtn title="Step Over"><Icon.StepOver/></IconBtn>
              <IconBtn title="Step Into"><Icon.StepInto/></IconBtn>
              <IconBtn title="Step Out"><Icon.StepOut/></IconBtn>
              <IconBtn title="Restart" onClick={async () => { await handleStop(); await handleLaunch(); }}>
                <Icon.Refresh/>
              </IconBtn>
            </>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <SectionHeader label="Variables" open={variablesOpen} onToggle={() => setVariablesOpen(v => !v)}/>
        {variablesOpen && <EmptyState message={running ? 'Paused — no frame selected' : 'Not running'}/>}

        <SectionHeader
          label="Watch" open={watchOpen} onToggle={() => setWatchOpen(v => !v)}
          actions={
            <IconBtn title="Add Watch Expression" onClick={() => {
              const expr = window.prompt?.('Watch expression:')?.trim() ?? '';
              if (expr) setWatchExprs(e => [...e, expr]);
            }}>
              <Icon.Plus/>
            </IconBtn>
          }
        />
        {watchOpen && watchExprs.length === 0 && <EmptyState message="No watch expressions."/>}
        {watchOpen && watchExprs.map(expr => (
          <div key={expr} style={{ padding: '3px 12px 3px 24px', fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ color: 'var(--solar-blue)', flex: 1 }}>{expr}</span>
            <span style={{ color: 'var(--text-secondary)' }}>not available</span>
            <IconBtn danger onClick={() => setWatchExprs(e => e.filter(x => x !== expr))}><Icon.XMark size={10}/></IconBtn>
          </div>
        ))}

        <SectionHeader label="Call Stack" open={stackOpen} onToggle={() => setStackOpen(v => !v)}/>
        {stackOpen && <EmptyState message={running ? 'No call stack' : 'Not paused'}/>}

        <SectionHeader
          label="Breakpoints" open={bpOpen} onToggle={() => setBpOpen(v => !v)} count={breakpoints.length}
          actions={
            <>
              <IconBtn title="Remove All Breakpoints" danger><Icon.Trash/></IconBtn>
              <IconBtn title="Toggle All Breakpoints"><Icon.Play size={10}/></IconBtn>
            </>
          }
        />
        {bpOpen && breakpoints.length === 0 && <EmptyState message="No breakpoints set."/>}
        {bpOpen && breakpoints.map((bp, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 12px 3px 24px', fontSize: 12 }}>
            <input type="checkbox" checked={bp.enabled} readOnly style={{ accentColor: 'var(--solar-red)', flexShrink: 0 }}/>
            <Icon.File ext={fileExt(bp.file)}/>
            <span style={{ color: 'var(--text-primary)', flex: 1 }}>{bp.file}</span>
            <span style={{ color: 'var(--text-secondary)' }}>:{bp.line}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// REMOTE EXPLORER PANEL
// ─────────────────────────────────────────────

function RemoteExplorerPanel({ fetchSshTargets, onSshConnect }: LeftSidebarPanelProps) {
  const result = useAsyncData(fetchSshTargets);
  const [open, setOpen] = useState(true);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <SectionHeader
        label="SSH Environments" open={open} onToggle={() => setOpen(v => !v)}
        actions={<IconBtn title="Refresh" onClick={result.refresh}><Icon.Refresh/></IconBtn>}
      />
      {result.loading && <LoadingRow/>}
      {!fetchSshTargets && <EmptyState message="Wire fetchSshTargets prop to list SSH targets."/>}
      {open && (result.data ?? []).map(target => (
        <div
          key={target.host}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px 5px 20px', cursor: 'pointer', fontSize: 12 }}
        >
          <Icon.Dot color={target.connected ? 'var(--solar-green)' : 'var(--text-secondary)'}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{target.label}</div>
            {target.user && <div style={{ color: 'var(--text-secondary)', fontSize: 10 }}>{target.user}@{target.host}</div>}
          </div>
          <button
            onClick={() => onSshConnect?.(target)}
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}
          >
            {target.connected ? 'Open' : 'Connect'}
          </button>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// GITHUB ACTIONS PANEL
// ─────────────────────────────────────────────

function WorkflowStatusIcon({ status }: { status: WorkflowRun['status'] }) {
  if (status === 'success')     return <span style={{ color: 'var(--solar-green)', display: 'flex' }}><Icon.Check size={13}/></span>;
  if (status === 'failure')     return <span style={{ color: 'var(--solar-red)', display: 'flex' }}><Icon.XMark size={13}/></span>;
  if (status === 'in_progress') return <span style={{ color: 'var(--solar-yellow)', display: 'flex' }}><Icon.Spinner size={13}/></span>;
  return <span style={{ color: 'var(--text-secondary)', display: 'flex' }}><Icon.Clock size={13}/></span>;
}

function GitHubActionsPanel({ fetchWorkflowRuns }: LeftSidebarPanelProps) {
  const result = useAsyncData(fetchWorkflowRuns);
  const dot = String.fromCharCode(183);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '6px 8px', fontSize: 11, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>GitHub Actions</span>
        <IconBtn title="Refresh" onClick={result.refresh}><Icon.Refresh/></IconBtn>
      </div>
      {result.loading && <LoadingRow/>}
      {!fetchWorkflowRuns && <EmptyState message="Wire fetchWorkflowRuns prop to show CI/CD status."/>}
      {(result.data ?? []).map((wf, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 12 }}>
          <WorkflowStatusIcon status={wf.status}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wf.name}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 10 }}>{wf.branch} {dot} {wf.updatedAt}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// ACTIVITY BAR
// ─────────────────────────────────────────────

interface ActivityBarProps {
  active: PanelId;
  onChange: (id: PanelId) => void;
  gitChangesCount: number;
  onNavigate?: (route: any) => void;
}

function ActivityBar({ active, onChange, gitChangesCount, onNavigate }: ActivityBarProps) {

  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const mainButtons: { id: string; icon: React.ReactNode; label: string; badge?: number; type?: 'route' | 'panel' }[] = [
    { id: 'explorer',       icon: <Icon.Explorer/>,      label: 'Explorer', type: 'panel' },
    { id: 'search',         icon: <Icon.Search/>,         label: 'Search', type: 'panel' },
    { id: 'source-control', icon: <Icon.SourceControl/>, label: 'Source Control', badge: gitChangesCount, type: 'panel' },
    { id: 'run-debug',      icon: <Icon.RunDebug/>,       label: 'Run and Debug', type: 'panel' },
    { id: 'database',       icon: <Icon.Database/>,       label: 'Database Explorer', type: 'route' },
  ];


  const moreItems: { id: PanelId; icon: React.ReactNode; label: string }[] = [
    { id: 'remote-explorer', icon: <Icon.Remote/>, label: 'Remote Explorer' },
    { id: 'github-actions',  icon: <Icon.GitHub/>, label: 'GitHub Actions' },
  ];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 1, padding: '4px 6px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
      {mainButtons.map(btn => (
        <button
          key={btn.id} 
          title={btn.label} 
          onClick={() => {
            if (btn.type === 'route' && onNavigate) {
              onNavigate(btn.id);
            } else {
              onChange(btn.id as PanelId);
              if (onNavigate) onNavigate('agent');
            }
          }}

          style={{

            position: 'relative', background: active === btn.id ? 'var(--color-primary)22' : 'transparent',
            border: 'none', color: active === btn.id ? 'var(--color-primary)' : 'var(--text-secondary)',
            padding: '5px 7px', borderRadius: 4, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.12s, color 0.12s',
          }}
        >
          {btn.icon}
          {btn.badge !== undefined && btn.badge > 0 && (
            <span style={{
              position: 'absolute', top: 2, right: 2,
              background: 'var(--color-primary)', color: '#fff', borderRadius: 8,
              fontSize: 9, fontWeight: 700, minWidth: 14, height: 14, lineHeight: '14px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
            }}>
              {btn.badge}
            </span>
          )}
        </button>
      ))}

      <div style={{ flex: 1 }}/>

      {/* More / chevron */}
      <div ref={moreRef} style={{ position: 'relative' }}>
        <button
          title="More views"
          onClick={() => setMoreOpen(v => !v)}
          style={{
            background: moreOpen ? 'var(--bg-elevated)' : 'transparent',
            border: 'none', color: 'var(--text-secondary)',
            padding: '5px 6px', borderRadius: 4, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 2,
          }}
        >
          <Icon.More/>
          <Icon.ChevronDown size={10}/>
        </button>

        {moreOpen && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 2px)', right: 0, zIndex: 200,
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: 6, padding: '4px 0', minWidth: 190,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}>
            {moreItems.map(item => (
              <button
                key={item.id}
                onClick={() => { onChange(item.id); setMoreOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', background: active === item.id ? 'var(--color-primary)22' : 'transparent',
                  border: 'none', padding: '7px 14px',
                  color: active === item.id ? 'var(--color-primary)' : 'var(--text-primary)',
                  cursor: 'pointer', fontSize: 13, textAlign: 'left',
                }}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// ROOT COMPONENT
// ─────────────────────────────────────────────

export default function LeftSidebarPanel(props: LeftSidebarPanelProps) {
  const [activePanel, setActivePanel] = useState<PanelId>('explorer');
  const statusResult = useAsyncData(props.fetchGitStatus);
  const unstagedCount = (statusResult.data?.changes ?? []).filter(c => !c.staged).length;

  const panels: Record<PanelId, React.ReactNode> = {
    'explorer':        <ExplorerPanel {...props}/>,
    'search':          <SearchPanel {...props}/>,
    'source-control':  <SourceControlPanel {...props}/>,
    'run-debug':       <RunDebugPanel {...props}/>,
    'remote-explorer': <RemoteExplorerPanel {...props}/>,
    'github-actions':  <GitHubActionsPanel {...props}/>,
    'cad':             <StudioSidebar {...(props as any)} />,
    'projects':        <div className="p-4 text-[10px] uppercase opacity-40">Projects Panel coming soon</div>,
    'drive':           <div className="p-4 text-[10px] uppercase opacity-40">Google Drive coming soon</div>,
    'playwright':      <div className="p-4 text-[10px] uppercase opacity-40">Playwright CLI coming soon</div>,
  };

  return (
    <div
      className={props.className}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-panel)', borderRight: '1px solid var(--border)', overflow: 'hidden' }}
    >
      <ActivityBar 
        active={activePanel} 
        onChange={setActivePanel} 
        gitChangesCount={unstagedCount}
        onNavigate={props.onNavigate}
      />

      {!props.isCollapsed && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {panels[activePanel]}
        </div>
      )}

      <style>{`
        @keyframes iam-spin { to { transform: rotate(360deg); } }
        .iam-file-tree-row:hover { background: var(--color-primary, #2dd4bf)0f; }
        .iam-change-row:hover   { background: var(--color-primary, #2dd4bf)0a; }
        .iam-section-header:hover { background: var(--color-primary, #2dd4bf)08; }
        input::placeholder, textarea::placeholder { color: var(--text-secondary); opacity: 0.6; }
      `}</style>
    </div>
  );
}

export {
  ExplorerPanel, SearchPanel, SourceControlPanel,
  RunDebugPanel, RemoteExplorerPanel, GitHubActionsPanel,
  ActivityBar,
};
