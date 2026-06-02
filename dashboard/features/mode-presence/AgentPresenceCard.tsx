import React from 'react';
import type { AgentMode, AgentPresenceState } from './agentModePresenceMap';
import { AgentModePresenceIcon } from './AgentModePresenceIcon';

export type AgentPresenceCardProps = {
  mode?: AgentMode;
  state?: AgentPresenceState;
  title: string;
  description?: string;
  meta?: string;
  children?: React.ReactNode;
  compact?: boolean;
};

export function AgentPresenceCard({
  mode,
  state,
  title,
  description,
  meta,
  children,
  compact = false,
}: AgentPresenceCardProps) {
  return (
    <div
      className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)]"
      style={{ padding: compact ? 10 : 14 }}
    >
      <div className="flex items-start gap-3">
        <AgentModePresenceIcon mode={mode} state={state} size={compact ? 28 : 38} aria-label="" />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-[var(--text-main)] truncate">{title}</div>
          {description ? (
            <div className="mt-0.5 text-[11px] text-[var(--text-muted)] leading-snug">{description}</div>
          ) : null}
          {meta ? (
            <div className="mt-1 text-[10px] text-[var(--text-muted)] font-mono truncate">{meta}</div>
          ) : null}
        </div>
      </div>
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

