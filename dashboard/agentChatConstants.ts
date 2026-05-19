/** localStorage key for persisted Agent Sam thread id (keep in sync with App workspace scope). */
export const LS_AGENT_CHAT_CONVERSATION_ID = 'iam-agent-chat-conversation-id';

/** Window event: detail.id string selects thread; null clears (new chat). */
export const IAM_AGENT_CHAT_CONVERSATION_CHANGE = 'iam-agent-chat-conversation-change';

/** Window event: App created a new shell tab; ChatAssistant should send detail.message in that thread. */
export const IAM_AGENT_CHAT_NEW_THREAD = 'iam-agent-chat-new-thread';

export const CREATE_SKILL_SEED_MESSAGE =
  'I want to create a new Agent Sam skill. Please start with an intake interview (do not auto-run a multi-step plan yet): what should it do, when should it trigger, and is it a Cursor skill or a Worker/D1 skill?';
