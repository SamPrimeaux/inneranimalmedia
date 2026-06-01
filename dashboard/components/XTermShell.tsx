import React, {
  useEffect, useRef, useState, useImperativeHandle,
  forwardRef, useCallback,
} from 'react';
import {
  X, ChevronDown, ChevronUp, TriangleAlert, CircleCheck,
  Terminal as TerminalIcon, Wifi, WifiOff, RefreshCw,
  Plus, Columns2, ChevronRight,
} from 'lucide-react';
import {
  TerminalSessionPane,
  TerminalSessionPaneHandle,
  formatAgentsamModelsToTerminal,
  type TerminalConnectionStatus,
} from './TerminalSessionPane';
import type { AgentWorkspaceContextPacket } from '../src/ideWorkspace';
import { fetchLocalTerminalConnection, type TerminalTarget } from './LocalTerminalSetup';

// ─── Types ────────────────────────────────────────────────────────────────────
const DEFAULT_PRODUCT = 'Agent Sam';
export type ShellTab = 'terminal' | 'output' | 'problems';

const LS_SHELL = 'iam_terminal_shell_pref';
const LS_SPLIT = 'iam_terminal_split';

function statusMessage(s: TerminalConnectionStatus): string {
  switch (s) {
    case 'connecting':
      return 'Connecting';
    case 'connected':
      return 'Connected';
    case 'reconnecting':
      return 'Reconnecting';
    case 'offline':
      return 'Offline';
    case 'auth_failed':
      return 'Auth failed';
    case 'backend_unavailable':
      return 'Backend unavailable';
    case 'session_expired':
      return 'Session expired';
    case 'timed_out':
      return 'Timed out';
    default:
      return 'Disconnected';
  }
}

export interface XTermShellHandle {
  writeToTerminal: (text: string) => void;
  runCommand: (cmd: string) => void;
  setActiveTab: (t: ShellTab) => void;
}

interface XTermShellProps {
  onClose: () => void;
  problems?: { file: string; line: number; msg: string; severity: 'error' | 'warning'; ts?: string; id?: string }[];
  outputLines?: string[];
  onOutputLine?: (line: string) => void;
  /** Refetch /api/agent/problems when the Problems tab is opened. */
  onProblemsTabOpen?: () => void;
  iamOrigin?: string;
  workspaceCdCommand?: string;
  agentDashboardUrl?: string;
  showIamWelcomeBar?: boolean;
  workspaceLabel?: string;
  workspaceId?: string;
  productLabel?: string;
  layout?: 'page' | 'drawer';
  workspaceContext?: AgentWorkspaceContextPacket | null;
}

const MIN_HEIGHT = 140;
const MAX_HEIGHT_RATIO = 0.82;
const DEFAULT_HEIGHT = 320;

const SHELL_CHOICES = [
  { label: 'zsh', path: '/bin/zsh' },
  { label: 'bash', path: '/bin/bash' },
  { label: 'sh', path: '/bin/sh' },
] as const;

// ─── WelcomeSplash ────────────────────────────────────────────────────────────
const GORILLA_LINES = [
  '        ▄████████▄        ',
  '      ██░░░░░░░░░░██      ',
  '     ██░░░░░░░░░░░░██     ',
  '     ██░░ ◉    ◉ ░░██     ',
  '     ██░░░ ▀██▀ ░░░██     ',
  '     ██░░░██████░░░██     ',
  '     ████░░░░░░░████      ',
  '    ██████░░░░░██████     ',
  '   ██    ████████    ██   ',
  '         ▲      ▲         ',
];

type SplashAction = 'local' | 'cloud' | 'models';

interface WelcomeSplashProps {
  cdCommand?: string;
  showLocalOption: boolean;
  onAction: (action: SplashAction) => void;
}

const SPLASH_MENU: { action: SplashAction; label: string; desc: string; localOnly?: boolean }[] = [
  { action: 'local', label: 'Start local', desc: 'Your Mac via localpty', localOnly: true },
  { action: 'cloud', label: 'Cloud terminal', desc: 'Hosted shell in your workspace' },
  { action: 'models', label: 'Agent Sam', desc: 'View available models' },
];

function WelcomeSplash({ cdCommand, showLocalOption, onAction }: WelcomeSplashProps) {
  const menuItems = SPLASH_MENU.filter((item) => !item.localOnly || showLocalOption).map((item, index) => ({
    ...item,
    displayKey: String(index + 1),
  }));

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const match = menuItems.find((m) => m.displayKey === e.key);
      if (match) onAction(match.action);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onAction, menuItems]);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 10,
        background: 'var(--terminal-surface)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", monospace',
        padding: '16px',
        overflow: 'hidden',
      }}
    >
      <pre
        aria-hidden
        style={{
          margin: 0,
          padding: 0,
          fontSize: '11px',
          lineHeight: '1.4',
          color: 'var(--text-muted)',
          textAlign: 'center',
          userSelect: 'none',
          letterSpacing: '0.03em',
        }}
      >
        {GORILLA_LINES.join('\n')}
      </pre>

      <div style={{ marginTop: '14px', textAlign: 'center', lineHeight: 1 }}>
        <div
          style={{
            color: 'var(--solar-yellow)',
            fontSize: '22px',
            fontWeight: 700,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
          }}
        >
          INNERANIMAL
        </div>
        <div
          style={{
            color: 'var(--solar-cyan)',
            fontSize: '13px',
            fontWeight: 700,
            letterSpacing: '0.6em',
            marginTop: '4px',
            paddingLeft: '0.6em',
          }}
        >
          MEDIA
        </div>
      </div>

      {cdCommand && (
        <div
          style={{
            marginTop: '16px',
            color: 'var(--solar-cyan)',
            fontSize: '10px',
            opacity: 0.5,
            border: '1px solid var(--border-subtle)',
            padding: '3px 10px',
            borderRadius: '2px',
            letterSpacing: '0.03em',
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {cdCommand}
        </div>
      )}

      <div style={{ marginTop: '22px', width: 'min(280px, 100%)' }}>
        {menuItems.map(({ action, displayKey, label, desc }) => (
          <div
            key={action}
            role="button"
            tabIndex={0}
            onClick={() => onAction(action)}
            onKeyDown={(e) => e.key === 'Enter' && onAction(action)}
            style={{
              cursor: 'pointer',
              fontSize: '12px',
              lineHeight: '1.5',
              color: 'var(--text-main)',
              display: 'flex',
              gap: '8px',
              marginBottom: '10px',
            }}
          >
            <span style={{ color: 'var(--solar-yellow)', fontWeight: 700, minWidth: '18px' }}>{displayKey}.</span>
            <span>
              <span style={{ display: 'block' }}>{label}</span>
              <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', opacity: 0.75 }}>
                {desc}
              </span>
            </span>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: '20px',
          color: 'var(--solar-yellow)',
          fontSize: '11px',
          opacity: 0.65,
          letterSpacing: '0.04em',
        }}
      >
        Enter a number to get started...
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export const XTermShell = forwardRef<XTermShellHandle, XTermShellProps>(
  (
    {
      onClose,
      problems = [],
      outputLines = [],
      onProblemsTabOpen,
      iamOrigin,
      workspaceCdCommand,
      agentDashboardUrl: agentDashboardUrlProp,
      showIamWelcomeBar = true,
      workspaceLabel = '',
      workspaceId,
      productLabel = DEFAULT_PRODUCT,
      layout = 'page',
      workspaceContext: _workspaceContext = null,
    },
    ref,
  ) => {
    const isDrawer = layout === 'drawer';
    const [resolvedOrigin, setResolvedOrigin] = useState(
      iamOrigin ?? (typeof window !== 'undefined' ? window.location.origin : 'https://inneranimalmedia.com'),
    );
    const [resolvedCdCmd, setResolvedCdCmd] = useState(workspaceCdCommand);
    const resolvedCdCmdRef = useRef(resolvedCdCmd);
    useEffect(() => {
      resolvedCdCmdRef.current = resolvedCdCmd;
    }, [resolvedCdCmd]);

    const agentDashboardUrl =
      agentDashboardUrlProp ?? `${resolvedOrigin.replace(/\/$/, '')}/dashboard/agent`;

    const primaryPaneRef = useRef<TerminalSessionPaneHandle>(null);
    const secondaryPaneRef = useRef<TerminalSessionPaneHandle>(null);
    const plusMenuRef = useRef<HTMLDivElement>(null);

    const [height, setHeight] = useState(DEFAULT_HEIGHT);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [activeTab, setActiveTab] = useState<ShellTab>('terminal');
    const problemsTabOpenedRef = useRef(false);

    useEffect(() => {
      if (activeTab !== 'problems') {
        problemsTabOpenedRef.current = false;
        return;
      }
      if (problemsTabOpenedRef.current) return;
      problemsTabOpenedRef.current = true;
      onProblemsTabOpen?.();
    }, [activeTab, onProblemsTabOpen]);

    const [showSplash, setShowSplash] = useState(true);
    const [showLocalSplashOption, setShowLocalSplashOption] = useState(false);
    const [restarting, setRestarting] = useState(false);
    const [tunnelHealth, setTunnelHealth] = useState<{ healthy: boolean; connections: number } | null>(null);
    const [uptime, setUptime] = useState(0);

    const [primaryStatus, setPrimaryStatus] = useState<TerminalConnectionStatus>('connecting');
    const [primarySessionId, setPrimarySessionId] = useState<string | null>(null);
    const [secondaryStatus, setSecondaryStatus] = useState<TerminalConnectionStatus>('connecting');

    const [shellPref, setShellPref] = useState(() => {
      if (typeof window === 'undefined') return '/bin/zsh';
      try {
        const v = localStorage.getItem(LS_SHELL)?.trim();
        if (v && v.startsWith('/')) return v;
      } catch {
        /* ignore */
      }
      return '/bin/zsh';
    });
    const [splitEnabled, setSplitEnabled] = useState(() => {
      if (typeof window === 'undefined') return false;
      try {
        return localStorage.getItem(LS_SPLIT) === '1';
      } catch {
        return false;
      }
    });
    const [plusMenuOpen, setPlusMenuOpen] = useState(false);
    const [splitSubOpen, setSplitSubOpen] = useState(false);
    const [terminalTarget, setTerminalTarget] = useState<TerminalTarget>('platform_vm');

    useEffect(() => {
      if (!showSplash || !workspaceId?.trim()) {
        setShowLocalSplashOption(false);
        return;
      }
      let cancelled = false;
      void fetchLocalTerminalConnection(workspaceId).then(({ isActive }) => {
        if (!cancelled) setShowLocalSplashOption(isActive);
      });
      return () => {
        cancelled = true;
      };
    }, [showSplash, workspaceId]);

    const startTerminalConnection = useCallback(
      async (target: TerminalTarget) => {
        setTerminalTarget(target);
        if (target === 'user_hosted_tunnel' && workspaceId?.trim()) {
          const { shell: connShell } = await fetchLocalTerminalConnection(workspaceId);
          if (connShell) setShellPref(connShell);
        }
        primaryPaneRef.current?.reconnectClean();
        if (splitEnabled) secondaryPaneRef.current?.reconnectClean();
      },
      [splitEnabled, workspaceId],
    );

    useEffect(() => {
      if (isDrawer) setIsCollapsed(false);
    }, [isDrawer]);

    useEffect(() => {
      try {
        localStorage.setItem(LS_SHELL, shellPref);
      } catch {
        /* ignore */
      }
    }, [shellPref]);

    useEffect(() => {
      try {
        localStorage.setItem(LS_SPLIT, splitEnabled ? '1' : '0');
      } catch {
        /* ignore */
      }
    }, [splitEnabled]);

    useEffect(() => {
      const onDoc = (e: MouseEvent) => {
        const t = e.target as Node;
        if (plusMenuRef.current && !plusMenuRef.current.contains(t)) {
          setPlusMenuOpen(false);
          setSplitSubOpen(false);
        }
      };
      document.addEventListener('mousedown', onDoc);
      return () => document.removeEventListener('mousedown', onDoc);
    }, []);

    useEffect(() => {
      void fetch('/api/agentsam/config', { credentials: 'same-origin' })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((data: { workspace_cd_command?: string; iam_origin?: string }) => {
          if (workspaceCdCommand === undefined && data.workspace_cd_command) setResolvedCdCmd(data.workspace_cd_command);
          if (iamOrigin === undefined && data.iam_origin) setResolvedOrigin(data.iam_origin);
        })
        .catch(() => {});
    }, []);

    useEffect(() => {
      if (primaryStatus !== 'connected') {
        setUptime(0);
        return;
      }
      const t = setInterval(() => setUptime((s) => s + 1), 1000);
      return () => clearInterval(t);
    }, [primaryStatus]);

    const fmtUptime = (s: number) => {
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      return h > 0
        ? `${h}h${String(m).padStart(2, '0')}m`
        : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    };

    const fetchTunnelStatus = useCallback(() => {
      void fetch('/api/tunnel/status', { credentials: 'same-origin' })
        .then((r) => r.json())
        .then((j) => {
          setTunnelHealth({ healthy: j?.healthy === true, connections: j?.connections ?? 0 });
          const ok = j?.healthy === true;
          const conns = j?.connections ?? 0;
          primaryPaneRef.current?.writeAnsi(
            `\r\n${ok ? '\x1b[38;5;82m' : '\x1b[38;5;208m'}  ◈ Cloudflare Tunnel\x1b[0m — ${
              ok ? `healthy · ${conns} connection${conns !== 1 ? 's' : ''}` : 'unreachable'
            }\r\n`,
          );
        })
        .catch(() => setTunnelHealth(null));
    }, []);

    const handleTunnelRestart = useCallback(async () => {
      setRestarting(true);
      primaryPaneRef.current?.writeAnsi('\r\n\x1b[38;5;208m  ◌ Requesting tunnel restart…\x1b[0m');
      try {
        const res = await fetch('/api/tunnel/restart', { method: 'POST', credentials: 'same-origin' });
        const data = await res.json().catch(() => ({} as { ok?: boolean; error?: string }));
        if (data.ok) {
          primaryPaneRef.current?.writeAnsi('\x1b[38;5;82m  ✓ Restart requested — re-checking in 4s…\x1b[0m');
          setTimeout(fetchTunnelStatus, 4000);
        } else {
          primaryPaneRef.current?.writeAnsi(`\x1b[38;5;196m  ✗ ${data.error ?? 'Failed'}\x1b[0m`);
        }
      } catch (e: unknown) {
        primaryPaneRef.current?.writeAnsi(
          `\x1b[38;5;196m  ✗ Network error: ${e instanceof Error ? e.message : String(e)}\x1b[0m`,
        );
      } finally {
        setRestarting(false);
      }
    }, [fetchTunnelStatus]);

    const handleSplashAction = useCallback(
      async (action: SplashAction) => {
        setIsCollapsed(false);
        setActiveTab('terminal');

        if (action === 'cloud') {
          setShowSplash(false);
          await startTerminalConnection('platform_vm');
          return;
        }

        if (action === 'local') {
          if (!workspaceId?.trim()) return;
          const { isActive, shell: connShell } = await fetchLocalTerminalConnection(workspaceId);
          if (!isActive) return;
          if (connShell) setShellPref(connShell);
          setShowSplash(false);
          await startTerminalConnection('user_hosted_tunnel');
          return;
        }

        if (action === 'models') {
          setShowSplash(false);
          const write = (text: string) => primaryPaneRef.current?.writeAnsi(text);
          window.setTimeout(() => {
            void formatAgentsamModelsToTerminal(write);
          }, 80);
        }
      },
      [startTerminalConnection, workspaceId],
    );

    const terminalAreaVisible = activeTab === 'terminal' && !isCollapsed;
    const terminalConnectEnabled = terminalAreaVisible && !showSplash;
    const connectionTargetLabel =
      terminalTarget === 'user_hosted_tunnel' ? 'Local' : 'Cloud';

    useImperativeHandle(ref, () => ({
      writeToTerminal: (text: string) => {
        setIsCollapsed(false);
        setActiveTab('terminal');
        primaryPaneRef.current?.writeToTerminal(text);
      },
      runCommand: (cmd: string) => {
        setIsCollapsed(false);
        setActiveTab('terminal');
        primaryPaneRef.current?.runCommand(cmd);
      },
      setActiveTab: (t: ShellTab) => {
        setActiveTab(t);
        setIsCollapsed(false);
      },
    }));

    const handleDragStart = (e: React.MouseEvent) => {
      e.preventDefault();
      const startY = e.clientY;
      const startH = height;
      const maxH = window.innerHeight * MAX_HEIGHT_RATIO;
      const onMove = (me: MouseEvent) => {
        const next = Math.max(MIN_HEIGHT, Math.min(startH + (startY - me.clientY), maxH));
        setHeight(next);
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };

    const errorCount = problems.filter((p) => p.severity === 'error').length;
    const warningCount = problems.filter((p) => p.severity === 'warning').length;

    const shellShort =
      shellPref.replace(/^\/bin\//, '').replace(/^\/usr\/bin\//, '') || shellPref;

    return (
      <>
        <style>{`
          .iam-scanlines::after {
            content: '';
            position: absolute; inset: 0;
            background: repeating-linear-gradient(
              to bottom,
              transparent, transparent 2px,
              rgba(0,0,0,0.05) 2px, rgba(0,0,0,0.05) 4px
            );
            pointer-events: none; z-index: 1;
          }
          @keyframes iam-pulse-cyan {
            0%, 100% { box-shadow: 0 0 4px var(--solar-cyan); }
            50%       { box-shadow: 0 0 12px var(--solar-cyan); }
          }
          .iam-online-dot { animation: iam-pulse-cyan 2s ease-in-out infinite; }
          .iam-terminal-chrome-fill {
            flex: 1 1 0%;
            min-height: 0;
            min-width: 0;
            display: flex;
            flex-direction: column;
            background: var(--terminal-surface);
          }
        `}</style>

        <div
          className="iam-scanlines relative flex flex-col shadow-[0_-4px_20px_rgba(0,0,0,0.3)] shrink-0 border-t border-[var(--border-subtle)]"
          style={{
            height: isDrawer ? '100%' : isCollapsed ? '36px' : `${height}px`,
            background: 'var(--terminal-chrome)',
            transition: isDrawer ? 'none' : 'height 0.2s ease-out',
            zIndex: 40,
            ...(isDrawer ? { flex: '1 1 0%', minHeight: 0 } : null),
          }}
        >
          {!isDrawer && !isCollapsed && (
            <div
              className="h-1 w-full shrink-0 cursor-ns-resize group flex items-center justify-center"
              onMouseDown={handleDragStart}
            >
              <div className="h-px w-16 rounded-full bg-[var(--border-subtle)] group-hover:bg-[var(--solar-cyan)] group-hover:w-24 transition-all duration-200" />
            </div>
          )}

          <div
            className="h-9 min-h-9 shrink-0 flex items-center justify-between px-2 pl-3 border-b border-[var(--border-subtle)] select-none gap-2"
            style={{ background: 'var(--terminal-chrome)' }}
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className="flex items-stretch gap-0 shrink-0">
                {(['terminal', 'output', 'problems'] as ShellTab[]).map((tab) => {
                  const badge =
                    tab === 'problems' && errorCount + warningCount > 0
                      ? errorCount > 0
                        ? errorCount
                        : warningCount
                      : null;
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveTab(tab)}
                      className={`relative px-3 py-2 text-[10px] font-bold tracking-[0.14em] uppercase transition-colors flex items-center gap-1.5 ${
                        activeTab === tab
                          ? 'text-[var(--solar-cyan)]'
                          : 'text-[var(--terminal-tab-muted)] hover:text-[var(--text-main)]'
                      }`}
                    >
                      {tab === 'terminal' && <TerminalIcon size={9} />}
                      {tab}
                      {badge !== null && (
                        <span className="px-1 py-0.5 rounded text-[8px] bg-[var(--solar-red)]/20 text-[var(--solar-red)] border border-[var(--solar-red)]/30">
                          {badge}
                        </span>
                      )}
                      {activeTab === tab && (
                        <span className="absolute bottom-0 left-1 right-1 h-0.5 rounded-sm bg-[var(--solar-cyan)] shadow-[0_0_6px_var(--solar-cyan)]" />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="hidden sm:flex items-center h-5 w-px bg-[var(--border-subtle)] shrink-0" />

              <span
                className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-[var(--border-subtle)] text-[10px] font-mono uppercase tracking-wide text-[var(--text-muted)] shrink-0"
                title="Active terminal target (change via welcome screen)"
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                    terminalTarget === 'user_hosted_tunnel'
                      ? 'bg-[var(--solar-yellow)]'
                      : 'bg-[var(--solar-cyan)]'
                  }`}
                />
                {connectionTargetLabel}
              </span>

              <div className="hidden sm:flex items-center h-5 w-px bg-[var(--border-subtle)] shrink-0" />

              <div className="hidden sm:flex items-center gap-1.5 shrink-0 min-w-0">
                {(primaryStatus === 'connecting' || primaryStatus === 'reconnecting') && (
                  <span className="text-[10px] font-mono text-[var(--solar-yellow)] flex items-center gap-1.5 truncate">
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--solar-yellow)] opacity-40" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--solar-yellow)]" />
                    </span>
                    {statusMessage(primaryStatus)}
                  </span>
                )}
                {primaryStatus === 'connected' && (
                  <span className="text-[10px] font-mono text-[var(--solar-green)] flex items-center gap-1.5 truncate">
                    <span className="iam-online-dot h-2 w-2 rounded-full bg-[var(--solar-green)] inline-block shrink-0" />
                    {statusMessage(primaryStatus)} · {fmtUptime(uptime)}
                    {primarySessionId && (
                      <span className="text-[var(--text-muted)]/40 hidden md:inline">
                        {' '}
                        · {primarySessionId.slice(0, 6)}…
                      </span>
                    )}
                  </span>
                )}
                {primaryStatus !== 'connected' &&
                  primaryStatus !== 'connecting' &&
                  primaryStatus !== 'reconnecting' && (
                    <span className="text-[10px] font-mono text-[var(--solar-red)] flex items-center gap-1.5 truncate">
                      <WifiOff size={10} />
                      {statusMessage(primaryStatus)}
                    </span>
                  )}
                {splitEnabled && (
                  <span className="text-[9px] font-mono text-[var(--text-muted)] shrink-0 hidden lg:inline">
                    · split · {statusMessage(secondaryStatus)}
                  </span>
                )}
              </div>

              {(primaryStatus === 'offline' ||
                primaryStatus === 'disconnected' ||
                primaryStatus === 'backend_unavailable' ||
                primaryStatus === 'timed_out') && (
                <button
                  type="button"
                  onClick={() => primaryPaneRef.current?.reconnectClean()}
                  className="hidden sm:inline-flex items-center gap-1.5 ml-1 px-2 py-1 rounded border border-[var(--border-subtle)] text-[10px] font-mono text-[var(--text-muted)] hover:text-[var(--solar-cyan)] hover:border-[var(--solar-cyan)]/30 hover:bg-[var(--bg-hover)] transition-colors shrink-0"
                  title="Retry terminal connection"
                >
                  <RefreshCw size={11} />
                  Retry
                </button>
              )}

              {tunnelHealth && (
                <>
                  <div className="hidden md:flex items-center h-5 w-px bg-[var(--border-subtle)] shrink-0" />
                  <div className="hidden md:flex items-center gap-1.5 shrink-0">
                    {tunnelHealth.healthy ? (
                      <Wifi size={9} className="text-[var(--solar-green)]" />
                    ) : (
                      <WifiOff size={9} className="text-[var(--solar-red)]" />
                    )}
                    <span
                      className={`text-[9px] font-mono ${tunnelHealth.healthy ? 'text-[var(--solar-green)]' : 'text-[var(--solar-red)]'}`}
                    >
                      {tunnelHealth.healthy ? `Tunnel ×${tunnelHealth.connections}` : 'Tunnel ✗'}
                    </span>
                    <button
                      onClick={handleTunnelRestart}
                      disabled={restarting}
                      title="Restart Cloudflare Tunnel"
                      className="p-0.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--solar-yellow)] transition-colors disabled:opacity-40"
                    >
                      <RefreshCw size={9} className={restarting ? 'animate-spin' : ''} />
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {activeTab === 'terminal' && (
                <>
                  <span
                    className="hidden sm:inline text-[10px] font-mono text-[var(--text-muted)] max-w-[72px] truncate"
                    title={shellPref}
                  >
                    {shellShort}
                  </span>
                  <div className="relative" ref={plusMenuRef}>
                    <button
                      type="button"
                      title="Terminal menu (shell, split, settings)"
                      className="inline-flex items-center justify-center p-1.5 rounded border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--solar-cyan)] hover:border-[var(--solar-cyan)]/40 hover:bg-[var(--bg-hover)]"
                      onClick={() => setPlusMenuOpen((v) => !v)}
                    >
                      <Plus size={15} strokeWidth={2} />
                    </button>
                    {plusMenuOpen && (
                      <div
                        className="absolute right-0 top-full mt-1 py-1 min-w-[220px] rounded-md border border-[var(--border-subtle)] bg-[var(--bg-panel)] shadow-lg z-50 text-left"
                        role="menu"
                      >
                        <div className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                          Shell
                        </div>
                        {SHELL_CHOICES.map(({ label, path }) => (
                          <button
                            key={path}
                            type="button"
                            role="menuitem"
                            className="w-full text-left px-3 py-1.5 text-[11px] font-mono hover:bg-[var(--bg-hover)] text-[var(--text-main)]"
                            onClick={() => {
                              setShellPref(path);
                              setPlusMenuOpen(false);
                              primaryPaneRef.current?.reconnectClean();
                              if (splitEnabled) secondaryPaneRef.current?.reconnectClean();
                            }}
                          >
                            {label}
                          </button>
                        ))}
                        <div className="h-px bg-[var(--border-subtle)] my-1" />
                        <button
                          type="button"
                          role="menuitem"
                          className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-[var(--bg-hover)] text-[var(--text-main)] flex items-center justify-between gap-2"
                          onClick={() => setSplitSubOpen((s) => !s)}
                        >
                          Split terminal
                          <ChevronRight size={14} className={splitSubOpen ? 'rotate-90' : ''} />
                        </button>
                        {splitSubOpen && (
                          <div className="pl-2 pb-1 border-l border-[var(--border-subtle)] ml-3 mr-1">
                            <button
                              type="button"
                              className="w-full text-left px-2 py-1 text-[11px] font-mono rounded hover:bg-[var(--bg-hover)]"
                              onClick={() => {
                                setSplitEnabled(true);
                                setPlusMenuOpen(false);
                                setSplitSubOpen(false);
                              }}
                            >
                              Side by side
                            </button>
                            <button
                              type="button"
                              className="w-full text-left px-2 py-1 text-[11px] font-mono rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)]"
                              onClick={() => {
                                setPlusMenuOpen(false);
                                primaryPaneRef.current?.writeToTerminal(
                                  'Stacked split: use the bottom drawer height resize for now; horizontal split is active.',
                                );
                              }}
                            >
                              Stacked (use panel resize)
                            </button>
                          </div>
                        )}
                        <button
                          type="button"
                          role="menuitem"
                          className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-[var(--bg-hover)] text-[var(--text-main)]"
                          onClick={() => {
                            setPlusMenuOpen(false);
                            primaryPaneRef.current?.writeToTerminal(
                              'JavaScript Debug Terminal: use Cursor/VS Code locally for Node attach; this web PTY runs on the iam-pty host.',
                            );
                          }}
                        >
                          JavaScript Debug Terminal
                        </button>
                        <div className="h-px bg-[var(--border-subtle)] my-1" />
                        <button
                          type="button"
                          role="menuitem"
                          className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-[var(--bg-hover)] text-[var(--text-main)]"
                          onClick={() => {
                            setPlusMenuOpen(false);
                            window.location.assign('/dashboard/settings');
                          }}
                        >
                          Configure Terminal Settings
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-[var(--bg-hover)] text-[var(--text-main)]"
                          onClick={() => {
                            setPlusMenuOpen(false);
                            primaryPaneRef.current?.writeToTerminal(
                              `Default shell for new connections: ${shellPref} (saved in this browser).`,
                            );
                          }}
                        >
                          Select Default Profile
                        </button>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    title={splitEnabled ? 'Single terminal' : 'Split terminal (side by side)'}
                    className={`p-1.5 rounded border transition-colors ${
                      splitEnabled
                        ? 'border-[var(--solar-cyan)]/50 bg-[var(--solar-cyan)]/10 text-[var(--solar-cyan)]'
                        : 'border-transparent text-[var(--text-muted)] hover:text-[var(--solar-cyan)] hover:border-[var(--solar-cyan)]/20'
                    }`}
                    onClick={() => setSplitEnabled((v) => !v)}
                  >
                    <Columns2 size={15} strokeWidth={2} />
                  </button>
                </>
              )}

              {activeTab === 'terminal' && showIamWelcomeBar && (
                <button
                  type="button"
                  onClick={() => setShowSplash((v) => !v)}
                  title="Toggle welcome screen"
                  className={`p-1.5 rounded text-[9px] font-mono font-bold tracking-wider transition-colors border ${
                    showSplash
                      ? 'bg-[var(--solar-cyan)]/10 border-[var(--solar-cyan)]/30 text-[var(--solar-cyan)]'
                      : 'border-transparent text-[var(--text-muted)] hover:text-[var(--solar-cyan)] hover:border-[var(--solar-cyan)]/20'
                  }`}
                >
                  <TerminalIcon size={12} />
                </button>
              )}
              {!isDrawer && (
                <button
                  type="button"
                  onClick={() => setIsCollapsed(!isCollapsed)}
                  className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
                  title={isCollapsed ? 'Expand' : 'Minimize'}
                >
                  {isCollapsed ? <ChevronUp size={15} strokeWidth={2} /> : <ChevronDown size={15} strokeWidth={2} />}
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--solar-red)] transition-colors"
                title="Close"
              >
                <X size={15} strokeWidth={2} />
              </button>
            </div>
          </div>

          {!isCollapsed && (
            <div className="iam-terminal-chrome-fill flex-1 min-h-0 overflow-hidden relative">
              <div className="flex flex-1 min-h-0 min-w-0 flex-col md:flex-row">
                <div
                  className={`relative iam-terminal-chrome-fill ${splitEnabled ? 'md:w-1/2 md:max-w-[50%]' : 'w-full'}`}
                >
                  {/* Match OUTPUT/PROBLEMS geometry: explicit filled box so xterm FitAddon gets non-zero height */}
                  <div className="absolute inset-0 flex flex-col min-h-0 min-w-0">
                    <TerminalSessionPane
                      ref={primaryPaneRef}
                      workspaceId={workspaceId}
                      targetType={terminalTarget}
                      shell={shellPref}
                      ptySlot=""
                      visible={terminalAreaVisible}
                      connectEnabled={terminalConnectEnabled}
                      onConnectionChange={setPrimaryStatus}
                      onSessionIdChange={setPrimarySessionId}
                    />
                  </div>
                  {showSplash && showIamWelcomeBar && (
                    <WelcomeSplash
                      cdCommand={resolvedCdCmd}
                      showLocalOption={showLocalSplashOption}
                      onAction={handleSplashAction}
                    />
                  )}
                </div>

                {splitEnabled && (
                  <>
                    <div
                      className="hidden md:block w-px shrink-0 bg-[var(--border-subtle)]"
                      aria-hidden
                    />
                    <div
                      className={`relative iam-terminal-chrome-fill border-t md:border-t-0 border-[var(--border-subtle)] md:border-0 ${splitEnabled ? 'md:w-1/2 md:max-w-[50%]' : ''}`}
                    >
                      <div className="absolute top-1 left-2 z-[5] pointer-events-none text-[9px] font-mono uppercase tracking-wider text-[var(--text-muted)]/80">
                        Session 2
                      </div>
                      <div className="absolute inset-0 flex flex-col min-h-0 min-w-0">
                        <TerminalSessionPane
                          ref={secondaryPaneRef}
                          workspaceId={workspaceId}
                          targetType={terminalTarget}
                          shell={shellPref}
                          ptySlot="s2"
                          visible={terminalAreaVisible}
                          connectEnabled={terminalConnectEnabled}
                          onConnectionChange={setSecondaryStatus}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>

              {activeTab === 'output' && (
                <div className="absolute inset-0 overflow-y-auto custom-scrollbar px-4 py-3 font-mono text-[11px] leading-relaxed text-[var(--text-main)] bg-[var(--terminal-surface)] z-[20]">
                  {outputLines.length === 0 ? (
                    <p className="text-[var(--text-muted)]/40 text-xs italic mt-4">No output yet.</p>
                  ) : (
                    outputLines.map((line, i) => (
                      <div
                        key={i}
                        className="mb-1 border-l-2 border-transparent pl-2 hover:border-[var(--solar-cyan)]/30"
                      >
                        {line}
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'problems' && (
                <div className="absolute inset-0 overflow-y-auto custom-scrollbar p-4 space-y-2 bg-[var(--terminal-surface)] z-[20]">
                  {problems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)] opacity-40 gap-2">
                      <CircleCheck size={28} />
                      <p className="text-xs font-mono">No problems detected</p>
                    </div>
                  ) : (
                    problems.map((p, i) => (
                      <div
                        key={p.id ?? `${p.file}-${p.line}-${i}`}
                        className={`flex items-start gap-2 p-2 rounded bg-[var(--bg-panel)] border-l-2 ${
                          p.severity === 'error' ? 'border-[var(--solar-red)]' : 'border-[var(--solar-yellow)]'
                        }`}
                      >
                        <TriangleAlert
                          size={13}
                          className={
                            p.severity === 'error' ? 'text-[var(--solar-red)]' : 'text-[var(--solar-yellow)]'
                          }
                        />
                        <div className="min-w-0">
                          <div className="text-[11px] font-medium text-[var(--text-main)] font-mono">{p.msg}</div>
                          <div className="text-[10px] text-[var(--text-muted)] font-mono">
                            {p.ts ? (
                              <span>{p.ts}</span>
                            ) : null}
                            {p.ts && (p.file || p.line) ? ' · ' : null}
                            {p.line > 0 ? `${p.file}:${p.line}` : p.file || 'error'}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </>
    );
  },
);

XTermShell.displayName = 'XTermShell';
