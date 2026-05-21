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

export type TerminalConnectionStatus =
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
  getSessionId: () => string | null;
}

export interface TerminalSessionPaneProps {
  workspaceId?: string;
  /** Secondary pane id → Worker routes to distinct DO (split terminals). */
  ptySlot?: string;
  /** Full path, e.g. /bin/zsh — forwarded to PTY */
  shell?: string;
  visible: boolean;
  onConnectionChange?: (s: TerminalConnectionStatus) => void;
  onSessionIdChange?: (id: string | null) => void;
}

export const TerminalSessionPane = forwardRef<TerminalSessionPaneHandle, TerminalSessionPaneProps>(
  ({ workspaceId, ptySlot = '', shell = '', visible, onConnectionChange, onSessionIdChange }, ref) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const socketRef = useRef<WebSocket | null>(null);
    const retryCountRef = useRef<number>(0);
    const retryTimerRef = useRef<number | null>(null);
    const ptySessionIdRef = useRef<string | null>(null);
    const bufferRef = useRef<string>('');
    const statusRef = useRef<TerminalConnectionStatus>('connecting');

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

    const _doBootstrap = useCallback(async () => {
      cachedBootstrapRef.current = null;
      try {
        const [resumePack, cfgPack] = await Promise.all([
          fetch('/api/terminal/session/resume', {
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
          }).then(async (r) => ({ r, j: await r.json().catch(() => ({ resumable: false })) })),
          fetch('/api/agent/terminal/config-status', {
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
        if (statusRef.current === 'offline') return;
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
              scheduleReconnectRef.current('Terminal backend unavailable');
              return;
            }

            const resumeJson = boot.resumeJson ?? { resumable: false };

            closeSocketQuietly(socketRef.current);
            if (!isMounted || intentionalCloseRef.current || seq !== connectSeqRef.current) return;

            const wsHttpUrl = new URL('/api/agent/terminal/ws', window.location.origin);
            wsHttpUrl.searchParams.set('workspace_id', wsId);
            wsHttpUrl.searchParams.set('execution_mode', 'pty');
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
              if (!isMounted || intentionalCloseRef.current) return;

              const term = xtermRef.current;
              if (!term) return;
              term.clear();

              const onDataSub = term.onData((data) => {
                if (ws.readyState !== WebSocket.OPEN) return;
                if (data.endsWith('\r') || data.endsWith('\n')) {
                  const cmd = data.replace(/[\r\n]+$/, '').trim();
                  if (cmd.startsWith('/')) {
                    ws.send(JSON.stringify({ type: 'input', data }));
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
              term.writeln('  \x1b[38;5;240m◈ Backend mode: pty\x1b[0m');
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
            };

            ws.onmessage = (event) => {
              if (seq !== connectSeqRef.current) return;
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
                  return;
                }
              } catch (_) {
                /* binary passthrough */
              }
              appendBufferRef.current(event.data as string);
              xtermRef.current?.write(event.data as string);
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

      if (!visible) {
        intentionalCloseRef.current = true;
        connectSeqRef.current += 1;
        connectInFlightRef.current = false;
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        closeSocketQuietly(socketRef.current);
        socketRef.current = null;
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
        closeSocketQuietly(socketRef.current);
        socketRef.current = null;
      };
    }, [visible, workspaceId, ptySlot, shell]);

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
        closeSocketQuietly(socketRef.current);
        socketRef.current = null;
        void refreshBootstrapRef.current().finally(() => {
          setStatus('connecting');
          activeConnectRef.current();
        });
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

      term.open(terminalRef.current);
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      fitAddon.fit();

      xtermRef.current = term;
      fitAddonRef.current = fitAddon;

      const onResize = () => requestAnimationFrame(() => fitAddonRef.current?.fit());
      window.addEventListener('resize', onResize);
      const ro = new ResizeObserver(() => requestAnimationFrame(() => fitAddonRef.current?.fit()));
      ro.observe(terminalRef.current);

      return () => {
        window.removeEventListener('resize', onResize);
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
        <div className="iam-terminal-pane-root relative flex-1 min-h-0 min-w-0 flex h-full w-full flex-col bg-[var(--terminal-surface)] overflow-hidden">
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
