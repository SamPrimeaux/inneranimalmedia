import React from 'react';
import { ExternalLink, GitBranch } from 'lucide-react';
import type { GitRepo } from '../types';
import { StatusDot } from '../settingsUi';

export type GitHubSectionProps = { repos: GitRepo[] };

export function GitHubSection({ repos }: GitHubSectionProps) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest mb-2">
        GitHub Repositories
      </h2>
      {repos.length === 0 && (
        <p className="text-[12px] text-[var(--text-muted)]">Loading repos from DB...</p>
      )}
      {repos.map((r) => (
        <div
          key={r.id}
          className="flex items-center justify-between p-3 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-xl hover:border-[var(--solar-cyan)]/30 transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-muted)] shrink-0">
              <GitBranch size={13} />
            </div>
            <div className="min-w-0">
              <div className="text-[12px] font-semibold text-[var(--text-main)] truncate">
                {r.repo_full_name}
              </div>
              <div className="text-[10px] text-[var(--text-muted)] font-mono">
                branch: {r.default_branch}{' '}
                {r.cloudflare_worker_name ? `· worker: ${r.cloudflare_worker_name}` : ''}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusDot on={!!r.is_active} />
            <a
              href={r.repo_url}
              target="_blank"
              rel="noreferrer"
              className="p-1.5 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-[var(--solar-cyan)] transition-colors"
            >
              <ExternalLink size={12} />
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}
