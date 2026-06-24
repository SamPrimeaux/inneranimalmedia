import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  MonitorDot,
  GitBranch,
  RefreshCw,
  XCircle,
  AlertTriangle,
  WrapText,
  Bell,
  Check,
  ChevronDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { SHELL_VERSION } from '../src/shellVersion';
import type { OpenCommandPaletteDetail } from '../src/lib/openCommandPalette';
import './StatusBar.css';

const SYNC_CONFIRM_SKIP_KEY = 'iam-git-sync-skip-confirm';

/** Cloudflare Worker name for this dashboard host (sandbox vs prod). */
export function resolveWorkerDisplayName(): string {
  if (typeof window === 'undefined') return 'inneranimalmedia';
  const h = window.location.hostname.toLowerCase();
  if (h.includes('inneranimal-dashboard')) return 'inneranimal-dashboard';
  if (h === 'inneranimalmedia.com' || h === 'www.inneranimalmedia.com') return 'inneranimalmedia';
  if (h.endsWith('.inneranimalmedia.com')) return 'inneranimalmedia';
  if (h.endsWith('.workers.dev') && h.includes('inneranimalmedia')) return 'inneranimalmedia';
  return 'inneranimalmedia';
}

/** Strip emoji / variation selectors for status-line display (project rule: no emoji in product UI). */
function stripEmojiFromNotificationText(s: string | null | undefined): string {
  if (!s) return '';
  try {
    return s
      .replace(/\p{Extended_Pictographic}/gu, '')
      .replace(/\uFE0F/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  } catch {
    return s.replace(/\uFE0F/g, '').trim();
  }
}

export type AgentNotificationRow = {
  id: string;
  title?: string | null;
  subject?: string | null;
  message?: string | null;
  status?: string | null;
  created_at?: string | number | null;
};

export type GitBranchRow = {
  ref: string;
  sha?: string;
  protected?: boolean;
  subject?: string;
  date_relative?: string;
};

export interface WorkspaceMenuItem {
  id: string;
  label: string;
  slug: string;
  status: string;
  github_repo: string | null;
}

interface StatusBarProps {
  branch?: string;
  gitHash?: string | null;
  workspace?: string;
  /** When set, workspace chip opens a picker (Cursor-style) instead of only firing onWorkspaceClick. */
  workspaceMenuItems?: WorkspaceMenuItem[];
  activeWorkspaceId?: string | null;
  onWorkspaceMenuSelect?: (id: string) => void;
  errorCount?: number;
  warningCount?: number;
  line?: number;
  col?: number;
  showCursor?: boolean;
  version?: string;
  /** Worker /api/health */
  healthOk?: boolean | null;
  /** CF tunnel (auth) */
  tunnelHealthy?: boolean | null;
  tunnelLabel?: string | null;
  /** TERMINAL_WS_URL + secret configured */
  terminalOk?: boolean | null;
  /** Monaco model: "Spaces: 2" or "Tabs: 4" */
  indentLabel?: string;
  encodingLabel?: string;
  eolLabel?: string;
  notifications?: AgentNotificationRow[];
  notifUnreadCount?: number;
  onMarkNotificationRead?: (id: string) => void | Promise<void>;
  canFormatDocument?: boolean;
  onBrandClick?: () => void;
  onGitBranchClick?: () => void;
  onBranchSelect?: (branch: string) => void;
  onRefreshGitStatus?: () => void;
  /** Cursor-style sync — triggers Workers Builds deploy hook for active workspace. */
  onSyncPublish?: () => void | Promise<void>;
  syncBusy?: boolean;
  aheadCount?: number | null;
  behindCount?: number | null;
  trackingBranch?: string | null;
  /** Open global Cmd+K palette (deploy / wrangler commands). */
  onOpenCommandPalette?: (detail?: OpenCommandPaletteDetail) => void;
  onWorkspaceClick?: () => void;
  onErrorsClick?: () => void;
  onWarningsClick?: () => void;
  onCursorClick?: () => void;
  onVersionClick?: () => void;
  onFormatClick?: () => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  branch = '',
  gitHash = null,
  workspace = '',
  workspaceMenuItems,
  activeWorkspaceId = null,
  onWorkspaceMenuSelect,
  errorCount = 0,
  warningCount = 0,
  line = 1,
  col = 1,
  showCursor = false,
  version = SHELL_VERSION,
  healthOk = null,
  tunnelHealthy = null,
  tunnelLabel = null,
  terminalOk = null,
  indentLabel = 'Spaces: 2',
  encodingLabel = 'UTF-8',
  eolLabel = 'LF',
  notifications = [],
  notifUnreadCount = 0,
  onMarkNotificationRead,
  canFormatDocument = false,
  onBrandClick,
  onGitBranchClick,
  onBranchSelect,
  onRefreshGitStatus,
  onSyncPublish,
  syncBusy = false,
  aheadCount = null,
  behindCount = null,
  trackingBranch = null,
  onOpenCommandPalette,
  onWorkspaceClick,
  onErrorsClick,
  onWarningsClick,
  onCursorClick,
  onVersionClick,
  onFormatClick,
}) => {
  const [chatModeLabel, setChatModeLabel] = useState<string>('');
  const [notifOpen, setNotifOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const [showRemoteMenu, setRemoteMenu] = useState(false);
  const remoteRef = useRef<HTMLDivElement>(null);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const branchChipRef = useRef<HTMLButtonElement>(null);
  const branchPanelRef = useRef<HTMLDivElement>(null);
  const [branchPanelStyle, setBranchPanelStyle] = useState<React.CSSProperties>({});
  const [branchData, setBranchData] = useState<{
    current: string;
    repo: string;
    branches: GitBranchRow[];
  } | null>(null);
  const [branchLoading, setBranchLoading] = useState(false);
  const [branchError, setBranchError] = useState<string | null>(null);
  const [branchMenuFilter, setBranchMenuFilter] = useState('');
  const [showWorkspaceMenu, setWorkspaceMenu] = useState(false);
  const workspaceMenuRef = useRef<HTMLDivElement>(null);
  const [syncConfirmOpen, setSyncConfirmOpen] = useState(false);
  const [syncSkipConfirm, setSyncSkipConfirm] = useState(() => {
    try {
      return localStorage.getItem(SYNC_CONFIRM_SKIP_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const onMode = (ev: Event) => {
      const d = (ev as CustomEvent<{ label?: string }>).detail;
      if (d?.label != null) setChatModeLabel(String(d.label));
    };
    window.addEventListener('iam-chat-mode', onMode as EventListener);
    return () => window.removeEventListener('iam-chat-mode', onMode as EventListener);
  }, []);

  useEffect(() => {
    if (!notifOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNotifOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current && !panelRef.current.contains(t)) setNotifOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [notifOpen]);

  useEffect(() => {
    if (!showRemoteMenu) return;
    const handler = (e: MouseEvent) => {
      if (remoteRef.current && !remoteRef.current.contains(e.target as Node)) {
        setRemoteMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showRemoteMenu]);

  const loadBranches = useCallback(async () => {
    setBranchLoading(true);
    setBranchError(null);
    try {
      const ws = activeWorkspaceId?.trim();
      const url = ws
        ? `/api/agent/git/branches?workspace_id=${encodeURIComponent(ws)}`
        : '/api/agent/git/branches';
      const res = await fetch(url, { credentials: 'same-origin' });
      const json = (await res.json()) as {
        current?: string;
        repo?: string;
        branches?: GitBranchRow[];
        error?: string;
      };
      if (!res.ok) setBranchError(json.error || 'Failed to load branches');
      else
        setBranchData({
          current: json.current || 'main',
          repo: json.repo || '',
          branches: Array.isArray(json.branches)
            ? json.branches.map((b) => ({
                ref: b.ref,
                sha: b.sha,
                protected: b.protected ?? false,
                subject: b.subject,
                date_relative: b.date_relative,
              }))
            : [],
        });
    } catch {
      setBranchError('Network error');
    } finally {
      setBranchLoading(false);
    }
  }, [activeWorkspaceId]);

  useEffect(() => {
    setBranchData(null);
    setBranchError(null);
  }, [activeWorkspaceId]);

  useLayoutEffect(() => {
    if (!branchMenuOpen) return;
    const el = branchChipRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 8;
    const w = Math.min(320, window.innerWidth - 16);
    setBranchPanelStyle({
      position: 'fixed',
      left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)),
      bottom: window.innerHeight - r.top + gap,
      width: w,
      maxHeight: 'min(340px, 55vh)',
      zIndex: 110,
    });
  }, [branchMenuOpen, branchData]);

  useEffect(() => {
    if (!branchMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBranchMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [branchMenuOpen]);

  useEffect(() => {
    if (!branchMenuOpen) setBranchMenuFilter('');
  }, [branchMenuOpen]);

  useEffect(() => {
    if (!branchMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (branchChipRef.current?.contains(t)) return;
      if (branchPanelRef.current?.contains(t)) return;
      setBranchMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [branchMenuOpen]);

  useEffect(() => {
    if (!showWorkspaceMenu) return;
    const handler = (e: MouseEvent) => {
      if (workspaceMenuRef.current && !workspaceMenuRef.current.contains(e.target as Node)) {
        setWorkspaceMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showWorkspaceMenu]);

  const filteredBranchRows = useMemo(() => {
    const rows = branchData?.branches ?? [];
    const q = branchMenuFilter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((b) => b.ref.toLowerCase().includes(q));
  }, [branchData, branchMenuFilter]);

  const pickWorkspaceEnabled = Array.isArray(workspaceMenuItems) && workspaceMenuItems.length > 0;
  const workspaceRepoHint =
    workspaceMenuItems?.find((w) => w.id === activeWorkspaceId)?.github_repo?.trim() || null;

  const runSyncPublish = useCallback(() => {
    setSyncConfirmOpen(false);
    void onSyncPublish?.();
  }, [onSyncPublish]);

  const handleSyncClick = useCallback(() => {
    if (!onSyncPublish) {
      onRefreshGitStatus?.();
      onGitBranchClick?.();
      return;
    }
    if (syncSkipConfirm) {
      runSyncPublish();
      return;
    }
    setSyncConfirmOpen(true);
  }, [onSyncPublish, onRefreshGitStatus, onGitBranchClick, syncSkipConfirm, runSyncPublish]);

  const openPalette = useCallback(
    (detail?: OpenCommandPaletteDetail) => {
      onOpenCommandPalette?.(detail);
    },
    [onOpenCommandPalette],
  );

  const stop = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const unread = notifUnreadCount > 0 ? notifUnreadCount : notifications.length;

  return (
    <nav
      className="h-6 flex items-stretch text-[var(--text-muted)] bg-[var(--bg-panel)] border-t border-[var(--border-subtle)] overflow-hidden select-none shrink-0"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {notifOpen && (
        <div
          ref={panelRef}
          className="absolute bottom-full right-1 mb-0.5 z-[110] w-[min(380px,96vw)] max-h-[min(320px,50vh)] flex flex-col rounded-md border border-[var(--border-subtle)] bg-[var(--bg-panel)] shadow-lg overflow-hidden"
          onMouseDown={stop}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-subtle)] text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            <span>Notifications</span>
            <button
              type="button"
              className="text-[var(--text-main)] hover:text-[var(--solar-cyan)] px-2 py-0.5 rounded hover:bg-[var(--bg-hover)]"
              onClick={() => setNotifOpen(false)}
            >
              Close
            </button>
          </div>
          <div className="overflow-y-auto flex-1 min-h-0">
            {notifications.length === 0 ? (
              <p className="px-3 py-4 text-[12px] text-[var(--text-muted)]">No unread notifications.</p>
            ) : (
              <ul className="divide-y divide-[var(--border-subtle)]/40">
                {notifications.map((n) => (
                  <li key={n.id} className="px-3 py-2 hover:bg-[var(--bg-hover)]/80">
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => void onMarkNotificationRead?.(n.id)}
                    >
                      <div className="text-[12px] font-medium text-[var(--text-main)] line-clamp-2">
                        {stripEmojiFromNotificationText(
                          (n.title ?? n.subject)?.trim(),
                        ) || 'Notice'}
                      </div>
                      {n.message && (
                        <div className="text-[11px] text-[var(--text-muted)] mt-0.5 line-clamp-3 whitespace-pre-wrap">
                          {stripEmojiFromNotificationText(n.message)}
                        </div>
                      )}
                      {n.created_at && (
                        <div className="text-[10px] text-[var(--text-muted)] mt-1 font-[var(--font-sans)]">{n.created_at}</div>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="px-3 py-1.5 text-[10px] text-[var(--text-muted)] border-t border-[var(--border-subtle)]/40">
            Unread rows from D1 for your account. Deploy alerts also go out by email when the worker sends them.
          </p>
        </div>
      )}

      <div className="flex items-stretch shrink-0">
        {/* SSH corner, branch, sync, workspace */}
        <div ref={remoteRef} className="relative flex items-stretch">
          <button
            type="button"
            onClick={() => setRemoteMenu((v) => !v)}
            className="flex items-center gap-1.5 h-full px-2.5 bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] border-r border-[var(--border-subtle)] transition-colors"
            title="Remote Connection — connect to a host or configure your PTY terminal tunnel"
          >
            <MonitorDot size={11} className="text-[var(--text-muted)]" />
          </button>
          {showRemoteMenu && (
            <div className="absolute bottom-full left-0 mb-1 z-50 w-56 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg shadow-xl overflow-hidden py-1">
              {[
                { label: 'Connect to Host...', badge: 'Remote-SSH' },
                { label: 'Connect Current Window to Host...' },
                { label: 'Open SSH Configuration File...' },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className="w-full flex items-center justify-between px-3 py-1.5 text-[0.6875rem] text-[var(--text-main)] hover:bg-[var(--bg-hover)] transition-colors text-left font-[var(--font-sans)]"
                  onClick={() => setRemoteMenu(false)}
                >
                  <span>{item.label}</span>
                  {item.badge && (
                    <span className="text-[0.5rem] text-[var(--text-muted)] font-semibold ml-2 shrink-0">
                      {item.badge}
                    </span>
                  )}
                </button>
              ))}
              <div className="border-t border-[var(--border-subtle)] my-1" />
              <button
                type="button"
                className="w-full flex items-center justify-between px-3 py-1.5 text-[0.6875rem] text-[var(--text-muted)] cursor-not-allowed text-left font-[var(--font-sans)]"
              >
                <span>Dev Container</span>
                <span className="text-[0.5rem] ml-2 shrink-0">Install</span>
              </button>
            </div>
          )}
        </div>

        <div className="relative flex items-stretch">
          <button
            ref={branchChipRef}
            type="button"
            onClick={() => {
              setBranchMenuOpen((open) => {
                const next = !open;
                if (next) void loadBranches();
                return next;
              });
            }}
            className="flex items-center gap-1 px-2.5 h-full hover:bg-[var(--bg-hover)] transition-colors"
            title="Branches — deployment repo; select to track branch in platform context"
          >
            <GitBranch size={11} />
            <span className="text-[0.5625rem] font-semibold text-[var(--text-muted)] font-[var(--font-sans)] max-w-[120px] truncate">
              {branch?.trim() ? branch : 'Branch'}
            </span>
            <ChevronDown size={10} className="opacity-50 shrink-0" />
          </button>
          <button
            type="button"
            onClick={handleSyncClick}
            disabled={syncBusy}
            className="flex items-center gap-0.5 px-1.5 h-full hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-50"
            title={
              trackingBranch && branch
                ? `Synchronize — deploy ${branch} via Workers Builds (tracks origin/${trackingBranch})`
                : 'Synchronize changes — trigger Workers Builds deploy for this workspace'
            }
          >
            <RefreshCw size={10} className={syncBusy ? 'animate-spin' : ''} />
            {(aheadCount != null && aheadCount > 0) || (behindCount != null && behindCount > 0) ? (
              <span className="flex items-center gap-0.5 text-[9px] font-semibold font-[var(--font-sans)] text-[var(--text-muted)]">
                {behindCount != null && behindCount > 0 ? (
                  <span className="flex items-center gap-px text-[var(--solar-cyan)]">
                    <ArrowDown size={8} aria-hidden />
                    {behindCount}
                  </span>
                ) : null}
                {aheadCount != null && aheadCount > 0 ? (
                  <span className="flex items-center gap-px text-[var(--solar-yellow)]">
                    <ArrowUp size={8} aria-hidden />
                    {aheadCount}
                  </span>
                ) : null}
              </span>
            ) : null}
          </button>
          {typeof document !== 'undefined' &&
            branchMenuOpen &&
            createPortal(
              <div
                ref={branchPanelRef}
                className="iam-branch-panel flex flex-col overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-xl"
                style={branchPanelStyle}
                onMouseDown={stop}
              >
                <div className="iam-branch-panel-header border-b border-[var(--border-subtle)] px-3 py-2 text-[0.6875rem] font-semibold text-[var(--text-main)] truncate font-[var(--font-sans)]">
                  {branchLoading ? 'Loading…' : branchData?.repo || workspaceRepoHint || 'Repository'}
                </div>
                <div className="px-3 py-2 border-b border-[var(--border-subtle)] shrink-0 space-y-1">
                  <button
                    type="button"
                    className="w-full text-left text-[0.6875rem] text-[var(--text-main)] hover:text-[var(--solar-cyan)] font-[var(--font-sans)]"
                    onClick={() => {
                      setBranchMenuOpen(false);
                      openPalette({ chip: 'commands', query: 'branch', facets: ['commands'] });
                    }}
                  >
                    Create new branch…
                  </button>
                  <button
                    type="button"
                    className="w-full text-left text-[0.6875rem] text-[var(--text-main)] hover:text-[var(--solar-cyan)] font-[var(--font-sans)]"
                    onClick={() => {
                      setBranchMenuOpen(false);
                      openPalette({ chip: 'commands', query: 'deploy', facets: ['deploy'] });
                    }}
                  >
                    Deploy from command palette…
                  </button>
                </div>
                <div className="px-3 py-2 border-b border-[var(--border-subtle)] shrink-0">
                  <input
                    type="text"
                    value={branchMenuFilter}
                    onChange={(e) => setBranchMenuFilter(e.target.value)}
                    placeholder="Filter branches…"
                    className="w-full bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-2 py-1 text-[0.6875rem] text-[var(--text-main)] outline-none focus:border-[var(--solar-cyan)]/50 font-[var(--font-sans)]"
                    autoFocus
                  />
                </div>
                <div className="py-1 overflow-y-auto flex-1 min-h-0">
                  {branchLoading && (
                    <div className="flex items-center justify-center px-3 py-6 text-[var(--text-muted)]">
                      <svg
                        className="iam-branch-spinner h-5 w-5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden
                      >
                        <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                        <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                      </svg>
                    </div>
                  )}
                  {branchError && !branchLoading && (
                    <div className="px-3 py-3 iam-branch-error-text">
                      <p className="text-[11px] mb-2">{branchError}</p>
                      <button
                        type="button"
                        className="text-[11px] font-semibold text-[var(--solar-cyan)] hover:underline font-[var(--font-sans)]"
                        onClick={() => {
                          setBranchData(null);
                          void loadBranches();
                        }}
                      >
                        Retry
                      </button>
                    </div>
                  )}
                  {!branchLoading && !branchError && filteredBranchRows.length === 0 && (
                    <p className="px-3 py-3 text-[11px] text-[var(--text-muted)]">No branches match.</p>
                  )}
                  {!branchLoading &&
                    !branchError &&
                    filteredBranchRows.map((b) => {
                      const isCurrent = branchData != null && b.ref === branchData.current;
                      const shortSha = b.sha ? String(b.sha).slice(0, 7) : '';
                      return (
                        <button
                          key={b.ref}
                          type="button"
                          onClick={() => {
                            onBranchSelect?.(b.ref);
                            setBranchMenuOpen(false);
                          }}
                          className={`w-full text-left px-3 py-1.5 text-[0.6875rem] hover:bg-[var(--bg-hover)] flex items-start gap-2 font-[var(--font-sans)] border-b border-[var(--border-subtle)]/30 last:border-b-0 ${
                            isCurrent ? 'bg-[var(--bg-hover)]/60' : ''
                          }`}
                        >
                          {isCurrent ? (
                            <svg
                              width="11"
                              height="11"
                              viewBox="0 0 11 11"
                              aria-hidden
                              className="shrink-0 text-[var(--solar-cyan)] mt-0.5"
                            >
                              <circle cx="5.5" cy="5.5" r="4" fill="currentColor" />
                            </svg>
                          ) : (
                            <span className="w-[11px] shrink-0 inline-block mt-0.5" />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="font-medium truncate text-[var(--text-main)]">{b.ref}</span>
                              {shortSha ? (
                                <span className="font-[var(--font-sans)] text-[10px] text-[var(--text-muted)] shrink-0">
                                  {shortSha}
                                </span>
                              ) : null}
                              {b.protected ? (
                                <span className="iam-branch-protected text-[9px] shrink-0">protected</span>
                              ) : null}
                            </span>
                            {b.subject ? (
                              <span className="block text-[10px] text-[var(--text-muted)] truncate mt-0.5">
                                {b.subject}
                                {b.date_relative ? ` · ${b.date_relative}` : ''}
                              </span>
                            ) : null}
                          </span>
                        </button>
                      );
                    })}
                </div>
                <div className="border-t border-[var(--border-subtle)] px-3 py-1.5 shrink-0 bg-[var(--bg-app)]/40">
                  <button
                    type="button"
                    onClick={() => {
                      setBranchMenuOpen(false);
                      onGitBranchClick?.();
                    }}
                    className="w-full text-left text-[0.6875rem] text-[var(--solar-cyan)] hover:underline font-[var(--font-sans)]"
                  >
                    Open Source Control…
                  </button>
                </div>
              </div>,
              document.body,
            )}
        </div>

        {workspace && (
          <div ref={workspaceMenuRef} className="relative flex items-stretch hidden sm:flex">
            <button
              type="button"
              onClick={() => {
                if (onOpenCommandPalette && workspace.includes('/')) {
                  openPalette({ chip: 'commands', query: 'deploy', facets: ['deploy'] });
                  return;
                }
                if (pickWorkspaceEnabled) setWorkspaceMenu((v) => !v);
                else onWorkspaceClick?.();
              }}
              title={
                onOpenCommandPalette && workspace.includes('/')
                  ? 'Repository — open deploy commands (Cmd+K)'
                  : pickWorkspaceEnabled
                    ? 'Switch workspace'
                    : 'Workspace hub'
              }
              className="px-2.5 h-full hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-1 max-w-[180px]"
            >
              <span className="text-[0.5625rem] font-semibold text-[var(--text-muted)] truncate font-[var(--font-sans)]">
                {workspace}
              </span>
              {pickWorkspaceEnabled && <ChevronDown size={10} className="opacity-50 shrink-0" />}
            </button>
            {pickWorkspaceEnabled && showWorkspaceMenu && (
              <div className="absolute bottom-full left-0 mb-1 z-50 w-56 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg shadow-xl overflow-hidden py-1 max-h-[min(280px,45vh)] flex flex-col">
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                  Workspace
                </div>
                <div className="overflow-y-auto flex-1 min-h-0 py-1">
                  {workspaceMenuItems!.map((w) => {
                    const active = activeWorkspaceId === w.id;
                    return (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => {
                          onWorkspaceMenuSelect?.(w.id);
                          setWorkspaceMenu(false);
                        }}
                        className={`ws-picker-row w-full text-left px-3 py-1.5 text-[0.6875rem] hover:bg-[var(--bg-hover)] flex items-start gap-2 font-[var(--font-sans)] ${
                          active ? 'text-[var(--solar-cyan)]' : 'text-[var(--text-main)]'
                        }`}
                      >
                        <span className="mt-0.5 shrink-0">
                          {active ? <Check size={11} className="shrink-0" /> : <span className="w-[11px] inline-block" />}
                        </span>
                        <span className="ws-picker-row-inner min-w-0 flex-1">
                          <span className="ws-name">{w.label}</span>
                          <span className="ws-slug">{w.slug}</span>
                          <span className={`ws-status ${w.status}`} aria-hidden />
                          {w.github_repo ? <span className="ws-repo">{w.github_repo}</span> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setWorkspaceMenu(false);
                    onWorkspaceClick?.();
                  }}
                  className="text-left px-3 py-2 text-[0.6875rem] text-[var(--solar-cyan)] border-t border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] font-[var(--font-sans)]"
                >
                  Workspace hub &amp; folders…
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-stretch flex-1 min-w-0 overflow-hidden">
        {gitHash?.trim() ? (
          <div
            className="hidden sm:flex items-center px-2 h-full text-[0.5625rem] font-[var(--font-sans)] text-[var(--text-muted)] border-r border-[var(--border-subtle)]/30 shrink-0"
            title="Latest deployed commit (short hash)"
          >
            {gitHash.trim()}
          </div>
        ) : null}
        {healthOk != null ? (
          <div
            className="flex items-center gap-1 px-2 h-full shrink-0"
            title={healthOk ? 'Worker health OK' : 'Worker health check failed'}
          >
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${healthOk ? 'bg-[var(--solar-green,#22c55e)]' : 'bg-[var(--solar-red)]'}`}
              aria-hidden
            />
            <span className="text-[0.5625rem] font-semibold text-[var(--text-muted)] hidden lg:inline">
              {healthOk ? 'Healthy' : 'Degraded'}
            </span>
          </div>
        ) : null}
        {tunnelHealthy != null ? (
          <div
            className="hidden xl:flex items-center px-2 h-full text-[0.5625rem] text-[var(--text-muted)] truncate max-w-[140px] shrink-0"
            title={tunnelLabel?.trim() || (tunnelHealthy ? 'Tunnel connected' : 'Tunnel unavailable')}
          >
            {tunnelHealthy ? 'Tunnel' : 'No tunnel'}
          </div>
        ) : null}
        {terminalOk != null ? (
          <div
            className="hidden xl:flex items-center px-2 h-full text-[0.5625rem] text-[var(--text-muted)] shrink-0"
            title={terminalOk ? 'PTY terminal configured' : 'PTY terminal not configured'}
          >
            {terminalOk ? 'PTY' : 'No PTY'}
          </div>
        ) : null}
        {/* errors, warnings */}
        {(errorCount ?? 0) > 0 && (
          <button
            type="button"
            onClick={onErrorsClick}
            title={`${errorCount} errors — click to open Problems panel`}
            className="flex items-center gap-1 px-2 h-full hover:bg-[var(--bg-hover)] transition-colors"
          >
            <XCircle size={11} className="text-[var(--solar-red)]" />
            <span className="text-[0.5625rem] font-semibold text-[var(--solar-red)] font-[var(--font-sans)]">
              {errorCount}
            </span>
          </button>
        )}
        {(warningCount ?? 0) > 0 && (
          <button
            type="button"
            onClick={onWarningsClick}
            title={`${warningCount} warnings — click to view`}
            className="flex items-center gap-1 px-2 h-full hover:bg-[var(--bg-hover)] transition-colors"
          >
            <AlertTriangle size={11} className="text-[var(--solar-yellow)]" />
            <span className="text-[0.5625rem] font-semibold text-[var(--solar-yellow)] font-[var(--font-sans)]">
              {warningCount}
            </span>
          </button>
        )}
      </div>

      <div className="flex items-stretch shrink-0 ml-auto">
        {/* cursor pos, indent, encoding, eol, format, mode pill, notifications */}
        {showCursor === true && (
          <>
            <button
              type="button"
              onClick={onCursorClick}
              title="Go to Line/Column — click to navigate to a specific line number"
              className="px-2 h-full hover:bg-[var(--bg-hover)] transition-colors flex items-center"
            >
              <span className="text-[0.5625rem] font-semibold text-[var(--text-muted)] font-[var(--font-sans)]">
                Ln {line}, Col {col}
              </span>
            </button>

            <button
              type="button"
              title="Indentation — controls whether Tab inserts spaces or a tab character, and how many spaces per indent. Click to change (Spaces vs Tabs, size per level)."
              className="px-2 h-full hover:bg-[var(--bg-hover)] transition-colors flex items-center"
            >
              <span className="text-[0.5625rem] font-[var(--font-sans)] text-[var(--text-muted)]">{indentLabel}</span>
            </button>

            <button
              type="button"
              title="File Encoding — UTF-8 stores every character (all languages + emoji) as universal bytes. Most files should stay UTF-8. Only change for legacy files expecting Latin-1 or Windows-1252."
              className="px-2 h-full hover:bg-[var(--bg-hover)] transition-colors flex items-center"
            >
              <span className="text-[0.5625rem] font-[var(--font-sans)] text-[var(--text-muted)]">{encodingLabel}</span>
            </button>

            <button
              type="button"
              title="Line Endings — the invisible character at the end of each line. LF = Unix/Mac. CRLF = Windows. Mismatches cause every line to appear changed in git diffs even when nothing actually changed. Click to change for this file."
              className="px-2 h-full hover:bg-[var(--bg-hover)] transition-colors flex items-center"
            >
              <span className="text-[0.5625rem] font-[var(--font-sans)] text-[var(--text-muted)]">{eolLabel}</span>
            </button>

            {canFormatDocument && (
              <button
                type="button"
                onClick={onFormatClick}
                title="Format Document — run Prettier on the active file to auto-fix indentation, quotes, spacing."
                className="px-2 h-full hover:bg-[var(--bg-hover)] transition-colors flex items-center"
              >
                <WrapText size={11} />
              </button>
            )}
          </>
        )}

        {chatModeLabel && (
          <div
            className="hidden min-[1000px]:flex items-center px-2 h-full text-[var(--text-muted)] font-semibold border-x border-[var(--border-subtle)]/20 max-w-[120px] truncate"
            title={chatModeLabel}
          >
            {chatModeLabel}
          </div>
        )}

        <button
          type="button"
          onClick={onVersionClick}
          className="hidden sm:flex items-center px-2 h-full hover:bg-[var(--bg-hover)] transition-colors text-[0.5625rem] font-[var(--font-sans)] text-[var(--text-muted)]"
          title={`Shell ${version}`}
        >
          {version}
        </button>

        <button
          type="button"
          className="relative flex items-center justify-center hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] cursor-pointer px-3 h-full transition-colors border-0 bg-transparent"
          title="Notifications"
          aria-expanded={notifOpen}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setNotifOpen((o) => !o)}
        >
          <Bell size={13} className="opacity-70" />
          {unread > 0 && (
            <span className="absolute top-0.5 right-1 min-w-[14px] h-[14px] px-0.5 rounded-full bg-[var(--solar-red)] text-white text-[9px] font-bold flex items-center justify-center">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>
      </div>

      {syncConfirmOpen && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/40"
          onMouseDown={stop}
        >
          <div
            className="w-full max-w-md rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-2xl p-4 space-y-3"
            role="dialog"
            aria-labelledby="iam-sync-confirm-title"
          >
            <p id="iam-sync-confirm-title" className="text-[13px] text-[var(--text-main)] leading-snug">
              This triggers a Workers Builds deploy for{' '}
              <span className="font-semibold">{workspace || 'this workspace'}</span>
              {branch ? (
                <>
                  {' '}
                  on branch <span className="font-mono text-[12px]">{branch}</span>
                </>
              ) : null}
              {trackingBranch ? (
                <span className="text-[var(--text-muted)]">
                  {' '}
                  (tracks origin/{trackingBranch})
                </span>
              ) : null}
              .
            </p>
            <p className="text-[11px] text-[var(--text-muted)]">
              Push commits to GitHub first, then sync to deploy the latest remote ref — same flow as Cursor&apos;s
              synchronize after push.
            </p>
            <div className="flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                className="px-3 py-1.5 text-[12px] rounded-md border border-[var(--border-subtle)] hover:bg-[var(--bg-hover)]"
                onClick={() => setSyncConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-3 py-1.5 text-[12px] rounded-md border border-[var(--border-subtle)] hover:bg-[var(--bg-hover)]"
                onClick={() => {
                  try {
                    localStorage.setItem(SYNC_CONFIRM_SKIP_KEY, '1');
                  } catch {
                    /* ignore */
                  }
                  setSyncSkipConfirm(true);
                  runSyncPublish();
                }}
              >
                OK, don&apos;t show again
              </button>
              <button
                type="button"
                className="px-3 py-1.5 text-[12px] rounded-md bg-[var(--solar-cyan)]/20 text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/40 hover:bg-[var(--solar-cyan)]/30 font-semibold"
                onClick={runSyncPublish}
              >
                Deploy now
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};
