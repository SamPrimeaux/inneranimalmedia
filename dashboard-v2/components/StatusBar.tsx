import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GitBranch, XCircle, AlertTriangle, Bell, Check, KeyRound, Monitor, Globe, Package, HardDrive, Database, ChevronUp, ChevronDown, User, LogOut, MessageSquare } from 'lucide-react';
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
  subject?: string | null;
  message?: string | null;
  status?: string | null;
  created_at?: string | null;
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
  branch = 'main',
  workspace = 'No workspace',
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
  const cursorText = showCursor ? `Ln ${line}, Col ${col}` : 'Ln --, Col --';
  const versionDisplay =
    version && String(version).trim() !== ''
      ? String(version).startsWith('v')
        ? version
        : `v${version}`
      : '';
  const [chatModeLabel, setChatModeLabel] = useState<string>('');
  const [notifOpen, setNotifOpen] = useState(false);
  const [sshOpen, setSshOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const sshRef = useRef<HTMLDivElement>(null);

  const QUICK_COMMANDS = [
    { icon: Monitor, label: 'Local PTY', cmd: 'ssh iam-pty', desc: 'Inner Animal PTY' },
    { icon: Globe, label: 'Production SSH', cmd: 'ssh production-iam', desc: 'Mainstage Access' },
    { icon: HardDrive, label: 'Sandbox SSH', cmd: 'ssh sandbox-d1', desc: 'Experiment D1' },
    { icon: MessageSquare, label: 'Clear Chat', cmd: 'clear', desc: 'Reset Agent Session' },
    { icon: Package, label: 'Build Project', cmd: 'npm run build', desc: 'Production Bundle' },
    { icon: Database, label: 'Sync DB', cmd: 'npx prisma db pull', desc: 'D1 Schema Sync' },
  ];

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
      if (sshRef.current && !sshRef.current.contains(t)) setSshOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [notifOpen]);

  const workerDisplayName = useMemo(() => resolveWorkerDisplayName(), []);

  const brandTitle = [
    workerDisplayName,
    healthOk === true ? 'Worker healthy' : healthOk === false ? 'Worker health check failed' : 'Health unknown',
    lastDeployLine || undefined,
    tunnelLabel || undefined,
    terminalOk === true ? 'Terminal configured' : terminalOk === false ? 'Terminal not configured' : undefined,
  ]
    .filter(Boolean)
    .join(' · ');

  const stop = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const copyVersion = useCallback(() => {
    if (versionDisplay) void navigator.clipboard.writeText(versionDisplay);
    onVersionClick?.();
  }, [versionDisplay, onVersionClick]);

  const unread = notifUnreadCount > 0 ? notifUnreadCount : notifications.length;

  return (
    <div className="shrink-0 z-[100] relative w-full bg-[var(--bg-app)] border-t border-[var(--border-subtle)]/30 pb-[env(safe-area-inset-bottom,0px)]">
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
                        {stripEmojiFromNotificationText(n.subject?.trim()) || 'Notice'}
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

      <div className="h-6 flex items-center justify-between text-[11px] text-[var(--text-main)]/90 w-full px-1" style={{ fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace" }}>
        {/* Left Side: Environment Switcher */}
        {/* Left Side: Environment Status Dot */}
        <div className="flex items-center gap-1.5 px-2 h-full py-0.5 relative">
          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            healthOk === true ? 'bg-[var(--solar-green)] shadow-[0_0_5px_var(--solar-green)]' : 'bg-[var(--solar-cyan)]'
          }`} />
                    <div className="relative flex items-center h-full">
            <div
              className="flex items-center gap-1.5 px-1 opacity-80"
              title={brandTitle}
            >
              <span className="uppercase tracking-tight font-bold">
                {healthOk === true ? 'IAM-OK' : 'Standby'}
              </span>
            </div>
          </div>
        </div>

        {/* Center: Active Workspace Context */}
        <div className="flex-1 flex justify-center items-center overflow-hidden px-4 select-none">
          <div 
            className="flex items-center gap-2 px-3 py-0.5 rounded-full bg-[var(--bg-panel)] border border-[var(--border-subtle)]/40 hover:border-[var(--solar-cyan)]/40 transition-all cursor-pointer truncate shadow-[0_2px_10px_rgba(0,0,0,0.2)]"
            onClick={onWorkspaceClick}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--solar-cyan)] shadow-[0_0_5px_var(--solar-cyan)] shrink-0" />
            <span className="truncate opacity-80 hover:opacity-100 transition-opacity uppercase tracking-widest font-bold text-[9px]">
              {workspace}
            </span>
          </div>
        </div>

        {/* Right Side: Git & Status */}
        <div className="flex items-center gap-0.5 h-full">
          <button
            type="button"
            className="flex items-center gap-1.5 hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] cursor-pointer px-2 h-full transition-colors shrink-0 border-0 bg-transparent text-[11px]"
            title={tunnelLabel ? `Tunnel: ${tunnelLabel}` : 'Source control'}
            onClick={() => onGitBranchClick?.()}
          >
            <GitBranch size={12} className="opacity-70 text-[var(--solar-cyan)]" />
            <span className="tracking-tight">{branch}</span>
            {tunnelHealthy !== null && (
              <span
                className={`ml-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                  tunnelHealthy ? 'bg-[var(--solar-green)]' : 'bg-[var(--solar-red)]'
                }`}
              />
            )}
          </button>
          <button
            type="button"
            className="flex items-center gap-1 hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] cursor-pointer px-2 h-full transition-colors shrink-0 border-0 bg-transparent"
            title="Open Run & Debug (errors from D1)"
            onClick={() => onErrorsClick?.()}
          >
            <XCircle size={12} className="text-[var(--solar-red)]" /> {errorCount}
          </button>
          <button
            type="button"
            className="flex items-center gap-1 hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] cursor-pointer px-2 h-full transition-colors shrink-0 border-0 bg-transparent"
            title="Open Tools & MCP (audit warnings)"
            onClick={() => onWarningsClick?.()}
          >
            <AlertTriangle size={12} className="text-[var(--solar-yellow)]" /> {warningCount}
          </button>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 h-full overflow-hidden shrink-0">
          <button
            type="button"
            className="hidden sm:flex items-center hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] cursor-pointer px-2 h-full transition-colors border-0 bg-transparent"
            title={showCursor ? 'Cursor' : 'Focus editor'}
            onClick={() => onCursorClick?.()}
          >
            {cursorText}
          </button>
          <div
            className="hidden sm:flex items-center hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] px-2 h-full transition-colors"
            title="Indentation from Monaco model"
          >
            {indentLabel}
          </div>
          <div
            className="hidden md:flex items-center hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] px-2 h-full transition-colors"
            title="Text encoding"
          >
            {encodingLabel}
          </div>
          <div
            className="hidden lg:flex items-center hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] px-2 h-full transition-colors"
            title="End of line sequence"
          >
            {eolLabel}
          </div>
          {chatModeLabel && (
            <div
              className="hidden min-[1000px]:flex items-center px-2 h-full text-[var(--text-muted)] font-semibold border-x border-[var(--border-subtle)]/20 max-w-[120px] truncate"
              title={chatModeLabel}
            >
              {chatModeLabel}
            </div>
          )}
          {versionDisplay && (
            <button
              type="button"
              className="hidden min-[1100px]:flex items-center px-2 h-full bg-[var(--solar-green)]/15 text-[var(--solar-green)] font-bold border-x border-[var(--border-subtle)]/20 border-0 cursor-pointer hover:brightness-110"
              title="Copy version"
              onClick={copyVersion}
            >
              {versionDisplay}
            </button>
          )}
          {canFormatDocument && (
            <button
              type="button"
              className="hidden sm:flex items-center gap-1 hover:text-[var(--text-main)] cursor-pointer px-2 py-0.5 transition-colors border-0 bg-transparent rounded-sm bg-[var(--bg-hover)]/80"
              title="Format document (Monaco)"
              onClick={() => onFormatClick?.()}
              style={{ fontSize: '11px' }}
            >
              <Check size={12} className="text-[var(--solar-green)]" /> Prettier
            </button>
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

          <div className="relative h-full flex items-center" ref={sshRef}>
            <button
              type="button"
              className={`flex items-center justify-center cursor-pointer px-2 h-full transition-colors border-0 bg-transparent ${
                sshOpen ? 'text-[var(--solar-cyan)] bg-[var(--bg-hover)]' : 'hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]'
              }`}
              title="Command Hub (SSH & Tools)"
              onClick={() => setSshOpen(!sshOpen)}
            >
              <KeyRound size={13} className="opacity-70" />
            </button>

            {sshOpen && (
              <div
                className="absolute bottom-full right-0 mb-1 z-[110] w-[240px] bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded shadow-xl overflow-hidden"
                onMouseDown={stop}
              >
                <div className="px-3 py-1.5 border-b border-[var(--border-subtle)] text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                  Command Hub
                </div>
                <div className="max-h-[300px] overflow-y-auto">
                  {QUICK_COMMANDS.map((c) => (
                    <button
                      key={c.label}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--bg-hover)] text-left group transition-colors border-0 bg-transparent"
                      onClick={() => {
                        window.dispatchEvent(
                          new CustomEvent('iam-agent-external-send', { detail: { message: c.cmd } })
                        );
                        setSshOpen(false);
                      }}
                    >
                      <c.icon size={12} className="text-[var(--solar-cyan)] opacity-70 group-hover:opacity-100" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-medium text-[var(--text-main)] group-hover:text-[var(--solar-cyan)] truncate">
                          {c.label}
                        </div>
                        <div className="text-[9px] text-[var(--text-muted)] truncate">{c.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
