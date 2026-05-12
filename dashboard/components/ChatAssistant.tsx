/**
 * Back-compat re-export — implementation lives in `dashboard/features/agent-chat/`.
 */
export { ChatAssistant, IAM_AGENT_CHAT_CONVERSATION_CHANGE } from '../features/agent-chat/ChatAssistant';
export {
  normalizeAssistantSseText,
  looksLikeRawProviderLeak,
  ssePayloadLooksReasoningOnly,
  isStreamErrorPayload,
  extractMonacoInvokesFromBuffer,
  hideIncompleteMonacoInvokeTail,
  looksLikeEmbeddedFileDumpStart,
  formatHttpErrorMessage,
} from '../features/agent-chat/streamParsing';
