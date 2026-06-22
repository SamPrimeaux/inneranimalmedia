import React from 'react';
import { Terminal } from 'lucide-react';
import type { LogLine } from './useCreationStation';

type Props = {
  logs: LogLine[];
  onOpenTerminal: () => void;
};

function formatTs(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** Slim footer — opens App shell terminal drawer (no overlap with viewport). */
export function TerminalLogBar({ logs, onOpenTerminal }: Props) {
  const last = logs[logs.length - 1];
  return (
    <button
      type="button"
      onClick={onOpenTerminal}
      className="shrink-0 flex items-center gap-2 px-3 h-9 border-t border-[var(--border-subtle)] bg-[var(--bg-panel)] text-left w-full hover:bg-[var(--bg-hover)] transition-colors"
    >
      <Terminal size={13} style={{ color: 'var(--solar-cyan)' }} />
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Logs</span>
      <span className="flex-1 min-w-0 truncate text-[10px] font-mono text-[var(--text-muted)]">
        {last
          ? `${formatTs(last.ts)} ${last.text}`
          : 'Meshy requests and pipeline output — opens terminal panel'}
      </span>
    </button>
  );
}
