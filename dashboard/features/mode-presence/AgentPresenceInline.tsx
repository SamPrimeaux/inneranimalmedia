import React from 'react';
import type { AgentMode, AgentPresenceState } from './agentModePresenceMap';
import { AgentModePresenceIcon } from './AgentModePresenceIcon';

export type AgentPresenceInlineProps = {
  mode?: AgentMode;
  state?: AgentPresenceState;
  title: string;
  meta?: string;
  expanded?: boolean;
  onToggle?: () => void;
  statusLabel?: string;
  size?: 'sm' | 'md';
};

export function AgentPresenceInline({
  mode,
  state,
  title,
  meta,
  expanded,
  onToggle,
  statusLabel,
  size = 'md',
}: AgentPresenceInlineProps) {
  const iconPx = size === 'sm' ? 18 : 22;
  const textSize = size === 'sm' ? 11 : 12;
  const metaSize = size === 'sm' ? 10 : 11;

  const inner = (
    <div className="flex items-center gap-2 min-w-0">
      <AgentModePresenceIcon mode={mode} state={state} size={iconPx} aria-label="" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="truncate"
            style={{ fontSize: textSize, fontWeight: 650, color: 'var(--text-main, #e6e6f0)' }}
          >
            {title}
          </span>
          {statusLabel ? (
            <span
              className="shrink-0"
              style={{
                fontSize: 9,
                fontWeight: 900,
                letterSpacing: '.12em',
                textTransform: 'uppercase',
                padding: '3px 7px',
                borderRadius: 999,
                border: '1px solid var(--border-subtle, rgba(255,255,255,0.12))',
                color: 'var(--text-muted, #8a8a9e)',
                background: 'color-mix(in srgb, var(--bg-app, #0b0b10) 88%, transparent)',
              }}
            >
              {statusLabel}
            </span>
          ) : null}
        </div>
        {meta ? (
          <div
            className="truncate"
            style={{
              marginTop: 1,
              fontSize: metaSize,
              color: 'var(--text-muted, #8a8a9e)',
              fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
            }}
          >
            {meta}
          </div>
        ) : null}
      </div>
      {typeof expanded === 'boolean' ? (
        <span
          className="shrink-0"
          aria-hidden
          style={{
            width: 10,
            height: 10,
            borderRight: '2px solid var(--text-muted, #8a8a9e)',
            borderBottom: '2px solid var(--text-muted, #8a8a9e)',
            transform: expanded ? 'rotate(-135deg)' : 'rotate(45deg)',
            opacity: 0.6,
            marginLeft: 2,
            transition: 'transform 140ms ease',
          }}
        />
      ) : null}
    </div>
  );

  if (!onToggle) return inner;
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full text-left"
      style={{
        background: 'transparent',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
      }}
    >
      {inner}
    </button>
  );
}

