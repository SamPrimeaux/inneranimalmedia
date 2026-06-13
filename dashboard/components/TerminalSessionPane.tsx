/**
 * Single PTY session (WebSocket + xterm) — used by XTermShell for primary + optional split pane.
 * Each pane uses a distinct `pty_slot` → separate AgentChat DO → independent iam-pty process.
 */
import React, {
  useEffect, useRef, useState, useImperativeHandle,
  forwardRef, useCallback,
} from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { PHONE_MQ } from '../lib/breakpoints';

export type TerminalConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'offline'
  | 'auth_failed'
  | 'backend_unavailable'
  | 'session_expired'
  | 'disconnected'
  | 'timed_out';

const INACTIVITY_MS = 5 * 60 * 1000;

function isNarrowViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(PHONE_MQ).matches;
}

function focusXtermSurface(term: Terminal, host: HTMLElement | null) {
  term.focus();
  const textarea = host?.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement | null;
  if (textarea) {
    textarea.setAttribute('inputmode', 'text');
    textarea.setAttribute('autocomplete', 'off');
    textarea.setAttribute('autocorrect', 'off');
    textarea.setAttribute('autocapitalize', 'off');
    textarea.setAttribute('spellcheck', 'false');
    textarea.focus({ preventScroll: true });
  }
}

/** Fit cols from viewport width so welcome/PTY geometry matches phone (iOS). */
function fitTerminalDimensions(
  term: Terminal,
  fitAddon: FitAddon,
  host: HTMLElement | null,
): void {
  if (!host) {
    fitAddon.fit();
    return;
  }
  if (!isNarrowViewport()) {
    fitAddon.fit();
    return;
  }
  const rect = host.getBoundingClientRect();
  const fontSize = term.options.fontSize ?? 12;
  const lineHeight = term.options.lineHeight ?? 1.45;
  const cellW = Math.max(5.5, fontSize * 0.58);
  const cellH = Math.max(10, fontSize * lineHeight);
  const widthPx = rect.width > 0 ? rect.width : window.innerWidth;
  const heightPx = rect.height > 0 ? rect.height : 200;
  const cols = Math.max(24, Math.floor(widthPx / cellW));
  const rows = Math.max(8, Math.floor(heightPx / cellH));
  if (term.cols !== cols || term.rows !== rows) {
    term.resize(cols, rows);
  }
}

function shellQuoteForHistory(cmd: string): string {
  return `'${cmd.replace(/'/g, `'\\''`)}'`;
}

function detectShellKind(shellPath: string): 'zsh' | 'bash' | 'powershell' | 'sh' {
  const s = shellPath.toLowerCase();
  if (s.includes('powershell') || s.includes('pwsh')) return 'powershell';
  if (s.includes('zsh')) return 'zsh';
  if (s.includes('bash')) return 'bash';
  return 'sh';
}

function isShellHistorySeedLine(line: string): boolean {
  const t = line.replace(/[\r\n]+$/, '').trim();
  if (!t) return true;
  if (/^print\s+-s\b/i.test(t)) return true;
  if (/^history\s+-s\b/i.test(t)) return true;
  if (/^Add-History\b/i.test(t)) return true;
  if (/\x1b\[[0-9;]*200~|\x1b\[[0-9;]*201~|\[200~|\[201~/.test(t)) return true;
  if (t.length > 2000) return true;
  if (/print\s+-s/i.test(t)) return true;
  if ((t.match(/\\'/g) || []).length > 6) return true;
  return false;
}

function buildHistorySeedLine(cmd: string, shellPath: string): string {
  const kind = detectShellKind(shellPath);
  if (kind === 'powershell') {
    return `Add-History -InputLine ${JSON.stringify(cmd)}\r`;
  }
  if (kind === 'zsh') {
    return `print -s -- ${shellQuoteForHistory(cmd)}\r`;
  }
  return `history -s ${shellQuoteForHistory(cmd)}\r`;
}

type AgentModelRow = {
  model_key?: string;
  name?: string;
  provider?: string;
  size_class?: string;
};

/** Active picker models (agentsam_ai + agentsam_model_catalog is_active on server). */
export async function formatAgentsamModelsToTerminal(
  write: (text: string) => void,
): Promise<void> {
  write('\r\n\x1b[38;5;51m  ══ Agent Sam — available models ═══════════════════════\x1b[0m\r\n');
  try {
    const res = await fetch('/api/agent/models', { credentials: 'same-origin' });
    const data = await res.json().catch(() => null);
    if (!res.ok || !Array.isArray(data)) {
      write('\x1b[38;5;196m  ✗ Could not load model catalog\x1b[0m\r\n');
      return;
    }
    const rows = (data as AgentModelRow[]).filter((m) => m?.model_key);
    if (!rows.length) {
      write('\x1b[38;5;240m  (no active models in agentsam_model_catalog)\x1b[0m\r\n');
      return;
    }
    for (const m of rows) {
      const key = String(m.model_key);
      const label = m.name ? String(m.name) : key;
      const provider = m.provider ? String(m.provider) : '—';
      const tier = m.size_class ? ` · ${String(m.size_class)}` : '';
      write(`\x1b[38;5;250m  ${key.padEnd(28)}\x1b[0m \x1b[38;5;240m${provider}${tier}\x1b[0m  \x1b[38;5;82m${label}\x1b[0m\r\n`);
    }
    write('\x1b[38;5;51m  ══════════════════════════════════════════════════════\x1b[0m\r\n');
  } catch (e: unknown) {
    write(
      `\x1b[38;5;196m  ✗ ${e instanceof Error ? e.message : 'Model catalog fetch failed'}\x1b[0m\r\n`,
    );
  }
}

function isAgentsamModelsSlashLine(line: string): boolean {
  const t = line.trim();
  return t === '/agentsam' || /^\/agentsam\s*$/i.test(t);
}

async function fetchTerminalHistoryCommands(): Promise<string[]> {
  try {
    const res = await fetch('/api/terminal/history', { credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !Array.isArray(data.commands)) return [];
    return data.commands.map((c: unknown) => String(c || '').trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function seedShellHistoryViaPty(ws: WebSocket, commands: string[], shellPath: string) {
  if (!commands.length || ws.readyState !== WebSocket.OPEN) return;
  const safe = commands.map((c) => String(c || '').trim()).filter((c) => c && !isShellHistorySeedLine(c));
  if (!safe.length) return;
  for (const cmd of safe) {
    if (ws.readyState !== WebSocket.OPEN) break;
    ws.send(buildHistorySeedLine(cmd, shellPath));
  }
}

const RETRYABLE_STATES: ReadonlySet<TerminalConnectionStatus> = new Set([
  'connecting',
  'reconnecting',
  'backend_unavailable',
  'disconnected',
]);

/** Close without triggering reconnect (superseded connect or unmount). */
function closeSocketQuietly(ws: WebSocket | null) {
  if (!ws) return;
  ws.onopen = null;
  ws.onmessage = null;
  ws.onerror = null;
  ws.onclose = null;
  if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN) {
    ws.close(1000, 'superseded');
  }
}

export interface TerminalSessionPaneHandle {
  writeToTerminal: (text: string) => void;
  writeAnsi: (text: string) => void;
  runCommand: (cmd: string) => void;
  reconnectClean: () => void;
  /** Stop PTY without reconnecting (e.g. return to welcome splash). */
  disconnectQuiet: () => void;
  getSessionId: () => string | null;
}

export interface TerminalSessionPaneProps {
  workspaceId?: string;
  /** platform_vm (cloud) or user_hosted_tunnel (local machine). */
  targetType?: 'platform_vm' | 'user_hosted_tunnel' | 'sandbox';
  /** Secondary pane id → Worker routes to distinct DO (split terminals). */
  ptySlot?: string;
  /** Full path, e.g. /bin/zsh — forwarded to PTY */
  shell?: string;
  visible: boolean;
  /** When false, xterm mounts but WebSocket PTY does not connect (welcome splash). */
  connectEnabled?: boolean;
  onConnectionChange?: (s: TerminalConnectionStatus) => void;
  onSessionIdChange?: (id: string | null) => void;
  /** PTY stdout lines (ANSI stripped) — dev-server port detection, output tab, etc. */
  onTerminalOutputLine?: (line: string) => void;
  /** Config/backend hard failure — parent may re-show welcome splash. */
  onHardFailure?: () => void;
}

function emitTerminalOutputLines(text: string, onLine?: (line: string) => void) {
  if (!onLine || !text) return;
  const stripped = text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  for (const line of stripped.split(/\r?\n/)) {
    const t = line.trim();
    if (t) onLine(t);
  }
}

export const TerminalSessionPane = forwardRef<TerminalSessionPaneHandle, TerminalSessionPaneProps>(
  (
    {
      workspaceId,
      targetType = 'platform_vm',
      ptySlot = '',
      shell = '',
      visible,
      connectEnabled = true,
      onConnectionChange,
      onSessionIdChange,
      onTerminalOutputLine,
      onHardFailure,
    },
    ref,
  ) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const socketRef = useRef<WebSocket | null>(null);
    const retryCountRef = useRef<number>(0);
    const retryTimerRef = useRef<number | null>(null);
    const ptySessionIdRef = useRef<string | null>(null);
    const bufferRef = useRef<string>('');
    const statusRef = useRef<TerminalConnectionStatus>('connecting');
    const historySeededRef = useRef(false);

    const cachedBootstrapRef = useRef<{
      cfgOk: boolean;
      terminalConfigured: boolean;
      resumeOk: boolean;
      resumeJson: { resumable?: boolean; session_id?: string };
      greeting?: string | null;
      loadedAt: number;
    } | null>(null);

    const [status, setStatus] = useState<TerminalConnectionStatus>('connecting');
    const [sessionIdState, setSessionIdState] = useState<string | null>(null);
    useEffect(() => {
      statusRef.current = status;
      onConnectionChange?.(status);
    }, [status, onConnectionChange]);
    useEffect(() => {
      onSessionIdChange?.(sessionIdState);
    }, [sessionIdState, onSessionIdChange]);

    const intentionalCloseRef = useRef(false);
    const activeConnectRef = useRef<() => void>(() => {});
    const connectInFlightRef = useRef(false);
    const connectSeqRef = useRef(0);
    const connectDebounceRef = useRef<number | null>(null);
    const bootstrapInFlightRef = useRef<Promise<void> | null>(null);
    const refreshBootstrapRef = useRef<() => Promise<void>>(async () => {});
    const scheduleReconnectRef = useRef<(reason: string) => void>(() => {});
    const appendBufferRef = useRef<(text: string) => void>(() => {});
    const inactivityTimerRef = useRef<number | null>(null);
    const lastActivityRef = useRef<number>(Date.now());

    const clearInactivityTimer = useCallback(() => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
    }, []);

    const closeDueToInactivity = useCallback(async () => {
      intentionalCloseRef.current = true;
      clearInactivityTimer();
      const sid = ptySessionIdRef.current;
      if (sid) {
        void fetch('/api/terminal/session/close', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ session_id: sid }),
        }).catch(() => {});
      }
      closeSocketQuietly(socketRef.current);
      socketRef.current = null;
      ptySessionIdRef.current = null;
      setSessionIdState(null);
      setStatus('timed_out');
    }, [clearInactivityTimer]);

    const bumpActivity = useCallback(() => {
      lastActivityRef.current = Date.now();
      if (statusRef.current !== 'connected') return;
      clearInactivityTimer();
      inactivityTimerRef.current = window.setTimeout(() => {
        void closeDueToInactivity();
      }, INACTIVITY_MS) as unknown as number;
    }, [clearInactivityTimer, closeDueToInactivity]);

    const _doBootstrap = useCallback(async () => {
      cachedBootstrapRef.current = null;
      const wsId = workspaceId?.trim() ?? '';
      try {
        const cfgUrl = new URL('/api/agent/terminal/config-status', window.location.origin);
        if (wsId) cfgUrl.searchParams.set('workspace_id', wsId);
        cfgUrl.searchParams.set('target_type', targetType);

        const [resumePack, cfgPack] = await Promise.all([
          fetch('/api/terminal/session/resume', {
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
          }).then(async (r) => ({ r, j: await r.json().catch(() => ({ resumable: false })) })),
          fetch(cfgUrl.toString(), {
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
          }).then(async (r) => ({ r, j: await r.json().catch(() => ({})) })),
        ]);

        const greeting = await fetch('/api/agent/memory/list', { method: 'GET', credentials: 'same-origin' })
          .then((r) => (r.ok ? r.json() : null))
          .then((data: unknown) => {
            const items = Array.isArray(data) ? (data as { key?: string; value?: string }[]) : [];
            return items.find((m) => m.key === 'STARTUP_GREETING')?.value ?? null;
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
    }, [targetType, workspaceId]);

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

    useEffect(() => {
      void refreshBootstrap();
    }, [refreshBootstrap]);

    const scheduleReconnect = useCallback((reason: string) => {
      if (intentionalCloseRef.current) return;
      if (statusRef.current === 'offline') return;
      if (!RETRYABLE_STATES.has(statusRef.current)) return;

      const nextAttempt = retryCountRef.current + 1;
      if (nextAttempt > 5) {
        setStatus('offline');
        xtermRef.current?.writeln(
          `\r\n\x1b[1;31m  ✗ ${reason}\x1b[0m\r\n` +
            `\x1b[38;5;240m  Terminal is offline (5 failed attempts). Returning to welcome screen…\x1b[0m`,
        );
        onHardFailure?.();
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
    }, [onHardFailure]);

    const appendBuffer = useCallback((text: string) => {
      bufferRef.current = (bufferRef.current + text).slice(-8000);
    }, []);

    useEffect(() => {
      refreshBootstrapRef.current = refreshBootstrap;
      scheduleReconnectRef.current = scheduleReconnect;
      appendBufferRef.current = appendBuffer;
    }, [refreshBootstrap, scheduleReconnect, appendBuffer]);

    useEffect(() => {
      let isMounted = true;

      const connect = () => {
        if (connectInFlightRef.current || !isMounted || intentionalCloseRef.current) return;
        if (statusRef.current === 'offline' || statusRef.current === 'timed_out') return;
        const wsId = workspaceId?.trim() ?? '';
        if (!wsId) return;

        connectInFlightRef.current = true;
        const seq = ++connectSeqRef.current;
        setStatus(retryCountRef.current > 0 ? 'reconnecting' : 'connecting');
        void (async () => {
          try {
            ptySessionIdRef.current = null;

            if (!cachedBootstrapRef.current) {
              await refreshBootstrapRef.current();
            }
            if (!isMounted || intentionalCloseRef.current || seq !== connectSeqRef.current) return;

            const boot = cachedBootstrapRef.current;
            if (!boot || boot.cfgOk !== true) {
              setStatus('disconnected');
              scheduleReconnectRef.current('config-status failed');
              return;
            }
            if (boot.terminalConfigured !== true) {
              setStatus('backend_unavailable');
              xtermRef.current?.writeln(
                `\r\n\x1b[1;31m  ✗ Terminal backend unavailable\x1b[0m\r\n` +
                  `\x1b[38;5;240m  Check terminal connection in Settings or pick another lane on the welcome screen.\x1b[0m`,
              );
              onHardFailure?.();
              return;
            }

            const resumeJson = boot.resumeJson ?? { resumable: false };

            closeSocketQuietly(socketRef.current);
            if (!isMounted || intentionalCloseRef.current || seq !== connectSeqRef.current) return;

            const wsHttpUrl = new URL('/api/agent/terminal/ws', window.location.origin);
            wsHttpUrl.searchParams.set('workspace_id', wsId);
            wsHttpUrl.searchParams.set('execution_mode', 'pty');
            wsHttpUrl.searchParams.set('target_type', targetType);
            if (ptySlot) wsHttpUrl.searchParams.set('pty_slot', ptySlot);
            if (shell?.trim()) wsHttpUrl.searchParams.set('shell', shell.trim());
            const wsUrl = wsHttpUrl.href.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');

            const ws = new WebSocket(wsUrl);
            if (seq !== connectSeqRef.current) {
              closeSocketQuietly(ws);
              return;
            }
            socketRef.current = ws;
            if (retryTimerRef.current) {
              clearTimeout(retryTimerRef.current);
              retryTimerRef.current = null;
            }

            const disposeListeners: Array<() => void> = [];
            let closeHandled = false;
            const handleSocketDrop = (reason: string) => {
              if (closeHandled || seq !== connectSeqRef.current) return;
              closeHandled = true;
              disposeListeners.forEach((fn) => fn());
              if (!isMounted || intentionalCloseRef.current) return;
              ptySessionIdRef.current = null;
              setSessionIdState(null);
              scheduleReconnectRef.current(reason);
            };

            ws.onopen = () => {
              if (seq !== connectSeqRef.current) return;
              retryCountRef.current = 0;
              setStatus('connected');
              lastActivityRef.current = Date.now();
              bumpActivity();
              if (!isMounted || intentionalCloseRef.current) return;

              const term = xtermRef.current;
              if (!term) return;
              term.clear();
              if (fitAddonRef.current && terminalRef.current) {
                fitTerminalDimensions(term, fitAddonRef.current, terminalRef.current);
              }

              const onDataSub = term.onData((data) => {
                bumpActivity();
                if (data.endsWith('\r') || data.endsWith('\n')) {
                  const cmd = data.replace(/[\r\n]+$/, '').trim();
                  if (isAgentsamModelsSlashLine(cmd)) {
                    void formatAgentsamModelsToTerminal((text) => term.write(text));
                    return;
                  }
                }
                if (ws.readyState !== WebSocket.OPEN) return;
                if (data.endsWith('\r') || data.endsWith('\n')) {
                  const cmd = data.replace(/[\r\n]+$/, '').trim();
                  if (cmd.startsWith('/')) {
                    ws.send(JSON.stringify({ type: 'slash', line: cmd }));
                    return;
                  }
                }
                ws.send(data);
              });
              const onResizeSub = term.onResize(({ cols, rows }) => {
                if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'resize', cols, rows }));
              });
              disposeListeners.push(() => {
                onDataSub.dispose();
                onResizeSub.dispose();
              });

              term.writeln('  \x1b[38;5;82m◈\x1b[0m Worker control-plane: \x1b[38;5;82mACTIVE\x1b[0m');
              term.writeln('  \x1b[38;5;240m◈ Backend mode: pty · target: ' + targetType + '\x1b[0m');
              if (ptySlot) {
                term.writeln(`  \x1b[38;5;240m◈ Session slot: ${ptySlot}\x1b[0m`);
              }

              if (resumeJson.resumable === true) {
                const sid = resumeJson.session_id ?? '';
                term.writeln(`  \x1b[38;5;240m◈ Resume: session ${sid.slice(0, 8)}…\x1b[0m`);
              }

              const greeting = cachedBootstrapRef.current?.greeting ?? null;
              if (greeting && xtermRef.current) {
                xtermRef.current.writeln(`\r\n\x1b[1;36m  › ${greeting}\x1b[0m`);
              }

              if (!historySeededRef.current) {
                historySeededRef.current = true;
                void fetchTerminalHistoryCommands().then((commands) => {
                  if (!isMounted || intentionalCloseRef.current || seq !== connectSeqRef.current) return;
                  if (ws.readyState === WebSocket.OPEN && commands.length > 0) {
                    seedShellHistoryViaPty(ws, commands, shell || '/bin/zsh');
                  }
                });
              }
            };

            ws.onmessage = (event) => {
              if (seq !== connectSeqRef.current) return;
              bumpActivity();
              try {
                const msg = JSON.parse(event.data as string) as {
                  type?: string;
                  session_id?: string;
                  data?: string;
                  status?: string;
                  error?: string;
                };
                if (msg.type === 'session_id') {
                  const sid = msg.session_id?.trim() ?? '';
                  if (sid) {
                    ptySessionIdRef.current = sid;
                    setSessionIdState(sid);
                  }
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
                  appendBufferRef.current(text);
                  xtermRef.current?.write(text);
                  emitTerminalOutputLines(text, onTerminalOutputLine);
                  return;
                }
              } catch (_) {
                /* binary passthrough */
              }
              const raw = event.data as string;
              appendBufferRef.current(raw);
              xtermRef.current?.write(raw);
              emitTerminalOutputLines(raw, onTerminalOutputLine);
            };

            ws.onerror = () => {
              if (!isMounted || intentionalCloseRef.current || seq !== connectSeqRef.current) return;
              setStatus('disconnected');
              handleSocketDrop('Connection error');
            };

            ws.onclose = (evt) => {
              if (!isMounted || intentionalCloseRef.current || seq !== connectSeqRef.current) return;
              if (evt.code === 1000 && evt.reason === 'superseded') return;
              if (evt.code === 4401) {
                setStatus('session_expired');
                return;
              }
              if (evt.code === 4403) {
                setStatus('auth_failed');
                return;
              }
              if (evt.code === 4503) {
                setStatus('backend_unavailable');
                return;
              }
              setStatus('disconnected');
              handleSocketDrop(`Connection closed (${evt.code || 'no-code'})`);
            };
          } catch (e: unknown) {
            if (!isMounted || intentionalCloseRef.current || seq !== connectSeqRef.current) return;
            setStatus('disconnected');
            scheduleReconnectRef.current(
              `Connection bootstrap failed: ${e instanceof Error ? e.message : String(e)}`,
            );
          } finally {
            if (seq === connectSeqRef.current) connectInFlightRef.current = false;
          }
        })();
      };

      activeConnectRef.current = connect;

      if (connectDebounceRef.current) {
        clearTimeout(connectDebounceRef.current);
        connectDebounceRef.current = null;
      }

      if (!visible || !connectEnabled) {
        intentionalCloseRef.current = true;
        connectSeqRef.current += 1;
        connectInFlightRef.current = false;
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        clearInactivityTimer();
        closeSocketQuietly(socketRef.current);
        socketRef.current = null;
        if (!visible) {
          return () => {
            isMounted = false;
          };
        }
        return () => {
          isMounted = false;
        };
      }

      intentionalCloseRef.current = false;
      const wsId = workspaceId?.trim() ?? '';
      if (!wsId) return () => {
        isMounted = false;
      };

      connectDebounceRef.current = window.setTimeout(() => {
        connectDebounceRef.current = null;
        if (!isMounted || intentionalCloseRef.current) return;
        const existing = socketRef.current;
        if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
          return;
        }
        connect();
      }, 120) as unknown as number;

      return () => {
        isMounted = false;
        connectSeqRef.current += 1;
        connectInFlightRef.current = false;
        if (connectDebounceRef.current) {
          clearTimeout(connectDebounceRef.current);
          connectDebounceRef.current = null;
        }
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        clearInactivityTimer();
        closeSocketQuietly(socketRef.current);
        socketRef.current = null;
      };
    }, [visible, connectEnabled, workspaceId, ptySlot, shell, targetType, bumpActivity, clearInactivityTimer, onHardFailure]);

    useEffect(() => {
      const observer = new MutationObserver(() => {
        const term = xtermRef.current;
        if (!term) return;
        const s = getComputedStyle(document.documentElement);
        const bg = s.getPropertyValue('--terminal-surface').trim() || '#060e14';
        const fg = s.getPropertyValue('--text-main').trim() || '#839496';
        const cur = s.getPropertyValue('--solar-cyan').trim() || '#2dd4bf';
        term.options.theme = {
          ...term.options.theme,
          background: bg,
          foreground: fg,
          cursor: cur,
          selectionBackground: 'rgba(45, 212, 191, 0.30)',
          selectionForeground: fg,
        };
      });
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme', 'class', 'style'],
      });
      return () => observer.disconnect();
    }, []);

    useImperativeHandle(ref, () => ({
      writeToTerminal: (text: string) => {
        xtermRef.current?.writeln(`\r\n\x1b[2m${text}\x1b[0m`);
      },
      writeAnsi: (text: string) => {
        xtermRef.current?.write(text);
      },
      runCommand: (cmd: string) => {
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
          .then(async (r) => {
            const j = (await r.json().catch(() => ({}))) as {
              error?: string;
              output?: string;
              command?: string;
              execution_id?: string;
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
                  execution_id: j.execution_id,
                  status: 'completed',
                  output_text: out,
                  exit_code: 0,
                }),
              }).catch(() => {});
            }
          })
          .catch(() => xtermRef.current?.writeln('\r\n\x1b[1;31m  terminal/run: network error\x1b[0m'));
      },
      reconnectClean: () => {
        intentionalCloseRef.current = false;
        retryCountRef.current = 0;
        connectSeqRef.current += 1;
        clearInactivityTimer();
        closeSocketQuietly(socketRef.current);
        socketRef.current = null;
        void refreshBootstrapRef.current().finally(() => {
          setStatus('connecting');
          activeConnectRef.current();
        });
      },
      disconnectQuiet: () => {
        intentionalCloseRef.current = true;
        retryCountRef.current = 0;
        connectSeqRef.current += 1;
        if (retryTimerRef.current) {
          clearTimeout(retryTimerRef.current);
          retryTimerRef.current = null;
        }
        clearInactivityTimer();
        closeSocketQuietly(socketRef.current);
        socketRef.current = null;
        ptySessionIdRef.current = null;
        setSessionIdState(null);
        setStatus('disconnected');
      },
      getSessionId: () => ptySessionIdRef.current,
    }));

    useEffect(() => {
      if (!terminalRef.current || !visible) return;

      const s = getComputedStyle(document.documentElement);
      const bg = s.getPropertyValue('--terminal-surface').trim() || '#060e14';
      const fg = s.getPropertyValue('--text-main').trim() || '#839496';
      const cur = s.getPropertyValue('--solar-cyan').trim() || '#2dd4bf';

      const term = new Terminal({
        theme: {
          background: bg,
          foreground: fg,
          cursor: cur,
          selectionBackground: 'rgba(45, 212, 191, 0.30)',
          selectionForeground: fg,
          black: '#002b36',
          brightBlack: '#657b83',
          red: '#dc322f',
          brightRed: '#cb4b16',
          green: '#859900',
          brightGreen: '#586e75',
          yellow: '#b58900',
          brightYellow: '#657b83',
          blue: '#268bd2',
          brightBlue: '#839496',
          magenta: '#d33682',
          brightMagenta: '#6c71c4',
          cyan: '#2aa198',
          brightCyan: '#93a1a1',
          white: '#eee8d5',
          brightWhite: '#fdf6e3',
        },
        fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", Menlo, Monaco, "Courier New", monospace',
        fontSize: 12,
        lineHeight: 1.45,
        cursorBlink: true,
        cursorStyle: 'block',
        allowTransparency: true,
        scrollback: 5000,
      });

      const hostEl = terminalRef.current;
      term.open(hostEl);
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      fitTerminalDimensions(term, fitAddon, hostEl);

      xtermRef.current = term;
      fitAddonRef.current = fitAddon;

      const refit = () => {
        requestAnimationFrame(() => {
          const t = xtermRef.current;
          const f = fitAddonRef.current;
          if (t && f) fitTerminalDimensions(t, f, terminalRef.current);
        });
      };
      window.addEventListener('resize', refit);
      const ro = new ResizeObserver(refit);
      ro.observe(hostEl);

      const slashModelsSub = term.onData((data) => {
        if (!data.endsWith('\r') && !data.endsWith('\n')) return;
        const cmd = data.replace(/[\r\n]+$/, '').trim();
        if (isAgentsamModelsSlashLine(cmd)) {
          void formatAgentsamModelsToTerminal((text) => term.write(text));
        }
      });

      return () => {
        slashModelsSub.dispose();
        window.removeEventListener('resize', refit);
        ro.disconnect();
        term.dispose();
        xtermRef.current = null;
        fitAddonRef.current = null;
      };
    }, [visible]);

    return (
      <>
        <style>{`
          .iam-terminal-pane-root .xterm {
            padding: 0;
            margin: 0;
            height: 100%;
          }
          .iam-terminal-pane-root .xterm-viewport {
            height: 100% !important;
          }
          .iam-terminal-pane-root .xterm-viewport,
          .iam-terminal-pane-root .xterm-screen {
            width: 100% !important;
          }
          .iam-terminal-pane-root .xterm-shell-viewport .xterm-viewport { overflow-y: auto !important; }
        `}</style>
        <div
          className="iam-terminal-pane-root relative flex-1 min-h-0 min-w-0 flex h-full w-full flex-col bg-[var(--terminal-surface)] overflow-hidden"
          onPointerDown={(e) => {
            if (!isNarrowViewport()) return;
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            const term = xtermRef.current;
            const host = terminalRef.current;
            if (!term || !host) return;
            const screen = host.querySelector('.xterm-screen');
            if (screen && term.getSelection()?.length) return;
            focusXtermSurface(term, host);
          }}
        >
          {status === 'timed_out' && (
            <div className="absolute inset-0 z-[25] flex flex-col items-center justify-center gap-3 bg-[var(--terminal-surface)]/95 backdrop-blur-sm px-4 text-center">
              <p className="text-[12px] font-mono text-[var(--text-main)]">
                Session timed out after 5 minutes of inactivity.
              </p>
              <button
                type="button"
                className="px-4 py-2 rounded text-[11px] font-mono border border-[var(--solar-cyan)]/40 text-[var(--solar-cyan)] hover:bg-[var(--solar-cyan)]/10"
                onClick={() => {
                  intentionalCloseRef.current = false;
                  retryCountRef.current = 0;
                  setStatus('connecting');
                  void refreshBootstrapRef.current().finally(() => activeConnectRef.current());
                }}
              >
                Reconnect
              </button>
            </div>
          )}
          <div
            ref={terminalRef}
            className="xterm-shell-viewport min-h-0 min-w-0 flex-1 w-full"
            style={{ padding: 0, margin: 0, height: '100%', minHeight: 0 }}
          />
        </div>
      </>
    );
  },
);

TerminalSessionPane.displayName = 'TerminalSessionPane';
