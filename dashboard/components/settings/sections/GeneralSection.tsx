import React from 'react';
import { ExternalLink } from 'lucide-react';
import { Toggle } from '../settingsUi';

export function GeneralSection() {
  return (
    <div className="flex flex-col gap-5 max-w-xl">
      <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest">General</h2>
      {[
        { label: 'Sync layouts across windows', desc: 'All windows share the same panel layout', on: true },
        { label: 'Show Status Bar', desc: 'Show context bar at the bottom of the editor', on: true },
        { label: 'Auto-hide editor when empty', desc: 'Expand chat when all editors are closed', on: false },
        { label: 'Auto-inject code to Monaco', desc: 'Agent code blocks auto-open in editor', on: true },
      ].map((row) => (
        <div
          key={row.label}
          className="flex items-center justify-between py-3 border-b border-[var(--border-subtle)]/50"
        >
          <div>
            <div className="text-[12px] font-semibold text-[var(--text-main)]">{row.label}</div>
            <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{row.desc}</div>
          </div>
          <Toggle on={row.on} onChange={() => {}} />
        </div>
      ))}
      <div className="flex items-start justify-between py-3 border-b border-[var(--border-subtle)]/50">
        <div>
          <div className="text-[12px] font-semibold text-[var(--text-main)]">Manage Account</div>
          <div className="text-[11px] text-[var(--text-muted)] mt-0.5">Billing, seats, and usage limits</div>
        </div>
        <button
          type="button"
          className="flex items-center gap-1 px-2.5 py-1.5 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-lg text-[11px] hover:border-[var(--solar-cyan)]/50 transition-colors"
        >
          Open <ExternalLink size={10} />
        </button>
      </div>
    </div>
  );
}
