/**
 * GorillaModeShell — Production Terminal Component
 *
 * Real xterm.js PTY shell with gorilla HUD overlay, Agent Sam buddy panel,
 * slash command interception, and XP event tracking.
 *
 * Props supply ALL workspace/user context — this component never hardcodes
 * any IDs, paths, URLs, or user-specific values.
 *
 * deps: @xterm/xterm @xterm/addon-fit @xterm/addon-web-links
 * css:  import '@xterm/xterm/css/xterm.css' in your entry
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Problem {
  file: string;
  line: number;
  col: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export interface OutputLine {
  text: string;
  type?: 'stdout' | 'stderr' | 'info';
}

export interface GorillaModeHandle {
  runCommand: (cmd: string) => void;
  writeToTerminal: (text: string) => void;
  triggerPump: () => void;
  triggerError: () => void;
  setActiveTab: (tab: TabKey) => void;
  focus: () => void;
}

export interface GorillaModeShellProps {
  /** Workspace display label shown in HUD and prompt */
  workspaceLabel: string;
  /** Workspace ID used to resolve socket URL and theme */
  workspaceId: string;
  /** Product name shown in boot screen */
  productLabel?: string;
  /** Optional cd command auto-run after PTY connects */
  workspaceCdCommand?: string;
  /** Show top welcome bar */
  showWelcomeBar?: boolean;
  /** Lint/build problems for Problems tab */
  problems?: Problem[];
  /** Build output lines for Output tab */
  outputLines?: OutputLine[];
  /** Called when user closes the shell panel */
  onClose?: () => void;
  /** CSS class applied to root container */
  className?: string;
}

type TabKey = 'terminal' | 'problems' | 'output';
type GorillaState = 'idle' | 'thinking' | 'pump' | 'error';

// ─── Pixel Sprite Data ────────────────────────────────────────────────────────

const PS = 5;
const PAL = [
  'transparent','#060e1a','#0f2040','#1a3568','#6a6a90','#9898b8',
  '#2a1006','#8a5830','#ff1a1a','#ffd88a','#0e0400','#ffffff',
  '#ffd700','#ffaa00','#ff6600','#ff2200','#9B6E14','#6B4808',
  '#3a2604','#c09030','#ffee44','#cc8800','#44ff88','#ff4444',
];

const GORILLA_IDLE = [
  [0,0,0,2,2,2,2,2,2,2,2,2,2,2,0,0,0,0],
  [0,0,2,3,3,3,3,3,3,3,3,3,3,2,2,0,0,0],
  [0,2,2,3,3,3,3,3,3,3,3,3,3,3,2,2,0,0],
  [0,2,3,3,7,7,3,3,3,7,7,3,3,3,2,0,0,0],
  [2,2,3,7,7,8,7,3,3,7,8,7,7,3,3,2,2,0],
  [2,2,3,7,7,7,7,7,7,7,7,7,7,3,3,2,2,0],
  [2,3,3,7,6,10,6,7,7,6,10,6,7,3,3,3,2,0],
  [2,3,3,7,7,7,9,9,9,9,7,7,7,3,3,3,2,0],
  [0,2,3,3,3,3,3,3,3,3,3,3,3,3,3,2,0,0],
  [0,2,2,3,4,4,4,4,4,4,4,4,4,3,2,2,0,0],
  [2,2,2,3,4,5,5,5,5,5,5,5,4,3,3,2,2,2],
  [2,3,2,3,4,5,5,5,5,5,5,5,4,3,2,3,2,2],
  [2,3,3,3,3,4,4,5,5,4,4,3,3,3,3,3,2,0],
  [0,2,3,3,3,3,3,3,3,3,3,3,3,3,2,2,0,0],
  [0,0,2,3,3,3,3,3,3,3,3,3,3,2,2,0,0,0],
  [0,0,2,2,3,3,3,3,3,3,3,3,2,2,0,0,0,0],
  [0,0,0,2,2,3,3,0,0,3,3,2,2,0,0,0,0,0],
  [0,0,0,2,2,2,2,0,0,2,2,2,2,0,0,0,0,0],
  [0,0,0,0,2,2,2,0,0,2,2,2,0,0,0,0,0,0],
  [0,0,0,0,2,3,2,0,0,2,3,2,0,0,0,0,0,0],
];

const GORILLA_PUMP = GORILLA_IDLE.map((r, i) => {
  if (i === 8)  return [2,2,3,3,3,3,3,3,3,3,3,3,3,3,3,2,2,0];
  if (i === 9)  return [2,2,3,4,5,5,5,5,5,5,5,5,5,4,3,2,2,0];
  if (i === 10) return [0,2,3,4,5,5,5,5,5,5,5,5,5,4,3,2,0,0];
  if (i === 11) return [0,2,3,3,4,5,5,5,5,5,5,5,4,3,3,2,0,0];
  return r;
});

const COIN = [
  [0,12,12,12,12,12,0],
  [12,20,20,20,20,20,12],
  [12,20,12,20,12,20,12],
  [12,20,20,20,20,20,12],
  [0,12,12,12,12,12,0],
  [0,0,21,21,0,0,0],
];

const FLAME_FRAMES = [
  [[0,0,14,0,0],[0,14,15,14,0],[14,15,13,14,0],[14,13,20,14,0],[0,14,13,14,0],[0,13,14,13,0]],
  [[0,14,0,14,0],[14,15,14,0,0],[14,13,15,14,0],[0,14,13,14,0],[0,13,14,0,0],[0,14,13,0,0]],
  [[0,14,14,0,0],[0,14,15,14,0],[14,15,13,15,0],[14,13,14,13,0],[0,14,13,14,0],[0,0,14,13,0]],
];

// ─── Sprite Component ─────────────────────────────────────────────────────────

function Sprite({ data, scale = 1 }: { data: number[][], scale?: number }) {
  const ps = PS * scale;
  return (
    <svg
      width={data[0].length * ps}
      height={data.length * ps}
      style={{ imageRendering: 'pixelated', display: 'block' }}
    >
      {data.flatMap((row, y) =>
        row.map((c, x) =>
          c ? (
            <rect
              key={`${x},${y}`}
              x={x * ps} y={y * ps}
              width={ps} height={ps}
              fill={PAL[c]}
            />
          ) : null
        )
      )}
    </svg>
  );
}

// ─── XP Event Helper ──────────────────────────────────────────────────────────

async function awardXp(
  eventType: string,
  xpAwarded: number,
  workspaceId: string,
  metadata?: Record<string, unknown>
) {
  try {
    await fetch('/api/gorilla/xp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type: eventType, xp_awarded: xpAwarded, workspace_id: workspaceId, metadata }),
    });
  } catch (_) {}
}

// ─── Output Pattern Matchers ──────────────────────────────────────────────────

function detectGorillaReaction(text: string): 'pump' | 'error' | null {
  const lower = text.toLowerCase();
  if (
    lower.includes('deployed successfully') ||
    lower.includes('gate passed') ||
    lower.includes(' pass ') ||
    lower.includes('build complete') ||
    lower.includes('benchmark passed')
  ) return 'pump';
  if (
    lower.includes('error') ||
    lower.includes('failed') ||
    lower.includes('exception') ||
    lower.includes('fatal') ||
    lower.includes(' fail ')
  ) return 'error';
  return null;
}

// ─── Slash Command Registry ───────────────────────────────────────────────────

const SLASH_COMMANDS: Record<string, string> = {
  '/help':        'Show available slash commands',
  '/agentsam':    'Ask Agent Sam anything about your workspace',
  '/deploy':      'Trigger sandbox deploy pipeline',
  '/benchmark':   'Run the full benchmark suite',
  '/tail':        'Stream worker logs',
  '/d1':          'Run a D1 query',
  '/status':      'Show workspace + tunnel status',
  '/theme':       'Switch terminal theme: /theme [slug]',
  '/diagnostics': 'Run system health diagnostics',
  '/xp':          'Show your current XP and streak',
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const GorillaModeShell = forwardRef<GorillaModeHandle, GorillaModeShellProps>(
  function GorillaModeShell(props, ref) {
    const {
      workspaceLabel,
      workspaceId,
      productLabel = 'Agent Sam',
      workspaceCdCommand,
      showWelcomeBar = true,
      problems = [],
      outputLines = [],
      onClose,
      className = '',
    } = props;

    // ── State ─────────────────────────────────────────────────────────────────
    const [booted, setBooted]           = useState(false);
    const [bootLine, setBootLine]       = useState('');
    const [activeTab, setActiveTab]     = useState<TabKey>('terminal');
    const [gorillaState, setGorilla]    = useState<GorillaState>('idle');
    const [flameTick, setFlameTick]     = useState(0);
    const [connected, setConnected]     = useState(false);
    const [coinCount, setCoinCount]     = useState(0);
    const [floatCoins, setFloatCoins]   = useState<Array<{id:number,x:number,y:number,dx:number}>>([]);
    const [xpTotal, setXpTotal]         = useState(0);
    const [buddyOpen, setBuddyOpen]     = useState(false);
    const [buddyInput, setBuddyInput]   = useState('');
    const [buddyLines, setBuddyLines]   = useState<string[]>([]);
    const [buddyLoading, setBuddyLoading] = useState(false);
    const [slashHint, setSlashHint]     = useState('');
    const [inputBuffer, setInputBuffer] = useState('');

    // ── Refs ──────────────────────────────────────────────────────────────────
    const termDivRef  = useRef<HTMLDivElement>(null);
    const xtermRef    = useRef<Terminal | null>(null);
    const fitRef      = useRef<FitAddon | null>(null);
    const wsRef       = useRef<WebSocket | null>(null);
    const buddyInputRef = useRef<HTMLInputElement>(null);

    // ── Boot sequence ─────────────────────────────────────────────────────────
    useEffect(() => {
      const lines = [
        'GORILLA MODE INITIALIZING',
        `>> WORKSPACE: ${workspaceLabel.toUpperCase()}`,
        `>> PRODUCT: ${productLabel.toUpperCase()}`,
        '>> CONNECTING TO IAM-PTY',
        '>> AGENT SAM: ONLINE',
        '>> READY',
      ];
      let i = 0;
      const t = setInterval(() => {
        if (i < lines.length) { setBootLine(lines[i]); i++; }
        else { clearInterval(t); setTimeout(() => setBooted(true), 350); }
      }, 320);
      return () => clearInterval(t);
    }, [workspaceLabel, productLabel]);

    // ── Flame animation ───────────────────────────────────────────────────────
    useEffect(() => {
      const t = setInterval(() => setFlameTick(n => (n + 1) % 3), 190);
      return () => clearInterval(t);
    }, []);

    // ── Gorilla state reset ───────────────────────────────────────────────────
    useEffect(() => {
      if (gorillaState === 'pump' || gorillaState === 'error') {
        const t = setTimeout(() => setGorilla('idle'), 800);
        return () => clearTimeout(t);
      }
    }, [gorillaState]);

    // ── XP fetch on mount ─────────────────────────────────────────────────────
    useEffect(() => {
      if (!booted) return;
      fetch(`/api/gorilla/xp?workspace_id=${encodeURIComponent(workspaceId)}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.total) setXpTotal(d.total); })
        .catch(() => {});
    }, [booted, workspaceId]);

    // ── xterm.js init + PTY connect ───────────────────────────────────────────
    useEffect(() => {
      if (!booted || !termDivRef.current) return;

      const term = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: '"Cascadia Code", "Fira Code", "Courier New", monospace',
        theme: {
          background:  'var(--monaco-bg, #0f172a)',
          foreground:  'var(--color-text, #e2e8f0)',
          cursor:      'var(--color-primary, #00e5ff)',
          black:       '#0f172a',
          brightBlack: '#334155',
          red:         '#ff4444',
          brightRed:   '#ff6666',
          green:       '#44ff88',
          brightGreen: '#66ffaa',
          yellow:      '#ffcc00',
          brightYellow:'#ffdd44',
          blue:        '#3b82f6',
          brightBlue:  '#60a5fa',
          magenta:     '#a855f7',
          brightMagenta:'#c084fc',
          cyan:        '#00e5ff',
          brightCyan:  '#22d3ee',
          white:       '#e2e8f0',
          brightWhite: '#ffffff',
        },
        allowProposedApi: true,
      });

      const fit = new FitAddon();
      term.loadAddon(fit);
      term.loadAddon(new WebLinksAddon());
      term.open(termDivRef.current);
      fit.fit();

      xtermRef.current = term;
      fitRef.current   = fit;

      // Resize observer
      const ro = new ResizeObserver(() => fit.fit());
      ro.observe(termDivRef.current);

      // Connect PTY WebSocket
      connectPty(term);

      // Input interception for slash commands
      let lineBuffer = '';
      term.onData((data) => {
        // Intercept slash at start of line
        if (data === '/') {
          lineBuffer = '/';
          setSlashHint('/');
          term.write(data);
          return;
        }
        if (lineBuffer.startsWith('/')) {
          if (data === '\r') {
            const cmd = lineBuffer.trim();
            lineBuffer = '';
            setSlashHint('');
            handleSlashCommand(cmd, term);
            return;
          }
          if (data === '\x7f') {
            lineBuffer = lineBuffer.slice(0, -1);
            setSlashHint(lineBuffer || '');
            term.write('\b \b');
            return;
          }
          lineBuffer += data;
          setSlashHint(lineBuffer);
          term.write(data);
          return;
        }
        // Pass through to PTY
        wsRef.current?.send(data);
      });

      return () => {
        ro.disconnect();
        wsRef.current?.close();
        term.dispose();
        xtermRef.current = null;
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [booted]);

    // ── PTY connect ───────────────────────────────────────────────────────────
    const connectPty = useCallback(async (term: Terminal) => {
      try {
        const res = await fetch(
          `/api/agent/terminal/socket-url?workspace_id=${encodeURIComponent(workspaceId)}`
        );
        if (!res.ok) {
          term.writeln('\r\n\x1b[33m[GORILLA] Terminal socket not configured.\x1b[0m');
          return;
        }
        const { url } = await res.json();
        if (!url) return;

        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.binaryType = 'arraybuffer';

        ws.onopen = () => {
          setConnected(true);
          term.writeln('\x1b[32m[GORILLA] PTY connected.\x1b[0m');
          if (workspaceCdCommand) {
            ws.send(workspaceCdCommand + '\n');
          }
        };

        ws.onmessage = (e) => {
          const data = e.data instanceof ArrayBuffer
            ? new TextDecoder().decode(e.data)
            : e.data;
          term.write(data);
          // Check for game reactions
          const reaction = detectGorillaReaction(data);
          if (reaction === 'pump') triggerPump();
          if (reaction === 'error') triggerErrorState();
        };

        ws.onerror = () => {
          setConnected(false);
          term.writeln('\r\n\x1b[31m[GORILLA] PTY connection error.\x1b[0m');
        };

        ws.onclose = () => {
          setConnected(false);
          term.writeln('\r\n\x1b[33m[GORILLA] PTY disconnected.\x1b[0m');
        };
      } catch (e) {
        term.writeln('\r\n\x1b[31m[GORILLA] Failed to resolve terminal URL.\x1b[0m');
      }
    }, [workspaceId, workspaceCdCommand]);

    // ── Slash command handler ─────────────────────────────────────────────────
    const handleSlashCommand = useCallback((cmd: string, term: Terminal) => {
      term.writeln('');
      const base = cmd.split(' ')[0];

      if (base === '/help') {
        term.writeln('\x1b[36m┌─ GORILLA COMMANDS ─────────────────────────────┐\x1b[0m');
        Object.entries(SLASH_COMMANDS).forEach(([k, v]) => {
          term.writeln(`\x1b[36m│\x1b[0m  \x1b[33m${k.padEnd(16)}\x1b[0m ${v}`);
        });
        term.writeln('\x1b[36m└────────────────────────────────────────────────┘\x1b[0m');
        return;
      }

      if (base === '/agentsam') {
        const query = cmd.slice('/agentsam'.length).trim();
        setBuddyInput(query);
        setBuddyOpen(true);
        if (query) sendBuddyMessage(query);
        return;
      }

      if (base === '/xp') {
        term.writeln(`\x1b[33m[XP]\x1b[0m Total: \x1b[32m${xpTotal}\x1b[0m`);
        return;
      }

      if (base === '/theme') {
        const slug = cmd.split(' ')[1];
        if (slug) {
          fetch('/api/user/preferences', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ theme_preset: slug }),
          }).then(() => {
            term.writeln(`\x1b[32m[GORILLA]\x1b[0m Theme switched to \x1b[33m${slug}\x1b[0m — reload page to apply.`);
          });
        } else {
          term.writeln('\x1b[33mUsage: /theme [slug]\x1b[0m  — run /help for options');
        }
        return;
      }

      // Unknown slash command — pass to PTY
      wsRef.current?.send(cmd + '\n');
    }, [xpTotal]);

    // ── Gorilla reactions ─────────────────────────────────────────────────────
    const triggerPump = useCallback(() => {
      setGorilla('pump');
      const n = Math.floor(Math.random() * 4) + 3;
      const batch = Array.from({ length: n }, (_, i) => ({
        id: Date.now() + i,
        x: 5 + Math.random() * 12,
        y: 40 + Math.random() * 20,
        dx: (Math.random() - 0.5) * 60,
      }));
      setFloatCoins(p => [...p, ...batch]);
      setCoinCount(c => c + n);
      setXpTotal(xp => xp + 10);
      setTimeout(() => setFloatCoins(p => p.filter(c => !batch.find(b => b.id === c.id))), 1400);
      awardXp('deploy_success', 10, workspaceId);
    }, [workspaceId]);

    const triggerErrorState = useCallback(() => {
      setGorilla('error');
    }, []);

    // ── Agent Sam buddy ───────────────────────────────────────────────────────
    const sendBuddyMessage = useCallback(async (message: string) => {
      if (!message.trim() || buddyLoading) return;
      setBuddyLoading(true);
      setBuddyLines(p => [...p, `> ${message}`]);
      setBuddyInput('');

      // Capture terminal context (last 8k chars of scrollback)
      let termContext = '';
      if (xtermRef.current) {
        const lines: string[] = [];
        const buf = xtermRef.current.buffer.active;
        const start = Math.max(0, buf.length - 60);
        for (let i = start; i < buf.length; i++) {
          lines.push(buf.getLine(i)?.translateToString(true) || '');
        }
        termContext = lines.join('\n').slice(-8000);
      }

      try {
        const res = await fetch('/api/agent/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: 'anthropic',
            messages: [{ role: 'user', content: message }],
            system: `You are Agent Sam, an expert developer assistant embedded in the ${productLabel} terminal for workspace ${workspaceLabel}. Terminal context:\n\`\`\`\n${termContext}\n\`\`\`\nBe concise. Focus on actionable answers.`,
          }),
        });

        if (!res.body) {
          setBuddyLines(p => [...p, '[SAM] No response.']);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let samLine = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n');
          buffer = parts.pop() || '';
          for (const part of parts) {
            if (part.startsWith('data: ')) {
              const raw = part.slice(6).trim();
              if (raw === '[DONE]') continue;
              try {
                const j = JSON.parse(raw);
                const delta = j?.delta?.text || j?.choices?.[0]?.delta?.content || '';
                if (delta) {
                  samLine += delta;
                  setBuddyLines(p => {
                    const updated = [...p];
                    if (updated[updated.length - 1]?.startsWith('[SAM] ')) {
                      updated[updated.length - 1] = '[SAM] ' + samLine;
                    } else {
                      updated.push('[SAM] ' + samLine);
                    }
                    return updated;
                  });
                }
              } catch (_) {}
            }
          }
        }
        awardXp('agent_chat', 2, workspaceId);
      } catch (e) {
        setBuddyLines(p => [...p, '[SAM] Connection error.']);
      } finally {
        setBuddyLoading(false);
      }
    }, [buddyLoading, productLabel, workspaceLabel, workspaceId]);

    // ── Imperative API ────────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      runCommand: (cmd) => {
        wsRef.current?.send(cmd + '\n');
        xtermRef.current?.focus();
      },
      writeToTerminal: (text) => {
        xtermRef.current?.writeln(text);
      },
      triggerPump,
      triggerError: triggerErrorState,
      setActiveTab,
      focus: () => xtermRef.current?.focus(),
    }), [triggerPump, triggerErrorState]);

    // ── Keyboard shortcuts ────────────────────────────────────────────────────
    useEffect(() => {
      const handler = (e: KeyboardEvent) => {
        if (e.ctrlKey && e.key === 'a') {
          e.preventDefault();
          setBuddyOpen(p => !p);
        }
      };
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }, []);

    // ── Stars (memoized) ──────────────────────────────────────────────────────
    const stars = useMemo(() =>
      Array.from({ length: 40 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 50,
        s: Math.random() < 0.2 ? 2 : 1,
        d: Math.random() * 4,
      })), []
    );

    // ── CSS ───────────────────────────────────────────────────────────────────
    const CSS = `
      @keyframes gorilla-idle    { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
      @keyframes gorilla-pump    { 0%{transform:scale(1)} 30%{transform:scale(1.12) translateY(-7px)} 70%{transform:scale(.97)} 100%{transform:scale(1)} }
      @keyframes gorilla-shake   { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-4px)} 40%{transform:translateX(4px)} 60%{transform:translateX(-3px)} 80%{transform:translateX(3px)} }
      @keyframes coin-rise       { 0%{transform:translateY(0) scale(1);opacity:1} 100%{transform:translateY(-80px) scale(.3);opacity:0} }
      @keyframes cursor-blink    { 0%,100%{opacity:1} 50%{opacity:0} }
      @keyframes star-twinkle    { 0%,100%{opacity:.7} 50%{opacity:.1} }
      @keyframes flame-flicker   { 0%,100%{transform:scaleY(1)} 50%{transform:scaleY(1.12) scaleX(.9)} }
      @keyframes scanline        { 0%{opacity:.02} 50%{opacity:.05} 100%{opacity:.02} }
      @keyframes fadein          { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:none} }
      @keyframes err-flash       { 0%,100%{box-shadow:none} 50%{box-shadow:0 0 30px rgba(255,68,68,.5) inset} }
      @keyframes buddy-slide     { from{transform:translateX(100%);opacity:0} to{transform:translateX(0);opacity:1} }
      .gm-tab { cursor:pointer; background:transparent; border:none; font-family:inherit; font-size:11px; letter-spacing:1.5px; padding:8px 14px; border-bottom:2px solid transparent; transition:all .15s; color:rgba(255,255,255,.4); }
      .gm-tab.active { color:var(--color-primary,#00e5ff); border-bottom-color:var(--color-primary,#00e5ff); }
      .gm-tab:hover:not(.active) { color:rgba(255,255,255,.7); }
      .gm-btn { cursor:pointer; background:transparent; border:1px solid var(--color-border,rgba(0,229,255,.2)); color:var(--color-primary,#00e5ff); font-family:inherit; font-size:10px; letter-spacing:1.5px; padding:4px 10px; transition:all .12s; }
      .gm-btn:hover { background:var(--color-primary,#00e5ff); color:#000; }
      .gm-btn.active { background:var(--color-primary,#00e5ff); color:#000; }
    `;

    const isError = gorillaState === 'error';
    const isPump  = gorillaState === 'pump';

    // ── Boot screen ───────────────────────────────────────────────────────────
    if (!booted) {
      return (
        <div style={{
          width: '100%', height: '100%', minHeight: '100vh',
          background: 'var(--bg-canvas, #030a14)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          fontFamily: '"Courier New", monospace',
          color: 'var(--color-primary, #00e5ff)',
        }}>
          <style>{CSS}</style>
          <div style={{ fontSize: 9, letterSpacing: 6, opacity: 0.35, marginBottom: 14, textTransform: 'uppercase' }}>
            {workspaceLabel}
          </div>
          <Sprite data={GORILLA_IDLE} scale={1.2} />
          <div style={{ marginTop: 20, fontSize: 13, letterSpacing: 2, textShadow: '0 0 10px var(--color-primary, #00e5ff)' }}>
            {bootLine}
            <span style={{ animation: 'cursor-blink .7s infinite' }}>_</span>
          </div>
        </div>
      );
    }

    // ── Main shell ────────────────────────────────────────────────────────────
    return (
      <div
        className={className}
        style={{
          width: '100%', height: '100%', minHeight: '100vh',
          background: 'var(--bg-canvas, #0f172a)',
          fontFamily: '"Courier New", monospace',
          position: 'relative', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <style>{CSS}</style>

        {/* Scanlines */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 90,
          backgroundImage: 'repeating-linear-gradient(0deg,rgba(0,0,0,.04) 0,rgba(0,0,0,.04) 1px,transparent 1px,transparent 3px)',
          animation: 'scanline 5s infinite',
        }} />

        {/* Stars */}
        {stars.map(s => (
          <div key={s.id} style={{
            position: 'absolute', left: `${s.x}%`, top: `${s.y}%`,
            width: s.s, height: s.s, background: '#fff',
            animation: `star-twinkle ${2 + s.d}s infinite`,
            animationDelay: `${s.d}s`, pointerEvents: 'none',
          }} />
        ))}

        {/* Floating coins */}
        {floatCoins.map(c => (
          <div key={c.id} style={{
            position: 'absolute', left: `${c.x}%`, top: `${c.y}%`,
            animation: 'coin-rise 1.3s ease-out forwards',
            transform: `translateX(${c.dx}px)`, pointerEvents: 'none', zIndex: 60,
          }}>
            <Sprite data={COIN} scale={0.9} />
          </div>
        ))}

        {/* Top bar */}
        {showWelcomeBar && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 16px', flexShrink: 0,
            background: 'var(--bg-surface, rgba(15,32,64,.97))',
            borderBottom: '1px solid var(--color-border, rgba(0,229,255,.15))',
            zIndex: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{
                fontSize: 11, fontWeight: 900, letterSpacing: 4,
                color: '#fff', textShadow: '0 0 12px var(--color-primary,#00e5ff)',
              }}>
                GORILLA MODE
              </span>
              <span style={{ fontSize: 9, letterSpacing: 2, color: 'rgba(255,255,255,.3)' }}>
                {workspaceLabel.toUpperCase()}
              </span>
              <div style={{
                width: 7, height: 7, borderRadius: '50%',
                background: connected ? 'var(--color-primary,#00e5ff)' : '#ff4444',
                boxShadow: connected ? '0 0 8px var(--color-primary,#00e5ff)' : '0 0 8px #ff4444',
              }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Coin counter */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'rgba(0,0,0,.4)',
                border: '1px solid var(--color-border,rgba(0,229,255,.2))',
                padding: '2px 8px',
              }}>
                <Sprite data={COIN} scale={0.4} />
                <span style={{ color: 'var(--color-primary,#00e5ff)', fontSize: 10, letterSpacing: 2 }}>
                  x{coinCount}
                </span>
              </div>
              {/* XP */}
              <span style={{ fontSize: 9, letterSpacing: 2, color: 'rgba(255,255,255,.4)' }}>
                XP {xpTotal}
              </span>
              {/* SAM button */}
              <button
                className={`gm-btn${buddyOpen ? ' active' : ''}`}
                onClick={() => setBuddyOpen(p => !p)}
                title="Ctrl+A"
              >
                SAM
              </button>
              {onClose && (
                <button className="gm-btn" onClick={onClose}>✕</button>
              )}
            </div>
          </div>
        )}

        {/* Body split */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* LEFT — Gorilla HUD */}
          <div style={{
            width: 190, minWidth: 170, flexShrink: 0,
            background: 'var(--bg-surface, rgba(4,12,26,.97))',
            borderRight: '1px solid var(--color-border, rgba(0,229,255,.12))',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '14px 12px', gap: 0,
          }}>
            {/* Gorilla sprite */}
            <div style={{
              animation: isError ? 'gorilla-shake .5s ease' : isPump ? 'gorilla-pump .6s ease' : 'gorilla-idle 2.8s ease-in-out infinite',
              filter: isError ? 'brightness(1.6) saturate(2) hue-rotate(-20deg)' : 'none',
              marginBottom: 6,
            }}>
              <Sprite data={isPump ? GORILLA_PUMP : GORILLA_IDLE} scale={1} />
            </div>

            {/* Flames */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 56, marginTop: -4 }}>
              {[0, 1].map(i => (
                <div key={i} style={{ animation: 'flame-flicker .45s infinite', animationDelay: `${i * 0.2}s` }}>
                  <Sprite data={FLAME_FRAMES[flameTick]} scale={0.85} />
                </div>
              ))}
            </div>

            {/* Status / HUD bars */}
            <div style={{ width: '100%', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--color-border,rgba(0,229,255,.1))' }}>
              {/* Connection status */}
              <div style={{ fontSize: 9, letterSpacing: 2, color: 'var(--color-primary,#00e5ff)', textAlign: 'center', marginBottom: 10, textShadow: '0 0 8px var(--color-primary,#00e5ff)' }}>
                {connected ? 'PTY LIVE' : 'CONNECTING'}
                {!connected && <span style={{ animation: 'cursor-blink .7s infinite', marginLeft: 4 }}>_</span>}
              </div>

              {/* Bars */}
              {[
                { label: 'PTY', val: connected ? '●' : '○', pct: connected ? 100 : 20, color: connected ? '#44ff88' : '#ff4444' },
                { label: 'XP', val: String(xpTotal), pct: Math.min(100, (xpTotal % 100)), color: 'var(--color-primary,#00e5ff)' },
                { label: 'COINS', val: String(coinCount), pct: Math.min(100, coinCount * 5), color: '#ffd700' },
              ].map(({ label, val, pct, color }) => (
                <div key={label} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, letterSpacing: 2, color: 'rgba(255,255,255,.35)', marginBottom: 2 }}>
                    <span>{label}</span>
                    <span style={{ color }}>{val}</span>
                  </div>
                  <div style={{ height: 4, background: 'rgba(255,255,255,.06)', position: 'relative' }}>
                    <div style={{ position: 'absolute', inset: 0, right: `${100 - pct}%`, background: color, boxShadow: `0 0 5px ${color}`, transition: 'right .4s ease' }} />
                  </div>
                </div>
              ))}

              {/* Workspace info */}
              <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--color-border,rgba(0,229,255,.08))', fontSize: 8, color: 'rgba(255,255,255,.25)', letterSpacing: 1, lineHeight: 1.9 }}>
                <div>{workspaceLabel}</div>
                <div style={{ color: slashHint ? 'var(--color-primary,#00e5ff)' : 'inherit', wordBreak: 'break-all' }}>
                  {slashHint || '> idle'}
                </div>
              </div>
            </div>

            {/* Quick actions */}
            <div style={{ width: '100%', marginTop: 'auto', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[
                { label: '1. Workspace', cmd: '/status' },
                { label: '2. Agent Sam', action: () => setBuddyOpen(true) },
                { label: '3. /help', cmd: '/help' },
                { label: '4. /diagnostics', cmd: '/diagnostics' },
              ].map(({ label, cmd, action }) => (
                <button
                  key={label}
                  className="gm-btn"
                  style={{ width: '100%', textAlign: 'left', fontSize: 9 }}
                  onClick={() => {
                    if (action) { action(); return; }
                    if (cmd) handleSlashCommand(cmd, xtermRef.current!);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* RIGHT — Terminal + tabs */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>

            {/* Tab bar */}
            <div style={{
              display: 'flex', alignItems: 'center',
              background: 'rgba(0,0,0,.35)',
              borderBottom: '1px solid var(--color-border,rgba(0,229,255,.1))',
              flexShrink: 0,
            }}>
              {(['terminal', 'problems', 'output'] as TabKey[]).map(t => (
                <button
                  key={t}
                  className={`gm-tab${activeTab === t ? ' active' : ''}`}
                  onClick={() => setActiveTab(t)}
                >
                  {t.toUpperCase()}
                  {t === 'problems' && problems.length > 0 && (
                    <span style={{ marginLeft: 5, color: '#ff4444', fontSize: 9 }}>{problems.length}</span>
                  )}
                </button>
              ))}
              <div style={{ marginLeft: 'auto', padding: '0 12px', fontSize: 9, color: 'rgba(255,255,255,.2)', letterSpacing: 1 }}>
                gorilla@{workspaceLabel} %
              </div>
            </div>

            {/* Terminal pane */}
            <div
              ref={termDivRef}
              style={{
                flex: 1, overflow: 'hidden',
                display: activeTab === 'terminal' ? 'block' : 'none',
                animation: isError ? 'err-flash .5s ease' : 'none',
                padding: 4,
              }}
            />

            {/* Problems pane */}
            {activeTab === 'problems' && (
              <div style={{ flex: 1, overflow: 'auto', padding: 14, fontSize: 12, lineHeight: 1.7 }}>
                {problems.length === 0 ? (
                  <div style={{ color: '#44ff88' }}>No problems detected.</div>
                ) : problems.map((p, i) => (
                  <div key={i} style={{ color: p.severity === 'error' ? '#ff4444' : p.severity === 'warning' ? '#ffcc00' : '#88bbff', marginBottom: 2 }}>
                    {p.severity.toUpperCase()}  {p.file}:{p.line}:{p.col}  {p.message}
                  </div>
                ))}
              </div>
            )}

            {/* Output pane */}
            {activeTab === 'output' && (
              <div style={{ flex: 1, overflow: 'auto', padding: 14, fontSize: 12, lineHeight: 1.7 }}>
                {outputLines.length === 0 ? (
                  <div style={{ color: 'rgba(255,255,255,.3)' }}>No output.</div>
                ) : outputLines.map((l, i) => (
                  <div key={i} style={{ color: l.type === 'stderr' ? '#ff4444' : l.type === 'info' ? '#88bbff' : 'rgba(255,255,255,.7)', whiteSpace: 'pre', animation: 'fadein .15s ease' }}>
                    {l.text}
                  </div>
                ))}
              </div>
            )}

            {/* Agent Sam buddy panel */}
            {buddyOpen && (
              <div style={{
                position: 'absolute', right: 0, top: 0, bottom: 0,
                width: 340, maxWidth: '90%',
                background: 'var(--bg-surface, rgba(6,14,26,.97))',
                borderLeft: '1px solid var(--color-border,rgba(0,229,255,.18))',
                display: 'flex', flexDirection: 'column',
                animation: 'buddy-slide .2s ease', zIndex: 50,
              }}>
                {/* Buddy header */}
                <div style={{
                  padding: '10px 14px',
                  borderBottom: '1px solid var(--color-border,rgba(0,229,255,.12))',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: 3, color: 'var(--color-primary,#00e5ff)' }}>AGENT SAM</span>
                    <div style={{ fontSize: 8, color: 'rgba(255,255,255,.3)', letterSpacing: 1, marginTop: 2 }}>Ctrl+A to toggle • /agentsam [query]</div>
                  </div>
                  <button className="gm-btn" onClick={() => setBuddyOpen(false)}>✕</button>
                </div>

                {/* Quick pills */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 12px', borderBottom: '1px solid var(--color-border,rgba(0,229,255,.08))' }}>
                  {['Explain error', 'Suggest fix', 'D1 status', 'Summarize session'].map(label => (
                    <button
                      key={label}
                      className="gm-btn"
                      style={{ fontSize: 9 }}
                      onClick={() => sendBuddyMessage(label)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Buddy output */}
                <div style={{ flex: 1, overflow: 'auto', padding: 12, fontSize: 12, lineHeight: 1.7 }}>
                  {buddyLines.length === 0 && (
                    <div style={{ color: 'rgba(255,255,255,.3)', fontSize: 11 }}>
                      Ask me anything about your workspace, errors, or deployment status.
                    </div>
                  )}
                  {buddyLines.map((l, i) => (
                    <div key={i} style={{
                      color: l.startsWith('> ') ? 'rgba(255,255,255,.6)' : 'var(--color-primary,#00e5ff)',
                      marginBottom: 4, animation: 'fadein .15s ease',
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    }}>
                      {l}
                    </div>
                  ))}
                  {buddyLoading && (
                    <div style={{ color: 'var(--color-primary,#00e5ff)', animation: 'cursor-blink .7s infinite' }}>
                      [SAM] thinking_
                    </div>
                  )}
                </div>

                {/* Buddy input */}
                <div style={{
                  padding: '8px 12px',
                  borderTop: '1px solid var(--color-border,rgba(0,229,255,.1))',
                  display: 'flex', gap: 8, alignItems: 'center',
                }}>
                  <input
                    ref={buddyInputRef}
                    value={buddyInput}
                    onChange={e => setBuddyInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') sendBuddyMessage(buddyInput); }}
                    placeholder="Ask Agent Sam..."
                    disabled={buddyLoading}
                    style={{
                      flex: 1, background: 'rgba(0,0,0,.4)',
                      border: '1px solid var(--color-border,rgba(0,229,255,.2))',
                      color: '#fff', fontFamily: 'inherit', fontSize: 11,
                      padding: '5px 8px', outline: 'none',
                    }}
                  />
                  <button
                    className="gm-btn"
                    onClick={() => sendBuddyMessage(buddyInput)}
                    disabled={buddyLoading}
                  >
                    →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
);

export default GorillaModeShell;
