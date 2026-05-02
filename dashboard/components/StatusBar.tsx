import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MonitorDot,
  GitBranch,
  RefreshCw,
  XCircle,
  AlertTriangle,
  WrapText,
  Bell,
  Check,
  ChevronUp,
  ChevronDown,
  User,
  LogOut,
} from 'lucide-react';
import { SHELL_VERSION } from '../src/shellVersion';

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

interface StatusBarProps {
  branch?: string;
  workspace?: string;
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
  /** Short line from latest deployment row */
  lastDeployLine?: string | null;
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
  onWorkspaceClick?: () => void;
  onErrorsClick?: () => void;
  onWarningsClick?: () => void;
  onCursorClick?: () => void;
  onVersionClick?: () => void;
  onFormatClick?: () => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  branch = '',
  workspace = '',
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
  lastDeployLine = null,
  indentLabel = 'Spaces: 2',
  encodingLabel = 'UTF-8',
  eolLabel = 'LF',
  notifications = [],
  notifUnreadCount = 0,
  onMarkNotificationRead,
  canFormatDocument = false,
  onBrandClick,
  onGitBranchClick,
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
  const [showBranchMenu, setBranchMenu] = useState(false);
  const branchRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!showBranchMenu) return;
    const handler = (e: MouseEvent) => {
      if (branchRef.current && !branchRef.current.contains(e.target as Node)) {
        setBranchMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showBranchMenu]);

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
                        <div className="text-[10px] text-[var(--text-muted)] mt-1 font-mono">{n.created_at}</div>
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

        {branch && (
          <div ref={branchRef} className="relative flex items-stretch">
            <button
              type="button"
              onClick={() => setBranchMenu((v) => !v)}
              className="flex items-center gap-1.5 px-2.5 h-full hover:bg-[var(--bg-hover)] transition-colors"
              title="Select a branch or tag to checkout"
            >
              <GitBranch size={11} />
              <span className="text-[0.5625rem] font-semibold text-[var(--text-muted)] font-[var(--font-sans)]">
                {branch}
              </span>
            </button>
            <button
              type="button"
              onClick={onGitBranchClick}
              className="flex items-center px-1.5 h-full hover:bg-[var(--bg-hover)] transition-colors"
              title="Sync with remote — pull and push commits from and to origin"
            >
              <RefreshCw size={10} />
            </button>
            {showBranchMenu && (
              <div className="absolute bottom-full left-0 mb-1 z-50 w-64 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg shadow-xl overflow-hidden">
                <div className="px-3 py-2 border-b border-[var(--border-subtle)]">
                  <input
                    type="text"
                    placeholder="Select a branch or tag..."
                    className="w-full bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-2 py-1 text-[0.6875rem] text-[var(--text-main)] outline-none focus:border-[var(--solar-cyan)]/50 font-[var(--font-sans)]"
                    autoFocus
                  />
                </div>
                <div className="py-1 max-h-48 overflow-y-auto">
                  <div className="px-3 py-1">
                    <p className="text-[0.5rem] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1">
                      branches
                    </p>
                    <button
                      type="button"
                      onClick={() => setBranchMenu(false)}
                      className="w-full text-left px-2 py-1.5 rounded text-[0.6875rem] text-[var(--text-main)] bg-[var(--bg-hover)] flex items-center gap-2 font-[var(--font-sans)]"
                    >
                      <Check size={11} className="text-[var(--solar-cyan)]" />
                      {branch}
                      <span className="ml-auto text-[0.5rem] text-[var(--text-muted)]">HEAD</span>
                    </button>
                  </div>
                  <div className="px-3 py-1 border-t border-[var(--border-subtle)] mt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setBranchMenu(false);
                        onGitBranchClick?.();
                      }}
                      className="w-full text-left px-2 py-1.5 text-[0.6875rem] text-[var(--solar-cyan)] hover:bg-[var(--bg-hover)] rounded font-[var(--font-sans)]"
                    >
                      + Create new branch...
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {workspace && (
          <button
            type="button"
            onClick={onWorkspaceClick}
            title="Switch workspace"
            className="px-2.5 h-full hover:bg-[var(--bg-hover)] transition-colors hidden sm:flex items-center"
          >
            <span className="text-[0.5625rem] font-semibold text-[var(--text-muted)] truncate max-w-[140px] font-[var(--font-sans)]">
              {workspace}
            </span>
          </button>
        )}
      </div>

      <div className="flex items-stretch flex-1 min-w-0">
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
              <span className="text-[0.5625rem] font-mono text-[var(--text-muted)]">{indentLabel}</span>
            </button>

            <button
              type="button"
              title="File Encoding — UTF-8 stores every character (all languages + emoji) as universal bytes. Most files should stay UTF-8. Only change for legacy files expecting Latin-1 or Windows-1252."
              className="px-2 h-full hover:bg-[var(--bg-hover)] transition-colors flex items-center"
            >
              <span className="text-[0.5625rem] font-mono text-[var(--text-muted)]">{encodingLabel}</span>
            </button>

            <button
              type="button"
              title="Line Endings — the invisible character at the end of each line. LF = Unix/Mac. CRLF = Windows. Mismatches cause every line to appear changed in git diffs even when nothing actually changed. Click to change for this file."
              className="px-2 h-full hover:bg-[var(--bg-hover)] transition-colors flex items-center"
            >
              <span className="text-[0.5625rem] font-mono text-[var(--text-muted)]">{eolLabel}</span>
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
    </nav>
  );
};
