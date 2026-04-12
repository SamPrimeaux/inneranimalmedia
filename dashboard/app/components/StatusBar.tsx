import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GitBranch, XCircle, AlertTriangle, Bell, Check, KeyRound,
  Monitor, Globe, Package, HardDrive, Database, MessageSquare,
} from 'lucide-react';
import { SHELL_VERSION } from '../src/shellVersion';

// ── Constants ─────────────────────────────────────────────────────────────────
const API_COMMANDS      = '/api/agent/commands?context=statusbar';
const EVENT_CHAT_MODE   = 'iam-chat-mode';
const EVENT_AGENT_SEND  = 'iam-agent-external-send';

// ── Worker display name — derived from hostname, never hardcoded ──────────────
export function resolveWorkerDisplayName(): string {
  if (typeof window === 'undefined') return 'inneranimalmedia';
  const h = window.location.hostname.toLowerCase();
  if (h.includes('inneranimal-dashboard'))                     return 'inneranimal-dashboard';
  if (h === 'inneranimalmedia.com' || h === 'www.inneranimalmedia.com') return 'inneranimalmedia';
  if (h.endsWith('.inneranimalmedia.com'))                     return 'inneranimalmedia';
  if (h.endsWith('.workers.dev') && h.includes('inneranimalmedia')) return 'inneranimalmedia';
  return 'inneranimalmedia';
}

// ── Strip emoji per product rule (no emoji in product UI) ────────────────────
function stripEmoji(s: string | null | undefined): string {
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

// ── Types ─────────────────────────────────────────────────────────────────────
export type AgentNotificationRow = {
  id:          string;
  subject?:    string | null;
  message?:    string | null;
  status?:     string | null;
  created_at?: string | null;
};

interface QuickCommand {
  icon:  React.FC<{ size: number; className?: string }>;
  label: string;
  cmd:   string;
  desc:  string;
}

// ── Fallback commands — used when API returns nothing ─────────────────────────
// These are safe, workspace-agnostic defaults. No hardcoded SSH aliases.
const FALLBACK_COMMANDS: QuickCommand[] = [
  { icon: Monitor,      label: 'PTY Status',    cmd: 'wrangler --version',      desc: 'Check PTY / Wrangler'     },
  { icon: Globe,        label: 'Health Check',  cmd: 'curl /api/health',        desc: 'Worker health endpoint'   },
  { icon: HardDrive,    label: 'D1 Tables',     cmd: 'd1_query SELECT name FROM sqlite_master WHERE type="table" LIMIT 20', desc: 'List D1 tables' },
  { icon: MessageSquare,label: 'Clear Chat',    cmd: 'clear',                   desc: 'Reset agent session'      },
  { icon: Package,      label: 'Build',         cmd: 'npm run build:vite-only', desc: 'Vite frontend build'      },
  { icon: Database,     label: 'Sync AutoRAG',  cmd: './scripts/populate-autorag.sh', desc: 'Ingest docs to AutoRAG' },
];

interface StatusBarProps {
  branch?:                  string;
  /** Resolved workspace display name — null until session resolves */
  workspace?:               string | null;
  errorCount?:              number;
  warningCount?:            number;
  line?:                    number;
  col?:                     number;
  showCursor?:              boolean;
  version?:                 string;
  healthOk?:                boolean | null;
  tunnelHealthy?:           boolean | null;
  tunnelLabel?:             string | null;
  terminalOk?:              boolean | null;
  lastDeployLine?:          string | null;
  indentLabel?:             string;
  encodingLabel?:           string;
  eolLabel?:                string;
  notifications?:           AgentNotificationRow[];
  notifUnreadCount?:        number;
  onMarkNotificationRead?:  (id: string) => void | Promise<void>;
  canFormatDocument?:       boolean;
  onBrandClick?:            () => void;
  onGitBranchClick?:        () => void;
  onWorkspaceClick?:        () => void;
  onErrorsClick?:           () => void;
  onWarningsClick?:         () => void;
  onCursorClick?:           () => void;
  onVersionClick?:          () => void;
  onFormatClick?:           () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
export const StatusBar: React.FC<StatusBarProps> = ({
  branch          = 'main',
  workspace       = null,
  errorCount      = 0,
  warningCount    = 0,
  line            = 1,
  col             = 1,
  showCursor      = false,
  version         = SHELL_VERSION,
  healthOk        = null,
  tunnelHealthy   = null,
  tunnelLabel     = null,
  terminalOk      = null,
  lastDeployLine  = null,
  indentLabel     = 'Spaces: 2',
  encodingLabel   = 'UTF-8',
  eolLabel        = 'LF',
  notifications   = [],
  notifUnreadCount= 0,
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
  const [chatModeLabel, setChatModeLabel] = useState('');
  const [notifOpen,     setNotifOpen]     = useState(false);
  const [cmdOpen,       setCmdOpen]       = useState(false);
  const [commands,      setCommands]      = useState<QuickCommand[]>(FALLBACK_COMMANDS);

  const panelRef = useRef<HTMLDivElement>(null);
  const cmdRef   = useRef<HTMLDivElement>(null);

  // ── Fetch commands from API — overrides fallback list ─────────────────────
  useEffect(() => {
    fetch(API_COMMANDS, { credentials: 'same-origin' })
      .then(r => r.ok ? r.json() : null)
      .then((d: { commands?: Array<{ label: string; cmd: string; desc?: string }> } | null) => {
        if (!d || !Array.isArray(d.commands) || d.commands.length === 0) return;
        // Map API rows — icons are best-effort matched by label keyword
        const iconFor = (label: string): QuickCommand['icon'] => {
          const l = label.toLowerCase();
          if (l.includes('terminal') || l.includes('pty')) return Monitor;
          if (l.includes('health') || l.includes('browser')) return Globe;
          if (l.includes('d1') || l.includes('database') || l.includes('sql')) return Database;
          if (l.includes('chat') || l.includes('clear')) return MessageSquare;
          if (l.includes('build') || l.includes('deploy')) return Package;
          return HardDrive;
        };
        setCommands(d.commands.map(c => ({
          icon:  iconFor(c.label),
          label: c.label,
          cmd:   c.cmd,
          desc:  c.desc ?? '',
        })));
      })
      .catch(() => { /* keep fallback */ });
  }, []);

  // ── Chat mode label ───────────────────────────────────────────────────────
  useEffect(() => {
    const h = (ev: Event) => {
      const d = (ev as CustomEvent<{ label?: string }>).detail;
      if (d?.label != null) setChatModeLabel(String(d.label));
    };
    window.addEventListener(EVENT_CHAT_MODE, h as EventListener);
    return () => window.removeEventListener(EVENT_CHAT_MODE, h as EventListener);
  }, []);

  // ── Close panels on outside click / Escape ────────────────────────────────
  useEffect(() => {
    if (!notifOpen && !cmdOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setNotifOpen(false); setCmdOpen(false); }
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current && !panelRef.current.contains(t)) setNotifOpen(false);
      if (cmdRef.current   && !cmdRef.current.contains(t))   setCmdOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [notifOpen, cmdOpen]);

  const workerName = useMemo(() => resolveWorkerDisplayName(), []);

  const brandTitle = [
    workerName,
    healthOk === true  ? 'Worker healthy'
    : healthOk === false ? 'Worker health check failed'
    : 'Health unknown',
    lastDeployLine  || undefined,
    tunnelLabel     || undefined,
    terminalOk === true  ? 'Terminal configured'
    : terminalOk === false ? 'Terminal not configured'
    : undefined,
  ].filter(Boolean).join(' · ');

  const versionDisplay = version && String(version).trim() !== ''
    ? String(version).startsWith('v') ? version : `v${version}`
    : '';

  const cursorText = showCursor ? `Ln ${line}, Col ${col}` : 'Ln --, Col --';
  const unread     = notifUnreadCount > 0 ? notifUnreadCount : notifications.length;

  const copyVersion = useCallback(() => {
    if (versionDisplay) void navigator.clipboard.writeText(versionDisplay);
    onVersionClick?.();
  }, [versionDisplay, onVersionClick]);

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div className="shrink-0 z-[100] relative w-full bg-[var(--bg-app)] border-t border-[var(--border-subtle)]/30 pb-[env(safe-area-inset-bottom,0px)]">

      {/* ── Notifications panel ─────────────────────────────────────────── */}
      {notifOpen && (
        <div
          ref={panelRef}
          onMouseDown={stop}
          className="absolute bottom-full right-1 mb-0.5 z-[110] w-[min(380px,96vw)] max-h-[min(320px,50vh)] flex flex-col rounded-md border border-[var(--border-subtle)] bg-[var(--bg-panel)] shadow-lg overflow-hidden"
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
                {notifications.map(n => (
                  <li key={n.id} className="px-3 py-2 hover:bg-[var(--bg-hover)]/80">
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => void onMarkNotificationRead?.(n.id)}
                    >
                      <div className="text-[12px] font-medium text-[var(--text-main)] line-clamp-2">
                        {stripEmoji(n.subject?.trim()) || 'Notice'}
                      </div>
                      {n.message && (
                        <div className="text-[11px] text-[var(--text-muted)] mt-0.5 line-clamp-3 whitespace-pre-wrap">
                          {stripEmoji(n.message)}
                        </div>
                      )}
                      {n.created_at && (
                        <div className="text-[10px] text-[var(--text-muted)] mt-1 font-[var(--font-mono)]">
                          {n.created_at}
                        </div>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="px-3 py-1.5 text-[10px] text-[var(--text-muted)] border-t border-[var(--border-subtle)]/40">
            Unread rows from D1 for your account.
          </p>
        </div>
      )}

      {/* ── Status bar row ──────────────────────────────────────────────── */}
      {/* font-[var(--font-ui)] — uses Nunito, not monospace */}
      <div className="h-6 flex items-center justify-between text-[11px] text-[var(--text-main)]/90 w-full px-1 font-[var(--font-ui)]">

        {/* Left — health status */}
        <div className="flex items-center gap-1.5 px-2 h-full py-0.5">
          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            healthOk === true
              ? 'bg-[var(--solar-green)] shadow-[0_0_5px_var(--solar-green)]'
              : 'bg-[var(--solar-cyan)]'
          }`} />
          <button
            type="button"
            className="flex items-center gap-1.5 px-1 opacity-80 hover:opacity-100 border-0 bg-transparent cursor-pointer transition-opacity"
            title={brandTitle}
            onClick={onBrandClick}
          >
            <span className="uppercase tracking-tight font-bold text-[11px]">
              {healthOk === true ? 'IAM-OK' : 'Standby'}
            </span>
          </button>
        </div>

        {/* Center — workspace pill */}
        <div className="flex-1 flex justify-center items-center overflow-hidden px-4 select-none">
          {workspace && (
            <button
              type="button"
              onClick={onWorkspaceClick}
              className="flex items-center gap-2 px-3 py-0.5 rounded-full bg-[var(--bg-panel)] border border-[var(--border-subtle)]/40 hover:border-[var(--solar-cyan)]/40 transition-all cursor-pointer truncate shadow-[0_2px_10px_rgba(0,0,0,0.2)] border-0"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-[var(--solar-cyan)] shadow-[0_0_5px_var(--solar-cyan)] shrink-0" />
              <span className="truncate opacity-80 hover:opacity-100 transition-opacity uppercase tracking-widest font-bold text-[9px]">
                {workspace}
              </span>
            </button>
          )}
        </div>

        {/* Right — git + errors + warnings + editor meta + version + bells */}
        <div className="flex items-center gap-0.5 h-full">

          {/* Branch */}
          <button
            type="button"
            className="flex items-center gap-1.5 hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] cursor-pointer px-2 h-full transition-colors border-0 bg-transparent text-[11px]"
            title={tunnelLabel ? `Tunnel: ${tunnelLabel}` : 'Source control'}
            onClick={() => onGitBranchClick?.()}
          >
            <GitBranch size={12} className="opacity-70 text-[var(--solar-cyan)]" />
            <span className="tracking-tight">{branch}</span>
            {tunnelHealthy !== null && (
              <span className={`ml-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                tunnelHealthy ? 'bg-[var(--solar-green)]' : 'bg-[var(--solar-red)]'
              }`} />
            )}
          </button>

          {/* Errors */}
          <button
            type="button"
            className="flex items-center gap-1 hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] cursor-pointer px-2 h-full transition-colors border-0 bg-transparent"
            title="Errors from D1"
            onClick={() => onErrorsClick?.()}
          >
            <XCircle size={12} className="text-[var(--solar-red)]" /> {errorCount}
          </button>

          {/* Warnings */}
          <button
            type="button"
            className="flex items-center gap-1 hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] cursor-pointer px-2 h-full transition-colors border-0 bg-transparent"
            title="MCP audit warnings"
            onClick={() => onWarningsClick?.()}
          >
            <AlertTriangle size={12} className="text-[var(--solar-yellow)]" /> {warningCount}
          </button>

          {/* Cursor position */}
          <button
            type="button"
            className="hidden sm:flex items-center hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] cursor-pointer px-2 h-full transition-colors border-0 bg-transparent"
            title={showCursor ? 'Cursor position' : 'Focus editor'}
            onClick={() => onCursorClick?.()}
          >
            {cursorText}
          </button>

          {/* Indent */}
          <div
            className="hidden sm:flex items-center hover:bg-[var(--bg-hover)] px-2 h-full transition-colors"
            title="Indentation"
          >
            {indentLabel}
          </div>

          {/* Encoding */}
          <div
            className="hidden md:flex items-center hover:bg-[var(--bg-hover)] px-2 h-full transition-colors"
            title="Text encoding"
          >
            {encodingLabel}
          </div>

          {/* EOL */}
          <div
            className="hidden lg:flex items-center hover:bg-[var(--bg-hover)] px-2 h-full transition-colors"
            title="End of line"
          >
            {eolLabel}
          </div>

          {/* Chat mode label */}
          {chatModeLabel && (
            <div
              className="hidden min-[1000px]:flex items-center px-2 h-full text-[var(--text-muted)] font-semibold border-x border-[var(--border-subtle)]/20 max-w-[120px] truncate"
              title={chatModeLabel}
            >
              {chatModeLabel}
            </div>
          )}

          {/* Version */}
          {versionDisplay && (
            <button
              type="button"
              className="hidden min-[1100px]:flex items-center px-2 h-full bg-[var(--solar-green)]/15 text-[var(--solar-green)] font-bold border-x border-[var(--border-subtle)]/20 cursor-pointer hover:brightness-110 border-0"
              title="Copy version"
              onClick={copyVersion}
            >
              {versionDisplay}
            </button>
          )}

          {/* Prettier / format */}
          {canFormatDocument && (
            <button
              type="button"
              className="hidden sm:flex items-center gap-1 hover:text-[var(--text-main)] cursor-pointer px-2 py-0.5 transition-colors border-0 bg-transparent rounded-sm bg-[var(--bg-hover)]/80"
              title="Format document"
              onClick={() => onFormatClick?.()}
            >
              <Check size={12} className="text-[var(--solar-green)]" /> Prettier
            </button>
          )}

          {/* Notifications */}
          <button
            type="button"
            className="relative flex items-center justify-center hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] cursor-pointer px-3 h-full transition-colors border-0 bg-transparent"
            title="Notifications"
            aria-expanded={notifOpen}
            onMouseDown={stop}
            onClick={() => setNotifOpen(o => !o)}
          >
            <Bell size={13} className="opacity-70" />
            {unread > 0 && (
              <span className="absolute top-0.5 right-1 min-w-[14px] h-[14px] px-0.5 rounded-full bg-[var(--solar-red)] text-white text-[9px] font-bold flex items-center justify-center">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </button>

          {/* Command hub */}
          <div className="relative h-full flex items-center" ref={cmdRef}>
            <button
              type="button"
              className={`flex items-center justify-center cursor-pointer px-2 h-full transition-colors border-0 bg-transparent ${
                cmdOpen
                  ? 'text-[var(--solar-cyan)] bg-[var(--bg-hover)]'
                  : 'hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]'
              }`}
              title="Command Hub"
              onClick={() => setCmdOpen(v => !v)}
            >
              <KeyRound size={13} className="opacity-70" />
            </button>

            {cmdOpen && (
              <div
                className="absolute bottom-full right-0 mb-1 z-[110] w-[240px] bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded shadow-xl overflow-hidden"
                onMouseDown={stop}
              >
                <div className="px-3 py-1.5 border-b border-[var(--border-subtle)] text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                  Command Hub
                </div>
                <div className="max-h-[300px] overflow-y-auto no-scrollbar">
                  {commands.map(c => (
                    <button
                      key={c.label}
                      type="button"
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--bg-hover)] text-left group transition-colors border-0 bg-transparent"
                      onClick={() => {
                        window.dispatchEvent(
                          new CustomEvent(EVENT_AGENT_SEND, { detail: { message: c.cmd } })
                        );
                        setCmdOpen(false);
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
