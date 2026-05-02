import React from 'react';
import { Database } from 'lucide-react';

export function StorageSection() {
  return (
    <div className="flex flex-col gap-4 max-w-xl">
      <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest">Storage</h2>
      <p className="text-[12px] text-[var(--text-muted)] leading-relaxed">
        Object storage bindings are configured per workspace when you connect a provider during onboarding.
        Bucket names and prefixes are never preset here.
      </p>
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] p-5 flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] flex items-center justify-center shrink-0">
          <Database size={16} className="text-[var(--solar-blue)]" />
        </div>
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-[var(--text-main)]">Workspace storage</div>
          <div className="text-[11px] text-[var(--text-muted)] mt-1">
            Connect R2, Drive, GitHub, or local paths from the Workspace section after your workspace is provisioned.
          </div>
        </div>
      </div>
    </div>
  );
}
