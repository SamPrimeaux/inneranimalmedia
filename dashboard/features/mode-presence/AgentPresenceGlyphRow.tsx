/**
 * Minimal chat loading row — small animated mode-presence SVG + optional label.
 * Use instead of AgentPresenceInline in threads (no card, no oversized thinking glyph).
 */
import React from 'react';
import type { AgentMode } from '../../components/ChatAssistant/types';
import type { AgentPresenceState, ModePresenceIconKey } from './agentModePresenceMap';
import { AgentModePresenceIcon } from './AgentModePresenceIcon';

export type AgentPresenceGlyphRowProps = {
  mode?: AgentMode;
  state?: AgentPresenceState | string | null;
  iconKey?: ModePresenceIconKey;
  label?: string;
  /** Icon box size in px — default 16 (tool-trace scale). */
  size?: number;
  className?: string;
};

export function AgentPresenceGlyphRow({
  mode = 'agent',
  state,
  iconKey,
  label,
  size = 16,
  className = '',
}: AgentPresenceGlyphRowProps) {
  const aria = label?.trim() || 'Working';
  return (
    <div
      className={`iam-presence-glyph-row flex items-center gap-2 min-w-0 py-0.5 ${className}`.trim()}
      role="status"
      aria-live="polite"
    >
      <AgentModePresenceIcon
        mode={mode}
        state={state as AgentPresenceState | undefined}
        iconKey={iconKey}
        size={size}
        aria-label={aria}
        className="shrink-0"
      />
      {label ? (
        <span className="truncate text-[12px] leading-snug text-[var(--dashboard-muted)]">{label}</span>
      ) : null}
    </div>
  );
}
