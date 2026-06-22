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
      className={`border-t border-white/[0.06] bg-[#08090d] flex flex-col shrink-0 transition-[height] duration-200 ${
        open ? 'h-[min(38vh,280px)]' : 'h-8'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center justify-between px-3 h-8 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-300"
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
              <p className="text-zinc-600">Meshy requests and job progress appear here.</p>
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
                          : 'text-zinc-500'
                  }
                >
                  <span className="opacity-40 mr-2">{formatTs(line.ts)}</span>
                  {line.text}
                </div>
              ))
            )}
          </div>
          <button
            type="button"
            onClick={onOpenTerminal}
            className="mx-3 mb-2 py-1.5 rounded-md border border-white/[0.08] text-[10px] font-semibold text-emerald-400/90 hover:bg-white/[0.03]"
          >
            Open full terminal
          </button>
        </div>
      )}
    </div>
  );
}
