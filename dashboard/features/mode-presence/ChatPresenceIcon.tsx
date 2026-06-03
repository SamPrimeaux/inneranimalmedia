import React from 'react';
import type { AgentMode } from '../../components/ChatAssistant/types';
import { AgentModePresenceIcon } from './AgentModePresenceIcon';
import { normalizeChatPresenceState } from './normalizeChatPresenceState';

export type ChatPresenceIconProps = {
  mode?: AgentMode;
  state?: string | null;
  size?: number;
  className?: string;
  cardStatus?: 'thinking' | 'working' | 'blocked' | 'done' | 'error';
};

/** Unified chat presence glyph — mode colors + lab motion (Loading States + Mode Presence libraries). */
export function ChatPresenceIcon({
  mode = 'agent',
  state,
  size = 16,
  className = '',
  cardStatus,
}: ChatPresenceIconProps) {
  const normalized = normalizeChatPresenceState(state, mode, { cardStatus });

  return (
    <AgentModePresenceIcon
      mode={mode}
      state={normalized}
      size={size}
      className={className}
      aria-label=""
    />
  );
}
