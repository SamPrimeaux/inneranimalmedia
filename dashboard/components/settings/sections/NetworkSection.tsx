import React from 'react';
import type { SettingsPanelModel } from '../hooks/useSettingsData';

export type NetworkSectionProps = { data: SettingsPanelModel };

export function NetworkSection({ data }: NetworkSectionProps) {
  const worker = data.workerBaseUrl?.trim() || '';
  return (
    <div className="flex flex-col gap-4 max-w-xl">
      <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest">Network</h2>
      <p className="text-[11px] text-[var(--text-muted)]">
        Worker base URL is resolved from your bootstrap preferences, the WORKER_BASE_URL worker var, or the production
        site default. MCP endpoints are configured under Tools &amp; MCP.
      </p>
      <div className="flex flex-col gap-1 py-3 border-b border-[var(--border-subtle)]/50">
        <span className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider">Worker base URL</span>
        <code className="text-[12px] font-mono break-all text-[var(--solar-blue)]">
          {worker || 'Not configured'}
        </code>
      </div>
      <div className="flex flex-col gap-1 py-3 border-b border-[var(--border-subtle)]/50">
        <span className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider">MCP</span>
        <p className="text-[12px] text-[var(--text-main)]">
          Registered MCP servers and tools are listed in Tools &amp; MCP.
        </p>
      </div>
    </div>
  );
}
