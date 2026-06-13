import React, { useCallback } from 'react';
import { MessageSquare } from 'lucide-react';
import { AgentChatSessionList } from './shell/AgentChatSessionList';
import {
  IAM_AGENT_CHAT_CONVERSATION_CHANGE,
  LS_AGENT_CHAT_CONVERSATION_ID,
} from '../agentChatConstants';

/**
 * Agent Sam chat history + thread switcher (Cmd+K / unified search covers knowledge & docs).
 */
export const KnowledgeSearchPanel: React.FC<{
  onClose?: () => void;
  /** Highlights the row matching the open Agent Sam thread. */
  activeConversationId?: string;
}> = ({ onClose, activeConversationId }) => {
  const newChat = useCallback(() => {
    try {
      localStorage.removeItem(LS_AGENT_CHAT_CONVERSATION_ID);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent(IAM_AGENT_CHAT_CONVERSATION_CHANGE, { detail: { id: null } }));
  }, []);

  return (
    <div className="w-full h-full bg-[var(--bg-panel)] flex flex-col text-[var(--text-main)] overflow-hidden min-h-0">
      <div className="px-3 py-2 border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquare size={14} className="text-[var(--solar-cyan)] shrink-0" />
          <span className="text-[11px] font-bold tracking-widest uppercase truncate">Chats</span>
        </div>
        {onClose && (
          <button
            type="button"
            className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-main)] px-2 py-1 rounded border border-[var(--border-subtle)]"
            onClick={onClose}
          >
            Close
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 border-b border-[var(--border-subtle)] flex flex-col">
        <div className="flex items-center justify-between px-3 py-2 gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquare size={14} className="text-[var(--solar-cyan)] shrink-0" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] truncate">
              Agent Sam chats
            </span>
          </div>
          <button
            type="button"
            onClick={newChat}
            className="text-[0.6875rem] font-semibold uppercase tracking-wide text-[var(--solar-cyan)] hover:brightness-110 px-2 py-1 rounded-md hover:bg-[var(--bg-hover)] transition-colors shrink-0"
          >
            New chat
          </button>
        </div>
        <AgentChatSessionList variant="panel" activeConversationId={activeConversationId} expanded />
      </div>

      <style>{`
        .chat-hide-scroll::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
};
