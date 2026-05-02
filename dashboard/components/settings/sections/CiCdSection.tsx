import React from 'react';
import { Toggle } from '../settingsUi';

export function CiCdSection() {
  return (
    <div className="flex flex-col gap-4 max-w-xl">
      <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest">CI/CD</h2>
      <p className="text-[12px] text-[var(--text-muted)]">
        Pipeline run logs are stored in <code className="font-mono text-[var(--solar-cyan)]">cicd_pipeline_runs</code>.
        Configure build commands in repository settings.
      </p>
      {[
        { label: 'Auto-deploy on push to main', on: true },
        { label: 'Run tests before deploy', on: true },
        { label: 'Notify on failure', on: true },
        { label: 'Rollback on failed deploy', on: false },
      ].map((row) => (
        <div key={row.label} className="flex items-center justify-between py-3 border-b border-[var(--border-subtle)]/50">
          <div className="text-[12px] font-semibold text-[var(--text-main)]">{row.label}</div>
          <Toggle on={row.on} onChange={() => {}} />
        </div>
      ))}
    </div>
  );
}
