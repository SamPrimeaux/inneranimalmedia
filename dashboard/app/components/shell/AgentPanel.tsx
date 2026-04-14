import React from 'react';
import { X, MessageSquare, Maximize2, Minimize2, MoreHorizontal } from 'lucide-react';
import { ChatAssistant } from '../ChatAssistant';

interface AgentPanelProps {
  productLabel: string;
  onClose: () => void;
  // Pass through props for ChatAssistant
  activeProject: any;
  ideWorkspace: any;
  activeFile: any;
  onSendMessage: (msg: string) => void;
  conversationId: string;
  onConversationChange: (id: string) => void;
}

export const AgentPanel: React.FC<AgentPanelProps> = ({
  productLabel,
  onClose,
  ...chatProps
}) => {
  return (
    <div className="flex-1 flex flex-col bg-[var(--bg-panel)] h-full overflow-hidden border-l border-[var(--border-subtle)] glass-panel relative">
      
      {/* ── Header ── */}
      <div className="h-10 border-b border-[var(--border-subtle)] flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare size={13} className="text-[var(--solar-cyan)]" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">
            {productLabel}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors rounded-md hover:bg-[var(--bg-hover)]">
            <MoreHorizontal size={14} />
          </button>
          <button onClick={onClose} className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors rounded-md hover:bg-[var(--bg-hover)]">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* ── Chat Assistant Mount ── */}
      <div className="flex-1 min-h-0 flex flex-col">
        <ChatAssistant {...chatProps} />
      </div>

    </div>
  );
};
