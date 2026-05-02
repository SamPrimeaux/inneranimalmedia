import React from 'react';
import { Code2 } from 'lucide-react';
import { Toggle } from '../settingsUi';

export type McpToolRowProps = {
  toolName: string;
  description: string;
  enabled: boolean;
  isDegraded: boolean;
  failureRate: number | null;
  statsLine: string;
  toggleError: string | null;
  onToggle: (v: boolean) => void;
  onOpenSchema: () => void;
};

export function McpToolRow({
  toolName,
  description,
  enabled,
  isDegraded,
  failureRate,
  statsLine,
  toggleError,
  onToggle,
  onOpenSchema,
}: McpToolRowProps) {
  const dot = isDegraded
    ? 'bg-[var(--color-danger)]'
    : failureRate != null && Number.isFinite(failureRate) && failureRate > 0.1
      ? 'bg-[var(--color-warning)]'
      : 'bg-[var(--color-success)]';
  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`inline-block w-2 h-2 rounded-full ${dot}`} />
            <div className="text-[12px] font-semibold text-[var(--text-main)] truncate">{toolName}</div>
            {isDegraded ? (
              <span className="text-[9px] px-2 py-0.5 rounded bg-[var(--color-danger)]/10 text-[var(--color-danger)] border border-[var(--color-danger)]/30 font-black uppercase tracking-widest">
                Degraded
              </span>
            ) : null}
          </div>
          <div className="text-[10px] text-[var(--text-muted)] mt-1">{description || '—'}</div>
          <div className="text-[10px] text-[var(--text-muted)] mt-2">{statsLine}</div>
          {toggleError ? (
            <div className="text-[10px] text-[var(--color-danger)] mt-1">{toggleError}</div>
          ) : null}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div onClick={(e) => e.stopPropagation()} className="">
            <Toggle on={enabled} onChange={onToggle} />
          </div>
          <button
            type="button"
            onClick={onOpenSchema}
            className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-app)] border border-[var(--border-subtle)] hover:border-[var(--solar-cyan)]/50 rounded-lg text-[11px] text-[var(--text-main)] hover:text-[var(--solar-cyan)] transition-colors"
          >
            <Code2 size={12} /> Open Schema
          </button>
        </div>
      </div>
    </div>
  );
}
