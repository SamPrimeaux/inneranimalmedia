import React, {
  useEffect, useRef, useState, useImperativeHandle,
  forwardRef, useCallback,
} from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import {
  X, ChevronDown, ChevronUp, TriangleAlert, CircleCheck,
  Terminal as TerminalIcon, Wifi, WifiOff, RefreshCw,
} from 'lucide-react';
import '@xterm/xterm/css/xterm.css';

// ─── Types ────────────────────────────────────────────────────────────────────
const DEFAULT_PRODUCT = 'Agent Sam';
export type ShellTab = 'terminal' | 'output' | 'problems';
type TerminalConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'offline'
  | 'auth_failed'
  | 'backend_unavailable'
  | 'session_expired'
  | 'disconnected';

const RETRYABLE_STATES: ReadonlySet<TerminalConnectionStatus> = new Set([
  'connecting',
  'reconnecting',
  'backend_unavailable',
  'disconnected',
]);

function statusMessage(s: TerminalConnectionStatus): string {
  switch (s) {
    case 'connecting': return 'Connecting';
    case 'connected': return 'Connected';
    case 'reconnecting': return 'Reconnecting';
    case 'offline': return 'Offline';
    case 'auth_failed': return 'Auth failed';
    case 'backend_unavailable': return 'Backend unavailable';
    case 'session_expired': return 'Session expired';
    default: return 'Disconnected';
  }
}

export interface XTermShellHandle {
  writeToTerminal: (text: string) => void;
  runCommand: (cmd: string) => void;
  setActiveTab: (t: ShellTab) => void;
}

interface XTermShellProps {
  onClose: () => void;
  problems?: { file: string; line: number; msg: string; severity: 'error' | 'warning' }[];
  outputLines?: string[];
  onOutputLine?: (line: string) => void;
  iamOrigin?: string;
  workspaceCdCommand?: string;
  agentDashboardUrl?: string;
  showIamWelcomeBar?: boolean;
  workspaceLabel?: string;
  workspaceId?: string;
  productLabel?: string;
  /**
   * Layout mode:
   * - page: component owns its height (resizable + collapsible)
   * - drawer: parent container owns height (global terminal drawer)
   */
  layout?: 'page' | 'drawer';
}

const MIN_HEIGHT = 140;
const MAX_HEIGHT_RATIO = 0.82;
const DEFAULT_HEIGHT = 320;

// ─── WelcomeSplash ────────────────────────────────────────────────────────────
// Gorilla block art — render in <pre>, monospace 11px
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

interface WelcomeSplashProps {
  productLabel: string;
  workspaceLabel: string;
  cdCommand?: string;
  onAction: (n: 1 | 2 | 3 | 4 | 5) => void;
}

const SPLASH_MENU = [
  { n: 1 as const, label: 'Start workspace' },
  { n: 2 as const, label: 'Open agent' },
  { n: 3 as const, label: 'Activate tools' },
  { n: 4 as const, label: 'Switch theme' },
  { n: 5 as const, label: 'Run diagnostics' },
];

function WelcomeSplash({ productLabel, workspaceLabel, cdCommand, onAction }: WelcomeSplashProps) {
  // Keyboard shortcut: press 1–5 to select
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 5) onAction(n as 1 | 2 | 3 | 4 | 5);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onAction]);

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
      {/* Gorilla */}
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

      {/* Brand name */}
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
            paddingLeft: '0.6em', /* optical balance for tracking */
          }}
        >
          MEDIA
        </div>
      </div>

      {/* CD hint */}
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

      {/* Menu */}
      <div style={{ marginTop: '22px', width: '200px' }}>
        {SPLASH_MENU.map(({ n, label }) => (
          <div
            key={n}
            role="button"
            tabIndex={0}
            onClick={() => onAction(n)}
            onKeyDown={(e) => e.key === 'Enter' && onAction(n)}
            style={{
              cursor: 'pointer',
              fontSize: '12px',
              lineHeight: '2.1',
              color: 'var(--text-main)',
              display: 'flex',
              gap: '8px',
            }}
          >
            <span style={{ color: 'var(--solar-yellow)', fontWeight: 700, minWidth: '18px' }}>
              {n}.
            </span>
            <span>{label}</span>
          </div>
        ))}
      </div>

      {/* Prompt */}
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
      iamOrigin,
      workspaceCdCommand,
      agentDashboardUrl: agentDashboardUrlProp,
      showIamWelcomeBar = true,
      workspaceLabel = '',
      workspaceId,
      productLabel = DEFAULT_PRODUCT,
      layout = 'page',
    },
    ref,
  ) => {
    const isDrawer = layout === 'drawer';
    const [resolvedOrigin, setResolvedOrigin] = useState(
      iamOrigin ?? (typeof window !== 'undefined' ? window.location.origin : 'https://inneranimalmedia.com'),
    );
    const [resolvedCdCmd, setResolvedCdCmd] = useState(workspaceCdCommand);
    // Stable ref so callbacks don't close over stale value
    const resolvedCdCmdRef = useRef(resolvedCdCmd);
    useEffect(() => { resolvedCdCmdRef.current = resolvedCdCmd; }, [resolvedCdCmd]);

    const agentDashboardUrl =
      agentDashboardUrlProp ?? `${resolvedOrigin.replace(/\/$/, '')}/dashboard/agent`;

    const terminalRef     = useRef<HTMLDivElement>(null);
    const xtermRef        = useRef<Terminal | null>(null);
    const fitAddonRef     = useRef<FitAddon | null>(null);
    const socketRef       = useRef<WebSocket | null>(null);
    const retryCountRef   = useRef<number>(0);
    /** Browser timers are numeric IDs; avoid NodeJS.Timeout vs number mismatch under @types/node. */
    const retryTimerRef   = useRef<number | null>(null);
    const ptySessionIdRef = useRef<string | null>(null);
    const bufferRef       = useRef<string>('');
    const statusRef       = useRef<TerminalConnectionStatus>('connecting');

    const cachedBootstrapRef = useRef<{
      cfgOk: boolean;
      terminalConfigured: boolean;
      resumeOk: boolean;
      resumeJson: { resumable?: boolean; session_id?: string };
      greeting?: string | null;
      loadedAt: number;
    } | null>(null);

    const [height, setHeight]             = useState(DEFAULT_HEIGHT);
    const [isCollapsed, setIsCollapsed]   = useState(false);
    const [activeTab, setActiveTab]       = useState<ShellTab>('terminal');
    const [status, setStatus]             = useState<TerminalConnectionStatus>('connecting');
    useEffect(() => { statusRef.current = status; }, [status]);
    const [showSplash, setShowSplash]     = useState(true);
    const [restarting, setRestarting]     = useState(false);
    const [tunnelHealth, setTunnelHealth] = useState<{ healthy: boolean; connections: number } | null>(null);
    const [sessionId, setSessionId]       = useState<string | null>(null);
    const [uptime, setUptime]             = useState(0);
    const intentionalCloseRef             = useRef(false);
    const activeConnectRef                = useRef<() => void>(() => {});
    const connectInFlightRef              = useRef(false);
    const bootstrapInFlightRef            = useRef<Promise<void> | null>(null);

    // In global drawer mode, the parent owns the height; keep the shell expanded
    // and disable internal collapse/resize to avoid nested sizing conflicts.
    useEffect(() => {
      if (isDrawer) setIsCollapsed(false);
    }, [isDrawer]);

    const _doBootstrap = useCallback(async () => {
      cachedBootstrapRef.current = null;
      try {
        const [resumePack, cfgPack] = await Promise.all([
          fetch('/api/terminal/session/resume', {
            credentials: 'same-origin', headers: { Accept: 'application/json' },
          }).then(async r => ({ r, j: await r.json().catch(() => ({ resumable: false })) })),
          fetch('/api/agent/terminal/config-status', {
            credentials: 'same-origin', headers: { Accept: 'application/json' },
          }).then(async r => ({ r, j: await r.json().catch(() => ({})) })),
        ]);

        const greeting = await fetch('/api/agent/memory/list', { method: 'GET', credentials: 'same-origin' })
          .then(r => (r.ok ? r.json() : null))
          .then((data: unknown) => {
            const items = Array.isArray(data) ? (data as { key?: string; value?: string }[]) : [];
            return items.find(m => m.key === 'STARTUP_GREETING')?.value ?? null;
          })
          .catch(() => null);

        const cfgJson = cfgPack.j as { terminal_configured?: boolean };
        cachedBootstrapRef.current = {
          cfgOk: cfgPack.r.ok,
          terminalConfigured: cfgPack.r.ok && cfgJson.terminal_configured === true,
          resumeOk: resumePack.r.ok,
          resumeJson: (resumePack.j as { resumable?: boolean; session_id?: string }) ?? { resumable: false },
          greeting,
          loadedAt: Date.now(),
        };
      } catch {
        cachedBootstrapRef.current = {
          cfgOk: false,
          terminalConfigured: false,
          resumeOk: false,
          resumeJson: { resumable: false },
          greeting: null,
          loadedAt: Date.now(),
        };
      }
    }, []);

    const refreshBootstrap = useCallback(async () => {
      if (bootstrapInFlightRef.current) {
        return bootstrapInFlightRef.current;
      }
      const run = _doBootstrap();
      bootstrapInFlightRef.current = run;
      try {
        await run;
      } finally {
        bootstrapInFlightRef.current = null;
      }
    }, [_doBootstrap]);

    // ── Config fetch ──────────────────────────────────────────────────────────
    useEffect(() => {
      void fetch('/api/agentsam/config', { credentials: 'same-origin' })
        .then(r => (r.ok ? r.json() : Promise.reject()))
        .then((data: { workspace_cd_command?: string; iam_origin?: string }) => {
          if (workspaceCdCommand === undefined && data.workspace_cd_command)
            setResolvedCdCmd(data.workspace_cd_command);
          if (iamOrigin === undefined && data.iam_origin)
            setResolvedOrigin(data.iam_origin);
        })
        .catch(() => {});
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Bootstrap (once): config-status + session/resume + memory greeting.
    useEffect(() => {
      void refreshBootstrap();
    }, [refreshBootstrap]);

    // ── Uptime counter ────────────────────────────────────────────────────────
    useEffect(() => {
      if (status !== 'connected') { setUptime(0); return; }
      const t = setInterval(() => setUptime(s => s + 1), 1000);
      return () => clearInterval(t);
    }, [status]);

    const mapHttpErrorToStatus = useCallback((code: number): TerminalConnectionStatus => {
      if (code === 401) return 'session_expired';
      if (code === 403) return 'auth_failed';
      if (code === 503) return 'backend_unavailable';
      return 'disconnected';
    }, []);

    const scheduleReconnect = useCallback((reason: string) => {
      if (intentionalCloseRef.current) return;
      if (statusRef.current === 'offline') return;
      if (!RETRYABLE_STATES.has(statusRef.current)) return;

      const nextAttempt = retryCountRef.current + 1;
      if (nextAttempt > 5) {
        setStatus('offline');
        xtermRef.current?.writeln(
          `\r\n\x1b[1;31m  ✗ ${reason}\x1b[0m\r\n` +
          `\x1b[38;5;240m  Terminal is offline (5 failed attempts). Click Retry to reconnect.\x1b[0m`,
        );
        return;
      }

      retryCountRef.current = nextAttempt;
      const delay = Math.min(2000 * Math.pow(2, nextAttempt - 1), 30_000);
      setStatus('reconnecting');
      xtermRef.current?.writeln(
        `\r\n\x1b[1;31m  ✗ ${reason}\x1b[0m\r\n` +
        `\x1b[38;5;240m  Reconnecting in ${Math.round(delay / 1000)}s (attempt ${nextAttempt})...\x1b[0m`,
      );
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = window.setTimeout(() => {
        if (!intentionalCloseRef.current) activeConnectRef.current();
      }, delay) as unknown as number;
    }, []);

    const fmtUptime = (s: number) => {
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      return h > 0
        ? `${h}h${String(m).padStart(2, '0')}m`
        : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    };

    const appendBuffer = useCallback((text: string) => {
      bufferRef.current = (bufferRef.current + text).slice(-8000);
    }, []);

    // ── Tunnel status ─────────────────────────────────────────────────────────
    const fetchTunnelStatus = useCallback(() => {
      void fetch('/api/tunnel/status', { credentials: 'same-origin' })
        .then(r => r.json())
        .then(j => {
          setTunnelHealth({ healthy: j?.healthy === true, connections: j?.connections ?? 0 });
          const term = xtermRef.current;
          if (!term) return;
          const ok    = j?.healthy === true;
          const conns = j?.connections ?? 0;
          term.writeln(
            `\r\n${ok ? '\x1b[38;5;82m' : '\x1b[38;5;208m'}  ◈ Cloudflare Tunnel\x1b[0m — ${
              ok ? `healthy · ${conns} connection${conns !== 1 ? 's' : ''}` : 'unreachable'
            }\r\n`,
          );
        })
        .catch(() => setTunnelHealth(null));
    }, []);

    // ── Tunnel restart ────────────────────────────────────────────────────────
    const handleTunnelRestart = useCallback(async () => {
      setRestarting(true);
      xtermRef.current?.writeln('\r\n\x1b[38;5;208m  ◌ Requesting tunnel restart…\x1b[0m');
      try {
        const res  = await fetch('/api/tunnel/restart', { method: 'POST', credentials: 'same-origin' });
        const data = await res.json() as { ok?: boolean; error?: string };
        if (data.ok) {
          xtermRef.current?.writeln('\x1b[38;5;82m  ✓ Restart requested — re-checking in 4s…\x1b[0m');
          setTimeout(fetchTunnelStatus, 4000);
        } else {
          xtermRef.current?.writeln(`\x1b[38;5;196m  ✗ ${data.error ?? 'Failed'}\x1b[0m`);
        }
      } catch (e: unknown) {
        xtermRef.current?.writeln(
          `\x1b[38;5;196m  ✗ Network error: ${e instanceof Error ? e.message : String(e)}\x1b[0m`,
        );
      } finally {
        setRestarting(false);
      }
    }, [fetchTunnelStatus]);

    // ── Splash action handler ─────────────────────────────────────────────────
    const handleSplashAction = useCallback((n: 1 | 2 | 3 | 4 | 5) => {
      setShowSplash(false);
      setIsCollapsed(false);
      setActiveTab('terminal');

      switch (n) {
        case 1: {
          const cmd = resolvedCdCmdRef.current;
          if (socketRef.current?.readyState === WebSocket.OPEN && cmd) {
            socketRef.current.send(`${cmd}\r`);
          }
          break;
        }
        case 2:
          window.open(agentDashboardUrl, '_blank', 'noopener,noreferrer');
          break;
        case 3: {
          const t = xtermRef.current;
          if (!t) break;
          t.writeln('');
          t.writeln('\x1b[38;5;51m  ══ MCP & Terminal Stack ═══════════════════════════════\x1b[0m');
          t.writeln('\x1b[38;5;240m  MCP Server : https://mcp.inneranimalmedia.com/mcp\x1b[0m');
          t.writeln('\x1b[38;5;240m  PTY Repo   : github.com/SamPrimeaux/iam-pty\x1b[0m');
          t.writeln('\x1b[38;5;240m  PTY Local  : pm2 restart iam-pty  (port 3099)\x1b[0m');
          t.writeln('\x1b[38;5;240m  Tunnel     : terminal.inneranimalmedia.com → cloudflared → :3099\x1b[0m');
          t.writeln('\x1b[38;5;51m  ════════════════════════════════════════════════════════\x1b[0m');
          t.writeln('');
          break;
        }
        case 4:
          xtermRef.current?.writeln(
            '\x1b[38;5;240m  Theme: Settings → theme controls (CSS vars update this terminal).\x1b[0m',
          );
          break;
        case 5: {
          const ws = socketRef.current;
          if (!ws || ws.readyState !== WebSocket.OPEN) {
            xtermRef.current?.writeln('\r\n\x1b[1;31m  Terminal offline — cannot run diagnostics.\x1b[0m\r\n');
            break;
          }
          const cmds = [
            `echo "═══ ${productLabel} diagnostics ═══"`,
            'node --version 2>/dev/null || echo "node: not found"',
            'npm --version 2>/dev/null || echo "npm: not found"',
            'npx wrangler --version 2>/dev/null || echo "wrangler: not found"',
            'pm2 status 2>/dev/null || echo "pm2: not found"',
            'echo "═══════════════════════════════════"',
          ];
          cmds.forEach((c, i) => window.setTimeout(() => ws.send(`${c}\r`), i * 240));
          break;
        }
      }
    }, [agentDashboardUrl, productLabel]);

    // ── WebSocket connect ─────────────────────────────────────────────────────
    // Deps intentionally exclude workspaceLabel/productLabel — those only belong
    // to the React splash now, not the xterm ANSI layer.
    useEffect(() => {
      let isMounted = true;

      const connect = () => {
        if (connectInFlightRef.current || !isMounted || intentionalCloseRef.current) return;
        if (statusRef.current === 'offline') return;
        connectInFlightRef.current = true;
        setStatus(retryCountRef.current > 0 ? 'reconnecting' : 'connecting');
        void (async () => {
          try {
            ptySessionIdRef.current = null;
            setSessionId(null);

            if (!cachedBootstrapRef.current) {
              await refreshBootstrap();
            }
            if (!isMounted || intentionalCloseRef.current) return;

            const boot = cachedBootstrapRef.current;
            if (!boot || boot.cfgOk !== true) {
              setStatus('disconnected');
              scheduleReconnect('config-status failed');
              return;
            }
            if (boot.terminalConfigured !== true) {
              setStatus('backend_unavailable');
              scheduleReconnect('Terminal backend unavailable');
              return;
            }

            const resumeJson = boot.resumeJson ?? { resumable: false };

            // Anchor path to window.location.origin so the route is always /api/agent/terminal/ws
            // (never a bare /terminal/ws or path-relative mistake under /dashboard/...).
            const wsHttpUrl = new URL('/api/agent/terminal/ws', window.location.origin);
            if (workspaceId) wsHttpUrl.searchParams.set('workspace_id', workspaceId);
            wsHttpUrl.searchParams.set('execution_mode', 'pty');
            const wsUrl = wsHttpUrl.href.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');

            const ws = new WebSocket(wsUrl);
            socketRef.current = ws;
            if (retryTimerRef.current) {
              clearTimeout(retryTimerRef.current);
              retryTimerRef.current = null;
            }

            const disposeListeners: Array<() => void> = [];
            let closeHandled = false;
            const handleSocketDrop = (reason: string) => {
              if (closeHandled) return;
              closeHandled = true;
              disposeListeners.forEach(fn => fn());
              if (!isMounted || intentionalCloseRef.current) return;
              setSessionId(null);
              ptySessionIdRef.current = null;
              scheduleReconnect(reason);
            };

            ws.onopen = () => {
              retryCountRef.current = 0;
              setStatus('connected');
              if (!isMounted || intentionalCloseRef.current) return;

              const term = xtermRef.current;
              if (!term) return;
              term.clear();

              const onDataSub = term.onData(data => {
                if (ws.readyState !== WebSocket.OPEN) return;
                if ((data.endsWith('\r') || data.endsWith('\n'))) {
                  const cmd = data.replace(/[\r\n]+$/, '').trim();
                  if (cmd.startsWith('/')) {
                    ws.send(JSON.stringify({ type: 'input', data }));
                    return;
                  }
                }
                ws.send(data);
              });
              const onResizeSub = term.onResize(({ cols, rows }) => {
                if (ws.readyState === WebSocket.OPEN)
                  ws.send(JSON.stringify({ type: 'resize', cols, rows }));
              });
              disposeListeners.push(() => { onDataSub.dispose(); onResizeSub.dispose(); });

              term.writeln('  \x1b[38;5;82m◈\x1b[0m Worker control-plane: \x1b[38;5;82mACTIVE\x1b[0m');
              term.writeln('  \x1b[38;5;240m◈ Backend mode: pty\x1b[0m');

              if (resumeJson.resumable === true) {
                const sid = resumeJson.session_id ?? '';
                term.writeln(`  \x1b[38;5;240m◈ Resume: session ${sid.slice(0, 8)}…\x1b[0m`);
              }

              const greeting = cachedBootstrapRef.current?.greeting ?? null;
              if (greeting && xtermRef.current) {
                xtermRef.current.writeln(`\r\n\x1b[1;36m  › ${greeting}\x1b[0m`);
              }
            };

            ws.onmessage = (event) => {
              try {
                const msg = JSON.parse(event.data as string) as {
                  type?: string; session_id?: string; data?: string; status?: string; error?: string;
                };
                if (msg.type === 'session_id') {
                  const sid = msg.session_id?.trim() ?? '';
                  if (sid) { ptySessionIdRef.current = sid; setSessionId(sid); }
                  return;
                }
                if (msg.type === 'state') {
                  if (msg.status === 'auth_failed') setStatus('auth_failed');
                  else if (msg.status === 'session_expired') setStatus('session_expired');
                  else if (msg.status === 'backend_unavailable') setStatus('backend_unavailable');
                  if (msg.error) xtermRef.current?.writeln(`\r\n\x1b[1;31m  ${msg.error}\x1b[0m`);
                  return;
                }
                if (msg.type === 'output') {
                  const text = msg.data ?? '';
                  appendBuffer(text);
                  xtermRef.current?.write(text);
                  return;
                }
              } catch (_) {}
              appendBuffer(event.data as string);
              xtermRef.current?.write(event.data as string);
            };

            ws.onerror = () => {
              if (!isMounted || intentionalCloseRef.current) return;
              setStatus('disconnected');
              handleSocketDrop('Connection error');
            };

            ws.onclose = (evt) => {
              if (!isMounted || intentionalCloseRef.current) return;
              if (evt.code === 4401) { setStatus('session_expired'); return; }
              if (evt.code === 4403) { setStatus('auth_failed'); return; }
              if (evt.code === 4503) { setStatus('backend_unavailable'); return; }
              setStatus('disconnected');
              handleSocketDrop(`Connection closed (${evt.code || 'no-code'})`);
            };
          } catch (e: unknown) {
            if (!isMounted || intentionalCloseRef.current) return;
            setStatus('disconnected');
            scheduleReconnect(
              `Connection bootstrap failed: ${e instanceof Error ? e.message : String(e)}`,
            );
          } finally {
            connectInFlightRef.current = false;
          }
        })();
      };

      activeConnectRef.current = connect;

      if (!isCollapsed && activeTab === 'terminal' && (!socketRef.current || socketRef.current.readyState > 1)) {
        intentionalCloseRef.current = false;
        connect();
      }

      return () => {
        isMounted = false;
        intentionalCloseRef.current = true;
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        socketRef.current?.close();
        socketRef.current = null;
      };
    }, [isCollapsed, activeTab, workspaceId, fetchTunnelStatus, appendBuffer, mapHttpErrorToStatus, scheduleReconnect]);

    // ── Theme reactivity ──────────────────────────────────────────────────────
    useEffect(() => {
      const observer = new MutationObserver(() => {
        const term = xtermRef.current;
        if (!term) return;
        const s   = getComputedStyle(document.documentElement);
        const bg  = s.getPropertyValue('--terminal-surface').trim() || '#060e14';
        const fg  = s.getPropertyValue('--text-main').trim()        || '#839496';
        const cur = s.getPropertyValue('--solar-cyan').trim()       || '#2dd4bf';
        const sel = s.getPropertyValue('--bg-panel').trim()         || '#0a2d38';
        term.options.theme = { ...term.options.theme, background: bg, foreground: fg, cursor: cur,
          selectionBackground: 'rgba(45, 212, 191, 0.30)', selectionForeground: fg };
      });
      observer.observe(document.documentElement, {
        attributes: true, attributeFilter: ['data-theme', 'class', 'style'],
      });
      return () => observer.disconnect();
    }, []);

    // ── Expose handle ─────────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      writeToTerminal: (text: string) => {
        setIsCollapsed(false);
        setActiveTab('terminal');
        xtermRef.current?.writeln(`\r\n\x1b[2m${text}\x1b[0m`);
      },
      runCommand: (cmd: string) => {
        setIsCollapsed(false);
        setActiveTab('terminal');
        if (socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(cmd + '\r');
          return;
        }
        const sid = ptySessionIdRef.current;
        xtermRef.current?.writeln('\r\n\x1b[33m  WS offline — POST /api/agent/terminal/run…\x1b[0m');
        void fetch('/api/agent/terminal/run', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ command: cmd, session_id: sid }),
        })
          .then(async r => {
            const j = await r.json().catch(() => ({})) as {
              error?: string; output?: string; command?: string; execution_id?: string;
            };
            const term = xtermRef.current;
            if (!term) return;
            if (!r.ok) {
              term.writeln(`\r\n\x1b[1;31m  terminal/run ${r.status}: ${j.error ?? 'error'}\x1b[0m`);
              return;
            }
            term.writeln(`\r\n\x1b[36m  $ ${j.command ?? cmd}\x1b[0m`);
            const out = j.output ?? '';
            appendBuffer(out);
            term.writeln(out.trim() !== '' ? out : '  (no output)');
            if (j.execution_id) {
              void fetch('/api/agent/terminal/complete', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  execution_id: j.execution_id, status: 'completed', output_text: out, exit_code: 0,
                }),
              }).catch(() => {});
            }
          })
          .catch(() => xtermRef.current?.writeln('\r\n\x1b[1;31m  terminal/run: network error\x1b[0m'));
      },
      setActiveTab: (t: ShellTab) => {
        setActiveTab(t);
        setIsCollapsed(false);
      },
    }));

    // ── Terminal init ─────────────────────────────────────────────────────────
    useEffect(() => {
      if (!terminalRef.current || isCollapsed || activeTab !== 'terminal') return;

      const s   = getComputedStyle(document.documentElement);
      const bg  = s.getPropertyValue('--terminal-surface').trim() || '#060e14';
      const fg  = s.getPropertyValue('--text-main').trim()        || '#839496';
      const cur = s.getPropertyValue('--solar-cyan').trim()       || '#2dd4bf';
      // selectionBackground handled at init with a fixed rgba — skip here

      const term = new Terminal({
        theme: {
          background: bg, foreground: fg, cursor: cur,
          selectionBackground: 'rgba(45, 212, 191, 0.30)', selectionForeground: fg,
          black: '#002b36',   brightBlack: '#657b83',
          red: '#dc322f',     brightRed: '#cb4b16',
          green: '#859900',   brightGreen: '#586e75',
          yellow: '#b58900',  brightYellow: '#657b83',
          blue: '#268bd2',    brightBlue: '#839496',
          magenta: '#d33682', brightMagenta: '#6c71c4',
          cyan: '#2aa198',    brightCyan: '#93a1a1',
          white: '#eee8d5',   brightWhite: '#fdf6e3',
        },
        fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", Menlo, Monaco, "Courier New", monospace',
        fontSize: 12, lineHeight: 1.45, cursorBlink: true, cursorStyle: 'block',
        allowTransparency: true, scrollback: 5000,
      });

      term.open(terminalRef.current);
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      fitAddon.fit();

      xtermRef.current    = term;
      fitAddonRef.current = fitAddon;

      const onResize = () => requestAnimationFrame(() => fitAddonRef.current?.fit());
      window.addEventListener('resize', onResize);
      const ro = new ResizeObserver(() => requestAnimationFrame(() => fitAddonRef.current?.fit()));
      ro.observe(terminalRef.current);

      return () => {
        window.removeEventListener('resize', onResize);
        ro.disconnect();
        term.dispose();
        xtermRef.current    = null;
        fitAddonRef.current = null;
      };
    }, [isCollapsed, activeTab]);

    // ── Drag resize ───────────────────────────────────────────────────────────
    const handleDragStart = (e: React.MouseEvent) => {
      e.preventDefault();
      const startY = e.clientY, startH = height;
      const maxH   = window.innerHeight * MAX_HEIGHT_RATIO;
      const onMove = (me: MouseEvent) => {
        const next = Math.max(MIN_HEIGHT, Math.min(startH + (startY - me.clientY), maxH));
        setHeight(next);
        requestAnimationFrame(() => fitAddonRef.current?.fit());
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };

    // ── Derived ───────────────────────────────────────────────────────────────
    const errorCount   = problems.filter(p => p.severity === 'error').length;
    const warningCount = problems.filter(p => p.severity === 'warning').length;

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
          .xterm-shell-viewport .xterm-viewport { overflow-y: hidden !important; }
          @keyframes iam-pulse-cyan {
            0%, 100% { box-shadow: 0 0 4px var(--solar-cyan); }
            50%       { box-shadow: 0 0 12px var(--solar-cyan); }
          }
          .iam-online-dot { animation: iam-pulse-cyan 2s ease-in-out infinite; }
        `}</style>

        <div
          className="iam-scanlines relative flex flex-col border-t shadow-[0_-4px_20px_rgba(0,0,0,0.3)] shrink-0"
          style={{
            height: isDrawer ? '100%' : (isCollapsed ? '36px' : `${height}px`),
            background: 'var(--terminal-chrome)',
            borderColor: 'var(--solar-cyan, #2aa198)',
            borderTopWidth: '1px',
            transition: isDrawer ? 'none' : 'height 0.2s ease-out',
            zIndex: 40,
            ...(isDrawer ? { flex: '1 1 0%', minHeight: 0 } : null),
          }}
        >
          {/* Resize handle */}
          {!isDrawer && !isCollapsed && (
            <div
              className="h-1 w-full shrink-0 cursor-ns-resize group flex items-center justify-center"
              onMouseDown={handleDragStart}
            >
              <div className="h-px w-16 rounded-full bg-[var(--border-subtle)] group-hover:bg-[var(--solar-cyan)] group-hover:w-24 transition-all duration-200" />
            </div>
          )}

          {/* ── Toolbar ── */}
          <div
            className="h-9 min-h-9 shrink-0 flex items-center justify-between px-2 pl-3 border-b border-[var(--border-subtle)] select-none"
            style={{ background: 'var(--terminal-chrome)' }}
          >
            {/* Left: tabs + status */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex items-stretch gap-0">
                {(['terminal', 'output', 'problems'] as ShellTab[]).map(tab => {
                  const badge =
                    tab === 'problems' && errorCount + warningCount > 0
                      ? errorCount > 0 ? errorCount : warningCount
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

              {/* WS status */}
              <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                {(status === 'connecting' || status === 'reconnecting') && (
                  <span className="text-[10px] font-mono text-[var(--solar-yellow)] flex items-center gap-1.5">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--solar-yellow)] opacity-40" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--solar-yellow)]" />
                    </span>
                    {statusMessage(status)}
                  </span>
                )}
                {status === 'connected' && (
                  <span className="text-[10px] font-mono text-[var(--solar-green)] flex items-center gap-1.5">
                    <span className="iam-online-dot h-2 w-2 rounded-full bg-[var(--solar-green)] inline-block" />
                    {statusMessage(status)} · {fmtUptime(uptime)}
                    {sessionId && (
                      <span className="text-[var(--text-muted)]/40"> · {sessionId.slice(0, 6)}…</span>
                    )}
                  </span>
                )}
                {status !== 'connected' && status !== 'connecting' && status !== 'reconnecting' && (
                  <span className="text-[10px] font-mono text-[var(--solar-red)] flex items-center gap-1.5">
                    <WifiOff size={10} />
                    {statusMessage(status)}
                  </span>
                )}
              </div>

              {/* Manual retry / refresh */}
              {(status === 'offline' || status === 'disconnected' || status === 'backend_unavailable') && (
                <button
                  type="button"
                  onClick={() => {
                    intentionalCloseRef.current = false;
                    retryCountRef.current = 0;
                    void refreshBootstrap().finally(() => {
                      setStatus('connecting');
                      activeConnectRef.current();
                    });
                  }}
                  className="hidden sm:inline-flex items-center gap-1.5 ml-2 px-2 py-1 rounded border border-[var(--border-subtle)] text-[10px] font-mono text-[var(--text-muted)] hover:text-[var(--solar-cyan)] hover:border-[var(--solar-cyan)]/30 hover:bg-[var(--bg-hover)] transition-colors"
                  title="Retry terminal connection"
                >
                  <RefreshCw size={11} />
                  Retry
                </button>
              )}

              {/* Tunnel health */}
              {tunnelHealth && (
                <>
                  <div className="hidden sm:flex items-center h-5 w-px bg-[var(--border-subtle)] shrink-0" />
                  <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                    {tunnelHealth.healthy
                      ? <Wifi size={9} className="text-[var(--solar-green)]" />
                      : <WifiOff size={9} className="text-[var(--solar-red)]" />}
                    <span className={`text-[9px] font-mono ${tunnelHealth.healthy ? 'text-[var(--solar-green)]' : 'text-[var(--solar-red)]'}`}>
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

            {/* Right controls */}
            <div className="flex items-center gap-0.5 shrink-0">
              {/* Splash toggle — re-opens the welcome screen */}
              {activeTab === 'terminal' && (
                <button
                  type="button"
                  onClick={() => setShowSplash(v => !v)}
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

          {/* ── Content area ── */}
          {!isCollapsed && (
            <div className="flex-1 min-h-0 flex overflow-hidden relative">
              <div className="flex flex-col flex-1 min-h-0 min-w-0">

                {/* Terminal tab */}
                {activeTab === 'terminal' && (
                  <div className="relative flex-1 min-h-0">
                    {/* xterm mounts here — always present when tab is active */}
                    <div
                      ref={terminalRef}
                      className="xterm-shell-viewport absolute inset-0 bg-[var(--terminal-surface)]"
                    />
                    {/* Splash overlays xterm until dismissed */}
                    {showSplash && (
                      <WelcomeSplash
                        productLabel={productLabel}
                        workspaceLabel={workspaceLabel}
                        cdCommand={resolvedCdCmd}
                        onAction={handleSplashAction}
                      />
                    )}
                  </div>
                )}

                {/* Output tab */}
                {activeTab === 'output' && (
                  <div className="h-full overflow-y-auto custom-scrollbar px-4 py-3 font-mono text-[11px] leading-relaxed text-[var(--text-main)] bg-[var(--terminal-surface)]">
                    {outputLines.length === 0
                      ? <p className="text-[var(--text-muted)]/40 text-xs italic mt-4">No output yet.</p>
                      : outputLines.map((line, i) => (
                          <div key={i} className="mb-1 border-l-2 border-transparent pl-2 hover:border-[var(--solar-cyan)]/30">
                            {line}
                          </div>
                        ))
                    }
                  </div>
                )}

                {/* Problems tab */}
                {activeTab === 'problems' && (
                  <div className="h-full overflow-y-auto custom-scrollbar p-4 space-y-2 bg-[var(--terminal-surface)]">
                    {problems.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)] opacity-40 gap-2">
                        <CircleCheck size={28} />
                        <p className="text-xs font-mono">No problems detected</p>
                      </div>
                    ) : (
                      problems.map((p, i) => (
                        <div
                          key={i}
                          className={`flex items-start gap-2 p-2 rounded bg-[var(--bg-panel)] border-l-2 ${
                            p.severity === 'error' ? 'border-[var(--solar-red)]' : 'border-[var(--solar-yellow)]'
                          }`}
                        >
                          <TriangleAlert
                            size={13}
                            className={p.severity === 'error' ? 'text-[var(--solar-red)]' : 'text-[var(--solar-yellow)]'}
                          />
                          <div className="min-w-0">
                            <div className="text-[11px] font-medium text-[var(--text-main)] font-mono">{p.msg}</div>
                            <div className="text-[10px] text-[var(--text-muted)] font-mono">{p.file}:{p.line}</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

              </div>
            </div>
          )}
        </div>
      </>
    );
  },
);

XTermShell.displayName = 'XTermShell';
