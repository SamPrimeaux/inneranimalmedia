import React from 'react';
import { ChevronDown, ChevronUp, Terminal } from 'lucide-react';
import type { LogLine } from './useCreationStation';

type Props = {
  open: boolean;
  onToggle: () => void;
  logs: LogLine[];
  onOpenTerminal: () => void;
};

function formatTs(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function LogPanel({ open, onToggle, logs, onOpenTerminal }: Props) {
  return (
    <div
      className={`border-t border-[var(--border-subtle)] bg-[#0a0c10] flex flex-col shrink-0 transition-all ${
        open ? 'h-[min(42vh,320px)]' : 'h-9'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center justify-between px-3 h-9 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--text-main)]"
      >
        <span className="flex items-center gap-2">
          <Terminal size={12} />
          Log
        </span>
        {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>
      {open && (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 overflow-y-auto custom-scrollbar px-3 pb-2 font-mono text-[10px] leading-relaxed">
            {logs.length === 0 ? (
              <p className="text-[var(--text-muted)]">Generation logs appear here…</p>
            ) : (
              logs.map((line, i) => (
                <div
                  key={`${line.ts}-${i}`}
                  className={
                    line.level === 'error'
                      ? 'text-red-400'
                      : line.level === 'warn'
                        ? 'text-amber-400'
                        : line.level === 'ok'
                          ? 'text-emerald-400'
                          : 'text-[var(--text-muted)]'
                  }
                >
                  <span className="opacity-50 mr-2">{formatTs(line.ts)}</span>
                  {line.text}
                </div>
              ))
            )}
          </div>
          <button
            type="button"
            onClick={onOpenTerminal}
            className="mx-3 mb-2 py-2 rounded-lg border border-[var(--border-subtle)] text-[10px] font-bold uppercase tracking-wider text-[var(--solar-cyan)] hover:bg-[var(--bg-hover)]"
          >
            Open full terminal
          </button>
        </div>
      )}
    </div>
  );
}
