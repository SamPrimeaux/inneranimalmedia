import {
  IAM_AGENT_CHAT_CONVERSATION_CHANGE,
  LS_AGENT_CHAT_CONVERSATION_ID,
} from '../agentChatConstants';

export type OpenAgentConversationDetail = {
  id: string;
  /** Re-fetch thread messages even when the tab already holds this conversation id. */
  force?: boolean;
  title?: string;
  /** When true (default), App opens the agent column if it was collapsed. */
  ensureAgentPanel?: boolean;
};

export const IAM_AGENT_ENSURE_PANEL = 'iam-agent-ensure-panel';

/** Write thread id to localStorage — synchronous, safe before navigation. */
export function persistAgentConversationId(id: string): void {
  const trimmed = id.trim();
  if (!trimmed) return;
  try {
    localStorage.setItem(LS_AGENT_CHAT_CONVERSATION_ID, trimmed);
  } catch {
    /* ignore */
  }
}

/**
 * Select an Agent Sam thread: persist id, ensure panel visible, notify App + ChatAssistant.
 * Does not change dashboard route — resume happens in the mounted agent column.
 */
export function openAgentConversation(detail: OpenAgentConversationDetail): void {
  const id = detail.id?.trim();
  if (!id) return;
  persistAgentConversationId(id);
  if (detail.ensureAgentPanel !== false) {
    window.dispatchEvent(new CustomEvent(IAM_AGENT_ENSURE_PANEL));
  }
  window.dispatchEvent(
    new CustomEvent(IAM_AGENT_CHAT_CONVERSATION_CHANGE, {
      detail: { id, force: detail.force !== false, title: detail.title?.trim() || undefined },
    }),
  );
}
