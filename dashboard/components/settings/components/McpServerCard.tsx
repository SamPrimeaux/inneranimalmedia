import React from 'react';
import { relativeTime } from '../settingsUi';

export type McpServerCardProps = {
  name: string;
  endpoint: string;
  toolCount: number;
  healthStatus: string;
  lastCheckAt: string | number | null | undefined;
};

export function McpServerCard({
  name,
  endpoint,
  toolCount,
  healthStatus,
  lastCheckAt,
}: McpServerCardProps) {
  const status = String(healthStatus || '').toLowerCase();
  const dot =
    status === 'healthy'
      ? 'bg-[var(--color-success)]'
      : status === 'unhealthy'
        ? 'bg-[var(--color-danger)]'
        : 'bg-[var(--border-subtle)]';
  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`inline-block w-2 h-2 rounded-full ${dot}`} />
            <div className="text-[12px] font-semibold text-[var(--text-main)] truncate">{name}</div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-muted)] font-mono">
              {toolCount} tools
            </span>
          </div>
          <div className="text-[10px] text-[var(--text-muted)] font-mono truncate mt-1">{endpoint || '—'}</div>
        </div>
        <div className="text-[10px] text-[var(--text-muted)] whitespace-nowrap">
          Last check: {relativeTime(lastCheckAt)}
        </div>
      </div>
    </div>
  );
}
